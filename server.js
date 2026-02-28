// ─────────────────────────────────────────────────────────────────────────────
// Custom Next.js server with Socket.IO
//
// Run with:  node server.js   (instead of `next start` / `next dev`)
// Dev mode:  NODE_ENV=development node server.js
// ─────────────────────────────────────────────────────────────────────────────

const { createServer } = require('http');
const { parse }        = require('url');
const os               = require('os');
const next             = require('next');
const { Server }       = require('socket.io');
const RoomManager      = require('./lib/RoomManager');

/** Return the first non-loopback IPv4 address on the machine. */
function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app  = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // ── Socket.IO setup ────────────────────────────────────────────────────────
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  const rooms = new RoomManager(io);

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    const relayToPeer = (event, payload) => {
      const roomId = socket._roomId;
      if (!roomId || !payload?.to) return;
      const peers = io.sockets.adapter.rooms.get(roomId);
      if (!peers || !peers.has(payload.to)) return;
      io.to(payload.to).emit(event, { from: socket.id, ...payload });
    };

    // ── Room join ──────────────────────────────────────────────────────────
    // Payload: { playerName: string }
    socket.on('join_room', ({ playerName }) => {
      rooms.joinRoom(socket, playerName);
    });

    // ── Player input (client → server) ────────────────────────────────────
    // Payload: { left, right, up, down, kickLeft, kickRight }
    socket.on('player_input', (input) => {
      rooms.handleInput(socket, input);
    });

    socket.on('player_eliminated', () => {
      rooms.handleElimination(socket);
    });

    socket.on('near_miss', () => {
      rooms.handleNearMiss(socket);
    });

    socket.on('voice_join', () => {
      const roomId = socket._roomId;
      if (!roomId) return;
      const roomSet = io.sockets.adapter.rooms.get(roomId) || new Set();
      const peers = [...roomSet].filter((id) => id !== socket.id);
      socket.emit('voice_peers', { peers });
      socket.to(roomId).emit('voice_peer_joined', { peerId: socket.id });
    });

    socket.on('voice_offer', (payload) => relayToPeer('voice_offer', payload));
    socket.on('voice_answer', (payload) => relayToPeer('voice_answer', payload));
    socket.on('voice_ice', (payload) => relayToPeer('voice_ice', payload));

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket._roomId) socket.to(socket._roomId).emit('voice_peer_left', { peerId: socket.id });
      console.log(`[socket] disconnected: ${socket.id}`);
      rooms.leaveRoom(socket);
    });
  });

  // Listen on 0.0.0.0 so LAN peers can reach the server
  httpServer.listen(port, '0.0.0.0', () => {
    const lan = getLocalIP();
    console.log(`\n  ▲ Road Rash – ${dev ? 'development' : 'production'}\n`);
    console.log(`  Local:   http://localhost:${port}`);
    console.log(`  Network: http://${lan}:${port}  ← share this with others on your Wi-Fi\n`);
  });
});
