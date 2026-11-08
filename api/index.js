// Vercel Serverless Function: OmniDrop Universal Handler
// Serves static web assets from /public and provides WebRTC room signaling under /api/room/*

const fs = require('fs');
const path = require('path');

const rooms = new Map(); // In-memory room store within the serverless container instance
const roomSignals = new Map(); // In-memory signal polling queue

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

// Helper: reliably obtain client public IP
function getClientIp(req) {
  const xForwarded = req.headers['x-forwarded-for'];
  if (xForwarded) {
    const first = xForwarded.split(',')[0].trim();
    if (first) return first;
  }
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

// IP comparison helper for IPv4 and IPv6 subnets
function isIpMatch(ip1, ip2) {
  if (!ip1 || !ip2) return false;
  if (ip1 === ip2) return true;

  const c1 = ip1.replace(/^::ffff:/, '').trim();
  const c2 = ip2.replace(/^::ffff:/, '').trim();
  if (c1 === c2) return true;

  // IPv6 subnet comparison (/64 network prefix: first 4 hex blocks)
  if (c1.includes(':') && c2.includes(':')) {
    const p1 = c1.split(':').slice(0, 4).join(':');
    const p2 = c2.split(':').slice(0, 4).join(':');
    if (p1 && p1 === p2) return true;
  }

  // IPv4 /24 subnet comparison (first 3 octets: e.g. 192.168.1.x or public ISP subnet)
  if (c1.includes('.') && c2.includes('.')) {
    const p1 = c1.split('.').slice(0, 3).join('.');
    const p2 = c2.split('.').slice(0, 3).join('.');
    if (p1 && p1 === p2) return true;
  }

  return false;
}

// Determine if two peers share the same local Wi-Fi / LAN network
function arePeersInSameNetwork(p1, p2, clientIp) {
  if (!p1 || !p2) return false;

  // 1. Direct Public IP / Subnet Match
  const ip1 = p1.ip || clientIp;
  const ip2 = p2.ip;
  if (ip1 && ip2 && ip1 !== '127.0.0.1' && isIpMatch(ip1, ip2)) {
    return true;
  }

  // 2. Local LAN IP Match (e.g. both reporting 192.168.1.x)
  if (p1.localLanIp && p2.localLanIp && isIpMatch(p1.localLanIp, p2.localLanIp)) {
    return true;
  }

  return false;
}

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

// Serve static frontend files from /public directory
function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  if (relativePath.startsWith('/public/')) {
    relativePath = relativePath.slice('/public'.length);
  }
  const publicDir = path.join(__dirname, '..', 'public');
  const safePath = path.normalize(path.join(publicDir, relativePath));

  if (!safePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File Not Found', path: relativePath }));
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stats.size,
      'Cache-Control': relativePath.endsWith('.html') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

module.exports = async (req, res) => {
  // Enable CORS for worldwide cross-device access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  cleanupExpired();

  const clientIp = getClientIp(req);
  const rawPath = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'] || req.headers['x-forwarded-uri'] || req.url;
  const url = new URL(rawPath, `http://${req.headers.host || 'localhost'}`);
  const slugPath = req.query && req.query.slug ? '/' + [].concat(req.query.slug).join('/') : '';
  const parsedReqUrl = new URL(req.url, 'http://localhost');
  const routeParam = (req.query && req.query.route) || parsedReqUrl.searchParams.get('route') || url.searchParams.get('route') || '';
  const fullPath = `${slugPath} ${routeParam} ${url.pathname} ${req.url}`.toLowerCase();

  // 1. Health check & Diagnostics
  if (routeParam === 'health' || fullPath.includes('/health') || fullPath.includes('health') || fullPath.includes('debug')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'OmniDrop WebRTC Signaling Serverless',
      routeParam,
      fullPath,
      clientIp
    }));
    return;
  }

  // 2. Get Me / Device Info API (GET /api/me)
  if (req.method === 'GET' && (routeParam === 'me' || routeParam === 'api/me' || fullPath.includes('api/me') || fullPath.includes('/api/me'))) {
    let pin;
    do {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(pin));

    // Initialize an empty room for this PIN
    rooms.set(pin, { code: pin, peers: new Map(), createdAt: Date.now() });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'cloud_node',
      name: 'OmniDrop Cloud Relay',
      deviceType: 'cloud',
      os: 'web',
      ip: clientIp,
      port: 443,
      pin: pin,
      isHost: false,
      isCloud: true,
      downloadsDir: 'Downloads',
      protocol: 'omni-v1'
    }));
    return;
  }

  // 3. Register Web Client API (POST /api/register-web-client)
  if (req.method === 'POST' && (routeParam === 'register-web-client' || fullPath.includes('register-web-client'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    const clientId = data.id || ('web_' + Math.random().toString(36).substring(2, 10));
    let clientPin = (data.pin || '').toString().trim().replace(/\D/g, '');
    if (!clientPin || clientPin.length !== 6) {
      do {
        clientPin = Math.floor(100000 + Math.random() * 900000).toString();
      } while (rooms.has(clientPin));
    }

    const clientPeer = {
      id: clientId,
      name: data.name || (data.os ? `${data.os} Device` : 'OmniDrop Device'),
      deviceType: data.deviceType || 'phone',
      os: data.os || 'browser',
      ip: clientIp,
      localLanIp: data.localLanIp || undefined,
      port: 443,
      lastSeen: Date.now(),
      isWeb: true,
      isRemote: true,
      isWebRTC: true,
      pin: clientPin
    };

    let room = rooms.get(clientPin);
    if (!room) {
      room = { code: clientPin, peers: new Map(), createdAt: Date.now() };
      rooms.set(clientPin, room);
    }
    room.peers.set(clientId, clientPeer);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, pin: clientPin, peer: clientPeer }));
    return;
  }

  // 4. Pair by PIN API (POST /api/pair-by-pin)
  if (req.method === 'POST' && (routeParam === 'pair-by-pin' || fullPath.includes('pair-by-pin'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    const cleanPin = (data.pin || '').toString().trim().replace(/\D/g, '');
    const sender = data.sender || {};
    const room = rooms.get(cleanPin);

    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No device or room found with PIN ${cleanPin}.` }));
      return;
    }

    if (sender.id) {
      const senderPeer = {
        id: sender.id,
        name: sender.name || 'OmniDrop Peer',
        os: sender.os || 'unknown',
        deviceType: sender.deviceType || 'phone',
        isWebRTC: true,
        isRemote: true,
        pin: sender.pin || cleanPin,
        ip: clientIp,
        localLanIp: sender.localLanIp || undefined,
        lastSeen: Date.now()
      };
      room.peers.set(sender.id, senderPeer);

      for (const [pid] of room.peers.entries()) {
        if (pid !== sender.id) {
          const queue = roomSignals.get(pid) || [];
          queue.push({ fromId: sender.id, signal: { type: 'room_peer_joined', roomCode: cleanPin, peer: senderPeer } });
          roomSignals.set(pid, queue);
        }
      }
    }

    const peersList = Array.from(room.peers.values()).filter(p => p.id !== sender.id);
    const target = peersList[0] || { name: 'Remote Peer', id: 'remote', pin: cleanPin, isWebRTC: true, isRemote: true };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, target, peer: target, peers: peersList, roomCode: cleanPin, method: 'webrtc' }));
    return;
  }

  // 5. Get Discovered Peers (GET /api/peers)
  if (req.method === 'GET' && (routeParam === 'peers' || fullPath.includes('api/peers') || fullPath.includes('/api/peers'))) {
    const parsedQuery = new URL(req.url, 'http://localhost');
    const clientId = parsedQuery.searchParams.get('clientId') || url.searchParams.get('clientId') || '';
    const now = Date.now();
    const activeCutoff = now - 90000; // Active within last 90 seconds

    let callingClientPeer = null;

    // Refresh lastSeen for calling client in all rooms and find calling peer record
    if (clientId) {
      for (const room of rooms.values()) {
        if (room.peers.has(clientId)) {
          const selfPeer = room.peers.get(clientId);
          selfPeer.lastSeen = now;
          selfPeer.ip = clientIp;
          callingClientPeer = selfPeer;
        }
      }
    }

    const relevantPeers = [];
    const seen = new Set();

    // Find any room that this client has joined or created
    const clientRoomCodes = new Set();
    for (const [code, room] of rooms.entries()) {
      if (room.peers.has(clientId)) {
        clientRoomCodes.add(code);
      }
    }

    for (const [code, room] of rooms.entries()) {
      const isClientRoom = clientRoomCodes.has(code);
      for (const [pid, p] of room.peers.entries()) {
        if (pid === clientId) continue;
        if (seen.has(pid)) continue;
        if (p.id && (p.id.startsWith('omni_') || p.id === 'cloud_node')) continue; // Ignore cloud server nodes
        if (p.name && p.name.includes('Cloud Node')) continue;

        const isRecentlyActive = (p.lastSeen || p.createdAt || 0) > activeCutoff;
        if (!isRecentlyActive) continue;

        // Peer is eligible if:
        // 1. Peer is in the SAME room (explicit PIN or QR pairing)
        // 2. OR peer is on the same local Wi-Fi / LAN network
        // 3. OR peer shares the same public IP / subnet
        const isSameNetwork = arePeersInSameNetwork(callingClientPeer || { ip: clientIp }, p, clientIp);

        if (isClientRoom || isSameNetwork) {
          seen.add(pid);
          relevantPeers.push(p);
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(relevantPeers));
    return;
  }

  // 6. SSE Events Stream (GET /api/events)
  if (req.method === 'GET' && (routeParam === 'events' || fullPath.includes('api/events') || fullPath.includes('/api/events'))) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: {"type":"connected","time":' + Date.now() + '}\n\n');
    const timer = setTimeout(() => {
      try { res.end(); } catch (e) {}
    }, 25000);
    req.on('close', () => clearTimeout(timer));
    return;
  }

  // 7. Create Room API (POST /api/room/create)
  if (req.method === 'POST' && (routeParam === 'room/create' || fullPath.includes('room/create'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    let code = (data && data.roomCode) || (data && data.peer && data.peer.pin);
    if (!code || code.length !== 6) {
      do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
      } while (rooms.has(code));
    }

    let room = rooms.get(code);
    if (!room) {
      room = { code, peers: new Map(), createdAt: Date.now() };
      rooms.set(code, room);
    }

    if (data && data.peer && data.peer.id) {
      const p = Object.assign({}, data.peer, {
        ip: clientIp,
        lastSeen: Date.now(),
        isWebRTC: true,
        isRemote: true
      });
      room.peers.set(p.id, p);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, roomCode: code }));
    return;
  }

  // 8. Join Room API (POST /api/room/join)
  if (req.method === 'POST' && (routeParam === 'room/join' || fullPath.includes('room/join'))) {
    try {
      const data = await parseJsonBody(req);
      const { roomCode, peer } = data;
      const room = rooms.get(roomCode);
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room code not found or expired' }));
        return;
      }

      const peerRecord = Object.assign({}, peer, {
        ip: clientIp,
        lastSeen: Date.now(),
        isWebRTC: true,
        isRemote: true
      });

      const existingPeers = Array.from(room.peers.values());
      room.peers.set(peerRecord.id, peerRecord);

      // Queue joined notification for other peers in room
      for (const [pid] of room.peers.entries()) {
        if (pid !== peerRecord.id) {
          const queue = roomSignals.get(pid) || [];
          queue.push({ fromId: peerRecord.id, signal: { type: 'room_peer_joined', roomCode, peer: peerRecord } });
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

  // 9. Dispatch Signal API (POST /api/room/signal)
  if (req.method === 'POST' && (routeParam === 'room/signal' || fullPath.includes('room/signal'))) {
    try {
      const data = await parseJsonBody(req);
      const { toId, fromId, signal, roomCode } = data;
      const queue = roomSignals.get(toId) || [];
      queue.push({ fromId, signal, roomCode });
      roomSignals.set(toId, queue);

      // Keep sender active
      if (fromId) {
        for (const room of rooms.values()) {
          if (room.peers.has(fromId)) {
            const sp = room.peers.get(fromId);
            sp.lastSeen = Date.now();
            sp.ip = clientIp;
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 10. Poll Signals API (GET /api/room/signals)
  if (req.method === 'GET' && (routeParam === 'room/signals' || fullPath.includes('room/signals'))) {
    const parsedQuery = new URL(req.url, 'http://localhost');
    const clientId = parsedQuery.searchParams.get('clientId') || url.searchParams.get('clientId');
    if (!clientId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing clientId query parameter' }));
      return;
    }

    // Update heartbeat of polling client
    for (const room of rooms.values()) {
      if (room.peers.has(clientId)) {
        const selfPeer = room.peers.get(clientId);
        selfPeer.lastSeen = Date.now();
        selfPeer.ip = clientIp;
      }
    }

    const signals = roomSignals.get(clientId) || [];
    roomSignals.delete(clientId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, signals }));
    return;
  }

  // 11. Clipboard Sync API (POST /api/clipboard/sync)
  if (req.method === 'POST' && (routeParam === 'clipboard/sync' || fullPath.includes('clipboard/sync'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    const { text, targetId, sender } = data;
    const fromId = (sender && sender.id) || 'unknown';

    if (targetId && targetId !== 'all') {
      const queue = roomSignals.get(targetId) || [];
      queue.push({
        fromId,
        signal: {
          type: 'CLIPBOARD',
          text,
          isUrl: typeof text === 'string' && /^https?:\/\//i.test(text.trim()),
          sender: sender || { name: 'Nearby Device' },
          timestamp: Date.now()
        }
      });
      roomSignals.set(targetId, queue);
    } else {
      for (const [pid, queue] of roomSignals.entries()) {
        if (pid !== fromId) {
          queue.push({
            fromId,
            signal: {
              type: 'CLIPBOARD',
              text,
              isUrl: typeof text === 'string' && /^https?:\/\//i.test(text.trim()),
              sender: sender || { name: 'Nearby Device' },
              timestamp: Date.now()
            }
          });
          roomSignals.set(pid, queue);
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 12. Transfer Request API (POST /api/transfer/request)
  if (req.method === 'POST' && (routeParam === 'transfer/request' || fullPath.includes('transfer/request'))) {
    const data = await parseJsonBody(req).catch(() => ({}));
    const { transferId, sender, targetId, files, totalSize } = data;

    if (targetId) {
      const queue = roomSignals.get(targetId) || [];
      queue.push({
        fromId: sender ? sender.id : 'unknown',
        signal: {
          type: 'transfer_request',
          transferId,
          sender,
          targetId,
          files,
          totalSize
        }
      });
      roomSignals.set(targetId, queue);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, accepted: true }));
    return;
  }

  // 13. API 404 Fallback (never serve static files for /api/* requests)
  if (routeParam || url.pathname.startsWith('/api/') || (req.query && req.query.slug)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API endpoint not found', path: url.pathname, routeParam }));
    return;
  }

  // 14. Static frontend files fallback
  serveStatic(req, res, url.pathname);
};
