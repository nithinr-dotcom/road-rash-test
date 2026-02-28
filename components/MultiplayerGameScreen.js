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
const RTC_CONFIG      = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export default function MultiplayerGameScreen({ socket, playerName, onGameOver }) {
  const containerRef   = useRef(null);
  const gameRef        = useRef(null);
  const socketRef      = useRef(socket);
  const inputTimerRef  = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnsRef   = useRef(new Map()); // peerId -> RTCPeerConnection
  const audioElsRef    = useRef(new Map()); // peerId -> HTMLAudioElement

  // Leaderboard displayed via React overlay
  const [board, setBoard] = useState([]);
  const [phase, setPhase] = useState('racing'); // 'racing' | 'finished'
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [voicePeers, setVoicePeers] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');

  // ── Buffer of server state snapshots for interpolation ─────────────────────
  // Map: playerId → Array<{ ts, x, z, speed, distance, input }>
  const stateBufferRef = useRef(new Map());

  function updateVoicePeerCount() {
    setVoicePeers(peerConnsRef.current.size);
  }

  function pushChatMessage(msg) {
    setChatMessages((prev) => {
      const next = [...prev, msg];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }

  function cleanupPeer(peerId) {
    const pc = peerConnsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peerConnsRef.current.delete(peerId);
    }

    const audio = audioElsRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      audioElsRef.current.delete(peerId);
    }
    updateVoicePeerCount();
  }

  function cleanupVoice() {
    for (const peerId of [...peerConnsRef.current.keys()]) cleanupPeer(peerId);
    const stream = localStreamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    setVoiceEnabled(false);
    setMicMuted(false);
  }

  function ensurePeer(peerId, sock) {
    let pc = peerConnsRef.current.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnsRef.current.set(peerId, pc);
    updateVoicePeerCount();

    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sock.emit('voice_ice', { to: peerId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      let audio = audioElsRef.current.get(peerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audioElsRef.current.set(peerId, audio);
        document.body.appendChild(audio);
      }
      audio.srcObject = e.streams[0];
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') cleanupPeer(peerId);
    };

    return pc;
  }

  async function createVoiceOffer(peerId, sock) {
    const pc = ensurePeer(peerId, sock);
    if (pc.signalingState !== 'stable') return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    sock.emit('voice_offer', { to: peerId, sdp: offer });
  }

  async function enableVoice() {
    if (voiceEnabled) return;
    const sock = socketRef.current;
    if (!sock) return;
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;
      setVoiceEnabled(true);
      setMicMuted(false);
      sock.emit('voice_join');
    } catch (err) {
      setVoiceError('Microphone permission denied.');
    }
  }

  function sendChat() {
    const sock = socketRef.current;
    const text = chatText.trim();
    if (!sock || !text) return;
    sock.emit('race_chat', { text });
    setChatText('');
  }

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;
    stateBufferRef.current.clear();

    // ── Mount Phaser ─────────────────────────────────────────────────────────
    const scene = new MultiScene({
      socket:      sock,
      playerName,
      stateBuffer: stateBufferRef.current,
      interpDelay: INTERP_DELAY_MS,
    });

    const config = {
      type:              Phaser.CANVAS,
      width:             GAME_W,
      height:            GAME_H,
      parent:            containerRef.current,
      backgroundColor:   '#72D7EE',
      clearBeforeRender: false,
      audio:             { disableWebAudio: false },
      scene:             [scene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // ── Socket event handlers ─────────────────────────────────────────────────

    // Accumulate server snapshots into per-player ring buffers
    sock.on('state_update', ({ players }) => {
      const buf = stateBufferRef.current;
      const recvTs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const activeIds = new Set(players.map((p) => p.id));
      for (const id of [...buf.keys()]) {
        if (!activeIds.has(id)) buf.delete(id);
      }
      for (const p of players) {
        if (!buf.has(p.id)) buf.set(p.id, []);
        const arr = buf.get(p.id);
        arr.push({ ts: recvTs, ...p });
        // Keep only the last 30 snapshots (~1.5 s at 20 Hz)
        if (arr.length > 30) arr.shift();
      }
    });

    sock.on('leaderboard_update', ({ board: b }) => setBoard(b));

    sock.on('race_over', ({ board: b }) => {
      setBoard(b);
      setPhase('finished');
      const currentScene = game.scene.getScene('MultiScene');
      if (currentScene) {
        currentScene._raceOver = true;
        currentScene.speed = 0;
      }
    });

    sock.on('room_reset', () => {
      setPhase('racing');
      setBoard([]);
      setChatMessages([]);
      stateBufferRef.current.clear();
      const currentScene = game.scene.getScene('MultiScene');
      if (currentScene) {
        currentScene._raceOver = false;
      }
    });

    sock.on('race_chat', (payload) => {
      if (!payload) return;
      pushChatMessage({
        playerId: payload.playerId,
        name: payload.name || 'Player',
        text: payload.text || '',
        ts: payload.ts || Date.now(),
      });
    });

    sock.on('voice_peers', async ({ peers }) => {
      if (!localStreamRef.current) return;
      for (const peerId of peers || []) {
        if (!peerId || peerId === sock.id) continue;
        try { await createVoiceOffer(peerId, sock); } catch (_) {}
      }
    });

    sock.on('voice_peer_joined', ({ peerId }) => {
      // Existing peers wait for the new joiner to initiate offers.
      if (!peerId || peerId === sock.id) return;
      updateVoicePeerCount();
    });

    sock.on('voice_offer', async ({ from, sdp }) => {
      if (!from || !sdp || !localStreamRef.current) return;
      try {
        const pc = ensurePeer(from, sock);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('voice_answer', { to: from, sdp: answer });
      } catch (_) {}
    });

    sock.on('voice_answer', async ({ from, sdp }) => {
      if (!from || !sdp) return;
      const pc = peerConnsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (_) {}
    });

    sock.on('voice_ice', async ({ from, candidate }) => {
      if (!from || !candidate) return;
      const pc = peerConnsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    });

    sock.on('voice_peer_left', ({ peerId }) => {
      if (peerId) cleanupPeer(peerId);
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
      cleanupVoice();
      sock.off('state_update');
      sock.off('leaderboard_update');
      sock.off('race_over');
      sock.off('room_reset');
      sock.off('race_chat');
      sock.off('voice_peers');
      sock.off('voice_peer_joined');
      sock.off('voice_offer');
      sock.off('voice_answer');
      sock.off('voice_ice');
      sock.off('voice_peer_left');
      sock.disconnect();
      game.destroy(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !micMuted;
    }
  }, [micMuted]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Phaser canvas */}
      <div ref={containerRef} className="game-screen" />

      {/* Leaderboard overlay (top-right) */}
      <Leaderboard board={board} phase={phase} />

      {/* Voice chat controls */}
      <div className="mp-voice-panel">
        {!voiceEnabled ? (
          <button className="mp-voice-btn" onClick={enableVoice}>
            ENABLE VOICE
          </button>
        ) : (
          <button className="mp-voice-btn" onClick={() => setMicMuted((m) => !m)}>
            {micMuted ? 'UNMUTE MIC' : 'MUTE MIC'}
          </button>
        )}
        <div className="mp-voice-meta">Voice peers: {voicePeers}</div>
        {voiceError && <div className="mp-voice-error">{voiceError}</div>}
      </div>

      <div className="mp-chat-panel">
        <div className="mp-chat-title">RACE CHAT</div>
        <div className="mp-chat-log">
          {chatMessages.map((m, idx) => (
            <div key={`${m.ts}-${idx}`} className="mp-chat-line">
              <span className="mp-chat-name">{m.name}:</span> {m.text}
            </div>
          ))}
        </div>
        <div className="mp-chat-input-row">
          <input
            className="mp-chat-input"
            value={chatText}
            maxLength={180}
            placeholder="Type message..."
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendChat();
            }}
          />
          <button className="mp-chat-send" onClick={sendChat}>SEND</button>
        </div>
      </div>

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
  constructor(mpConfig = {}) {
    // Pass unique key to Phaser so it doesn't clash with 'MainScene'
    super({ key: 'MultiScene' });
    this._socket       = mpConfig.socket ?? null;
    this._playerName   = mpConfig.playerName ?? '';
    this._stateBuffer  = mpConfig.stateBuffer ?? null;
    this._interpDelay  = mpConfig.interpDelay ?? 100;
    this._raceOver     = false;
    this._eliminationSent = false;
    this._remoteNearMissSeenAt = new Map();
  }

  create() {
    super.create();
    this.gameStarted = true;
    this.countdown = 0;
    this.goDisplayMs = 0;

    // Map: playerId → interpolated render state
    this._remotePlayers = new Map();

    // Disable AI bikes — remote players are the opponents
    for (const seg of this.segments) seg.bikes = [];
    this.bikes = [];
  }

  // Override: apply server position to local player, draw remote ghosts
  tickGame(dt) {
    if (this._raceOver) return;

    // Run local physics (input, speed, position) exactly as single-player
    super.tickGame(dt);

    // Interpolate remote players
    const nowMs = ((typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now()) - this._interpDelay;
    if (this._stateBuffer) {
      const myId = this._socket?.id;
      for (const [id, snapshots] of this._stateBuffer.entries()) {
        if (id === myId) continue; // skip self — we have local physics
        const interp = this._interpolate(snapshots, nowMs);
        if (interp) this._remotePlayers.set(id, interp);
        else this._remotePlayers.delete(id);
      }

      // Reconcile local player with authoritative server state
      if (myId) {
        const mine = this._interpolate(this._stateBuffer.get(myId), nowMs);
        if (mine) {
          this.playerX = MathUtils.lerp(this.playerX, mine.x, 0.55);
          this.speed = MathUtils.lerp(this.speed, mine.speed, 0.55);
          this.position = this._lerpWrapped(this.position, mine.z, this.trackLen, 0.55);
          if (typeof mine.distance === 'number') {
            this.distanceTravelled = mine.distance;
          }
          if (typeof mine.health === 'number') this.health = mine.health;
          if (typeof mine.nitroActive === 'boolean') this.nitroActive = mine.nitroActive;
          if (mine.fallen) this.speed = Math.min(this.speed, this.maxSpeed * 0.35);
          if (mine.finished) this.crossedFinish = true;
          if (mine.eliminated) this.eliminatePlayer();
        }
      }
    }

    this._checkRemoteNearMisses();
  }

  onEliminated() {
    if (this._eliminationSent) return;
    this._eliminationSent = true;
    this._socket?.emit('player_eliminated');
  }

  onNearMiss() {
    this._socket?.emit('near_miss');
  }

  _checkRemoteNearMisses() {
    if (!this._remotePlayers.size) return;

    const playerW = SPRITES.PLAYER_STRAIGHT.w * SPRITES.SCALE;
    const nowMs = this.time.now;
    const playerFrontZ = this.position + this.playerZ;

    for (const [id, remote] of this._remotePlayers.entries()) {
      if (!remote) continue;
      const latGap = Math.abs(this.playerX - remote.x);
      if (latGap > 0.55) continue;
      if (MathUtils.overlap(this.playerX, playerW, remote.x, playerW, 0.8)) continue;

      let dz = remote.z - playerFrontZ;
      if (dz < 0) dz += this.trackLen;
      if (dz < 0 || dz > this.segLen * 1.2) continue;
      if (this.speed <= (remote.speed ?? 0) + 500) continue;

      const seenAt = this._remoteNearMissSeenAt.get(id) ?? -999999;
      if (nowMs - seenAt < 900) continue;
      this._remoteNearMissSeenAt.set(id, nowMs);
      this.registerNearMiss();
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
      distance: MathUtils.lerp(prev.distance ?? 0, next.distance ?? 0, t),
      health:   MathUtils.lerp(prev.health ?? 100, next.health ?? 100, t),
      input:    next.input,  // use the latest input for sprite selection
      finished: next.finished,
      eliminated: next.eliminated,
      fallen:   next.fallen,
      nitroActive: !!next.nitroActive,
    };
  }

  _lerpWrapped(from, to, max, t) {
    let delta = to - from;
    if (Math.abs(delta) > max / 2) {
      delta += delta > 0 ? -max : max;
    }
    return MathUtils.wrapAround(from, delta * t, max);
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
