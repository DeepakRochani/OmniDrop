# OmniDrop: The Complete Device Setup Guide 📡
### Turn OmniDrop into a Native AirDrop Experience Across All Your Devices

This guide explains how to install and run **OmniDrop** on each of your devices so that it looks, feels, and operates just like Apple's native AirDrop.

---

## 📱 1. iPhone & iPad Setup (Zero-Install Native App)

You do **not** need the App Store or Xcode. iOS Safari has built-in support for Web Apps (PWA) that run in standalone mode with full screen, native icon, and hardware acceleration:

### Step 1: Open in Safari
1. Connect your iPhone or iPad to the same Wi-Fi network.
2. Open Safari and go to:
   ```text
   http://192.168.1.33:53317
   ```
   *(Or scan the QR code displayed on your computer screen).*

### Step 2: Add to Home Screen
1. Tap the **Share** button in the bottom Safari toolbar (the box with an arrow pointing up `⎋`).
2. Scroll down and tap **"Add to Home Screen"**.
3. Name it **OmniDrop** and tap **Add** in the top right.

### Result on your iPhone:
- A real **OmniDrop AirDrop icon** is placed on your home screen.
- When launched, it opens **full screen** without any Safari address bar, tabs, or navigation buttons.
- It appears on the radar instantly whenever opened!

---

## 🤖 2. Android Phone & Tablet Setup

Android lets you install OmniDrop directly as a standalone app with its own icon in your App Drawer:

### Step 1: Open in Google Chrome
1. Connect your Android device to the same Wi-Fi.
2. In Chrome, navigate to:
   ```text
   http://192.168.1.33:53317
   ```

### Step 2: Install App
1. Tap the **Three Dots (⋮)** in the top right of Chrome.
2. Tap **"Install App"** (or **"Add to Home screen"**).
3. Confirm by tapping **Install**.

### Result on your Android:
- An official Android app is installed with the OmniDrop icon.
- It runs as an independent full-screen application and supports background file downloads to your phone's `Download/` folder.

---

## 🖥️ 3. Mac Setup (Always-On AirDrop in the Background)

Native Apple AirDrop is always running on your Mac in the background. You can do the exact same thing with OmniDrop so you never have to manually open a terminal or type `npm start` every time!

### Option A: Run in the background right now
In your terminal:
```bash
npm start
```
*(OmniDrop will run in the background, listening for incoming transfers).*

### Option B: Auto-start when Mac boots (LaunchAgent)
If you want OmniDrop to start automatically whenever your Mac mini turns on:
1. Create a startup file `~/Library/LaunchAgents/com.omnidrop.server.plist` with:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.omnidrop.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/drfilms/Documents/Andirod Airdrop/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/drfilms/Documents/Andirod Airdrop</string>
</dict>
</plist>
```
2. Enable it:
```bash
launchctl load ~/Library/LaunchAgents/com.omnidrop.server.plist
```
Now, whenever your Mac turns on, your Mac mini is **permanently discoverable** by all iPhones, Androids, and tablets on your Wi-Fi!

---

## 💻 4. Windows PC Setup

On any Windows 10/11 laptop or desktop:
1. Open **Google Chrome** or **Microsoft Edge**.
2. Go to `http://<your-mac-ip>:53317`.
3. In the address bar on the right, click the **Install App icon** (looks like a monitor with a down arrow).
4. OmniDrop installs as a standalone Windows desktop app that can be pinned to the **Taskbar** or **Start Menu**.

---

## 🔄 Daily Transfer Cheat-Sheet

| Action | How to do it |
| :--- | :--- |
| **Send from iPhone ➔ Mac** | Open OmniDrop on iPhone &rarr; tap Mac avatar &rarr; choose Photos or Files &rarr; Sent! |
| **Send from Mac ➔ iPhone** | Drag & drop files onto iPhone avatar on Mac radar &rarr; Downloads automatically to iPhone! |
| **Send from Android ➔ iPhone** | Open OmniDrop on both phones &rarr; tap iPhone avatar &rarr; Transfer happens at full 100+ MB/s Wi-Fi speed! |
| **No Wi-Fi? (Mobile Hotspot)** | Turn on Personal Hotspot on one phone &rarr; tap "Connect Device" &rarr; "No Wi-Fi / Hotspot" &rarr; scan QR code &rarr; Connected! |
| **Direct 6-Digit PIN** | Type the 6-digit code shown on the target phone &rarr; Instant direct connection! |
