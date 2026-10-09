// One rAF loop drives every running spring. A SpringValue is a single animated number; a Motion
// groups an element's transform/opacity channels and writes the style once per frame.
// Retargeting (calling .to() while running) samples the live state first, so position AND
// velocity carry into the new animation — the interruptible behaviour Apple's UI is built on.

import { springs } from './spring.js';

const active = new Set();
let frame = 0;

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let userReduce = false;
let reduced = !!mq?.matches;
mq?.addEventListener?.('change', () => (reduced = userReduce || mq.matches));
export function setReducedMotion(on) {
  userReduce = !!on;
  reduced = userReduce || !!mq?.matches;
  document.documentElement.classList.toggle('reduce-motion', reduced);
}
export const motionReduced = () => reduced;

function schedule(obj) {
  active.add(obj);
  if (!frame) frame = requestAnimationFrame(tick);
}

function tick(now) {
  frame = 0;
  for (const obj of [...active]) {
    if (!obj.step(now)) active.delete(obj);
  }
  if (active.size) frame = requestAnimationFrame(tick);
}

export class SpringValue {
  constructor(value = 0, onChange = null, precision = 0.01) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
    this.onChange = onChange;
    this.precision = precision;
    this.owner = null;
    this._run = null;
  }

  _sample(now) {
    const r = this._run;
    if (!r) return;
    const t = Math.max(0, (now - r.t0) / 1000);
    const [x, v] = r.spring.state(t, r.x0, r.v0);
    this.value = this.target + x;
    this.velocity = v;
    if (Math.abs(x) < this.precision && Math.abs(v) < this.precision * 12) {
      this.value = this.target;
      this.velocity = 0;
      this._run = null;
      r.resolve(true);
    }
  }

  step(now) {
    this._sample(now);
    this.onChange?.(this.value, this.velocity);
    return !!this._run;
  }

  /** Animate to target. Resolves true when settled, false if superseded. */
  to(target, spring = springs.smooth, velocity, { force = false } = {}) {
    const now = performance.now();
    this._sample(now);
    const prev = this._run;
    this._run = null;
    prev?.resolve(false);
    if (reduced && !force) {
      this.set(target);
      return Promise.resolve(true);
    }
    const v0 = velocity ?? this.velocity;
    this.target = target;
    if (Math.abs(target - this.value) < this.precision && Math.abs(v0) < this.precision * 12) {
      this.value = target;
      this.velocity = 0;
      this.owner ? this.owner.render() : this.onChange?.(target, 0);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      this._run = { spring, t0: now, x0: this.value - target, v0, resolve };
      schedule(this.owner || this);
    });
  }

  set(value) {
    const r = this._run;
    this._run = null;
    r?.resolve(false);
    this.value = this.target = value;
    this.velocity = 0;
    if (!this.owner) this.onChange?.(value, 0);
  }

  current() {
    this._sample(performance.now());
    return this.value;
  }

  get running() {
    return !!this._run;
  }
}

export function springValue(value, onChange, precision) {
  return new SpringValue(value, onChange, precision);
}

const IDENTITY = { x: 0, y: 0, scale: 1, sx: 1, sy: 1, rotate: 0, opacity: 1 };
const PRECISION = { x: 0.1, y: 0.1, scale: 0.0008, sx: 0.0008, sy: 0.0008, rotate: 0.05, opacity: 0.002 };

class Motion {
  constructor(el) {
    this.el = el;
    this.ch = {};
  }

  channel(name) {
    let c = this.ch[name];
    if (!c) {
      c = this.ch[name] = new SpringValue(IDENTITY[name] ?? 0, null, PRECISION[name] ?? 0.01);
      c.owner = this;
    }
    return c;
  }

  get(name) {
    const c = this.ch[name];
    return c ? c.current() : IDENTITY[name];
  }

  velocity(name) {
    const c = this.ch[name];
    if (!c) return 0;
    c.current();
    return c.velocity;
  }

  get running() {
    return Object.values(this.ch).some((c) => c.running);
  }

  set(props) {
    for (const k in props) this.channel(k).set(props[k]);
    this.render();
    return this;
  }

  to(props, spring = springs.smooth, { velocity = {} } = {}) {
    const waits = [];
    for (const k in props) {
      const c = this.channel(k);
      const fade = k === 'opacity';
      // Reduced motion keeps crossfades and drops movement.
      waits.push(c.to(props[k], reduced && fade ? springs.quick : spring, velocity[k], { force: reduced && fade }));
    }
    this.render();
    return Promise.all(waits).then((r) => r.every(Boolean));
  }

  step(now) {
    let running = false;
    for (const k in this.ch) {
      const c = this.ch[k];
      c._sample(now);
      if (c._run) running = true;
    }
    this.render();
    return running;
  }

  render() {
    const c = this.ch;
    const v = (n) => (c[n] ? c[n].value : IDENTITY[n]);
    if (c.x || c.y || c.scale || c.sx || c.sy || c.rotate) {
      const x = v('x');
      const y = v('y');
      const r = v('rotate');
      const s = v('scale');
      const sx = v('sx') * s;
      const sy = v('sy') * s;
      let t = '';
      if (x || y) t += `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (r) t += ` rotate(${r.toFixed(2)}deg)`;
      if (sx !== 1 || sy !== 1) t += ` scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      this.el.style.transform = t;
    }
    if (c.opacity) {
      const o = v('opacity');
      this.el.style.opacity = o >= 0.999 ? '' : Math.max(0, o).toFixed(3);
    }
  }

  clear() {
    for (const k in this.ch) this.ch[k].set(IDENTITY[k]);
    this.ch = {};
    this.el.style.transform = '';
    this.el.style.opacity = '';
  }
}

const controllers = new WeakMap();

export function motion(el) {
  let m = controllers.get(el);
  if (!m) controllers.set(el, (m = new Motion(el)));
  return m;
}

/** The controller only if the element has ever been animated. */
export function existingMotion(el) {
  return controllers.get(el) || null;
}
