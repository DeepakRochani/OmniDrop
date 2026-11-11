/**
 * OmniDrop Supabase Realtime Signaling Client
 * High-speed, zero-server worldwide WebRTC SDP Offer/Answer & ICE candidate exchange
 * Powered by Supabase Realtime Broadcast & Presence
 */

window.OmniDropSupabase = (function() {
  const DEFAULT_PROJECT_ID = 'sjnamkshicpxtyikzsnp';
  const DEFAULT_URL = `https://${DEFAULT_PROJECT_ID}.supabase.co`;
  const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqbmFta3NoaWNweHR5aWt6c25wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MzEzOTYsImV4cCI6MjEwMTMwNzM5Nn0.pZG7nQhnuzxc19umXyztJ-CLhFYe5p527IGxlI_9hNc';

  let config = {
    projectId: localStorage.getItem('omnidrop_supabase_project_id') || DEFAULT_PROJECT_ID,
    url: localStorage.getItem('omnidrop_supabase_url') || DEFAULT_URL,
    anonKey: localStorage.getItem('omnidrop_supabase_anon_key') || DEFAULT_ANON_KEY
  };

  let activeSocket = null;
  let myPeerId = null;
  let myPin = null;
  let onSignalCallback = null;
  const joinedTopics = new Set();
  const desiredTopics = new Set(['realtime:omnidrop-radar']);
  const pendingMessages = [];
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let refCounter = 1;
  let isConnecting = false;

  function getConfig() {
    return { ...config };
  }

  function saveConfig(projectId, anonKey) {
    config.projectId = (projectId || DEFAULT_PROJECT_ID).trim();
    config.url = `https://${config.projectId}.supabase.co`;
    config.anonKey = (anonKey || DEFAULT_ANON_KEY).trim();

    localStorage.setItem('omnidrop_supabase_project_id', config.projectId);
    localStorage.setItem('omnidrop_supabase_url', config.url);
    localStorage.setItem('omnidrop_supabase_anon_key', config.anonKey);

    // Reconnect with fresh credentials
    disconnect();
    init(myPeerId, myPin, onSignalCallback);
  }

  function init(peerId, pin, callback) {
    if (peerId) myPeerId = peerId;
    if (pin) {
      myPin = pin;
      desiredTopics.add(`realtime:omnidrop-room-${pin}`);
    }
    if (myPeerId) {
      desiredTopics.add(`realtime:omnidrop-peer-${myPeerId}`);
    }
    if (callback) onSignalCallback = callback;

    if (!config.anonKey) return false;
    if (activeSocket && (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    connectSocket();
    return true;
  }

  function connectSocket() {
    if (isConnecting) return;
    isConnecting = true;

    try {
      const wsUrl = `wss://${config.projectId}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(config.anonKey)}&vsn=1.0.0`;
      activeSocket = new WebSocket(wsUrl);

      activeSocket.onopen = () => {
        isConnecting = false;
        console.log(`[Supabase Realtime] Connected to project: ${config.projectId}`);
        joinedTopics.clear();

        // Join all desired topics (radar, own room PIN, own peerId)
        for (const topic of desiredTopics) {
          sendJoin(topic);
        }

        // Start heartbeat keepalive every 20 seconds
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
            activeSocket.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: String(refCounter++)
            }));
          }
        }, 20000);

        // Flush any queued broadcast messages
        while (pendingMessages.length > 0) {
          const msg = pendingMessages.shift();
          sendBroadcast(msg.topic, msg.payload);
        }
      };

      activeSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'phx_reply' && data.payload && data.payload.status === 'ok') {
            joinedTopics.add(data.topic);
            return;
          }

          if (data.event === 'broadcast' && data.payload) {
            const payload = data.payload;
            // Ignore echoes of self messages
            if (payload.fromId && myPeerId && payload.fromId === myPeerId) {
              return;
            }
            if (payload.sender && payload.sender.id && myPeerId && payload.sender.id === myPeerId) {
              return;
            }
            // Check if directed to specific target or broadcast to room/radar
            if (!payload.targetId || payload.targetId === myPeerId || payload.targetId === 'all') {
              if (onSignalCallback) {
                onSignalCallback(payload, data.topic);
              }
            }
          }
        } catch (e) {
          console.error('[Supabase Realtime] Parse error:', e);
        }
      };

      activeSocket.onerror = (err) => {
        console.warn('[Supabase Realtime] WebSocket event:', err);
      };

      activeSocket.onclose = () => {
        isConnecting = false;
        joinedTopics.clear();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        activeSocket = null;

        // Auto-reconnect after 2 seconds
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connectSocket();
        }, 2000);
      };
    } catch (err) {
      isConnecting = false;
      console.error('[Supabase Realtime] Connection error:', err);
    }
  }

  function sendJoin(topic) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    activeSocket.send(JSON.stringify({
      topic,
      event: 'phx_join',
      payload: { config: { broadcast: { self: false } } },
      ref: String(refCounter++)
    }));
    joinedTopics.add(topic);
  }

  function joinTopic(topic) {
    if (!topic) return;
    desiredTopics.add(topic);
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN && !joinedTopics.has(topic)) {
      sendJoin(topic);
    }
  }

  function joinRoom(pin) {
    if (!pin) return;
    const cleanPin = pin.toString().trim().replace(/\D/g, '');
    if (cleanPin.length === 6) {
      joinTopic(`realtime:omnidrop-room-${cleanPin}`);
    }
  }

  function sendBroadcast(topic, payload) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      pendingMessages.push({ topic, payload });
      return false;
    }
    if (!joinedTopics.has(topic)) {
      sendJoin(topic);
    }
    activeSocket.send(JSON.stringify({
      topic,
      event: 'broadcast',
      payload,
      ref: String(refCounter++)
    }));
    return true;
  }

  function broadcast(topic, payload) {
    return sendBroadcast(topic, payload);
  }

  function sendToPeer(targetPeerId, payload) {
    if (!targetPeerId) return false;
    const topic = `realtime:omnidrop-peer-${targetPeerId}`;
    joinTopic(topic);
    return sendBroadcast(topic, payload);
  }

  function sendToRoom(roomCode, payload) {
    if (!roomCode) return false;
    const clean = roomCode.toString().trim().replace(/\D/g, '');
    const topic = `realtime:omnidrop-room-${clean}`;
    joinTopic(topic);
    return sendBroadcast(topic, payload);
  }

  function broadcastRadar(peerInfo) {
    return sendBroadcast('realtime:omnidrop-radar', {
      type: 'RADAR_ANNOUNCE',
      peer: peerInfo,
      fromId: myPeerId,
      timestamp: Date.now()
    });
  }

  function isConnected() {
    return !!(activeSocket && activeSocket.readyState === WebSocket.OPEN);
  }

  function disconnect() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (activeSocket) {
      try { activeSocket.close(); } catch (e) {}
      activeSocket = null;
    }
    joinedTopics.clear();
    isConnecting = false;
  }

  return {
    getConfig,
    saveConfig,
    init,
    joinTopic,
    joinRoom,
    broadcast,
    sendToPeer,
    sendToRoom,
    broadcastRadar,
    isConnected,
    disconnect
  };
})();
