// ─────────────────────────────────────────────────────────────────────────────
// MultiplayerGameScreen
//
// Mounts a Phaser game that:
//   • Runs the full single-player road rash render pipeline unchanged
//   • Sends local input to the server at 20 Hz
//   • Receives authoritative state from the server and interpolates other players
//   • Renders ghost bikes for remote players (reusing existing Renderer.sprite)
//   • Shows a live leaderboard overlay via React DOM
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import MainScene from '../src/game/scenes/MainScene.js';
import Leaderboard from './Leaderboard.js';

const GAME_W          = 1280;
const GAME_H          = 720;
const INPUT_RATE_MS   = 50;    // send input every 50 ms (20 Hz)
const INTERP_DELAY_MS = 100;   // buffer 100 ms of server states for interpolation

export default function MultiplayerGameScreen({ socket, playerName, onGameOver }) {
  const containerRef   = useRef(null);
  const gameRef        = useRef(null);
  const socketRef      = useRef(socket);
  const inputTimerRef  = useRef(null);

  // Leaderboard displayed via React overlay
  const [board, setBoard] = useState([]);
  const [phase, setPhase] = useState('racing'); // 'racing' | 'finished'

  // ── Buffer of server state snapshots for interpolation ─────────────────────
  // Map: playerId → Array<{ ts, x, z, speed, distance, input }>
  const stateBufferRef = useRef(new Map());

  useEffect(() => {
    const sock = socketRef.current;

    // ── Mount Phaser ─────────────────────────────────────────────────────────
    const config = {
      type:              Phaser.CANVAS,
      width:             GAME_W,
      height:            GAME_H,
      parent:            containerRef.current,
      backgroundColor:   '#72D7EE',
      clearBeforeRender: false,
      audio:             { disableWebAudio: false },
      scene:             [MultiScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Pass multiplayer config into Phaser registry
    game.events.once('ready', () => {
      game.registry.set('onGameOver',     onGameOver);
      game.registry.set('socket',         sock);
      game.registry.set('playerName',     playerName);
      game.registry.set('stateBuffer',    stateBufferRef.current);
      game.registry.set('setBoard',       setBoard);
      game.registry.set('setPhase',       setPhase);
      game.registry.set('interpDelayMs',  INTERP_DELAY_MS);
    });

    // ── Socket event handlers ─────────────────────────────────────────────────

    // Accumulate server snapshots into per-player ring buffers
    sock.on('state_update', ({ ts, players }) => {
      const buf = stateBufferRef.current;
      for (const p of players) {
        if (!buf.has(p.id)) buf.set(p.id, []);
        const arr = buf.get(p.id);
        arr.push({ ts, ...p });
        // Keep only the last 30 snapshots (~1.5 s at 20 Hz)
        if (arr.length > 30) arr.shift();
      }
    });

    sock.on('leaderboard_update', ({ board: b }) => setBoard(b));

    sock.on('race_over', ({ board: b }) => {
      setBoard(b);
      setPhase('finished');
      // Tell Phaser to stop physics (it will also show game-over canvas text)
      if (gameRef.current) {
        gameRef.current.registry.set('raceOver', true);
      }
    });

    // ── Input sender (20 Hz) ─────────────────────────────────────────────────
    inputTimerRef.current = setInterval(() => {
      const scene = game.scene.getScene('MultiScene');
      if (!scene || !scene.cursors) return;

      sock.emit('player_input', {
        left:      scene.cursors.left.isDown  || scene.wasd?.A?.isDown,
        right:     scene.cursors.right.isDown || scene.wasd?.D?.isDown,
        up:        scene.cursors.up.isDown    || scene.wasd?.W?.isDown,
        down:      scene.cursors.down.isDown  || scene.wasd?.S?.isDown,
        kickLeft:  scene.wasd?.Z?.isDown,
        kickRight: scene.wasd?.C?.isDown,
      });
    }, INPUT_RATE_MS);

    return () => {
      clearInterval(inputTimerRef.current);
      sock.off('state_update');
      sock.off('leaderboard_update');
      sock.off('race_over');
      game.destroy(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Phaser canvas */}
      <div ref={containerRef} className="game-screen" />

      {/* Leaderboard overlay (top-right) */}
      <Leaderboard board={board} phase={phase} />

      {/* Race-over React overlay */}
      {phase === 'finished' && (
        <div className="mp-gameover-overlay">
          <h2>RACE FINISHED!</h2>
          <button onClick={onGameOver}>BACK TO MENU</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiScene – extends MainScene so all road/render logic is inherited.
//
// Overrides:
//   • Disables the AI bikes (they're replaced by real remote players)
//   • renderFrame  – after the base render, draws ghost bikes for other players
//   • tickGame     – uses server-authoritative position where available
// ─────────────────────────────────────────────────────────────────────────────

import { GAME_CONFIG, SPRITES, COLORS } from '../src/game/constants.js';
import MathUtils from '../src/game/MathUtils.js';
import Renderer  from '../src/game/Renderer.js';
import { findSegment } from '../src/game/RoadBuilder.js';

class MultiScene extends MainScene {
  constructor() {
    // Pass unique key to Phaser so it doesn't clash with 'MainScene'
    super({ key: 'MultiScene' });
  }

  create() {
    super.create();

    // Grab multiplayer references from registry
    this._socket       = this.registry.get('socket');
    this._stateBuffer  = this.registry.get('stateBuffer');
    this._interpDelay  = this.registry.get('interpDelayMs') ?? 100;

    // Map: playerId → interpolated render state
    this._remotePlayers = new Map();

    // Disable AI bikes — remote players are the opponents
    for (const seg of this.segments) seg.bikes = [];
    this.bikes = [];
  }

  // Override: apply server position to local player, draw remote ghosts
  tickGame(dt) {
    // Run local physics (input, speed, position) exactly as single-player
    super.tickGame(dt);

    // Interpolate remote players
    const nowMs = Date.now() - this._interpDelay;
    if (this._stateBuffer) {
      const myId = this._socket?.id;
      for (const [id, snapshots] of this._stateBuffer.entries()) {
        if (id === myId) continue; // skip self — we have local physics
        const interp = this._interpolate(snapshots, nowMs);
        if (interp) this._remotePlayers.set(id, interp);
      }
    }
  }

  // Draw remote player ghosts AFTER the base renderFrame
  renderFrame() {
    super.renderFrame();
    this._drawRemotePlayers();
  }

  // ── Interpolation ─────────────────────────────────────────────────────────

  /**
   * Given the sorted snapshot array, find the two frames that straddle `nowMs`
   * and lerp between them.  Returns { x, z, input } or null.
   */
  _interpolate(snapshots, nowMs) {
    if (!snapshots || snapshots.length < 2) return snapshots?.[snapshots.length - 1] ?? null;

    // Find the two snapshots bracketing `nowMs`
    let prev = snapshots[0];
    let next = snapshots[1];
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].ts >= nowMs) {
        prev = snapshots[i - 1];
        next = snapshots[i];
        break;
      }
      prev = next = snapshots[i]; // nowMs is ahead of all buffered data
    }

    if (prev.ts === next.ts) return prev;

    const t = MathUtils.clamp((nowMs - prev.ts) / (next.ts - prev.ts), 0, 1);
    return {
      x:        MathUtils.lerp(prev.x, next.x, t),
      z:        MathUtils.lerp(prev.z, next.z, t),
      speed:    MathUtils.lerp(prev.speed, next.speed, t),
      input:    next.input,  // use the latest input for sprite selection
      finished: next.finished,
    };
  }

  // ── Ghost bike rendering ──────────────────────────────────────────────────

  _drawRemotePlayers() {
    if (!this._remotePlayers.size) return;

    const ctx       = this.ctx;
    const W         = this.screenW;
    const H         = this.screenH;
    const baseSeg   = findSegment(this.segments, this.position, this.segLen);
    const basePct   = MathUtils.percentRemaining(this.position, this.segLen);
    const playerSeg = findSegment(this.segments, this.position + this.playerZ, this.segLen);
    const playerPct = MathUtils.percentRemaining(this.position + this.playerZ, this.segLen);
    const playerY   = MathUtils.lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);

    for (const [, remote] of this._remotePlayers.entries()) {
      const remSeg = findSegment(this.segments, remote.z, this.segLen);

      // Only render bikes visible in the draw distance
      let segsBehind = remSeg.index - baseSeg.index;
      if (segsBehind < 0) segsBehind += this.segments.length;
      if (segsBehind >= this.drawDist) continue;

      // Pick sprite based on remote input direction
      const inp = remote.input ?? {};
      let sprite;
      if      (inp.kickLeft)  sprite = SPRITES.PLAYER_KICK_LEFT;
      else if (inp.kickRight) sprite = SPRITES.PLAYER_KICK_RIGHT;
      else if (inp.left)      sprite = SPRITES.PLAYER_LEFT;
      else if (inp.right)     sprite = SPRITES.PLAYER_RIGHT;
      else                    sprite = SPRITES.PLAYER_STRAIGHT;

      const scale    = remSeg.p1.screen.scale;
      const sprX     = remSeg.p1.screen.x + scale * remote.x * this.roadWidth * W / 2;
      const sprY     = remSeg.p1.screen.y;

      // Draw ghost bike (slightly translucent to distinguish from local player)
      ctx.save();
      ctx.globalAlpha = 0.80;
      Renderer.sprite(
        ctx, W, H, this.resolution, this.roadWidth, this.spritesImage,
        sprite, scale * 4, sprX, sprY, -0.5, -1, remSeg.clip ?? 0
      );
      ctx.restore();
    }
  }
}
