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

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
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
