// ─────────────────────────────────────────────────────────────────────────────
// Traffic cars and enemy bikes: creation, per-frame updates, and avoidance AI.
// ─────────────────────────────────────────────────────────────────────────────

import MathUtils from './MathUtils.js';
import { findSegment } from './RoadBuilder.js';

// ─── Factory functions ────────────────────────────────────────────────────────

/** Spawn `count` traffic cars scattered randomly around the track. */
export function createCars(count, segments, segLen, maxSpeed, SPRITES) {
  const cars = [];
  for (let n = 0; n < count; n++) {
    const z       = Math.floor(Math.random() * segments.length) * segLen;
    const offset  = Math.random() * MathUtils.randomChoice([-0.8, 0.8]);
    const sprite  = MathUtils.randomChoice(SPRITES.CARS);
    const speed   = maxSpeed / 4;                   // cars are slow
    const car     = { offset, z, sprite, speed, percent: 0 };
    findSegment(segments, z, segLen).cars.push(car);
    cars.push(car);
  }
  return cars;
}

/** Spawn `count` enemy bikes just ahead of the player start position. */
export function createBikes(count, segments, segLen, cameraHeight, cameraDepth, maxSpeed, SPRITES) {
  const bikes = [];
  for (let n = 0; n < count; n++) {
    const z       = cameraHeight * cameraDepth + 5 * segLen;  // just in front of player
    const offset  = Math.random() * MathUtils.randomChoice([-0.8, 0.8]);
    const sprite  = MathUtils.randomChoice(SPRITES.BIKES);
    const speed   = maxSpeed / 1.5;                 // bikes are fast
    const bike    = { offset, z, sprite, speed, percent: 0, crossFinish: false };
    findSegment(segments, z, segLen).bikes.push(bike);
    bikes.push(bike);
  }
  return bikes;
}

// ─── Per-frame updates ────────────────────────────────────────────────────────

/**
 * Advance every traffic car by `dt` seconds.
 * Cars avoid the player and each other by nudging their lane offset.
 */
export function updateCars(dt, cars, segments, segLen, trackLen, player, drawDistance, SPRITES) {
  for (const car of cars) {
    const oldSeg  = findSegment(segments, car.z, segLen);
    car.offset   += avoidanceSteer(car, oldSeg, segments, segLen, player, drawDistance, SPRITES);
    car.z         = MathUtils.wrapAround(car.z, dt * car.speed, trackLen);
    car.percent   = MathUtils.percentRemaining(car.z, segLen);

    const newSeg  = findSegment(segments, car.z, segLen);
    if (oldSeg !== newSeg) {
      oldSeg.cars.splice(oldSeg.cars.indexOf(car), 1);
      newSeg.cars.push(car);
    }
  }
}

/**
 * Advance every enemy bike by `dt` seconds.
 * Bikes also avoid the player and each other.
 */
export function updateBikes(dt, bikes, segments, segLen, trackLen, player, drawDistance, SPRITES) {
  for (const bike of bikes) {
    const oldSeg  = findSegment(segments, bike.z, segLen);
    bike.offset  += avoidanceSteer(bike, oldSeg, segments, segLen, player, drawDistance, SPRITES);
    bike.z        = MathUtils.wrapAround(bike.z, dt * bike.speed, trackLen);
    bike.percent  = MathUtils.percentRemaining(bike.z, segLen);

    const newSeg  = findSegment(segments, bike.z, segLen);
    if (oldSeg !== newSeg) {
      oldSeg.bikes.splice(oldSeg.bikes.indexOf(bike), 1);
      newSeg.bikes.push(bike);
    }
  }
}

// ─── Avoidance AI ─────────────────────────────────────────────────────────────

/**
 * Look `lookahead` segments ahead and nudge `vehicle.offset` away from
 * the player or any slower vehicle directly in the path.
 * Returns a small delta to add to `vehicle.offset` this frame.
 */
function avoidanceSteer(vehicle, vehicleSeg, segments, segLen, player, drawDistance, SPRITES) {
  const LOOKAHEAD  = 20;
  const vehicleW   = vehicle.sprite.w * SPRITES.SCALE;
  const playerSeg  = findSegment(segments, player.z, segLen);

  // If this vehicle is far behind the player, don't bother computing AI
  if ((vehicleSeg.index - playerSeg.index) > drawDistance) return 0;

  for (let i = 1; i < LOOKAHEAD; i++) {
    const seg = segments[(vehicleSeg.index + i) % segments.length];

    // Avoid the player
    if (seg === playerSeg &&
        vehicle.speed > player.speed &&
        MathUtils.overlap(player.x, player.width, vehicle.offset, vehicleW, 1.2)) {
      const dir = player.x > 0.5 ? -1 : player.x < -0.5 ? 1 :
                  (vehicle.offset > player.x ? 1 : -1);
      return dir * (1 / i) * (vehicle.speed - player.speed) / player.maxSpeed;
    }

    // Avoid other cars on this segment
    for (const other of [...seg.cars, ...seg.bikes]) {
      if (other === vehicle) continue;
      const otherW = other.sprite.w * SPRITES.SCALE;
      if (vehicle.speed > other.speed &&
          MathUtils.overlap(vehicle.offset, vehicleW, other.offset, otherW, 1.2)) {
        const dir = other.offset > 0.5 ? -1 : other.offset < -0.5 ? 1 :
                    (vehicle.offset > other.offset ? 1 : -1);
        return dir * (1 / i) * (vehicle.speed - other.speed) / player.maxSpeed;
      }
    }
  }

  // Drift back toward centre if at the edge
  if (vehicle.offset < -0.9) return  0.1;
  if (vehicle.offset >  0.9) return -0.1;
  return 0;
}
