// ─────────────────────────────────────────────────────────────────────────────
// MultiplayerLobby
//
// Shown after the player enters their name and before the race starts.
// Displays connected players, countdown, and connection status.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const MAX_PLAYERS  = 5;
const MIN_TO_START = 2;

export default function MultiplayerLobby({ onRaceStart, onBack }) {
  const [name,       setName]       = useState('');
  const [nameSet,    setNameSet]    = useState(false);
  const [status,     setStatus]     = useState('disconnected'); // disconnected|connecting|waiting|countdown|racing
  const [players,    setPlayers]    = useState([]);
  const [countdown,  setCountdown]  = useState(null);
  const [error,      setError]      = useState('');
  const [roomId,     setRoomId]     = useState('');
  const socketRef = useRef(null);
  const handoffToGameRef = useRef(false);

  // Build and store socket; cleaned up on unmount
  useEffect(() => {
    if (!nameSet) return;

    setStatus('connecting');

    // In production (Vercel) connect to the separate Render socket server.
    // NEXT_PUBLIC_SOCKET_URL must be set in Vercel env vars, e.g.:
    //   https://road-rash-socket.onrender.com
    // In local dev (same-origin custom server) leave it unset → connects to self.
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('waiting');
      socket.emit('join_room', { playerName: name });
    });

    socket.on('room_joined', ({ roomId: rid, players: ps }) => {
      setRoomId(rid);
      setPlayers(ps);
    });

    socket.on('player_joined', ({ player, total }) => {
      setPlayers(prev => {
        // Avoid duplicates
        if (prev.find(p => p.id === player.id)) return prev;
        return [...prev, player];
      });
    });

    socket.on('player_left', ({ playerId }) => {
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    });

    socket.on('countdown', ({ value }) => {
      setStatus('countdown');
      setCountdown(value);
    });

    socket.on('race_start', () => {
      setStatus('racing');
      setCountdown(null);
      handoffToGameRef.current = true;
      // Hand the socket to the game screen
      onRaceStart(socket, name);
    });

    socket.on('error', ({ message }) => setError(message));
    socket.on('disconnect', () => setStatus('disconnected'));

    return () => {
      // Keep socket alive when moving from lobby -> game screen.
      // Parent now owns this connection and passes it into MultiplayerGameScreen.
      if (!handoffToGameRef.current) socket.disconnect();
    };
  }, [nameSet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Name entry ────────────────────────────────────────────────────────────
  if (!nameSet) {
    return (
      <div className="lobby-screen">
        <button className="lobby-back" onClick={onBack}>← Back</button>
        <h1 className="lobby-title">MULTIPLAYER</h1>
        <div className="lobby-name-form">
          <input
            className="lobby-input"
            placeholder="Enter your name"
            maxLength={16}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && setNameSet(true)}
          />
          <button
            className="lobby-btn"
            disabled={!name.trim()}
            onClick={() => setNameSet(true)}
          >
            JOIN GAME
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting room ──────────────────────────────────────────────────────────
  return (
    <div className="lobby-screen">
      <button className="lobby-back" onClick={onBack}>← Back</button>
      <h1 className="lobby-title">WAITING ROOM</h1>

      {roomId && <p className="lobby-room-id">Room: {roomId}</p>}

      {error && <p className="lobby-error">{error}</p>}

      <div className="lobby-players">
        {players.map((p, i) => (
          <div key={p.id} className="lobby-player">
            <span className="lobby-player__num">{i + 1}</span>
            <span className="lobby-player__name">{p.name}</span>
            {p.id === socketRef.current?.id && <span className="lobby-player__you">(you)</span>}
          </div>
        ))}
        {/* Empty slots */}
        {Array.from({ length: MAX_PLAYERS - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="lobby-player lobby-player--empty">
            <span className="lobby-player__num">{players.length + i + 1}</span>
            <span className="lobby-player__name">Waiting...</span>
          </div>
        ))}
      </div>

      <div className="lobby-status">
        {status === 'connecting' && <p>Connecting to server…</p>}
        {status === 'waiting' && players.length < MIN_TO_START && (
          <p>Waiting for at least {MIN_TO_START} players…</p>
        )}
        {status === 'waiting' && players.length >= MIN_TO_START && (
          <p>Starting soon…</p>
        )}
        {status === 'countdown' && countdown !== null && (
          <p className="lobby-countdown">{countdown}</p>
        )}
      </div>
    </div>
  );
}
