// Global-nav flyouts, as on apple.com: they drop from the nav over a blurred curtain. Search shows
// Quick Links until you type; Add takes one line of plain English and files it.

import { h, icon, clamp, fill } from './dom.js';
import { parse } from '../nlp.js';
import * as M from '../model.js';
import * as db from '../store.js';
import { dot } from './kit.js';
import { toast } from './toast.js';

let flyout = null;
let curtain = null;
let state = null;

export const flyoutOpen = () => !!state;
export const searchOpen = flyoutOpen;

export function initSearch(host, curtainEl) {
  curtain = curtainEl;
  flyout = h('div.gn-flyout', { role: 'dialog' });
  host.append(flyout);
  curtain.addEventListener('click', () => closeSearch());
}

export function fuzzy(query, text) {
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  if (!q) return 0;
  const at = t.indexOf(q);
  if (at >= 0) return 100 - at + (at === 0 || /\W/.test(t[at - 1]) ? 40 : 0);
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return -1;
    score += i === ti ? 3 : 1;
    if (i === 0 || /\W/.test(t[i - 1])) score += 4;
    ti = i + 1;
  }
  return score;
}

function open(kind, label, build) {
  if (state?.kind === kind) return closeSearch();
  if (state) closeSearch(true);
  flyout.setAttribute('aria-label', label);
  const inner = h('div.gn-flyout-inner');
  fill(flyout, inner);
  state = { kind, prevFocus: document.activeElement };
  build(inner);
  document.body.classList.add('gn-open');
  requestAnimationFrame(() => {
    flyout.classList.add('is-open');
    curtain.classList.add('is-open');
    setTimeout(() => inner.querySelector('input')?.focus(), 60);
  });
}

export function closeSearch(instant = false) {
  if (!state) return;
  const s = state;
  state = null;
  flyout.classList.remove('is-open');
  curtain.classList.remove('is-open');
  document.body.classList.remove('gn-open');
  if (!instant && s.prevFocus?.isConnected) s.prevFocus.focus?.({ preventScroll: true });
}

function linkList(items, startIndex = 0, sel = -1) {
  return h('div.flyout-list', null, ...items.map((it, i) => h('button.flyout-link.stagger', {
    type: 'button', role: 'option', id: `fl-${startIndex + i}`, 'aria-selected': String(startIndex + i === sel), style: { '--i': Math.min(startIndex + i + 2, 12) },
    onclick: () => { closeSearch(); setTimeout(() => it.run(), 40); },
  }, it.color ? dot(it.color, 'dot-sm') : icon('arrow', 14), h('span.flyout-text', { text: it.title }), it.sub ? h('span.flyout-sub', { text: it.sub }) : null)));
}

/** openSearch({ quick: [{title, run}], sources: () => [{group, items}] }) */
export function openSearch({ quick, sources }) {
  open('search', 'Search', (inner) => {
    const input = h('input.search-input', { type: 'search', placeholder: 'Search Term', 'aria-label': 'Search Term', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    const results = h('div', { role: 'listbox' });
    let sel = -1;
    let flat = [];
    function render() {
      const q = input.value.trim();
      const groups = !q ? [{ group: 'Quick Links', items: quick }] : sources().map((g) => ({
        group: g.group,
        items: g.items.map((it) => ({ ...it, score: Math.max(fuzzy(q, it.title), fuzzy(q, it.keywords || '') - 10) })).filter((it) => it.score >= 0).sort((a, b) => b.score - a.score).slice(0, 5),
      })).filter((g) => g.items.length);
      sel = q && groups.length ? 0 : -1;
      flat = groups.flatMap((g) => g.items);
      let n = 0;
      fill(results, ...groups.map((g, gi) => {
        const block = h('div', null, h('p.flyout-heading.stagger', { style: { '--i': gi + 1 }, text: g.group }), linkList(g.items, n, sel));
        n += g.items.length;
        return block;
      }), q && !groups.length ? h('p.flyout-none', { text: `No results for “${q}”.` }) : null);
    }
    const mark = () => results.querySelectorAll('.flyout-link').forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (!flat.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % flat.length; mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = clamp(sel <= 0 ? flat.length - 1 : sel - 1, 0, flat.length - 1); mark(); }
      else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); const it = flat[sel]; closeSearch(); setTimeout(() => it.run(), 40); }
    });
    inner.append(h('form.search-row.stagger', { style: { '--i': 0 }, onsubmit: (e) => e.preventDefault() }, icon('search', 24), input), results);
    render();
  });
}

/** The + flyout: type "bio test next fri p3", press return. */
export function openQuickAdd(app) {
  open('add', 'Add to planner', (inner) => {
    const input = h('input.search-input', { type: 'text', placeholder: 'Add homework, a test or a task', 'aria-label': 'Add to planner', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const parsed = h('p.flyout-parsed.stagger', { style: { '--i': 1 } });
    function render() {
      const v = input.value.trim();
      if (!v) { fill(parsed, h('span', { text: 'Try “bio test next fri p3” or “maths hw next lesson”. Return adds it.' })); return; }
      const r = parse(v);
      const s = M.subject(r.subjectId);
      fill(parsed,
        s ? h('span.qa-bit', null, dot(s.color, 'dot-sm'), ` ${s.name}`) : null,
        h('span.qa-bit', { text: r.type || M.KINDS.find((k) => k.value === r.kind)?.label }),
        h('span.qa-bit', { text: r.due ? M.relDay(r.due, { long: true }) : 'No date' }),
        r.at ? h('span.qa-bit', { text: r.at }) : null,
        h('span.qa-bit.qa-title', { text: `“${r.title || 'Untitled'}”` }));
    }
    function itemFrom(v) {
      const r = parse(v);
      return { id: db.newId(), kind: r.kind, type: r.type, title: r.title || 'Untitled', subjectId: r.subjectId, due: r.due, at: r.at, status: 'todo', topics: [], notes: '', created: Date.now() };
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      const it = itemFrom(v);
      db.saveDoc('items', it);
      closeSearch();
      toast(`Added “${it.title}”${it.due ? `, due ${M.relDay(it.due)}` : ''}.`, { action: 'Undo', onAction: () => db.removeDoc('items', it.id) });
    });
    const next = [];
    const seen = new Set();
    for (let i = 0; next.length < 4 && i < 12; i++) {
      const l = M.nextLesson(new Date(), null, i, true);
      if (!l) break;
      if (seen.has(l.subjectId) || l.subject?.kind === 'pastoral') continue;
      seen.add(l.subjectId);
      next.push(l);
    }
    inner.append(
      h('form.search-row.stagger', { style: { '--i': 0 }, onsubmit: (e) => e.preventDefault() }, icon('plus', 24), input),
      parsed,
      h('p.flyout-heading.stagger', { style: { '--i': 2 }, text: 'Homework for your next lessons' }),
      linkList(next.map((l) => ({ title: `${l.subject.name}`, sub: `due ${M.relDay(l.date)} ${M.fromMin(l.start)}`, color: l.subject.color, run: () => app.openItem(null, { kind: 'homework', subjectId: l.subjectId, due: l.date, at: M.fromMin(l.start) }) }))),
      h('p.flyout-heading.stagger', { style: { '--i': 7 }, text: 'More' }),
      linkList([
        { title: 'New assessment', run: () => app.openItem(null, { kind: 'assessment' }) },
        { title: 'New task', run: () => app.openItem(null, { kind: 'task' }) },
        { title: 'Add with all the details', run: () => { const v = input.value.trim(); app.openItem(null, v ? itemFrom(v) : {}); } },
      ], 6));
    render();
  });
}
