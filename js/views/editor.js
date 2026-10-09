// The item editor, built like the Store's configurator: two-tone step headings, dimension tiles,
// floating-label fields, and a sticky footer with the actions.

import { h, icon, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { openModal, askConfirm } from '../ui/sheet.js';
import { field, dropdown, tiles, btn, more, check, blockHead, dot } from '../ui/kit.js';
import { toast } from '../ui/toast.js';
import { flipRender } from '../motion/flip.js';
import { motion } from '../motion/animate.js';
import { springs } from '../motion/spring.js';
import { planRevision } from '../ai.js';

export function openItemEditor(app, existing, prefill = {}, origin = null) {
  const isNew = !existing;
  const d = structuredClone(existing || {
    id: db.newId(), kind: 'homework', type: null, title: '', subjectId: null,
    due: M.ymd(M.addDays(M.today(), 1)), at: null, status: 'todo', topics: [], notes: '',
    score: '', max: '', grade: '', created: Date.now(),
  });
  if (isNew) Object.assign(d, Object.fromEntries(Object.entries(prefill || {}).filter(([, v]) => v !== undefined)));
  d.topics ||= [];
  const kindLabel = () => M.KINDS.find((k) => k.value === d.kind)?.label || 'Item';

  const ctl = openModal({
    eyebrow: isNew ? 'New' : kindLabel(),
    title: isNew ? 'New item.' : d.title || 'Untitled',
    footer: [
      btn('Cancel', () => ctl.close(), { size: 'elevated', variant: 'secondary-neutral' }),
      btn(isNew ? 'Add' : 'Save', () => commit(), { size: 'elevated' }),
    ],
    build: (body) => build(body),
  });

  function commit() {
    d.title = (d.title || '').trim();
    if (!d.title) {
      const s = M.subject(d.subjectId);
      d.title = [s?.short || s?.name, d.type || kindLabel()].filter(Boolean).join(' ') || 'Untitled';
    }
    if (d.status === 'done' && !d.doneAt) d.doneAt = Date.now();
    if (d.status !== 'done') d.doneAt = null;
    delete d.example;
    db.saveDoc('items', d);
    ctl.close();
    toast(isNew ? `Added “${d.title}”.` : `Saved “${d.title}”.`, isNew ? { action: 'Undo', onAction: () => db.removeDoc('items', d.id) } : {});
  }

  function build(body) {
    const title = field({ id: 'item-title', label: 'Title', value: d.title, autofocus: isNew, onInput: (v) => (d.title = v) });
    title.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });

    const kind = tiles({
      label: 'Kind', value: d.kind, cols: 3, compact: true,
      options: [
        { value: 'homework', label: 'Homework' },
        { value: 'assessment', label: 'Assessment' },
        { value: 'task', label: 'Task' },
      ],
      onChange: (v) => { d.kind = v; d.type = null; ctl.setEyebrow(isNew ? 'New' : kindLabel()); renderDynamic(); },
    });

    const subjects = tiles({
      label: 'Subject', value: d.subjectId, cols: 3, compact: true,
      options: [{ value: null, label: 'None' }, ...M.subjects().filter((s) => s.kind !== 'pastoral').map((s) => ({ value: s.id, label: s.short || s.name, color: s.color }))],
      onChange: (v) => { d.subjectId = v; renderDue(); },
    });

    const typeBox = h('div');
    const renderTypes = () => {
      const types = d.kind === 'assessment' ? M.ASSESSMENT_TYPES : d.kind === 'homework' ? M.HOMEWORK_TYPES : [];
      typeBlock.hidden = !types.length;
      fill(typeBox, tiles({
        label: 'Type', value: d.type, cols: 4, compact: true,
        options: types.map((t) => ({ value: t, label: t, toggle: true })),
        onChange: (v) => (d.type = v),
      }));
    };

    // due
    const date = field({ id: 'item-due', label: 'Date', type: 'date', value: d.due || '', onChange: (v) => { d.due = v || null; renderDue(); } });
    const timeBox = h('div');
    const quick = h('div.quick-dates');
    const dueInfo = h('p.block-note');
    function renderDue() {
      date.input.value = d.due || '';
      const day = d.due ? M.parseYMD(d.due) : null;
      const ls = day ? M.lessonsOn(day).filter((l) => l.period.kind !== 'reg') : [];
      const opts = [{ value: '', label: 'Any time' }, ...ls.map((l) => ({ value: l.period.start, label: `${l.period.label} · ${l.period.start}${l.subject ? ` · ${l.subject.short || l.subject.name}` : ''}` }))];
      if (d.at && !opts.some((o) => o.value === d.at)) opts.push({ value: d.at, label: d.at });
      fill(timeBox, dropdown({ id: 'item-at', label: 'Time', options: opts, value: d.at || '', onChange: (v) => (d.at = v || null) }));
      const t0 = M.today();
      const set = (ds, at = null) => { d.due = ds; d.at = at; renderDue(); };
      const nl = d.subjectId ? M.nextLesson(new Date(), d.subjectId) : null;
      const nl2 = d.subjectId ? M.nextLesson(new Date(), d.subjectId, 1) : null;
      const q = (label, on, fn) => h(`button.pill-btn`, { type: 'button', 'aria-pressed': String(on), onclick: fn }, label);
      fill(quick, 
        q('Today', d.due === M.ymd(t0), () => set(M.ymd(t0))),
        q('Tomorrow', d.due === M.ymd(M.addDays(t0, 1)), () => set(M.ymd(M.addDays(t0, 1)))),
        nl ? q(`Next lesson · ${M.relDay(nl.date)}`, d.due === nl.date && d.at === M.fromMin(nl.start), () => set(nl.date, M.fromMin(nl.start))) : null,
        nl2 ? q(`Lesson after · ${M.relDay(nl2.date)}`, d.due === nl2.date && d.at === M.fromMin(nl2.start), () => set(nl2.date, M.fromMin(nl2.start))) : null,
        q('In a week', d.due === M.ymd(M.addDays(t0, 7)), () => set(M.ymd(M.addDays(t0, 7)))),
        q('No date', !d.due, () => set(null)));
      if (day) {
        const s = M.subject(d.subjectId);
        const has = s && ls.some((l) => l.subjectId === s.id);
        dueInfo.textContent = !M.isSchoolDay(day) ? `${M.fmtLong(day)} — no school that day.` : `${M.fmtLong(day)} is a Week ${M.weekLetter(day)} day${s ? (has ? `, and you have ${s.short || s.name}.` : `, with no ${s.short || s.name} lesson.`) : '.'}`;
      } else dueInfo.textContent = '';
    }

    const status = tiles({
      label: 'Status', value: d.status || 'todo', cols: 3, compact: true,
      options: M.STATUSES.map((s) => ({ value: s.value, label: s.label })),
      onChange: (v) => { d.status = v; renderDynamic(); },
    });

    // topics
    const topicList = h('div.hlist.topic-list');
    const topicNote = h('p.block-note');
    function renderTopics() {
      const done = d.topics.filter((t) => t.done).length;
      topicNote.textContent = d.topics.length ? `${done} of ${d.topics.length} ready. Claude weights revision toward the ones you haven’t ticked.` : 'Add the topics this covers, then tick them off as you revise.';
      flipRender(topicList, () => d.topics.map((t, i) => {
        const inp = h('input.topic-input', { type: 'text', value: t.t, 'aria-label': `Topic ${i + 1}` });
        inp.addEventListener('input', () => (t.t = inp.value));
        return h('div.hrow.topic-row', { dataset: { flip: t.id } },
          check({ checked: t.done, label: 'Ready', onChange: (v) => { t.done = v; renderTopics(); } }),
          inp,
          h('button.topic-remove', { type: 'button', 'aria-label': 'Remove topic', onclick: () => { d.topics.splice(i, 1); renderTopics(); } }, icon('close', 14)));
      }), { exit: true });
    }
    const addTopic = field({ id: 'item-topic', label: 'Add a topic and press return' });
    addTopic.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !addTopic.input.value.trim()) return;
      e.preventDefault();
      for (const t of addTopic.input.value.split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean)) d.topics.push({ id: db.newId().slice(0, 8), t, done: false });
      addTopic.input.value = '';
      renderTopics();
    });

    // result
    const pct = h('span.result-pct');
    const updPct = () => { const p = M.scorePct(d); pct.textContent = p == null ? '' : `${Math.round(p)}%`; };
    const score = field({ id: 'item-score', label: 'Score', type: 'number', inputmode: 'decimal', value: d.score ?? '', onInput: (v) => { d.score = v; updPct(); } });
    const max = field({ id: 'item-max', label: 'Out of', type: 'number', inputmode: 'decimal', value: d.max ?? '', onInput: (v) => { d.max = v; updPct(); } });
    const grade = dropdown({ id: 'item-grade', label: 'Grade', value: d.grade || '', options: ['', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'U'].map((g) => ({ value: g, label: g || '—' })), onChange: (v) => (d.grade = v) });
    updPct();

    const notes = field({ id: 'item-notes', label: 'Notes', area: true, value: d.notes || '', onInput: (v) => (d.notes = v) });
    const aiBox = h('div.ai-box');

    const typeBlock = h('section', null, blockHead('Type.', 'Optional.'), typeBox);
    const topicsBlock = h('section', null, blockHead('Topics.', 'What does it cover?'), topicList, h('div.topic-add', null, addTopic), topicNote);
    const resultBlock = h('section', null, blockHead('Result.', 'Once it’s marked.'), h('div.field-row', { style: { '--cols': 3 } }, score, max, grade), h('p.block-note', null, pct));
    const aiBlock = h('section', null, blockHead('Revision plan.', 'Let Claude space it out.'), aiBox);

    function renderDynamic() {
      renderTypes();
      topicsBlock.hidden = d.kind !== 'assessment';
      resultBlock.hidden = !(d.kind === 'assessment' || d.status === 'done');
      aiBlock.hidden = !(d.kind === 'assessment' && S.caps.sample && d.due && d.status !== 'done');
      renderAI();
    }

    function renderAI(state = 'idle', payload) {
      if (aiBlock.hidden) return;
      if (state === 'idle') {
        const kids = M.allItems().filter((i) => i.parentId === d.id);
        fill(aiBox, 
          h('p.t-body.t-2', { text: kids.length ? `${kids.length} revision session${kids.length === 1 ? ' is' : 's are'} already in your planner. Ask again to replan.` : 'Claude spreads sessions between now and the day before, longer at weekends, weighted toward the topics you haven’t ticked.' }),
          h('div.ai-actions', null, btn('Plan revision with Claude', () => runAI(), { variant: 'secondary', ico: 'sparkles' })));
      } else if (state === 'thinking') {
        fill(aiBox, h('p.ai-thinking', null, h('span.ai-shimmer', { text: 'Claude is planning your revision…' }), ' ', more('Stop', () => payload.abort())));
      } else if (state === 'error') {
        fill(aiBox, h('p.t-body', { style: 'color:var(--error)', text: payload }), h('div.ai-actions', null, more('Try again', () => runAI())));
      } else if (state === 'plan') {
        const picks = new Set(payload.map((_, i) => i));
        const add = btn('', () => {
          const sessions = payload.filter((_, i) => picks.has(i));
          for (const p of sessions) db.saveDoc('items', { id: db.newId(), kind: 'task', type: 'Revision', title: p.focus, subjectId: d.subjectId, due: p.date, at: null, status: 'todo', minutes: p.minutes, parentId: d.id, topics: [], notes: `For ${d.title}`, created: Date.now() });
          toast(`Added ${sessions.length} revision session${sessions.length === 1 ? '' : 's'}.`);
          renderAI();
        });
        const label = () => { add.querySelector('span').textContent = `Add ${picks.size} session${picks.size === 1 ? '' : 's'}`; add.disabled = !picks.size; };
        label();
        fill(aiBox, 
          h('div.hlist', null, ...payload.map((p, i) => h('div.hrow', null,
            check({ checked: true, label: 'Include', onChange: (v) => { v ? picks.add(i) : picks.delete(i); label(); } }),
            h('span.hrow-main', null, h('span.hrow-title', { text: p.focus }), h('span.hrow-sub', { text: `${M.relDay(p.date, { long: true })} · ${p.minutes} min` }))))),
          h('div.ai-actions', null, more('Discard', () => renderAI()), add));
        aiBox.querySelectorAll('.hrow').forEach((el, i) => motion(el).set({ y: 12, opacity: 0 }).to({ y: 0, opacity: 1 }, springs.smooth));
      }
    }
    async function runAI() {
      const ac = new AbortController();
      renderAI('thinking', ac);
      try {
        const plan = await planRevision(S.caps.sample, d, { signal: ac.signal });
        if (!plan.length) return renderAI('error', 'Claude didn’t return any sessions that fit before the due date.');
        renderAI('plan', plan);
      } catch (e) {
        if (e?.code === 'cancelled') return renderAI();
        if (e?.code === 'not_granted' || e?.code === 'sampling_disabled') { aiBlock.hidden = true; return; }
        renderAI('error', e?.code === 'rate_limited' ? 'Claude is busy right now. Try again in a minute.' : 'Claude couldn’t make a plan this time.');
      }
    }

    const extra = h('div.more-options', null,
      typeBlock,
      h('section', null, blockHead('Status.'), status),
      topicsBlock, resultBlock, aiBlock,
      h('section', null, blockHead('Notes.'), notes));
    const hasExtra = !isNew && (d.topics.length || d.notes || d.score || d.status !== 'todo' || d.type);
    extra.hidden = !hasExtra;
    const toggle = h('button.more-toggle', { type: 'button', 'aria-expanded': String(!extra.hidden) }, h('span', { text: extra.hidden ? 'More options' : 'Fewer options' }), icon('down', 12));
    toggle.addEventListener('click', () => {
      extra.hidden = !extra.hidden;
      toggle.setAttribute('aria-expanded', String(!extra.hidden));
      toggle.querySelector('span').textContent = extra.hidden ? 'More options' : 'Fewer options';
      if (!extra.hidden) extra.querySelectorAll('section:not([hidden])').forEach((sec, i) => motion(sec).set({ y: 12, opacity: 0 }).to({ y: 0, opacity: 1 }, springs.smooth));
    });
    body.append(
      h('section', null, title),
      h('section', null, blockHead('Subject.', 'Which class?'), subjects),
      h('section', null, blockHead('Kind.'), kind),
      h('section', null, blockHead('Due.', 'When is it?'), quick, h('div.field-row.stack-sm.due-fields', null, date, timeBox), dueInfo),
      h('div', null, toggle),
      extra,
      isNew ? null : h('section.danger-zone', null, more('Delete this item', async () => {
        if (!(await askConfirm({ title: `Delete “${d.title || 'this item'}”?`, confirm: 'Delete', destructive: true }))) return;
        db.removeDoc('items', d.id);
        ctl.close();
        toast(`Deleted “${existing.title}”.`, { action: 'Undo', onAction: () => db.saveDoc('items', existing) });
      }, 'more-danger')));
    renderTopics();
    renderDue();
    renderDynamic();
  }
}
