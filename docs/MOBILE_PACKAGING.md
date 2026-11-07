# Native Mobile & Desktop Packaging Guide

OmniDrop is built as a responsive modern web app with a zero-dependency Node.js engine. You can package OmniDrop into native apps for all app stores and platforms.

---

## 1. Zero-Install Mobile Option (PWA - Recommended First Step)
Before compiling any native code, OmniDrop includes a complete Progressive Web App (PWA) manifest and Service Worker:
1. Open `http://<your-ip>:53317` on your iPhone (Safari) or Android (Chrome).
2. **On iPhone / iPad:** Tap the **Share** button in Safari -> scroll down -> tap **"Add to Home Screen"**.
3. **On Android:** Tap the **Three Dots (Menu)** -> tap **"Install App"** or **"Add to Home Screen"**.
4. The OmniDrop icon will appear on your phone's home screen, launching full-screen without browser address bars just like a native app!

---

## 2. Packaging for Android (Native APK / Google Play)

Using **Capacitor**:

### Prerequisites:
- Node.js & npm
- Android Studio & Android SDK

### Steps:
```bash
# In the project directory:
npm install @capacitor/core @capacitor/cli @capacitor/android

# Initialize Capacitor
npx cap init OmniDrop com.omnidrop.app --web-dir public

# Add Android Platform
npx cap add android

# Build and sync web assets
npx cap copy

# Open in Android Studio
npx cap open android
```

### In Android Studio:
1. Click **Build > Generate Signed Bundle / APK**.
2. Select **APK** (for direct device install) or **Android App Bundle (AAB)** (for Google Play Store).
3. Transfer the `.apk` file to any Android device or publish to Google Play.

---

## 3. Packaging for iOS & iPadOS (App Store / TestFlight)

### Prerequisites:
- macOS with Xcode installed
- Apple Developer Account (for device code signing or App Store distribution)

### Steps:
```bash
# Install Capacitor iOS
npm install @capacitor/ios

# Add iOS Platform
npx cap add ios

# Sync public assets
npx cap copy

# Open in Xcode
npx cap open ios
```

### In Xcode:
1. Select your Development Team under **Signing & Capabilities**.
2. Connect your iPhone or iPad via USB (or select a Simulator).
3. Click **Run (Cmd + R)** to install directly on your device.

---

## 4. Packaging for Windows & macOS Desktop (Electron or Tauri)

### Using Electron:
```bash
# Install electron and packager
npm install --save-dev electron electron-builder

# Run locally in desktop window
npx electron .
```

### Add to `package.json`:
```json
{
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "desktop": "electron .",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win"
  }
}
```

Running `npm run dist:mac` creates a `.dmg` installer for macOS.
Running `npm run dist:win` creates a `.exe` installer for Windows.

