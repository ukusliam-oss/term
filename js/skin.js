// The personal skin: CleanMyMac's own renders, icons and button textures, made on the owner's Mac
// from their installed copy (private/make-skin.swift → term-skin.zip) and imported once per device.
// It lives in this browser's IndexedDB only — the site and the repo never contain it.

const DB = 'term-skin';
const STORE = 'files';
const TYPES = { png: 'image/png', mov: 'video/quicktime', mp4: 'video/mp4', json: 'application/json', webp: 'image/webp' };

let urls = new Map();
const listeners = new Set();

export const skin = {
  meta: null,
  get has() { return urls.size > 0; },
  url: (path) => urls.get(path) || '',
  /** Safari (and every browser on iOS) plays HEVC with transparency; elsewhere the still frame is shown. */
  movies: /Apple/.test(navigator.vendor || '') && !!document.createElement('video').canPlayType('video/mp4; codecs="hvc1"'),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (db, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(STORE, mode);
  const out = fn(t.objectStore(STORE));
  t.oncomplete = () => res(out?.result ?? out);
  t.onerror = () => rej(t.error);
});

async function publish(entries) {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls = new Map(entries.map(([path, blob]) => [path, URL.createObjectURL(blob)]));
  const manifest = entries.find(([p]) => p === 'skin.json')?.[1];
  skin.meta = manifest ? await manifest.text().then(JSON.parse).catch(() => null) : null;
  for (const fn of listeners) fn();
}

export async function loadSkin() {
  try {
    const db = await open();
    const entries = await tx(db, 'readonly', (s) => {
      const list = [];
      const req = s.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { list.push([c.key, c.value]); c.continue(); } };
      return list;
    });
    db.close();
    await publish(entries);
  } catch (e) { console.warn('[term] skin', e); }
  return skin.has;
}

/** Read a .zip (stored or deflated) into [path, Blob] pairs. */
async function unzip(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('That isn’t a skin file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)).replace(/^\.\//, '');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.startsWith('__MACOSX') || name.split('/').pop().startsWith('.')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    let data = buf.slice(start, start + size);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (method !== 0) continue;
    const ext = name.split('.').pop().toLowerCase();
    out.push([name.replace(/^skin\//, ''), new Blob([data], { type: TYPES[ext] || 'application/octet-stream' })]);
  }
  return out;
}

export async function importSkin(file) {
  const entries = await unzip(file);
  if (!entries.some(([p]) => p === 'skin.json')) throw new Error('That isn’t a Term skin file.');
  const db = await open();
  await tx(db, 'readwrite', (s) => { s.clear(); for (const [p, b] of entries) s.put(b, p); });
  db.close();
  await publish(entries);
  return entries.length;
}

export async function removeSkin() {
  const db = await open();
  await tx(db, 'readwrite', (s) => s.clear());
  db.close();
  await publish([]);
}
