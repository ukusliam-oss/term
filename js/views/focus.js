// Focus: the timer, and its module page. CleanMyMac's round button is the timer itself here — Start,
// then a ring that fills as the session runs (as the Scan button's ring does while it scans).
// Finished minutes are logged per day and subject.

import { h, store as local, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { tiles, btn } from '../ui/kit.js';
import { toast } from '../ui/toast.js';
import { pageFrame } from './frame.js';
import { play as sound } from '../sound.js';

const KEY = 'term.focus.v1';
const DEFAULT = { status: 'idle', subjectId: null, minutes: 25, endAt: 0, remainMs: 0 };

/** The timer engine, shared by the Focus page, Today and the round button. */
export function createFocus() {
  let st = { ...DEFAULT, ...(local(KEY) || {}) };
  let wake = null;
  const subs = new Set();
  const emit = (structural) => subs.forEach((fn) => fn(structural));
  const save = () => local(KEY, st);

  const remaining = () => (st.status === 'running' ? Math.max(0, st.endAt - Date.now()) : st.status === 'paused' ? st.remainMs : st.minutes * 60000);
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const progress = () => (st.status === 'idle' ? 0 : 1 - remaining() / (st.minutes * 60000));

  async function lock(on) {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen');
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { wake = null; }
  }
  function set(next) { st = { ...st, ...next }; save(); emit(true); }
  const start = (subjectId) => { set({ status: 'running', subjectId: subjectId === undefined ? st.subjectId : subjectId, endAt: Date.now() + st.minutes * 60000 }); lock(true); };
  const pause = () => { set({ status: 'paused', remainMs: remaining() }); lock(false); };
  const resume = () => { set({ status: 'running', endAt: Date.now() + st.remainMs }); lock(true); };
  function stop() {
    const done = Math.floor((st.minutes * 60000 - remaining()) / 60000);
    if (done >= 1) {
      db.logFocus(M.ymd(new Date()), st.subjectId, done);
      toast(`Logged ${done} minute${done === 1 ? '' : 's'}${M.subject(st.subjectId) ? ` of ${M.subject(st.subjectId).name}` : ''}.`);
    }
    set({ ...DEFAULT, subjectId: st.subjectId, minutes: st.minutes });
    lock(false);
  }
  function complete() {
    const s = M.subject(st.subjectId);
    db.logFocus(M.ymd(new Date()), st.subjectId, st.minutes);
    toast(`Focus complete. ${st.minutes} minutes${s ? ` of ${s.name}` : ''}.`, { duration: 6000 });
    sound('scan-finished');
    set({ ...DEFAULT, subjectId: st.subjectId, minutes: st.minutes });
    lock(false);
  }
  /** The round button's one action. */
  function toggle() {
    if (st.status === 'idle') start();
    else if (st.status === 'running') pause();
    else resume();
  }

  setInterval(() => {
    if (st.status === 'running' && remaining() <= 0) complete();
    if (st.status !== 'idle') emit(false);
  }, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.status === 'running') lock(true); });

  return {
    get state() { return st; },
    get running() { return st.status !== 'idle'; },
    set, start, pause, resume, stop, toggle, remaining, progress, fmt,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/** The Focus module page. */
export function createFocusPage(app, focus) {
  const f = pageFrame({ id: 'focus', title: 'Focus', sub: 'Pick a subject and a length. The minutes are logged when you finish.' });
  const subjBox = h('section.focus-block');
  const lenBox = h('section.focus-block');
  const stats = h('section.focus-block');
  f.body.append(h('div.wrap.focus-page', null, subjBox, lenBox, stats));

  function paintHead() {
    const st = focus.state;
    const s = M.subject(st.subjectId);
    if (st.status === 'idle') {
      f.setTitle('Focus');
      f.setSub(`${s ? s.name : 'General study'} · ${st.minutes} minutes. The minutes are logged when you finish.`);
      f.setControls();
    } else {
      f.setTitle(focus.fmt(focus.remaining()), true);
      f.setSub(st.status === 'paused' ? `Paused · ${s ? s.name : 'General study'}` : `${s ? s.name : 'General study'} · ends ${new Date(st.endAt).toTimeString().slice(0, 5)}`);
      if (!f.controls.childElementCount) f.setControls(btn('Stop and log', () => focus.stop(), { ico: 'stop' }));
    }
  }

  function update() {
    paintHead();
    const st = focus.state;
    const idle = st.status === 'idle';
    fill(subjBox, h('h3.block-head', null, 'Subject. ', h('span', { text: idle ? 'What are you studying?' : 'Locked while the timer runs.' })),
      tiles({
        label: 'Subject', value: st.subjectId, cols: 4, compact: true,
        options: [{ value: null, label: 'General', disabled: !idle }, ...M.subjects().filter((x) => x.kind !== 'pastoral').map((x) => ({ value: x.id, label: x.short || x.name, color: x.color, disabled: !idle }))],
        onChange: (v) => focus.set({ subjectId: v }),
      }));
    fill(lenBox, h('h3.block-head', null, 'Length. ', h('span', { text: 'Minutes per session.' })),
      tiles({
        label: 'Length', value: st.minutes, cols: 4, compact: true,
        options: [15, 25, 45, 60].map((m) => ({ value: m, label: `${m} min`, disabled: !idle })),
        onChange: (v) => focus.set({ minutes: v }),
      }));
    const days = Array.from({ length: 7 }, (_, i) => M.addDays(M.today(), i - 6));
    const vals = days.map((d) => S.focus.get(M.ymd(d))?.total || 0);
    const max = Math.max(30, ...vals);
    const today = vals[6];
    fill(stats, h('h3.block-head', null, 'This week. ', h('span', { text: `${today} minute${today === 1 ? '' : 's'} today, ${vals.reduce((a, b) => a + b, 0)} in the last seven days.` })),
      h('div.study-chart-card', null, h('div.weekbars', null, ...days.map((d, i) => h(`div.weekbar${i === 6 ? '.is-today' : ''}`, null,
        h('span.weekbar-val', { text: vals[i] ? String(vals[i]) : '' }),
        h('i', { style: { height: `${Math.max(3, (vals[i] / max) * 150)}px` } }),
        h('span.weekbar-day', { text: M.DAY_SHORT[d.getDay()] }))))));
  }

  focus.subscribe((structural) => {
    if (f.el.hidden) return;
    if (structural) update(); else paintHead();
  });

  return {
    id: 'focus', el: f.el, art: f.art, update, minute() {},
    setOptions(o = {}) { if (o.subjectId && focus.state.status === 'idle') focus.set({ subjectId: o.subjectId }); },
    orb() {
      const st = focus.state;
      if (st.status === 'idle') return { label: 'Start', onClick: () => focus.start() };
      return { label: st.status === 'paused' ? 'Resume' : 'Pause', progress: focus.progress(), onClick: () => focus.toggle() };
    },
  };
}
