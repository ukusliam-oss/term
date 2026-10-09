// Timetable, styled as an apple.com compare table: day columns, hairline rows, subject in semibold
// with its room beneath. Phones get a day view with a tab nav and a swipeable pager. Edit mode
// rewrites the A/B template.

import { h, icon, clamp, isPhone, store as local, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { pageFrame } from './frame.js';
import { tabs } from '../ui/tabs.js';
import { segment } from '../ui/segment.js';
import { motion, springValue } from '../motion/animate.js';
import { springs } from '../motion/spring.js';
import { drag, rubberband, project } from '../motion/gesture.js';
import { dot, more, emptyState, btn } from '../ui/kit.js';

export function createTimetable(app) {
  const st = {
    monday: defaultMonday(),
    mode: local('term.tt.mode') || (isPhone() ? 'day' : 'week'),
    day: defaultDay(),
    edit: false,
  };
  const f = pageFrame({ id: 'timetable', title: 'Timetable', sub: 'Your A/B fortnight, lesson by lesson.' });
  const modeSeg = segment({ label: 'Layout', value: st.mode, options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }], onChange: (v) => setMode(v) });
  const editBtn = btn('Edit', () => setEdit(!st.edit), { variant: 'secondary-neutral' });
  f.setControls(modeSeg, btn('Today', () => goToday(), { variant: 'neutral' }), editBtn);

  const eyebrow = h('p.tt-eyebrow');
  const title = h('h2.tt-title');
  const prev = h('button.paddle', { type: 'button', 'aria-label': 'Previous week', onclick: () => shiftWeek(-1) }, icon('left', 16));
  const next = h('button.paddle', { type: 'button', 'aria-label': 'Next week', onclick: () => shiftWeek(1) }, icon('chev', 16));
  const banner = h('p.tt-banner');
  const content = h('div.tt-content');
  f.body.append(h('div.tt-section', null,
    h('div.wrap', null,
      h('header.tt-head', null, h('div', null, eyebrow, title), h('div.tt-paddles', null, prev, next)),
      banner),
    content));

  function links() {
    modeSeg.set(st.mode);
    editBtn.querySelector('span').textContent = st.edit ? 'Done' : 'Edit';
    editBtn.classList.toggle('button-secondary-neutral', !st.edit);
  }
  function setMode(m) { st.mode = m; local('term.tt.mode', m); render(0); }
  function setEdit(on) { st.edit = on; render(0); }

  function defaultMonday() {
    const t = M.today();
    return M.isWeekday(t) ? M.startOfWeek(t) : M.addDays(M.startOfWeek(t), 7);
  }
  function defaultDay() {
    const t = M.today();
    return M.isWeekday(t) ? t.getDay() : 1;
  }
  function goToday() {
    const m = defaultMonday();
    const dir = Math.sign(M.daysBetween(st.monday, m));
    st.monday = m;
    st.day = defaultDay();
    render(dir);
  }
  function shiftWeek(n, day) {
    st.monday = M.addDays(st.monday, 7 * n);
    if (day) st.day = day;
    render(n);
  }

  // ---------- render ----------

  function render(dir = 0) {
    links();
    const fri = M.addDays(st.monday, 4);
    const L = M.weekLetter(st.monday);
    const isThis = M.ymd(st.monday) === M.ymd(M.startOfWeek(M.today()));
    const holidayWeek = [0, 1, 2, 3, 4].every((i) => M.holidayOn(M.ymd(M.addDays(st.monday, i))));
    eyebrow.textContent = holidayWeek ? 'Holiday' : `Week ${L}${isThis ? ' · This week' : ''}`;
    title.textContent = `${M.fmtRange(st.monday, fri)}.`;
    banner.hidden = !st.edit;
    fill(banner, 
      h('span', { text: `You’re editing the Week ${L} template. Choose a period to change its subject; the change repeats every Week ${L}.` }),
      ' ', more('Done', () => setEdit(false)));

    if (!S.timetable) {
      fill(content, h('div.wrap', null, emptyState({
        title: S.ready ? 'No timetable yet.' : 'Loading…',
        text: S.ready ? 'Restore a backup in Settings, or start from a blank A/B timetable.' : null,
        action: S.ready ? { label: 'Start a blank timetable', button: true, onClick: () => db.saveTimetable(blankTimetable()) } : null,
      })));
      return;
    }
    fill(content, st.mode === 'week' ? buildWeek() : buildDay());
    if (dir) motion(content).set({ x: dir * 40, opacity: 0 }).to({ x: 0, opacity: 1 }, springs.snappy);
  }

  // ---------- week (compare table) ----------

  function rowsTemplate() {
    const ps = M.periods();
    const rows = [];
    ps.forEach((p, i) => {
      rows.push({ kind: 'period', p });
      const nx = ps[i + 1];
      if (nx && M.toMin(nx.start) - M.toMin(p.end) >= 10) rows.push({ kind: 'break', start: p.end, end: nx.start, label: M.breakLabel(M.toMin(p.end), M.toMin(nx.start)) });
    });
    return rows;
  }

  function buildWeek() {
    const days = [0, 1, 2, 3, 4].map((i) => M.addDays(st.monday, i));
    const tds = M.ymd(M.today());
    const m = M.minutesOf(new Date());
    const grid = h('div.tt-grid', { role: 'table', 'aria-label': `Timetable for ${M.fmtRange(days[0], days[4])}` });
    grid.append(h('div.tt-corner', { role: 'columnheader' }));
    for (const d of days) {
      const ds = M.ymd(d);
      grid.append(h(`button.tt-dayhead${ds === tds ? '.is-today' : ''}`, { type: 'button', role: 'columnheader', onclick: (e) => app.openDay(d, e.currentTarget) },
        ds === tds ? h('span.tag', { text: 'Today' }) : h('span.tag.tt-tag-blank', { text: ' ' }),
        h('span.tt-dayname', { text: M.DAY_LONG[d.getDay()] }),
        h('span.tt-daydate', { text: `${d.getDate()} ${M.MON_SHORT[d.getMonth()]}` })));
    }
    const lessons = days.map((d) => (st.edit ? templateLessons(d) : M.lessonsOn(d)));
    const rows = rowsTemplate();
    const firstPeriod = rows.find((r) => r.kind === 'period');
    for (const r of rows) {
      if (r.kind === 'break') {
        grid.append(h('div.tt-break', { role: 'row' }, h('span', { text: `${r.label} · ${r.start} – ${r.end}` })));
        continue;
      }
      const reg = r.p.kind === 'reg';
      grid.append(h(`div.tt-time${reg ? '.is-reg' : ''}`, { role: 'rowheader' }, h('span.tt-time-start', { text: r.p.start }), h('span.tt-time-label', { text: reg ? 'Tutor' : r.p.label })));
      days.forEach((d, i) => {
        const ds = M.ymd(d);
        const hol = !st.edit && M.holidayOn(ds);
        if (hol) { grid.append(h(`div.tt-cell.is-holiday${reg ? '.is-reg' : ''}`, { role: 'cell' }, r === firstPeriod ? h('span', { text: hol.title }) : null)); return; }
        const l = lessons[i].find((x) => x.period.id === r.p.id);
        grid.append(cell(l, ds === tds ? m : null, reg));
      });
    }
    return h('div.tt-scroll', null, h('div.tt-inner', null, grid));
  }

  function templateLessons(d) {
    const L = M.weekLetter(d);
    return M.periods().map((p) => {
      const sid = S.timetable.cells?.[M.cellKey(L, d.getDay(), p.id)] || null;
      const s = M.subject(sid);
      return { key: M.cellKey(L, d.getDay(), p.id), date: M.ymd(d), letter: L, dow: d.getDay(), period: p, subjectId: sid, subject: s, start: M.toMin(p.start), end: M.toMin(p.end), room: s?.room || '' };
    });
  }

  function cell(l, minutes, reg) {
    if (st.edit) {
      return h(`button.tt-cell.is-edit${reg ? '.is-reg' : ''}`, { type: 'button', role: 'cell', onclick: (e) => editCell(l, e.currentTarget), 'aria-label': `${M.DAY_LONG[l.dow]} ${l.period.label}: ${l.subject?.name || 'Free'}. Change` },
        l.subject ? cellText(l, reg) : h('span.tt-free', { text: 'Free' }));
    }
    if (!l?.subject) return h(`div.tt-cell.is-empty${reg ? '.is-reg' : ''}`, { role: 'cell' }, h('span.tt-free', { text: '—' }));
    const past = minutes != null && minutes >= l.end;
    const cur = minutes != null && minutes >= l.start && minutes < l.end;
    const due = M.dueForLesson(l).filter((i) => !M.isDone(i));
    return h(`button.tt-cell${reg ? '.is-reg' : ''}${past ? '.is-past' : ''}${cur ? '.is-now' : ''}${l.cancelled ? '.is-cancelled' : ''}`, {
      type: 'button', role: 'cell', onclick: (e) => app.openLesson(l, e.currentTarget),
      'aria-label': `${l.subject.name}, ${M.DAY_LONG[l.dow]} ${l.period.label}${l.room ? `, ${l.room}` : ''}${cur ? ', now' : ''}`,
    },
    cur ? h('span.tag', { text: 'Now' }) : due.length ? h('span.tag', { text: `${due[0].type || 'Due'}` }) : null,
    cellText(l, reg));
  }

  function cellText(l, reg) {
    return h('span.tt-text', null,
      h('span.tt-subject', null, dot(l.subject.color, 'dot-sm'), h('span.tt-name', null, h('span.tt-long', { text: l.subject.name }), h('span.tt-short', { text: l.subject.short || l.subject.name }))),
      reg ? null : h(`span.tt-room${l.roomChanged ? '.is-moved' : ''}`, { text: l.cancelled ? 'Cancelled' : `${l.room}${l.roomChanged ? ' (moved)' : ''}` }),
      l.note ? h('span.tt-note', { text: l.note }) : null);
  }

  async function editCell(l, origin) {
    const sid = await app.pickSubject(l.subjectId, origin, `${M.DAY_LONG[l.dow]} · ${l.period.label} · Week ${l.letter}`);
    if (sid === undefined) return;
    const tt = structuredClone(S.timetable);
    tt.cells ||= {};
    const k = M.cellKey(l.letter, l.dow, l.period.id);
    if (sid) tt.cells[k] = sid;
    else delete tt.cells[k];
    db.saveTimetable(tt);
  }

  // ---------- day (tab nav + pager) ----------

  function buildDay() {
    const days = [0, 1, 2, 3, 4].map((i) => M.addDays(st.monday, i));
    const tds = M.ymd(M.today());
    const nav = tabs({
      label: 'Day', value: st.day,
      options: days.map((d) => ({ value: d.getDay(), label: M.DAY_SHORT[d.getDay()], sub: String(d.getDate()), cls: M.ymd(d) === tds ? 'is-today' : '' })),
      onChange: (v) => goDay(v),
    });
    const pages = days.map((d) => h('div.day-page', null, dayList(d)));
    const track = h('div.day-track', null, ...pages);
    const pager = h('div.day-pager', null, track);
    const x = springValue(0, (v) => { track.style.transform = `translate3d(${v.toFixed(2)}px,0,0)`; });
    const W = () => pager.clientWidth || 1;
    const sync = (animate, velocity) => {
      const i = st.day - 1;
      animate ? x.to(-i * W(), springs.snappy, velocity) : x.set(-i * W());
      pager.style.height = `${pages[i].offsetHeight}px`;
    };
    function goDay(n, velocity) {
      st.day = clamp(n, 1, 5);
      nav.set(st.day);
      sync(true, velocity);
    }
    let base = 0;
    drag(pager, {
      axis: 'x',
      onStart() { base = x.current(); },
      onMove({ dx }) {
        const min = -4 * W();
        let v = base + dx;
        if (v > 0) v = rubberband(v, W());
        else if (v < min) v = min + rubberband(v - min, W());
        x.set(v);
      },
      onEnd({ dx, vx }) {
        const min = -4 * W();
        if (x.value > W() * 0.16 && dx > 0) return shiftWeek(-1, 5);
        if (x.value < min - W() * 0.16 && dx < 0) return shiftWeek(1, 1);
        const i = clamp(Math.round(-(x.value + project(vx) * 0.35) / W()), 0, 4);
        const cur = st.day - 1;
        goDay(clamp(i, cur - 1, cur + 1) + 1, vx);
      },
    });
    new ResizeObserver(() => sync(false)).observe(pager);
    pages.forEach((p, i) => new ResizeObserver(() => { if (st.day - 1 === i) pager.style.height = `${p.offsetHeight}px`; }).observe(p));
    requestAnimationFrame(() => sync(false));
    return h('div.day-view', null, h('div.wrap', null, nav), h('div.wrap', null, pager));
  }

  function dayList(d) {
    const ds = M.ymd(d);
    const hol = M.holidayOn(ds);
    if (hol && !st.edit) return emptyState({ title: `${hol.title}.`, text: 'No lessons — enjoy the break.' });
    const items = st.edit ? templateLessons(d).map((l) => ({ kind: 'lesson', ...l })) : M.timeline(d);
    const isToday = ds === M.ymd(M.today());
    const m = M.minutesOf(new Date());
    return h('div.day-list', null, ...items.map((e) => {
      if (e.kind === 'break') return h('div.day-break', { text: `${e.label} · ${M.fromMin(e.start)} – ${M.fromMin(e.end)}` });
      const reg = e.period.kind === 'reg';
      const time = h('span.day-time', null, h('span', { text: e.period.start }), h('span.day-time-end', { text: e.period.end }));
      if (st.edit) {
        return h('button.day-row.is-edit', { type: 'button', onclick: (ev) => editCell(e, ev.currentTarget) }, time,
          h('span.day-main', null, h('span.day-subject', null, e.subject ? dot(e.subject.color, 'dot-sm') : null, e.subject?.name || 'Free'), h('span.day-meta', { text: e.period.label })),
          h('span.more', null, 'Change', icon('chev', 12)));
      }
      if (!e.subjectId) return h('div.day-row.is-empty', null, time, h('span.day-main', null, h('span.day-subject.t-3', { text: 'Free' })));
      const cur = isToday && m >= e.start && m < e.end;
      const past = isToday && m >= e.end;
      const due = M.dueForLesson(e).filter((i) => !M.isDone(i));
      return h(`button.day-row${cur ? '.is-now' : ''}${past ? '.is-past' : ''}${e.cancelled ? '.is-cancelled' : ''}${reg ? '.is-reg' : ''}`, {
        type: 'button', onclick: (ev) => app.openLesson(e, ev.currentTarget),
      }, time,
      h('span.day-main', null,
        cur ? h('span.tag', { text: 'Now' }) : due.length ? h('span.tag', { text: due[0].type || 'Due' }) : null,
        h('span.day-subject', null, dot(e.subject.color, 'dot-sm'), e.subject.name),
        h('span.day-meta', { text: [e.period.label, e.cancelled ? 'Cancelled' : e.room, e.roomChanged ? 'moved' : '', e.subject.teacher].filter(Boolean).join(' · ') }),
        e.note ? h('span.day-note', { text: e.note }) : null),
      icon('chev', 13, 'chev'));
    }));
  }

  function blankTimetable() {
    const periods = [
      { id: 'tt', label: 'Tutor Time', short: 'T', start: '08:05', end: '08:20', kind: 'reg' },
      ...[['08:25', '09:20'], ['09:25', '10:20'], ['10:40', '11:35'], ['11:40', '12:35'], ['13:20', '14:15'], ['14:20', '15:15']]
        .map(([s, e], i) => ({ id: `p${i + 1}`, label: `Lesson ${i + 1}`, short: String(i + 1), start: s, end: e, kind: 'lesson' })),
    ];
    return { periods, breaks: [], subjects: [], cells: {} };
  }

  return {
    id: 'timetable', el: f.el, art: f.art,
    update: () => render(0),
    // The round button adds homework for the lesson that's on, or the next one.
    orb: () => (S.timetable ? { label: 'Add', aria: 'Add homework', onClick: () => {
      const st0 = M.status(new Date());
      const l = st0.current || st0.next;
      const due = l ? M.nextLesson(new Date(), l.subjectId) : null;
      app.openItem(null, { kind: 'homework', subjectId: l?.subjectId || null, due: due?.date, at: due ? M.fromMin(due.start) : null });
    } } : null),
    minute: () => render(0),
    setOptions(o) {
      if (o.edit) setEdit(true);
      if (o.monday) { st.monday = M.startOfWeek(o.monday); st.day = M.ymd(st.monday) === M.ymd(M.startOfWeek(M.today())) ? defaultDay() : 1; }
    },
    onKey(e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        if (st.mode === 'week') shiftWeek(d);
        else if (st.day + d > 5) shiftWeek(1, 1);
        else if (st.day + d < 1) shiftWeek(-1, 5);
        else { st.day += d; render(0); }
      } else if (e.key === 't') goToday();
      else if (e.key === 'e') setEdit(!st.edit);
    },
  };
}
