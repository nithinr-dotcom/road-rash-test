// ─────────────────────────────────────────────────────────────────────────────
// MainScene – the one Phaser scene that runs the entire Road Rash game.
//
// Responsibilities
//   • preload  – load images and audio via Phaser's asset pipeline
//   • create   – set up keyboard input, initialise game state, build the road
//   • update   – run the game loop: physics → render → HUD every frame
//
// All rendering is done directly with the HTML5 Canvas 2-D API (ctx).
// Phaser is used only for its game loop, input system, and asset loader.
// ─────────────────────────────────────────────────────────────────────────────

import Phaser from 'phaser';
import { GAME_CONFIG, COLORS, SPRITES, BACKGROUND_LAYERS } from '../constants.js';
import MathUtils  from '../MathUtils.js';
import Renderer   from '../Renderer.js';
import { buildRoad, placeDecorations, findSegment } from '../RoadBuilder.js';
import { createCars, createBikes, updateCars, updateBikes } from '../VehicleManager.js';

export default class MainScene extends Phaser.Scene {

  constructor(sceneConfig = { key: 'MainScene' }) {
    super(sceneConfig);
  }

  // ─── Asset loading ─────────────────────────────────────────────────────────

  preload() {
    this.load.image('background', 'images/background.png');
    this.load.image('sprites',    'images/sprites.png');
    this.load.audio('bikeForward', 'music/bike_forward.mp3');
    this.load.audio('kick',        'music/kick.mp3');
    this.load.audio('crash',       'music/bike_crash.mp3');
  }

  // ─── Initialisation ────────────────────────────────────────────────────────

  create() {
    // Canvas 2-D context used for all drawing
    this.ctx = this.sys.game.canvas.getContext('2d');

    // Retrieve loaded images as HTMLImageElement so ctx.drawImage works
    this.bgImage      = this.textures.get('background').getSourceImage();
    this.spritesImage = this.textures.get('sprites').getSourceImage();

    // Audio
    this.sounds = {
      bikeForward: this.sound.add('bikeForward'),
      kick:        this.sound.add('kick'),
      crash:       this.sound.add('crash'),
    };

    // Keyboard input – arrow keys + WASD + kick keys
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys('W,A,S,D,Z,C');

    this.initState();
    this.buildTrack();
  }

  // ─── Game state ────────────────────────────────────────────────────────────

  initState() {
    const cfg  = GAME_CONFIG;
    const step = 1 / cfg.FPS;

    // Screen / road dimensions
    this.screenW   = cfg.WIDTH;
    this.screenH   = cfg.HEIGHT;
    this.roadWidth = cfg.ROAD_WIDTH;
    this.segLen    = cfg.SEGMENT_LENGTH;
    this.rumbleLen = cfg.RUMBLE_LENGTH;
    this.lanes     = cfg.LANES;
    this.drawDist  = cfg.DRAW_DISTANCE;

    // Camera
    this.camHeight = cfg.CAMERA_HEIGHT;
    this.camDepth  = 1 / Math.tan((cfg.FIELD_OF_VIEW / 2) * Math.PI / 180);
    this.playerZ   = this.camHeight * this.camDepth;  // world-z offset of player ahead of camera
    this.resolution = this.screenH / 480;             // scale factor relative to 480p

    // Physics constants (derived from segment length and frame rate)
    this.maxSpeed     = this.segLen / step;
    this.accel        =  this.maxSpeed / 5;
    this.braking      = -this.maxSpeed;
    this.decel        = -this.maxSpeed / 5;   // coasting deceleration
    this.offRoadDecel = -this.maxSpeed / 2;
    this.offRoadLimit =  this.maxSpeed / 4;   // threshold above which off-road slows you

    // Player state
    this.position          = 0;   // world-z position along the track
    this.speed             = 0;
    this.playerX           = 0;   // lateral position: -1 = left edge, +1 = right edge
    this.distanceTravelled = 0;
    this.crossedFinish     = false;
    this.rank              = 1;
    this.kickLeft          = false;
    this.kickRight         = false;

    // Parallax scroll offsets, each wraps in [0, 1)
    this.skyOffset  = 0;
    this.hillOffset = 0;
    this.treeOffset = 0;

    // Countdown state
    // Shows 3 → 2 → 1 (one second each), then "GO!" and the game starts.
    // After starting, "GO!" stays on screen for goDisplayMs before fading.
    this.countdown      = 3;
    this.countdownTimer = 0;   // ms accumulated since last countdown tick
    this.gameStarted    = false;
    this.goDisplayMs    = 0;   // counts down ms left to show "GO!" overlay

    this.gameOverShown  = false;
  }

  buildTrack() {
    this.segments = buildRoad(this.segLen, this.rumbleLen);
    placeDecorations(this.segments, SPRITES);

    // Mark the start and finish lines with distinctive colours
    const startIdx = findSegment(this.segments, this.playerZ, this.segLen).index;
    this.segments[startIdx + 2].color = COLORS.START;
    this.segments[startIdx + 3].color = COLORS.START;
    for (let n = 0; n < this.rumbleLen; n++) {
      this.segments[this.segments.length - 1 - n].color = COLORS.FINISH;
    }

    this.trackLen = this.segments.length * this.segLen;

    // Spawn traffic cars and rival bikes
    this.cars  = createCars(
      GAME_CONFIG.TOTAL_CARS, this.segments, this.segLen, this.maxSpeed, SPRITES);
    this.bikes = createBikes(
      GAME_CONFIG.TOTAL_BIKES, this.segments, this.segLen,
      this.camHeight, this.camDepth, this.maxSpeed, SPRITES);
  }

  // ─── Main loop (called by Phaser every frame) ───────────────────────────────

  update(time, delta) {
    // Cap delta to avoid a physics explosion after browser tab focus returns
    const dt = Math.min(delta / 1000, 1 / 30);

    if (!this.gameStarted) {
      this.tickCountdown(delta);
    } else {
      this.tickGame(dt);
      // Count down the "GO!" overlay timer
      if (this.goDisplayMs > 0) this.goDisplayMs -= delta;
    }

    this.renderFrame();
  }

  // ─── Countdown (3 … 2 … 1 … GO!) ──────────────────────────────────────────

  tickCountdown(delta) {
    this.countdownTimer += delta;
    if (this.countdownTimer < 1000) return;

    this.countdownTimer -= 1000;   // keep the remainder, don't reset to 0

    if (this.countdown > 0) {
      this.countdown--;
    }

    // When countdown hits 0: show "GO!" and start the game in the same tick
    if (this.countdown === 0) {
      this.gameStarted = true;
      this.goDisplayMs = 800;      // overlay "GO!" for 800 ms after game starts
    }
  }

  // ─── Physics update ────────────────────────────────────────────────────────

  tickGame(dt) {
    if (this.crossedFinish) {
      this.speed = 0;
      return;
    }

    const playerSeg    = findSegment(this.segments, this.position + this.playerZ, this.segLen);
    const speedPercent = this.speed / this.maxSpeed;
    const lateralDx    = dt * 2 * speedPercent;  // lateral distance moved per frame

    // Advance player along the track
    this.position          = MathUtils.wrapAround(this.position, dt * this.speed, this.trackLen);
    this.distanceTravelled += dt * this.speed;
    if (this.distanceTravelled > this.trackLen) this.crossedFinish = true;

    // Scroll background parallax layers (rate linked to road curve and speed)
    this.skyOffset  = MathUtils.wrapAround(this.skyOffset,  GAME_CONFIG.SKY_SPEED  * playerSeg.curve * speedPercent, 1);
    this.hillOffset = MathUtils.wrapAround(this.hillOffset, GAME_CONFIG.HILL_SPEED * playerSeg.curve * speedPercent, 1);
    this.treeOffset = MathUtils.wrapAround(this.treeOffset, GAME_CONFIG.TREE_SPEED * playerSeg.curve * speedPercent, 1);

    // Read input
    const steerLeft  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const steerRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const throttle   = this.cursors.up.isDown    || this.wasd.W.isDown;
    const brake      = this.cursors.down.isDown  || this.wasd.S.isDown;
    this.kickLeft    = this.wasd.Z.isDown;
    this.kickRight   = this.wasd.C.isDown;

    // Lateral steering
    if (steerLeft)  this.playerX -= lateralDx;
    if (steerRight) this.playerX += lateralDx;

    // Centrifugal drift on curves
    this.playerX -= lateralDx * speedPercent * playerSeg.curve * GAME_CONFIG.CENTRIFUGAL;

    // Throttle / brake / coast
    if (throttle) {
      if (!this.sounds.bikeForward.isPlaying) this.sounds.bikeForward.play();
      this.speed = MathUtils.accelerate(this.speed, this.accel, dt);
    } else {
      if (this.sounds.bikeForward.isPlaying) this.sounds.bikeForward.stop();
      const decelRate = brake ? this.braking : this.decel;
      this.speed = MathUtils.accelerate(this.speed, decelRate, dt);
    }

    // Off-road slowdown
    const offRoad = this.playerX < -1 || this.playerX > 1;
    if (offRoad && this.speed > this.offRoadLimit) {
      this.speed = MathUtils.accelerate(this.speed, this.offRoadDecel, dt);
    }

    // Update enemy vehicles
    const playerInfo = {
      x:        this.playerX,
      z:        this.position,
      speed:    this.speed,
      maxSpeed: this.maxSpeed,
      width:    SPRITES.PLAYER_STRAIGHT.w * SPRITES.SCALE,
    };
    updateCars( dt, this.cars,  this.segments, this.segLen, this.trackLen, playerInfo, this.drawDist, SPRITES);
    updateBikes(dt, this.bikes, this.segments, this.segLen, this.trackLen, playerInfo, this.drawDist, SPRITES);

    // Collision detection
    this.handleCollisions(playerSeg, offRoad);

    // Clamp player to safe ranges
    this.playerX = MathUtils.clamp(this.playerX, -2,  2);
    this.speed   = MathUtils.clamp(this.speed,    0, this.maxSpeed);

    this.rank = this.calcRank();
  }

  // ─── Collision handling ─────────────────────────────────────────────────────

  handleCollisions(playerSeg, offRoad) {
    const playerW = SPRITES.PLAYER_STRAIGHT.w * SPRITES.SCALE;

    // Clip roadside decorations while off-road
    if (offRoad) {
      for (const spr of playerSeg.sprites) {
        const sprW   = spr.source.w * SPRITES.SCALE;
        const sprOff = spr.offset + sprW / 2 * (spr.offset > 0 ? 1 : -1);
        if (MathUtils.overlap(this.playerX, playerW, sprOff, sprW)) {
          this.playCrash();
          this.speed    = this.maxSpeed / 5;
          this.position = MathUtils.wrapAround(playerSeg.p1.world.z, -this.playerZ, this.trackLen);
          break;
        }
      }
    }

    // Hit a traffic car
    for (const car of playerSeg.cars) {
      const carW = car.sprite.w * SPRITES.SCALE;
      if (this.speed > car.speed &&
          MathUtils.overlap(this.playerX, playerW, car.offset, carW, 0.8)) {
        this.playCrash();
        // Slow down to the car's speed; the faster we hit, the bigger the penalty
        this.speed    = car.speed * (car.speed / this.speed);
        this.position = MathUtils.wrapAround(car.z, -this.playerZ, this.trackLen);
        break;
      }
    }

    // Hit an enemy bike – player can kick to shove it sideways
    for (const bike of playerSeg.bikes) {
      const bikeW = bike.sprite.w * SPRITES.SCALE;
      if (this.speed > bike.speed &&
          MathUtils.overlap(this.playerX, playerW, bike.offset, bikeW, 0.8)) {

        // Kick away: player is left of bike → kick right (C); player is right → kick left (Z)
        if (this.playerX < bike.offset && this.kickRight) {
          this.sounds.kick.play();
          bike.offset += 0.5;
        } else if (this.playerX > bike.offset && this.kickLeft) {
          this.sounds.kick.play();
          bike.offset -= 0.5;
        }

        this.playCrash();
        this.speed    = bike.speed * (bike.speed / this.speed);
        this.position = MathUtils.wrapAround(bike.z, -this.playerZ, this.trackLen);
        break;
      }
    }
  }

  // Play crash sound without overlapping
  playCrash() {
    if (!this.sounds.crash.isPlaying) this.sounds.crash.play();
  }

  // ─── Race ranking ───────────────────────────────────────────────────────────

  calcRank() {
    const finishedAhead = this.bikes.filter(b => b.crossFinish).length;
    const stillRacing   = this.bikes
      .filter(b => !b.crossFinish)
      .map((b, i) => ({ name: `enemy${i}`, pos: b.z }));

    stillRacing.push({ name: 'player', pos: this.position });
    stillRacing.sort((a, b) => b.pos - a.pos);

    const idx = stillRacing.findIndex(p => p.name === 'player');
    return idx + 1 + finishedAhead;
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  renderFrame() {
    const ctx = this.ctx;
    const W   = this.screenW;
    const H   = this.screenH;

    ctx.clearRect(0, 0, W, H);

    // Camera / player position this frame
    const baseSeg   = findSegment(this.segments, this.position, this.segLen);
    const basePct   = MathUtils.percentRemaining(this.position, this.segLen);
    const playerSeg = findSegment(this.segments, this.position + this.playerZ, this.segLen);
    const playerPct = MathUtils.percentRemaining(this.position + this.playerZ, this.segLen);
    const playerY   = MathUtils.lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);

    // ── Background (sky → hills → trees, parallax scrolling) ──────────────
    Renderer.background(ctx, this.bgImage, W, H, BACKGROUND_LAYERS.SKY,
      this.skyOffset,  this.resolution * GAME_CONFIG.SKY_SPEED  * playerY);
    Renderer.background(ctx, this.bgImage, W, H, BACKGROUND_LAYERS.HILLS,
      this.hillOffset, this.resolution * GAME_CONFIG.HILL_SPEED * playerY);
    Renderer.background(ctx, this.bgImage, W, H, BACKGROUND_LAYERS.TREES,
      this.treeOffset, this.resolution * GAME_CONFIG.TREE_SPEED * playerY);

    // ── Pass 1: project and draw road segments (nearest → farthest) ───────
    let clipY = H;   // highest screen-y drawn so far; prevents horizon overdraw
    let x     = 0;
    let dx    = -(baseSeg.curve * basePct);

    for (let n = 0; n < this.drawDist; n++) {
      const seg    = this.segments[(baseSeg.index + n) % this.segments.length];
      const looped = seg.index < baseSeg.index;  // track has looped past the end

      MathUtils.project(seg.p1,
        this.playerX * this.roadWidth - x,
        playerY + this.camHeight,
        this.position - (looped ? this.trackLen : 0),
        this.camDepth, W, H, this.roadWidth);

      MathUtils.project(seg.p2,
        this.playerX * this.roadWidth - x - dx,
        playerY + this.camHeight,
        this.position - (looped ? this.trackLen : 0),
        this.camDepth, W, H, this.roadWidth);

      x  += dx;
      dx += seg.curve;

      // IMPORTANT: store clip BEFORE the skip check so sprites drawn in pass 2
      // always have a valid clip value (matches original game logic)
      seg.clip = clipY;

      // Skip: behind camera, wrong draw order, or occluded
      if (seg.p1.camera.z <= this.camDepth   ||
          seg.p2.screen.y >= seg.p1.screen.y ||
          seg.p2.screen.y >= clipY) continue;

      Renderer.segment(ctx, W, this.lanes,
        seg.p1.screen.x, seg.p1.screen.y, seg.p1.screen.w,
        seg.p2.screen.x, seg.p2.screen.y, seg.p2.screen.w,
        seg.color, this.spritesImage);

      clipY = seg.p1.screen.y;  // raise the horizon
    }

    // ── Pass 2: draw vehicles and decorations back-to-front ───────────────
    for (let n = this.drawDist - 1; n > 0; n--) {
      const seg = this.segments[(baseSeg.index + n) % this.segments.length];

      // Traffic cars
      for (const car of seg.cars) {
        const scale = MathUtils.lerp(seg.p1.screen.scale, seg.p2.screen.scale, car.percent);
        const sprX  = MathUtils.lerp(seg.p1.screen.x, seg.p2.screen.x, car.percent)
                      + scale * car.offset * this.roadWidth * W / 2;
        const sprY  = MathUtils.lerp(seg.p1.screen.y, seg.p2.screen.y, car.percent);
        Renderer.sprite(ctx, W, H, this.resolution, this.roadWidth, this.spritesImage,
          car.sprite, scale, sprX, sprY, -0.5, -1, seg.clip);
      }

      // Enemy bikes
      for (const bike of seg.bikes) {
        const scale = MathUtils.lerp(seg.p1.screen.scale, seg.p2.screen.scale, bike.percent);
        const sprX  = MathUtils.lerp(seg.p1.screen.x, seg.p2.screen.x, bike.percent)
                      + scale * bike.offset * this.roadWidth * W / 2;
        const sprY  = MathUtils.lerp(seg.p1.screen.y, seg.p2.screen.y, bike.percent);
        Renderer.sprite(ctx, W, H, this.resolution, this.roadWidth, this.spritesImage,
          bike.sprite, scale, sprX, sprY, -0.5, -1, seg.clip);
      }

      // Roadside decorations (lighthouses, boats)
      for (const spr of seg.sprites) {
        const scale = 4 * seg.p1.screen.scale;
        const sprX  = seg.p1.screen.x + scale * spr.offset * this.roadWidth * W / 2;
        Renderer.sprite(ctx, W, H, this.resolution, this.roadWidth, this.spritesImage,
          spr.source, scale, sprX, seg.p1.screen.y,
          spr.offset < 0 ? -1 : 0, -1, seg.clip);
      }

      // Player sprite (drawn once, when the loop reaches the player's segment)
      if (seg === playerSeg) {
        const steer = (this.cursors.left.isDown  || this.wasd.A.isDown) ? -1
                    : (this.cursors.right.isDown || this.wasd.D.isDown) ?  1 : 0;
        const camY  = MathUtils.lerp(playerSeg.p1.camera.y, playerSeg.p2.camera.y, playerPct);

        Renderer.player(ctx, W, H, this.resolution, this.roadWidth, this.spritesImage,
          this.speed / this.maxSpeed,
          this.camDepth / this.playerZ,
          W / 2,
          H / 2 - (this.camDepth / this.playerZ) * camY * H / 2,
          steer * this.speed,
          this.kickLeft,
          this.kickRight
        );
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    this.drawSpeedometer();
    this.drawRank();

    // Countdown overlay: shown before the game starts, and briefly after GO!
    const showingCountdown = !this.gameStarted || this.goDisplayMs > 0;
    if (showingCountdown) {
      const label = (this.countdown === 0) ? 'GO!' : String(this.countdown);
      this.drawCenteredText(label, W / 2, H / 2 - 60, '80px PerfectDark, sans-serif', 'black');
    }

    if (this.crossedFinish && this.speed === 0) {
      this.drawGameOver();
    }
  }

  // ─── HUD drawing ───────────────────────────────────────────────────────────

  drawSpeedometer() {
    const ctx = this.ctx;
    const mph = 5 * Math.round(this.speed / 500);  // round to nearest 5
    const color = mph < 100 ? 'green' : 'red';

    // Background track (dark grey half-circle)
    ctx.beginPath();
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 30;
    ctx.arc(130, 130, 100, -Math.PI, 0, false);
    ctx.stroke();

    // Speed arc
    const angle = (mph * Math.PI / 180 * 1.5) - Math.PI;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 30;
    ctx.arc(130, 130, 100, -Math.PI, angle, false);
    ctx.stroke();

    // MPH number (centred in the gauge)
    ctx.fillStyle = color;
    ctx.font      = '50px PerfectDark, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mph, 130, 125);

    // "MPH" label
    ctx.fillStyle = '#000';
    ctx.font      = '30px Bariol, sans-serif';
    ctx.fillText('MPH', 130, 75);
    ctx.textAlign = 'left'; // reset
  }

  drawRank() {
    const ctx  = this.ctx;
    const text = `${this.rank}/${this.bikes.length + 1}`;
    ctx.fillStyle  = 'orange';
    ctx.font       = '80px PerfectDark, sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText(text, this.screenW / 2, 145);
    ctx.textAlign  = 'left'; // reset
  }

  // Draw text horizontally and vertically centred around (cx, cy)
  drawCenteredText(text, cx, cy, font, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font      = font;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy);
    ctx.textAlign = 'left'; // reset
  }

  drawGameOver() {
    this.drawCenteredText('GAME OVER!', this.screenW / 2, this.screenH / 2,
                          '80px PerfectDark, sans-serif', '#ff2222');

    // Notify React once after a short pause so the player can read the message
    if (!this.gameOverShown) {
      this.gameOverShown = true;
      this.time.delayedCall(2000, () => {
        const cb = this.registry.get('onGameOver');
        if (cb) cb();
      });
    }
  }
}
