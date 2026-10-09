// Home. A dark apple.com hero — what's on now or next, two buttons, and a live 3D product shot —
// then everything a school day needs on one screen: lessons, what's due, the next assessment,
// what to pack and focus time. Below that, a Store shelf of the next two weeks.

import { h, fill, icon, store as local } from '../ui/dom.js';
import { S } from '../store.js';
import * as db from '../store.js';
import * as M from '../model.js';
import { btn, more, dot, card, shelf, progress, check } from '../ui/kit.js';

const SUBJECT_HEX = { red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', mint: '#00c7be', teal: '#30b0c7', cyan: '#32ade6', blue: '#007aff', indigo: '#5856d6', purple: '#af52de', pink: '#ff2d55', brown: '#a2845e', gray: '#8e8e93' };

export function createHome(app) {
  const eyebrow = h('p.hero-eyebrow');
  const title = h('h1.hero-title');
  const sub = h('p.hero-sub');
  const ctas = h('div.button-group.hero-ctas');
  const stage = h('div.hero-stage', { role: 'button', tabindex: '0', 'aria-label': 'This week’s letter. Drag to see next week; press to open the timetable.' }, h('span.hero-fallback'));
  const capWeek = h('p.hero-cap-week');
  const capHint = h('p.hero-cap-hint');
  const caption = h('div.hero-caption', null, capWeek, capHint);
  const hero = h('section.hero.on-dark', null, h('div.hero-copy', null, eyebrow, title, sub, ctas), stage, caption);
  const notice = h('div.wrap.home-notice');
  const todayHead = h('div.today-head');
  const lessons = h('article.panel.panel-lessons');
  const due = h('article.panel.panel-due');
  const nextA = h('article.panel.panel-next');
  const pack = h('article.panel.panel-pack');
  const focus = h('article.panel.panel-focus');
  const today = h('section.section.today', { id: 'home-today' },
    notice,
    h('div.wrap', null, todayHead, h('div.today-grid', null, lessons, due, h('div.today-side', null, nextA, pack, focus))));
  const shelfBox = h('div.home-shelf');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => app.importFile(fileInput));
  const el = h('section.view.view-home', { id: 'view-home', hidden: true, 'aria-label': 'Home' }, hero, today, shelfBox, fileInput);

  let three = null;
  let threeLoading = false;
  let scene = null;
  let weekIdx = 0;
  let live = null;
  let liveKey = '';

  function ensure3D() {
    if (three || threeLoading) return;
    threeLoading = true;
    import('../hero3d.js').then(({ createHero3D }) => {
      three = createHero3D(stage, {
        onFlip: (i) => { weekIdx = i; renderCaption(); },
        onTap: (i) => app.go('timetable', { monday: M.addDays(heroMonday(), 7 * i) }),
      });
      if (scene) three.set(scene);
    }).catch((e) => { console.warn('[term] 3D unavailable', e); stage.classList.add('is-fallback'); });
  }
  // The hero object shows this week's letter; turned over, next week's.
  // …for the week the headline is about: today's, or the next school day's once today is done.
  function heroMonday() {
    const now = new Date();
    const day = M.isSchoolDay(now) && M.status(now).state !== 'after' ? M.today() : M.nextSchoolDay(now) || M.today();
    return M.startOfWeek(day);
  }
  function setScene(tint) {
    const mon = heroMonday();
    const letters = [M.weekLetter(mon), M.weekLetter(M.addDays(mon, 7))];
    scene = { letters, tint };
    stage.querySelector('.hero-fallback').textContent = letters[weekIdx];
    stage.style.setProperty('--glow', tint);
    three?.set(scene);
    renderCaption();
  }
  function renderCaption() {
    if (!S.timetable) { fill(capWeek); fill(capHint); return; }
    const mon = M.addDays(heroMonday(), 7 * weekIdx);
    const fri = M.addDays(mon, 4);
    const L = M.weekLetter(mon);
    const due = M.allItems().filter((i) => !M.isDone(i) && i.due && i.due >= M.ymd(mon) && i.due <= M.ymd(fri)).length;
    const off = Math.round(M.daysBetween(M.startOfWeek(M.today()), mon) / 7);
    const which = off === 0 ? 'This week' : off === 1 ? 'Next week' : 'The week after';
    fill(capWeek,
      h('span.hero-cap-strong', { text: `${which} is Week ${L}.` }),
      ` ${M.fmtRange(mon, fri)} · ${due ? `${due} due` : 'nothing due yet'}.`);
    fill(capHint,
      h('span', { text: weekIdx ? 'Drag it back, or tap it for that week’s timetable. ' : 'Drag the letter to see the week after, or tap it for the timetable. ' }),
      weekIdx ? null : h('button.more', { type: 'button', onclick: () => app.openWeekPicker() }, h('span', { text: `Not Week ${L}?` }), icon('chev', 12)));
  }

  function update() {
    const now = new Date();
    renderHero(now);
    renderNotice();
    renderToday(now);
    renderShelf();
    if (!el.hidden) ensure3D();
  }

  // ---------- hero ----------

  function renderHero(now) {
    const st = M.status(now);
    liveKey = `${st.state}:${st.current?.key || st.next?.key || ''}`;
    live = null;
    const name = (S.settings.name || '').split(' ')[0];

    if (st.state === 'empty') {
      eyebrow.textContent = S.ready ? 'Welcome' : '';
      title.textContent = S.ready ? 'Term.' : ' ';
      sub.textContent = S.ready ? 'Your timetable, homework and tests in one place. Bring in your timetable to begin.' : 'Loading your planner…';
      fill(ctas, S.ready ? btn('Import timetable file', () => fileInput.click(), { size: 'elevated' }) : null,
        S.ready ? btn('Start from scratch', () => app.go('timetable'), { size: 'elevated', variant: 'secondary' }) : null);
      setScene('#0071e3');
      return;
    }

    const hex = (s) => SUBJECT_HEX[s?.color] || '#8e8e93';
    if (st.state === 'lesson') {
      const c = st.current;
      const mins = () => Math.ceil(M.status(new Date()).remain ?? 0);
      eyebrow.textContent = `Now · ${c.period.label}`;
      title.textContent = c.subject.name;
      sub.textContent = `${c.room ? `${c.room}, ` : ''}until ${c.period.end}. ${mins()} minutes left.`;
      fill(ctas, btn('View lesson', (e) => app.openLesson(c, e.currentTarget), { size: 'elevated' }), homeworkBtn(c.subjectId));
      setScene(hex(c.subject));
      live = () => { sub.textContent = `${c.room ? `${c.room}, ` : ''}until ${c.period.end}. ${mins()} minute${mins() === 1 ? '' : 's'} left.`; };
      return;
    }
    const n = st.state === 'break' || st.state === 'before' ? st.next : st.next;
    if (!n) {
      eyebrow.textContent = M.fmtLong(now);
      title.textContent = `${M.greeting(now)}${name ? `, ${name}` : ''}.`;
      sub.textContent = 'Nothing on the timetable ahead.';
      fill(ctas, btn('Open timetable', () => app.go('timetable'), { size: 'elevated' }));
      return;
    }
    const sameDay = n.date === M.ymd(now);
    const when = sameDay ? `at ${M.fromMin(n.start)}` : `${M.relDay(n.date, { long: true })} at ${M.fromMin(n.start)}`;
    eyebrow.textContent = st.state === 'break' ? `${st.label} · back at ${M.fromMin(n.start)}`
      : st.state === 'before' ? `${M.greeting(now)}${name ? `, ${name}` : ''}`
        : st.state === 'holiday' ? st.holiday.title
          : st.state === 'weekend' ? 'Weekend' : st.state === 'after' ? 'School’s out' : 'No lessons today';
    title.textContent = n.subject.name;
    sub.textContent = `${sameDay ? 'Next' : 'First'}, ${when}${n.room ? ` in ${n.room}` : ''}. Week ${n.letter}.`;
    fill(ctas,
      sameDay ? btn('View lesson', (e) => app.openLesson(n, e.currentTarget), { size: 'elevated' })
        : btn(`${M.DAY_LONG[M.parseYMD(n.date).getDay()]}’s lessons`, (e) => app.openDay(M.parseYMD(n.date), e.currentTarget), { size: 'elevated' }),
      homeworkBtn(n.subjectId));
    setScene(hex(n.subject));
  }

  function homeworkBtn(subjectId) {
    return btn('Add homework', (e) => {
      const l = M.nextLesson(new Date(), subjectId);
      app.openItem(null, { kind: 'homework', subjectId, due: l?.date, at: l ? M.fromMin(l.start) : null }, e.currentTarget);
    }, { size: 'elevated', variant: 'secondary' });
  }

  function renderNotice() {
    const show = S.auth.configured && S.mode === 'local' && S.ready;
    notice.hidden = !show;
    if (show) fill(notice, h('p.notice-bar', null, icon('cloud', 16), h('span', { text: 'You’re not signed in, so this planner lives on this device only. ' }), more('Sign in to sync', () => app.go('settings', { section: 'account' }))));
  }

  // ---------- today ----------

  function renderToday(now) {
    if (!S.timetable) { fill(todayHead); fill(lessons); fill(due); fill(nextA); fill(pack); fill(focus); today.hidden = true; return; }
    today.hidden = false;
    const st = M.status(now);
    const day = M.isSchoolDay(now) && st.state !== 'after' ? M.startOfDay(now) : M.nextSchoolDay(now);
    const isToday = day && M.ymd(day) === M.ymd(now);
    fill(todayHead,
      h('h2.today-title.two-tone', null, h('span', { text: isToday ? 'Today. ' : day ? `${M.DAY_LONG[day.getDay()]}. ` : 'Today. ' }),
        h('span', { text: day ? `${isToday ? M.fmtLong(day) : `${day.getDate()} ${M.MONTHS[day.getMonth()]}`} · Week ${M.weekLetter(day)}` : M.fmtLong(now) })));

    // lessons
    const m = M.minutesOf(now);
    const ls = day ? M.lessonsOn(day).filter((l) => l.subjectId) : [];
    fill(lessons,
      h('div.panel-head', null, h('h3.panel-title', { text: 'Lessons' }), more('Timetable', () => app.go('timetable'))),
      ls.length ? h('ul.rows', null, ...ls.map((l) => {
        const cur = isToday && m >= l.start && m < l.end;
        const past = isToday && m >= l.end;
        const dueHere = M.dueForLesson(l).filter((i) => !M.isDone(i));
        return h('li', null, h(`button.row${cur ? '.is-now' : ''}${past ? '.is-past' : ''}${l.cancelled ? '.is-cancelled' : ''}${l.period.kind === 'reg' ? '.is-minor' : ''}`, {
          type: 'button', onclick: (e) => app.openLesson(l, e.currentTarget),
        },
        h('span.row-time', { text: l.period.start }),
        h('span.row-main', null,
          h('span.row-title', null, dot(l.subject.color, 'dot-sm'), h('span', { text: l.subject.name })),
          h('span.row-sub', { text: [l.cancelled ? 'Cancelled' : l.room, dueHere.length ? `${dueHere[0].type || 'Homework'} due` : '', l.note ? 'Note' : ''].filter(Boolean).join(' · ') })),
        cur ? h('span.row-now', { text: 'Now' }) : null));
      })) : h('p.panel-empty', { text: 'No lessons.' }));

    // due
    const d1 = M.nextSchoolDay(M.today());
    const d2 = d1 ? M.nextSchoolDay(d1) : null;
    const horizon = M.ymd(d2 || M.addDays(M.today(), 2));
    const items = M.allItems().filter((i) => i.kind !== 'assessment' && i.due && i.due <= horizon && (!M.isDone(i) || (i.doneAt && Date.now() - i.doneAt < 4000))).sort(M.sortByDue);
    fill(due,
      h('div.panel-head', null, h('h3.panel-title', { text: 'Due soon' }), more('Add', (e) => app.openQuickAdd(e.currentTarget))),
      items.length ? h('ul.rows', null, ...items.map((it) => {
        const s = M.subject(it.subjectId);
        const n = M.dueIn(it);
        return h('li', null, h(`div.row.row-task${M.isDone(it) ? '.is-done' : ''}`, null,
          check({ checked: M.isDone(it), label: `Mark ${it.title} done`, onChange: (v) => {
            db.saveDoc('items', { ...it, status: v ? 'done' : 'todo', doneAt: v ? Date.now() : null });
            if (v) setTimeout(() => app.refresh('home'), 4100);
          } }),
          h('button.row-main', { type: 'button', onclick: (e) => app.openItem(it, null, e.currentTarget) },
            h('span.row-title', null, h('span', { text: it.title })),
            h('span.row-sub', { text: [s?.short || s?.name, M.dueText(it)].filter(Boolean).join(' · ') })),
          !M.isDone(it) ? h(`span.row-when${n < 0 ? '.is-late' : n <= 1 ? '.is-soon' : ''}`, { text: n < 0 ? 'Late' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : M.DAY_SHORT[M.parseYMD(it.due).getDay()] }) : null));
      })) : h('p.panel-empty', null, `Nothing due by ${M.relDay(horizon, { long: true })}. `, more('Add something', (e) => app.openQuickAdd(e.currentTarget))));

    // next assessment
    const a = M.allItems().filter((i) => i.kind === 'assessment' && !M.isDone(i) && i.due && M.dueIn(i) >= 0).sort(M.sortByDue)[0];
    if (a) {
      const s = M.subject(a.subjectId);
      const n = M.dueIn(a);
      const tp = M.topicProgress(a);
      fill(nextA,
        h('div.panel-head', null, h('h3.panel-title', { text: `Next ${(a.type || 'assessment').toLowerCase()}` }), more('All', () => app.go('planner', { kind: 'assessment' }))),
        h('button.next-body', { type: 'button', onclick: (e) => app.openItem(a, null, e.currentTarget) },
          h('span.next-count', null, h('span.next-num', { text: String(n) }), h('span.next-unit', { text: n === 0 ? 'today' : n === 1 ? 'day' : 'days' })),
          h('span.next-text', null,
            h('span.next-title', { text: a.title }),
            h('span.row-sub', null, s ? dot(s.color, 'dot-sm') : null, ` ${[s?.name, `${M.relDay(a.due)}${a.at ? ` ${a.at}` : ''}`].filter(Boolean).join(' · ')}`))),
        tp != null ? h('div.next-progress', null, progress(tp), h('span.row-sub', { text: `${a.topics.filter((t) => t.done).length} of ${a.topics.length} topics ready` })) : null);
    } else {
      fill(nextA, h('div.panel-head', null, h('h3.panel-title', { text: 'Assessments' })), h('p.panel-empty', null, 'None coming up. ', more('Add one', (e) => app.openItem(null, { kind: 'assessment' }, e.currentTarget))));
    }

    // pack
    const target = M.isSchoolDay(now) && st.state === 'before' ? M.startOfDay(now) : M.nextSchoolDay(now);
    if (target) {
      const ds = M.ymd(target);
      const tl = M.lessonsOn(target).filter((l) => l.subjectId && !l.cancelled);
      const kit = new Map();
      for (const l of tl) for (const k of l.subject?.kit || []) if (!kit.has(k)) kit.set(k, l.subject);
      const handIn = M.allItems().filter((i) => i.due === ds && !M.isDone(i) && i.kind !== 'assessment');
      const key = `term.pack.${ds}`;
      const ticked = new Set(local(key) || []);
      const entries = [...[...kit].map(([k, s]) => ({ id: `kit:${k}`, label: k, sub: s.short || s.name })), ...handIn.map((i) => ({ id: `hand:${i.id}`, label: i.title, sub: `Hand in · ${M.subject(i.subjectId)?.short || ''}` }))];
      const when = ds === M.ymd(now) ? 'today' : M.daysBetween(now, target) === 1 ? 'tomorrow' : M.DAY_LONG[target.getDay()];
      fill(pack,
        h('div.panel-head', null, h('h3.panel-title', { text: `Pack for ${when}` })),
        entries.length ? h('ul.rows', null, ...entries.map((e) => h('li', null, h('div.row.row-task', null,
          check({ checked: ticked.has(e.id), label: `Packed ${e.label}`, onChange: (v) => { v ? ticked.add(e.id) : ticked.delete(e.id); local(key, [...ticked]); } }),
          h('span.row-main', null, h('span.row-title', null, h('span', { text: e.label })), h('span.row-sub', { text: e.sub }))))))
          : h('p.panel-empty', { text: 'Nothing extra to bring. Add kit to a subject in School and it shows up here.' }));
    } else fill(pack);

    // focus
    const mins = S.focus.get(M.ymd(now))?.total || 0;
    fill(focus,
      h('div.panel-head', null, h('h3.panel-title', { text: 'Focus' })),
      h('div.focus-row', null,
        h('span.focus-big', null, h('span.next-num', { text: String(mins) }), h('span.next-unit', { text: 'min today' })),
        btn('Start', () => app.openFocus(), { variant: 'neutral' })));
  }

  // ---------- shelf ----------

  function renderShelf() {
    const end = M.ymd(M.addDays(M.today(), 14));
    const items = M.allItems().filter((i) => !M.isDone(i) && i.due && i.due <= end).sort(M.sortByDue);
    if (!items.length) { fill(shelfBox); return; }
    fill(shelfBox, shelf({ strong: 'Coming up.', soft: 'Everything due in the next two weeks.', after: more('Planner', () => app.go('planner')), cards: items.map((it) => itemCard(app, it)) }));
  }

  return {
    id: 'home', el, update,
    tick(now) {
      const st = M.status(now);
      if (`${st.state}:${st.current?.key || st.next?.key || ''}` !== liveKey) update();
      else live?.(now);
    },
    minute: update,
    hero,
  };
}

/** A planner item as a Store card. Shared with the Planner. */
export function itemCard(app, it) {
  const s = M.subject(it.subjectId);
  const n = M.dueIn(it);
  const kind = M.KINDS.find((k) => k.value === it.kind)?.label;
  return card({
    flip: it.id,
    cls: `${M.isDone(it) ? 'is-done' : ''} u-${M.urgency(it)}`.trim(),
    eyebrow: it.example ? `${it.type || kind} · Example` : it.type || kind,
    title: it.title,
    desc: [s?.name, it.topics?.length ? `${it.topics.filter((x) => x.done).length} of ${it.topics.length} topics ready` : null].filter(Boolean).join(' · '),
    foot: [
      h('span', null, h('strong', { text: it.due ? M.relDay(it.due, { long: true }) : 'No date' }), it.at ? ` ${it.at}` : ''),
      it.due && !M.isDone(it) ? h(`span.card-dday${n < 0 ? '.is-late' : n <= 1 ? '.is-soon' : ''}`, { text: n < 0 ? `${-n}d late` : n === 0 ? 'Today' : `${n} day${n === 1 ? '' : 's'}` }) : null,
    ],
    color: s?.color,
    onClick: (e) => app.openItem(it, null, e.currentTarget),
  });
}

