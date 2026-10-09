// Springs parameterised exactly like SwiftUI's Spring(duration:bounce:) (WWDC23 "Animate with springs"):
// mass 1, stiffness (2π/d)², damping 4π(1−b)/d for b ≥ 0 and 4π/(d(1+b)) for b < 0.
// The solution is closed-form, so any instant can be sampled exactly — which is what lets an
// animation be retargeted mid-flight while keeping its current position and velocity.

const TAU = Math.PI * 2;

export class Spring {
  constructor(duration = 0.5, bounce = 0) {
    this.duration = duration;
    this.bounce = bounce;
    const k = (TAU / duration) ** 2;
    const c = bounce >= 0 ? (4 * Math.PI * (1 - bounce)) / duration : (4 * Math.PI) / (duration * (1 + bounce));
    this.w0 = Math.sqrt(k);
    this.zeta = c / (2 * this.w0);
    this._settle = 0;
  }

  /** [displacement, velocity] at t seconds, starting from displacement x0 moving at v0 units/s. */
  state(t, x0, v0) {
    const { w0, zeta } = this;
    if (zeta < 1 - 1e-6) {
      const a = zeta * w0;
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const e = Math.exp(-a * t);
      const B = (v0 + a * x0) / wd;
      const cos = Math.cos(wd * t);
      const sin = Math.sin(wd * t);
      return [e * (x0 * cos + B * sin), e * (v0 * cos - (x0 * wd + a * B) * sin)];
    }
    if (zeta <= 1 + 1e-6) {
      const e = Math.exp(-w0 * t);
      const B = v0 + w0 * x0;
      return [e * (x0 + B * t), e * (v0 - w0 * B * t)];
    }
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s;
    const r2 = -zeta * w0 - s;
    const C2 = (v0 - r1 * x0) / (r2 - r1);
    const C1 = x0 - C2;
    const e1 = Math.exp(r1 * t);
    const e2 = Math.exp(r2 * t);
    return [C1 * e1 + C2 * e2, r1 * C1 * e1 + r2 * C2 * e2];
  }

  /** Seconds until a unit step stays within eps of rest. */
  settleTime(eps = 0.001) {
    if (this._settle) return this._settle;
    const dt = 1 / 240;
    let last = 0;
    for (let t = 0; t < 6; t += dt) {
      const [x, v] = this.state(t, -1, 0);
      if (Math.abs(x) > eps || Math.abs(v) > eps * 10) last = t;
    }
    return (this._settle = last + dt);
  }
}

export const springs = {
  smooth: new Spring(0.5, 0),
  snappy: new Spring(0.5, 0.15),
  bouncy: new Spring(0.5, 0.3),
  quick: new Spring(0.32, 0.06),
  sheet: new Spring(0.46, 0.04),
  gentle: new Spring(0.7, 0.05),
  // SwiftUI's .interactiveSpring() — response 0.15, damping fraction 0.86.
  interactive: new Spring(0.15, 0.14),
};

/** The same spring as a CSS linear() easing, so CSS transitions and JS animations share one curve. */
export function cssEasing(spring, samples = 56) {
  const T = spring.settleTime();
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const [x] = spring.state((i / samples) * T, -1, 0);
    pts.push(+(1 + x).toFixed(4));
  }
  pts[pts.length - 1] = 1;
  return { easing: `linear(${pts.join(', ')})`, ms: Math.round(T * 1000) };
}

export function installSpringCSS(root = document.documentElement) {
  if (!globalThis.CSS?.supports?.('transition-timing-function', 'linear(0, 1)')) return;
  for (const name of ['smooth', 'snappy', 'bouncy', 'quick', 'sheet']) {
    const { easing, ms } = cssEasing(springs[name]);
    root.style.setProperty(`--spring-${name}`, easing);
    root.style.setProperty(`--spring-${name}-d`, `${ms}ms`);
  }
}
