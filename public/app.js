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

  // --- Format Transfer Speed Helper (Auto Mbps & Fiber Detection) ---
  function formatTransferSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s (0 Mbps)';
    const mbps = (bytesPerSec * 8) / 1000000;
    const byteSpeed = `${formatBytes(bytesPerSec)}/s`;

    if (mbps >= 800) {
      const val = mbps >= 1000 ? (mbps / 1000).toFixed(1) + ' Gbps' : Math.round(mbps) + ' Mbps';
      return `${byteSpeed} (${val} 🚀 Gigabit Fiber)`;
    }
    if (mbps >= 100) {
      return `${byteSpeed} (${Math.round(mbps)} Mbps ⚡ Fiber)`;
    }
    if (mbps >= 1) {
      return `${byteSpeed} (${mbps.toFixed(1)} Mbps)`;
    }
    return `${byteSpeed} (${(mbps * 1000).toFixed(0)} Kbps)`;
  }

  // --- Automatic Network / Internet Speed Detector ---
  function detectNetworkCapabilities() {
    const netLabel = document.getElementById('net-speed-label');
    const netBadge = document.getElementById('net-speed-badge');
    if (!netLabel) return;

    if (navigator.connection) {
      const conn = navigator.connection;
      const updateNetBadge = () => {
        const downlink = conn.downlink || 0; // Downlink in Mbps
        const type = conn.effectiveType || '';
        const rtt = conn.rtt || 0;

        if (downlink >= 10) {
          netLabel.textContent = `⚡ Fiber Ready (${downlink >= 10 ? '100M+' : downlink + 'M'})`;
          if (netBadge) netBadge.title = `High-Speed Connection Detected (~${downlink} Mbps downlink, ${rtt}ms RTT). Automatic chunk scaling active.`;
        } else if (downlink >= 2) {
          netLabel.textContent = `📶 High Speed (${downlink} Mbps)`;
        } else if (type) {
          netLabel.textContent = `📶 ${type.toUpperCase()}`;
        }
      };

      updateNetBadge();
      conn.addEventListener('change', updateNetBadge);
    } else {
      netLabel.textContent = '⚡ Gigabit/Fiber Auto';
    }
  }

  // --- Toast Notifications ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(text, duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
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

  function showRichToast({ title, preview, isUrl, url, onCopy, duration = 6500 }) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-rich';

    let actionButtonsHtml = '';
    if (isUrl && url) {
      actionButtonsHtml += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="toast-btn toast-btn-primary">🔗 Open Link ↗</a>`;
    }
    actionButtonsHtml += `<button type="button" class="toast-btn btn-toast-copy">📋 Copy</button>`;
    actionButtonsHtml += `<button type="button" class="toast-btn btn-toast-view">💬 View Text</button>`;

    toast.innerHTML = `
      <div class="toast-row">
        <strong style="color:var(--accent-cyan);font-size:12px;">${escapeHtml(title)}</strong>
      </div>
      <div class="toast-preview-text">"${escapeHtml(preview)}"</div>
      <div class="toast-actions-strip">
        ${actionButtonsHtml}
      </div>
    `;

    const copyBtn = toast.querySelector('.btn-toast-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onCopy) onCopy();
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => { if (copyBtn) copyBtn.textContent = '📋 Copy'; }, 1500);
      });
    }

    const viewBtn = toast.querySelector('.btn-toast-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTextModal(preview);
        toast.remove();
      });
    }

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

  // Helper to distinguish true cloud serverless deployment (Vercel) from local Node.js network server
  function isCloudServerlessEnv() {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    if (port === '53317' || port === '3000' || port === '8080') return false;
    if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host.endsWith('.local')) {
      return false;
    }
    return true; // True only for public cloud serverless instances (e.g. omni-drop-iota.vercel.app)
  }

  // --- Worldwide WebRTC P2P Configuration & State ---
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelay',
        credential: 'openrelay'
      }
    ]
  };

  // IP comparison helper for exact matching (same Wi-Fi router / NAT or IPv6 prefix)
  function isIpMatch(ip1, ip2) {
    if (!ip1 || !ip2) return false;
    if (ip1 === ip2) return true;
    const c1 = ip1.replace(/^::ffff:/, '').trim();
    const c2 = ip2.replace(/^::ffff:/, '').trim();
    if (c1 === c2) return true;
    if (c1.includes(':') && c2.includes(':')) {
      const p1 = c1.split(':').slice(0, 4).join(':');
      const p2 = c2.split(':').slice(0, 4).join(':');
      if (p1 && p1 === p2) return true;
    }
    return false;
  }

  const pendingPairResolvers = new Map(); // pin/peerId -> callback

  // --- Supabase Realtime Universal Event & Signal Router ---
  function handleSupabaseSignal(payload, topic) {
    if (!payload || typeof payload !== 'object') return;

    // 1. Radar Discovery: Nearby / Same Network Peers
    if (payload.type === 'RADAR_ANNOUNCE' && payload.peer) {
      const p = payload.peer;
      if (p.id === (myInfo.id || myClientId)) return;
      if (p.pin && myInfo.pin && p.pin === myInfo.pin) return;

      // Filter: Show peers that are on the same local Wi-Fi / LAN or same public IP
      const sameNet = (!isCloudServerlessEnv()) ||
        (myInfo.ip && p.ip && isIpMatch(myInfo.ip, p.ip)) ||
        (myInfo.localLanIp && p.localLanIp && isIpMatch(myInfo.localLanIp, p.localLanIp));

      if (sameNet) {
        p.isWebRTC = true;
        p.isRemote = true;
        p.lastSeen = Date.now();
        const isNew = !peersMap.has(p.id);
        peersMap.set(p.id, p);
        if (p.pin) peersMap.set('pin_' + p.pin, p);
        renderRadarPeers();

        // If newly discovered nearby peer, send RADAR_REPLY back directly
        if (isNew && window.OmniDropSupabase) {
          window.OmniDropSupabase.sendToPeer(p.id, {
            type: 'RADAR_REPLY',
            targetId: p.id,
            peer: {
              id: myInfo.id || myClientId,
              name: myInfo.name,
              os: myInfo.os,
              deviceType: myInfo.deviceType,
              pin: myInfo.pin,
              ip: myInfo.ip,
              localLanIp: myInfo.localLanIp
            }
          });
        }
      }
      return;
    }

    if (payload.type === 'RADAR_REPLY' && payload.peer) {
      const p = payload.peer;
      if (p.id === (myInfo.id || myClientId)) return;
      p.isWebRTC = true;
      p.isRemote = true;
      p.lastSeen = Date.now();
      peersMap.set(p.id, p);
      if (p.pin) peersMap.set('pin_' + p.pin, p);
      renderRadarPeers();
      return;
    }

    // 2. PIN-Based Pairing Request
    if (payload.type === 'PAIR_REQUEST' && payload.sender) {
      const sender = payload.sender;
      if (sender.id === (myInfo.id || myClientId)) return;
      sender.isWebRTC = true;
      sender.isRemote = true;
      sender.lastSeen = Date.now();
      peersMap.set(sender.id, sender);
      if (sender.pin) peersMap.set('pin_' + sender.pin, sender);
      renderRadarPeers();

      playChime('incoming');
      triggerHaptic('medium');
      showToast(`✨ Connected to ${sender.name} via PIN #${myInfo.pin}!`);

      if (window.OmniDropSupabase) {
        window.OmniDropSupabase.sendToPeer(sender.id, {
          type: 'PAIR_ACCEPT',
          targetId: sender.id,
          peer: {
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin,
            ip: myInfo.ip
          }
        });
      }

      // Prepare WebRTC connection as receiver
      createWebRTCPeerConnection(sender.id, sender, myInfo.pin, false);
      return;
    }

    // 3. PIN-Based Pairing Accept
    if (payload.type === 'PAIR_ACCEPT' && payload.peer) {
      const target = payload.peer;
      target.isWebRTC = true;
      target.isRemote = true;
      target.lastSeen = Date.now();
      peersMap.set(target.id, target);
      if (target.pin) peersMap.set('pin_' + target.pin, target);
      renderRadarPeers();

      // Resolve pending directPairByPin promise
      if (target.pin && pendingPairResolvers.has(target.pin)) {
        pendingPairResolvers.get(target.pin)(target);
      }
      if (target.id && pendingPairResolvers.has(target.id)) {
        pendingPairResolvers.get(target.id)(target);
      }

      playChime('incoming');
      triggerHaptic('medium');
      showToast(`✨ Connected to ${target.name}! Tap device to beam files.`);

      const modalPinPair = document.getElementById('modal-pin-pair');
      if (modalPinPair) modalPinPair.style.display = 'none';
      const qrModal = document.getElementById('modal-qr');
      if (qrModal) qrModal.style.display = 'none';

      // Initiate WebRTC offer to target peer
      createWebRTCPeerConnection(target.id, target, target.pin, true);
      return;
    }

    // 4. WebRTC Offer / Answer / ICE Candidates
    if (payload.type === 'offer' || payload.type === 'answer' || payload.type === 'candidate') {
      handleWebRTCSignal({
        fromId: payload.fromId,
        signal: payload,
        roomCode: payload.roomCode
      });
      return;
    }

    // 5. Transfer Request & Response Fallbacks over Supabase
    if (payload.type === 'TRANSFER_REQUEST') {
      const conn = webrtcConnections.get(payload.fromId);
      handleIncomingTransferPrompt({
        transferId: payload.transferId,
        sender: payload.sender,
        files: payload.files,
        totalSize: payload.totalSize,
        formattedSize: formatBytes(payload.totalSize || 0),
        isWebRTC: true,
        dc: conn?.dc
      });
      return;
    }

    if (payload.type === 'TRANSFER_RESPONSE') {
      if (payload.accepted) {
        if (activeWebRTCOutgoing && activeWebRTCOutgoing.transferId === payload.transferId) {
          if (!activeWebRTCOutgoing.streamingStarted) {
            activeWebRTCOutgoing.streamingStarted = true;
            if (activeWebRTCOutgoing.dc && (activeWebRTCOutgoing.dc.readyState === 'open' || activeWebRTCOutgoing.dc.open)) {
              streamFilesOverWebRTCDataChannel(activeWebRTCOutgoing);
            } else {
              streamFilesOverSupabase(activeWebRTCOutgoing);
            }
          }
        }
      } else {
        const progressModal = document.getElementById('modal-progress');
        if (progressModal) progressModal.style.display = 'none';
        showToast('❌ Recipient declined the transfer.');
        activeWebRTCOutgoing = null;
      }
      return;
    }

    // 6. Supabase Chunk Streaming Fallback
    if (payload.type === 'TRANSFER_CHUNK') {
      try {
        const binaryString = atob(payload.chunk);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        handleWebRTCBinaryChunk(bytes.buffer);
      } catch (e) {
        console.error('Error decoding Supabase chunk:', e);
      }
      return;
    }

    if (payload.type === 'FILE_START' || payload.type === 'FILE_END' || payload.type === 'TRANSFER_COMPLETE') {
      const senderPeer = peersMap.get(payload.fromId) || { id: payload.fromId, name: 'Remote Peer' };
      handleWebRTCControlMessage(payload, payload.fromId, senderPeer, null);
      return;
    }

    // 7. Clipboard Sync
    if (payload.type === 'CLIPBOARD') {
      handleIncomingClipboardMessage(payload, payload.sender);
      return;
    }
  }

  const webrtcConnections = new Map(); // key: peerId -> { pc, dc, peer, roomCode, pendingCandidates: [], isInitiator: boolean }
  let currentRemoteRoomCode = null;
  let roomPollingTimer = null;
  let activeWebRTCOutgoing = null;
  let currentWebRTCReceiving = null;
  const pendingSendFilesQueue = new Map(); // targetId -> { targetPeer, files }

  // --- PeerJS Worldwide Cloud Broker Integration ---
  let myPeer = null;
  const peerJSConnections = new Map(); // key: peerId/PIN -> DataConnection

  function updatePinDisplays(pin) {
    if (!pin) return;
    myInfo.pin = pin;
    currentRemoteRoomCode = pin;
    try { localStorage.setItem('omnidrop_pin', pin); } catch (e) {}

    const pinBadge = document.getElementById('self-pin-badge');
    if (pinBadge) pinBadge.textContent = `PIN: ${pin}`;
    const modalPin = document.getElementById('modal-my-pin');
    if (modalPin) modalPin.textContent = pin;
    const quickCodeEl = document.getElementById('quick-my-code');
    if (quickCodeEl) quickCodeEl.textContent = pin;

    const isRemoteClient = isCloudServerlessEnv();
    const hostUrl = isRemoteClient
      ? `${window.location.origin}/?room=${pin}`
      : `http://${myInfo.ip || '127.0.0.1'}:${myInfo.port || 53317}/?pair=${pin}`;
    const qrUrlText = document.getElementById('qr-url-text');
    if (qrUrlText) qrUrlText.textContent = hostUrl;
    if (window.renderQRCodeSVG) {
      const qrOutput = document.getElementById('qr-output');
      if (qrOutput) qrOutput.innerHTML = window.renderQRCodeSVG(hostUrl, { size: 200 });
      const qrContainer = document.getElementById('qr-container');
      if (qrContainer) qrContainer.innerHTML = window.renderQRCodeSVG(hostUrl, { size: 180 });
    }
  }

  function initPeerJS(preferredPin) {
    if (typeof Peer === 'undefined') {
      console.warn('[PeerJS] Peer library not loaded yet');
      return;
    }
    const pin = (preferredPin || myInfo.pin || '').toString().trim().replace(/\D/g, '');
    if (!pin || pin.length !== 6) return;

    const targetId = 'od_' + pin;
    if (myPeer && !myPeer.destroyed && myPeer.id === targetId) {
      return;
    }
    if (myPeer && !myPeer.destroyed) {
      try { myPeer.destroy(); } catch (e) {}
    }

    try {
      console.log(`[PeerJS] Initializing broker with ID: ${targetId}`);
      myPeer = new Peer(targetId, {
        debug: 1,
        secure: window.location.protocol === 'https:',
        port: window.location.protocol === 'https:' ? 443 : 80,
        config: RTC_CONFIG
      });

      myPeer.on('open', (id) => {
        console.log(`[PeerJS] Connected to signaling broker! Active ID: ${id}`);
        myInfo.peerId = id;
      });

      myPeer.on('connection', (conn) => {
        console.log(`[PeerJS] Incoming connection from: ${conn.peer}`);
        setupPeerJSDataConnection(conn);
      });

      myPeer.on('error', (err) => {
        console.warn(`[PeerJS] Broker error (${err.type}):`, err.message);
        if (err.type === 'unavailable-id') {
          console.warn('[PeerJS] PIN in use on broker, refreshing PIN...');
          const freshPin = Math.floor(100000 + Math.random() * 900000).toString();
          updatePinDisplays(freshPin);
          setTimeout(() => initPeerJS(freshPin), 500);
        }
      });

      myPeer.on('disconnected', () => {
        console.log('[PeerJS] Disconnected from broker, reconnecting...');
        if (myPeer && !myPeer.destroyed) {
          try { myPeer.reconnect(); } catch (e) {}
        }
      });
    } catch (err) {
      console.warn('[PeerJS] Initialization error:', err);
    }
  }

  function setupPeerJSDataConnection(conn) {
    if (!conn) return;

    const onOpen = () => {
      console.log(`[PeerJS DataConnection OPEN] with ${conn.peer}`);
      peerJSConnections.set(conn.peer, conn);

      let remotePin = '';
      if (conn.peer && conn.peer.startsWith('od_')) {
        remotePin = conn.peer.slice(3);
        peerJSConnections.set(remotePin, conn);
      }

      // Store in webrtcConnections so existing WebRTC pipelines use this connection
      const wrapper = {
        pc: conn.peerConnection,
        dc: conn.dataChannel || conn,
        peerConn: conn,
        peerId: conn.peer,
        pin: remotePin,
        isPeerJS: true,
        isWebRTC: true,
        isRemote: true
      };
      webrtcConnections.set(conn.peer, wrapper);
      if (remotePin) {
        webrtcConnections.set(remotePin, wrapper);
      }

      // Send self peer info so remote peer registers us on radar
      try {
        conn.send(JSON.stringify({
          type: 'PEER_INFO',
          peer: {
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin,
            peerId: myPeer ? myPeer.id : ('od_' + myInfo.pin),
            isWebRTC: true,
            isRemote: true
          }
        }));
      } catch (e) {}

      // Auto-drain any queued transfers for this peer
      for (const [key, item] of pendingSendFilesQueue.entries()) {
        const matches = (key === conn.peer) || (remotePin && key === remotePin) ||
          (item.targetPeer && (item.targetPeer.id === conn.peer || item.targetPeer.pin === remotePin || ('od_' + item.targetPeer.pin) === conn.peer));
        if (matches) {
          pendingSendFilesQueue.delete(key);
          const modal = document.getElementById('modal-progress');
          if (modal) {
            document.getElementById('progress-title').textContent = 'Waiting for Recipient...';
            document.getElementById('progress-target').textContent = `Waiting for ${item.targetPeer.name} to accept (Worldwide P2P)...`;
          }
          initiateWebRTCSendFiles(item.targetPeer, item.files, conn.dataChannel || conn);
          break;
        }
      }
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (data) => {
      handlePeerJSData(conn, data);
    });

    conn.on('close', () => {
      console.log(`[PeerJS DataConnection CLOSED] with ${conn.peer}`);
      peerJSConnections.delete(conn.peer);
      webrtcConnections.delete(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn(`[PeerJS DataConnection ERROR] with ${conn.peer}:`, err);
    });
  }

  function handlePeerJSData(conn, data) {
    if (data instanceof ArrayBuffer) {
      handleWebRTCBinaryChunk(data);
      return;
    }

    let msg = data;
    if (typeof data === 'string') {
      try { msg = JSON.parse(data); } catch (e) { return; }
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'PEER_INFO' && msg.peer) {
      const p = msg.peer;
      p.isWebRTC = true;
      p.isRemote = true;
      p.peerId = conn.peer;
      peersMap.set(p.id, p);
      if (p.pin) {
        peersMap.set('od_' + p.pin, p);
      }
      const existing = webrtcConnections.get(conn.peer);
      if (existing) {
        existing.peer = p;
        webrtcConnections.set(p.id, existing);
      }
      renderRadarPeers();
      playChime('incoming');
      showToast(`✨ Connected to ${p.name}!`);
      return;
    }

    const senderPeer = (msg.sender && peersMap.get(msg.sender.id)) || peersMap.get(conn.peer) || {
      id: conn.peer,
      name: (msg.sender && msg.sender.name) || 'Remote Device',
      os: (msg.sender && msg.sender.os) || 'unknown',
      isWebRTC: true,
      isRemote: true
    };
    handleWebRTCControlMessage(msg, senderPeer.id, senderPeer, conn.dataChannel || conn);
  }

  function connectPeerViaPeerJS(targetPeer) {
    if (typeof Peer === 'undefined') return null;
    if (!myPeer || myPeer.destroyed) {
      initPeerJS();
    }
    if (!myPeer) return null;

    const targetPeerId = targetPeer.peerId || (targetPeer.pin ? ('od_' + targetPeer.pin) : null);
    if (!targetPeerId) return null;

    let conn = peerJSConnections.get(targetPeerId) || (targetPeer.pin ? peerJSConnections.get(targetPeer.pin) : null);
    if (conn && conn.open) return conn;

    try {
      console.log(`[PeerJS] Connecting to peer: ${targetPeerId}`);
      conn = myPeer.connect(targetPeerId, { reliable: true, serialization: 'none' });
      setupPeerJSDataConnection(conn);
      return conn;
    } catch (e) {
      console.warn('[PeerJS] connect failed:', e);
      return null;
    }
  }

  // Detect local subnet LAN IP via WebRTC host candidate
  function detectLocalLanIp() {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('lan-ip-probe');
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {});
      pc.onicecandidate = (e) => {
        if (e && e.candidate && e.candidate.candidate) {
          const parts = e.candidate.candidate.split(' ');
          const ip = parts[4];
          if (ip && (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'))) {
            if (myInfo) myInfo.localLanIp = ip;
            try { pc.close(); } catch (err) {}
          }
        }
      };
      setTimeout(() => { try { pc.close(); } catch (err) {} }, 3000);
    } catch (e) {}
  }

  // --- Background Transfer Keepalive & Screen Wake Lock ---
  let activeWakeLock = null;
  let backgroundAudioCtx = null;

  async function acquireTransferWakeLock() {
    // 1. Desktop App Mode: Native OS-level PowerSaveBlocker (macOS, Windows, Linux)
    try {
      if (window.electronAPI && window.electronAPI.acquireWakeLock) {
        window.electronAPI.acquireWakeLock();
      }
    } catch (e) {}

    // 2. Native Android APK / iOS App Mode: Capacitor KeepAwake Plugin
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAwake) {
        window.Capacitor.Plugins.KeepAwake.keepAwake();
      }
    } catch (e) {}

    // 3. Web & Mobile Browser Mode: W3C Screen Wake Lock API
    try {
      if ('wakeLock' in navigator && !activeWakeLock) {
        activeWakeLock = await navigator.wakeLock.request('screen');
        activeWakeLock.addEventListener('release', () => {
          activeWakeLock = null;
        });
      }
    } catch (e) {}

    // 4. Silent Web Audio keepalive: prevents iOS Safari & Android from suspending WebRTC in background
    try {
      if (!backgroundAudioCtx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        backgroundAudioCtx = new AudioContextClass();
        const osc = backgroundAudioCtx.createOscillator();
        const gain = backgroundAudioCtx.createGain();
        gain.gain.value = 0.00001; // Silent / Inaudible
        osc.connect(gain);
        gain.connect(backgroundAudioCtx.destination);
        osc.start();
      }
    } catch (e) {}
  }

  function releaseTransferWakeLock() {
    // 1. Desktop App Mode
    try {
      if (window.electronAPI && window.electronAPI.releaseWakeLock) {
        window.electronAPI.releaseWakeLock();
      }
    } catch (e) {}

    // 2. Native Android APK / iOS App Mode
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAwake) {
        window.Capacitor.Plugins.KeepAwake.allowSleep();
      }
    } catch (e) {}

    // 3. Screen Wake Lock
    try {
      if (activeWakeLock) {
        activeWakeLock.release().catch(() => {});
        activeWakeLock = null;
      }
    } catch (e) {}

    // 4. Background Web Audio
    try {
      if (backgroundAudioCtx) {
        backgroundAudioCtx.close().catch(() => {});
        backgroundAudioCtx = null;
      }
    } catch (e) {}
  }

  // Re-acquire wake lock if user returns to page during active transfer
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (activeWebRTCOutgoing || currentWebRTCReceiving || activeOutgoingTransfer || activeIncomingTransfer)) {
      acquireTransferWakeLock();
    }
  });

  // Get active nearby peers deduplicated by physical device (IP + OS or PIN)
  function getActiveUniquePeers() {
    const unique = new Map();
    for (const peer of peersMap.values()) {
      if (!peer || !peer.id) continue;
      if (peer.id === myInfo.id || peer.id === myClientId) continue;
      if (myPeer && peer.id === myPeer.id) continue;
      if (myInfo.pin && (peer.pin === myInfo.pin || peer.id === 'od_' + myInfo.pin)) continue;
      if (peer.id === 'cloud_node' || peer.id.startsWith('omni_')) continue;
      if (peer.name && peer.name.includes('Cloud Node')) continue;

      // Deduplicate by PIN if present, otherwise by ID
      const key = (peer.pin && peer.pin.length === 6)
        ? `pin_${peer.pin}`
        : (peer.id.startsWith('od_') ? `pin_${peer.id.slice(3)}` : peer.id);

      unique.set(key, peer);
    }
    return Array.from(unique.values());
  }

  // Persistent registration with host (preserves device identity, name and PIN across screen locks)
  async function registerWithHost() {
    if (!isCloudServerlessEnv()) return;

    try {
      const { clientOS, clientType } = detectClientDevice();
      let storedPin = myInfo.pin || '';
      try {
        if (!storedPin) storedPin = localStorage.getItem('omnidrop_pin') || '';
      } catch (e) {}

      const regRes = await fetch('/api/register-web-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: myClientId,
          name: myInfo.name || `${clientOS.toUpperCase()} Device`,
          deviceType: myInfo.deviceType || clientType,
          os: myInfo.os || clientOS,
          pin: storedPin || undefined,
          peerId: myPeer ? myPeer.id : ('od_' + (storedPin || myInfo.pin)),
          localLanIp: myInfo.localLanIp || undefined
        })
      });
      if (regRes.ok) {
        const regData = await regRes.json();
        if (regData && regData.pin) {
          myInfo.pin = regData.pin;
          currentRemoteRoomCode = regData.pin;
          try { localStorage.setItem('omnidrop_pin', regData.pin); } catch (e) {}
          updatePinDisplays(regData.pin);
          initPeerJS(regData.pin);
          if (window.OmniDropSupabase) {
            window.OmniDropSupabase.updateSelf(myInfo.id || myClientId, regData.pin);
          }
        }
      }
    } catch (e) {
      console.warn('[OmniDrop] Registration ping failed:', e.message);
    }
  }

  // --- Fetch Self Info & Setup SSE ---
  async function initSelf() {
    detectLocalLanIp();
    const { clientOS, clientType } = detectClientDevice();
    const isRemoteClient = isCloudServerlessEnv();

    // 1. Guaranteed Instant 6-digit PIN (Zero Waiting, Never stuck on "------")
    let persistentPin = '';
    try {
      persistentPin = localStorage.getItem('omnidrop_pin') || '';
    } catch (e) {}

    if (!persistentPin || persistentPin.length !== 6 || !/^\d{6}$/.test(persistentPin)) {
      persistentPin = Math.floor(100000 + Math.random() * 900000).toString();
      try { localStorage.setItem('omnidrop_pin', persistentPin); } catch (e) {}
    }

    // Initialize myInfo immediately with full defaults
    if (!myInfo) myInfo = {};
    myInfo.id = myInfo.id || myClientId;
    myInfo.os = myInfo.os || clientOS;
    myInfo.deviceType = myInfo.deviceType || clientType;
    myInfo.name = myInfo.name || `${clientOS.toUpperCase()} Device`;
    myInfo.pin = persistentPin;
    currentRemoteRoomCode = persistentPin;

    // Immediately display the 6-digit PIN across the UI
    const pinBadge = document.getElementById('self-pin-badge');
    if (pinBadge) pinBadge.textContent = `PIN: ${myInfo.pin}`;
    const modalPin = document.getElementById('modal-my-pin');
    if (modalPin) modalPin.textContent = myInfo.pin;
    const quickCodeEl = document.getElementById('quick-my-code');
    if (quickCodeEl) quickCodeEl.textContent = myInfo.pin;
    const selfNameEl = document.getElementById('self-name');
    if (selfNameEl) selfNameEl.textContent = myInfo.name;
    const avatarIcon = document.getElementById('self-avatar-icon');
    if (avatarIcon) avatarIcon.innerHTML = getDeviceIconSvg(myInfo.os, myInfo.deviceType);

    // Initial QR code URL (uses window.location.origin on cloud/remote or direct IP on local LAN)
    const hostUrl = isRemoteClient
      ? `${window.location.origin}/?room=${myInfo.pin}`
      : `http://${myInfo.ip || '127.0.0.1'}:${myInfo.port || 53317}/?pair=${myInfo.pin}`;
    const qrUrlText = document.getElementById('qr-url-text');
    if (qrUrlText) qrUrlText.textContent = hostUrl;
    if (window.renderQRCodeSVG) {
      const qrOutput = document.getElementById('qr-output');
      if (qrOutput) qrOutput.innerHTML = window.renderQRCodeSVG(hostUrl, { size: 200 });
    }

    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.ip) {
            myInfo.ip = data.ip;
          }
          if (!isRemoteClient) {
            myInfo = Object.assign({}, myInfo, data);
            if (data.pin) myInfo.pin = data.pin;
          } else {
            myInfo.downloadsDir = data.downloadsDir || myInfo.downloadsDir;
          }
        }
      }
    } catch (err) {
      console.warn('[OmniDrop] /api/me check fallback to cloud P2P mode:', err.message);
    }

    // Refresh UI with latest info
    if (selfNameEl) selfNameEl.textContent = myInfo.name;
    if (avatarIcon) avatarIcon.innerHTML = getDeviceIconSvg(myInfo.os, myInfo.deviceType);
    updatePinDisplays(myInfo.pin);
    initPeerJS(myInfo.pin);

    // Initialize Supabase Realtime (Worldwide 0-server signaling & instant radar presence)
    if (window.OmniDropSupabase) {
      window.OmniDropSupabase.init(myInfo.id || myClientId, myInfo.pin, handleSupabaseSignal);
      window.OmniDropSupabase.updateSelf(myInfo.id || myClientId, myInfo.pin);
      window.OmniDropSupabase.broadcastRadar({
        id: myInfo.id || myClientId,
        name: myInfo.name,
        os: myInfo.os,
        deviceType: myInfo.deviceType,
        pin: myInfo.pin,
        ip: myInfo.ip,
        localLanIp: myInfo.localLanIp
      });

      // Regular radar presence heartbeat every 8 seconds
      setInterval(() => {
        if (window.OmniDropSupabase && window.OmniDropSupabase.isConnected()) {
          window.OmniDropSupabase.broadcastRadar({
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin,
            ip: myInfo.ip,
            localLanIp: myInfo.localLanIp
          });
        }
      }, 8000);
    }

    // On remote/cloud clients (Vercel): register with host/relay and activate WebRTC room
    if (isRemoteClient) {
      await registerWithHost();
      createRemoteRoom();
      startRoomPolling();
    }

    // Connect SSE stream
    connectSSE();

    // Fetch initial peer list
    fetchPeers();

    // Check if URL has ?pair=XXXXXX or ?room=XXXXXX for instant 0-second auto-connect!
    const urlParams = new URLSearchParams(window.location.search);
    const pairPin = urlParams.get('pair') || urlParams.get('room');
    if (pairPin && pairPin !== myInfo.pin) {
      setTimeout(() => directPairByPin(pairPin), 400);
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

    // When someone joins our Worldwide WebRTC Room
    eventSource.addEventListener('room_peer_joined', e => {
      try {
        const data = JSON.parse(e.data);
        if (data.peer && data.peer.id !== (myInfo.id || myClientId)) {
          handleRemotePeerJoined(data.peer, data.roomCode);
        }
      } catch (err) {
        console.error('Failed to parse room_peer_joined:', err);
      }
    });

    // Incoming WebRTC signaling (offer, answer, ICE candidates)
    eventSource.addEventListener('room_signal', e => {
      try {
        const data = JSON.parse(e.data);
        handleWebRTCSignal(data);
      } catch (err) {
        console.error('Failed to parse room_signal:', err);
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

    // Received instant text/clipboard (Universal AirDrop Continuity)
    eventSource.addEventListener('clipboard_received', e => {
      const data = JSON.parse(e.data);
      playChime('incoming');
      triggerHaptic('medium');

      // Auto-copy to system clipboard if enabled
      const autoClip = document.getElementById('setting-auto-clipboard')?.checked ?? true;
      if (autoClip && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.text).catch(() => {});
      }

      // Save to snippets history
      saveSnippet({
        text: data.text,
        isUrl: data.isUrl,
        sender: data.sender,
        direction: 'received',
        timestamp: data.timestamp || Date.now()
      });

      const senderName = data.sender?.name || 'Nearby Device';
      const preview = data.text.length > 55 ? data.text.slice(0, 52) + '...' : data.text;

      showRichToast({
        title: `📋 AirDrop Continuity from ${senderName}`,
        preview: preview,
        isUrl: data.isUrl,
        url: data.isUrl ? data.text : null,
        onCopy: () => {
          navigator.clipboard?.writeText(data.text).catch(() => {});
          triggerHaptic('light');
        }
      });
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

      // Remove any peers that left or are no longer active (preserves actively open WebRTC peers)
      for (const [id, peer] of peersMap.entries()) {
        if (peer && peer.isWebRTC) {
          const conn = webrtcConnections.get(id);
          if (conn && conn.dc && conn.dc.readyState === 'open') {
            continue; // Keep actively connected WebRTC peer
          }
        }
        if (!currentIds.has(id)) {
          peersMap.delete(id);
          hasChanges = true;
        }
      }

      for (const peer of list) {
        if (!peer || !peer.id) continue;
        if (peer.id === (myInfo.id || myClientId) || peer.id.startsWith('omni_') || peer.id === 'cloud_node') continue;
        if (peer.name && peer.name.includes('Cloud Node')) continue;

        const old = peersMap.get(peer.id);
        if (!old || old.name !== peer.name || old.ip !== peer.ip || old.pin !== peer.pin) {
          hasChanges = true;
        }
        peersMap.set(peer.id, peer);

        // Auto-connect WebRTC DataChannel for discovered remote/cloud peers (Cloud serverless only)
        const isCloud = isCloudServerlessEnv();
        if (isCloud && (peer.isWebRTC || peer.isRemote || isCloud)) {
          peer.isWebRTC = true;
          peer.isRemote = true;
          if (peer.pin) {
            connectPeerViaPeerJS(peer);
          }
          const myId = myInfo.id || myClientId;
          const targetRoom = peer.roomCode || peer.pin || currentRemoteRoomCode;
          // Glare-free negotiation: device with lexicographically smaller ID initiates offer
          const shouldInitiate = myId < peer.id;
          if (!webrtcConnections.has(peer.id)) {
            createWebRTCPeerConnection(peer.id, peer, targetRoom, shouldInitiate);
          }
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

  // --- Web Share Target API: IndexedDB Retrieval ---
  function openShareDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('omnidrop_share_db', 1);
      request.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('shares')) {
          db.createObjectStore('shares', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getPendingShareData() {
    try {
      const db = await openShareDB();
      return new Promise((resolve) => {
        const tx = db.transaction('shares', 'readwrite');
        const store = tx.objectStore('shares');
        const req = store.get('pending_share');
        req.onsuccess = () => {
          const res = req.result;
          if (res) {
            store.delete('pending_share');
          }
          resolve(res || null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  let pendingShareFiles = null;

  async function checkPendingShareTarget() {
    const isSharedParam = window.location.search.includes('shared=1');
    const shareData = await getPendingShareData();

    if (isSharedParam) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!shareData) return;

    playChime('incoming');
    triggerHaptic('medium');

    // 1. If files were shared (from Photos, Files, Gallery, etc.)
    if (shareData.files && shareData.files.length > 0) {
      pendingShareFiles = shareData.files;
      const count = pendingShareFiles.length;
      showToast(`📥 Received ${count} item${count > 1 ? 's' : ''} from Share Sheet! Tap a device on the radar to beam.`);

      const peerList = getActiveUniquePeers();
      if (peerList.length === 1) {
        initiateSendFiles(peerList[0], pendingShareFiles);
        pendingShareFiles = null;
      } else if (peerList.length > 1) {
        openTargetPickerWithFiles(pendingShareFiles);
      }
      return;
    }

    // 2. If text or URL was shared (from Safari, Chrome, WhatsApp, etc.)
    const sharedText = shareData.url || shareData.text || shareData.title || '';
    if (sharedText.trim()) {
      openTextModal(sharedText.trim());
      showToast('📥 Link/Text received from Share Sheet!');
    }
  }

  function openTargetPickerWithFiles(files) {
    pendingShareFiles = files;
    const peerList = getActiveUniquePeers();
    if (peerList.length === 0) {
      showToast('No nearby devices found. Tap "Connect Phone" to scan QR code!');
      return;
    }
    const pickerList = document.getElementById('picker-list');
    pickerList.innerHTML = peerList.map(peer => `
      <div class="picker-device-item" data-id="${peer.id}">
        <div class="peer-avatar" style="width:40px;height:40px;">
          ${getDeviceIconSvg(peer.os, peer.deviceType)}
        </div>
        <div>
          <div style="font-weight:600;font-size:14px;">${peer.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">${peer.ip || (peer.pin ? 'PIN ' + peer.pin : 'Nearby')}</div>
        </div>
      </div>
    `).join('');

    pickerList.querySelectorAll('.picker-device-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const peer = peersMap.get(id);
        document.getElementById('modal-target-picker').style.display = 'none';
        if (peer && pendingShareFiles) {
          const toSend = pendingShareFiles;
          pendingShareFiles = null;
          initiateSendFiles(peer, toSend);
        }
      });
    });

    document.getElementById('modal-target-picker').style.display = 'flex';
  }

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

      // 4. Check for any pending native shares
      checkPendingShareTarget();

      // 5. Ensure PeerJS & Supabase are active
      if (myPeer && myPeer.disconnected && !myPeer.destroyed) {
        try { myPeer.reconnect(); } catch (e) {}
      } else if (!myPeer || myPeer.destroyed) {
        initPeerJS(myInfo.pin);
      }
      if (window.OmniDropSupabase) {
        window.OmniDropSupabase.broadcastRadar({
          id: myInfo.id || myClientId,
          name: myInfo.name,
          os: myInfo.os,
          deviceType: myInfo.deviceType,
          pin: myInfo.pin,
          ip: myInfo.ip,
          localLanIp: myInfo.localLanIp
        });
      }
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
      const isRemote = Boolean(peer.isWebRTC || peer.isRemote);
      const expectedSub = isRemote
        ? (peer.roomCode ? `🌐 Room #${peer.roomCode}` : '🌐 Worldwide P2P')
        : (peer.ip && peer.ip !== 'undefined' ? peer.ip : (peer.pin ? 'PIN: ' + peer.pin : 'Nearby'));

      if (node) {
        // Node already exists: update coordinates and details smoothly without recreation or re-animation!
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        if (isRemote) {
          node.classList.add('peer-remote');
        } else {
          node.classList.remove('peer-remote');
        }
        const nameEl = node.querySelector('.peer-name');
        if (nameEl && nameEl.textContent !== peer.name) nameEl.textContent = peer.name;
        const subEl = node.querySelector('.peer-sub');
        if (subEl && subEl.textContent !== expectedSub) subEl.textContent = expectedSub;
      } else {
        // Brand new peer: construct node and animate once on entry
        node = document.createElement('div');
        node.className = 'peer-node peer-entering' + (isRemote ? ' peer-remote' : '');
        node.style.left = `${x}%`;
        node.style.top = `${y}%`;
        node.dataset.id = peer.id;

        node.innerHTML = `
          <div class="peer-avatar">
            ${getDeviceIconSvg(peer.os, peer.deviceType)}
            <span class="peer-badge ${isRemote ? 'peer-badge-remote' : ''}">${isRemote ? '🌐' : getOsBadge(peer.os)}</span>
          </div>
          <span class="peer-name">${peer.name}</span>
          <span class="peer-sub">${expectedSub}</span>
        `;

        // Click to send files or text
        node.addEventListener('click', () => {
          currentTargetPeer = peer;
          if (pendingShareFiles && pendingShareFiles.length > 0) {
            const files = pendingShareFiles;
            pendingShareFiles = null;
            initiateSendFiles(peer, files);
            return;
          }
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

    const isCloud = isCloudServerlessEnv();

    // Check if target is connected via WebRTC P2P (ONLY for Cloud Vercel serverless environment)
    if (isCloud && (targetPeer.isWebRTC || targetPeer.isRemote || webrtcConnections.has(targetPeer.id))) {
      targetPeer.isWebRTC = true;
      targetPeer.isRemote = true;
      const targetPeerId = targetPeer.peerId || (targetPeer.pin ? ('od_' + targetPeer.pin) : targetPeer.id);
      let conn = webrtcConnections.get(targetPeer.id) || webrtcConnections.get(targetPeerId) || (targetPeer.pin ? webrtcConnections.get(targetPeer.pin) : null);

      if (conn && conn.dc && (conn.dc.readyState === 'open' || conn.dc.open)) {
        return initiateWebRTCSendFiles(targetPeer, files, conn.dc);
      } else {
        // Enqueue files to automatically drain the moment DataChannel finishes opening
        pendingSendFilesQueue.set(targetPeer.id, { targetPeer, files });
        if (targetPeer.pin) pendingSendFilesQueue.set('pin_' + targetPeer.pin, { targetPeer, files });
        if (targetPeerId) pendingSendFilesQueue.set(targetPeerId, { targetPeer, files });

        // Connect via built-in WebRTC signaling
        const roomCode = targetPeer.roomCode || targetPeer.pin || currentRemoteRoomCode;
        if (!conn || !conn.pc || conn.pc.connectionState === 'failed' || conn.pc.connectionState === 'closed') {
          conn = createWebRTCPeerConnection(targetPeer.id, targetPeer, roomCode, true);
        }

        // Fast fallback: If WebRTC DataChannel doesn't open within 3 seconds,
        // proceed immediately with transfer request via Supabase Realtime!
        setTimeout(() => {
          const hasPending = pendingSendFilesQueue.has(targetPeer.id) ||
            (targetPeer.pin && pendingSendFilesQueue.has('pin_' + targetPeer.pin)) ||
            (targetPeerId && pendingSendFilesQueue.has(targetPeerId));

          if (hasPending) {
            pendingSendFilesQueue.delete(targetPeer.id);
            if (targetPeer.pin) pendingSendFilesQueue.delete('pin_' + targetPeer.pin);
            if (targetPeerId) pendingSendFilesQueue.delete(targetPeerId);

            const activeDc = conn && conn.dc && (conn.dc.readyState === 'open' || conn.dc.open) ? conn.dc : null;
            initiateWebRTCSendFiles(targetPeer, files, activeDc);
          }
        }, 3000);
        return;
      }
    }

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
    document.getElementById('incoming-sender-title').textContent = req.isWebRTC
      ? `${req.sender.name} (🌐 Worldwide P2P) wants to share`
      : `${req.sender.name} wants to share with you`;
    document.getElementById('incoming-files-info').innerHTML = `
      <span class="file-count">${req.files.length} File(s)</span> &bull; 
      <span class="file-size">${req.formattedSize || formatBytes(req.totalSize || 0)}</span>
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

    const isCloud = isCloudServerlessEnv();
    const isP2P = pendingIncomingTransfer.isWebRTC || isCloud;

    // Handle WebRTC direct DataChannel transfer accept (Worldwide Cloud & Direct P2P)
    if (isP2P) {
      const currentTransfer = pendingIncomingTransfer;
      document.getElementById('modal-incoming').style.display = 'none';

      // Direct-to-Disk streaming for large files (enables 50GB, 150GB+ without RAM limits)
      let fileStream = null;
      if (window.showSaveFilePicker && currentTransfer.files.length === 1 && currentTransfer.totalSize > 25 * 1024 * 1024) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: currentTransfer.files[0].name });
          fileStream = await handle.createWritable();
        } catch (e) {
          // User dismissed picker or not supported; falls back smoothly to in-memory chunks
        }
      }

      const activeDc = currentTransfer.dc || webrtcConnections.get(currentTransfer.sender?.id)?.dc;
      if (activeDc && (activeDc.readyState === 'open' || activeDc.open)) {
        try {
          activeDc.send(JSON.stringify({
            type: 'TRANSFER_RESPONSE',
            transferId: currentTransfer.transferId,
            accepted: true
          }));
        } catch (err) {
          console.warn('DC send accept notice:', err);
        }
      }

      // ALSO broadcast acceptance via Supabase Realtime for instant guaranteed delivery
      if (window.OmniDropSupabase && currentTransfer.sender?.id) {
        window.OmniDropSupabase.sendToPeer(currentTransfer.sender.id, {
          type: 'TRANSFER_RESPONSE',
          transferId: currentTransfer.transferId,
          accepted: true
        });
      }

      currentWebRTCReceiving = {
        transferId: currentTransfer.transferId,
        sender: currentTransfer.sender,
        files: currentTransfer.files,
        totalSize: currentTransfer.totalSize,
        totalFiles: currentTransfer.files.length,
        currentFileIndex: 0,
        currentFileName: '',
        currentFileSize: 0,
        currentFileType: 'application/octet-stream',
        receivedFileBytes: 0,
        totalReceivedBytes: 0,
        fileBlobParts: [],
        receivedBlobs: [],
        fileStream: fileStream,
        startTime: Date.now()
      };

      // Keep display and background connection active
      acquireTransferWakeLock();

      document.getElementById('progress-title').textContent = 'Receiving Worldwide (P2P)...';
      document.getElementById('progress-target').textContent = `From ${currentTransfer.sender.name}`;
      document.getElementById('modal-progress').style.display = 'flex';
      return;
    }

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
          senderId: currentTransfer.sender?.id,
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

    const currentTransfer = pendingIncomingTransfer;
    document.getElementById('modal-incoming').style.display = 'none';
    pendingIncomingTransfer = null;

    const activeDc = currentTransfer.dc || webrtcConnections.get(currentTransfer.sender?.id)?.dc;
    if (activeDc && (activeDc.readyState === 'open' || activeDc.open)) {
      try {
        activeDc.send(JSON.stringify({
          type: 'TRANSFER_RESPONSE',
          transferId: currentTransfer.transferId,
          accepted: false
        }));
      } catch (err) {}
    }

    if (window.OmniDropSupabase && currentTransfer.sender?.id) {
      window.OmniDropSupabase.sendToPeer(currentTransfer.sender.id, {
        type: 'TRANSFER_RESPONSE',
        transferId: currentTransfer.transferId,
        accepted: false
      });
    }

    try {
      await fetch('/api/transfer/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferId: currentTransfer.transferId,
          senderId: currentTransfer.sender?.id,
          accepted: false
        })
      });
    } catch (e) {}
  });

  // Progress display update via SSE or WebRTC
  function updateProgressDisplay(data) {
    document.getElementById('progress-percentage').textContent = `${data.percentage}%`;
    document.getElementById('progress-speed').textContent = data.speedFormatted;
    document.getElementById('progress-filename').textContent = `${data.fileName} (${formatBytes(data.fileBytes)} / ${formatBytes(data.fileTotal)})`;

    const offset = 314 - (314 * data.percentage / 100);
    document.getElementById('progress-ring-fill').style.strokeDashoffset = offset;

    const netLabel = document.getElementById('net-speed-label');
    if (netLabel && data.speedFormatted && data.speedFormatted !== '-- MB/s') {
      netLabel.textContent = data.speedFormatted;
    }
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
      if (file.directSaved) return; // Already saved directly to hard drive!
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

  // ============================================================== //
  // --- WORLDWIDE WEBRTC P2P ENGINE (METHOD 2: UNLIMITED DATA) --- //
  // ============================================================== //

  // Send signaling packet to remote peer via Supabase Realtime + serverless room relay
  async function sendWebRTCSignal(toId, signal, roomCode) {
    signal.fromId = myInfo.id || myClientId;
    signal.toId = toId;
    signal.targetId = toId;
    signal.roomCode = roomCode || currentRemoteRoomCode;

    // 1. Supabase Realtime (Instant, direct WebSocket delivery in <5ms)
    if (window.OmniDropSupabase) {
      window.OmniDropSupabase.sendToPeer(toId, signal);
      if (roomCode) {
        window.OmniDropSupabase.sendToRoom(roomCode, signal);
      }
    }

    // 2. HTTP Serverless Relay Fallback
    try {
      await fetch('/api/room/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toId,
          fromId: myInfo.id || myClientId,
          signal,
          roomCode: roomCode || currentRemoteRoomCode
        })
      });
    } catch (err) {
      console.warn('[WebRTC] Signal dispatch notice:', err);
    }
  }

  // Handle incoming signaling message (offer, answer, ICE candidate, join)
  async function handleWebRTCSignal(data) {
    const { fromId, signal, roomCode } = data;
    if (!signal) return;

    if (signal.type === 'room_peer_joined') {
      handleRemotePeerJoined(signal.peer, signal.roomCode);
      return;
    }

    let conn = webrtcConnections.get(fromId);
    if (!conn) {
      // If incoming offer and no connection object exists, instantiate as receiver/answerer
      if (signal.type === 'offer') {
        const peer = peersMap.get(fromId) || {
          id: fromId,
          name: signal.senderName || 'Worldwide Peer',
          os: signal.senderOs || 'unknown',
          isWebRTC: true,
          isRemote: true,
          roomCode: roomCode || currentRemoteRoomCode
        };
        conn = createWebRTCPeerConnection(fromId, peer, roomCode || currentRemoteRoomCode, false);
      } else {
        return;
      }
    }

    const { pc } = conn;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        // Flush any ICE candidates received before remote description was set
        if (conn.pendingCandidates && conn.pendingCandidates.length > 0) {
          for (const cand of conn.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          conn.pendingCandidates = [];
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWebRTCSignal(fromId, { type: 'answer', sdp: answer }, roomCode || currentRemoteRoomCode);
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (conn.pendingCandidates && conn.pendingCandidates.length > 0) {
          for (const cand of conn.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          conn.pendingCandidates = [];
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          conn.pendingCandidates.push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('[WebRTC] Signal handling error:', err);
    }
  }

  // When a peer joins our room
  function handleRemotePeerJoined(peer, roomCode) {
    if (!peer || peer.id === (myInfo.id || myClientId)) return;

    peer.isWebRTC = true;
    peer.isRemote = true;
    peer.roomCode = roomCode;
    peersMap.set(peer.id, peer);
    renderRadarPeers();

    playChime('incoming');
    triggerHaptic('medium');
    showToast(`🌐 ${peer.name} connected via Worldwide Room #${roomCode}!`);

    // Prepare connection as host (joiner will send the offer)
    createWebRTCPeerConnection(peer.id, peer, roomCode, false);
  }

  // Create RTCPeerConnection instance
  function createWebRTCPeerConnection(targetId, peer, roomCode, isInitiator) {
    if (webrtcConnections.has(targetId)) {
      const existing = webrtcConnections.get(targetId);
      if (existing.pc && existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
        return existing;
      }
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const conn = {
      pc,
      dc: null,
      peer,
      roomCode,
      pendingCandidates: [],
      isInitiator
    };
    webrtcConnections.set(targetId, conn);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const cand = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        sendWebRTCSignal(targetId, { type: 'candidate', candidate: cand }, roomCode);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${peer.name} state:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        peer.isWebRTC = true;
        peer.isRemote = true;
        peersMap.set(targetId, peer);
        renderRadarPeers();
        showToast(`🔒 Direct P2P link connected to ${peer.name}!`);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        if (peersMap.has(targetId) && peersMap.get(targetId).isWebRTC) {
          peersMap.delete(targetId);
          renderRadarPeers();
        }
        webrtcConnections.delete(targetId);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('omnidrop-transfer', { ordered: true });
      conn.dc = dc;
      setupWebRTCDataChannel(dc, targetId, peer);

      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer).then(() => {
          sendWebRTCSignal(targetId, {
            type: 'offer',
            sdp: offer,
            senderName: myInfo.name,
            senderOs: myInfo.os
          }, roomCode);
        });
      }).catch(err => console.error('[WebRTC] Offer creation failed:', err));
    } else {
      pc.ondatachannel = (e) => {
        conn.dc = e.channel;
        setupWebRTCDataChannel(e.channel, targetId, peer);
      };
    }

    return conn;
  }

  // Setup RTCDataChannel events and listeners
  function setupWebRTCDataChannel(dc, targetId, peer) {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log(`[WebRTC DataChannel OPEN] Connected with ${peer.name}`);
      peer.isWebRTC = true;
      peer.isRemote = true;
      peersMap.set(targetId, peer);
      if (peer.pin) peersMap.set('pin_' + peer.pin, peer);
      renderRadarPeers();
      playChime('incoming');

      // Auto-drain any pending file transfer queued for this peer
      let item = pendingSendFilesQueue.get(targetId);
      if (!item && peer.pin) item = pendingSendFilesQueue.get('pin_' + peer.pin) || pendingSendFilesQueue.get('od_' + peer.pin);
      if (item) {
        pendingSendFilesQueue.delete(targetId);
        if (peer.pin) {
          pendingSendFilesQueue.delete('pin_' + peer.pin);
          pendingSendFilesQueue.delete('od_' + peer.pin);
        }
        initiateWebRTCSendFiles(item.targetPeer, item.files, dc);
      }
    };

    dc.onclose = () => {
      console.log(`[WebRTC DataChannel CLOSED] with ${peer.name}`);
      if (peersMap.has(targetId) && peersMap.get(targetId).isWebRTC) {
        peersMap.delete(targetId);
        renderRadarPeers();
      }
    };

    dc.onerror = (err) => {
      console.error('[WebRTC DataChannel Error]', err);
    };

    dc.onmessage = (event) => {
      handleDataChannelMessage(event.data, targetId, peer, dc);
    };
  }

  // Handle incoming data channel message (JSON control frames OR binary data chunks)
  function handleDataChannelMessage(data, targetId, peer, dc) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        handleWebRTCControlMessage(msg, targetId, peer, dc);
      } catch (err) {
        console.error('[WebRTC] Failed to parse control message:', err);
      }
    } else if (data instanceof ArrayBuffer) {
      handleWebRTCBinaryChunk(data);
    }
  }

  // Handle WebRTC JSON control messages
  function handleWebRTCControlMessage(msg, targetId, peer, dc) {
    switch (msg.type) {
      case 'TRANSFER_REQUEST':
        // Receiver receives a file transfer prompt from remote peer
        handleIncomingTransferPrompt({
          transferId: msg.transferId,
          sender: msg.sender || peer,
          files: msg.files,
          totalSize: msg.totalSize,
          formattedSize: formatBytes(msg.totalSize),
          isWebRTC: true,
          dc: dc
        });
        break;

      case 'TRANSFER_RESPONSE':
        // Sender receives recipient's accept / decline response
        if (msg.accepted) {
          if (activeWebRTCOutgoing && activeWebRTCOutgoing.transferId === msg.transferId) {
            streamFilesOverWebRTCDataChannel(activeWebRTCOutgoing);
          }
        } else {
          document.getElementById('modal-progress').style.display = 'none';
          showToast(`❌ ${peer.name} declined the worldwide transfer.`);
          activeWebRTCOutgoing = null;
        }
        break;

      case 'FILE_START':
        // Receiver starts a new file inside the current transfer
        if (currentWebRTCReceiving) {
          currentWebRTCReceiving.currentFileIndex = msg.fileIndex;
          currentWebRTCReceiving.currentFileName = msg.fileName;
          currentWebRTCReceiving.currentFileSize = msg.fileSize;
          currentWebRTCReceiving.currentFileType = msg.fileType || 'application/octet-stream';
          currentWebRTCReceiving.receivedFileBytes = 0;
          currentWebRTCReceiving.fileBlobParts = [];

          document.getElementById('progress-title').textContent = 'Receiving Worldwide (P2P)...';
          document.getElementById('progress-target').textContent = `From ${peer.name}`;
          document.getElementById('progress-filename').textContent = `${msg.fileName} (${msg.fileIndex + 1}/${currentWebRTCReceiving.totalFiles})`;
        }
        break;

      case 'FILE_END':
        // Receiver finished receiving chunks for a single file
        if (currentWebRTCReceiving) {
          if (currentWebRTCReceiving.fileStream) {
            currentWebRTCReceiving.fileStream.close().catch(() => {});
            currentWebRTCReceiving.fileStream = null;
            const savedItem = {
              name: currentWebRTCReceiving.currentFileName,
              size: currentWebRTCReceiving.currentFileSize,
              directSaved: true
            };
            currentWebRTCReceiving.receivedBlobs.push(savedItem);
            showToast(`✅ Saved ${currentWebRTCReceiving.currentFileName} directly to chosen folder!`);
          } else {
            const blob = new Blob(currentWebRTCReceiving.fileBlobParts, { type: currentWebRTCReceiving.currentFileType });
            const blobUrl = URL.createObjectURL(blob);
            const savedItem = {
              name: currentWebRTCReceiving.currentFileName,
              downloadUrl: blobUrl,
              size: currentWebRTCReceiving.currentFileSize
            };
            currentWebRTCReceiving.receivedBlobs.push(savedItem);
            currentWebRTCReceiving.fileBlobParts = [];

            // Trigger automatic zero-click download immediately
            triggerAutoDownload(blobUrl, currentWebRTCReceiving.currentFileName);
          }
        }
        break;

      case 'TRANSFER_COMPLETE':
        // Entire transfer finished
        releaseTransferWakeLock();
        if (currentWebRTCReceiving) {
          const finished = currentWebRTCReceiving;
          currentWebRTCReceiving = null;
          handleIncomingFilesComplete({
            transferId: finished.transferId,
            senderId: targetId,
            totalFiles: finished.totalFiles,
            savedFiles: finished.receivedBlobs
          });
        }
        break;

      case 'CLIPBOARD':
        // Universal AirDrop Continuity over WebRTC
        handleIncomingClipboardMessage(msg, peer);
        break;
    }
  }

  // Handle WebRTC binary chunk on receiver side
  function handleWebRTCBinaryChunk(chunk) {
    if (!currentWebRTCReceiving) return;

    if (currentWebRTCReceiving.fileStream) {
      try {
        currentWebRTCReceiving.fileStream.write(chunk);
      } catch (e) {
        currentWebRTCReceiving.fileBlobParts.push(chunk);
      }
    } else {
      currentWebRTCReceiving.fileBlobParts.push(chunk);
    }

    currentWebRTCReceiving.receivedFileBytes += chunk.byteLength;
    currentWebRTCReceiving.totalReceivedBytes += chunk.byteLength;

    const now = Date.now();
    if (!currentWebRTCReceiving.lastSampleTime) {
      currentWebRTCReceiving.lastSampleTime = currentWebRTCReceiving.startTime || now;
      currentWebRTCReceiving.lastSampleBytes = 0;
    }

    const sampleDeltaMs = now - currentWebRTCReceiving.lastSampleTime;
    if (sampleDeltaMs >= 200 || currentWebRTCReceiving.receivedFileBytes >= currentWebRTCReceiving.currentFileSize) {
      const bytesDelta = currentWebRTCReceiving.totalReceivedBytes - currentWebRTCReceiving.lastSampleBytes;
      const instantSpeed = sampleDeltaMs > 0 ? (bytesDelta / sampleDeltaMs) * 1000 : 0;
      const percentage = Math.min(100, Math.round((currentWebRTCReceiving.totalReceivedBytes / currentWebRTCReceiving.totalSize) * 100));

      updateProgressDisplay({
        percentage,
        speedFormatted: formatTransferSpeed(instantSpeed),
        fileName: `${currentWebRTCReceiving.currentFileName} (${currentWebRTCReceiving.currentFileIndex + 1}/${currentWebRTCReceiving.totalFiles})`,
        fileBytes: currentWebRTCReceiving.receivedFileBytes,
        fileTotal: currentWebRTCReceiving.currentFileSize
      });

      currentWebRTCReceiving.lastSampleTime = now;
      currentWebRTCReceiving.lastSampleBytes = currentWebRTCReceiving.totalReceivedBytes;
    }
  }

  // Sender starts transfer to WebRTC peer
  function initiateWebRTCSendFiles(targetPeer, files, dc) {
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

    const transferId = 'tf_p2p_' + Math.random().toString(36).substring(2, 10);
    activeWebRTCOutgoing = {
      transferId,
      targetPeer,
      files,
      fileMetaList,
      totalSize,
      dc,
      streamingStarted: false,
      cancelRequested: false
    };

    const progressModal = document.getElementById('modal-progress');
    document.getElementById('progress-title').textContent = 'Waiting for Recipient...';
    document.getElementById('progress-target').textContent = `Waiting for ${targetPeer.name} to accept (Worldwide P2P)...`;
    document.getElementById('progress-percentage').textContent = '⏳';
    document.getElementById('progress-speed').textContent = 'Pending';
    document.getElementById('progress-filename').textContent = `${files.length} file(s) (${formatBytes(totalSize)})`;
    progressModal.style.display = 'flex';

    // Send handshake request over DataChannel
    if (dc && (dc.readyState === 'open' || dc.open)) {
      try {
        dc.send(JSON.stringify({
          type: 'TRANSFER_REQUEST',
          transferId,
          sender: { id: myInfo.id || myClientId, name: myInfo.name, os: myInfo.os },
          files: fileMetaList,
          totalSize
        }));
      } catch (e) {}
    }

    // ALSO send via Supabase Realtime for guaranteed zero-drop notification
    if (window.OmniDropSupabase) {
      window.OmniDropSupabase.sendToPeer(targetPeer.id, {
        type: 'TRANSFER_REQUEST',
        transferId,
        fromId: myInfo.id || myClientId,
        sender: { id: myInfo.id || myClientId, name: myInfo.name, os: myInfo.os },
        files: fileMetaList,
        totalSize
      });
    }
  }

  // Fallback high-speed WebSocket streaming over Supabase Realtime for restrictive networks
  async function streamFilesOverSupabase(outgoing) {
    const { transferId, targetPeer, files, fileMetaList, totalSize } = outgoing;
    const progressModal = document.getElementById('modal-progress');
    document.getElementById('progress-title').textContent = 'Streaming Files...';
    document.getElementById('progress-target').textContent = `Transferring to ${targetPeer.name}`;

    const chunkSize = 32 * 1024; // 32 KB per chunk
    let grandBytesSent = 0;
    const startTime = Date.now();
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    acquireTransferWakeLock();

    try {
      for (let i = 0; i < files.length; i++) {
        if (outgoing.cancelRequested) break;
        const file = files[i];
        const initialTotalChunks = Math.ceil(file.size / chunkSize);

        // 1. Send FILE_START
        window.OmniDropSupabase.sendToPeer(targetPeer.id, {
          type: 'FILE_START',
          transferId,
          fromId: myInfo.id || myClientId,
          fileIndex: i,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          totalChunks: initialTotalChunks
        });

        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size) {
          if (outgoing.cancelRequested) break;
          const slice = file.slice(offset, offset + chunkSize);
          const buffer = await slice.arrayBuffer();
          offset += buffer.byteLength;

          // Convert ArrayBuffer to base64
          let binary = '';
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          for (let b = 0; b < len; b++) {
            binary += String.fromCharCode(bytes[b]);
          }
          const base64Chunk = btoa(binary);

          window.OmniDropSupabase.sendToPeer(targetPeer.id, {
            type: 'TRANSFER_CHUNK',
            transferId,
            fromId: myInfo.id || myClientId,
            fileIndex: i,
            chunkIndex: chunkIndex++,
            chunk: base64Chunk
          });

          grandBytesSent += buffer.byteLength;

          const now = Date.now();
          const sampleDeltaMs = now - lastSampleTime;
          if (sampleDeltaMs >= 200 || offset >= file.size) {
            const bytesDelta = grandBytesSent - lastSampleBytes;
            const instantSpeed = sampleDeltaMs > 0 ? (bytesDelta / sampleDeltaMs) * 1000 : 0;
            const percentage = Math.min(100, Math.round((grandBytesSent / totalSize) * 100));

            updateProgressDisplay({
              percentage,
              speedFormatted: formatTransferSpeed(instantSpeed),
              fileName: `${file.name} (${i + 1}/${files.length})`,
              fileBytes: offset,
              fileTotal: file.size
            });

            lastSampleTime = now;
            lastSampleBytes = grandBytesSent;
          }

          if (chunkIndex % 5 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        // 2. Send FILE_END
        window.OmniDropSupabase.sendToPeer(targetPeer.id, {
          type: 'FILE_END',
          transferId,
          fromId: myInfo.id || myClientId,
          fileIndex: i
        });
      }

      // 3. Send TRANSFER_COMPLETE
      window.OmniDropSupabase.sendToPeer(targetPeer.id, {
        type: 'TRANSFER_COMPLETE',
        transferId,
        fromId: myInfo.id || myClientId
      });

      playChime('success');
      showToast(`🎉 Sent ${files.length} file(s) successfully!`);
      setTimeout(() => {
        progressModal.style.display = 'none';
        activeWebRTCOutgoing = null;
      }, 1200);

    } catch (err) {
      console.error('Supabase transfer error:', err);
      showToast(`⚠️ Transfer error: ${err.message}`);
      progressModal.style.display = 'none';
      activeWebRTCOutgoing = null;
    } finally {
      releaseTransferWakeLock();
    }
  }

  // Stream files over WebRTC DataChannel with adaptive fiber chunk slicing and dynamic backpressure
  async function streamFilesOverWebRTCDataChannel(outgoing) {
    const { transferId, dc, targetPeer, files, fileMetaList, totalSize } = outgoing;
    const progressModal = document.getElementById('modal-progress');
    document.getElementById('progress-title').textContent = 'Streaming Worldwide (P2P)...';
    document.getElementById('progress-target').textContent = `Direct WebRTC to ${targetPeer.name}`;

    // Universal WebRTC safe chunk size (64 KB is guaranteed across iOS Safari, Android, and Desktop)
    const currentChunkSize = 64 * 1024; // 64 KB universal WebRTC chunk size
    const currentBufferThreshold = 4 * 1024 * 1024; // 4 MB backpressure threshold
    try {
      if ('bufferedAmountLowThreshold' in dc) {
        dc.bufferedAmountLowThreshold = currentBufferThreshold;
      }
    } catch (e) {}

    let grandBytesSent = 0;
    const startTime = Date.now();
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    // Prevent device sleep and maintain active background streaming
    acquireTransferWakeLock();

    try {
      for (let i = 0; i < files.length; i++) {
        if (outgoing.cancelRequested) break;
        const file = files[i];
        const meta = fileMetaList[i];
        const initialTotalChunks = Math.ceil(file.size / currentChunkSize);

        // 1. Send FILE_START header
        dc.send(JSON.stringify({
          type: 'FILE_START',
          transferId,
          fileIndex: i,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          totalChunks: initialTotalChunks
        }));

        // 2. High-speed pipelined chunk streaming (pre-fetches next chunk while sending)
        let offset = 0;
        let chunkIndex = 0;
        let nextChunkPromise = file.slice(offset, offset + currentChunkSize).arrayBuffer();

        while (offset < file.size) {
          if (outgoing.cancelRequested) break;

          // Backpressure flow control: pause if internal buffer exceeds threshold
          if (dc.bufferedAmount > currentBufferThreshold) {
            await new Promise(resolve => {
              let resolved = false;
              const finish = () => {
                if (resolved) return;
                resolved = true;
                clearInterval(checkInterval);
                try { dc.onbufferedamountlow = null; } catch (e) {}
                resolve();
              };
              try { dc.onbufferedamountlow = finish; } catch (e) {}
              const checkInterval = setInterval(() => {
                if (dc.bufferedAmount <= currentBufferThreshold) {
                  finish();
                }
              }, 40);
            });
          }

          const buffer = await nextChunkPromise;
          offset += buffer.byteLength;

          // Asynchronously pre-fetch next chunk from disk while transmitting current buffer
          if (offset < file.size) {
            nextChunkPromise = file.slice(offset, offset + currentChunkSize).arrayBuffer();
          }

          dc.send(buffer);
          grandBytesSent += buffer.byteLength;
          chunkIndex++;

          // Real-time speed measurement
          const now = Date.now();
          const sampleDeltaMs = now - lastSampleTime;

          if (sampleDeltaMs >= 200 || offset >= file.size) {
            const bytesDelta = grandBytesSent - lastSampleBytes;
            const instantSpeed = sampleDeltaMs > 0 ? (bytesDelta / sampleDeltaMs) * 1000 : 0;
            const percentage = Math.min(100, Math.round((grandBytesSent / totalSize) * 100));

            updateProgressDisplay({
              percentage,
              speedFormatted: formatTransferSpeed(instantSpeed),
              fileName: `${file.name} (${i + 1}/${files.length})`,
              fileBytes: offset,
              fileTotal: file.size
            });

            lastSampleTime = now;
            lastSampleBytes = grandBytesSent;
          }
        }

        // 3. Send FILE_END header
        dc.send(JSON.stringify({
          type: 'FILE_END',
          transferId,
          fileIndex: i
        }));
      }

      // 4. Send TRANSFER_COMPLETE
      dc.send(JSON.stringify({
        type: 'TRANSFER_COMPLETE',
        transferId
      }));

      playChime('success');
      showToast(`🎉 Sent ${files.length} file(s) across WebRTC P2P!`);
      setTimeout(() => {
        progressModal.style.display = 'none';
        activeWebRTCOutgoing = null;
      }, 1200);

    } catch (err) {
      console.error('[WebRTC] File streaming error:', err);
      showToast(`⚠️ WebRTC transfer failed: ${err.message}`);
      progressModal.style.display = 'none';
      activeWebRTCOutgoing = null;
    } finally {
      releaseTransferWakeLock();
    }
  }

  // Create Worldwide WebRTC Room
  async function createRemoteRoom() {
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: myInfo.pin || undefined,
          peer: {
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin,
            localLanIp: myInfo.localLanIp || undefined
          }
        })
      });

      const data = await res.json();
      if (data.ok && data.roomCode) {
        currentRemoteRoomCode = data.roomCode;
        if (!myInfo.pin || myInfo.pin === '------') {
          myInfo.pin = data.roomCode;
          try { localStorage.setItem('omnidrop_pin', data.roomCode); } catch (e) {}
        }
        const shareUrl = `${window.location.origin}/?room=${data.roomCode}`;

        const createdBox = document.getElementById('remote-created-box');
        const codeDisplay = document.getElementById('remote-room-code-display');
        const urlText = document.getElementById('remote-url-text');
        const qrContainer = document.getElementById('qr-output-remote');

        if (codeDisplay) codeDisplay.textContent = data.roomCode;
        if (urlText) urlText.textContent = shareUrl;
        if (createdBox) createdBox.style.display = 'block';

        if (qrContainer && window.renderQRCodeSVG) {
          qrContainer.innerHTML = window.renderQRCodeSVG(shareUrl, { size: 180 });
        }

        const pinBadge = document.getElementById('self-pin-badge');
        if (pinBadge) pinBadge.textContent = `PIN: ${myInfo.pin}`;
        const modalPin = document.getElementById('modal-my-pin');
        if (modalPin) modalPin.textContent = myInfo.pin;
        const quickCodeEl = document.getElementById('quick-my-code');
        if (quickCodeEl) quickCodeEl.textContent = myInfo.pin;

        startRoomPolling();
        return data.roomCode;
      }
    } catch (err) {
      console.warn('createRemoteRoom error:', err);
    }
  }

  // Join Worldwide WebRTC Room
  async function joinRemoteRoom(roomCode) {
    const code = (roomCode || '').toString().trim().replace(/\D/g, '');
    if (!code || code.length !== 6) {
      showToast('Please enter a valid 6-digit room PIN');
      return false;
    }

    try {
      const res = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: code,
          peer: {
            id: myInfo.id || myClientId,
            name: myInfo.name,
            os: myInfo.os,
            deviceType: myInfo.deviceType,
            pin: myInfo.pin,
            localLanIp: myInfo.localLanIp || undefined
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        currentRemoteRoomCode = code;
        startRoomPolling();

        if (data.peers && Array.isArray(data.peers)) {
          for (const peer of data.peers) {
            if (peer.id !== (myInfo.id || myClientId)) {
              peer.isWebRTC = true;
              peer.isRemote = true;
              peer.roomCode = code;
              peersMap.set(peer.id, peer);
              renderRadarPeers();
              // As joiner, create offer to existing room peers
              createWebRTCPeerConnection(peer.id, peer, code, true);
            }
          }
        }

        const qrModal = document.getElementById('modal-qr');
        if (qrModal) qrModal.style.display = 'none';

        showToast(`✨ Joined Worldwide Room #${code}! Connecting P2P...`);
        return true;
      } else {
        return false;
      }
    } catch (err) {
      console.warn('joinRemoteRoom error:', err);
      return false;
    }
  }

  function handleIncomingClipboardMessage(msg, peer) {
    if (!msg || !msg.text) return;
    playChime('incoming');
    triggerHaptic('medium');

    const autoClip = document.getElementById('setting-auto-clipboard')?.checked ?? true;
    if (autoClip && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg.text).catch(() => {});
    }

    const senderObj = msg.sender || peer || { name: 'Nearby Device' };
    saveSnippet({
      text: msg.text,
      isUrl: msg.isUrl,
      sender: senderObj,
      direction: 'received',
      timestamp: msg.timestamp || Date.now()
    });

    const preview = msg.text.length > 55 ? msg.text.slice(0, 52) + '...' : msg.text;
    showRichToast({
      title: `🌐 AirDrop Continuity from ${senderObj.name || 'Nearby Device'}`,
      preview: preview,
      isUrl: msg.isUrl,
      url: msg.isUrl ? msg.text : null,
      onCopy: () => {
        navigator.clipboard?.writeText(msg.text).catch(() => {});
        triggerHaptic('light');
      }
    });
  }

  // Polling fallback for serverless / Vercel platforms without persistent SSE
  function startRoomPolling() {
    if (roomPollingTimer) return;
    roomPollingTimer = setInterval(async () => {
      try {
        const myId = myInfo.id || myClientId;
        if (!myId) return;
        const res = await fetch(`/api/room/signals?clientId=${encodeURIComponent(myId)}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.signals) && data.signals.length > 0) {
          for (const item of data.signals) {
            const sig = item.signal || item;
            if (sig && sig.type === 'CLIPBOARD') {
              const senderPeer = (sig.sender && sig.sender.id && peersMap.get(sig.sender.id)) || peersMap.get(item.fromId) || { name: (sig.sender && sig.sender.name) || 'Nearby Device' };
              handleIncomingClipboardMessage(sig, senderPeer);
            } else if (sig && sig.type === 'transfer_request') {
              const isCloud = isCloudServerlessEnv();
              const conn = webrtcConnections.get(sig.sender?.id || item.fromId);
              handleIncomingTransferPrompt({
                transferId: sig.transferId,
                sender: sig.sender || { name: 'Nearby Device' },
                files: sig.files,
                totalSize: sig.totalSize,
                formattedSize: formatBytes(sig.totalSize || 0),
                isWebRTC: isCloud,
                dc: conn?.dc
              });
            } else {
              handleWebRTCSignal(item);
            }
          }
        }
      } catch (e) {}
    }, 1500);
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

  // QR Modal Tabs (Same Wi-Fi vs Hotspot vs Remote P2P)
  const tabWifi = document.getElementById('tab-qr-wifi');
  const tabHotspot = document.getElementById('tab-qr-hotspot');
  const tabRemote = document.getElementById('tab-qr-remote');
  const bodyWifi = document.getElementById('qr-body-wifi');
  const bodyHotspot = document.getElementById('qr-body-hotspot');
  const bodyRemote = document.getElementById('qr-body-remote');

  function switchQRTab(activeTab) {
    [tabWifi, tabHotspot, tabRemote].forEach(t => t?.classList.remove('active'));
    [bodyWifi, bodyHotspot, bodyRemote].forEach(b => { if (b) b.style.display = 'none'; });

    if (activeTab === 'wifi') {
      tabWifi?.classList.add('active');
      if (bodyWifi) bodyWifi.style.display = 'block';
    } else if (activeTab === 'hotspot') {
      tabHotspot?.classList.add('active');
      if (bodyHotspot) bodyHotspot.style.display = 'block';
    } else if (activeTab === 'remote') {
      tabRemote?.classList.add('active');
      if (bodyRemote) bodyRemote.style.display = 'block';
      if (!currentRemoteRoomCode) {
        createRemoteRoom();
      }
    }
  }

  if (tabWifi) tabWifi.addEventListener('click', () => switchQRTab('wifi'));
  if (tabHotspot) tabHotspot.addEventListener('click', () => switchQRTab('hotspot'));
  if (tabRemote) tabRemote.addEventListener('click', () => switchQRTab('remote'));

  // Remote WebRTC Tab Controls (Share Room Link & 6-Digit PIN)
  document.getElementById('btn-create-remote-room')?.addEventListener('click', () => {
    createRemoteRoom();
  });

  document.getElementById('btn-copy-remote-url')?.addEventListener('click', () => {
    const urlText = document.getElementById('remote-url-text')?.textContent || '';
    if (urlText && navigator.clipboard) {
      navigator.clipboard.writeText(urlText).then(() => {
        triggerHaptic('light');
        showToast('📋 Remote share link copied to clipboard!');
      }).catch(() => {});
    }
  });

  document.getElementById('btn-share-remote-native')?.addEventListener('click', () => {
    const url = document.getElementById('remote-url-text')?.textContent || window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'Join my OmniDrop Room',
        text: `Connect to my OmniDrop session to send/receive files worldwide:`,
        url: url
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied! Share it via any messaging app.');
      });
    }
  });

  document.getElementById('btn-join-remote-code')?.addEventListener('click', async () => {
    const input = document.getElementById('remote-join-code-input');
    const code = input ? input.value.trim() : '';
    if (code.length !== 6) {
      showToast('Please type a 6-digit room code');
      return;
    }
    const joined = await joinRemoteRoom(code);
    if (joined && input) input.value = '';
  });

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
        if (peer) {
          if (pendingShareFiles && pendingShareFiles.length > 0) {
            const files = pendingShareFiles;
            pendingShareFiles = null;
            initiateSendFiles(peer, files);
          } else {
            triggerFilePickerForPeer(peer);
          }
        }
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
    if (cleanPin.length !== 6) {
      showToast('Please enter a valid 6-digit PIN');
      return false;
    }

    if (cleanPin === myInfo.pin) {
      showToast("⚠️ That's your own PIN!");
      return false;
    }

    showToast(`🔍 Connecting to PIN #${cleanPin}...`);

    const isCloud = isCloudServerlessEnv();

    // 1. Local Network: Pair instantly via local Node.js server (2ms, direct RAM pairing)
    if (!isCloud) {
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
              pin: myInfo.pin,
              localLanIp: myInfo.localLanIp || undefined
            }
          })
        });

        const data = await res.json();
        const targetPeer = data.peer || data.target;
        if (data.ok && targetPeer) {
          peersMap.set(targetPeer.id, targetPeer);
          renderRadarPeers();
          playChime('incoming');
          showToast(`✨ Connected to ${targetPeer.name}! Tap avatar to send.`);
          const modalPinPair = document.getElementById('modal-pin-pair');
          if (modalPinPair) modalPinPair.style.display = 'none';
          const qrModal = document.getElementById('modal-qr');
          if (qrModal) qrModal.style.display = 'none';
          return true;
        } else if (data.error) {
          showToast(`⚠️ ${data.error}`);
          return false;
        }
      } catch (err) {
        console.warn('Local PIN pair error:', err);
      }
    }

    // 2. Cloud Serverless Mode (Vercel): Instant PIN pairing via Supabase Realtime
    if (window.OmniDropSupabase) {
      window.OmniDropSupabase.joinRoom(cleanPin);

      const pairPromise = new Promise(resolve => {
        const timeout = setTimeout(() => {
          pendingPairResolvers.delete(cleanPin);
          resolve(null);
        }, 4500);

        pendingPairResolvers.set(cleanPin, (peer) => {
          clearTimeout(timeout);
          pendingPairResolvers.delete(cleanPin);
          resolve(peer);
        });
      });

      window.OmniDropSupabase.sendToRoom(cleanPin, {
        type: 'PAIR_REQUEST',
        sender: {
          id: myInfo.id || myClientId,
          name: myInfo.name,
          os: myInfo.os,
          deviceType: myInfo.deviceType,
          pin: myInfo.pin,
          ip: myInfo.ip
        }
      });

      const matchedPeer = await pairPromise;
      if (matchedPeer) {
        matchedPeer.isWebRTC = true;
        matchedPeer.isRemote = true;
        matchedPeer.pin = cleanPin;
        peersMap.set(matchedPeer.id, matchedPeer);
        peersMap.set('pin_' + cleanPin, matchedPeer);
        renderRadarPeers();

        const modalPinPair = document.getElementById('modal-pin-pair');
        if (modalPinPair) modalPinPair.style.display = 'none';
        const qrModal = document.getElementById('modal-qr');
        if (qrModal) qrModal.style.display = 'none';

        createWebRTCPeerConnection(matchedPeer.id, matchedPeer, cleanPin, true);
        return true;
      }
    }

    // Secondary: Try PeerJS broker if available
    if (typeof Peer !== 'undefined') {
      if (!myPeer || myPeer.destroyed) {
        initPeerJS(myInfo.pin);
      }

      if (myPeer) {
        const targetPeerId = 'od_' + cleanPin;
        let conn = peerJSConnections.get(targetPeerId);

        if (!conn || !conn.open) {
          try {
            conn = myPeer.connect(targetPeerId, { reliable: true, serialization: 'none' });
            setupPeerJSDataConnection(conn);
          } catch (e) {}
        }

        if (conn) {
          const success = await new Promise((resolve) => {
            if (conn.open) return resolve(true);
            const t = setTimeout(() => resolve(false), 2000);
            const handleOpen = () => {
              clearTimeout(t);
              resolve(true);
            };
            const handleError = () => {
              clearTimeout(t);
              resolve(false);
            };
            conn.on('open', handleOpen);
            conn.on('error', handleError);
          });

          if (success) {
            playChime('incoming');
            triggerHaptic('medium');
            showToast(`✨ Connected to PIN #${cleanPin}! Tap avatar on radar to send.`);
            const modalPinPair = document.getElementById('modal-pin-pair');
            if (modalPinPair) modalPinPair.style.display = 'none';
            const qrModal = document.getElementById('modal-qr');
            if (qrModal) qrModal.style.display = 'none';
            return true;
          }
        }
      }
    }

    // 3. Built-in WebRTC room signaling fallback
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
            pin: myInfo.pin,
            peerId: myPeer ? myPeer.id : ('od_' + myInfo.pin),
            localLanIp: myInfo.localLanIp || undefined
          }
        })
      });

      const data = await res.json();
      const targetPeer = data.peer || data.target;
      if (data.ok && targetPeer) {
        peersMap.set(targetPeer.id, targetPeer);
        renderRadarPeers();
      }
    } catch (err) {
      console.warn('Pair-by-pin error:', err);
    }

    const joined = await joinRemoteRoom(cleanPin);
    if (joined) {
      const modalPinPair = document.getElementById('modal-pin-pair');
      if (modalPinPair) modalPinPair.style.display = 'none';
      const qrModal = document.getElementById('modal-qr');
      if (qrModal) qrModal.style.display = 'none';
      return true;
    }

    showToast(`❌ Device with PIN #${cleanPin} not found or offline.`);
    return false;
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

  // ==========================================================================
  // AIRDROP CONTINUITY & TEXT MODE SUITE
  // ==========================================================================
  const SNIPPETS_STORAGE_KEY = 'omnidrop_snippets';

  function getStoredSnippets() {
    try {
      const data = localStorage.getItem(SNIPPETS_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSnippet({ text, isUrl, sender, direction = 'received', timestamp = Date.now() }) {
    if (!text || !text.trim()) return null;
    const snippets = getStoredSnippets();
    const newSnippet = {
      id: 'snip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      isUrl: isUrl ?? /^https?:\/\/[^\s]+$/i.test(text.trim()),
      sender: sender || { name: 'Device' },
      direction, // 'sent', 'received', or 'broadcast'
      timestamp
    };
    snippets.unshift(newSnippet);
    if (snippets.length > 50) snippets.pop();
    try {
      localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
    } catch (e) {}

    updateSnippetsBadge();
    renderSnippetsShelf();
    return newSnippet;
  }

  function deleteSnippet(id) {
    let snippets = getStoredSnippets();
    snippets = snippets.filter(s => s.id !== id);
    try {
      localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
    } catch (e) {}
    updateSnippetsBadge();
    renderSnippetsShelf();
  }

  function clearAllSnippets() {
    try {
      localStorage.removeItem(SNIPPETS_STORAGE_KEY);
    } catch (e) {}
    updateSnippetsBadge();
    renderSnippetsShelf();
    showToast('Snippet history cleared.');
  }

  function updateSnippetsBadge() {
    const badge = document.getElementById('snippets-tab-badge');
    if (!badge) return;
    const count = getStoredSnippets().length;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderSnippetsShelf() {
    const shelf = document.getElementById('snippets-shelf');
    const emptyState = document.getElementById('snippets-empty-state');
    const footer = document.getElementById('snippets-footer');
    if (!shelf) return;

    const snippets = getStoredSnippets();
    if (snippets.length === 0) {
      shelf.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (footer) footer.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (footer) footer.style.display = 'flex';

    shelf.innerHTML = snippets.map(s => {
      let badgeClass = 'received';
      let badgeLabel = `⬇ From ${escapeHtml(s.sender?.name || 'Device')}`;
      if (s.direction === 'sent') {
        badgeClass = 'sent';
        badgeLabel = `⬆ Sent to ${escapeHtml(s.sender?.name || 'Device')}`;
      } else if (s.direction === 'broadcast') {
        badgeClass = 'broadcast';
        badgeLabel = `⚡ Universal Broadcast`;
      }

      return `
        <div class="snippet-card" data-id="${s.id}">
          <div class="snippet-header">
            <span class="snippet-badge ${badgeClass}">${badgeLabel}</span>
            <span class="snippet-time">${formatTimeAgo(s.timestamp)}</span>
          </div>
          <div class="snippet-content">${escapeHtml(s.text)}</div>
          <div class="snippet-actions">
            ${s.isUrl ? `<a href="${escapeHtml(s.text)}" target="_blank" rel="noopener noreferrer" class="snippet-btn snippet-btn-link">🔗 Open Link</a>` : ''}
            <button type="button" class="snippet-btn btn-snippet-copy" data-text="${escapeHtml(s.text)}">📋 Copy</button>
            <button type="button" class="snippet-btn btn-snippet-resend" data-text="${escapeHtml(s.text)}">⚡ Re-Send</button>
            <button type="button" class="snippet-btn snippet-btn-danger btn-snippet-del" data-id="${s.id}" title="Delete">✕</button>
          </div>
        </div>
      `;
    }).join('');

    shelf.querySelectorAll('.btn-snippet-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (text) {
          navigator.clipboard?.writeText(text).catch(() => {});
          btn.textContent = 'Copied! ✓';
          triggerHaptic('light');
          setTimeout(() => { if (btn) btn.textContent = '📋 Copy'; }, 1500);
        }
      });
    });

    shelf.querySelectorAll('.btn-snippet-resend').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        if (text) {
          openTextModal(text);
        }
      });
    });

    shelf.querySelectorAll('.btn-snippet-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) deleteSnippet(id);
      });
    });
  }

  function openTextModal(initialText = '') {
    const modal = document.getElementById('modal-text');
    if (!modal) return;

    switchTextTab('compose');

    const input = document.getElementById('text-share-input');
    if (initialText) {
      input.value = initialText;
    }
    updateTextCounterAndUrl();
    populateTextRecipients();

    modal.style.display = 'flex';
    input.focus();
  }

  function switchTextTab(tab) {
    const tabCompose = document.getElementById('tab-text-compose');
    const tabSnippets = document.getElementById('tab-text-snippets');
    const viewCompose = document.getElementById('view-text-compose');
    const viewSnippets = document.getElementById('view-text-snippets');

    if (tab === 'compose') {
      tabCompose?.classList.add('active');
      tabSnippets?.classList.remove('active');
      if (viewCompose) viewCompose.style.display = 'block';
      if (viewSnippets) viewSnippets.style.display = 'none';
    } else {
      tabSnippets?.classList.add('active');
      tabCompose?.classList.remove('active');
      if (viewCompose) viewCompose.style.display = 'none';
      if (viewSnippets) viewSnippets.style.display = 'block';
      renderSnippetsShelf();
    }
  }

  function updateTextCounterAndUrl() {
    const input = document.getElementById('text-share-input');
    const counterDisplay = document.getElementById('text-counter-display');
    const urlBadge = document.getElementById('text-url-indicator');
    if (!input) return;

    const val = input.value;
    const trimmed = val.trim();
    const chars = val.length;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;

    if (counterDisplay) {
      counterDisplay.textContent = `${words} word${words !== 1 ? 's' : ''} · ${chars} char${chars !== 1 ? 's' : ''}`;
    }

    const isUrl = /^https?:\/\/[^\s]+$/i.test(trimmed);
    if (urlBadge) {
      urlBadge.style.display = isUrl ? 'inline-flex' : 'none';
    }
  }

  function populateTextRecipients() {
    const select = document.getElementById('text-target-select');
    if (!select) return;
    const peerList = getActiveUniquePeers();

    let options = `<option value="all">⚡ Broadcast to All Nearby Devices</option>`;
    if (peerList.length > 0) {
      options += peerList.map(p => `
        <option value="${p.id}">${p.name} (${p.ip || (p.pin ? 'PIN ' + p.pin : 'Nearby')})</option>
      `).join('');
    }
    select.innerHTML = options;
  }

  async function beamClipboard(text, targetId = 'all') {
    if (!text || !text.trim()) {
      showToast('Clipboard is empty! Copy text or a link first.');
      return;
    }
    const trimmed = text.trim();
    const isUrl = /^https?:\/\/[^\s]+$/i.test(trimmed);

    try {
      const resp = await fetch('/api/clipboard/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          targetId: targetId,
          broadcast: targetId === 'all',
          sender: { id: myInfo.id || myClientId, name: myInfo.name }
        })
      });

      const resData = await resp.json();
      if (!resp.ok) throw new Error(resData.error || 'Server error');

      // Also broadcast over open WebRTC DataChannels for worldwide room peers
      for (const [peerId, conn] of webrtcConnections.entries()) {
        if (targetId === 'all' || targetId === peerId) {
          if (conn.dc && conn.dc.readyState === 'open') {
            try {
              conn.dc.send(JSON.stringify({
                type: 'CLIPBOARD',
                text: trimmed,
                isUrl,
                sender: { id: myInfo.id || myClientId, name: myInfo.name },
                timestamp: Date.now()
              }));
            } catch (e) {}
          }
        }
      }

      playChime('success');
      triggerHaptic('light');

      let targetName = 'All Nearby Devices';
      if (targetId !== 'all') {
        const peer = peersMap.get(targetId);
        targetName = peer ? peer.name : 'Device';
      }

      saveSnippet({
        text: trimmed,
        isUrl,
        sender: { name: targetName },
        direction: targetId === 'all' ? 'broadcast' : 'sent',
        timestamp: Date.now()
      });

      const preview = trimmed.slice(0, 35) + (trimmed.length > 35 ? '...' : '');
      showToast(`⚡ Beamed to ${targetName}: "${preview}"`);
    } catch (err) {
      showToast(`Failed to beam clipboard: ${err.message}`);
    }
  }

  // --- Wire Text & AirDrop Continuity Event Listeners ---
  document.getElementById('btn-quick-text')?.addEventListener('click', () => {
    openTextModal();
  });

  document.getElementById('btn-beam-clipboard')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          beamClipboard(text, 'all');
          return;
        }
      }
      openTextModal();
      showToast('Paste text or link into the composer to beam!');
    } catch (e) {
      openTextModal();
    }
  });

  document.getElementById('btn-close-text')?.addEventListener('click', () => {
    document.getElementById('modal-text').style.display = 'none';
  });

  document.getElementById('tab-text-compose')?.addEventListener('click', () => {
    switchTextTab('compose');
  });

  document.getElementById('tab-text-snippets')?.addEventListener('click', () => {
    switchTextTab('snippets');
  });

  const textInput = document.getElementById('text-share-input');
  if (textInput) {
    textInput.addEventListener('input', updateTextCounterAndUrl);
    textInput.addEventListener('paste', () => setTimeout(updateTextCounterAndUrl, 50));
  }

  document.getElementById('btn-paste-clipboard')?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          textInput.value = text;
          updateTextCounterAndUrl();
          triggerHaptic('light');
          showToast('📋 Pasted from clipboard!');
          return;
        }
      }
      showToast('Clipboard is empty.');
    } catch (err) {
      showToast('Clipboard read access was blocked. Paste directly with Ctrl+V / Cmd+V.');
    }
  });

  document.getElementById('btn-beam-now')?.addEventListener('click', async () => {
    let text = textInput ? textInput.value.trim() : '';
    if (!text && navigator.clipboard && navigator.clipboard.readText) {
      try { text = (await navigator.clipboard.readText()) || ''; } catch (e) {}
    }
    if (!text) {
      showToast('No text or clipboard content to beam!');
      return;
    }
    const targetId = document.getElementById('text-target-select')?.value || 'all';
    await beamClipboard(text, targetId);
    document.getElementById('modal-text').style.display = 'none';
  });

  document.getElementById('btn-clear-text')?.addEventListener('click', () => {
    if (textInput) {
      textInput.value = '';
      updateTextCounterAndUrl();
      textInput.focus();
    }
  });

  document.getElementById('btn-clear-all-snippets')?.addEventListener('click', () => {
    clearAllSnippets();
  });

  document.getElementById('btn-send-text-action')?.addEventListener('click', async () => {
    const text = textInput ? textInput.value.trim() : '';
    const targetId = document.getElementById('text-target-select')?.value || 'all';

    if (!text) {
      showToast('Please enter text or link to beam!');
      return;
    }

    if (targetId === 'all') {
      await beamClipboard(text, 'all');
      document.getElementById('modal-text').style.display = 'none';
      return;
    }

    const targetPeer = peersMap.get(targetId);
    if (!targetPeer) {
      await beamClipboard(text, targetId);
      document.getElementById('modal-text').style.display = 'none';
      return;
    }

    // Direct WebRTC P2P DataChannel transmission if remote peer
    if (targetPeer.isWebRTC || webrtcConnections.has(targetPeer.id)) {
      const conn = webrtcConnections.get(targetPeer.id);
      if (conn && conn.dc && conn.dc.readyState === 'open') {
        const isUrl = /^https?:\/\/[^\s]+$/i.test(text);
        conn.dc.send(JSON.stringify({
          type: 'CLIPBOARD',
          text,
          isUrl,
          sender: { id: myInfo.id || myClientId, name: myInfo.name },
          timestamp: Date.now()
        }));
        document.getElementById('modal-text').style.display = 'none';
        playChime('success');
        triggerHaptic('light');
        saveSnippet({
          text,
          isUrl,
          sender: { name: targetPeer.name },
          direction: 'sent',
          timestamp: Date.now()
        });
        showToast(`⚡ Beamed worldwide to ${targetPeer.name}!`);
        return;
      }
    }

    try {
      const isUrl = /^https?:\/\/[^\s]+$/i.test(text);
      await fetch('/api/send/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIp: targetPeer.ip,
          targetPort: targetPeer.port,
          targetId: targetPeer.id,
          text: text
        })
      });

      document.getElementById('modal-text').style.display = 'none';
      playChime('success');
      triggerHaptic('light');
      saveSnippet({
        text,
        isUrl,
        sender: { name: targetPeer.name },
        direction: 'sent',
        timestamp: Date.now()
      });
      showToast(`⚡ Beamed to ${targetPeer.name}!`);
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

    // Populate Supabase Settings
    const inputSupabaseKey = document.getElementById('setting-supabase-anon-key');
    if (inputSupabaseKey && window.OmniDropSupabase) {
      inputSupabaseKey.value = window.OmniDropSupabase.getConfig().anonKey || '';
    }

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

  // Save Supabase Anon Key
  const inputSupabaseKey = document.getElementById('setting-supabase-anon-key');
  const btnSaveSupabaseKey = document.getElementById('btn-save-supabase-key');
  if (btnSaveSupabaseKey && inputSupabaseKey) {
    btnSaveSupabaseKey.addEventListener('click', () => {
      const key = inputSupabaseKey.value.trim();
      if (window.OmniDropSupabase) {
        window.OmniDropSupabase.saveConfig('sjnamkshicpxtyikzsnp', key);
        showToast('✅ Supabase Realtime connected!');
      }
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
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Check for updates periodically
      reg.update().catch(() => {});
    }).catch(() => {});

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data && event.data.type === 'SHARED_CONTENT') {
        checkPendingShareTarget();
      }
    });
  }

  // Boot
  initSelf();
  updateSnippetsBadge();
  checkPendingShareTarget();
  detectNetworkCapabilities();

  // Auto-join Worldwide WebRTC Room if ?room=XXXXXX is present in URL
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && roomParam.trim().length === 6) {
      setTimeout(() => {
        joinRemoteRoom(roomParam.trim());
      }, 900);
    }
  } catch (e) {}
})();

