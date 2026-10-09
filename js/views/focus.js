// Focus timer. While it runs, a small time readout sits in the global nav (where apple.com keeps
// the bag); it opens the full timer. Finished minutes are logged per day and subject.

import { h, store as local, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { openModal } from '../ui/sheet.js';
import { tiles, btn, progress } from '../ui/kit.js';
import { toast } from '../ui/toast.js';

const KEY = 'term.focus.v1';
const DEFAULT = { status: 'idle', subjectId: null, minutes: 25, endAt: 0, remainMs: 0 };

export function createFocus(app) {
  let st = { ...DEFAULT, ...(local(KEY) || {}) };
  let modal = null;
  let wake = null;
  let paint = () => {};
  const save = () => local(KEY, st);

  const pillTime = h('span.num');
  const pill = h('button.gn-link.gn-timer', { type: 'button', 'aria-label': 'Open focus timer', onclick: () => open() }, h('span.gn-timer-dot'), pillTime);

  const remaining = () => (st.status === 'running' ? Math.max(0, st.endAt - Date.now()) : st.status === 'paused' ? st.remainMs : st.minutes * 60000);
  const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const progressOf = () => 1 - remaining() / (st.minutes * 60000);

  function paintPill() {
    pill.parentElement && (pill.parentElement.hidden = st.status === 'idle');
    pillTime.textContent = st.status === 'paused' ? `Paused ${fmt(remaining())}` : fmt(remaining());
  }
  async function lock(on) {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen');
      if (!on && wake) { await wake.release(); wake = null; }
    } catch { wake = null; }
  }
  function set(next) { st = { ...st, ...next }; save(); paint(true); paintPill(); }
  const start = () => { set({ status: 'running', endAt: Date.now() + st.minutes * 60000 }); lock(true); };
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
    set({ ...DEFAULT, subjectId: st.subjectId, minutes: st.minutes });
    lock(false);
  }

  setInterval(() => {
    if (st.status === 'running' && remaining() <= 0) complete();
    if (st.status !== 'idle') { paintPill(); paint(false); }
  }, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.status === 'running') lock(true); });

  function open(subjectId) {
    if (modal) return;
    if (subjectId && st.status === 'idle') st.subjectId = subjectId;
    modal = openModal({
      eyebrow: 'Focus', title: 'Study, uninterrupted.', lede: 'Pick a subject and a length. The minutes are logged when you finish.', size: 'md',
      onClose: () => { modal = null; paint = () => {}; },
      build(body) {
        const time = h('p.focus-time.num');
        const label = h('p.focus-label');
        const bar = progress(0);
        const controls = h('div.button-group.focus-controls');
        const subjBox = h('section');
        const lenBox = h('section');
        const today = h('p.block-note.focus-today');
        body.append(h('div.focus-dial', null, time, label, bar, controls, today), subjBox, lenBox);
        paint = (structural) => {
          const s = M.subject(st.subjectId);
          time.textContent = fmt(remaining());
          time.classList.toggle('gradient', st.status === 'running');
          label.textContent = st.status === 'paused' ? 'Paused' : st.status === 'running' ? `${s ? s.name : 'General study'} · ends ${new Date(st.endAt).toTimeString().slice(0, 5)}` : s ? s.name : 'General study';
          bar.set(st.status === 'idle' ? 0 : progressOf());
          if (!structural) return;
          const idle = st.status === 'idle';
          fill(controls, ...(idle
            ? [btn('Start', start, { size: 'elevated', ico: 'play' })]
            : [st.status === 'running' ? btn('Pause', pause, { size: 'elevated', variant: 'secondary-neutral' }) : btn('Resume', resume, { size: 'elevated' }), btn('Stop', stop, { size: 'elevated', variant: 'gray' })]));
          fill(subjBox, h('h3.block-head', null, 'Subject. ', h('span', { text: idle ? 'What are you studying?' : 'Locked while the timer runs.' })),
            tiles({
              label: 'Subject', value: st.subjectId, cols: 4, compact: true,
              options: [{ value: null, label: 'General', disabled: !idle }, ...M.subjects().filter((x) => x.kind !== 'pastoral').map((x) => ({ value: x.id, label: x.short || x.name, color: x.color, disabled: !idle }))],
              onChange: (v) => set({ subjectId: v }),
            }));
          fill(lenBox, h('h3.block-head', null, 'Length. ', h('span', { text: 'Minutes per session.' })),
            tiles({
              label: 'Length', value: st.minutes, cols: 4, compact: true,
              options: [15, 25, 45, 60].map((m) => ({ value: m, label: `${m} min`, disabled: !idle })),
              onChange: (v) => set({ minutes: v }),
            }));
          today.textContent = `${S.focus.get(M.ymd(new Date()))?.total || 0} minutes focused today.`;
        };
        paint(true);
      },
    });
  }

  return { open, pill, paintPill, get running() { return st.status !== 'idle'; } };
}

