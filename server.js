// ─────────────────────────────────────────────────────────────────────────────
// Custom Next.js server with Socket.IO
//
// Run with:  node server.js   (instead of `next start` / `next dev`)
// Dev mode:  NODE_ENV=development node server.js
// ─────────────────────────────────────────────────────────────────────────────

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { Server }       = require('socket.io');
const RoomManager      = require('./lib/RoomManager');

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

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} [${dev ? 'development' : 'production'}]`);
  });
});
