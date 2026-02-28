// ─────────────────────────────────────────────────────────────────────────────
// Builds the array of road segments that make up the track.
//
// A segment is a thin "slice" of road.  The track is made from thousands of
// segments laid end-to-end.  Each one stores:
//   • p1 / p2   – world & screen coordinates of its near / far edge
//   • curve     – how much the road bends left or right here
//   • color     – alternating light/dark for the rumble-strip effect
//   • sprites   – decorative objects on the roadside
//   • cars / bikes – enemy vehicles currently on this segment
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS } from './constants.js';
import MathUtils from './MathUtils.js';

// ─── Low-level helpers ────────────────────────────────────────────────────────

function lastY(segments) {
  return segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
}

function addSegment(segments, curve, y, segLen, rumbleLen) {
  const n = segments.length;
  segments.push({
    index: n,
    p1: { world: { y: lastY(segments), z:  n      * segLen }, camera: {}, screen: {} },
    p2: { world: { y,                  z: (n + 1) * segLen }, camera: {}, screen: {} },
    curve,
    sprites: [],
    cars:    [],
    bikes:   [],
    color: Math.floor(n / rumbleLen) % 2 ? COLORS.DARK : COLORS.LIGHT,
  });
}

// Append a road section that enters, holds, then exits a curve / hill.
// `enter` / `hold` / `leave` = number of segments for each phase.
function addRoad(segments, enter, hold, leave, curve, hillHeight, segLen, rumbleLen) {
  const startY = lastY(segments);
  const endY   = startY + MathUtils.toInt(hillHeight, 0) * segLen;
  const total  = enter + hold + leave;

  for (let n = 0; n < enter; n++)
    addSegment(segments,
      MathUtils.easeIn(0, curve, n / enter),
      MathUtils.easeInOut(startY, endY, n / total),
      segLen, rumbleLen);

  for (let n = 0; n < hold; n++)
    addSegment(segments,
      curve,
      MathUtils.easeInOut(startY, endY, (enter + n) / total),
      segLen, rumbleLen);

  for (let n = 0; n < leave; n++)
    addSegment(segments,
      MathUtils.easeIn(curve, 0, n / leave),
      MathUtils.easeInOut(startY, endY, (enter + hold + n) / total),
      segLen, rumbleLen);
}

// ─── Named section types ──────────────────────────────────────────────────────

const straight      = (segs, len = 50, sl, rl) => addRoad(segs, len, len, len, 0,    0,      sl, rl);
const hill          = (segs, len = 50, h = 40, sl, rl) => addRoad(segs, len, len, len, 0, h, sl, rl);
const curve         = (segs, len = 50, c = 4, h = 0,  sl, rl) => addRoad(segs, len, len, len, c, h, sl, rl);

function lowRollingHills(segs, len = 25, h = 20, sl, rl) {
  addRoad(segs, len, len, len,  0,  h / 2, sl, rl);
  addRoad(segs, len, len, len,  0, -h,     sl, rl);
  addRoad(segs, len, len, len,  0,  h,     sl, rl);
  addRoad(segs, len, len, len,  0,  0,     sl, rl);
  addRoad(segs, len, len, len,  0,  h / 2, sl, rl);
  addRoad(segs, len, len, len,  0,  0,     sl, rl);
}

function downhillToEnd(segs, len = 200, sl, rl) {
  // Smoothly descend back to y=0 so the track loops cleanly
  addRoad(segs, len, len, len, -2, -lastY(segs) / sl, sl, rl);
}

// ─── Sprite / decoration placement ───────────────────────────────────────────

function placeSprite(segments, index, sprite, offset) {
  if (index < segments.length) {
    segments[index].sprites.push({ source: sprite, offset });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the full track and return the segments array. */
export function buildRoad(segLen, rumbleLen) {
  const segs = [];
  const sl = segLen;
  const rl = rumbleLen;

  straight(segs, 12,  sl, rl);   // start straight
  straight(segs, 50,  sl, rl);
  straight(segs, 50,  sl, rl);
  straight(segs, 50,  sl, rl);
  hill(segs, 25, 20,  sl, rl);
  lowRollingHills(segs, 25, 20,  sl, rl);
  curve(segs, 50,  4, 20,  sl, rl);
  lowRollingHills(segs, 25, 20,  sl, rl);
  curve(segs, 100, 4, 40,  sl, rl);
  straight(segs, 50,  sl, rl);
  curve(segs, 100, -4, 40, sl, rl);
  hill(segs, 100, 60,  sl, rl);
  curve(segs, 100,  4, -20, sl, rl);
  hill(segs, 100, -40, sl, rl);
  straight(segs, 50,  sl, rl);
  downhillToEnd(segs, 200, sl, rl);

  return segs;
}

/** Scatter lighthouses and boats along the roadside. */
export function placeDecorations(segments, SPRITES) {
  // Lighthouses every 60 / 80 segments
  for (let n = 20; n < 4000 && n < segments.length; n++) {
    if (n % 60 === 0) placeSprite(segments, n, SPRITES.LIGHTHOUSE,  3);
    if (n % 80 === 0) placeSprite(segments, n, SPRITES.LIGHTHOUSE, -2);
  }

  // Random boats scattered along the whole track
  for (let i = 200; i < segments.length; i += 3) {
    placeSprite(segments, i,
      MathUtils.randomChoice(SPRITES.SHIPS),
      MathUtils.randomChoice([1, -1]) * (2 + Math.random() * 5)
    );
  }
}

/** Return the segment that contains world-z position `z`. */
export function findSegment(segments, z, segLen) {
  return segments[Math.floor(z / segLen) % segments.length];
}
