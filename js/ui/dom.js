// Tiny DOM builder. User text always goes in through textContent ('text' prop or string children).

export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = el.className ? `${el.className} ${v}` : v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const s in v) s.startsWith('--') ? el.style.setProperty(s, v[s]) : (el.style[s] = v[s]);
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, kids);
  return el;
}

/** replaceChildren that skips null/false, like h(). */
export function fill(el, ...kids) {
  el.replaceChildren();
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  for (const c of kids.flat()) if (c) el.append(c);
  return el;
}

// 24×24 line icons drawn to sit beside SF text: 1.8 stroke, round caps.
const ICONS = {
  house: '<path d="M3.5 10.6 12 3.6l8.5 7"/><path d="M5.6 9.2v10.3a1 1 0 0 0 1 1H10v-6h4v6h3.4a1 1 0 0 0 1-1V9.2"/>',
  timetable: '<rect x="3.5" y="4.5" width="17" height="16" rx="3.5"/><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4M7.8 13.4h.01M12 13.4h.01M16.2 13.4h.01M7.8 17h.01M12 17h.01"/>',
  planner: '<path d="M10 6.5h9.5M10 12h9.5M10 17.5h9.5"/><path d="m3.8 6.4 1.5 1.5 2.5-2.7M3.8 11.9l1.5 1.5 2.5-2.7"/><circle cx="5.6" cy="17.5" r="1.4"/>',
  school: '<path d="M2.5 9.2 12 4.6l9.5 4.6L12 13.8z"/><path d="M6.4 11.2v4.5c0 1.6 2.5 3.2 5.6 3.2s5.6-1.6 5.6-3.2v-4.5M21.5 9.2v5.2"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.9v2.3M12 18.8v2.3M21.1 12h-2.3M5.2 12H2.9M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6"/><circle cx="12" cy="12" r="6.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="m20 20-4.2-4.2"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  left: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  down: '<path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.1 2"/>',
  pin: '<path d="M12 21s-6.6-5.8-6.6-11.1a6.6 6.6 0 0 1 13.2 0C18.6 15.2 12 21 12 21z"/><circle cx="12" cy="9.9" r="2.3"/>',
  person: '<circle cx="12" cy="8" r="3.7"/><path d="M4.7 20.2c.8-3.9 3.7-5.9 7.3-5.9s6.5 2 7.3 5.9"/>',
  bag: '<path d="M6 9.6A4.6 4.6 0 0 1 10.6 5h2.8A4.6 4.6 0 0 1 18 9.6V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19z"/><path d="M9.6 5V4.2a2.4 2.4 0 0 1 4.8 0V5M9 13.4h6"/>',
  timer: '<circle cx="12" cy="13.4" r="7.6"/><path d="M12 13.4V9.4M9.4 2.6h5.2M18.6 6.4l1.6-1.6"/>',
  sparkles: '<path d="m11.5 3.5 1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6-4.6-1.7 4.6-1.7z"/><path d="m18.4 14.6.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  trash: '<path d="M4.5 6.6h15M9.6 6.6V4.9a1.4 1.4 0 0 1 1.4-1.4h2a1.4 1.4 0 0 1 1.4 1.4v1.7M6.6 6.6l.8 12.1a1.9 1.9 0 0 0 1.9 1.8h5.4a1.9 1.9 0 0 0 1.9-1.8l.8-12.1"/>',
  check: '<path d="m5 12.6 4.4 4.4L19 7.4"/>',
  edit: '<path d="M4 20l1.1-4.2L16.4 4.6a2.1 2.1 0 0 1 3 3L8.2 18.9z"/><path d="m14.4 6.6 3 3"/>',
  cloud: '<path d="M7.2 18.6h10.3a4 4 0 0 0 .6-7.9 5.6 5.6 0 0 0-10.8-1.1 4.5 4.5 0 0 0-.1 9z"/>',
  book: '<path d="M4.4 5.6c2.6-1.3 5-1.3 7.6 0v13.9c-2.6-1.3-5-1.3-7.6 0zM12 5.6c2.6-1.3 5-1.3 7.6 0v13.9c-2.6-1.3-5-1.3-7.6 0z"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.9 3.6-5.6 4-9.9 2.6 1.6 4.4 4.3 4.4 6.7.8-.6 1.3-1.6 1.4-2.7 1.4 1.4 2.2 3.4 2.2 5.4C18 18.6 15.6 21 12 21z"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="3.5"/><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4"/>',
  list: '<path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5"/><path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01"/>',
  board: '<rect x="3.5" y="4.5" width="5" height="15" rx="1.6"/><rect x="9.5" y="4.5" width="5" height="10" rx="1.6"/><rect x="15.5" y="4.5" width="5" height="12.6" rx="1.6"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><path d="M3.5 9.5h17M3.5 14.5h17M9.6 9.5v10"/>',
  sort: '<path d="M8 4.6v14.8M8 4.6 4.6 8M8 4.6 11.4 8M16 19.4V4.6M16 19.4l-3.4-3.4M16 19.4l3.4-3.4"/>',
  download: '<path d="M12 4v11M7.6 10.6 12 15l4.4-4.4M5 19.6h14"/>',
  upload: '<path d="M12 15V4M7.6 8.4 12 4l4.4 4.4M5 19.6h14"/>',
  play: '<path d="M8 5.2v13.6L19 12z"/>',
  pause: '<path d="M8.6 5.6v12.8M15.4 5.6v12.8"/>',
  stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.4"/>',
  flag: '<path d="M5.6 21V4.6M5.6 4.6h11l-2 4 2 4h-11"/>',
  chart: '<path d="M4.5 19.6h15M7.6 16v-4M12 16V8M16.4 16v-6"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r=".9"/>',
  doc: '<path d="M6.6 3.5h7l4 4v12a1 1 0 0 1-1 1H6.6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.6 3.5v4h4M8.6 12.4h6.8M8.6 16h4.8"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.3 2.6 2.6 5-5.3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  keyboard: '<rect x="2.6" y="6" width="18.8" height="12" rx="2.6"/><path d="M6.2 10h.01M9.6 10h.01M13 10h.01M16.4 10h.01M7.6 14.2h8.8"/>',
  swap: '<path d="M4.6 8.4h13.4l-3.6-3.6M19.4 15.6H6l3.6 3.6"/>',
  ellipsis: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>',
  menu: '<path class="m1" d="M4.5 9.5h15"/><path class="m2" d="M4.5 14.5h15"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  note: '<path d="M5.6 4.6h12.8v9.6l-5 5.2H5.6z"/><path d="M13.4 19.4v-5.2h5M8.6 9h6.8M8.6 12h4"/>',
  tray: '<path d="M3.6 13.4 6 5.6h12l2.4 7.8V19a1.5 1.5 0 0 1-1.5 1.5H5.1A1.5 1.5 0 0 1 3.6 19z"/><path d="M3.6 13.4h4.6l1.4 2.4h4.8l1.4-2.4h4.6"/>',
};
const FILLED = new Set(['ellipsis', 'play']);

export function icon(name, size = 22, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', `ico${FILLED.has(name) ? ' ico-fill' : ''}${cls ? ` ${cls}` : ''}`);
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function debounce(fn, ms) {
  let t = 0;
  let args = [];
  const d = (...a) => {
    args = a;
    clearTimeout(t);
    t = setTimeout(() => { t = 0; fn(...args); }, ms);
  };
  /** Run now if a call is waiting. */
  d.flush = () => {
    if (!t) return;
    clearTimeout(t);
    t = 0;
    fn(...args);
  };
  return d;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function isPhone() {
  return matchMedia('(max-width: 699px)').matches;
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? 'null');
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
  return value;
}
