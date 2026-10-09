// Modals shared across pages: a lesson, a day, a subject, a term date, the subject picker, the A/B
// week chooser and bell times.

import { h, debounce, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { openModal, askConfirm } from '../ui/sheet.js';
import { field, tiles, checkbox, swatches, btn, more, hrow, dot, blockHead, stat } from '../ui/kit.js';
import { toast } from '../ui/toast.js';

function itemRows(app, items, close) {
  return items.map((it) => hrow({
    lead: h('span.t-eyebrow', { text: it.type || M.KINDS.find((k) => k.value === it.kind)?.label }),
    title: it.title,
    sub: M.dueText(it),
    trail: M.isDone(it) ? 'Done' : M.ddayText(it),
    onClick: (e) => { close?.(); app.openItem(it, null, e.currentTarget); }, chevron: true,
  }));
}

// ---------- lesson ----------

export function openLessonSheet(app, lesson) {
  const s = lesson.subject;
  if (!s) return;
  const day = M.parseYMD(lesson.date);
  const l = M.lessonsOn(day).find((x) => x.key === lesson.key) || lesson;
  const ctl = openModal({
    eyebrow: `${l.period.label} · Week ${l.letter}`,
    title: s.name,
    lede: `${M.fmtLong(day)}, ${l.period.start}–${l.period.end}${l.room ? `, ${l.room}` : ''}.`,
    size: 'md',
    build(body) {
      const due = M.dueForLesson(l);
      const nexts = M.nextLessons(s.id, 3, M.atMinutes(day, l.end));
      const note = field({ id: 'lesson-note', label: 'What happened, what to bring, what was set', area: true, value: l.note || '' });
      const save = debounce(() => db.saveLesson(l.key, { note: note.input.value.trim() }), 500);
      note.input.addEventListener('input', save);
      ctl.onClose = () => save.flush();
      const room = field({ id: 'lesson-room', label: `Room change (usually ${s.room || '—'})`, value: l.roomChanged ? l.room : '', onChange: (v) => db.saveLesson(l.key, { room: v.trim() }) });
      body.append(
        h('section', null, blockHead('Note.', 'Just for this lesson.'), note),
        h('section', null, blockHead('This day only.', 'The timetable stays the same.'),
          checkbox({ id: 'lesson-cancel', label: 'Lesson cancelled', checked: l.cancelled, onChange: (v) => db.saveLesson(l.key, { cancelled: v }) }),
          h('div', { style: 'height:16px' }), room),
        h('section', null, blockHead(due.length ? 'Due this lesson.' : 'Homework.'),
          due.length ? h('div.hlist', null, ...itemRows(app, due, () => ctl.close())) : null,
          h('div.panel-links', null,
            more(nexts[0] ? `Add homework due next lesson (${M.relDay(nexts[0].date)})` : 'Add homework', (e) => { ctl.close(); app.openItem(null, { kind: 'homework', subjectId: s.id, due: nexts[0]?.date, at: nexts[0] ? M.fromMin(nexts[0].start) : null }, e.currentTarget); }))),
        nexts.length ? h('section', null, blockHead(`Next ${s.short || s.name}.`),
          h('div.hlist', null, ...nexts.map((n) => hrow({ lead: n.period.start, title: M.relDay(n.date, { long: true }), sub: `${n.period.label} · Week ${n.letter}`, trail: n.room })))) : null,
        h('div.button-group.modal-actions', null,
          btn(`Focus on ${s.short || s.name}`, () => { ctl.close(); app.openFocus(s.id); }, { size: 'elevated' }),
          btn('Subject details', (e) => { ctl.close(); app.openSubject(s.id, e.currentTarget); }, { size: 'elevated', variant: 'secondary' })));
    },
  });
}

// ---------- day ----------

export function openDaySheet(app, date) {
  const ds = M.ymd(date);
  const hol = M.holidayOn(ds);
  const ls = M.lessonsOn(date).filter((l) => l.subjectId);
  const ctl = openModal({
    eyebrow: hol ? 'Holiday' : M.isSchoolDay(date) ? `Week ${M.weekLetter(date)}` : 'No school',
    title: M.fmtLong(date),
    lede: hol ? hol.title : M.isSchoolDay(date) ? `${ls.filter((l) => l.period.kind !== 'reg').length} lessons, starting at ${ls[0]?.period.start || '—'}.` : 'A day off.',
    size: 'md',
    build(body) {
      const items = M.allItems().filter((i) => i.due === ds).sort(M.sortByDue);
      const ev = M.eventsOn(ds);
      body.append(
        ev.length ? h('section', null, blockHead('Events.'), h('div.hlist', null, ...ev.map((e) => hrow({ title: e.title, sub: e.end && e.end !== e.start ? `${M.fmtShort(M.parseYMD(e.start))} – ${M.fmtShort(M.parseYMD(e.end))}` : null, onClick: (x) => { ctl.close(); app.openEvent(e, x.currentTarget); }, chevron: true })))) : null,
        h('section', null, blockHead('Due.'), items.length ? h('div.hlist', null, ...itemRows(app, items, () => ctl.close())) : h('p.t-body.t-2', { text: 'Nothing due.' })),
        ls.length ? h('section', null, blockHead('Lessons.'), h('div.hlist', null, ...ls.map((l) => hrow({
          lead: l.period.start, title: h('span', null, dot(l.subject.color, 'dot-sm'), ` ${l.subject.name}`), sub: l.period.label, trail: l.cancelled ? 'Cancelled' : l.room,
          onClick: (e) => { ctl.close(); app.openLesson(l, e.currentTarget); }, chevron: true,
        })))) : null,
        h('div.button-group.modal-actions', null, btn('Add something for this day', (e) => { ctl.close(); app.openItem(null, { due: ds }, e.currentTarget); }, { size: 'elevated' })));
    },
  });
}

// ---------- subject ----------

export function openSubjectSheet(app, id) {
  const isNew = !id;
  const tt = S.timetable || { periods: [], subjects: [], cells: {} };
  const found = isNew ? null : M.subject(id);
  if (!isNew && !found) return;
  const s = structuredClone(found || { id: `s${db.newId().slice(0, 6)}`, name: '', short: '', level: 'GCSE', room: '', teacher: '', color: 'blue', kit: [], kind: 'academic' });
  s.kit ||= [];
  const ctl = openModal({
    eyebrow: isNew ? 'New subject' : s.level || 'Subject',
    title: isNew ? 'Add a subject.' : s.name,
    footer: [btn('Cancel', () => ctl.close(), { size: 'elevated', variant: 'secondary-neutral' }), btn(isNew ? 'Add' : 'Save', () => commit(), { size: 'elevated' })],
    build(body) {
      const stats = isNew ? null : M.subjectStats(s.id);
      const per = isNew ? 0 : M.lessonsPerCycle(s.id);
      const nexts = isNew ? [] : M.nextLessons(s.id, 3);
      const f = (key, label) => field({ id: `subj-${key}`, label, value: s[key] || '', onInput: (v) => (s[key] = v) });
      const kitList = h('div.hlist');
      const renderKit = () => fill(kitList, ...s.kit.map((k, i) => hrow({ title: k, trail: h('button.more.more-danger', { type: 'button', onclick: () => { s.kit.splice(i, 1); renderKit(); }, text: 'Remove' }) })));
      renderKit();
      const kitAdd = field({ id: 'subj-kit', label: 'Add kit, e.g. PE kit or calculator' });
      kitAdd.input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !kitAdd.input.value.trim()) return;
        e.preventDefault();
        s.kit.push(kitAdd.input.value.trim());
        kitAdd.input.value = '';
        renderKit();
      });
      let chart = null;
      if (stats?.results.length) {
        const pts = stats.results.map((i) => M.scorePct(i));
        const W = 600; const H = 140; const pad = 8;
        const x = (i) => pad + (pts.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (pts.length - 1));
        const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
        const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        chart = h('div.spark');
        chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(50)}" y2="${y(50)}" class="spark-grid"/><line x1="0" x2="${W}" y1="${y(100)}" y2="${y(100)}" class="spark-grid"/><path d="${line}" class="spark-line"/>${pts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" class="spark-pt"/>`).join('')}</svg>`;
      }
      body.append(
        isNew ? null : h('div.subject-stats', null,
          stat({ value: per, caption: 'lessons a fortnight', small: true, gradient: false }),
          stat({ value: stats.avg != null ? Math.round(stats.avg) : '—', unit: stats.avg != null ? '%' : '', caption: 'average result', small: true, gradient: false }),
          stat({ value: stats.upcomingAssessments.length, caption: 'assessments ahead', small: true, gradient: false })),
        nexts.length ? h('section', null, blockHead('Next lessons.'), h('div.hlist', null, ...nexts.map((n) => hrow({ lead: n.period.start, title: M.relDay(n.date, { long: true }), sub: `${n.period.label} · Week ${n.letter}`, trail: n.room })))) : null,
        h('section', null, blockHead('Details.'), h('div.field-stack', null, f('name', 'Name'), h('div.field-row', null, f('short', 'Short name'), f('level', 'Level')), h('div.field-row', null, f('room', 'Room'), f('teacher', 'Teacher')))),
        h('section', null, blockHead('Colour.', 'Shown as a dot beside the subject.'), swatches(s.color, (c) => (s.color = c))),
        h('section', null, blockHead('Kit.', 'Appears in “Pack for tomorrow”.'), kitList, h('div', { style: 'height:14px' }), kitAdd),
        chart ? h('section', null, blockHead('Results.', 'Each marked assessment, oldest first.'), chart) : null,
        stats?.results.length ? h('div.hlist', null, ...stats.results.slice(-6).reverse().map((i) => hrow({ title: i.title, sub: M.fmtShort(M.parseYMD(i.due)), trail: `${Math.round(M.scorePct(i))}%${i.grade ? ` · ${i.grade}` : ''}`, onClick: (e) => { ctl.close(); app.openItem(i, null, e.currentTarget); }, chevron: true }))) : null,
        stats?.open.length ? h('section', null, blockHead('Coming up.'), h('div.hlist', null, ...itemRows(app, stats.open.sort(M.sortByDue).slice(0, 6), () => ctl.close()))) : null,
        isNew ? null : h('section.danger-zone', null, more('Delete this subject', async () => {
          const used = M.lessonsPerCycle(s.id);
          const items = M.allItems().filter((i) => i.subjectId === s.id).length;
          if (!(await askConfirm({ title: `Delete ${s.name}?`, message: `${used} timetable periods will become free and ${items} planner items will lose their subject.`, confirm: 'Delete', destructive: true }))) return;
          const next = structuredClone(S.timetable);
          next.subjects = next.subjects.filter((x) => x.id !== s.id);
          for (const k of Object.keys(next.cells)) if (next.cells[k] === s.id) delete next.cells[k];
          db.saveTimetable(next);
          ctl.close();
          toast(`Deleted ${s.name}.`);
        }, 'more-danger')));
    },
  });
  function commit() {
    s.name = (s.name || '').trim();
    if (!s.name) { document.getElementById('subj-name')?.focus(); return; }
    s.short = (s.short || '').trim() || s.name.split(' ')[0];
    const next = structuredClone(tt);
    next.subjects ||= [];
    const i = next.subjects.findIndex((x) => x.id === s.id);
    if (i >= 0) next.subjects[i] = s;
    else next.subjects.push(s);
    db.saveTimetable(next);
    ctl.close();
    toast(isNew ? `Added ${s.name}.` : `Saved ${s.name}.`);
  }
}

// ---------- term date ----------

export function openEventEditor(app, existing) {
  const isNew = !existing;
  const e = structuredClone(existing || { id: db.newId(), title: '', kind: 'holiday', start: M.ymd(M.today()), end: M.ymd(M.today()) });
  const ctl = openModal({
    eyebrow: 'Term date', title: isNew ? 'Add a date.' : e.title, size: 'md',
    footer: [btn('Cancel', () => ctl.close(), { size: 'elevated', variant: 'secondary-neutral' }), btn(isNew ? 'Add' : 'Save', () => commit(), { size: 'elevated' })],
    build(body) {
      const end = field({ id: 'ev-end', label: 'Ends', type: 'date', value: e.end || e.start, onChange: (v) => (e.end = v < e.start ? e.start : v) });
      const start = field({ id: 'ev-start', label: 'Starts', type: 'date', value: e.start, onChange: (v) => { e.start = v; if (!e.end || e.end < v) { e.end = v; end.input.value = v; } } });
      body.append(
        h('section', null, field({ id: 'ev-title', label: 'Title — Half term, Mock exams, Geography trip', value: e.title, autofocus: isNew, onInput: (v) => (e.title = v) })),
        h('section', null, blockHead('Kind.'), tiles({
          label: 'Kind', value: e.kind, cols: 4, compact: true,
          options: [{ value: 'holiday', label: 'Holiday' }, { value: 'exams', label: 'Exams' }, { value: 'trip', label: 'Trip' }, { value: 'event', label: 'Event' }],
          onChange: (v) => (e.kind = v),
        })),
        h('section', null, blockHead('Dates.'), h('div.field-row', null, start, end),
          h('p.block-note', { text: 'Holidays clear the timetable on those days. With “Holiday weeks pause the A/B cycle” on, a whole week off doesn’t count towards A or B.' })),
        isNew ? null : h('section.danger-zone', null, more('Delete this date', () => {
          db.removeDoc('events', e.id);
          ctl.close();
          toast(`Deleted “${existing.title}”.`, { action: 'Undo', onAction: () => db.saveDoc('events', existing) });
        }, 'more-danger')));
    },
  });
  function commit() {
    e.title = (e.title || '').trim() || (e.kind === 'holiday' ? 'Holiday' : 'Event');
    db.saveDoc('events', e);
    ctl.close();
  }
}

// ---------- subject picker ----------

export function pickSubject(app, current, origin, subtitle) {
  return new Promise((resolve) => {
    let result;
    const ctl = openModal({
      eyebrow: subtitle, title: 'Choose a subject.', size: 'md',
      onClose: () => resolve(result),
      build(body) {
        body.append(
          tiles({
            label: 'Subject', value: current || null, cols: 3,
            options: [...M.subjects().map((s) => ({ value: s.id, label: s.short || s.name, sub: s.room, color: s.color })), { value: null, label: 'Free period' }],
            onChange: (v) => { result = v; setTimeout(() => ctl.close(), 120); },
          }),
          h('div.panel-links', null, more('New subject', (e) => { result = undefined; ctl.close(); app.openSubject(null, e.currentTarget); })));
      },
    });
  });
}

// ---------- A/B week ----------

export function openWeekPicker() {
  const mon = M.startOfWeek(M.isWeekday(M.today()) ? M.today() : M.addDays(M.today(), 2));
  const first = (L) => M.lessonPeriods().slice(0, 3).map((p) => M.subject(S.timetable?.cells?.[M.cellKey(L, 1, p.id)])?.short).filter(Boolean).join(', ');
  const ctl = openModal({
    eyebrow: 'Timetable', title: `Which week is ${M.fmtRange(mon, M.addDays(mon, 4))}?`, lede: 'Every other week alternates from here.', size: 'sm',
    build(body) {
      body.append(tiles({
        label: 'Week', value: M.weekLetter(mon), cols: 2,
        options: ['A', 'B'].map((L) => ({ value: L, label: `Week ${L}`, sub: first(L) ? `Monday: ${first(L)}…` : '' })),
        onChange: (L) => { db.saveSettings({ anchorMonday: M.ymd(mon), anchorWeek: L }); setTimeout(() => ctl.close(), 150); toast(`This week is Week ${L}.`); },
      }));
    },
  });
}

// ---------- bell times ----------

export function openBellTimes() {
  if (!S.timetable) return;
  const tt = structuredClone(S.timetable);
  const ctl = openModal({
    eyebrow: 'Timetable', title: 'Bell times.', lede: 'Gaps of ten minutes or more show as breaks; forty or more as lunch.', size: 'md',
    footer: [btn('Cancel', () => ctl.close(), { size: 'elevated', variant: 'secondary-neutral' }), btn('Save', () => {
      tt.periods.sort((a, b) => M.toMin(a.start) - M.toMin(b.start));
      db.saveTimetable(tt);
      ctl.close();
      toast('Bell times saved.');
    }, { size: 'elevated' })],
    build(body) {
      body.append(h('div.bells', null, ...tt.periods.map((p) => h('div.bell-row', null,
        h('p.bell-label', { text: p.label }),
        h('div.field-row', null,
          field({ id: `bell-s-${p.id}`, label: 'Starts', type: 'time', value: p.start, onChange: (v) => (p.start = v || p.start) }),
          field({ id: `bell-e-${p.id}`, label: 'Ends', type: 'time', value: p.end, onChange: (v) => (p.end = v || p.end) }))))));
    },
  });
}
