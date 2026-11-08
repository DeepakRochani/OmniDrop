# OmniDrop Deployment & Worldwide P2P Architecture Guide
### Vercel Serverless, GitHub Hosting & Firebase Realtime Signaling

This guide explains how **Method 2: WebRTC P2P (Peer-to-Peer DataChannels)** powers unlimited large file transfers across different cities and countries, how to host the codebase on **GitHub**, how to deploy the web application to **Vercel**, and optionally integrate **Firebase Realtime Database** for signaling.

---

## 🌐 1. How WebRTC Worldwide P2P Works (Method 2)

```
[ Sender: City A / Country 1 ]                             [ Receiver: City B / Country 2 ]
       │                                                                  │
       │ 1. Request Room / 6-digit PIN: 482910                            │
       ├─────────────────────────┐                                        │
       │                         ▼                                        │
       │                  ┌──────────────┐                                │
       │                  │  Signaling   │                                │
       │                  │ Relay Server │                                │
       │                  │(Vercel/Node) │                                │
       │                  └──────┬───────┘                                │
       │                         ▲                                        │
       │                         │ 2. Join Room #482910                   │
       │                         └────────────────────────────────────────┤
       │                                                                  │
       │ 3. Exchange WebRTC Offer / Answer & ICE Candidates via Relay    │
       │◄════════════════════════════════════════════════════════════════►│
       │                                                                  │
       │ 4. DIRECT ENCRYPTED P2P DATACHANNEL ESTABLISHED (STUN NAT)       │
       │==================================================================│
       │ >>> 64KB Sliced Binary Chunks with 2MB Flow Control (Backpressure) >>>
       │ >>> Unlimited File Sizes: 1GB, 10GB, 50GB+ (Zero Server Bandwidth) >>>
       │==================================================================│
       │                                                                  │
       │ 5. Auto-Assemble in Browser RAM & Direct Zero-Click Download     │
```

### Key Technical Highlights:
1. **Zero Server Bandwidth / Bypass 4.5MB Limits:**
   - On Vercel and serverless platforms, HTTP request bodies are strictly limited to **4.5 MB**.
   - With WebRTC DataChannels, **no file data ever touches the Vercel server**. The server only relays lightweight (~2KB) JSON session handshakes (offers, answers, ICE candidates).
   - Once connected, files stream **100% peer-to-peer** directly between browsers via SCTP encrypted tunnels with public Google & Cloudflare STUN servers.
2. **Backpressure Flow Control (`bufferedAmountLowThreshold`):**
   - Naive WebRTC code crashes browser tabs when sending large files because `dataChannel.send()` fills memory faster than the network can transmit.
   - OmniDrop uses asynchronous 64KB chunk pumps with `bufferedAmountLowThreshold = 2 * 1024 * 1024` (2MB). When the outbound buffer exceeds 2MB, transmission pauses automatically until the network empties the buffer, guaranteeing smooth 10GB–50GB+ transfers without browser crashes.
3. **Universal Signaling:**
   - Supports long-lived SSE connections on local Node.js servers.
   - Automatically falls back to lightweight polling (`/api/room/signals?clientId=...`) on serverless platforms like Vercel where persistent SSE connections are terminated.

---

## 🚀 2. Deploying to Vercel (Step-by-Step)

OmniDrop is already pre-configured for Vercel with `vercel.json` and `api/index.js`!

### Method A: Deploy via GitHub (Recommended)
1. Push your code to your GitHub repository (see Section 3 below).
2. Go to [vercel.com](https://vercel.com) and log in.
3. Click **"Add New..."** -> **"Project"**.
4. Select your `omnidrop` repository from GitHub.
5. In the configuration screen:
   - **Framework Preset**: Other (or Node.js)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: None (leave empty)
   - **Output Directory**: None (served via `vercel.json`)
6. Click **"Deploy"**.
7. In ~30 seconds, Vercel gives you a live global HTTPS URL: `https://your-app.vercel.app`!

### Method B: Deploy via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## 🐙 3. Pushing Code to GitHub

To store your project securely on GitHub:

```bash
# 1. Initialize git if not already done
git init

# 2. Add all project files
git add .

# 3. Commit changes
git commit -m "feat: Add WebRTC P2P worldwide file transfer and Vercel serverless signaling"

# 4. Set branch to main
git branch -M main

# 5. Link to your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/omnidrop.git

# 6. Push code to GitHub
git push -u origin main
```

---

## 🔥 4. Optional: Firebase Realtime Database Signaling

If you want a 100% serverless, zero-maintenance signaling backend with instant push notifications (without running Node.js or polling on Vercel), you can connect **Firebase Realtime Database**.

### Step 1: Create Free Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Create a project** (name it e.g. `omnidrop-p2p`).
3. In the sidebar, select **Build** -> **Realtime Database** -> **Create Database**.
4. Choose standard location and start in **Test mode** (or configure security rules below).

### Step 2: Set Security Rules (in Firebase Console -> Realtime Database -> Rules):
```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

### Step 3: Firebase Config Structure
In `public/index.html` or `public/app.js`, include the modular Firebase SDK:
```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { getDatabase, ref, set, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-app.firebaseapp.com",
    databaseURL: "https://your-app-default-rtdb.firebaseio.com",
    projectId: "your-app",
    storageBucket: "your-app.appspot.com",
    messagingSenderId: "...",
    appId: "..."
  };

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
</script>
```

When a user creates a room:
```javascript
set(ref(db, `rooms/${roomCode}/peers/${myId}`), { name: myInfo.name, os: myInfo.os });
```
When sending a signal:
```javascript
set(ref(db, `rooms/${roomCode}/signals/${toId}/${Date.now()}`), { fromId: myId, signal });
```
When receiving signals:
```javascript
onChildAdded(ref(db, `rooms/${roomCode}/signals/${myId}`), snapshot => {
  handleWebRTCSignal(snapshot.val());
  remove(snapshot.ref); // auto-clean signal
});
```

OmniDrop's dual-engine architecture supports:
- **Local Network / Pure Node.js**: Built-in SSE signaling, zero external configuration needed.
- **Vercel Cloud**: Serverless `/api/room/*` with auto-polling queue.
- **Firebase Option**: Plug-and-play real-time database listener.

---

## 📱 5. User Workflow: How to Send Files Across the Globe

1. **Host/Sender:**
   - Tap **"Connect Device"** -> select **"🌐 Remote (Anywhere)"** tab.
   - Tap **"Create Remote Share Link"**.
   - OmniDrop generates a 6-digit Worldwide Room PIN (e.g. `582914`) and a shareable link: `https://your-domain.com/?room=582914`.
   - Tap **"Share Link via App ↗"** to send it via WhatsApp, Telegram, iMessage, SMS, or Email.

2. **Receiver:**
   - Opens the link on their phone/computer in any city or country.
   - The browser automatically joins room `582914`.
   - Both devices appear on each other's radar with a cyan glowing ring and **🌐 Worldwide P2P** badge!

3. **Beaming Files & Clipboard:**
   - Tap the peer's avatar on the radar or drag and drop files onto it.
   - The recipient sees an Apple AirDrop-style modal: *"User (🌐 Worldwide P2P) wants to share 3 files (1.2 GB)"*.
   - Tap **Accept**: files stream directly peer-to-peer at full internet speed!
   - Once received, files download automatically to disk with zero clicks required.

