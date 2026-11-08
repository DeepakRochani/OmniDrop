/**
 * OmniDrop Supabase Realtime Signaling Client
 * Connects directly to Supabase Project: eqsjbadswzvfkrkdnnra
 * Handles zero-server worldwide WebRTC SDP Offer/Answer & ICE exchange
 */

window.OmniDropSupabase = (function() {
  const DEFAULT_PROJECT_ID = 'eqsjbadswzvfkrkdnnra';
  const DEFAULT_URL = `https://${DEFAULT_PROJECT_ID}.supabase.co`;

  let config = {
    projectId: localStorage.getItem('omnidrop_supabase_project_id') || DEFAULT_PROJECT_ID,
    url: localStorage.getItem('omnidrop_supabase_url') || DEFAULT_URL,
    anonKey: localStorage.getItem('omnidrop_supabase_anon_key') || ''
  };

  let activeSocket = null;
  let activeChannel = null;
  let heartbeatTimer = null;
  let refCounter = 1;

  function getConfig() {
    return { ...config };
  }

  function saveConfig(projectId, anonKey) {
    config.projectId = (projectId || DEFAULT_PROJECT_ID).trim();
    config.url = `https://${config.projectId}.supabase.co`;
    config.anonKey = (anonKey || '').trim();

    localStorage.setItem('omnidrop_supabase_project_id', config.projectId);
    localStorage.setItem('omnidrop_supabase_url', config.url);
    localStorage.setItem('omnidrop_supabase_anon_key', config.anonKey);
  }

  // Connect via Supabase Realtime Phoenix WebSocket protocol
  function connectRealtime(roomCode, myPeerId, onMessage) {
    if (!config.anonKey) {
      console.warn('[Supabase Realtime] Anon key not set. Using Vercel / local relay mode.');
      return false;
    }

    try {
      const wsUrl = `wss://${config.projectId}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(config.anonKey)}&vsn=1.0.0`;
      activeSocket = new WebSocket(wsUrl);

      activeSocket.onopen = () => {
        console.log(`[Supabase Realtime] Connected to project: ${config.projectId}`);
        // Join Phoenix topic for the 6-digit room
        const topic = `realtime:omnidrop-room-${roomCode}`;
        const joinMsg = {
          topic,
          event: 'phx_join',
          payload: { config: { broadcast: { self: false } } },
          ref: String(refCounter++)
        };
        activeSocket.send(JSON.stringify(joinMsg));

        // Heartbeat keepalive every 25 seconds
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
        }, 25000);
      };

      activeSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'broadcast' && data.payload) {
            const payload = data.payload;
            if (payload.targetId === myPeerId || !payload.targetId) {
              if (onMessage) onMessage(payload);
            }
          }
        } catch (e) {
          console.error('[Supabase Realtime] Parse error:', e);
        }
      };

      activeSocket.onerror = (err) => {
        console.warn('[Supabase Realtime] WebSocket notice:', err);
      };

      activeSocket.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        activeSocket = null;
      };

      return true;
    } catch (err) {
      console.error('[Supabase Realtime] Connection error:', err);
      return false;
    }
  }

  function broadcastSignal(roomCode, payload) {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return false;
    const topic = `realtime:omnidrop-room-${roomCode}`;
    activeSocket.send(JSON.stringify({
      topic,
      event: 'broadcast',
      payload,
      ref: String(refCounter++)
    }));
    return true;
  }

  function disconnect() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (activeSocket) {
      activeSocket.close();
      activeSocket = null;
    }
  }

  return {
    getConfig,
    saveConfig,
    connectRealtime,
    broadcastSignal,
    disconnect
  };
})();

