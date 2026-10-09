// Settings, laid out like an Apple account page: each section's title and explanation on the left,
// its controls on a grey panel to the right.

import { h, isPhone, fill } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { pageFrame } from './frame.js';
import { field, tiles, checkbox, more, kbd, btn } from '../ui/kit.js';
import { skin, removeSkin } from '../skin.js';
import { askConfirm } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function createSettings(app) {
  const f = pageFrame({ id: 'settings', title: 'Settings', sub: 'Account, sync, your timetable and how Term looks.' });
  const skinInput = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true });
  skinInput.addEventListener('change', () => { const file = skinInput.files?.[0]; skinInput.value = ''; if (file) app.importSkin(file); });
  const root = h('div.wrap.settings');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => importFile());
  f.body.append(h('div.section.section-tight', null, root), fileInput, skinInput);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  void jump;

  let quietUntil = 0;
  let later = 0;
  root.addEventListener('pointerdown', () => (quietUntil = Date.now() + 900), true);
  root.addEventListener('keydown', () => (quietUntil = Date.now() + 900), true);

  function update() {
    const a = document.activeElement;
    if (a && root.contains(a) && a.matches('input:not([type=checkbox]):not([type=file])')) return;
    const wait = quietUntil - Date.now();
    if (wait > 0) { clearTimeout(later); later = setTimeout(update, wait); return; }
    fill(root, ...build());
  }

  function section(id, title, desc, ...controls) {
    return h('section.set-section', { id },
      h('div.set-intro', null, h('h2.set-title', { text: title }), desc ? h('p.set-desc', { text: desc }) : null),
      h('div.set-panel', null, ...controls));
  }

  function build() {
    const mon = M.startOfWeek(M.isWeekday(M.today()) ? M.today() : M.addDays(M.today(), 2));
    const sync = db.syncLabel();
    const ex = M.allItems().filter((i) => i.example).length;
    const first = (L) => M.lessonPeriods().slice(0, 3).map((p) => M.subject(S.timetable?.cells?.[M.cellKey(L, 1, p.id)])?.short).filter(Boolean).join(', ');
    const nameField = field({ id: 'set-name', label: 'Name', value: S.settings.name || '', onChange: (v) => db.saveSettings({ name: v.trim() }) });
    const schoolField = field({ id: 'set-school', label: 'School', value: S.settings.school || '', onChange: (v) => db.saveSettings({ school: v.trim() }) });

    return [
      accountSection(sync),

      section('set-profile', 'Profile', 'Your name appears on Home. The school name labels the timetable.',
        h('div.field-row.stack-sm', null, nameField, schoolField)),

      section('set-timetable', 'Timetable', `Tell Term which week ${M.fmtRange(mon, M.addDays(mon, 4))} is; every other week alternates from there.`,
        h('p.panel-label', { text: 'This week is' }),
        tiles({
          label: 'This week is', value: M.weekLetter(mon), cols: 2,
          options: ['A', 'B'].map((L) => ({ value: L, label: `Week ${L}`, sub: first(L) ? `Monday: ${first(L)}…` : '' })),
          onChange: (L) => { db.saveSettings({ anchorMonday: M.ymd(mon), anchorWeek: L }); toast(`${M.fmtRange(mon, M.addDays(mon, 4))} is Week ${L}.`); },
        }),
        h('div.panel-gap'),
        checkbox({ id: 'set-pause', label: 'Holiday weeks pause the A/B cycle', sub: 'A week that’s entirely a holiday doesn’t count towards A or B.', checked: S.settings.pauseOnHolidays, onChange: (v) => db.saveSettings({ pauseOnHolidays: v }) }),
        h('div.panel-links', null,
          more('Bell times', (e) => app.openBellTimes(e.currentTarget)),
          more('Edit the timetable', () => app.go('timetable', { edit: true })),
          more('Term dates', () => app.go('school', { section: 'term' })))),

      section('set-appearance', 'Appearance', 'Term wears your CleanMyMac skin: its renders, icons and colours. The skin file is made on your Mac from your own copy of CleanMyMac and stays on this device. Reduce motion shows the renders still.',
        h('p.panel-label', { text: skin.has ? 'CleanMyMac skin installed' : 'No skin on this device yet' }),
        h('div.panel-links', null,
          more(skin.has ? 'Replace the skin file' : 'Install the skin file (term-skin.zip)', () => skinInput.click()),
          skin.has ? more('Remove the skin', async () => { await removeSkin(); toast('Skin removed.'); }, 'more-danger') : null),
        h('div.panel-gap'),
        checkbox({ id: 'set-motion', label: 'Reduce motion', checked: S.settings.reduceMotion, onChange: (v) => db.saveSettings({ reduceMotion: v }) })),

      section('set-data', 'Data', 'Back up everything as a file, export the planner for a spreadsheet, or restore a backup.',
      h('div.panel-links', null,
        more('Export a backup (.json)', () => exportBackup()),
        more('Export the planner (.csv)', () => exportCSV()),
        more('Restore from a backup', () => fileInput.click()),
        ex ? more(`Remove ${ex} example item${ex === 1 ? '' : 's'}`, () => removeExamples()) : null),
      h('div.panel-gap'),
      more('Erase all data', () => erase(), 'more-danger')),

      isPhone() ? null : section('set-keys', 'Keyboard', 'Shortcuts work anywhere outside a text field.',
        h('div.hlist.hlist-flush', null, ...[
          ['Search', '⌘ K'], ['New item', 'N'], ['Today, Timetable, Planner, School, Focus, Settings', '1 – 6'],
          ['Previous or next week', '← →'], ['Jump to today (Timetable)', 'T'], ['Edit the timetable', 'E'], ['Quick add (Planner)', 'A'], ['Focus timer', 'F'], ['Close', 'esc'],
        ].map(([l, k]) => h('div.hrow', null, h('span.hrow-main', null, h('span.hrow-title.t-regular', { text: l })), kbd(k))))),
    ];
  }

  function accountSection(sync) {
    const status = h('p.set-sync', null, h(`span.gf-sync.${sync.tone}`, null, h('span.gf-sync-dot'), ` ${sync.text}`));
    if (!S.auth.configured) {
      return section('set-account', 'Account', 'Sync isn’t switched on for this site yet, so your planner stays on this device. Export a backup below to move it.', status);
    }
    if (S.auth.user) {
      return section('set-account', 'Account', 'Signed in. Your planner syncs to every phone and computer where you sign in with this account, and keeps working offline.',
        h('p.panel-label', { text: S.auth.user.email }), status,
        h('div.panel-links', null, more('Sign out', async () => {
          if (!(await askConfirm({ title: 'Sign out?', message: 'Your planner stays in your account. This device will show an empty planner until you sign in again.', confirm: 'Sign out' }))) return;
          await db.signOut();
          toast('Signed out.');
        })));
    }
    const email = field({ id: 'acct-email', label: 'Email', type: 'email' });
    const pw = field({ id: 'acct-pw', label: 'Password', type: 'password' });
    email.input.autocomplete = 'username';
    pw.input.autocomplete = 'current-password';
    const msg = h('p.block-note');
    const go = async (mode) => {
      const e = email.input.value.trim();
      const p = pw.input.value;
      if (!e || p.length < 6) { msg.textContent = 'Enter your email and a password of at least 6 characters.'; return; }
      msg.textContent = mode === 'in' ? 'Signing in…' : 'Creating your account…';
      try {
        await (mode === 'in' ? db.signIn(e, p) : db.signUp(e, p));
        toast(mode === 'in' ? 'Signed in. Syncing your planner.' : 'Account created. Your planner now syncs.');
      } catch (err) {
        msg.textContent = /invalid login/i.test(err.message || '') ? 'That email and password don’t match. Check them, or create an account.' : err.message || 'Couldn’t sign in. Check your connection.';
      }
    };
    pw.input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go('in'); });
    return section('set-account', 'Account', 'Sign in to keep this planner in sync between your phone and laptop. Use the same email and password on each device.',
      h('div.field-stack', null, email, pw), msg,
      h('div.button-group.button-group-left', null, btn('Sign in', () => go('in'), { size: 'elevated' }), btn('Create account', () => go('up'), { size: 'elevated', variant: 'secondary' })));
  }

  async function save(filename, data) {
    const d = S.caps.downloads;
    if (!d) {
      try {
        const a = h('a', { href: URL.createObjectURL(new Blob([data])), download: filename });
        document.body.append(a);
        a.click();
        a.remove();
      } catch { toast('Saving files isn’t available here.', { tone: 'error' }); }
      return;
    }
    try {
      await d.save({ filename, data });
      toast(`Saved ${filename}.`);
    } catch (e) {
      if (e?.code !== 'declined') toast('The file couldn’t be saved.', { tone: 'error' });
    }
  }
  function exportBackup() {
    save(`term-backup-${M.ymd(new Date())}.json`, JSON.stringify(db.backup(), null, 2));
  }
  function exportCSV() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Title', 'Subject', 'Kind', 'Type', 'Due', 'Time', 'Status', 'Score', 'Out of', 'Grade', 'Notes']];
    for (const i of M.allItems().sort(M.sortByDue)) rows.push([i.title, M.subject(i.subjectId)?.name || '', i.kind, i.type || '', i.due || '', i.at || '', i.status || 'todo', i.score ?? '', i.max ?? '', i.grade || '', i.notes || '']);
    save(`term-planner-${M.ymd(new Date())}.csv`, rows.map((r) => r.map(esc).join(',')).join('\r\n'));
  }
  async function importFile() {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('That file isn’t valid JSON.', { tone: 'error' }); return; }
    const n = Object.keys(obj?.docs || {}).length;
    if (!(await askConfirm({ title: 'Restore this backup?', message: `${file.name} has ${n} records. It replaces your current timetable and planner.`, confirm: 'Restore', destructive: true }))) return;
    try { db.restore(obj); toast(`Restored ${n} records.`); } catch (e) { toast(e.message || 'Couldn’t restore that file.', { tone: 'error' }); }
  }
  function removeExamples() {
    const ex = M.allItems().filter((i) => i.example);
    for (const i of ex) db.removeDoc('items', i.id);
    toast(`Removed ${ex.length} examples.`, { action: 'Undo', onAction: () => ex.forEach((i) => db.saveDoc('items', i)) });
  }
  async function erase() {
    if (!(await askConfirm({ title: 'Erase everything?', message: 'Your timetable, planner, term dates and study log will be deleted on every device. Export a backup first if you might want them back.', confirm: 'Erase', destructive: true }))) return;
    db.eraseAll();
    toast('All data erased.');
  }

  return {
    id: 'settings', el: f.el, art: f.art, update, minute() {},
    setOptions({ section } = {}) { if (section) setTimeout(() => document.getElementById(`set-${section}`)?.scrollIntoView({ block: 'start' }), 60); },
  };
}
