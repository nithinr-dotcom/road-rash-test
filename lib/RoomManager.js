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

// ─────────────────────────────────────────────────────────────────────────────

class Room {
  constructor(id, io) {
    this.id      = id;
    this.io      = io;
    this.players = new Map(); // socketId → PlayerState
    this.phase   = 'waiting'; // 'waiting' | 'countdown' | 'racing' | 'finished'
    this.tick    = null;
    this.startTime = null;

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

    if (this.players.size === 0) this._stopTick();
  }

  applyInput(socketId, input) {
    const p = this.players.get(socketId);
    if (!p || this.phase !== 'racing') return;
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
    this.phase = 'countdown';
    let count  = 3;

    this.io.to(this.id).emit('countdown', { value: count });

    const tick = setInterval(() => {
      count--;
      if (count > 0) {
        this.io.to(this.id).emit('countdown', { value: count });
      } else {
        clearInterval(tick);
        this._startRace();
      }
    }, 1000);
  }

  _startRace() {
    this.phase     = 'racing';
    this.startTime = Date.now();

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

    for (const p of this.players.values()) {
      if (!p.finished) {
        GamePhysics.updatePlayer(p, dt, TRACK_LENGTH, MAX_SPEED_SERVER);
        if (!p.finished) allFinished = false;
      }
    }

    if (allFinished && this.phase === 'racing') {
      this._endRace();
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
      for (const p of this.players.values()) GamePhysics.resetPlayer(p, 0);
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
      });
    }
    // Sort: finished first (by finish position), then by distance
    list.sort((a, b) => {
      if (a.finished && b.finished) return (a.finishPos ?? 99) - (b.finishPos ?? 99);
      if (a.finished) return -1;
      if (b.finished) return  1;
      return b.distance - a.distance;
    });
    return list;
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

  _findOpenRoom() {
    for (const room of this.rooms.values()) {
      if (!room.isFull() && room.phase !== 'finished') return room;
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
