// ─────────────────────────────────────────────────────────────────────────────
// RoomManager – authoritative server-side multiplayer state
//
// Responsibilities:
//   • Create / destroy rooms automatically
//   • Enforce max-5-players limit
//   • Run the server-side physics tick at 20 Hz
//   • Validate and apply player inputs
//   • Broadcast game state deltas to all room members
//   • Track and broadcast leaderboard
// ─────────────────────────────────────────────────────────────────────────────

const GamePhysics = require('./GamePhysics');

const MAX_PLAYERS      = 5;
const MIN_TO_START     = 2;
const TICK_RATE        = 20;               // updates per second
const TICK_MS          = 1000 / TICK_RATE;
const TRACK_LENGTH     = 1_680_000;        // segments × segLen (matches client)
const MAX_SPEED_SERVER = 40_000;           // segLen / (1/60) – same as client
const KICK_RANGE_Z     = 280;              // world-z distance for PvP kick hit
const KICK_RANGE_X     = 0.45;             // lateral hit window
const KICK_COOLDOWN_MS = 650;
const FALL_MS          = 1200;
const KICK_DAMAGE      = 22;
const KICK_PUSH_X      = 0.55;

// ─────────────────────────────────────────────────────────────────────────────

class Room {
  constructor(id, io) {
    this.id      = id;
    this.io      = io;
    this.players = new Map(); // socketId → PlayerState
    this.phase   = 'waiting'; // 'waiting' | 'countdown' | 'racing' | 'finished'
    this.tick    = null;
    this.startTime = null;
    this.finishCounter = 0;
    this.countdownTick = null;

    // Global leaderboard (persists across matches in this room instance)
    this.leaderboard = [];
  }

  // ── Player management ────────────────────────────────────────────────────

  addPlayer(socket, name) {
    if (this.players.size >= MAX_PLAYERS) return false;

    const state = GamePhysics.createPlayer(socket.id, name, this.players.size);
    this.players.set(socket.id, state);

    socket.join(this.id);
    socket.emit('room_joined', {
      roomId:    this.id,
      playerId:  socket.id,
      phase:     this.phase,
      players:   this._publicPlayers(),
    });

    this.io.to(this.id).emit('player_joined', {
      player:  state.public(),
      total:   this.players.size,
    });

    console.log(`[room:${this.id}] ${name} joined (${this.players.size}/${MAX_PLAYERS})`);

    // Auto-start countdown when MIN_TO_START players are present
    if (this.players.size >= MIN_TO_START && this.phase === 'waiting') {
      this._startCountdown();
    }

    return true;
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;

    this.players.delete(socketId);
    this.io.to(this.id).emit('player_left', { playerId: socketId, name: p.name });
    console.log(`[room:${this.id}] ${p.name} left (${this.players.size} remaining)`);

    if (this.phase === 'countdown' && this.players.size < MIN_TO_START) {
      this._cancelCountdown();
    }

    if (this.players.size === 0) {
      this._cancelCountdown();
      this._stopTick();
      this.phase = 'waiting';
    }
  }

  applyInput(socketId, input) {
    const p = this.players.get(socketId);
    if (!p || p.eliminated || this.phase !== 'racing') return;
    // Validate: all fields must be booleans
    p.input = {
      left:      !!input.left,
      right:     !!input.right,
      up:        !!input.up,
      down:      !!input.down,
      kickLeft:  !!input.kickLeft,
      kickRight: !!input.kickRight,
    };
  }

  isEmpty() { return this.players.size === 0; }
  isFull()  { return this.players.size >= MAX_PLAYERS; }

  // ── Countdown ────────────────────────────────────────────────────────────

  _startCountdown() {
    if (this.countdownTick) return;
    this.phase = 'countdown';
    let count  = 3;

    this.io.to(this.id).emit('countdown', { value: count });

    this.countdownTick = setInterval(() => {
      count--;
      if (count > 0) {
        this.io.to(this.id).emit('countdown', { value: count });
      } else {
        this._cancelCountdown();
        this._startRace();
      }
    }, 1000);
  }

  _cancelCountdown() {
    if (this.countdownTick) {
      clearInterval(this.countdownTick);
      this.countdownTick = null;
    }
    if (this.phase === 'countdown') {
      this.phase = 'waiting';
      this.io.to(this.id).emit('countdown_cancelled', {});
    }
  }

  _startRace() {
    this.phase     = 'racing';
    this.startTime = Date.now();
    this.finishCounter = 0;
    this._cancelCountdown();

    // Reset all players to starting positions
    let i = 0;
    for (const p of this.players.values()) {
      GamePhysics.resetPlayer(p, i++);
    }

    this.io.to(this.id).emit('race_start', { ts: this.startTime });
    this._startTick();
  }

  // ── Server-side physics tick ─────────────────────────────────────────────

  _startTick() {
    let lastTime = Date.now();

    this.tick = setInterval(() => {
      const now  = Date.now();
      const dt   = Math.min((now - lastTime) / 1000, 1 / 15); // cap at 15 fps equiv
      lastTime   = now;

      this._update(dt);
      this._broadcast();
    }, TICK_MS);
  }

  _stopTick() {
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
  }

  _update(dt) {
    let allFinished = true;
    const nowMs = Date.now();

    for (const p of this.players.values()) {
      if (!p.finished && !p.eliminated) {
        const wasFinished = p.finished;
        GamePhysics.updatePlayer(p, dt, TRACK_LENGTH, MAX_SPEED_SERVER, nowMs);
        if (!wasFinished && p.finished && p.finishPosition == null) {
          this.finishCounter += 1;
          p.finishPosition = this.finishCounter;
        }
      }
      if (!p.finished && !p.eliminated) {
        allFinished = false;
      }
    }

    this._resolvePlayerKicks(nowMs);

    if (allFinished && this.phase === 'racing') {
      this._endRace();
    }
  }

  _resolvePlayerKicks(nowMs) {
    const riders = [...this.players.values()].filter(
      (p) => !p.finished && !p.eliminated
    );
    for (const attacker of riders) {
      const wantsKickLeft = !!attacker.input?.kickLeft;
      const wantsKickRight = !!attacker.input?.kickRight;
      if (!wantsKickLeft && !wantsKickRight) continue;
      if ((attacker.knockedUntilMs ?? 0) > nowMs) continue;
      if (nowMs - (attacker.lastKickAtMs ?? 0) < KICK_COOLDOWN_MS) continue;

      let target = null;
      let bestDz = Infinity;

      for (const candidate of riders) {
        if (candidate.id === attacker.id) continue;
        const dx = candidate.playerX - attacker.playerX;
        if (Math.abs(dx) > KICK_RANGE_X) continue;

        const onLeft = dx < 0;
        if (wantsKickLeft && !onLeft) continue;
        if (wantsKickRight && onLeft) continue;

        const dzRaw = Math.abs(candidate.position - attacker.position);
        const dz = Math.min(dzRaw, TRACK_LENGTH - dzRaw);
        if (dz > KICK_RANGE_Z) continue;
        if (dz < bestDz) {
          bestDz = dz;
          target = candidate;
        }
      }

      if (!target) continue;

      attacker.lastKickAtMs = nowMs;
      target.knockedUntilMs = Math.max(target.knockedUntilMs ?? 0, nowMs + FALL_MS);
      target.health = Math.max(0, (target.health ?? 100) - KICK_DAMAGE);
      target.speed = Math.max(0, target.speed * 0.45);
      target.playerX = Math.max(
        -2,
        Math.min(2, target.playerX + (wantsKickLeft ? -KICK_PUSH_X : KICK_PUSH_X))
      );

      this.io.to(this.id).emit('player_kicked', {
        by: attacker.id,
        target: target.id,
      });

      if (target.health <= 0) this._eliminatePlayer(target);
    }
  }

  _broadcast() {
    // Send only changed fields (delta update)
    const states = [];
    for (const p of this.players.values()) {
      states.push(p.snapshot());
    }

    this.io.to(this.id).emit('state_update', {
      ts:      Date.now(),
      players: states,
    });

    // Leaderboard refresh every tick
    this.io.to(this.id).emit('leaderboard_update', {
      board: this._buildLeaderboard(),
    });
  }

  // ── Race end ─────────────────────────────────────────────────────────────

  _endRace() {
    this.phase = 'finished';
    this._stopTick();

    const board = this._buildLeaderboard();
    this.leaderboard = board; // persist for global view

    this.io.to(this.id).emit('race_over', { board });

    // Reset to waiting after 10 s so the room can be reused
    setTimeout(() => {
      this.phase = 'waiting';
      let i = 0;
      for (const p of this.players.values()) GamePhysics.resetPlayer(p, i++);
      this.io.to(this.id).emit('room_reset', {});
    }, 10_000);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  _buildLeaderboard() {
    const list = [];
    for (const p of this.players.values()) {
      list.push({
        playerId:      p.id,
        name:          p.name,
        distance:      Math.round(p.distanceTravelled),
        speed:         Math.round(p.speed),
        finishPos:     p.finishPosition ?? null,
        finished:      p.finished,
        eliminated:    !!p.eliminated,
        health:        Math.round(p.health ?? 100),
      });
    }
    // Sort: finishers first, then active racers by distance, then eliminated racers
    list.sort((a, b) => {
      if (a.finished && b.finished) return (a.finishPos ?? 99) - (b.finishPos ?? 99);
      if (a.finished) return -1;
      if (b.finished) return  1;
      if (a.eliminated && !b.eliminated) return 1;
      if (!a.eliminated && b.eliminated) return -1;
      return b.distance - a.distance;
    });
    return list;
  }

  _eliminatePlayer(p) {
    if (!p || p.finished || p.eliminated) return;
    p.eliminated = true;
    p.health = 0;
    p.speed = 0;
    p.input = { left: false, right: false, up: false, down: false, kickLeft: false, kickRight: false };
    this.io.to(this.id).emit('player_eliminated', { playerId: p.id, name: p.name });
  }

  markEliminated(socketId) {
    const p = this.players.get(socketId);
    if (!p || this.phase !== 'racing') return;
    this._eliminatePlayer(p);
  }

  applyNearMiss(socketId) {
    const p = this.players.get(socketId);
    if (!p || this.phase !== 'racing' || p.finished || p.eliminated) return;
    GamePhysics.registerNearMiss(p, Date.now());
  }

  _publicPlayers() {
    return [...this.players.values()].map(p => p.public());
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class RoomManager {
  constructor(io) {
    this.io    = io;
    this.rooms = new Map(); // roomId → Room
    this._nextId = 1;
  }

  // Find an open room or create a new one
  joinRoom(socket, playerName) {
    let room = this._findOpenRoom();
    if (!room) room = this._createRoom();

    const joined = room.addPlayer(socket, playerName);
    if (!joined) {
      socket.emit('error', { message: 'Room is full. Please try again.' });
    }

    // Tag socket so we know which room it's in on disconnect
    socket._roomId = room.id;
  }

  leaveRoom(socket) {
    const roomId = socket._roomId;
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(socket.id);

    if (room.isEmpty()) {
      this.rooms.delete(roomId);
      console.log(`[rooms] room ${roomId} removed (empty)`);
    }
  }

  handleInput(socket, input) {
    const room = this.rooms.get(socket._roomId);
    if (room) room.applyInput(socket.id, input);
  }

  handleElimination(socket) {
    const room = this.rooms.get(socket._roomId);
    if (room) room.markEliminated(socket.id);
  }

  handleNearMiss(socket) {
    const room = this.rooms.get(socket._roomId);
    if (room) room.applyNearMiss(socket.id);
  }

  _findOpenRoom() {
    for (const room of this.rooms.values()) {
      if (!room.isFull() && (room.phase === 'waiting' || room.phase === 'countdown')) return room;
    }
    return null;
  }

  _createRoom() {
    const id   = `room_${this._nextId++}`;
    const room = new Room(id, this.io);
    this.rooms.set(id, room);
    console.log(`[rooms] created room ${id}`);
    return room;
  }
}

module.exports = RoomManager;
