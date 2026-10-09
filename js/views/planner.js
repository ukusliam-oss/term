// Planner, set out like the online Store: a big page title, Store-card shelves per due window, and
// the same records as a list, a board, a month or a sortable table. Quick add understands
// "chem quiz next wed p2".

import { h, icon, clamp, store as local, debounce, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { parse } from '../nlp.js';
import { pageFrame } from './frame.js';
import { segment } from '../ui/segment.js';
import { flipRender, capture, play } from '../motion/flip.js';
import { motion } from '../motion/animate.js';
import { springs } from '../motion/spring.js';
import { drag, rubberband, project } from '../motion/gesture.js';
import { btn, more, dot, shelf, card, pills, dropdown, field, check, emptyState, twoTone, tint } from '../ui/kit.js';
import { toast } from '../ui/toast.js';
import { itemCard } from './home.js';

const VIEWS = [['list', 'List'], ['board', 'Board'], ['calendar', 'Month'], ['table', 'Table']];

export function createPlanner(app) {
  const st = {
    view: VIEWS.some(([v]) => v === local('term.planner.view3')) ? local('term.planner.view3') : 'list',
    kind: 'all',
    subject: '',
    q: '',
    showDone: false,
    month: new Date(M.today().getFullYear(), M.today().getMonth(), 1),
    selected: M.ymd(M.today()),
    sort: { key: 'due', dir: 1 },
  };
  const f = pageFrame({ id: 'planner', title: 'Planner', sub: 'Tests, homework and tasks in one place.' });
  const viewSeg = segment({ label: 'View', value: st.view, options: VIEWS.map(([value, label]) => ({ value, label })), onChange: (v) => setView(v) });
  f.setControls(viewSeg);

  // quick add
  const qa = field({ id: 'quick-add', label: 'Add something — try “bio test next fri p3”' });
  const qInput = qa.input;
  qInput.setAttribute('enterkeyhint', 'done');
  const qParsed = h('p.qa-parsed');
  const qAdd = btn('Add', () => quickAdd(), { size: 'elevated' });
  const qMore = more('Add with details', (e) => openDetails(e.currentTarget));
  qInput.addEventListener('input', () => renderParsed());
  qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } });

  const kindPills = h('div');
  const subjectBox = h('div.pl-subject');
  const search = field({ id: 'planner-search', label: 'Search', type: 'search', onInput: debounce((v) => { st.q = v.trim(); renderContent(); }, 120) });
  const notice = h('p.pl-notice');
  const content = h('div.pl-content');

  f.body.append(
    h('div.wrap.qa', null, h('div.qa-row', null, qa, qAdd), h('div.qa-under', null, qParsed, qMore)),
    h('div.wrap.pl-filters', null, kindPills, h('div.pl-filter-fields', null, subjectBox, search)),
    h('div.wrap', null, notice),
    content);

  function defaults() {
    return { kind: st.kind === 'all' ? 'homework' : st.kind, subjectId: st.subject || null };
  }

  // ---------- quick add ----------

  function renderParsed() {
    const v = qInput.value.trim();
    if (!v) { fill(qParsed, h('span.t-3', { text: 'Type a subject, what it is and when. Return adds it.' })); return; }
    const r = parse(v);
    const s = M.subject(r.subjectId);
    const kind = M.KINDS.find((k) => k.value === r.kind)?.label;
    fill(qParsed, 
      s ? h('span.qa-bit', null, dot(s.color, 'dot-sm'), ` ${s.name}`) : null,
      h('span.qa-bit', { text: r.type || kind }),
      h('span.qa-bit', { text: r.due ? M.relDay(r.due, { long: true }) : 'No date' }),
      r.at ? h('span.qa-bit', { text: r.at }) : null,
      h('span.qa-bit.qa-title', { text: `“${r.title || 'Untitled'}”` }));
  }
  function itemFromParse(text) {
    const r = parse(text);
    return { id: db.newId(), kind: r.kind, type: r.type, title: r.title || 'Untitled', subjectId: r.subjectId, due: r.due, at: r.at, status: 'todo', topics: [], notes: '', created: Date.now() };
  }
  function quickAdd() {
    const v = qInput.value.trim();
    if (!v) { qInput.focus(); return; }
    const it = itemFromParse(v);
    db.saveDoc('items', it);
    qInput.value = '';
    renderParsed();
    toast(`Added “${it.title}”${it.due ? `, due ${M.relDay(it.due)}` : ''}.`, { action: 'Undo', onAction: () => db.removeDoc('items', it.id) });
  }
  function openDetails(origin) {
    const v = qInput.value.trim();
    const pre = v ? itemFromParse(v) : defaults();
    if (v) { qInput.value = ''; renderParsed(); }
    app.openItem(null, pre, origin);
  }

  // ---------- filters ----------

  function renderFilters() {
    fill(kindPills, pills([
      { value: 'all', label: 'All' }, { value: 'assessment', label: 'Assessments' }, { value: 'homework', label: 'Homework' }, { value: 'task', label: 'Tasks' },
    ], st.kind, (v) => { st.kind = v; renderContent(); }));
    const used = new Set(M.allItems().map((i) => i.subjectId).filter(Boolean));
    fill(subjectBox, dropdown({
      id: 'planner-subject', label: 'Subject', value: st.subject,
      options: [{ value: '', label: 'All subjects' }, ...M.subjects().filter((s) => used.has(s.id)).map((s) => ({ value: s.id, label: s.name }))],
      onChange: (v) => { st.subject = v; renderContent(); },
    }));
    const ex = M.allItems().filter((i) => i.example).length;
    notice.hidden = !ex;
    fill(notice, h('span', { text: `${ex} example item${ex === 1 ? '' : 's'} show what the planner can do. ` }), more('Remove examples', removeExamples));
  }
  function removeExamples() {
    const ex = M.allItems().filter((i) => i.example);
    for (const i of ex) db.removeDoc('items', i.id);
    toast(`Removed ${ex.length} examples.`, { action: 'Undo', onAction: () => ex.forEach((i) => db.saveDoc('items', i)) });
  }

  function filtered() {
    const q = st.q.toLowerCase();
    return M.allItems().filter((i) => (st.kind === 'all' || i.kind === st.kind) && (!st.subject || i.subjectId === st.subject)
      && (!q || [i.title, i.type, i.notes, M.subject(i.subjectId)?.name, ...(i.topics || []).map((t) => t.t)].some((x) => (x || '').toLowerCase().includes(q))));
  }

  // ---------- content ----------

  function renderContent(viewChanged = false) {
    viewSeg.set(st.view);
    const items = filtered();
    if (!items.length && st.view !== 'calendar') {
      fill(content, h('div.wrap', null, emptyState({
        title: st.q ? `No results for “${st.q}”.` : 'Nothing planned.',
        text: st.q ? 'Try a subject, a type or part of a title.' : 'Type in the box above to add homework, a test or a task.',
      })));
      return;
    }
    if (st.view === 'list') renderList(items);
    else if (st.view === 'board') renderBoard(items);
    else if (st.view === 'calendar') renderCalendar(items);
    else renderTable(items);
    if (viewChanged) motion(content).set({ y: 16, opacity: 0 }).to({ y: 0, opacity: 1 }, springs.snappy);
  }
  function setView(v) {
    st.view = v;
    local('term.planner.view3', v);
    renderContent(true);
  }

  const BUCKET_COPY = {
    overdue: ['Overdue.', 'Catch up on these first.'], today: ['Today.', 'Due before the day is out.'], tomorrow: ['Tomorrow.', 'Get ahead tonight.'],
    week: ['This week.', 'Due before the weekend.'], next: ['Next week.', 'On the horizon.'], later: ['Later.', 'Further out.'],
    someday: ['No date.', 'Whenever you’re ready.'], done: ['Done.', 'Finished and handed in.'],
  };

  function grouped(items) {
    const g = new Map(M.BUCKETS.map(([k]) => [k, []]));
    for (const it of items) g.get(M.bucketOf(it)).push(it);
    for (const [k, list] of g) list.sort(k === 'done' ? (a, b) => (b.doneAt || b.updated || 0) - (a.doneAt || a.updated || 0) : M.sortByDue);
    return g;
  }

  // list (hairline rows, swipe to act)
  function setDone(it, done) {
    db.saveDoc('items', { ...it, status: done ? 'done' : 'todo', doneAt: done ? Date.now() : null });
  }
  function deleteItem(it) {
    db.removeDoc('items', it.id);
    toast(`Deleted “${it.title}”.`, { action: 'Undo', onAction: () => db.saveDoc('items', it) });
  }
  function listRow(it) {
    const s = M.subject(it.subjectId);
    const n = M.dueIn(it);
    const row = h(`div.lrow${M.isDone(it) ? '.is-done' : ''}`, null,
      check({ checked: M.isDone(it), label: `Mark ${it.title} done`, onChange: (v) => setDone(it, v) }),
      h('button.lrow-main', { type: 'button', onclick: (e) => app.openItem(it, null, e.currentTarget) },
        h('span.lrow-eyebrow', { text: [it.type || M.KINDS.find((k) => k.value === it.kind)?.label, it.example ? 'Example' : null].filter(Boolean).join(' · ') }),
        h('span.lrow-title', { text: it.title }),
        h('span.lrow-sub', null, s ? dot(s.color, 'dot-sm') : null, s ? ` ${s.name}` : '', M.topicProgress(it) != null ? ` · ${it.topics.filter((t) => t.done).length}/${it.topics.length} topics` : '')),
      h('span.lrow-due', null,
        h('strong', { text: it.due ? M.relDay(it.due) : '—' }),
        it.due && !M.isDone(it) ? h(`span.${n < 0 ? 'is-late' : n <= 1 ? 'is-soon' : 'is-later'}`, { text: n < 0 ? `${-n}d late` : n === 0 ? 'Today' : `in ${n}d` }) : it.at ? h('span', { text: it.at }) : null));
    const doneBg = h('div.lrow-act.lrow-act-done', null, h('span', { text: M.isDone(it) ? 'Not done' : 'Done' }));
    const delBg = h('div.lrow-act.lrow-act-del', null, h('span', { text: 'Delete' }));
    const wrap = h('div.lrow-wrap', { dataset: { flip: it.id } }, doneBg, delBg, row);
    swipe(wrap, row, doneBg, delBg, () => setDone(it, !M.isDone(it)), () => deleteItem(it));
    return wrap;
  }
  function swipe(wrap, rowEl, leftBg, rightBg, onRight, onLeft) {
    const m = motion(rowEl);
    let W = 1;
    drag(rowEl, {
      axis: 'x', threshold: 10,
      shouldStart: (e) => !e.target.closest('.check'),
      onStart() { W = wrap.offsetWidth; },
      onMove({ dx }) {
        const lim = W * 0.6;
        const x = Math.abs(dx) > lim ? Math.sign(dx) * (lim + rubberband(Math.abs(dx) - lim, W * 0.3)) : dx;
        m.set({ x });
        leftBg.style.opacity = x > 0 ? 1 : 0;
        rightBg.style.opacity = x < 0 ? 1 : 0;
      },
      onEnd({ dx, vx }) {
        const end = dx + project(vx) * 0.25;
        if (Math.abs(end) > W * 0.36) {
          const dir = Math.sign(end);
          m.to({ x: dir * W }, springs.snappy, { velocity: { x: vx } }).then(() => (dir > 0 ? onRight() : onLeft()));
        } else m.to({ x: 0 }, springs.snappy, { velocity: { x: vx } });
      },
    });
  }
  function renderList(items) {
    const g = grouped(items);
    const upcoming = items.filter((i) => i.kind === 'assessment' && !M.isDone(i) && i.due && M.dueIn(i) >= 0).sort(M.sortByDue);
    const showShelf = upcoming.length && !st.q && st.kind !== 'homework' && st.kind !== 'task';
    flipRender(content, () => [showShelf ? shelf({ strong: 'Assessments.', soft: 'Counting down to what’s next.', cards: upcoming.map((it) => itemCard(app, it)) }) : null, h('div.wrap.pl-list', null, ...M.BUCKETS.map(([k]) => {
      const list = g.get(k);
      if (!list.length) return null;
      const collapsed = k === 'done' && !st.showDone;
      return h('section.pl-group', { dataset: { flip: `g-${k}` } },
        h('div.pl-group-head', null, twoTone(BUCKET_COPY[k][0], `${list.length} item${list.length === 1 ? '' : 's'}.`, 'pl-group-title'),
          k === 'done' ? more(collapsed ? 'Show' : 'Hide', () => { st.showDone = !st.showDone; renderContent(); }) : null),
        collapsed ? null : h('div.listcard', null, ...list.map(listRow)));
    }))], { exit: true });
  }

  // board
  const COLS = [['todo', 'To do.'], ['doing', 'In progress.'], ['done', 'Done.']];
  function boardNode(items) {
    return h('div.wrap.board', null, ...COLS.map(([status, label]) => {
      const list = items.filter((i) => (i.status || 'todo') === status).sort(status === 'done' ? (a, b) => (b.doneAt || 0) - (a.doneAt || 0) : M.sortByDue);
      return h('section.board-col', { dataset: { status } },
        h('h3.board-title.two-tone', null, h('span', { text: `${label} ` }), h('span', { text: String(list.length) })),
        h('div.board-cards', null, ...list.map(boardCard), list.length ? null : h('p.board-empty', { text: status === 'doing' ? 'Drag something you’ve started here.' : 'Nothing here.' })));
    }));
  }
  function renderBoard(items) {
    flipRender(content, () => boardNode(items));
  }
  function boardCard(it) {
    const s = M.subject(it.subjectId);
    const c = card({
      flip: it.id, small: true, cls: 'bcard',
      eyebrow: it.type || M.KINDS.find((k) => k.value === it.kind)?.label,
      title: it.title,
      desc: s?.name,
      foot: [h('span', null, h('strong', { text: it.due ? M.relDay(it.due) : 'No date' }))],
      onClick: (e) => app.openItem(it, null, e.currentTarget),
    });
    const m = motion(c);
    let over = null;
    drag(c, {
      axis: 'both', threshold: 5, holdMs: 240,
      onStart() { c.classList.add('is-lifted'); c.style.pointerEvents = 'none'; m.to({ scale: 1.04, rotate: -1 }, springs.quick); },
      onMove({ dx, dy, x, y }) {
        m.set({ x: dx, y: dy });
        const col = document.elementFromPoint(x, y)?.closest('.board-col');
        if (col !== over) { over?.classList.remove('is-over'); over = col; over?.classList.add('is-over'); }
      },
      onEnd({ vx, vy }) {
        c.style.pointerEvents = '';
        over?.classList.remove('is-over');
        const status = over?.dataset.status;
        over = null;
        m.to({ scale: 1, rotate: 0 }, springs.bouncy);
        if (status && status !== (it.status || 'todo')) {
          const before = capture(content);
          db.saveDoc('items', { ...it, status, doneAt: status === 'done' ? Date.now() : null });
          fill(content, boardNode(filtered()));
          play(content, before, { spring: springs.snappy });
        } else m.to({ x: 0, y: 0 }, springs.snappy, { velocity: { x: vx, y: vy } }).then(() => c.classList.remove('is-lifted'));
      },
    });
    return c;
  }

  // month
  function renderCalendar(items) {
    const first = st.month;
    const start = M.startOfWeek(first);
    const byDay = new Map();
    for (const it of items) if (it.due) (byDay.get(it.due) || byDay.set(it.due, []).get(it.due)).push(it);
    const tds = M.ymd(M.today());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = M.addDays(start, i);
      const ds = M.ymd(d);
      const inMonth = d.getMonth() === first.getMonth();
      if (i === 35 && !inMonth) break;
      const its = (byDay.get(ds) || []).sort(M.sortByDue);
      const hol = M.holidayOn(ds);
      cells.push(h(`button.cal-cell${inMonth ? '' : '.is-out'}${ds === tds ? '.is-today' : ''}${ds === st.selected ? '.is-sel' : ''}${hol ? '.is-hol' : ''}`, {
        type: 'button', 'aria-label': `${M.fmtLong(d)}, ${its.length} due`, 'aria-pressed': String(ds === st.selected),
        onclick: () => { st.selected = ds; renderContent(); },
      },
      h('span.cal-num', { text: String(d.getDate()) }),
      h('span.cal-items', null, ...its.slice(0, 3).map((it) => h(`span.cal-item${M.isDone(it) ? '.is-done' : ''}`, null, dot(M.subject(it.subjectId)?.color || 'gray', 'dot-sm'), h('span', { text: it.title }))),
        its.length > 3 ? h('span.cal-more', { text: `${its.length - 3} more` }) : null),
      h('span.cal-dots', null, ...its.slice(0, 4).map((it) => dot(M.subject(it.subjectId)?.color || 'gray', 'dot-sm')))));
    }
    const sel = M.parseYMD(st.selected);
    const dayItems = (byDay.get(st.selected) || []).sort(M.sortByDue);
    const ls = M.lessonsOn(sel).filter((l) => l.subjectId && l.period.kind !== 'reg');
    const ev = M.eventsOn(st.selected);
    const grid = h('div.cal-grid', null, ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('span.cal-dow', { text: d })), ...cells);
    drag(grid, {
      axis: 'x', threshold: 16,
      onMove({ dx }) { motion(grid).set({ x: rubberband(dx, grid.clientWidth * 0.5) }); },
      onEnd({ dx, vx }) {
        if (Math.abs(dx + project(vx) * 0.3) > grid.clientWidth * 0.25) shiftMonth(dx < 0 ? 1 : -1);
        else motion(grid).to({ x: 0 }, springs.snappy, { velocity: { x: vx } });
      },
    });
    fill(content, h('div.wrap.cal-layout', null,
      h('div.cal-card', null,
        h('div.cal-head', null,
          h('h2.t-callout', { text: `${M.MONTHS[first.getMonth()]} ${first.getFullYear()}` }),
          h('div.tt-paddles', null,
            h('button.paddle', { type: 'button', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, icon('left', 16)),
            h('button.paddle', { type: 'button', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, icon('chev', 16)))),
        grid),
      h('aside.cal-agenda', null,
        h('p.t-eyebrow', { text: M.isSchoolDay(sel) ? `Week ${M.weekLetter(sel)} · ${ls.length} lessons` : ev[0]?.title || 'No school' }),
        h('h3.t-callout', { text: M.fmtLong(sel) }),
        ev.length ? h('p.t-reduced.t-2', { text: ev.map((e) => e.title).join(' · ') }) : null,
        dayItems.length ? h('div.listcard.cal-list', null, ...dayItems.map(listRow)) : h('p.t-body.t-2.cal-none', { text: 'Nothing due.' }),
        btn('Add for this day', (e) => app.openItem(null, { ...defaults(), due: st.selected }, e.currentTarget), { variant: 'secondary' }))));
  }
  function shiftMonth(n) {
    st.month = new Date(st.month.getFullYear(), st.month.getMonth() + n, 1);
    const t = M.today();
    st.selected = st.month.getMonth() === t.getMonth() && st.month.getFullYear() === t.getFullYear() ? M.ymd(t) : M.ymd(st.month);
    renderContent();
    const grid = content.querySelector('.cal-grid');
    if (grid) motion(grid).set({ x: n * 60, opacity: 0 }).to({ x: 0, opacity: 1 }, springs.snappy);
  }

  // table
  const TCOLS = [
    ['title', 'Title', (i) => i.title.toLowerCase()],
    ['subject', 'Subject', (i) => M.subject(i.subjectId)?.name || '~'],
    ['type', 'Type', (i) => i.type || i.kind],
    ['due', 'Due', (i) => `${i.due || '9999'}${i.at || ''}`],
    ['status', 'Status', (i) => ['todo', 'doing', 'done'].indexOf(i.status || 'todo')],
    ['score', 'Result', (i) => M.scorePct(i) ?? -1],
  ];
  function renderTable(items) {
    const col = TCOLS.find((c) => c[0] === st.sort.key) || TCOLS[3];
    const sorted = [...items].sort((a, b) => { const x = col[2](a); const y = col[2](b); return (x < y ? -1 : x > y ? 1 : 0) * st.sort.dir; });
    const statusLabel = (s) => M.STATUSES.find((x) => x.value === (s || 'todo')).label;
    const table = h('table.dbtable', null,
      h('thead', null, h('tr', null, ...TCOLS.map(([k, label]) => h('th', { scope: 'col', 'aria-sort': st.sort.key === k ? (st.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
        h('button.th-btn', { type: 'button', onclick: () => { st.sort = { key: k, dir: st.sort.key === k ? -st.sort.dir : 1 }; renderContent(); } },
          label, st.sort.key === k ? icon('down', 11, st.sort.dir > 0 ? '' : 'flip-y') : null))))),
      h('tbody', null, ...sorted.map((it) => {
        const s = M.subject(it.subjectId);
        const pct = M.scorePct(it);
        return h('tr', { dataset: { flip: it.id } },
          h('td.td-title', null, h('button.td-link', { type: 'button', onclick: (e) => app.openItem(it, null, e.currentTarget), text: it.title }), it.example ? h('span.tag.tag-example', { text: ' Example' }) : null),
          h('td', null, s ? h('span.td-subj', null, dot(s.color, 'dot-sm'), ` ${s.short || s.name}`) : '—'),
          h('td', { text: it.type || M.KINDS.find((k) => k.value === it.kind)?.label }),
          h('td.td-num', { text: it.due ? `${M.fmtShort(M.parseYMD(it.due))}${it.at ? ` · ${it.at}` : ''}` : '—' }),
          h('td', null, h(`button.td-status.st-${it.status || 'todo'}`, {
            type: 'button', title: 'Change status',
            onclick: () => { const o = ['todo', 'doing', 'done']; const nx = o[(o.indexOf(it.status || 'todo') + 1) % 3]; db.saveDoc('items', { ...it, status: nx, doneAt: nx === 'done' ? Date.now() : null }); },
          }, statusLabel(it.status))),
          h('td.td-num', { text: pct != null ? `${it.score}/${it.max} · ${Math.round(pct)}%${it.grade ? ` · ${it.grade}` : ''}` : it.grade || '—' }));
      })));
    flipRender(content, () => h('div.wrap', null, h('div.table-card', null, table)));
  }

  return {
    id: 'planner', el: f.el, art: f.art,
    orb: () => ({ label: 'Add', aria: 'Add to planner', onClick: () => app.openQuickAdd() }),
    update() { renderFilters(); renderParsed(); renderContent(); },
    minute() {},
    setOptions({ kind, view } = {}) {
      if (kind) { st.kind = kind; if (st.view === 'board') st.view = 'list'; }
      if (view && VIEWS.some(([v]) => v === view)) st.view = view;
    },
    onKey(e) { if (e.key === 'a') { e.preventDefault(); qInput.focus(); } },
  };
}
