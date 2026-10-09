// Term — the shell, built the way CleanMyMac 5's window is: the module's aurora fills everything
// (js/stage.js), a sidebar with no fill of its own lists the modules with their small renders, the
// page opens with its glass object, and one round button at the bottom does the page's main thing.
// On phones the sidebar becomes a tab bar with the round button sitting in its middle.

import { h, icon, fill, svg, store as local } from './ui/dom.js';
import { installSpringCSS } from './motion/spring.js';
import { setReducedMotion } from './motion/animate.js';
import * as db from './store.js';
import { S } from './store.js';
import * as M from './model.js';
import { initModals, closeTop, modalOpen, askConfirm } from './ui/sheet.js';
import { initToasts, toast } from './ui/toast.js';
import { initSearch, openSearch, openQuickAdd, closeSearch, flyoutOpen } from './ui/search.js';
import { initSky, setModule, iconOf } from './stage.js';
import { skin, loadSkin, importSkin } from './skin.js';
import { play as sound, setSounds } from './sound.js';
import { createHome } from './views/home.js';
import { createTimetable } from './views/timetable.js';
import { createPlanner } from './views/planner.js';
import { createSchool } from './views/school.js';
import { createSettings } from './views/settings.js';
import { createFocus, createFocusPage } from './views/focus.js';
import { openItemEditor } from './views/editor.js';
import { openLessonSheet, openDaySheet, openSubjectSheet, openEventEditor, pickSubject, openWeekPicker, openBellTimes } from './views/sheets.js';

const MODS = [
  { id: 'home', label: 'Today', key: '1', tab: true, glyph: 'house' },
  { id: 'timetable', label: 'Timetable', key: '2', tab: true, glyph: 'timetable' },
  { id: 'planner', label: 'Planner', key: '3', tab: true, glyph: 'planner' },
  { id: 'school', label: 'School', key: '4', tab: true, glyph: 'school' },
  { id: 'focus', label: 'Focus', key: '5', glyph: 'timer' },
  { id: 'settings', label: 'Settings', key: '6', bottom: true, glyph: 'gear' },
];
const modOf = (id) => MODS.find((m) => m.id === id);

installSpringCSS();
setReducedMotion(!!local('term.settings.reduceMotion'));
const root = document.getElementById('app');
root.removeAttribute('aria-busy');
fill(root);

const focus = createFocus();
const app = {
  current: null,
  views: {},
  dirty: new Set(),
  focus,
  go,
  toast,
  refresh(id) { if (id === app.current) app.views[id]?.update(); else app.dirty.add(id); },
  openItem: (item, prefill, origin) => openItemEditor(app, item, prefill, origin),
  openLesson: (l, origin) => openLessonSheet(app, l, origin),
  openDay: (d, origin) => openDaySheet(app, d, origin),
  openSubject: (id, origin) => openSubjectSheet(app, id, origin),
  openEvent: (e, origin) => openEventEditor(app, e, origin),
  pickSubject: (cur, origin, sub) => pickSubject(app, cur, origin, sub),
  openWeekPicker: () => openWeekPicker(app),
  openBellTimes: () => openBellTimes(app),
  openFocus: (subjectId) => go('focus', { subjectId }),
  openPalette: () => toggleSearch(),
  openQuickAdd: () => openQuickAdd(app),
  importFile,
  paintOrb: () => paintOrb(),
};

// ---------- the window ----------

const skyCanvas = h('canvas.sky', { 'aria-hidden': 'true' });
document.body.prepend(skyCanvas);
initSky(skyCanvas);

// Module icons: CleanMyMac's sidebar renders from the skin (coloured when current, silver
// otherwise, as in its sidebar), or a line glyph without one.
const iconSlots = [];
function moduleIcon(m) {
  const img = h('img.sb-img', { alt: '', 'aria-hidden': 'true' });
  const el = h('span.sb-icon', null, img, icon(m.glyph, 22, 'sb-glyph'));
  iconSlots.push({ id: m.id, img });
  return el;
}
function paintIcons() {
  document.documentElement.classList.toggle('has-skin', skin.has);
  for (const { id, img } of iconSlots) {
    const src = iconOf(id, id === app.current ? 'side-on' : 'side-off');
    if (img.getAttribute('src') !== src) img.src = src;
  }
}

const sbItems = {};
const sbBadges = {};
const sbItem = (m) => {
  const badge = h('span.sb-badge');
  sbBadges[m.id] = badge;
  const b = h('button.sb-item', { type: 'button', title: `${m.label} (${m.key})`, onclick: () => go(m.id) }, moduleIcon(m), h('span', { text: m.label }), badge);
  sbItems[m.id] = b;
  return b;
};
// CleanMyMac's sidebar is only its modules, with the extra one (Assistant there, Settings here)
// pinned to the bottom.
const sbSel = h('span.sb-sel', { 'aria-hidden': 'true' });
const sidebar = h('aside.sidebar', { 'aria-label': 'Modules' }, sbSel,
  h('nav.sb-list', null, ...MODS.filter((m) => !m.bottom).map(sbItem)),
  h('div.sb-bottom', null, ...MODS.filter((m) => m.bottom).map(sbItem)));

const tabButtons = {};
const tabs = MODS.filter((m) => m.tab);
const tabbar = h('nav.tabbar', { 'aria-label': 'Modules' },
  ...tabs.slice(0, 2).map(tabBtn), h('span.tab.is-gap', { 'aria-hidden': 'true' }), ...tabs.slice(2).map(tabBtn));
function tabBtn(m) {
  const b = h('button.tab', { type: 'button', onclick: () => go(m.id) }, moduleIcon(m), h('span', { text: m.label }));
  tabButtons[m.id] = b;
  return b;
}
const phoneActions = h('div.corner-actions', null,
  h('button.round-btn', { type: 'button', 'aria-label': 'Search', title: 'Search (⌘K)', onclick: () => toggleSearch() }, icon('search', 18)),
  h('button.round-btn.only-phone', { type: 'button', 'aria-label': 'Settings', onclick: () => go('settings') }, icon('gear', 18)));

// the round button
const R = 52;
const prog = svg('circle', { class: 'orb-prog', cx: 50, cy: 50, r: R, 'stroke-dasharray': String(2 * Math.PI * R), 'stroke-dashoffset': String(2 * Math.PI * R) });
const ring = svg('svg', { class: 'orb-ring', viewBox: '-4 -4 108 108', 'aria-hidden': 'true' }, svg('circle', { class: 'orb-track', cx: 50, cy: 50, r: R }), prog);
const orbLabel = h('span.orb-label');
const orb = h('button.orb', { type: 'button', hidden: true }, h('span.orb-halo', { 'aria-hidden': 'true' }), h('span.orb-core', { 'aria-hidden': 'true' }), ring, orbLabel);
let orbAction = null;
orb.addEventListener('click', () => orbAction?.());
// CleanMyMac's button clicks: one sound on press, one on release
orb.addEventListener('pointerdown', () => { orb.classList.add('is-pressed'); sound('down'); });
const orbUp = (e) => { if (!orb.classList.contains('is-pressed')) return; orb.classList.remove('is-pressed'); if (e.type === 'pointerup') sound('up'); };
orb.addEventListener('pointerup', orbUp);
orb.addEventListener('pointerleave', orbUp);
orb.addEventListener('pointercancel', orbUp);

const curtain = h('div.gn-curtain');
const stage = h('main.main', { id: 'stage' });
const dock = h('div.orb-dock', { 'aria-hidden': 'true' });
root.append(sidebar, stage, tabbar, phoneActions, orb, dock, curtain);
initSearch(root, curtain);
initModals(root);
initToasts(root);

app.views = {
  home: createHome(app),
  timetable: createTimetable(app),
  planner: createPlanner(app),
  school: createSchool(app),
  focus: createFocusPage(app, focus),
  settings: createSettings(app),
};
for (const v of Object.values(app.views)) stage.append(v.el);

/** Slide the sidebar's highlight to the current row. */
function moveSelection(instant = false) {
  const b = sbItems[app.current];
  if (!b || !sidebar.getClientRects().length) return;
  const y = b.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
  if (instant) sbSel.style.transition = 'none';
  sbSel.style.transform = `translateY(${y}px)`;
  if (instant) { void sbSel.offsetWidth; sbSel.style.transition = ''; }
}
addEventListener('resize', () => moveSelection(true));

function toggleSearch() {
  openSearch({
    quick: [
      { title: 'This week’s timetable', run: () => go('timetable') },
      { title: 'Upcoming assessments', run: () => go('planner', { kind: 'assessment' }) },
      { title: 'Homework due soon', run: () => go('planner', { kind: 'homework' }) },
      { title: 'Start focus', run: () => { go('focus'); focus.start(); } },
      { title: 'Change this week’s A/B letter', run: () => app.openWeekPicker() },
    ],
    sources: searchSources,
  });
}

// ---------- the round button ----------

function paintOrb() {
  const view = app.views[app.current];
  let spec = view?.orb?.() || null;
  // A running session takes over the button on Today, as the scan ring does in CleanMyMac.
  if (focus.running && app.current === 'home') spec = { label: focus.state.status === 'paused' ? 'Paused' : 'Focus', time: focus.fmt(focus.remaining()), progress: focus.progress(), onClick: () => go('focus') };
  orb.hidden = !spec;
  if (!spec) { orbAction = null; return; }
  orbAction = spec.onClick;
  orb.setAttribute('aria-label', spec.aria || spec.label);
  const time = spec.time || (spec.progress != null && app.current === 'focus' ? focus.fmt(focus.remaining()) : null);
  const key = `${spec.label}|${time || ''}`;
  if (orbLabel.dataset.key !== key) {
    orbLabel.dataset.key = key;
    fill(orbLabel, time ? h('span.num', { text: time }) : null, time ? h('small', { text: spec.label }) : spec.label);
  }
  orb.classList.toggle('has-progress', spec.progress != null);
  if (spec.progress != null) prog.setAttribute('stroke-dashoffset', String(2 * Math.PI * R * (1 - Math.min(1, Math.max(0, spec.progress)))));
}
focus.subscribe((structural) => {
  paintOrb();
  paintBadges();
  if (structural) app.views.focus.art.scan(focus.state.status === 'running');
});

// ---------- routing ----------

function go(id, opts = {}) {
  if (!app.views[id]) id = 'home';
  closeSearch(true);
  const next = app.views[id];
  next.setOptions?.(opts);
  const m = modOf(id);
  if (id === app.current) {
    next.update();
    paintOrb();
    if (!opts.section) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const prev = app.views[app.current];
  if (prev) prev.el.hidden = true;
  app.current = id;
  try { history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
  next.el.hidden = false;
  setModule(id);
  next.update();
  app.dirty.delete(id);
  // the entrance plays once, on arrival — not again whenever the page re-renders
  next.el.classList.remove('is-entering');
  void next.el.offsetWidth;
  next.el.classList.add('is-entering');
  clearTimeout(go.entering);
  go.entering = setTimeout(() => next.el.classList.remove('is-entering'), 1400);
  if (!opts.section) window.scrollTo(0, 0);
  next.art?.intro();
  paintIcons();
  for (const [k, b] of Object.entries(sbItems)) k === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  moveSelection();
  for (const [k, b] of Object.entries(tabButtons)) k === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  document.title = id === 'home' ? 'Term' : `${m.label} · Term`;
  paintOrb();
}
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (app.views[id] && id !== app.current) go(id);
});

// ---------- search ----------

function searchSources() {
  const items = M.allItems().sort(M.sortByDue).map((i) => {
    const s = M.subject(i.subjectId);
    return { title: i.title, sub: [s?.short || s?.name, i.type, M.dueText(i)].filter(Boolean).join(' · '), keywords: `${s?.name || ''} ${i.type || ''} ${i.kind}`, color: s?.color, run: () => app.openItem(i) };
  });
  const subjects = M.subjects().map((s) => ({ title: s.name, sub: [s.room, `${M.lessonsPerCycle(s.id)} lessons a fortnight`].filter(Boolean).join(' · '), keywords: `${s.short} ${s.teacher || ''}`, color: s.color, run: () => app.openSubject(s.id) }));
  const events = [...S.events.values()].map((e) => ({ title: e.title, sub: M.fmtShort(M.parseYMD(e.start)), run: () => app.openEvent(e) }));
  const pages = [
    ...MODS.map((t) => ({ title: t.label, sub: 'Page', run: () => go(t.id) })),
    { title: 'Add to planner', sub: 'Action', keywords: 'new homework test task assessment', run: () => openQuickAdd(app) },
    { title: 'Start focus', sub: 'Action', keywords: 'timer pomodoro study', run: () => { go('focus'); focus.start(); } },
    { title: 'Edit timetable', sub: 'Action', keywords: 'lessons periods', run: () => go('timetable', { edit: true }) },
    { title: 'Add a term date', sub: 'Action', keywords: 'holiday half term exams event', run: () => app.openEvent(null) },
    { title: 'Bell times', sub: 'Action', keywords: 'periods start end', run: () => app.openBellTimes() },
    { title: 'Sign in', sub: 'Account', keywords: 'sync login account', run: () => go('settings', { section: 'account' }) },
  ];
  return [{ group: 'Planner', items }, { group: 'Subjects', items: subjects }, { group: 'Term dates', items: events }, { group: 'Pages and actions', items: pages }];
}

// ---------- import ----------

async function importFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('That file isn’t a Term file.', { tone: 'error' }); return; }
  const n = Object.keys(obj?.docs || {}).length;
  const hasData = S.timetable || S.items.size;
  if (hasData && !(await askConfirm({ title: 'Replace your planner?', message: `${file.name} has ${n} records and replaces what’s here.`, confirm: 'Replace', destructive: true }))) return;
  try { db.restore(obj); toast(`Imported ${n} records.`); } catch (e) { toast(e.message || 'Couldn’t import that file.', { tone: 'error' }); }
}

// ---------- keyboard ----------

window.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleSearch(); return; }
  if (e.key === 'Escape') { if (modalOpen()) closeTop(); else closeSearch(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || modalOpen() || flyoutOpen()) return;
  const m = MODS.find((t) => t.key === e.key);
  if (m) { go(m.id); return; }
  if (e.key === '/') { e.preventDefault(); toggleSearch(); }
  else if (e.key === 'n') { e.preventDefault(); openQuickAdd(app); }
  else if (e.key === 'f') { e.preventDefault(); go('focus'); }
  else app.views[app.current]?.onKey?.(e);
});

// ---------- data ----------

function applySettings() {
  setReducedMotion(S.settings.reduceMotion);
  setSounds(S.settings.sounds !== false);
  local('term.settings.reduceMotion', !!S.settings.reduceMotion);
}
function paintBadges() {
  const horizon = M.ymd(M.addDays(M.today(), 1));
  const due = M.allItems().filter((i) => !M.isDone(i) && i.due && i.due <= horizon).length;
  sbBadges.planner.textContent = due ? String(due) : '';
  const fb = sbBadges.focus;
  fb.classList.toggle('is-timer', focus.running);
  fb.textContent = focus.running ? focus.fmt(focus.remaining()) : '';
}
function paintChrome() {
  paintBadges();
  paintOrb();
}
db.subscribe(() => {
  applySettings();
  paintChrome();
  for (const id of Object.keys(app.views)) {
    if (id === app.current) app.views[id].update();
    else app.dirty.add(id);
  }
});
db.notices.addEventListener('notice', (e) => toast(e.detail.message, { tone: e.detail.tone, duration: 6000 }));

// ---------- clock ----------

let lastMinute = -1;
let lastDay = M.ymd(new Date());
setInterval(() => {
  const now = new Date();
  if (app.current === 'home') app.views.home.tick(now);
  if (now.getMinutes() === lastMinute) return;
  lastMinute = now.getMinutes();
  const day = M.ymd(now);
  if (day !== lastDay) { lastDay = day; for (const v of Object.values(app.views)) v.update(); }
  else app.views[app.current]?.minute?.(now);
  paintBadges();
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) app.views[app.current]?.update(); });

// ---------- the personal skin ----------

skin.onChange(() => {
  paintIcons();
  for (const v of Object.values(app.views)) v.art?.paint();
  app.views[app.current]?.art?.intro();
  app.views[app.current]?.update();
});
app.importSkin = async (file) => {
  try { const n = await importSkin(file); toast(`Skin installed — ${n} files.`); sound('wipe', 0.8); } catch (e) { toast(e.message || 'Couldn’t read that skin file.', { tone: 'error' }); }
};
// Dropping the skin file anywhere on the window installs it.
window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  const f = [...(e.dataTransfer?.files || [])].find((x) => /\.zip$/i.test(x.name));
  if (!f) return;
  e.preventDefault();
  app.importSkin(f);
});

// ---------- offline app shell ----------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return; // first install, not an update
    toast('Term was updated.', { action: 'Reload', duration: 10000, onAction: () => { reloading = true; location.reload(); } });
  });
}

// ---------- boot ----------

try { history.scrollRestoration = 'manual'; } catch { /* ignore */ }

applySettings();
const start = location.hash.slice(1);
go(app.views[start] ? start : 'home');
moveSelection(true);
paintChrome();
loadSkin().then((has) => {
  // On the local dev server, ?devskin installs private/term-skin.zip without the file picker.
  if ((has && (skin.meta?.version || 1) >= 2) || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('devskin')) return;
  fetch('private/term-skin.zip').then((r) => (r.ok ? r.blob() : null)).then((b) => b && app.importSkin(new File([b], 'term-skin.zip'))).catch(() => {});
});
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('devdata')) {
  setTimeout(() => { if (!S.timetable) fetch('private/term-timetable-import.json').then((r) => (r.ok ? r.json() : null)).then((o) => o && db.restore(o)).catch(() => {}); }, 800);
}
db.init();
