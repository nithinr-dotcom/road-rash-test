// ─────────────────────────────────────────────────────────────────────────────
// Pure math / utility helpers used throughout the game.
// No game state, no side effects — every function is deterministic.
// ─────────────────────────────────────────────────────────────────────────────

const MathUtils = {

  // Safely parse an integer; returns `fallback` when the value is invalid.
  toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  },

  // Clamp a value between min and max (inclusive).
  clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  },

  // Pick a random integer in [min, max].
  randomInt(min, max) {
    return Math.round(MathUtils.lerp(min, max, Math.random()));
  },

  // Pick a random element from an array.
  randomChoice(options) {
    return options[MathUtils.randomInt(0, options.length - 1)];
  },

  // Fraction of progress through the current segment (0 → 1).
  percentRemaining(position, segmentLength) {
    return (position % segmentLength) / segmentLength;
  },

  // Apply constant acceleration over a time step:  v' = v + a·dt
  accelerate(v, accel, dt) {
    return v + accel * dt;
  },

  // Linear interpolation between a and b by t ∈ [0, 1].
  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  // Quadratic ease-in  (starts slow, ends fast).
  easeIn(a, b, t) {
    return a + (b - a) * Math.pow(t, 2);
  },

  // Smooth cosine ease-in-out  (S-curve, used for road curves and hills).
  easeInOut(a, b, t) {
    return a + (b - a) * (0.5 - Math.cos(t * Math.PI) / 2);
  },

  // Wrap `start + increment` into the range [0, max).
  // Works for both positive and negative increments.
  wrapAround(start, increment, max) {
    let result = start + increment;
    while (result >= max) result -= max;
    while (result < 0)   result += max;
    return result;
  },

  // Project a 3-D world point onto the 2-D canvas.
  // Mutates `point.camera` and `point.screen` in-place for performance.
  project(point, cameraX, cameraY, cameraZ, cameraDepth, screenW, screenH, roadWidth) {
    point.camera.x = (point.world.x || 0) - cameraX;
    point.camera.y = (point.world.y || 0) - cameraY;
    point.camera.z = (point.world.z || 0) - cameraZ;

    const scale = cameraDepth / point.camera.z;
    point.screen.scale = scale;
    point.screen.x = Math.round(screenW / 2 + scale * point.camera.x * screenW / 2);
    point.screen.y = Math.round(screenH / 2 - scale * point.camera.y * screenH / 2);
    point.screen.w = Math.round(scale * roadWidth * screenW / 2);
  },

  // Axis-aligned bounding-box overlap check.
  // `percent` shrinks the boxes (0.8 = 80 % of their width).
  overlap(x1, w1, x2, w2, percent = 1) {
    const half = percent / 2;
    return !((x1 + w1 * half) < (x2 - w2 * half) ||
             (x1 - w1 * half) > (x2 + w2 * half));
  },

};

export default MathUtils;
