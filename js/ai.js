// Revision planning with Claude (the artifact's `sample` capability, on the viewer's own account).

import { S } from './store.js';
import * as M from './model.js';

export async function planRevision(sample, item, { signal } = {}) {
  if (!sample) throw { code: 'not_granted' };
  const t0 = M.today();
  const todayStr = M.ymd(t0);
  const subj = M.subject(item.subjectId);
  const lastDay = M.ymd(M.addDays(M.parseYMD(item.due), -1));
  const topics = (item.topics || []).map((t) => `- ${t.t}${t.done ? ' (already confident)' : ''}`).join('\n') || '(no topics listed — infer sensible GCSE topics from the title)';
  const others = M.allItems()
    .filter((i) => i.id !== item.id && !M.isDone(i) && i.due && i.due >= todayStr && i.due <= item.due)
    .sort(M.sortByDue)
    .slice(0, 20)
    .map((i) => `- ${i.due}: ${M.subject(i.subjectId)?.name || 'General'} — ${i.title} (${i.type || i.kind})`)
    .join('\n') || '(none)';
  const busy = [];
  for (let i = 0; i <= M.daysBetween(t0, M.parseYMD(lastDay)) && i < 40; i++) {
    const d = M.addDays(t0, i);
    if (M.isSchoolDay(d)) busy.push(`${M.ymd(d)} ${M.DAY_SHORT[d.getDay()]}: school until 15:15`);
    else busy.push(`${M.ymd(d)} ${M.DAY_SHORT[d.getDay()]}: no school`);
  }

  const prompt = `You plan revision for a GCSE student at ${S.settings.school || 'a British international school'}.
Today is ${todayStr} (${M.DAY_LONG[t0.getDay()]}).
Assessment: "${item.title}" — ${subj?.name || 'unspecified subject'}, ${item.type || 'assessment'}, on ${item.due}${item.at ? ` at ${item.at}` : ''}.
Topics:
${topics}
Other deadlines before then:
${others}
Days available:
${busy.join('\n')}

Plan 3 to 8 revision sessions from ${todayStr} to ${lastDay} inclusive. Put longer sessions on days with no school, keep school-day sessions to 20–45 minutes, avoid the evening before another deadline where possible, prioritise topics not marked confident, and make the final session a timed practice paper or past-question set.
Reply with only a JSON array, oldest first, of objects {"date": "YYYY-MM-DD", "minutes": number, "focus": "what to revise, under 60 characters"}.`;

  const out = await sample.json(prompt, { signal });
  if (!Array.isArray(out)) return [];
  return out
    .filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date >= todayStr && p.date <= lastDay && typeof p.focus === 'string')
    .map((p) => ({ date: p.date, minutes: Math.max(10, Math.min(180, Math.round(Number(p.minutes) || 30))), focus: p.focus.trim().slice(0, 80) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 8);
}
