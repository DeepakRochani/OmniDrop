// Vercel Serverless Function: Room Signaling Relay for Worldwide WebRTC P2P
// Handles /api/room/create, /api/room/join, /api/room/signal, /api/room/signals

const rooms = new Map(); // In-memory room store within the serverless container instance
const roomSignals = new Map(); // In-memory signal polling queue

// Clean up rooms older than 2 hours
function cleanupExpired() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, r] of rooms.entries()) {
    if (r.createdAt < cutoff) rooms.delete(code);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = async (req, res) => {
  // Enable CORS for worldwide access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  cleanupExpired();

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Health check / Info
  if (pathname === '/api' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'OmniDrop WebRTC Signaling Serverless' }));
    return;
  }

  // 1. Create Room
  if (req.method === 'POST' && (pathname === '/api/room/create' || pathname.endsWith('/room/create'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    let code;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(code));

    const roomPeers = new Map();
    if (data && data.peer && data.peer.id) {
      roomPeers.set(data.peer.id, data.peer);
    }
    rooms.set(code, { code, peers: roomPeers, createdAt: Date.now() });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, roomCode: code }));
    return;
  }

  // 2. Join Room
  if (req.method === 'POST' && (pathname === '/api/room/join' || pathname.endsWith('/room/join'))) {
    try {
      const data = await parseJsonBody(req);
      const { roomCode, peer } = data;
      const room = rooms.get(roomCode);
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room code not found or expired' }));
        return;
      }

      const existingPeers = Array.from(room.peers.values());
      room.peers.set(peer.id, peer);

      // Queue joined notification for other peers in room
      for (const [pid] of room.peers.entries()) {
        if (pid !== peer.id) {
          const queue = roomSignals.get(pid) || [];
          queue.push({ fromId: peer.id, signal: { type: 'room_peer_joined', roomCode, peer } });
          roomSignals.set(pid, queue);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, peers: existingPeers }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Dispatch Signal (Offer / Answer / ICE Candidate)
  if (req.method === 'POST' && (pathname === '/api/room/signal' || pathname.endsWith('/room/signal'))) {
    try {
      const data = await parseJsonBody(req);
      const { toId, fromId, signal, roomCode } = data;
      const queue = roomSignals.get(toId) || [];
      queue.push({ fromId, signal, roomCode });
      roomSignals.set(toId, queue);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. Poll Signals (for serverless Vercel clients)
  if (req.method === 'GET' && (pathname === '/api/room/signals' || pathname.endsWith('/room/signals'))) {
    const clientId = url.searchParams.get('clientId');
    if (!clientId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing clientId query parameter' }));
      return;
    }
    const signals = roomSignals.get(clientId) || [];
    roomSignals.delete(clientId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, signals }));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
};

