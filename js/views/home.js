// Today, laid out as CleanMyMac's Smart Care: the Smart Care render with a greeting and where the
// day stands under it, then a results row — one tile per module with its icon, the number that
// matters and a button — and under that the day itself: lessons, what's due, what to pack, the
// next assessment and everything coming up. The round button starts a focus session.

import { h, fill, icon, store as local } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { btn, more, dot, card, shelf, progress, check } from '../ui/kit.js';
import { pageFrame } from './frame.js';
import { iconOf } from '../stage.js';
import { springValue, motionReduced } from '../motion/animate.js';
import { springs } from '../motion/spring.js';

const GLYPH = { timetable: 'timetable', planner: 'planner', school: 'school', focus: 'timer' };

export function createHome(app) {
  const f = pageFrame({ id: 'home', title: '' });
  f.el.classList.add('view-today');
  const notice = h('div.wrap.home-notice');
  const results = h('div.wrap.results');
  const lessons = h('article.panel.panel-lessons');
  const due = h('article.panel.panel-due');
  const nextA = h('article.panel.panel-next');
  const pack = h('article.panel.panel-pack');
  const grid = h('div.wrap.today-grid', null, lessons, due, h('div.today-side', null, nextA, pack));
  const shelfBox = h('div.home-shelf');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => app.importFile(fileInput));
  f.body.append(notice, results, grid, shelfBox, fileInput);

  let live = null;
  let liveKey = '';

  function update() {
    const now = new Date();
    renderHero(now);
    renderNotice();
    renderResults(now);
    renderDay(now);
    renderShelf();
  }

  // ---------- hero ----------

  /** The week the headline is about: today's, or the next school day's once today is done. */
  function heroDay(now) {
    return M.isSchoolDay(now) && M.status(now).state !== 'after' ? M.today() : M.nextSchoolDay(now) || M.today();
  }

  function renderHero(now) {
    const st = M.status(now);
    liveKey = `${st.state}:${st.current?.key || st.next?.key || ''}`;
    live = null;
    const name = (S.settings.name || '').split(' ')[0];
    if (st.state === 'empty') {
      f.setTitle(S.ready ? 'Welcome to Term!' : ' ');
      f.setSub(S.ready ? 'Your timetable, homework and tests in one place. Bring in your timetable to begin.' : 'Loading your planner…');
      f.setControls(S.ready ? btn('Import timetable file', () => fileInput.click(), { size: 'elevated', variant: 'neutral' }) : null,
        S.ready ? btn('Start from scratch', () => app.go('timetable', { edit: true }), { size: 'elevated' }) : null);
      return;
    }
    f.setTitle(`${M.greeting(now)}${name ? `, ${name}` : ''}!`);
    f.setControls();
    const wk = ` Week ${M.weekLetter(heroDay(now))}.`;
    if (st.state === 'lesson') {
      const c = st.current;
      const say = () => {
        const left = Math.ceil(M.status(new Date()).remain ?? 0);
        f.setSub(`${c.subject.name} now${c.room ? `, in ${c.room}` : ''} until ${c.period.end} — ${left} minute${left === 1 ? '' : 's'} left.${wk}`);
      };
      say();
      live = say;
      return;
    }
    const n = st.next;
    if (!n) { f.setSub('Nothing on the timetable ahead.'); return; }
    const sameDay = n.date === M.ymd(now);
    const lead = st.state === 'break' ? `${st.label}. ` : st.state === 'holiday' ? `${st.holiday.title}. ` : '';
    f.setSub(sameDay
      ? `${lead}${n.subject.name} is next, at ${M.fromMin(n.start)}${n.room ? ` in ${n.room}` : ''}.${wk}`
      : `${lead}First ${M.relDay(n.date, { long: true })}: ${n.subject.name} at ${M.fromMin(n.start)}${n.room ? ` in ${n.room}` : ''}.${wk}`);
  }

  function renderNotice() {
    const show = S.auth.configured && S.mode === 'local' && S.ready;
    notice.hidden = !show;
    if (show) fill(notice, h('p.notice-bar', null, icon('cloud', 16), h('span', { text: 'You’re not signed in, so this planner lives on this device only. ' }), more('Sign in to sync', () => app.go('settings', { section: 'account' }))));
  }

  // ---------- results row (Smart Care's tiles) ----------

  // Numbers count up to their value when they change, as CleanMyMac's results do.
  const shown = new Map();
  function countUp(el, page, value) {
    const m = /^(\d+)(.*)$/.exec(value);
    const prev = shown.get(page);
    shown.set(page, value);
    if (!m || prev === value || motionReduced()) { el.textContent = value; return; }
    const from = Number(/^(\d+)/.exec(prev || '')?.[1] || 0);
    const to = Number(m[1]);
    el.textContent = `${from}${m[2]}`;
    const sv = springValue(from, (x) => { el.textContent = `${Math.round(x)}${m[2]}`; });
    requestAnimationFrame(() => sv.to(to, springs.gentle));
  }

  function tile(page, label, value, sub, action, onAction) {
    const src = iconOf(page, 'tile');
    const valueEl = h('p.rtile-value');
    countUp(valueEl, page, value);
    return h('article.rtile', null,
      h('div.rtile-art', null, src ? h('img', { src, alt: '' }) : icon(GLYPH[page], 40, 'rtile-glyph')),
      h('p.rtile-label', { text: label }),
      valueEl,
      h('p.rtile-sub', { text: sub }),
      btn(action, onAction, { size: 'reduced', cls: 'rtile-btn' }));
  }

  function renderResults(now) {
    if (!S.timetable) { fill(results); results.hidden = true; return; }
    results.hidden = false;
    const st = M.status(now);
    const l = st.current || st.next;
    const lessonsToday = M.isSchoolDay(now) ? M.lessonsOn(now).filter((x) => x.subjectId && !x.cancelled).length : 0;
    const lessonTile = l
      ? tile('timetable', st.current ? 'Now' : 'Next', l.subject.short || l.subject.name,
        `${l.date === M.ymd(now) ? '' : `${M.relDay(l.date)} · `}${M.fromMin(l.start)}${l.room ? ` · ${l.room}` : ''}`,
        'Timetable', () => app.go('timetable'))
      : tile('timetable', 'Timetable', `${lessonsToday} lessons`, 'today', 'Timetable', () => app.go('timetable'));

    const horizon = M.ymd(M.addDays(M.today(), 7));
    const open = M.allItems().filter((i) => !M.isDone(i) && i.kind !== 'assessment' && i.due && i.due <= horizon).sort(M.sortByDue);
    const late = open.filter((i) => M.dueIn(i) < 0).length;
    const soon = open.filter((i) => M.dueIn(i) >= 0 && M.dueIn(i) <= 1).length;
    const dueTile = tile('planner', 'Due this week', open.length ? `${open.length} to do` : 'All clear',
      open.length ? [late ? `${late} late` : '', soon ? `${soon} by tomorrow` : '', !late && !soon ? `next ${M.relDay(open[0].due)}` : ''].filter(Boolean).join(' · ') : 'Nothing due in the next week',
      open.length ? 'Review' : 'Add', () => (open.length ? app.go('planner') : app.openQuickAdd()));

    const a = M.allItems().filter((i) => i.kind === 'assessment' && !M.isDone(i) && i.due && M.dueIn(i) >= 0).sort(M.sortByDue)[0];
    const n = a ? M.dueIn(a) : 0;
    const testTile = a
      ? tile('school', a.type || 'Assessment', n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days`, `${M.subject(a.subjectId)?.short || ''} ${a.title}`.trim(), 'Prepare', () => app.openItem(a))
      : tile('school', 'Assessments', 'None soon', 'Nothing scheduled', 'Add', () => app.openItem(null, { kind: 'assessment' }));

    const mins = S.focus.get(M.ymd(now))?.total || 0;
    const focusTile = tile('focus', 'Focus', `${mins} min`, app.focus.running ? `Running · ${app.focus.fmt(app.focus.remaining())} left` : 'focused today', app.focus.running ? 'Open' : 'Start', () => {
      if (!app.focus.running) app.focus.start();
      app.go('focus');
    });
    fill(results, lessonTile, dueTile, testTile, focusTile);
  }

  // ---------- the day ----------

  function renderDay(now) {
    if (!S.timetable) { fill(lessons); fill(due); fill(nextA); fill(pack); grid.hidden = true; return; }
    grid.hidden = false;
    const st = M.status(now);
    const day = M.isSchoolDay(now) && st.state !== 'after' ? M.startOfDay(now) : M.nextSchoolDay(now);
    const isToday = day && M.ymd(day) === M.ymd(now);

    // lessons
    const m = M.minutesOf(now);
    const ls = day ? M.lessonsOn(day).filter((l) => l.subjectId) : [];
    fill(lessons,
      h('div.panel-head', null, h('h3.panel-title', { text: isToday ? 'Today’s lessons' : day ? `${M.DAY_LONG[day.getDay()]}’s lessons` : 'Lessons' }), more('Timetable', () => app.go('timetable'))),
      ls.length ? h('ul.rows', null, ...ls.map((l) => {
        const cur = isToday && m >= l.start && m < l.end;
        const past = isToday && m >= l.end;
        const dueHere = M.dueForLesson(l).filter((i) => !M.isDone(i));
        return h('li', null, h(`button.row${cur ? '.is-now' : ''}${past ? '.is-past' : ''}${l.cancelled ? '.is-cancelled' : ''}${l.period.kind === 'reg' ? '.is-minor' : ''}`, {
          type: 'button', onclick: (e) => app.openLesson(l, e.currentTarget),
        },
        h('span.row-time', { text: l.period.start }),
        h('span.row-main', null,
          h('span.row-title', null, dot(l.subject.color, 'dot-sm'), h('span', { text: l.subject.name })),
          h('span.row-sub', { text: [l.cancelled ? 'Cancelled' : l.room, dueHere.length ? `${dueHere[0].type || 'Homework'} due` : '', l.note ? 'Note' : ''].filter(Boolean).join(' · ') })),
        cur ? h('span.row-now', { text: 'Now' }) : null));
      })) : h('p.panel-empty', { text: 'No lessons.' }));

    // due soon
    const d1 = M.nextSchoolDay(M.today());
    const d2 = d1 ? M.nextSchoolDay(d1) : null;
    const horizon = M.ymd(d2 || M.addDays(M.today(), 2));
    const items = M.allItems().filter((i) => i.kind !== 'assessment' && i.due && i.due <= horizon && (!M.isDone(i) || (i.doneAt && Date.now() - i.doneAt < 4000))).sort(M.sortByDue);
    fill(due,
      h('div.panel-head', null, h('h3.panel-title', { text: 'Due soon' }), more('Add', () => app.openQuickAdd())),
      items.length ? h('ul.rows', null, ...items.map((it) => {
        const s = M.subject(it.subjectId);
        const n = M.dueIn(it);
        return h('li', null, h(`div.row.row-task${M.isDone(it) ? '.is-done' : ''}`, null,
          check({ checked: M.isDone(it), label: `Mark ${it.title} done`, onChange: (v) => {
            db.saveDoc('items', { ...it, status: v ? 'done' : 'todo', doneAt: v ? Date.now() : null });
            if (v) setTimeout(() => app.refresh('home'), 4100);
          } }),
          h('button.row-main', { type: 'button', onclick: (e) => app.openItem(it, null, e.currentTarget) },
            h('span.row-title', null, h('span', { text: it.title })),
            h('span.row-sub', { text: [s?.short || s?.name, M.dueText(it)].filter(Boolean).join(' · ') })),
          !M.isDone(it) ? h(`span.row-when${n < 0 ? '.is-late' : n <= 1 ? '.is-soon' : ''}`, { text: n < 0 ? 'Late' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : M.DAY_SHORT[M.parseYMD(it.due).getDay()] }) : null));
      })) : h('p.panel-empty', null, `Nothing due by ${M.relDay(horizon, { long: true })}. `, more('Add something', () => app.openQuickAdd())));

    // next assessment
    const a = M.allItems().filter((i) => i.kind === 'assessment' && !M.isDone(i) && i.due && M.dueIn(i) >= 0).sort(M.sortByDue)[0];
    if (a) {
      const s = M.subject(a.subjectId);
      const n = M.dueIn(a);
      const tp = M.topicProgress(a);
      fill(nextA,
        h('div.panel-head', null, h('h3.panel-title', { text: `Next ${(a.type || 'assessment').toLowerCase()}` }), more('All', () => app.go('planner', { kind: 'assessment' }))),
        h('button.next-body', { type: 'button', onclick: (e) => app.openItem(a, null, e.currentTarget) },
          h('span.next-count', null, h('span.next-num', { text: String(n) }), h('span.next-unit', { text: n === 0 ? 'today' : n === 1 ? 'day' : 'days' })),
          h('span.next-text', null,
            h('span.next-title', { text: a.title }),
            h('span.row-sub', null, s ? dot(s.color, 'dot-sm') : null, ` ${[s?.name, `${M.relDay(a.due)}${a.at ? ` ${a.at}` : ''}`].filter(Boolean).join(' · ')}`))),
        tp != null ? h('div.next-progress', null, progress(tp), h('span.row-sub', { text: `${a.topics.filter((t) => t.done).length} of ${a.topics.length} topics ready` })) : null);
    } else {
      fill(nextA, h('div.panel-head', null, h('h3.panel-title', { text: 'Assessments' })), h('p.panel-empty', null, 'None coming up. ', more('Add one', (e) => app.openItem(null, { kind: 'assessment' }, e.currentTarget))));
    }

    // pack
    const target = M.isSchoolDay(now) && st.state === 'before' ? M.startOfDay(now) : M.nextSchoolDay(now);
    if (target) {
      const ds = M.ymd(target);
      const tl = M.lessonsOn(target).filter((l) => l.subjectId && !l.cancelled);
      const kit = new Map();
      for (const l of tl) for (const k of l.subject?.kit || []) if (!kit.has(k)) kit.set(k, l.subject);
      const handIn = M.allItems().filter((i) => i.due === ds && !M.isDone(i) && i.kind !== 'assessment');
      const key = `term.pack.${ds}`;
      const ticked = new Set(local(key) || []);
      const entries = [...[...kit].map(([k, s]) => ({ id: `kit:${k}`, label: k, sub: s.short || s.name })), ...handIn.map((i) => ({ id: `hand:${i.id}`, label: i.title, sub: `Hand in · ${M.subject(i.subjectId)?.short || ''}` }))];
      const when = ds === M.ymd(now) ? 'today' : M.daysBetween(now, target) === 1 ? 'tomorrow' : M.DAY_LONG[target.getDay()];
      fill(pack,
        h('div.panel-head', null, h('h3.panel-title', { text: `Pack for ${when}` })),
        entries.length ? h('ul.rows', null, ...entries.map((e) => h('li', null, h('div.row.row-task', null,
          check({ checked: ticked.has(e.id), label: `Packed ${e.label}`, onChange: (v) => { v ? ticked.add(e.id) : ticked.delete(e.id); local(key, [...ticked]); } }),
          h('span.row-main', null, h('span.row-title', null, h('span', { text: e.label })), h('span.row-sub', { text: e.sub }))))))
          : h('p.panel-empty', { text: 'Nothing extra to bring. Add kit to a subject in School and it shows up here.' }));
    } else fill(pack);
  }

  // ---------- coming up ----------

  function renderShelf() {
    const end = M.ymd(M.addDays(M.today(), 14));
    const items = M.allItems().filter((i) => !M.isDone(i) && i.due && i.due <= end).sort(M.sortByDue);
    if (!items.length) { fill(shelfBox); return; }
    fill(shelfBox, shelf({ strong: 'Coming up.', soft: 'Everything due in the next two weeks.', after: more('Planner', () => app.go('planner')), cards: items.map((it) => itemCard(app, it)) }));
  }

  return {
    id: 'home', el: f.el, art: f.art, update,
    tick(now) {
      const st = M.status(now);
      if (`${st.state}:${st.current?.key || st.next?.key || ''}` !== liveKey) update();
      else live?.(now);
    },
    minute: update,
    // Smart Care's Scan: one press, and the work starts.
    orb: () => (S.timetable ? { label: 'Focus', aria: 'Start a focus session', onClick: () => { if (!app.focus.running) app.focus.start(); app.go('focus'); } } : null),
  };
}

/** A planner item as a card. Shared with the Planner. */
export function itemCard(app, it) {
  const s = M.subject(it.subjectId);
  const n = M.dueIn(it);
  const kind = M.KINDS.find((k) => k.value === it.kind)?.label;
  return card({
    flip: it.id,
    cls: `${M.isDone(it) ? 'is-done' : ''} u-${M.urgency(it)}`.trim(),
    eyebrow: it.example ? `${it.type || kind} · Example` : it.type || kind,
    title: it.title,
    desc: [s?.name, it.topics?.length ? `${it.topics.filter((x) => x.done).length} of ${it.topics.length} topics ready` : null].filter(Boolean).join(' · '),
    foot: [
      h('span', null, h('strong', { text: it.due ? M.relDay(it.due, { long: true }) : 'No date' }), it.at ? ` ${it.at}` : ''),
      it.due && !M.isDone(it) ? h(`span.card-dday${n < 0 ? '.is-late' : n <= 1 ? '.is-soon' : ''}`, { text: n < 0 ? `${-n}d late` : n === 0 ? 'Today' : `${n} day${n === 1 ? '' : 's'}` }) : null,
    ],
    color: s?.color,
    onClick: (e) => app.openItem(it, null, e.currentTarget),
  });
}
