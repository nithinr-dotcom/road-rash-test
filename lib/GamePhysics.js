// ─────────────────────────────────────────────────────────────────────────────
// Server-side physics — mirrors the client's MathUtils / MainScene logic
// so the server can authoritatively validate and advance player positions.
//
// Numbers are kept identical to the client constants so both sides stay in sync.
// ─────────────────────────────────────────────────────────────────────────────

const SEGMENT_LENGTH = 200;
const CAMERA_HEIGHT  = 1000;
const FIELD_OF_VIEW  = 100;   // degrees
const CENTRIFUGAL    = 0.3;

// Lane offsets for staggered starting grid (up to 5 players)
const START_OFFSETS = [-0.6, 0.6, -0.3, 0.3, 0];

// ─────────────────────────────────────────────────────────────────────────────

class PlayerState {
  constructor(id, name, slotIndex) {
    this.id   = id;
    this.name = name;
    this.slot = slotIndex;

    // Physics state
    this.position          = 0;
    this.speed             = 0;
    this.playerX           = START_OFFSETS[slotIndex] ?? 0;
    this.distanceTravelled = 0;
    this.finished          = false;
    this.finishPosition    = null;
    this.eliminated        = false;
    this.health            = 100;
    this.nearMissCharge    = 0;
    this.nitroUntilMs      = 0;

    // Input snapshot (updated by server on each client message)
    this.input = { left: false, right: false, up: false, down: false, kickLeft: false, kickRight: false };

    // Track previous snapshot for delta detection
    this._prev = {};
  }

  /** Minimal public description sent on join */
  public() {
    return { id: this.id, name: this.name, slot: this.slot };
  }

  /** Full state snapshot sent every tick */
  snapshot() {
    return {
      id:       this.id,
      x:        +this.playerX.toFixed(4),
      z:        +this.position.toFixed(0),
      speed:    +this.speed.toFixed(0),
      distance: +this.distanceTravelled.toFixed(0),
      finished: this.finished,
      eliminated: this.eliminated,
      health:   this.health,
      nitroActive: this.nitroUntilMs > Date.now(),
      input:    { ...this.input },   // direction visible to other clients
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const camDepth = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
const playerZ  = CAMERA_HEIGHT * camDepth;

function createPlayer(id, name, slotIndex) {
  return new PlayerState(id, name, slotIndex);
}

function resetPlayer(p, slotIndex) {
  p.slot                = slotIndex;
  p.position            = 0;
  p.speed               = 0;
  p.playerX             = START_OFFSETS[slotIndex] ?? 0;
  p.distanceTravelled   = 0;
  p.finished            = false;
  p.finishPosition      = null;
  p.eliminated          = false;
  p.health              = 100;
  p.nearMissCharge      = 0;
  p.nitroUntilMs        = 0;
  p.input               = { left: false, right: false, up: false, down: false, kickLeft: false, kickRight: false };
}

function registerNearMiss(p, nowMs = Date.now()) {
  p.nearMissCharge = (p.nearMissCharge ?? 0) + 1;
  if (p.nearMissCharge >= 3) {
    p.nearMissCharge = 0;
    p.nitroUntilMs = nowMs + 5000;
  }
}

/** Advance one player by dt seconds using the same physics as the client. */
function updatePlayer(p, dt, trackLength, maxSpeed) {
  if (p.finished) return;

  const step         = 1 / 60;
  const nitroActive  = (p.nitroUntilMs ?? 0) > Date.now();
  const maxSpeedNow  = nitroActive ? maxSpeed * 1.35 : maxSpeed;
  const accel        = (nitroActive ? 1.5 : 1) * (maxSpeed / 5);
  const braking      = -maxSpeed;
  const decel        = -maxSpeed / 5;
  const offRoadDecel = -maxSpeed / 2;
  const offRoadLimit =  maxSpeed / 4;
  const speedPercent = p.speed / maxSpeedNow;
  const lateralDx    = dt * 2 * speedPercent;

  // Read last input
  const { left, right, up, down } = p.input;

  // Lateral steering
  if (left)  p.playerX -= lateralDx;
  if (right) p.playerX += lateralDx;

  // Throttle / brake / coast
  if (up) {
    p.speed = accelerate(p.speed, accel, dt);
  } else {
    p.speed = accelerate(p.speed, down ? braking : decel, dt);
  }

  // Off-road penalty
  const offRoad = p.playerX < -1 || p.playerX > 1;
  if (offRoad && p.speed > offRoadLimit) {
    p.speed = accelerate(p.speed, offRoadDecel, dt);
  }

  // Advance position
  p.position = wrapAround(p.position, dt * p.speed, trackLength);
  p.distanceTravelled += dt * p.speed;

  // Clamp
  p.playerX = clamp(p.playerX, -2, 2);
  p.speed   = clamp(p.speed,    0, maxSpeedNow);

  // Finish detection
  if (p.distanceTravelled >= trackLength && !p.finished) {
    p.finished = true;
  }
}

// ─── Pure math (mirrors MathUtils.js) ────────────────────────────────────────

function accelerate(v, accel, dt) { return v + accel * dt; }
function clamp(v, lo, hi)        { return Math.max(lo, Math.min(v, hi)); }
function wrapAround(start, inc, max) {
  let r = start + inc;
  while (r >= max) r -= max;
  while (r  <  0) r += max;
  return r;
}

module.exports = { createPlayer, resetPlayer, updatePlayer, registerNearMiss };
