/**
 * OmniDrop Frontend Core Application
 * Cross-Platform AirDrop UI & High-Speed File Streaming Engine
 */

(function() {
  'use strict';

  // --- State Variables ---
  let myInfo = {
    id: '',
    name: 'This Device',
    deviceType: 'desktop',
    os: 'unknown',
    ip: '127.0.0.1',
    port: 53317
  };

  const peersMap = new Map(); // id -> peer object
  let pendingIncomingTransfer = null;
  let activeIncomingTransfer = null;
  let activeOutgoingTransfer = null;
  let selectedFilesToSend = [];
  let currentTargetPeer = null;
  let eventSource = null;
  const completedTransfers = new Set();

  // --- Sound & Haptics Preferences (Saved in LocalStorage) ---
  const settings = {
    soundEnabled: localStorage.getItem('omnidrop_sound_enabled') !== 'false',
    soundVolume: parseFloat(localStorage.getItem('omnidrop_sound_volume') || '0.8'),
    soundTheme: localStorage.getItem('omnidrop_sound_theme') || 'apple',
    hapticEnabled: localStorage.getItem('omnidrop_haptic_enabled') !== 'false',
    hapticMode: localStorage.getItem('omnidrop_haptic_mode') || 'medium',
    autoDownload: localStorage.getItem('omnidrop_auto_download') !== 'false'
  };

  // Audio Context for AirDrop Chimes (Zero external audio file needed!)
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  // --- Multi-Theme Web Audio Synthesizer ---
  function playChime(type) {
    if (settings.soundEnabled) {
      try {
        const ctx = getAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') ctx.resume();

          const now = ctx.currentTime;
          const vol = Math.max(0.01, Math.min(1.0, settings.soundVolume));
          const theme = settings.soundTheme || 'apple';

          if (theme === 'apple') {
            // Classic Apple AirDrop double bell ping & swoop
            if (type === 'incoming') {
              const osc1 = ctx.createOscillator();
              const gain1 = ctx.createGain();
              osc1.connect(gain1);
              gain1.connect(ctx.destination);
              osc1.frequency.setValueAtTime(587.33, now); // D5
              gain1.gain.setValueAtTime(0.24 * vol, now);
              gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
              osc1.start(now);
              osc1.stop(now + 0.4);

              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.frequency.setValueAtTime(880.00, now + 0.12); // A5
              gain2.gain.setValueAtTime(0.3 * vol, now + 0.12);
              gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
              osc2.start(now + 0.12);
              osc2.stop(now + 0.65);
            } else if (type === 'success') {
              [
                { f: 523.25, t: 0, d: 0.25 },
                { f: 783.99, t: 0.10, d: 0.30 },
                { f: 1046.50, t: 0.20, d: 0.50 }
              ].forEach(note => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(note.f, now + note.t);
                gain.gain.setValueAtTime(0.28 * vol, now + note.t);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
                osc.start(now + note.t);
                osc.stop(now + note.t + note.d);
              });
            }
          } else if (theme === 'crystal') {
            // High crystal glass chime with shimmering harmonics
            if (type === 'incoming') {
              [880, 1318.51, 1760].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(freq, now + i * 0.05);
                gain.gain.setValueAtTime((0.2 - i * 0.04) * vol, now + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
                osc.start(now + i * 0.05);
                osc.stop(now + 0.75);
              });
            } else if (type === 'success') {
              [1318.51, 1661.22, 1975.53, 2637.02].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(freq, now + i * 0.08);
                gain.gain.setValueAtTime(0.22 * vol, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.5);
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.55);
              });
            }
          } else if (theme === 'modern') {
            // Soft acoustic pulse & modern sweep
            if (type === 'incoming') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(750, now);
              osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);
              gain.gain.setValueAtTime(0.35 * vol, now);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
              osc.start(now);
              osc.stop(now + 0.4);
            } else if (type === 'success') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(420, now);
              osc.frequency.exponentialRampToValueAtTime(1150, now + 0.22);
              gain.gain.setValueAtTime(0.3 * vol, now);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
              osc.start(now);
              osc.stop(now + 0.5);
            }
          } else if (theme === 'arcade') {
            // 8-bit retro gaming chime
            if (type === 'incoming') {
              [587.33, 880, 1174.66].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(freq, now + i * 0.06);
                gain.gain.setValueAtTime(0.12 * vol, now + i * 0.06);
                gain.gain.setValueAtTime(0.001, now + i * 0.06 + 0.05);
                osc.start(now + i * 0.06);
                osc.stop(now + i * 0.06 + 0.06);
              });
            } else if (type === 'success') {
              [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(freq, now + i * 0.07);
                gain.gain.setValueAtTime(0.13 * vol, now + i * 0.07);
                gain.gain.setValueAtTime(0.001, now + i * 0.07 + 0.06);
                osc.start(now + i * 0.07);
                osc.stop(now + i * 0.07 + 0.07);
              });
            }
          }
        }
      } catch (e) {}
    }

    // Trigger haptic vibration
    playHaptic(type);
  }

  // --- Customizable Haptic Feedback Engine ---
  function playHaptic(type) {
    if (!settings.hapticEnabled || !('vibrate' in navigator)) return;

    try {
      const mode = settings.hapticMode || 'medium';
      if (mode === 'light') {
        navigator.vibrate(type === 'incoming' ? [25] : [35]);
      } else if (mode === 'medium') {
        navigator.vibrate(type === 'incoming' ? [50, 40, 50] : [40, 30, 80]);
      } else if (mode === 'strong') {
        navigator.vibrate(type === 'incoming' ? [100, 50, 100] : [80, 40, 140]);
      }
    } catch (e) {}
  }

  // --- SVG Icons Provider ---
  function getDeviceIconSvg(osType, deviceType) {
    const os = (osType || '').toLowerCase();
    const dt = (deviceType || '').toLowerCase();

    if (os.includes('ios') || os.includes('iphone') || os.includes('ipad') || dt === 'tablet') {
      if (os.includes('ipad') || dt === 'tablet') {
        // Tablet / iPad Icon
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>`;
      }
      // iPhone / Apple Mobile
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="3"></rect>
        <line x1="12" y1="18" x2="12.01" y2="18"></line>
      </svg>`;
    }

    if (os.includes('android')) {
      // Android Robot Icon
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 10h16v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8z"></path>
        <path d="M7 6l-2-3M17 6l2-3"></path>
        <circle cx="9" cy="14" r="1" fill="currentColor"></circle>
        <circle cx="15" cy="14" r="1" fill="currentColor"></circle>
      </svg>`;
    }

    if (os.includes('windows')) {
      // Windows Icon
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="8" height="8"></rect>
        <rect x="13" y="3" width="8" height="8"></rect>
        <rect x="3" y="13" width="8" height="8"></rect>
        <rect x="13" y="13" width="8" height="8"></rect>
      </svg>`;
    }

    if (os.includes('mac') || os.includes('darwin')) {
      // Apple Mac Laptop
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="12" rx="2"></rect>
        <line x1="2" y1="20" x2="22" y2="20"></line>
      </svg>`;
    }

    // Default Browser / Phone
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"></path>
    </svg>`;
  }

  function getOsBadge(osType) {
    const os = (osType || '').toLowerCase();
    if (os.includes('ios') || os.includes('mac') || os.includes('iphone') || os.includes('ipad')) return '';
    if (os.includes('android')) return '🤖';
    if (os.includes('win')) return '⊞';
    if (os.includes('linux')) return '🐧';
    return '🌐';
  }

  // Detect Client Browser OS & Device
  function detectClientDevice() {
    const ua = navigator.userAgent || '';
    let clientOS = 'browser';
    let clientType = 'desktop';

    if (/iPad|Macintosh/i.test(ua) && 'ontouchend' in document) {
      clientOS = 'ios';
      clientType = 'tablet';
    } else if (/iPhone|iPod/i.test(ua)) {
      clientOS = 'ios';
      clientType = 'phone';
    } else if (/Android/i.test(ua)) {
      clientOS = 'android';
      clientType = /mobile/i.test(ua) ? 'phone' : 'tablet';
    } else if (/Windows/i.test(ua)) {
      clientOS = 'windows';
      clientType = 'desktop';
    } else if (/Mac OS/i.test(ua)) {
      clientOS = 'mac';
      clientType = 'desktop';
    } else if (/Linux/i.test(ua)) {
      clientOS = 'linux';
      clientType = 'desktop';
    }

    return { clientOS, clientType };
  }

  // --- Format Bytes Helper ---
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- Toast Notifications ---
  function showToast(text, duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cursor = 'pointer';
    toast.innerHTML = `<span>${text}</span>`;
    toast.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    });
    container.appendChild(toast);

    setTimeout(() => {
      if (!toast.parentNode) return;
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Persistent client identity per tab/device (localStorage preserves identity across refreshes)
  let myClientId = '';
  try {
    myClientId = localStorage.getItem('omnidrop_device_id') || sessionStorage.getItem('omnidrop_client_id');
  } catch (e) {}
  if (!myClientId) {
    myClientId = 'c_' + Math.random().toString(36).substring(2, 9);
  }
  try {
    localStorage.setItem('omnidrop_device_id', myClientId);
    sessionStorage.setItem('omnidrop_client_id', myClientId);
  } catch (e) {}

  // Get active nearby peers deduplicated by physical device (IP + OS)
  function getActiveUniquePeers() {
    const unique = new Map();
    for (const peer of peersMap.values()) {
      if (peer.id === myInfo.id || peer.id === myClientId) continue;
      // Deduplicate by IP address if present, otherwise by ID
      const key = (peer.ip && peer.ip !== '127.0.0.1' && peer.ip !== 'localhost' && peer.ip !== 'Connected')
        ? `${peer.ip}_${peer.os || ''}`
        : peer.id;
      unique.set(key, peer);
    }
    return Array.from(unique.values());
  }

  // Persistent registration with host (preserves device identity, name and PIN across screen locks)
  async function registerWithHost() {
    const isRemoteClient = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
    if (!isRemoteClient) return;

    try {
      const { clientOS, clientType } = detectClientDevice();
      let storedPin = '';
      try {
        storedPin = localStorage.getItem('omnidrop_pin') || myInfo.pin || '';
      } catch (e) {}

      const regRes = await fetch('/api/register-web-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myClientId,
          name: myInfo.name || `${clientOS.toUpperCase()} Device`,
          deviceType: myInfo.deviceType || clientType,
          os: myInfo.os || clientOS,
          pin: storedPin || undefined
        })
      });
      const regData = await regRes.json();
      if (regData && regData.pin) {
        myInfo.pin = regData.pin;
        try { localStorage.setItem('omnidrop_pin', regData.pin); } catch (e) {}
        const pinBadge = document.getElementById('self-pin-badge');
        if (pinBadge) pinBadge.textContent = `PIN: ${regData.pin}`;
        const modalPin = document.getElementById('modal-my-pin');
        if (modalPin) modalPin.textContent = regData.pin;
        const quickCodeEl = document.getElementById('quick-my-code');
        if (quickCodeEl) quickCodeEl.textContent = regData.pin;
      }
    } catch (e) {
      console.warn('[OmniDrop] Registration ping failed:', e.message);
    }
  }

  // --- Fetch Self Info & Setup SSE ---
  async function initSelf() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      myInfo = data;

      const { clientOS, clientType } = detectClientDevice();
      const isRemoteClient = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

      if (isRemoteClient) {
        myInfo.id = myClientId;
        myInfo.os = clientOS;
        myInfo.deviceType = clientType;
        myInfo.name = `${clientOS.toUpperCase()} Device`;

        // Restore stored PIN if exists
        try {
          const savedPin = localStorage.getItem('omnidrop_pin');
          if (savedPin) myInfo.pin = savedPin;
        } catch (e) {}

        await registerWithHost();
      }

      document.getElementById('self-name').textContent = myInfo.name;
      document.getElementById('self-avatar-icon').innerHTML = getDeviceIconSvg(myInfo.os, myInfo.deviceType);
      if (myInfo.pin) {
        document.getElementById('self-pin-badge').textContent = `PIN: ${myInfo.pin}`;
        document.getElementById('modal-my-pin').textContent = myInfo.pin;
        const quickCodeEl = document.getElementById('quick-my-code');
        if (quickCodeEl) quickCodeEl.textContent = myInfo.pin;
      }

      // Render QR code for other devices to scan - with instant auto-pair link!
      const hostUrl = `http://${myInfo.ip}:${myInfo.port}/?pair=${myInfo.pin || ''}`;
      document.getElementById('qr-url-text').textContent = hostUrl;
      if (window.renderQRCodeSVG) {
        document.getElementById('qr-output').innerHTML = window.renderQRCodeSVG(hostUrl, { size: 200 });
      }

      // Connect SSE stream with our specific client ID
      connectSSE();

      // Fetch initial peer list
      fetchPeers();

      // Check if URL has ?pair=XXXXXX for instant 0-second auto-connect!
      const urlParams = new URLSearchParams(window.location.search);
      const pairPin = urlParams.get('pair');
      if (pairPin && pairPin !== myInfo.pin) {
        setTimeout(() => directPairByPin(pairPin), 400);
      }
    } catch (err) {
      console.error('Failed to init self info:', err);
    }
  }

  // --- Real-time SSE Stream ---
  function connectSSE() {
    if (eventSource) {
      try { eventSource.close(); } catch (e) {}
    }
    eventSource = new EventSource('/api/events?clientId=' + encodeURIComponent(myInfo.id || myClientId));

    eventSource.addEventListener('peer_joined', e => {
      const peer = JSON.parse(e.data);
      if (peer.id !== (myInfo.id || myClientId)) {
        peersMap.set(peer.id, peer);
        renderRadarPeers();
        showToast(`✨ Discovered nearby ${peer.name}`);
      }
    });

    eventSource.addEventListener('peer_updated', e => {
      const peer = JSON.parse(e.data);
      if (peer.id !== (myInfo.id || myClientId)) {
        peersMap.set(peer.id, peer);
        renderRadarPeers();
      }
    });

    eventSource.addEventListener('peer_left', e => {
      const data = JSON.parse(e.data);
      if (peersMap.has(data.id)) {
        peersMap.delete(data.id);
        renderRadarPeers();
      }
    });

    // When someone joins our 4G/Cellular Room
    eventSource.addEventListener('room_peer_joined', e => {
      const data = JSON.parse(e.data);
      if (data.peer && data.peer.id !== (myInfo.id || myClientId)) {
        peersMap.set(data.peer.id, data.peer);
        renderRadarPeers();
        playChime('incoming');
        showToast(`⚡ ${data.peer.name} joined room via Mobile Data!`);
      }
    });

    // Incoming file transfer request
    eventSource.addEventListener('transfer_request', e => {
      const req = JSON.parse(e.data);
      // Only prompt if we are the intended recipient or host
      if (!req.targetId || req.targetId === myInfo.id || req.targetId === myClientId) {
        handleIncomingTransferPrompt(req);
      }
    });

    // Transfer progress updates
    eventSource.addEventListener('transfer_progress', e => {
      const progress = JSON.parse(e.data);
      updateProgressDisplay(progress);
    });

    // Transfer complete
    eventSource.addEventListener('transfer_complete', e => {
      const comp = JSON.parse(e.data);
      onTransferComplete(comp);
    });

    // File ready for download (sent specifically to recipient client)
    eventSource.addEventListener('file_ready_for_download', e => {
      const comp = JSON.parse(e.data);
      handleIncomingFilesComplete(comp);
    });

    // Received instant text/clipboard
    eventSource.addEventListener('clipboard_received', e => {
      const data = JSON.parse(e.data);
      playChime('incoming');
      navigator.clipboard?.writeText(data.text);
      showToast(`📋 Received from ${data.sender.name}: "${data.text.slice(0, 40)}..." (Copied to clipboard)`);
    });

    eventSource.onerror = () => {
      setTimeout(() => {
        if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
          connectSSE();
        }
      }, 3000);
    };
  }

  async function fetchPeers() {
    try {
      const res = await fetch('/api/peers?clientId=' + encodeURIComponent(myInfo.id || myClientId));
      const list = await res.json();
      const currentIds = new Set(list.map(p => p.id));

      let hasChanges = false;

      // Remove any peers that left or are no longer active
      for (const [id] of peersMap.entries()) {
        if (!currentIds.has(id)) {
          peersMap.delete(id);
          hasChanges = true;
        }
      }

      for (const peer of list) {
        if (peer.id !== (myInfo.id || myClientId)) {
          const old = peersMap.get(peer.id);
          if (!old || old.name !== peer.name || old.ip !== peer.ip || old.pin !== peer.pin) {
            hasChanges = true;
          }
          peersMap.set(peer.id, peer);
        }
      }

      // Only re-render when the peer list has ACTUALLY changed! Prevents blinking!
      if (hasChanges) {
        renderRadarPeers();
      }
    } catch (e) {}
  }

  // Periodic automatic sync every 2.5 seconds (discovers nearby devices automatically)
  setInterval(fetchPeers, 2500);

  // Background registration heartbeat every 10 seconds to maintain persistent presence
  setInterval(registerWithHost, 10000);

  // --- Auto-Reconnection & Screen Unlock / Wake-Up Lifecycle ---
  let isResuming = false;
  async function handleWakeUpAndResume() {
    if (isResuming) return;
    isResuming = true;
    console.log('[OmniDrop] Screen unlocked / tab resumed. Re-announcing device...');

    try {
      // 1. Immediately re-announce this device so other devices see us without refresh!
      await registerWithHost();

      // 2. Re-establish SSE connection if dropped or suspended
      if (!eventSource || eventSource.readyState === EventSource.CLOSED || eventSource.readyState === EventSource.CONNECTING) {
        connectSSE();
      }

      // 3. Immediately fetch peers to update radar without waiting for interval
      await fetchPeers();
    } catch (err) {
      console.warn('[OmniDrop] Wake-up sync error:', err);
    } finally {
      setTimeout(() => { isResuming = false; }, 1000);
    }
  }

  // Listen to mobile screen unlock, browser focus, pageshow, and online events
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleWakeUpAndResume();
    }
  });
  window.addEventListener('focus', handleWakeUpAndResume);
  window.addEventListener('pageshow', handleWakeUpAndResume);
  window.addEventListener('online', handleWakeUpAndResume);

  // --- Render Orbiting Radar Peers (Rock-Solid: Zero Blinking, Preserves Nodes) ---
  function renderRadarPeers() {
    const container = document.getElementById('peers-container');
    const hint = document.getElementById('radar-hint');
    const peerList = getActiveUniquePeers();

    if (peerList.length === 0) {
      if (hint) hint.style.display = 'flex';
      container.innerHTML = '';
      return;
    }
    if (hint) hint.style.display = 'none';

    // Position peers in a circle around the center
    const total = peerList.length;
    const radiusPercent = 38; // Distance from center
    const activeIds = new Set(peerList.map(p => p.id));

    // 1. Remove nodes for peers that are no longer active
    Array.from(container.children).forEach(child => {
      if (child.classList.contains('peer-node') && !activeIds.has(child.dataset.id)) {
        child.remove();
      }
    });

    // 2. Insert new nodes or update existing nodes smoothly (NO wiping = NO blinking!)
    peerList.forEach((peer, index) => {
      const angle = (2 * Math.PI / total) * index - (Math.PI / 2);
      const x = 50 + radiusPercent * Math.cos(angle);
      const y = 50 + radiusPercent * Math.sin(angle);

      let node = container.querySelector(`.peer-node[data-id="${peer.id}"]`);
      if (node) {
        // Node already exists: update coordinates and details smoothly without recreation or re-animation!
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        const nameEl = node.querySelector('.peer-name');
        if (nameEl && nameEl.textContent !== peer.name) nameEl.textContent = peer.name;
        const subEl = node.querySelector('.peer-sub');
        const expectedSub = peer.ip && peer.ip !== 'undefined' ? peer.ip : (peer.pin ? 'PIN: ' + peer.pin : 'Nearby');
        if (subEl && subEl.textContent !== expectedSub) subEl.textContent = expectedSub;
      } else {
        // Brand new peer: construct node and animate once on entry
        node = document.createElement('div');
        node.className = 'peer-node peer-entering';
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.dataset.id = peer.id;

        node.innerHTML = `
          <div class="peer-avatar">
            ${getDeviceIconSvg(peer.os, peer.deviceType)}
            <span class="peer-badge">${getOsBadge(peer.os)}</span>
          </div>
          <span class="peer-name">${peer.name}</span>
          <span class="peer-sub">${peer.ip && peer.ip !== 'undefined' ? peer.ip : (peer.pin ? 'PIN: ' + peer.pin : 'Nearby')}</span>
        `;

        // Click to send files or text
        node.addEventListener('click', () => {
          currentTargetPeer = peer;
          triggerFilePickerForPeer(peer);
        });

        // Drag and drop onto peer avatar
        node.addEventListener('dragover', (e) => {
          e.preventDefault();
          node.style.transform = 'translate(-50%, -50%) scale(1.25)';
        });
        node.addEventListener('dragleave', () => {
          node.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        node.addEventListener('drop', (e) => {
          e.preventDefault();
          node.style.transform = 'translate(-50%, -50%) scale(1)';
          if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            currentTargetPeer = peer;
            initiateSendFiles(peer, Array.from(e.dataTransfer.files));
          }
        });

        container.appendChild(node);
        setTimeout(() => {
          node.classList.remove('peer-entering');
        }, 500);
      }
    });
  }

  // --- Trigger File Picker ---
  function triggerFilePickerForPeer(peer) {
    const input = document.getElementById('global-file-input');
    input.value = '';
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        initiateSendFiles(peer, files);
      }
    };
    input.click();
  }

  // --- Send File Transfer Pipeline ---
  async function initiateSendFiles(targetPeer, files) {
    if (!files || files.length === 0) return;

    let totalSize = 0;
    const fileMetaList = files.map((f, idx) => {
      totalSize += f.size;
      return {
        index: idx,
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream'
      };
    });

    const transferId = 'tf_' + Math.random().toString(36).substring(2, 10);
    activeOutgoingTransfer = {
      transferId,
      targetPeer,
      files,
      fileMetaList,
      totalSize
    };

    // Show Progress Modal in "Waiting for approval" state
    const progressModal = document.getElementById('modal-progress');
    document.getElementById('progress-title').textContent = 'Waiting for Recipient...';
    document.getElementById('progress-target').textContent = `Waiting for ${targetPeer.name} to accept...`;
    document.getElementById('progress-percentage').textContent = '⏳';
    document.getElementById('progress-speed').textContent = 'Pending';
    document.getElementById('progress-filename').textContent = `${files.length} file(s) (${formatBytes(totalSize)})`;
    progressModal.style.display = 'flex';

    try {
      // Step 1: Request permission via local server relay (works for both web & native clients)
      const targetUrl = '/api/transfer/request';
      const reqRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId,
          sender: { id: myInfo.id || myClientId, name: myInfo.name, os: myInfo.os },
          targetId: targetPeer.id,
          files: fileMetaList,
          totalSize
        })
      });

      const handshake = await reqRes.json();
      if (!handshake.accepted) {
        progressModal.style.display = 'none';
        showToast(`❌ ${targetPeer.name} declined the transfer.`);
        return;
      }

      // Step 2: Stream each file to local upload endpoint
      document.getElementById('progress-title').textContent = 'Sending Files...';
      document.getElementById('progress-target').textContent = `Transferring to ${targetPeer.name}`;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        document.getElementById('progress-filename').textContent = `${file.name} (${i + 1}/${files.length})`;

        const uploadUrl = `/api/transfer/upload/${transferId}/${i}`;
        await uploadFileWithProgress(uploadUrl, file, transferId, i, totalSize);
      }

      // Done
      playChime('success');
      showToast(`🎉 Sent ${files.length} file(s) successfully!`);
      setTimeout(() => {
        progressModal.style.display = 'none';
      }, 1000);
    } catch (err) {
      console.error('Transfer failed:', err);
      progressModal.style.display = 'none';
      showToast(`⚠️ Transfer error: ${err.message}`);
    }
  }

  // Upload single file binary stream with XHR for accurate upload progress
  function uploadFileWithProgress(url, file, transferId, fileIndex, grandTotal) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      xhr.setRequestHeader('x-file-size', file.size);
      xhr.setRequestHeader('x-file-index', fileIndex);
      xhr.setRequestHeader('x-transfer-id', transferId);

      let lastTime = Date.now();
      let lastLoaded = 0;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff > 0.15) {
            const bytesDiff = e.loaded - lastLoaded;
            const speed = timeDiff > 0 ? (bytesDiff / timeDiff) : 0;
            document.getElementById('progress-speed').textContent = `${formatBytes(speed)}/s`;
            lastTime = now;
            lastLoaded = e.loaded;
          }

          const percent = Math.round((e.loaded / e.total) * 100);
          document.getElementById('progress-percentage').textContent = `${percent}%`;

          // Update SVG ring offset (circumference = 2 * PI * 50 = 314)
          const offset = 314 - (314 * percent / 100);
          document.getElementById('progress-ring-fill').style.strokeDashoffset = offset;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(file);
    });
  }

  // --- Handle Incoming Transfer Prompt (Receiver side) ---
  function handleIncomingTransferPrompt(req) {
    pendingIncomingTransfer = req;
    playChime('incoming');

    document.getElementById('incoming-sender-icon').innerHTML = getDeviceIconSvg(req.sender.os, 'mobile');
    document.getElementById('incoming-sender-title').textContent = `${req.sender.name} wants to share with you`;
    document.getElementById('incoming-files-info').innerHTML = `
      <span class="file-count">${req.files.length} File(s)</span> &bull; 
      <span class="file-size">${req.formattedSize}</span>
    `;

    const previewList = document.getElementById('incoming-file-items');
    previewList.innerHTML = req.files.map(f => `
      <div class="incoming-file-row">
        <span>${f.name}</span>
        <span style="color:var(--text-muted);">${formatBytes(f.size)}</span>
      </div>
    `).join('');

    document.getElementById('modal-incoming').style.display = 'flex';
  }

  // Receiver clicks Accept
  document.getElementById('btn-incoming-accept').addEventListener('click', async () => {
    if (!pendingIncomingTransfer) return;
    activeIncomingTransfer = {
      transferId: pendingIncomingTransfer.transferId,
      sender: pendingIncomingTransfer.sender,
      files: pendingIncomingTransfer.files
    };
    const currentTransfer = pendingIncomingTransfer;
    document.getElementById('modal-incoming').style.display = 'none';

    try {
      await fetch('/api/transfer/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId: currentTransfer.transferId,
          accepted: true
        })
      });

      // Show progress modal
      document.getElementById('progress-title').textContent = 'Receiving Files...';
      document.getElementById('progress-target').textContent = `From ${currentTransfer.sender.name}`;
      document.getElementById('modal-progress').style.display = 'flex';
    } catch (e) {}
  });

  // Receiver clicks Decline
  document.getElementById('btn-incoming-decline').addEventListener('click', async () => {
    if (!pendingIncomingTransfer) return;
    document.getElementById('modal-incoming').style.display = 'none';

    try {
      await fetch('/api/transfer/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId: pendingIncomingTransfer.transferId,
          accepted: false
        })
      });
    } catch (e) {}
  });

  // Progress display update via SSE
  function updateProgressDisplay(data) {
    document.getElementById('progress-percentage').textContent = `${data.percentage}%`;
    document.getElementById('progress-speed').textContent = data.speedFormatted;
    document.getElementById('progress-filename').textContent = `${data.fileName} (${formatBytes(data.fileBytes)} / ${formatBytes(data.fileTotal)})`;

    const offset = 314 - (314 * data.percentage / 100);
    document.getElementById('progress-ring-fill').style.strokeDashoffset = offset;
  }

  // --- Zero-Click Automatic File Downloader ---
  function triggerAutoDownload(url, filename) {
    if (!url) return;

    // Method 1: Invisible HTML5 anchor with download attribute
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 2000);
    } catch (err) {
      console.warn('Anchor auto-download failed:', err);
    }

    // Method 2: iOS Safari WebKit iframe fallback
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 30000);
      } catch (e) {}
    }
  }

  function handleIncomingFilesComplete(comp) {
    if (!comp || !comp.transferId) return;
    if (completedTransfers.has(comp.transferId)) return;
    completedTransfers.add(comp.transferId);

    // Close progress modal
    document.getElementById('modal-progress').style.display = 'none';
    playChime('success');

    const files = (comp.savedFiles && comp.savedFiles.length > 0)
      ? comp.savedFiles
      : (comp.lastFile ? [comp.lastFile] : (comp.downloadUrl ? [comp] : []));

    const totalCount = files.length || comp.totalFiles || 1;
    const displayName = files[0] ? (files[0].originalName || files[0].name || comp.fileName) : 'file';

    const isHost = (myInfo.isHost || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isHost) {
      showToast(`✅ Received ${totalCount > 1 ? totalCount + ' files' : displayName}! Saved directly to Downloads.`, 4500);
    } else {
      showToast(`✅ Received ${totalCount > 1 ? totalCount + ' files' : displayName}! Downloading automatically...`, 4500);
    }

    // Direct automatic download of all files - ZERO manual clicks needed!
    files.forEach((file, index) => {
      setTimeout(() => {
        const url = file.downloadUrl || `/api/download/${encodeURIComponent(file.name || file.fileName)}`;
        const name = file.name || file.fileName;
        triggerAutoDownload(url, name);
      }, index * 300);
    });
  }

  function onTransferComplete(comp) {
    document.getElementById('modal-progress').style.display = 'none';

    const isSender = (activeOutgoingTransfer && activeOutgoingTransfer.transferId === comp.transferId)
      || (comp.senderId && comp.senderId === (myInfo.id || myClientId));

    const isReceiver = (activeIncomingTransfer && activeIncomingTransfer.transferId === comp.transferId)
      || (comp.targetId && (comp.targetId === myInfo.id || comp.targetId === myClientId));

    if (isReceiver || (!isSender && activeIncomingTransfer)) {
      activeIncomingTransfer = null;
      handleIncomingFilesComplete(comp);
    } else if (isSender) {
      activeOutgoingTransfer = null;
      playChime('success');
      showToast(`🎉 Sent ${comp.totalFiles || 1} file(s) successfully!`);
    } else {
      handleIncomingFilesComplete(comp);
    }
  }

  // --- Universal Instant Modal Dismiss & Touch Handlers ---
  function setupDismissableModal(modalId, closeBtnId, onDismiss) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    let isDismissing = false;
    const doDismiss = (e) => {
      if (e) {
        try { e.preventDefault(); } catch (err) {}
        try { e.stopPropagation(); } catch (err) {}
      }
      if (isDismissing) return;
      isDismissing = true;
      setTimeout(() => { isDismissing = false; }, 300);

      if (onDismiss) {
        onDismiss();
      } else {
        modal.style.display = 'none';
      }
    };

    // Close button: listen to pointerdown (0ms instant touch), touchstart, and click
    if (closeBtnId) {
      const btn = document.getElementById(closeBtnId);
      if (btn) {
        btn.addEventListener('pointerdown', doDismiss, { passive: false });
        btn.addEventListener('touchstart', doDismiss, { passive: false });
        btn.addEventListener('click', doDismiss);
      }
    }

    // Tap anywhere on the backdrop outside the card to dismiss immediately
    modal.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.modal-card')) {
        doDismiss(e);
      }
    }, { passive: false });
    modal.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.modal-card')) {
        doDismiss(e);
      }
    }, { passive: false });
    modal.addEventListener('click', (e) => {
      if (!e.target.closest('.modal-card')) {
        doDismiss(e);
      }
    });
  }

  // Register all modals for instant dismissal
  setupDismissableModal('modal-qr', 'btn-close-qr');
  setupDismissableModal('modal-pin-pair', 'btn-close-pin');
  setupDismissableModal('modal-text', 'btn-close-text');
  setupDismissableModal('modal-target-picker', 'btn-close-picker');
  setupDismissableModal('modal-file-ready', 'btn-close-file-ready');
  setupDismissableModal('modal-progress', 'btn-close-progress');
  setupDismissableModal('modal-settings', 'btn-close-settings');
  setupDismissableModal('modal-incoming', 'btn-close-incoming', () => {
    const btnDecline = document.getElementById('btn-incoming-decline');
    if (btnDecline) btnDecline.click();
  });

  // Global Escape key dismiss for physical keyboards (Mac/PC/iPad)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['modal-qr', 'modal-pin-pair', 'modal-text', 'modal-target-picker', 'modal-file-ready', 'modal-progress', 'modal-settings'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.style.display !== 'none') el.style.display = 'none';
      });
      const incoming = document.getElementById('modal-incoming');
      if (incoming && incoming.style.display !== 'none') {
        const btnDecline = document.getElementById('btn-incoming-decline');
        if (btnDecline) btnDecline.click();
      }
    }
  });

  // --- Buttons & Event Handlers ---
  document.getElementById('btn-show-qr').addEventListener('click', () => {
    document.getElementById('modal-qr').style.display = 'flex';
  });

  document.getElementById('btn-copy-url').addEventListener('click', () => {
    const text = document.getElementById('qr-url-text').textContent;
    navigator.clipboard?.writeText(text);
    showToast('Copied link to clipboard!');
  });

  // Folder Selection Handler
  const folderInput = document.getElementById('global-folder-input');
  const btnSelectFolder = document.getElementById('btn-select-folder');
  if (btnSelectFolder && folderInput) {
    btnSelectFolder.addEventListener('click', () => {
      const peerList = getActiveUniquePeers();
      if (peerList.length === 0) {
        showToast('No nearby devices found. Tap "Connect Phone" to scan QR code!');
        document.getElementById('modal-qr').style.display = 'flex';
        return;
      }
      folderInput.value = '';
      folderInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          if (peerList.length === 1) {
            initiateSendFiles(peerList[0], files);
          } else {
            // Pick target
            selectedFilesToSend = files;
            document.getElementById('btn-select-files').click();
          }
        }
      };
      folderInput.click();
    });
  }

  // QR Modal Tabs (Same Wi-Fi vs Hotspot)
  const tabWifi = document.getElementById('tab-qr-wifi');
  const tabHotspot = document.getElementById('tab-qr-hotspot');
  const bodyWifi = document.getElementById('qr-body-wifi');
  const bodyHotspot = document.getElementById('qr-body-hotspot');

  if (tabWifi && tabHotspot) {
    tabWifi.addEventListener('click', () => {
      tabWifi.classList.add('active');
      tabHotspot.classList.remove('active');
      bodyWifi.style.display = 'block';
      bodyHotspot.style.display = 'none';
    });

    tabHotspot.addEventListener('click', () => {
      tabHotspot.classList.add('active');
      tabWifi.classList.remove('active');
      bodyWifi.style.display = 'none';
      bodyHotspot.style.display = 'block';
    });
  }

  // Wi-Fi Hotspot QR Generator (Outdoor / No-Router Mode)
  const btnGenHotspot = document.getElementById('btn-gen-hotspot-qr');
  const ssidInput = document.getElementById('hotspot-ssid');
  const passInput = document.getElementById('hotspot-pass');

  // Pre-load saved hotspot credentials from localStorage
  if (ssidInput && passInput) {
    try {
      const savedSSID = localStorage.getItem('omnidrop_hotspot_ssid');
      const savedPass = localStorage.getItem('omnidrop_hotspot_pass');
      if (savedSSID) ssidInput.value = savedSSID;
      if (savedPass) passInput.value = savedPass;
      if (savedSSID && window.renderQRCodeSVG) {
        const payload = `WIFI:T:WPA;S:${savedSSID};P:${savedPass || ''};;`;
        document.getElementById('qr-output-hotspot').innerHTML = window.renderQRCodeSVG(payload, { size: 180 });
      }
    } catch (e) {}
  }

  if (btnGenHotspot) {
    btnGenHotspot.addEventListener('click', () => {
      const ssid = (ssidInput ? ssidInput.value : '').trim();
      const pass = (passInput ? passInput.value : '').trim();
      if (!ssid) {
        showToast('Please enter Hotspot Name (SSID)');
        return;
      }
      try {
        localStorage.setItem('omnidrop_hotspot_ssid', ssid);
        localStorage.setItem('omnidrop_hotspot_pass', pass);
      } catch (e) {}

      // Standard Wi-Fi connection QR payload
      const wifiPayload = `WIFI:T:WPA;S:${ssid};P:${pass};;`;
      if (window.renderQRCodeSVG) {
        document.getElementById('qr-output-hotspot').innerHTML = window.renderQRCodeSVG(wifiPayload, { size: 180 });
      }
      showToast('Wi-Fi QR Code ready! Scan with phone camera to join hotspot.');
    });
  }

  // Global "Select Files" Button -> Shows Target Device Picker
  document.getElementById('btn-select-files').addEventListener('click', () => {
    const peerList = getActiveUniquePeers();
    if (peerList.length === 0) {
      showToast('No nearby devices found. Tap "Connect Phone" to scan QR code!');
      document.getElementById('modal-qr').style.display = 'flex';
      return;
    }

    if (peerList.length === 1) {
      triggerFilePickerForPeer(peerList[0]);
      return;
    }

    // Multiple devices: open picker modal
    const pickerList = document.getElementById('picker-list');
    pickerList.innerHTML = peerList.map(peer => `
      <div class="picker-device-item" data-id="${peer.id}">
        <div class="peer-avatar" style="width:40px;height:40px;">
          ${getDeviceIconSvg(peer.os, peer.deviceType)}
        </div>
        <div>
          <div style="font-weight:600;font-size:14px;">${peer.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">${peer.ip}</div>
        </div>
      </div>
    `).join('');

    pickerList.querySelectorAll('.picker-device-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const peer = peersMap.get(id);
        document.getElementById('modal-target-picker').style.display = 'none';
        if (peer) triggerFilePickerForPeer(peer);
      });
    });

    document.getElementById('modal-target-picker').style.display = 'flex';
  });

  document.getElementById('btn-close-picker').addEventListener('click', () => {
    document.getElementById('modal-target-picker').style.display = 'none';
  });

  const btnFileReadyClose = document.getElementById('btn-file-ready-close');
  if (btnFileReadyClose) {
    btnFileReadyClose.addEventListener('click', () => {
      document.getElementById('modal-file-ready').style.display = 'none';
    });
  }
  const dlLink = document.getElementById('file-ready-download-link');
  if (dlLink) {
    dlLink.addEventListener('click', () => {
      setTimeout(() => {
        document.getElementById('modal-file-ready').style.display = 'none';
      }, 600);
    });
  }

  // --- Reusable Direct 6-Digit Pair Function ---
  async function directPairByPin(pin) {
    const cleanPin = (pin || '').toString().trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) return false;

    try {
      const res = await fetch('/api/pair-by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: cleanPin,
          sender: {
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin
          }
        })
      });

      const data = await res.json();
      if (data.ok && data.peer) {
        peersMap.set(data.peer.id, data.peer);
        renderRadarPeers();
        playChime('incoming');
        showToast(`✨ Connected to ${data.peer.name}! Tap avatar to send.`);
        return true;
      } else {
        showToast(`❌ ${data.error || 'Device not found'}`);
        return false;
      }
    } catch (err) {
      showToast(`Connection failed: ${err.message}`);
      return false;
    }
  }

  // Fast Connect Bar on Radar Stage (Instant Auto-Connect upon typing 6 digits)
  const directCodeInput = document.getElementById('direct-code-input');
  const btnDirectConnectGo = document.getElementById('btn-direct-connect-go');

  if (directCodeInput && btnDirectConnectGo) {
    directCodeInput.addEventListener('input', () => {
      directCodeInput.value = directCodeInput.value.replace(/\D/g, '').slice(0, 6);
      if (directCodeInput.value.length === 6) {
        btnDirectConnectGo.click();
      }
    });

    btnDirectConnectGo.addEventListener('click', async () => {
      const pin = directCodeInput.value.trim().replace(/\D/g, '');
      if (pin.length !== 6) {
        showToast('Please type a 6-digit code');
        return;
      }
      btnDirectConnectGo.textContent = '...';
      btnDirectConnectGo.disabled = true;
      const ok = await directPairByPin(pin);
      if (ok) directCodeInput.value = '';
      btnDirectConnectGo.textContent = 'Connect';
      btnDirectConnectGo.disabled = false;
    });
  }

  // --- Direct 6-Digit PIN Pairing Modal ---
  const btnPairPin = document.getElementById('btn-pair-pin');
  const modalPinPair = document.getElementById('modal-pin-pair');
  const btnClosePin = document.getElementById('btn-close-pin');
  const btnSubmitPin = document.getElementById('btn-submit-pin');
  const directPinInput = document.getElementById('direct-pin-input');

  if (btnPairPin && modalPinPair) {
    btnPairPin.addEventListener('click', () => {
      directPinInput.value = '';
      if (myInfo.pin) {
        document.getElementById('modal-my-pin').textContent = myInfo.pin;
      }
      modalPinPair.style.display = 'flex';
      setTimeout(() => directPinInput.focus(), 150);
    });

    btnClosePin.addEventListener('click', () => {
      modalPinPair.style.display = 'none';
    });

    // Auto connect when 6 digits are typed
    directPinInput.addEventListener('input', () => {
      directPinInput.value = directPinInput.value.replace(/\D/g, '').slice(0, 6);
      if (directPinInput.value.length === 6) {
        btnSubmitPin.click();
      }
    });

    btnSubmitPin.addEventListener('click', async () => {
      const pin = directPinInput.value.trim().replace(/\D/g, '');
      if (pin.length !== 6) {
        showToast('Please enter a valid 6-digit PIN');
        return;
      }

      btnSubmitPin.textContent = 'Connecting...';
      btnSubmitPin.disabled = true;
      const ok = await directPairByPin(pin);
      if (ok) {
        modalPinPair.style.display = 'none';
      }
      btnSubmitPin.textContent = 'Connect Device';
      btnSubmitPin.disabled = false;
    });
  }

  // Text Share Button
  document.getElementById('btn-quick-text').addEventListener('click', () => {
    const peerList = getActiveUniquePeers();
    if (peerList.length === 0) {
      showToast('No nearby devices found. Tap "Connect Phone" to scan QR code!');
      return;
    }
    const select = document.getElementById('text-target-select');
    select.innerHTML = peerList.map(p => `<option value="${p.id}">${p.name} (${p.ip})</option>`).join('');
    document.getElementById('text-share-input').value = '';
    document.getElementById('modal-text').style.display = 'flex';
  });

  document.getElementById('btn-close-text').addEventListener('click', () => {
    document.getElementById('modal-text').style.display = 'none';
  });

  document.getElementById('btn-send-text-action').addEventListener('click', async () => {
    const text = document.getElementById('text-share-input').value.trim();
    const targetId = document.getElementById('text-target-select').value;
    const targetPeer = peersMap.get(targetId);

    if (!text || !targetPeer) return;

    try {
      await fetch('/api/send/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIp: targetPeer.ip,
          targetPort: targetPeer.port,
          text: text
        })
      });

      document.getElementById('modal-text').style.display = 'none';
      playChime('success');
      showToast(`Sent text to ${targetPeer.name}!`);
    } catch (e) {
      showToast(`Failed to send text: ${e.message}`);
    }
  });

  // --- Settings Modal & Sound/Haptics Control ---
  const modalSettings = document.getElementById('modal-settings');
  const btnSettings = document.getElementById('btn-settings');
  const selfNode = document.getElementById('self-node');
  const inputDeviceName = document.getElementById('setting-device-name');
  const btnSaveDeviceName = document.getElementById('btn-save-device-name');

  const toggleSound = document.getElementById('setting-sound-enabled');
  const sliderVolume = document.getElementById('setting-sound-volume');
  const volumeDisplay = document.getElementById('volume-val-display');
  const btnTestChime = document.getElementById('btn-test-chime');

  const toggleHaptic = document.getElementById('setting-haptic-enabled');
  const btnTestHaptic = document.getElementById('btn-test-haptic');
  const toggleAutoDownload = document.getElementById('setting-auto-download');

  function openSettingsModal() {
    if (!modalSettings) return;

    // Populate current values
    if (inputDeviceName) inputDeviceName.value = myInfo.name || '';
    if (toggleSound) toggleSound.checked = settings.soundEnabled;
    if (sliderVolume) sliderVolume.value = Math.round(settings.soundVolume * 100);
    if (volumeDisplay) volumeDisplay.textContent = Math.round(settings.soundVolume * 100) + '%';

    // Highlight active chime button
    document.querySelectorAll('.chime-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.chime === settings.soundTheme);
    });

    // Highlight active haptic button
    if (toggleHaptic) toggleHaptic.checked = settings.hapticEnabled;
    document.querySelectorAll('.haptic-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.haptic === settings.hapticMode);
    });

    if (toggleAutoDownload) toggleAutoDownload.checked = settings.autoDownload;

    modalSettings.style.display = 'flex';
  }

  if (btnSettings) btnSettings.addEventListener('click', openSettingsModal);
  if (selfNode) selfNode.addEventListener('click', openSettingsModal);

  // Save Device Name
  if (btnSaveDeviceName && inputDeviceName) {
    btnSaveDeviceName.addEventListener('click', async () => {
      const newName = inputDeviceName.value.trim();
      if (!newName) return;
      try {
        const res = await fetch('/api/me/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (data.ok) {
          myInfo.name = data.name;
          document.getElementById('self-name').textContent = data.name;
          showToast(`Device renamed to "${data.name}"`);
        }
      } catch (e) {
        myInfo.name = newName;
        document.getElementById('self-name').textContent = newName;
        showToast(`Device renamed to "${newName}"`);
      }
    });
  }

  // Sound Toggle
  if (toggleSound) {
    toggleSound.addEventListener('change', () => {
      settings.soundEnabled = toggleSound.checked;
      try { localStorage.setItem('omnidrop_sound_enabled', String(settings.soundEnabled)); } catch (e) {}
      showToast(settings.soundEnabled ? '🔔 Audio Chimes enabled' : '🔕 Audio Chimes muted');
      if (settings.soundEnabled) playChime('incoming');
    });
  }

  // Volume Slider
  if (sliderVolume && volumeDisplay) {
    sliderVolume.addEventListener('input', () => {
      const vol = parseInt(sliderVolume.value, 10);
      volumeDisplay.textContent = `${vol}%`;
      settings.soundVolume = vol / 100;
      try { localStorage.setItem('omnidrop_sound_volume', String(settings.soundVolume)); } catch (e) {}
    });
  }

  // Chime Style Buttons (🍏 Apple, 💎 Crystal, 💫 Modern, 👾 Retro)
  document.querySelectorAll('.chime-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chime-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.dataset.chime;
      settings.soundTheme = theme;
      try { localStorage.setItem('omnidrop_sound_theme', theme); } catch (e) {}
      // Instant preview chime
      playChime('incoming');
    });
  });

  // Test Chime Button
  if (btnTestChime) {
    btnTestChime.addEventListener('click', () => {
      playChime('incoming');
      setTimeout(() => playChime('success'), 400);
    });
  }

  // Haptic Toggle
  if (toggleHaptic) {
    toggleHaptic.addEventListener('change', () => {
      settings.hapticEnabled = toggleHaptic.checked;
      try { localStorage.setItem('omnidrop_haptic_enabled', String(settings.hapticEnabled)); } catch (e) {}
      showToast(settings.hapticEnabled ? '📳 Haptic vibration enabled' : '📴 Haptic vibration disabled');
      if (settings.hapticEnabled) playHaptic('incoming');
    });
  }

  // Haptic Mode Buttons (Light, Standard, Strong)
  document.querySelectorAll('.haptic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.haptic-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.haptic;
      settings.hapticMode = mode;
      try { localStorage.setItem('omnidrop_haptic_mode', mode); } catch (e) {}
      // Instant haptic preview
      playHaptic('incoming');
    });
  });

  // Test Haptic Button
  if (btnTestHaptic) {
    btnTestHaptic.addEventListener('click', () => {
      playHaptic('incoming');
      showToast('Felt haptic pulse!');
    });
  }

  // Auto-Download Toggle
  if (toggleAutoDownload) {
    toggleAutoDownload.addEventListener('change', () => {
      settings.autoDownload = toggleAutoDownload.checked;
      try { localStorage.setItem('omnidrop_auto_download', String(settings.autoDownload)); } catch (e) {}
      showToast(settings.autoDownload ? '⚡ Automatic downloads enabled' : '📥 Manual download prompts enabled');
    });
  }

  // Global Drag and Drop onto Radar
  const dropzone = document.getElementById('radar-dropzone');
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.filter = 'brightness(1.3)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.filter = 'none';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.filter = 'none';
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const peerList = getActiveUniquePeers();
      if (peerList.length === 1) {
        initiateSendFiles(peerList[0], files);
      } else if (peerList.length > 1) {
        // Show picker
        document.getElementById('btn-select-files').click();
      } else {
        showToast('No nearby devices found to drop files to!');
      }
    }
  });

  // Register PWA Service Worker if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Boot
  initSelf();
})();

