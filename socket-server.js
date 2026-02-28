// ─────────────────────────────────────────────────────────────────────────────
// Standalone Socket.IO server – deployed on Render (or any persistent host).
//
// This file does NOT serve the Next.js app.
// The Next.js app is deployed separately on Vercel.
//
// Render start command:  node socket-server.js
// ─────────────────────────────────────────────────────────────────────────────

const http        = require('http');
const { Server }  = require('socket.io');
const RoomManager = require('./lib/RoomManager');

const port = parseInt(process.env.PORT || '4000', 10);

// Allow requests from any Vercel preview URL and production domain.
// Set ALLOWED_ORIGIN in Render env vars to your exact Vercel URL, e.g.:
//   https://road-rash-test.vercel.app
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const httpServer = http.createServer((req, res) => {
  // Simple health-check endpoint so Render knows the service is alive
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[socket] connected:    ${socket.id}`);

  socket.on('join_room', ({ playerName }) => {
    rooms.joinRoom(socket, playerName);
  });

  socket.on('player_input', (input) => {
    rooms.handleInput(socket, input);
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
    rooms.leaveRoom(socket);
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`\n  Road Rash Socket.IO server\n`);
  console.log(`  Listening on port ${port}`);
  console.log(`  CORS origin:   ${ALLOWED_ORIGIN}\n`);
});
