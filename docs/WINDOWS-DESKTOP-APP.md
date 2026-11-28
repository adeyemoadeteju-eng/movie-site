# AniOrbit for Windows

AniOrbit for Windows is a lightweight Tauri 2 desktop shell around the live AniOrbit website.

## How it works

- The app opens https://aniorbit.pages.dev in a native Windows window using Microsoft WebView2.
- The application shell is built with Rust and Tauri 2; it does not bundle Electron or a second browser engine.
- Because the app uses the live website, website fixes and UI updates become available without reinstalling the desktop app.
- The catalogue, authentication, cloud library sync, and playback still rely on the same online services as the website.

## Requirements

- Windows 10 or Windows 11, 64-bit.
- An internet connection.
- Microsoft Edge WebView2 Runtime. The installer downloads the small Microsoft bootstrapper and installs the runtime when it is not already present.

## Build locally

Install Node.js 20+ and the Rust stable toolchain, then run:

```bash
npm install
npm run tauri -- icon src-tauri/icons/aniorbit.svg --output src-tauri/icons
npm run desktop:build
```

Installers are written under `src-tauri/target/release/bundle/`:
- `nsis/` contains the setup `.exe`.
- `msi/` contains the Windows Installer `.msi`.

## GitHub Actions

The **Build AniOrbit Windows app** workflow builds both installer formats on a Windows runner and uploads them as the `aniorbit-windows-installers` artifact. Artifacts are retained for 14 days.

## Data and privacy notes

The desktop app has its own WebView2 profile. Data saved only in Chrome or Edge local storage is not automatically copied into the desktop profile. Sign in to AniOrbit and use its private cloud-library sync to bring across the watchlist, history, tracking, progress, and custom lists that have been synced to your account.

The app shell does not expose Tauri commands or native filesystem access to the remote website.
