# OmniDrop 📡
### Universal Cross-Platform AirDrop for Android, iOS, Windows, Mac, and Tablets

OmniDrop is an open, high-speed, local peer-to-peer data transfer application engineered to replicate the **Apple AirDrop** experience seamlessly across **Android, iPhone, iPad, Windows, and Mac**.

---

## ✨ Features

- 🎯 **AirDrop-Style Radar UI**: Visual sonar waves with real-time discovery of nearby phones, tablets, and computers.
- ⚡ **Full Wi-Fi Speeds (50 - 150 MB/s)**: Direct local network binary streaming with zero cloud intermediaries and zero file size limits.
- 📱 **Zero-Install Web Portal**: Friends with an iPhone or Android don't need to install an app! Simply scan the screen QR code with their camera app to send and receive files instantly in Safari or Chrome.
- 🔒 **Security Handshake**: Exact AirDrop-style prompt ("iPhone 15 wants to send 3 files. Accept or Decline?") before any file data is received.
- 📋 **Instant Clipboard / Text Share**: Send links, messages, addresses, or codes directly between devices with one click.
- 📦 **Zero External Runtime Dependencies**: Pure Node.js standard libraries (`http`, `dgram`, `crypto`, `stream`, `fs`), ensuring fast startup, cross-platform portability, and maximum security.
- 🔔 **AirDrop Chimes & Haptics**: Native-feeling audio chimes and haptic vibrations synthesized via Web Audio API.

---

## 🚀 Quick Start

### 1. Start the OmniDrop Server
In this project folder:
```bash
npm start
```

You will see:
```text
🚀 OmniDrop (AirDrop Cross-Platform) is RUNNING!
📡 Local Web UI & PWA:  http://localhost:53317
📱 Connect Any Phone:   http://192.168.1.33:53317
📁 Download Folder:     ~/Downloads/OmniDrop
```

### 2. Connect Your Devices

#### A. Mobile to PC (iPhone / Android ➔ Mac / Windows)
1. Open `http://localhost:53317` on your computer.
2. Click **"Connect Phone"** in the top header.
3. Open the **Camera App** on your iPhone or Android and scan the QR code.
4. Tap the link to open OmniDrop in your mobile browser.
5. Tap **"Select Files or Photos"** or tap your computer's avatar on the radar.
6. The files will stream directly to your computer's `Downloads/OmniDrop` folder at full Wi-Fi speed!

#### B. PC to Mobile (Mac / Windows ➔ iPhone / Android / iPad)
1. Once your phone or tablet is connected (via step A or running OmniDrop), its icon (iPhone, Android, or Tablet) will appear on your computer's radar.
2. Drag and drop any file directly onto the phone's avatar on the radar screen.
3. Your phone will chime and ask to **Accept** the incoming transfer.
4. Tap **Accept** to download the file directly to your phone.

#### C. Mobile to Mobile (Android ➔ iPhone, or Android ➔ Android)
1. Ensure both phones are connected to the same Wi-Fi router (or one phone enables a personal hotspot and the other connects to it).
2. Open OmniDrop on both devices.
3. Both devices will appear on each other's radar circle.
4. Tap the avatar to transfer files or share text notes.

---

## 📂 Project Architecture

```
.
├── server.js               # Core Node.js server (UDP Multicast discovery, HTTP streaming, SSE signaling)
├── package.json            # Node project configuration
├── public/
│   ├── index.html          # AirDrop Radar UI & Glassmorphic layout
│   ├── style.css           # Cupertino dark styling, sonar wave animations, responsive mobile design
│   ├── app.js              # Discovery manager, drag-and-drop, chunked upload/download engine
│   ├── qrcode.js           # Lightweight pure-JS SVG QR code generator (zero external CDN needed)
│   ├── manifest.json       # PWA manifest (Installable on iOS & Android home screens)
│   ├── sw.js               # Service Worker for offline PWA support
│   └── icon.svg            # OmniDrop App Icon
└── docs/
    ├── ARCHITECTURE.md     # Protocol details, AWDL limitations, and 3-tier networking design
    └── MOBILE_PACKAGING.md # Instructions for building native Android APK, iOS IPA, and desktop installers
```

---

## 🛠️ Native App Packaging

Want to compile OmniDrop into a standalone native mobile app (.apk / .ipa)?
Check out the [Mobile Packaging Guide](file:///Users/drfilms/Documents/Andirod%20Airdrop/docs/MOBILE_PACKAGING.md) for step-by-step instructions using **Capacitor** and **Electron/Tauri**.
