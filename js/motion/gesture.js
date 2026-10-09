// Direct manipulation: 1:1 pointer tracking, release velocity, UIScrollView-style projection and
// rubber-banding past the edges (WWDC18 "Designing Fluid Interfaces").

/** Apple's rubber-band: f(x) = (1 − 1/(x·c/d + 1))·d. */
export function rubberband(offset, dimension, c = 0.55) {
  if (!dimension) return offset * c;
  const s = Math.sign(offset);
  const x = Math.abs(offset);
  return s * (1 - 1 / ((x * c) / dimension + 1)) * dimension;
}

/** Where a flick would come to rest: UIScrollView.DecelerationRate.normal (0.998 per ms). v in px/s. */
export function project(v, rate = 0.998) {
  return ((v / 1000) * rate) / (1 - rate);
}

let blockTouch = false;
if (typeof window !== 'undefined') {
  window.addEventListener('touchmove', (e) => blockTouch && e.cancelable && e.preventDefault(), { passive: false });
}

/**
 * drag(el, { axis: 'x'|'y'|'both', threshold, holdMs, shouldStart(e), onStart(info), onMove(info), onEnd(info), onCancel() })
 * info: { dx, dy, x, y, vx, vy, pointerType }
 * The gesture claims the pointer only once movement passes the threshold along its axis, so taps
 * still click and perpendicular movement still scrolls. holdMs requires a press-and-hold first
 * (touch only) — for dragging things that live inside a scroller.
 */
export function drag(el, opts) {
  const { axis = 'x', threshold = 8, holdMs = 0 } = opts;
  let s = null;

  const velocity = () => {
    const pts = s.samples;
    const last = pts[pts.length - 1];
    let first = pts[0];
    for (const p of pts) if (last[0] - p[0] <= 100) { first = p; break; }
    const dt = (last[0] - first[0]) / 1000;
    if (dt <= 0) return [0, 0];
    return [(last[1] - first[1]) / dt, (last[2] - first[2]) / dt];
  };

  const info = (e) => {
    const [vx, vy] = s.started ? velocity() : [0, 0];
    return { dx: e.clientX - s.x0, dy: e.clientY - s.y0, x: e.clientX, y: e.clientY, vx, vy, pointerType: s.type, target: s.target };
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    clearTimeout(s?.timer);
    blockTouch = false;
    s = null;
  };

  const begin = (e) => {
    s.started = true;
    blockTouch = true;
    try { el.setPointerCapture(s.id); } catch { /* element may have moved */ }
    opts.onStart?.(info(e));
  };

  const down = (e) => {
    if (s || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (opts.shouldStart && !opts.shouldStart(e)) return;
    s = {
      id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, target: e.target,
      started: false, held: !holdMs || e.pointerType === 'mouse', samples: [[e.timeStamp, e.clientX, e.clientY]],
    };
    if (!s.held) {
      s.timer = setTimeout(() => {
        if (!s) return;
        s.held = true;
        opts.onHold?.();
        begin(e);
      }, holdMs);
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const move = (e) => {
    if (!s || e.pointerId !== s.id) return;
    s.samples.push([e.timeStamp, e.clientX, e.clientY]);
    if (s.samples.length > 24) s.samples.splice(0, s.samples.length - 24);
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.started) {
      if (!s.held) {
        if (Math.hypot(dx, dy) > 10) cleanup();
        return;
      }
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (Math.max(ax, ay) < threshold) return;
      if ((axis === 'x' && ay > ax) || (axis === 'y' && ax > ay)) return cleanup();
      begin(e);
    }
    e.preventDefault();
    opts.onMove?.(info(e));
  };

  const up = (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (s.started) {
      const i = info(e);
      // A drag is not a click.
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      cleanup();
      opts.onEnd?.(i);
    } else cleanup();
  };

  const cancel = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const started = s.started;
    const i = info(e);
    cleanup();
    if (started) (opts.onCancel || opts.onEnd)?.({ ...i, vx: 0, vy: 0 });
  };

  el.addEventListener('pointerdown', down);
  return () => el.removeEventListener('pointerdown', down);
}
