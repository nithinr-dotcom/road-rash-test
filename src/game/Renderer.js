// ─────────────────────────────────────────────────────────────────────────────
// All Canvas 2-D drawing routines.
// Every function receives `ctx` explicitly — no globals.
// ─────────────────────────────────────────────────────────────────────────────

import { SPRITES } from './constants.js';

const Renderer = {

  // Draw a filled quadrilateral (used for road surface, rumble strips, etc.)
  quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  },

  // Draw one road segment: ground tile, rumble strips, asphalt, lane dashes.
  segment(ctx, screenW, lanes, x1, y1, w1, x2, y2, w2, color, spritesImg) {
    const r1 = Renderer.rumbleWidth(w1, lanes);
    const r2 = Renderer.rumbleWidth(w2, lanes);
    const l1 = Renderer.laneMarkerWidth(w1, lanes);
    const l2 = Renderer.laneMarkerWidth(w2, lanes);

    // Ground texture between segments
    const g = SPRITES.GROUND;
    ctx.drawImage(spritesImg, g.x, g.y, g.w, g.h, 0, y2, screenW, y1 - y2);

    // Left and right rumble strips
    Renderer.quad(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
    Renderer.quad(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);

    // Road surface
    Renderer.quad(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);

    // Lane divider dashes (only on light/alternating segments)
    if (color.lane) {
      const lw1 = (w1 * 2) / lanes;
      const lw2 = (w2 * 2) / lanes;
      let lx1 = x1 - w1 + lw1;
      let lx2 = x2 - w2 + lw2;
      for (let lane = 1; lane < lanes; lane++, lx1 += lw1, lx2 += lw2) {
        Renderer.quad(ctx,
          lx1 - l1 / 2, y1, lx1 + l1 / 2, y1,
          lx2 + l2 / 2, y2, lx2 - l2 / 2, y2,
          color.lane
        );
      }
    }
  },

  // Draw a parallax-scrolling background layer (sky / hills / trees).
  // `rotation` scrolls horizontally; `offset` shifts vertically (hill bob).
  background(ctx, bgImg, screenW, screenH, layer, rotation = 0, offset = 0) {
    const halfW  = layer.w / 2;
    const srcX   = layer.x + Math.floor(layer.w * rotation);
    const srcW   = Math.min(halfW, layer.x + layer.w - srcX);
    const destW  = Math.floor(screenW * (srcW / halfW));

    ctx.drawImage(bgImg, srcX, layer.y, srcW, layer.h, 0, offset, destW, screenH);

    // Wrap around: draw the remainder of the layer when srcX is near the edge
    if (srcW < halfW) {
      ctx.drawImage(bgImg, layer.x, layer.y, halfW - srcW, layer.h,
                    destW - 1, offset, screenW - destW, screenH);
    }
  },

  // Draw a single sprite, scaled to road perspective, optionally Y-clipped.
  // offsetX / offsetY anchor the sprite (e.g. -0.5 centres it horizontally).
  sprite(ctx, screenW, screenH, resolution, roadWidth, spritesImg,
         sprite, scale, destX, destY, offsetX = 0, offsetY = 0, clipY = 0) {
    const destW = sprite.w * scale * (screenW / 2) * (SPRITES.SCALE * roadWidth);
    const destH = sprite.h * scale * (screenW / 2) * (SPRITES.SCALE * roadWidth);
    const drawX = destX + destW * offsetX;
    const drawY = destY + destH * offsetY;

    // Clip sprite height at the horizon / segment boundary
    const clipH = clipY ? Math.max(0, drawY + destH - clipY) : 0;
    if (clipH < destH) {
      ctx.drawImage(
        spritesImg,
        sprite.x, sprite.y,
        sprite.w, sprite.h - (sprite.h * clipH / destH),
        drawX, drawY,
        destW, destH - clipH
      );
    }
  },

  // Draw the player bike with a slight bounce effect and kick / steer frames.
  player(ctx, screenW, screenH, resolution, roadWidth, spritesImg,
         speedPercent, scale, destX, destY, steer, kickLeft, kickRight) {
    // Small vertical bounce based on speed
    const bounce = 1.5 * Math.random() * speedPercent * resolution *
                   (Math.random() > 0.5 ? 1 : -1);

    let sprite;
    if      (kickLeft)  sprite = SPRITES.PLAYER_KICK_LEFT;
    else if (kickRight) sprite = SPRITES.PLAYER_KICK_RIGHT;
    else if (steer < 0) sprite = SPRITES.PLAYER_LEFT;
    else if (steer > 0) sprite = SPRITES.PLAYER_RIGHT;
    else                sprite = SPRITES.PLAYER_STRAIGHT;

    Renderer.sprite(
      ctx, screenW, screenH, resolution, roadWidth, spritesImg,
      sprite, scale, destX, destY + bounce, -0.5, -1
    );
  },

  // Half the road width → rumble strip width
  rumbleWidth(projectedRoadWidth, lanes) {
    return projectedRoadWidth / Math.max(6, 2 * lanes);
  },

  // Thin line at each lane boundary
  laneMarkerWidth(projectedRoadWidth, lanes) {
    return projectedRoadWidth / Math.max(32, 8 * lanes);
  },

};

export default Renderer;
