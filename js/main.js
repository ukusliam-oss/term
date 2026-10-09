// Term — the shell: apple.com's global nav (kept on screen, dark over a dark hero, light elsewhere),
// a tab bar on phones so every page is one tap away, search and quick-add flyouts, the global
// footer, keyboard shortcuts, the clock and the offline app shell.

import { h, icon, fill } from './ui/dom.js';
import { installSpringCSS } from './motion/spring.js';
import { setReducedMotion } from './motion/animate.js';
import * as db from './store.js';
import { S } from './store.js';
import * as M from './model.js';
import { initModals, closeTop, modalOpen, askConfirm } from './ui/sheet.js';
import { initToasts, toast } from './ui/toast.js';
import { initSearch, openSearch, openQuickAdd, closeSearch, flyoutOpen } from './ui/search.js';
import { cvar } from './ui/kit.js';
import { createHome } from './views/home.js';
import { createTimetable } from './views/timetable.js';
import { createPlanner } from './views/planner.js';
import { createSchool } from './views/school.js';
import { createSettings } from './views/settings.js';
import { createFocus } from './views/focus.js';
import { openItemEditor } from './views/editor.js';
import { openLessonSheet, openDaySheet, openSubjectSheet, openEventEditor, pickSubject, openWeekPicker, openBellTimes } from './views/sheets.js';

const TABS = [
  { id: 'home', label: 'Home', icon: 'house', key: '1' },
  { id: 'timetable', label: 'Timetable', icon: 'timetable', key: '2' },
  { id: 'planner', label: 'Planner', icon: 'planner', key: '3' },
  { id: 'school', label: 'School', icon: 'school', key: '4' },
  { id: 'settings', label: 'Settings', icon: 'gear', key: '5' },
];

installSpringCSS();
const root = document.getElementById('app');
root.removeAttribute('aria-busy');
fill(root);

const app = {
  current: null,
  views: {},
  dirty: new Set(),
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
  openFocus: (sid) => focus.open(sid),
  openPalette: () => toggleSearch(),
  openQuickAdd: () => openQuickAdd(app),
  importFile,
};

// ---------- global nav ----------

const focus = createFocus(app);
const curtain = h('div.gn-curtain');
const navLinks = TABS.map((t) => h('button.gn-link', { type: 'button', onclick: () => go(t.id) }, t.label));
const timerItem = h('li.gn-item.gn-item-timer', { hidden: true }, focus.pill);
const gn = h('header.gn', null, h('nav.gn-content', { 'aria-label': 'Global' }, h('ul.gn-list', null,
  h('li.gn-item.gn-item-brand', null, h('button.gn-link.gn-brand', { type: 'button', 'aria-label': 'Term home', onclick: () => go('home') }, h('span.gn-mark', { 'aria-hidden': 'true' }), 'Term')),
  ...navLinks.map((b) => h('li.gn-item.gn-item-page', null, b)),
  timerItem,
  h('li.gn-item', null, h('button.gn-link.gn-icon', { type: 'button', 'aria-label': 'Search', title: 'Search (⌘K)', onclick: () => toggleSearch() }, icon('search', 16))),
  h('li.gn-item', null, h('button.gn-link.gn-icon', { type: 'button', 'aria-label': 'Add', title: 'Add (N)', onclick: () => openQuickAdd(app) }, icon('plus', 17))))));

const tabButtons = TABS.map((t) => h('button.tab', { type: 'button', onclick: () => go(t.id) }, icon(t.icon, 24), h('span', { text: t.label })));
const tabbar = h('nav.tabbar', { 'aria-label': 'Pages' }, ...tabButtons);

function toggleSearch() {
  openSearch({
    quick: [
      { title: 'This week’s timetable', run: () => go('timetable') },
      { title: 'Upcoming assessments', run: () => go('planner', { kind: 'assessment' }) },
      { title: 'Homework due soon', run: () => go('planner', { kind: 'homework' }) },
      { title: 'Start focus', run: () => app.openFocus() },
      { title: 'Change this week’s A/B letter', run: () => app.openWeekPicker() },
    ],
    sources: searchSources,
  });
}

// ---------- footer ----------

const crumb = h('span');
const syncEl = h('span.gf-sync');
const owner = h('span');
const dir = (title, links) => h('div.gf-col', null, h('p.gf-col-title', { text: title }), ...links.map(([l, fn]) => h('button', { type: 'button', onclick: fn, text: l })));
const footer = h('footer.gf', null, h('div.gf-content', null,
  h('div.gf-notes', null,
    h('p', { text: 'Week letters follow the A/B cycle set in Settings. A week that is entirely a holiday pauses the cycle when that option is on.' }),
    h('p', { text: 'Signed in, your planner syncs between devices and keeps working offline. Add Term to your Home Screen from the Share menu to open it like an app.' })),
  h('nav.gf-crumbs', { 'aria-label': 'Breadcrumbs' }, h('button', { type: 'button', onclick: () => go('home'), text: 'Term' }), icon('chev', 10), crumb),
  h('nav.gf-directory', { 'aria-label': 'Directory' },
    dir('Home', [['Today', () => go('home')], ['Focus', () => app.openFocus()]]),
    dir('Timetable', [['This week', () => go('timetable')], ['Edit timetable', () => go('timetable', { edit: true })], ['Bell times', () => app.openBellTimes()]]),
    dir('Planner', [['List', () => go('planner', { view: 'list' })], ['Board', () => go('planner', { view: 'board' })], ['Month', () => go('planner', { view: 'calendar' })], ['Table', () => go('planner', { view: 'table' })]]),
    dir('School', [['Subjects', () => go('school')], ['Results', () => go('school', { section: 'results' })], ['Term dates', () => go('school', { section: 'term' })]]),
    dir('Account', [['Sign in and sync', () => go('settings', { section: 'account' })], ['This week’s letter', () => app.openWeekPicker()], ['Backups', () => go('settings', { section: 'data' })]])),
  h('div.gf-mini', null, h('div.gf-legal', null, owner), syncEl)));

const stage = h('main#stage.stage');
root.append(gn, curtain, stage, footer, tabbar);
initSearch(root, curtain);
initModals(root);
initToasts(root);

app.views = {
  home: createHome(app),
  timetable: createTimetable(app),
  planner: createPlanner(app),
  school: createSchool(app),
  settings: createSettings(app),
};
for (const v of Object.values(app.views)) stage.append(v.el);

// The nav goes dark while it sits over Home's dark hero, as apple.com's does over dark pages.
const heroWatch = new IntersectionObserver(([e]) => document.body.classList.toggle('nav-dark', app.current === 'home' && e.isIntersecting), { rootMargin: '-44px 0px 0px 0px' });
heroWatch.observe(app.views.home.hero);

// ---------- routing ----------

function go(id, opts = {}) {
  if (!app.views[id]) id = 'home';
  closeSearch(true);
  const next = app.views[id];
  next.setOptions?.(opts);
  if (id === app.current) {
    next.update();
    if (!opts.section) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const prev = app.views[app.current];
  if (prev) prev.el.hidden = true;
  app.current = id;
  try { history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
  next.el.hidden = false;
  next.update();
  app.dirty.delete(id);
  next.el.classList.remove('is-entering');
  void next.el.offsetWidth;
  next.el.classList.add('is-entering');
  if (!opts.section) window.scrollTo(0, 0);
  document.body.classList.toggle('nav-dark', id === 'home' && window.scrollY < app.views.home.hero.offsetHeight - 44);
  const tab = TABS.find((t) => t.id === id);
  navLinks.forEach((b, i) => (TABS[i].id === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  tabButtons.forEach((b, i) => (TABS[i].id === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  crumb.textContent = tab.label;
  document.title = id === 'home' ? 'Term' : `${tab.label} · Term`;
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
    ...TABS.map((t) => ({ title: t.label, sub: 'Page', run: () => go(t.id) })),
    { title: 'Add to planner', sub: 'Action', keywords: 'new homework test task assessment', run: () => openQuickAdd(app) },
    { title: 'Start focus', sub: 'Action', keywords: 'timer pomodoro study', run: () => app.openFocus() },
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
  const tab = TABS.find((t) => t.key === e.key);
  if (tab) { go(tab.id); return; }
  if (e.key === '/') { e.preventDefault(); toggleSearch(); }
  else if (e.key === 'n') { e.preventDefault(); openQuickAdd(app); }
  else if (e.key === 'f') { e.preventDefault(); app.openFocus(); }
  else app.views[app.current]?.onKey?.(e);
});

// ---------- data ----------

function applySettings() {
  const r = document.documentElement.style;
  const a = S.settings.accent || 'blue';
  if (a === 'blue') ['--blue', '--blue-hover', '--blue-active', '--link'].forEach((k) => r.removeProperty(k));
  else {
    const c = cvar(a);
    r.setProperty('--blue', c);
    r.setProperty('--blue-hover', `color-mix(in srgb, ${c} 92%, white)`);
    r.setProperty('--blue-active', `color-mix(in srgb, ${c} 88%, black)`);
    r.setProperty('--link', `color-mix(in oklab, ${c}, black 18%)`);
  }
  setReducedMotion(S.settings.reduceMotion);
}
function paintChrome() {
  const s = db.syncLabel();
  syncEl.className = `gf-sync ${s.tone}`;
  fill(syncEl, h('span.gf-sync-dot'), ` ${s.text}`);
  owner.textContent = [S.settings.name ? `Term for ${S.settings.name}` : 'Term', S.settings.school, S.auth.user?.email].filter(Boolean).join(' · ');
  focus.paintPill();
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
}, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) app.views[app.current]?.update(); });

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
paintChrome();
const start = location.hash.slice(1);
go(app.views[start] ? start : 'home');
db.init();
