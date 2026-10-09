// School, in the manner of apple.com's "Explore the lineup": a column per subject with its key
// facts on hairlines, then results, term dates and study time as their own sections.

import { h, icon, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as M from '../model.js';
import { pageFrame } from './frame.js';
import { btn, more, dot, stat, hrow, emptyState, tint, twoTone, progress } from '../ui/kit.js';

export function createSchool(app) {
  const f = pageFrame({ id: 'school', title: 'School', sub: 'Subjects, results, term dates and study time.' });
  const head = h('div.wrap.school-head');
  const lineup = h('div.wrap.lineup');
  const others = h('div.wrap.lineup-others');
  const results = h('section.section.section-alt', { id: 'school-results' });
  const term = h('section.section', { id: 'school-term' });
  const study = h('section.section.section-alt', { id: 'school-study' });
  f.body.append(h('section.section.section-tight', { id: 'school-subjects' }, head, lineup, others), results, term, study);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  f.setControls(
    ...[['school-results', 'Results'], ['school-term', 'Term dates'], ['school-study', 'Study time']].map(([id, label]) => btn(label, () => jump(id), { variant: 'secondary-neutral' })),
    btn('Add subject', (e) => app.openSubject(null, e.currentTarget), { variant: 'neutral' }));

  function update() {
    fill(head, 
      h('p.t-label', { text: S.settings.school || 'Your school' }),
      h('h1.t-headline', { text: 'Explore your subjects.' }));
    renderLineup();
    renderResults();
    renderTerm();
    renderStudy();
  }

  function renderLineup() {
    const subs = M.subjects().filter((s) => s.kind !== 'pastoral');
    if (!subs.length) {
      fill(lineup, emptyState({ title: 'No subjects yet.', text: 'Add your subjects, then place them on the timetable.', action: { label: 'Add subject', button: true, onClick: () => app.openSubject(null) } }));
      fill(others, );
      return;
    }
    fill(lineup, ...subs.map((s) => {
      const st = M.subjectStats(s.id);
      const nx = M.nextLesson(new Date(), s.id);
      const per = M.lessonsPerCycle(s.id);
      const next = st.upcomingAssessments.sort(M.sortByDue)[0];
      return h('article.lineup-item.reveal', { style: tint(s.color) },
        h('button.lineup-art', { type: 'button', 'aria-label': `${s.name} details`, onclick: (e) => app.openSubject(s.id, e.currentTarget) },
          h('span.lineup-mono', { text: (s.short || s.name).slice(0, 2) })),
        h('div.lineup-colors', null, dot(s.color)),
        h('p.lineup-level.t-eyebrow', { text: s.level || '' }),
        h('h3.lineup-name', { text: s.name }),
        h('p.lineup-tag', { text: [s.room, s.teacher].filter(Boolean).join(' · ') || ' ' }),
        h('div.button-group.lineup-ctas', null,
          btn('Details', (e) => app.openSubject(s.id, e.currentTarget), { size: '' }),
          more('Add homework', (e) => app.openItem(null, { kind: 'homework', subjectId: s.id, due: nx?.date, at: nx ? M.fromMin(nx.start) : null }, e.currentTarget))),
        h('ul.lineup-specs', null,
          spec(String(per), 'lessons every fortnight'),
          spec(nx ? `${M.relDay(nx.date)} ${M.fromMin(nx.start)}` : '—', 'next lesson'),
          spec(st.avg != null ? `${Math.round(st.avg)}%` : '—', st.avg != null ? `average across ${st.results.length} result${st.results.length === 1 ? '' : 's'}` : 'no marked work yet'),
          spec(next ? M.ddayText(next) : '—', next ? next.title : 'no assessments scheduled')));
    }));
    const past = M.subjects().filter((s) => s.kind === 'pastoral');
    fill(others, past.length ? h('p.t-reduced.t-2', null, 'Also on your timetable: ',
      ...past.flatMap((s, i) => [i ? ', ' : '', h('button.more', { type: 'button', onclick: (e) => app.openSubject(s.id, e.currentTarget), text: s.name })]), '.') : '');
  }
  function spec(value, label) {
    return h('li.lineup-spec', null, h('span.lineup-spec-value', { text: value }), h('span.lineup-spec-label', { text: label }));
  }

  function renderResults() {
    const rows = M.subjects().map((s) => ({ s, st: M.subjectStats(s.id) })).filter((x) => x.st.avg != null).sort((a, b) => b.st.avg - a.st.avg);
    const all = M.allItems().filter((i) => M.scorePct(i) != null);
    const avg = all.length ? Math.round(all.reduce((a, i) => a + M.scorePct(i), 0) / all.length) : null;
    fill(results, h('div.wrap', null,
      h('div.section-head-center', null,
        h('h2.t-headline', { text: 'Results.' }),
        h('p.t-intro.t-2', { text: all.length ? 'Every marked assessment, averaged by subject.' : 'Add a score to a finished assessment and it shows up here.' })),
      avg != null ? h('div.results-hero', null, stat({ value: avg, unit: '%', caption: `average across ${all.length} result${all.length === 1 ? '' : 's'}` })) : null,
      rows.length ? h('div.results-grid', null, ...rows.map(({ s, st }) => h('button.results-tile', { type: 'button', style: tint(s.color), onclick: (e) => app.openSubject(s.id, e.currentTarget) },
        h('span.results-name', null, dot(s.color, 'dot-sm'), ` ${s.name}`),
        h('span.results-value', { text: `${Math.round(st.avg)}%` }),
        progress(st.avg / 100),
        h('span.results-n', { text: `${st.results.length} result${st.results.length === 1 ? '' : 's'}${st.results.at(-1)?.grade ? ` · latest grade ${st.results.at(-1).grade}` : ''}` })))) : null));
  }

  function renderTerm() {
    const t = M.ymd(M.today());
    const evs = [...S.events.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
    const upcoming = evs.filter((e) => (e.end || e.start) >= t);
    const past = evs.filter((e) => (e.end || e.start) < t).slice(-3);
    const kindName = { holiday: 'Holiday', exams: 'Exams', trip: 'Trip', event: 'Event' };
    const toRow = (e) => {
      const a = M.parseYMD(e.start);
      const b = M.parseYMD(e.end || e.start);
      const days = M.daysBetween(M.today(), a);
      return hrow({
        lead: h('span.t-eyebrow', { text: kindName[e.kind] || 'Event' }),
        title: e.title,
        sub: e.end && e.end !== e.start ? `${M.fmtShort(a)} – ${M.fmtShort(b)}` : M.fmtShort(a),
        trail: days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : (e.end || e.start) >= t ? 'Now' : '',
        onClick: (x) => app.openEvent(e, x.currentTarget), chevron: true,
      });
    };
    fill(term, h('div.wrap', null,
      h('div.section-head-split', null, twoTone('Term dates.', 'Holidays, exam weeks and trips.', 't-callout'), more('Add a date', (e) => app.openEvent(null, e.currentTarget))),
      upcoming.length || past.length
        ? h('div', null, h('div.hlist', null, ...upcoming.map(toRow)), past.length ? h('div', null, h('p.t-eyebrow.term-earlier', { text: 'Earlier' }), h('div.hlist', null, ...past.map(toRow))) : null)
        : emptyState({ title: 'No term dates yet.', text: 'Add half terms and holidays so the timetable and the A/B cycle know when school is off.', action: { label: 'Add a holiday', onClick: () => app.openEvent(null) } })));
  }

  function renderStudy() {
    const t0 = M.today();
    const mon = M.startOfWeek(t0);
    const days = Array.from({ length: 7 }, (_, i) => M.addDays(mon, i));
    const data = days.map((d) => S.focus.get(M.ymd(d)));
    const total = data.reduce((a, x) => a + (x?.total || 0), 0);
    const by = {};
    for (const x of data) for (const [k, v] of Object.entries(x?.by || {})) by[k] = (by[k] || 0) + v;
    const max = Math.max(30, ...data.map((x) => x?.total || 0));
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6);
    fill(study, h('div.wrap', null,
      h('div.section-head-center', null, h('h2.t-headline', { text: 'Study time.' }), h('p.t-intro.t-2', { text: 'Focus sessions this week, by day and by subject.' })),
      h('div.study-layout', null,
        h('div.study-chart-card', null,
          stat({ value: total, unit: ' min', caption: 'this week', small: true, gradient: false }),
          h('div.weekbars', null, ...days.map((d, i) => h(`div.weekbar${M.ymd(d) === M.ymd(t0) ? '.is-today' : ''}`, { title: `${M.fmtShort(d)}: ${data[i]?.total || 0} min` },
            h('span.weekbar-val', { text: data[i]?.total ? String(data[i].total) : '' }),
            h('i', { style: { height: `${Math.max(3, ((data[i]?.total || 0) / max) * 140)}px` } }),
            h('span.weekbar-day', { text: M.DAY_SHORT[d.getDay()] }))))),
        h('div.study-side', null,
          top.length ? h('div.hlist', null, ...top.map(([k, v]) => {
            const s = M.subject(k);
            return hrow({ title: h('span', null, dot(s?.color || 'gray', 'dot-sm'), ` ${s?.name || 'General study'}`), trail: M.fmtDuration(v) });
          })) : h('p.t-body.t-2', { text: 'No focus sessions yet this week.' }),
          h('div.button-group.study-cta', null, btn('Start focus', () => app.openFocus(), { size: 'elevated' }))))));
  }

  return {
    id: 'school', el: f.el, update, minute() {},
    setOptions({ section } = {}) { if (section) requestAnimationFrame(() => document.getElementById(`school-${section}`)?.scrollIntoView({ block: 'start' })); },
  };
}
