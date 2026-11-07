const http = require('http');
const https = require('https');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream');

// --- Configuration & Constants ---
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 53317;
const UDP_PORT = 53317;
const BROADCAST_INTERVAL_MS = 3000;
const PEER_TIMEOUT_MS = 10000;
const PROTOCOL_TAG = 'omnidrop-v1';

// Downloads directory: check ~/Downloads/OmniDrop or fallback to workspace downloads/
let DOWNLOADS_DIR = process.env.DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads', 'OmniDrop');
try {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
} catch (err) {
  // Fallback to local workspace downloads directory if ~/Downloads is restricted
  DOWNLOADS_DIR = path.join(__dirname, 'downloads');
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

// Persistent device identity
const DEVICE_ID_FILE = path.join(__dirname, '.device_id');
let deviceId = '';
if (fs.existsSync(DEVICE_ID_FILE)) {
  try {
    deviceId = fs.readFileSync(DEVICE_ID_FILE, 'utf8').trim();
  } catch (e) {}
}
if (!deviceId) {
  deviceId = 'dev_' + crypto.randomBytes(6).toString('hex');
  try {
    fs.writeFileSync(DEVICE_ID_FILE, deviceId, 'utf8');
  } catch (e) {}
}

let deviceName = `${os.hostname().replace(/\.local$/i, '')}`;
const detectedOS = process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : 'linux');
const deviceType = 'desktop';

// In-memory states
const peers = new Map(); // id -> { id, name, deviceType, os, ip, port, lastSeen, isWeb }
const sseClients = new Set(); // Set of http.ServerResponse
const activeTransfers = new Map(); // transferId -> { id, sender, receiver, files, status, totalBytes, transferredBytes, resolveAccept }
const receivedFilesHistory = [];

// Helper: Get local IP addresses and broadcast addresses
function getNetworkInterfacesInfo() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  const broadcasts = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // IPv4, non-internal
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
        // Calculate standard subnet broadcast
        const parts = net.address.split('.').map(Number);
        if (parts.length === 4) {
          broadcasts.push(`${parts[0]}.${parts[1]}.${parts[2]}.255`);
        }
      }
    }
  }
  broadcasts.push('255.255.255.255');
  return {
    primaryIp: addresses[0] || '127.0.0.1',
    allIps: addresses,
    broadcasts: Array.from(new Set(broadcasts))
  };
}

const networkInfo = getNetworkInterfacesInfo();

// --- SSE Event Dispatcher ---
function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// --- UDP Discovery Service ---
let udpSocket = null;
function startDiscovery(httpPort) {
  udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpSocket.on('error', (err) => {
    console.warn(`[Discovery UDP Warning]: ${err.message}`);
  });

  udpSocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString('utf8'));
      if (data.protocol !== PROTOCOL_TAG || data.id === deviceId) {
        return; // Ignore other protocols and own beacon
      }

      const peerIp = data.ip || rinfo.address;
      const peerPort = data.port || UDP_PORT;

      if (data.type === 'GOODBYE') {
        if (peers.has(data.id)) {
          peers.delete(data.id);
          broadcastSSE('peer_left', { id: data.id });
        }
        return;
      }

      if (data.type === 'BEACON') {
        const isNew = !peers.has(data.id);
        const peerRecord = {
          id: data.id,
          name: data.name || 'Nearby Device',
          deviceType: data.deviceType || 'unknown',
          os: data.os || 'unknown',
          ip: peerIp,
          port: peerPort,
          lastSeen: Date.now(),
          isWeb: !!data.isWeb
        };
        peers.set(data.id, peerRecord);
        if (isNew) {
          broadcastSSE('peer_joined', peerRecord);
        } else {
          broadcastSSE('peer_updated', peerRecord);
        }
      }
    } catch (e) {
      // Ignore malformed packets
    }
  });

  udpSocket.bind(UDP_PORT, () => {
    try {
      udpSocket.setBroadcast(true);
      console.log(`[Discovery] UDP beacon listening on port ${UDP_PORT}`);
    } catch (e) {
      console.warn(`[Discovery] Could not enable broadcast: ${e.message}`);
    }
  });

  // Broadcast own presence periodically
  setInterval(() => {
    const net = getNetworkInterfacesInfo();
    const beacon = JSON.stringify({
      protocol: PROTOCOL_TAG,
      type: 'BEACON',
      id: deviceId,
      name: deviceName,
      deviceType: deviceType,
      os: detectedOS,
      ip: net.primaryIp,
      port: httpPort,
      timestamp: Date.now()
    });

    const buf = Buffer.from(beacon, 'utf8');
    for (const bcast of net.broadcasts) {
      try {
        udpSocket.send(buf, 0, buf.length, UDP_PORT, bcast);
      } catch (e) {}
    }

    // Prune stale peers
    const now = Date.now();
    for (const [id, peer] of peers.entries()) {
      // Don't expire active web browser sessions if they stay connected via SSE
      if (!peer.isWeb && now - peer.lastSeen > PEER_TIMEOUT_MS) {
        peers.delete(id);
        broadcastSSE('peer_left', { id });
      }
    }
  }, BROADCAST_INTERVAL_MS);
}

// Send goodbye on shutdown
function sendGoodbye() {
  if (!udpSocket) return;
  const goodbye = JSON.stringify({
    protocol: PROTOCOL_TAG,
    type: 'GOODBYE',
    id: deviceId
  });
  const buf = Buffer.from(goodbye, 'utf8');
  const net = getNetworkInterfacesInfo();
  for (const bcast of net.broadcasts) {
    try {
      udpSocket.send(buf, 0, buf.length, UDP_PORT, bcast);
    } catch (e) {}
  }
}

process.on('SIGINT', () => {
  sendGoodbye();
  process.exit(0);
});
process.on('SIGTERM', () => {
  sendGoodbye();
  process.exit(0);
});

// --- HTTP Server & Static Assets ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(path.join(__dirname, 'public', relativePath));
  if (!safePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB max for json
        req.destroy();
        reject(new Error('JSON body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Generate unique filename if file already exists in downloads
function getSafeUniquePath(folder, originalName) {
  const sanitized = path.basename(originalName).replace(/[^\w\d\.\-\s\(\)\[\]]/g, '_');
  let target = path.join(folder, sanitized);
  if (!fs.existsSync(target)) return target;

  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  let counter = 1;
  while (fs.existsSync(target)) {
    target = path.join(folder, `${base} (${counter})${ext}`);
    counter++;
  }
  return target;
}

// Format bytes helper
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- Request Handler ---
function handleRequest(req, res) {
  // Enable CORS for local cross-device requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // --- API: Get Self Info ---
  if (req.method === 'GET' && pathname === '/api/me') {
    const net = getNetworkInterfacesInfo();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: deviceId,
      name: deviceName,
      deviceType: deviceType,
      os: detectedOS,
      ip: net.primaryIp,
      allIps: net.allIps,
      port: server.address() ? server.address().port : DEFAULT_PORT,
      downloadsDir: DOWNLOADS_DIR,
      protocol: PROTOCOL_TAG
    }));
    return;
  }

  // --- API: Rename Device ---
  if (req.method === 'POST' && pathname === '/api/me/rename') {
    parseJsonBody(req).then(data => {
      if (data.name && typeof data.name === 'string') {
        deviceName = data.name.trim().slice(0, 50);
        broadcastSSE('device_renamed', { id: deviceId, name: deviceName });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: deviceName }));
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid name' }));
      }
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: Get Discovered Peers ---
  if (req.method === 'GET' && pathname === '/api/peers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.from(peers.values())));
    return;
  }

  // --- API: Register Web Client Peer ---
  // When an iPhone/Android/PC opens the app in a web browser, it announces itself
  if (req.method === 'POST' && pathname === '/api/register-web-client') {
    parseJsonBody(req).then(data => {
      const clientIp = req.socket.remoteAddress.replace(/^.*:/, '');
      const clientPeer = {
        id: data.id || ('web_' + crypto.randomBytes(4).toString('hex')),
        name: data.name || (data.os ? `${data.os} Web Client` : 'Web Browser'),
        deviceType: data.deviceType || 'phone',
        os: data.os || 'browser',
        ip: clientIp,
        port: server.address().port,
        lastSeen: Date.now(),
        isWeb: true
      };
      peers.set(clientPeer.id, clientPeer);
      broadcastSSE('peer_joined', clientPeer);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, peer: clientPeer }));
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: SSE Event Stream ---
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: init\ndata: ${JSON.stringify({ id: deviceId, name: deviceName, os: detectedOS })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --- API: Send Instant Text / Clipboard ---
  if (req.method === 'POST' && pathname === '/api/send/text') {
    parseJsonBody(req).then(async data => {
      const { targetIp, targetPort, text, senderName } = data;
      if (!targetIp || !targetPort || !text) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing parameters' }));
        return;
      }

      // Forward text directly to target device HTTP endpoint
      const postData = JSON.stringify({
        sender: { id: deviceId, name: deviceName, os: detectedOS },
        text: text,
        timestamp: Date.now()
      });

      const clientReq = http.request({
        hostname: targetIp,
        port: targetPort,
        path: '/api/receive/text',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      }, targetRes => {
        let respBody = '';
        targetRes.on('data', c => respBody += c);
        targetRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      });

      clientReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Failed to reach device: ${err.message}` }));
      });

      clientReq.write(postData);
      clientReq.end();
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: Receive Text Endpoint (Target Device) ---
  if (req.method === 'POST' && pathname === '/api/receive/text') {
    parseJsonBody(req).then(data => {
      broadcastSSE('clipboard_received', {
        sender: data.sender || { name: 'Nearby Device' },
        text: data.text,
        timestamp: data.timestamp || Date.now()
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: Initiate File Transfer Handshake (Sender to Receiver) ---
  // Called by sender's frontend to ask receiver for permission
  if (req.method === 'POST' && pathname === '/api/transfer/request') {
    parseJsonBody(req).then(data => {
      const { transferId, sender, files, totalSize } = data;
      if (!transferId || !files || !Array.isArray(files)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid transfer payload' }));
        return;
      }

      // Store transfer pending receiver acceptance
      let resolveAcceptance;
      const acceptPromise = new Promise(resolve => {
        resolveAcceptance = resolve;
      });

      activeTransfers.set(transferId, {
        id: transferId,
        sender: sender,
        files: files,
        totalSize: totalSize,
        status: 'pending',
        transferredBytes: 0,
        createdAt: Date.now(),
        resolveAccept: resolveAcceptance
      });

      // Notify local UI that someone wants to send files
      broadcastSSE('transfer_request', {
        transferId,
        sender,
        files,
        totalSize,
        formattedSize: formatBytes(totalSize)
      });

      // Wait up to 60 seconds for receiver user to click Accept or Decline
      const timeout = setTimeout(() => {
        if (activeTransfers.has(transferId) && activeTransfers.get(transferId).status === 'pending') {
          resolveAcceptance(false);
          activeTransfers.delete(transferId);
          broadcastSSE('transfer_cancelled', { transferId, reason: 'Timeout' });
        }
      }, 60000);

      acceptPromise.then(accepted => {
        clearTimeout(timeout);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          accepted: accepted,
          transferId: transferId,
          receiver: { id: deviceId, name: deviceName, os: detectedOS }
        }));
      });
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: Receiver Responds to Transfer Request (Accept / Decline) ---
  if (req.method === 'POST' && pathname === '/api/transfer/respond') {
    parseJsonBody(req).then(data => {
      const { transferId, accepted } = data;
      const transfer = activeTransfers.get(transferId);
      if (!transfer) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Transfer not found or timed out' }));
        return;
      }

      transfer.status = accepted ? 'accepted' : 'declined';
      if (transfer.resolveAccept) {
        transfer.resolveAccept(accepted);
      }

      broadcastSSE('transfer_response_sent', { transferId, accepted });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, accepted }));
    }).catch(err => {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // --- API: Stream Binary File Chunk (Sender -> Receiver) ---
  // High-speed binary upload endpoint
  if (req.method === 'POST' && pathname.startsWith('/api/transfer/upload/')) {
    const parts = pathname.replace('/api/transfer/upload/', '').split('/');
    const transferId = parts[0];
    const fileIndex = parseInt(parts[1] || '0', 10);

    const transfer = activeTransfers.get(transferId);
    if (!transfer) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Transfer session expired' }));
      return;
    }

    const fileMeta = transfer.files[fileIndex];
    if (!fileMeta) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid file index' }));
      return;
    }

    const savePath = getSafeUniquePath(DOWNLOADS_DIR, fileMeta.name);
    const writeStream = fs.createWriteStream(savePath);
    const hash = crypto.createHash('sha256');

    let fileReceivedBytes = 0;
    let lastProgressTime = Date.now();
    let lastTransferredBytes = transfer.transferredBytes;

    req.on('data', chunk => {
      fileReceivedBytes += chunk.length;
      transfer.transferredBytes += chunk.length;
      hash.update(chunk);

      // Throttled SSE progress events (every 150ms)
      const now = Date.now();
      if (now - lastProgressTime > 150) {
        const timeDiffSec = (now - lastProgressTime) / 1000;
        const bytesDiff = transfer.transferredBytes - lastTransferredBytes;
        const speedBytesPerSec = timeDiffSec > 0 ? (bytesDiff / timeDiffSec) : 0;

        broadcastSSE('transfer_progress', {
          transferId,
          fileIndex,
          fileName: fileMeta.name,
          fileBytes: fileReceivedBytes,
          fileTotal: fileMeta.size,
          totalTransferred: transfer.transferredBytes,
          totalSize: transfer.totalSize,
          speedFormatted: formatBytes(speedBytesPerSec) + '/s',
          percentage: Math.min(100, Math.round((transfer.transferredBytes / transfer.totalSize) * 100))
        });

        lastProgressTime = now;
        lastTransferredBytes = transfer.transferredBytes;
      }
    });

    pipeline(req, writeStream, err => {
      if (err) {
        console.error(`[Upload Error]: ${err.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to write file' }));
        return;
      }

      const fileSha256 = hash.digest('hex');
      const record = {
        name: path.basename(savePath),
        originalName: fileMeta.name,
        size: fileReceivedBytes,
        formattedSize: formatBytes(fileReceivedBytes),
        path: savePath,
        sha256: fileSha256,
        receivedAt: Date.now(),
        sender: transfer.sender ? transfer.sender.name : 'Nearby Peer'
      };
      receivedFilesHistory.unshift(record);
      if (receivedFilesHistory.length > 50) receivedFilesHistory.pop();

      // Check if all files in transfer completed
      const isAllComplete = (fileIndex === transfer.files.length - 1) || (transfer.transferredBytes >= transfer.totalSize);

      if (isAllComplete) {
        broadcastSSE('transfer_complete', {
          transferId,
          totalFiles: transfer.files.length,
          totalSize: transfer.totalSize,
          savedDirectory: DOWNLOADS_DIR,
          lastFile: record
        });
        activeTransfers.delete(transferId);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        savedAs: path.basename(savePath),
        sha256: fileSha256,
        isAllComplete
      }));
    });
    return;
  }

  // --- API: List Recently Received Files ---
  if (req.method === 'GET' && pathname === '/api/received') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(receivedFilesHistory));
    return;
  }

  // --- API: Direct Download a Received File ---
  if (req.method === 'GET' && pathname.startsWith('/api/download/')) {
    const filename = decodeURIComponent(pathname.replace('/api/download/', ''));
    const safePath = path.join(DOWNLOADS_DIR, path.basename(filename));

    if (!fs.existsSync(safePath)) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const stat = fs.statSync(safePath);
    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${path.basename(safePath)}"`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size
    });
    fs.createReadStream(safePath).pipe(res);
    return;
  }

  // --- API: Open Download Folder in OS Finder/Explorer ---
  if (req.method === 'POST' && pathname === '/api/open-downloads') {
    const { exec } = require('child_process');
    let cmd = '';
    if (process.platform === 'darwin') cmd = `open "${DOWNLOADS_DIR}"`;
    else if (process.platform === 'win32') cmd = `explorer "${DOWNLOADS_DIR}"`;
    else cmd = `xdg-open "${DOWNLOADS_DIR}"`;

    if (cmd) exec(cmd);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: DOWNLOADS_DIR }));
    return;
  }

  // Fallback to static web assets
  serveStatic(req, res, pathname);
}

// --- Start Server ---
const server = http.createServer(handleRequest);

function listen(port) {
  server.listen(port, '0.0.0.0', () => {
    const actualPort = server.address().port;
    const net = getNetworkInterfacesInfo();

    console.log('=====================================================');
    console.log(`🚀 OmniDrop (AirDrop Cross-Platform) is RUNNING!`);
    console.log(`📡 Local Web UI & PWA:  http://localhost:${actualPort}`);
    console.log(`📱 Connect Any Phone:   http://${net.primaryIp}:${actualPort}`);
    console.log(`📁 Download Folder:     ${DOWNLOADS_DIR}`);
    console.log('=====================================================');

    startDiscovery(actualPort);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      listen(port + 1);
    } else {
      console.error(`[Server Error]: ${err.message}`);
    }
  });
}

listen(DEFAULT_PORT);
