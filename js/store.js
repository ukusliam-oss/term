// Data layer. Signed in, the source of truth is the Supabase table `docs` (one row per document,
// guarded by row-level security) with live updates over Realtime; signed out, or with no project
// configured, everything stays in this browser. Either way views read the in-memory state S and
// re-render on subscribe(). Writes apply at once, go into a persisted outbox keyed by path (so the
// latest change wins) and drain whenever the network allows — the site works offline.
//
// Documents:
//   term/settings   preferences + A/B anchor
//   term/timetable  periods, breaks, subjects, cells {"A1-p3": subjectId}
//   items/<id>      assessments, homework, tasks
//   events/<id>     holidays, exam weeks, trips
//   lessons/<date>_<period>  per-lesson note / cancelled / room change
//   focus/<date>    minutes studied that day

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LOCAL_KEY = 'term.local.v1';
export const COLLS = ['items', 'events', 'lessons', 'focus'];

export const DEFAULT_SETTINGS = {
  name: '',
  school: '',
  anchorMonday: null,
  anchorWeek: 'A',
  pauseOnHolidays: true,
  accent: 'blue',
  reduceMotion: false,
};

export const S = {
  mode: 'starting', // 'cloud' | 'local'
  online: navigator.onLine,
  pending: 0,
  ready: false,
  readOnly: false,
  version: 0,
  settings: { ...DEFAULT_SETTINGS },
  timetable: null,
  items: new Map(),
  events: new Map(),
  lessons: new Map(),
  focus: new Map(),
  caps: { downloads: null, sample: null },
  auth: { configured: !!(SUPABASE_URL && SUPABASE_KEY), user: null },
};

export const notices = new EventTarget();
const notice = (message, tone = 'error') => notices.dispatchEvent(new CustomEvent('notice', { detail: { message, tone } }));

const subs = new Set();
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
let queued = false;
function changed() {
  S.version++;
  if (queued) return;
  queued = true;
  const flush = () => { queued = false; for (const f of subs) f(); };
  !document.hidden ? requestAnimationFrame(flush) : setTimeout(flush, 0);
}

export function syncLabel() {
  if (S.mode === 'local') return { tone: 'local', text: S.auth.configured ? 'Not signed in · this device only' : 'This device only' };
  if (S.mode === 'starting') return { tone: 'busy', text: 'Connecting…' };
  if (!S.online) return { tone: 'busy', text: S.pending ? `Offline · ${S.pending} change${S.pending === 1 ? '' : 's'} waiting` : 'Offline' };
  if (S.pending) return { tone: 'busy', text: 'Saving…' };
  return { tone: 'ok', text: 'Synced' };
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const withDefaults = (d) => ({ ...DEFAULT_SETTINGS, ...(d || {}) });
export function newId() {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 20); } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}
function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}

// ---------- state <-> documents ----------

function reset() {
  S.settings = { ...DEFAULT_SETTINGS };
  S.timetable = null;
  for (const c of COLLS) S[c] = new Map();
}
function applyDoc(path, d) {
  const [c, id] = path.split('/');
  if (c === 'term' && id === 'settings') S.settings = withDefaults(d);
  else if (c === 'term' && id === 'timetable') S.timetable = d ?? null;
  else if (COLLS.includes(c) && id) d == null ? S[c].delete(id) : S[c].set(id, { ...d, id });
}
function toDocs() {
  const docs = { 'term/settings': S.settings };
  if (S.timetable) docs['term/timetable'] = S.timetable;
  for (const c of COLLS) for (const [id, v] of S[c]) { const { id: _, ...rest } = v; docs[`${c}/${id}`] = rest; }
  return docs;
}
function load(docs) {
  reset();
  for (const [p, d] of Object.entries(docs || {})) applyDoc(p, d);
}

// ---------- backends ----------

let client = null;
let channel = null;
let cacheKey = LOCAL_KEY;
let outboxKey = 'term.outbox.local';
let outbox = {};
let saveTimer = 0;

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJSON(cacheKey, toDocs()), 300);
}

export async function init() {
  window.addEventListener('online', () => { S.online = true; changed(); drain(); });
  window.addEventListener('offline', () => { S.online = false; changed(); });
  setInterval(drain, 30000);
  if (S.auth.configured && !window.supabase) await loadScript('vendor/supabase.js').catch(() => {});
  if (S.auth.configured && window.supabase?.createClient) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'term.auth' } });
    const { data } = await client.auth.getSession();
    client.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id || null;
      if (uid && uid !== S.auth.user?.id) startCloud(session.user);
      else if (!uid && S.mode === 'cloud') startLocal();
    });
    if (data.session?.user) return startCloud(data.session.user);
  }
  startLocal();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = reject;
    document.head.append(el);
  });
}

function startLocal() {
  stopChannel();
  S.mode = 'local';
  S.auth.user = null;
  cacheKey = LOCAL_KEY;
  outboxKey = 'term.outbox.local';
  outbox = {};
  load(readJSON(LOCAL_KEY));
  S.pending = 0;
  S.ready = true;
  changed();
}

async function startCloud(user) {
  stopChannel();
  S.auth.user = { id: user.id, email: user.email };
  S.mode = 'cloud';
  cacheKey = `term.cloud.${user.id}`;
  outboxKey = `term.outbox.${user.id}`;
  outbox = readJSON(outboxKey) || {};
  S.pending = Object.keys(outbox).length;
  const cached = readJSON(cacheKey);
  if (cached) { load(cached); S.ready = true; }
  changed();
  try {
    const { data, error } = await client.from('docs').select('path,data');
    if (error) throw error;
    const remote = Object.fromEntries((data || []).map((r) => [r.path, r.data]));
    const local = readJSON(LOCAL_KEY);
    if (!data.length && local && Object.keys(local).length) {
      // First sign-in on a device that already has a planner: move it into the account.
      load(local);
      for (const [p, d] of Object.entries(local)) outbox[p] = { op: 'set', data: d };
      writeJSON('term.local.v1.moved', local);
      localStorage.removeItem(LOCAL_KEY);
      notice('Your planner on this device was moved into your account.', 'ok');
    } else {
      load(remote);
      for (const [p, o] of Object.entries(outbox)) applyDoc(p, o.op === 'set' ? o.data : null);
    }
    S.ready = true;
    persistSoon();
    changed();
    drain();
  } catch (e) {
    console.warn('[term] load failed', e);
    S.online = false;
    S.ready = true;
    changed();
  }
  channel = client.channel(`docs-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `user_id=eq.${user.id}` }, (p) => {
      const path = p.new?.path || p.old?.path;
      if (!path || outbox[path]) return; // our own change is still on its way; it wins
      applyDoc(path, p.eventType === 'DELETE' ? null : clone(p.new.data));
      persistSoon();
      changed();
    })
    .subscribe((status) => { S.online = status === 'SUBSCRIBED' ? true : S.online; changed(); });
}

function stopChannel() {
  if (channel) { client.removeChannel(channel); channel = null; }
}

let draining = false;
async function drain() {
  if (S.mode !== 'cloud' || draining || !navigator.onLine) return;
  const paths = Object.keys(outbox);
  if (!paths.length) return;
  draining = true;
  try {
    for (const path of paths) {
      const o = outbox[path];
      if (!o) continue;
      const res = o.op === 'set'
        ? await client.from('docs').upsert({ user_id: S.auth.user.id, path, data: o.data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,path' })
        : await client.from('docs').delete().eq('path', path);
      if (res.error) throw res.error;
      if (outbox[path] === o) delete outbox[path];
      writeJSON(outboxKey, outbox);
      S.pending = Object.keys(outbox).length;
      S.online = true;
      changed();
    }
  } catch (e) {
    console.warn('[term] sync paused', e);
    if (e?.code === '42P01') notice('The sync table is missing. Run the setup SQL in Supabase.');
    else if (e?.status === 401 || e?.code === 'PGRST301') notice('Your session ended. Sign in again in Settings.');
    S.online = false;
    changed();
  } finally {
    draining = false;
  }
}

function write(path, op, data) {
  if (S.mode === 'cloud') {
    outbox[path] = { op, data };
    writeJSON(outboxKey, outbox);
    S.pending = Object.keys(outbox).length;
    persistSoon();
    changed();
    queueMicrotask(drain);
  } else {
    persistSoon();
    changed();
  }
}

// ---------- auth ----------

export async function signIn(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('Check your inbox to confirm the address, then sign in.');
}
export async function signOut() {
  await drain();
  await client.auth.signOut();
}

// ---------- writes ----------

const clean = (d) => JSON.parse(JSON.stringify(d));

export function saveDoc(coll, item) {
  const { id, ...data } = item;
  const doc = clean({ ...data, updated: Date.now() });
  S[coll].set(id, { ...doc, id });
  write(`${coll}/${id}`, 'set', doc);
}
export function removeDoc(coll, id) {
  const prev = S[coll].get(id);
  if (!prev) return null;
  S[coll].delete(id);
  write(`${coll}/${id}`, 'del');
  return prev;
}
export function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  write('term/settings', 'set', clean(S.settings));
}
export function saveTimetable(tt) {
  S.timetable = tt;
  write('term/timetable', 'set', clean(tt));
}
export function saveLesson(key, patch) {
  const prev = S.lessons.get(key) || { id: key };
  const next = { ...prev, ...patch, id: key };
  if (!next.note && !next.cancelled && !next.room) return S.lessons.has(key) ? removeDoc('lessons', key) : null;
  return saveDoc('lessons', next);
}
export function logFocus(date, subjectId, minutes) {
  const prev = S.focus.get(date) || { total: 0, by: {}, sessions: 0 };
  const by = { ...(prev.by || {}) };
  const k = subjectId || 'none';
  by[k] = (by[k] || 0) + minutes;
  return saveDoc('focus', { id: date, total: (prev.total || 0) + minutes, by, sessions: (prev.sessions || 0) + 1 });
}

// ---------- backup ----------

export function backup() {
  return { app: 'Term', format: 1, exportedAt: new Date().toISOString(), docs: clean(toDocs()) };
}
export function restore(obj) {
  const docs = obj?.docs;
  if (!docs || typeof docs !== 'object' || obj.app !== 'Term') throw new Error('This file isn’t a Term backup.');
  for (const c of COLLS) for (const id of [...S[c].keys()]) if (!(`${c}/${id}` in docs)) removeDoc(c, id);
  for (const [path, d] of Object.entries(docs)) {
    const [c, id] = path.split('/');
    if (c === 'term' && id === 'settings') saveSettings(d);
    else if (c === 'term' && id === 'timetable') saveTimetable(d);
    else if (COLLS.includes(c) && id && /^[\w\-.~:@+]+$/.test(id)) saveDoc(c, { ...d, id });
  }
}
export function eraseAll() {
  for (const c of COLLS) for (const id of [...S[c].keys()]) removeDoc(c, id);
  S.timetable = null;
  write('term/timetable', 'del');
  S.settings = { ...DEFAULT_SETTINGS };
  write('term/settings', 'del');
}
