// School-day logic: dates, the A/B cycle, which lesson is on when, and planner item helpers.
// Dates are local 'YYYY-MM-DD' strings — never new Date('2026-10-08'), which parses as UTC.

import { S } from './store.js';

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON_SHORT = MONTHS.map((m) => m.slice(0, 3));

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYMD(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const today = () => startOfDay(new Date());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
export function startOfWeek(d) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(Math.round(m % 60))}`;
export const minutesOf = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
export const atMinutes = (date, m) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(m / 60), m % 60);

// ---------- formatting ----------

export const fmtLong = (d) => `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtShort = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
export function fmtRange(a, b) {
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${a.getDate()} ${MON_SHORT[a.getMonth()]} – ${b.getDate()} ${MON_SHORT[b.getMonth()]}`;
}

export function relDay(ds, { long = false } = {}) {
  if (!ds) return 'No date';
  const d = parseYMD(ds);
  const n = daysBetween(today(), d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return long ? DAY_LONG[d.getDay()] : DAY_SHORT[d.getDay()];
  const base = long ? fmtLong(d) : fmtShort(d);
  return d.getFullYear() === today().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function fmtDuration(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------- memo (cleared whenever the store changes) ----------

let memoVersion = -1;
const memo = new Map();
function cached(key, fn) {
  if (memoVersion !== S.version) {
    memo.clear();
    memoVersion = S.version;
  }
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
}

// ---------- calendar ----------

export function holidayOn(ds) {
  return cached(`hol:${ds}`, () => {
    for (const e of S.events.values()) {
      if (e.kind === 'holiday' && e.start <= ds && ds <= (e.end || e.start)) return e;
    }
    return null;
  });
}

export function eventsOn(ds) {
  return [...S.events.values()].filter((e) => e.start <= ds && ds <= (e.end || e.start));
}

function weekIsHoliday(monday) {
  for (let i = 0; i < 5; i++) if (!holidayOn(ymd(addDays(monday, i)))) return false;
  return true;
}

/** 'A' or 'B' for the week containing date. Holiday weeks don't advance the cycle when pauseOnHolidays. */
export function weekLetter(date) {
  const mon = startOfWeek(date);
  return cached(`wk:${ymd(mon)}`, () => {
    const s = S.settings;
    const anchor = startOfWeek(s.anchorMonday ? parseYMD(s.anchorMonday) : today());
    let diff = Math.round(daysBetween(anchor, mon) / 7);
    if (s.pauseOnHolidays && diff) {
      const step = Math.sign(diff);
      let skip = 0;
      for (let i = step; i !== diff; i += step) if (weekIsHoliday(addDays(anchor, i * 7))) skip++;
      diff -= step * skip;
    }
    const base = s.anchorWeek === 'B' ? 1 : 0;
    return (((base + diff) % 2) + 2) % 2 === 0 ? 'A' : 'B';
  });
}

export const isWeekday = (d) => d.getDay() >= 1 && d.getDay() <= 5;
export const isSchoolDay = (d) => isWeekday(d) && !holidayOn(ymd(d));

export function nextSchoolDay(from, includeToday = false) {
  let d = startOfDay(from);
  if (!includeToday) d = addDays(d, 1);
  for (let i = 0; i < 120; i++, d = addDays(d, 1)) if (isSchoolDay(d)) return d;
  return null;
}

// ---------- timetable ----------

export const periods = () => S.timetable?.periods || [];
export const lessonPeriods = () => periods().filter((p) => p.kind !== 'reg');

export function subjects() {
  return S.timetable?.subjects || [];
}
export function subject(id) {
  if (!id) return null;
  return cached('subjects', () => new Map(subjects().map((s) => [s.id, s]))).get(id) || null;
}
export const cellKey = (letter, dow, pid) => `${letter}${dow}-${pid}`;

/** One entry per period on that date (subjectId null when free). Empty for weekends and holidays. */
export function lessonsOn(date) {
  const ds = ymd(date);
  return cached(`day:${ds}`, () => {
    if (!S.timetable || !isWeekday(date) || holidayOn(ds)) return [];
    const L = weekLetter(date);
    const dow = date.getDay();
    return periods().map((p) => {
      const key = `${ds}_${p.id}`;
      const ov = S.lessons.get(key);
      const sid = S.timetable.cells?.[cellKey(L, dow, p.id)] || null;
      const subj = subject(sid);
      return {
        key, date: ds, letter: L, dow, period: p, subjectId: sid, subject: subj,
        start: toMin(p.start), end: toMin(p.end),
        room: ov?.room || subj?.room || '', roomChanged: !!ov?.room,
        cancelled: !!ov?.cancelled, note: ov?.note || '',
      };
    });
  });
}

/** Lessons interleaved with the breaks between them. */
export function timeline(date) {
  const ls = lessonsOn(date);
  const out = [];
  ls.forEach((l, i) => {
    out.push({ kind: 'lesson', ...l });
    const nx = ls[i + 1];
    if (nx && nx.start - l.end >= 10) out.push({ kind: 'break', start: l.end, end: nx.start, label: breakLabel(l.end, nx.start) });
  });
  return out;
}

export function breakLabel(start, end) {
  const named = (S.timetable?.breaks || []).find((b) => toMin(b.start) <= start + 1 && toMin(b.end) >= end - 1);
  if (named) return named.label;
  return end - start >= 40 ? 'Lunch' : 'Break';
}

/** Where the student is right now. */
export function status(now = new Date()) {
  const d = startOfDay(now);
  const ds = ymd(d);
  const m = minutesOf(now);
  const all = lessonsOn(d);
  const ls = all.filter((l) => l.subjectId && !l.cancelled);
  const upcoming = () => nextLesson(now, null, 0, true);
  if (!S.timetable) return { state: 'empty' };
  if (!isWeekday(d)) return { state: 'weekend', next: upcoming() };
  const hol = holidayOn(ds);
  if (hol) return { state: 'holiday', holiday: hol, next: upcoming() };
  if (!ls.length) return { state: 'free', next: upcoming() };
  const first = ls[0];
  const last = ls[ls.length - 1];
  if (m < first.start) return { state: 'before', next: first, until: first.start - m };
  if (m >= last.end) return { state: 'after', next: upcoming() };
  const cur = ls.find((l) => l.start <= m && m < l.end);
  if (cur) {
    const next = ls.find((l) => l.start >= cur.end) || null;
    return { state: 'lesson', current: cur, next, progress: (m - cur.start) / (cur.end - cur.start), remain: cur.end - m };
  }
  const prev = [...ls].reverse().find((l) => l.end <= m);
  const next = ls.find((l) => l.start > m);
  return {
    state: 'break', label: breakLabel(prev.end, next.start), next, from: prev.end,
    progress: (m - prev.end) / (next.start - prev.end), until: next.start - m,
  };
}

/** The next lesson starting after `after` (optionally of one subject), with its Date in .at. */
export function nextLesson(after = new Date(), subjectId = null, skip = 0, lessonsOnly = false) {
  let n = skip;
  for (let i = 0; i < 42; i++) {
    const d = addDays(startOfDay(after), i);
    for (const l of lessonsOn(d)) {
      if (!l.subjectId || l.cancelled) continue;
      if (subjectId && l.subjectId !== subjectId) continue;
      if (lessonsOnly && l.period.kind === 'reg') continue;
      const at = atMinutes(d, l.start);
      if (at > after) {
        if (n-- > 0) continue;
        return { ...l, at };
      }
    }
  }
  return null;
}

export function nextLessons(subjectId, count = 3, after = new Date()) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const l = nextLesson(after, subjectId, i);
    if (!l) break;
    out.push(l);
  }
  return out;
}

export function lessonsPerCycle(subjectId) {
  const cells = S.timetable?.cells || {};
  return Object.values(cells).filter((v) => v === subjectId).length;
}

// ---------- planner items ----------

export const KINDS = [
  { value: 'assessment', label: 'Assessment', icon: 'target' },
  { value: 'homework', label: 'Homework', icon: 'doc' },
  { value: 'task', label: 'Task', icon: 'checkCircle' },
];
export const ASSESSMENT_TYPES = ['Test', 'Quiz', 'Mock', 'Exam', 'Practical', 'Presentation', 'Coursework'];
export const HOMEWORK_TYPES = ['Worksheet', 'Essay', 'Reading', 'Project', 'Revision', 'Other'];
export const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

export const allItems = () => [...S.items.values()];
export const isDone = (it) => it.status === 'done';
export const dueIn = (it) => (it.due ? daysBetween(today(), parseYMD(it.due)) : null);

export function urgency(it) {
  if (isDone(it)) return 'done';
  const n = dueIn(it);
  if (n == null) return 'normal';
  if (n < 0) return 'overdue';
  if (n <= 1) return 'critical';
  if (n <= 3) return 'warning';
  return 'normal';
}

export function dueText(it) {
  if (!it.due) return 'No date';
  const n = dueIn(it);
  if (n < 0 && !isDone(it)) return n === -1 ? 'Overdue · yesterday' : `Overdue · ${-n} days`;
  return relDay(it.due) + (it.at ? ` · ${it.at}` : '');
}

export function ddayText(it) {
  const n = dueIn(it);
  if (n == null) return '—';
  if (n === 0) return 'Today';
  if (n === 1) return '1 day';
  if (n < 0) return `${-n}d late`;
  return `${n} days`;
}

export function sortByDue(a, b) {
  const ad = a.due || '9999';
  const bd = b.due || '9999';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.at || '99';
  const bt = b.at || '99';
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.created || 0) - (b.created || 0);
}

export function bucketOf(it) {
  if (isDone(it)) return 'done';
  const n = dueIn(it);
  if (n == null) return 'someday';
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const end = daysBetween(today(), addDays(startOfWeek(today()), 6));
  if (n <= end) return 'week';
  if (n <= end + 7) return 'next';
  return 'later';
}
export const BUCKETS = [
  ['overdue', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'],
  ['next', 'Next week'], ['later', 'Later'], ['someday', 'No date'], ['done', 'Done'],
];

export function topicProgress(it) {
  const t = it.topics || [];
  if (!t.length) return null;
  return t.filter((x) => x.done).length / t.length;
}

export function scorePct(it) {
  const s = Number(it.score);
  const m = Number(it.max);
  return it.score !== '' && it.score != null && m > 0 && Number.isFinite(s) ? (s / m) * 100 : null;
}

export function subjectStats(sid) {
  const its = allItems().filter((i) => i.subjectId === sid);
  const results = its.filter((i) => scorePct(i) != null).sort(sortByDue);
  const avg = results.length ? results.reduce((a, i) => a + scorePct(i), 0) / results.length : null;
  const open = its.filter((i) => !isDone(i));
  return { results, avg, open, upcomingAssessments: open.filter((i) => i.kind === 'assessment') };
}

/** Items due on a date that belong to that day's lesson of the same subject. */
export const dueForLesson = (l) => allItems().filter((i) => i.due === l.date && i.subjectId === l.subjectId);
