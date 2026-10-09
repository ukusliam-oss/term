// Quick-add parser: "bio test next fri p3" → { subject: Biology, kind: assessment, type: Test, due, at }.
// Everything it doesn't recognise becomes the title. Returns the spans it used so the field can
// show what was understood while typing.

import * as M from './model.js';

const TYPES = {
  test: 'Test', quiz: 'Quiz', mock: 'Mock', mocks: 'Mock', exam: 'Exam', practical: 'Practical', prac: 'Practical',
  presentation: 'Presentation', pres: 'Presentation', coursework: 'Coursework', cw: 'Coursework',
  essay: 'Essay', worksheet: 'Worksheet', reading: 'Reading', project: 'Project', revision: 'Revision', revise: 'Revision',
};
const KIND_WORDS = { hw: 'homework', homework: 'homework', task: 'task', todo: 'task', reminder: 'task' };
const DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function aliases() {
  const out = [];
  for (const s of M.subjects()) {
    const words = new Set([s.id, (s.short || '').toLowerCase(), s.name.toLowerCase()]);
    const first = s.name.toLowerCase().split(/[\s&]+/)[0];
    // 4+ letter prefixes only: 3-letter ones collide with ordinary words ("his", "car"); short
    // forms like "bio" come from the subject's own aliases.
    for (let n = 4; n <= first.length; n++) words.add(first.slice(0, n));
    for (const a of s.aliases || []) words.add(a.toLowerCase());
    for (const w of words) if (w && w.length >= 2) out.push([w, s.id]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}

function monthDay(day, month, year) {
  const t = M.today();
  let d = new Date(year ?? t.getFullYear(), month, day);
  if (year == null && M.daysBetween(t, d) < -45) d = new Date(t.getFullYear() + 1, month, day);
  return d;
}

export function parse(text) {
  const raw = text.trim();
  const toks = raw.split(/\s+/).filter(Boolean);
  const low = toks.map((t) => t.toLowerCase().replace(/[.,!?]+$/, ''));
  const used = new Array(toks.length).fill(null);
  const r = { subjectId: null, kind: null, type: null, due: null, at: null, nextLesson: 0, title: '', spans: [] };
  const mark = (i, n, role) => { for (let k = i; k < i + n; k++) used[k] = role; };
  const t0 = M.today();

  // subjects (multi-word names first)
  const al = aliases();
  for (let i = 0; i < low.length && !r.subjectId; i++) {
    for (const [a, id] of al) {
      const parts = a.split(/\s+/);
      if (parts.every((p, k) => low[i + k] === p)) {
        r.subjectId = id;
        mark(i, parts.length, 'subject');
        break;
      }
    }
  }

  for (let i = 0; i < low.length; i++) {
    if (used[i]) continue;
    const w = low[i];
    const nx = low[i + 1];
    if (TYPES[w] && !r.type) { r.type = TYPES[w]; mark(i, 1, 'type'); continue; }
    if (KIND_WORDS[w] && !r.kind) { r.kind = KIND_WORDS[w]; mark(i, 1, 'type'); continue; }
    if (r.due) {
      // time / period after a date
    } else if (w === 'today' || w === 'tonight' || w === 'tod') { r.due = t0; mark(i, 1, 'date'); continue; }
    else if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw' || w === 'tom') { r.due = M.addDays(t0, 1); mark(i, 1, 'date'); continue; }
    else if ((w === 'next' || w === 'nxt') && (nx === 'lesson' || nx === 'class')) { r.nextLesson = 1; mark(i, 2, 'date'); continue; }
    else if (w === 'nl') { r.nextLesson = 1; mark(i, 1, 'date'); continue; }
    else if (w === 'next' && nx === 'week') { r.due = M.addDays(M.startOfWeek(t0), 7); mark(i, 2, 'date'); continue; }
    else if (w === 'next' && nx in DAYS) {
      r.due = M.addDays(M.startOfWeek(t0), 7 + ((DAYS[nx] + 6) % 7));
      mark(i, 2, 'date');
      continue;
    } else if (w in DAYS) {
      let n = (DAYS[w] - t0.getDay() + 7) % 7;
      if (n === 0) n = 7;
      r.due = M.addDays(t0, n);
      mark(i, 1, 'date');
      continue;
    } else if (w === 'in' && /^\d+$/.test(nx || '') && /^(d|day|days|w|wk|week|weeks)$/.test(low[i + 2] || '')) {
      const n = +nx * (low[i + 2].startsWith('w') ? 7 : 1);
      r.due = M.addDays(t0, n);
      mark(i, 3, 'date');
      continue;
    } else if (/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(w)) {
      const [d, m, y] = w.split(/[/.-]/).map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        r.due = monthDay(d, m - 1, y ? (y < 100 ? 2000 + y : y) : null);
        mark(i, 1, 'date');
        continue;
      }
    } else if (/^\d{1,2}(st|nd|rd|th)?$/.test(w) && nx && nx.slice(0, 3) in MONTHS) {
      r.due = monthDay(parseInt(w, 10), MONTHS[nx.slice(0, 3)]);
      mark(i, 2, 'date');
      continue;
    } else if (w.slice(0, 3) in MONTHS && w.length <= 9 && /^\d{1,2}(st|nd|rd|th)?$/.test(nx || '')) {
      r.due = monthDay(parseInt(nx, 10), MONTHS[w.slice(0, 3)]);
      mark(i, 2, 'date');
      continue;
    }
    // period: p3, l3, lesson 3, period 3
    let m = w.match(/^[pl](\d)$/);
    if (m || ((w === 'lesson' || w === 'period') && /^\d$/.test(nx || ''))) {
      const n = m ? +m[1] : +nx;
      const p = M.lessonPeriods()[n - 1];
      if (p) { r.at = p.start; mark(i, m ? 1 : 2, 'time'); continue; }
    }
    // time: 9am, 3:30pm, 15:00, at 4
    const tm = w.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
    if (tm && (tm[2] || tm[3] || low[i - 1] === 'at')) {
      let hh = +tm[1];
      if (tm[3] === 'pm' && hh < 12) hh += 12;
      if (tm[3] === 'am' && hh === 12) hh = 0;
      if (!tm[3] && !tm[2] && hh < 7) hh += 12;
      if (hh < 24 && (+tm[2] || 0) < 60) {
        r.at = `${String(hh).padStart(2, '0')}:${tm[2] || '00'}`;
        mark(i, 1, 'time');
        if (low[i - 1] === 'at' && !used[i - 1]) mark(i - 1, 1, 'time');
        continue;
      }
    }
  }

  if (r.nextLesson && r.subjectId) {
    const l = M.nextLesson(new Date(), r.subjectId);
    if (l) { r.due = M.parseYMD(l.date); r.at = M.fromMin(l.start); }
  }
  if (!r.kind) r.kind = r.type && M.ASSESSMENT_TYPES.includes(r.type) ? 'assessment' : 'homework';

  r.title = toks.filter((_, i) => !used[i]).join(' ').replace(/^[-–:,\s]+|[-–:,\s]+$/g, '');
  if (!r.title) {
    const s = M.subject(r.subjectId);
    r.title = [s?.short || s?.name, r.type || (r.kind === 'homework' ? 'homework' : r.kind === 'assessment' ? 'assessment' : '')].filter(Boolean).join(' ') || '';
  }
  r.due = r.due ? M.ymd(r.due) : null;
  r.spans = toks.map((t, i) => ({ text: t, role: used[i] }));
  return r;
}
