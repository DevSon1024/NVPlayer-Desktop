# Nosved Player Desktop

Nosved Player Desktop is a high-performance, native Windows x64 desktop video player application built with React, TypeScript, Electron, Vite, Material 3 Expressive UI, and the native libmpv C-ABI rendering engine.

> **Migration Note:** This repository previously housed an experimental Kotlin Multiplatform (Compose Desktop) prototype. It has been migrated to a production-ready React + Electron desktop architecture with native `libmpv` C-ABI integration. Historical KMP commits are fully preserved in Git history.

---

## Key Features

- **Hardware-Accelerated Video Rendering:** Direct3D / GPU video output rendered into a native Win32 child window via the high-performance libmpv C-API.
- **Fluid Desktop UI:** Modern desktop-first interface styled with Material 3 Expressive tokens in Vanilla CSS.
- **Fullscreen & Auto-Hiding Overlays:** Fullscreen mode with high-DPI scaling (`window.devicePixelRatio`), 5-second mouse inactivity auto-hide, and full video clearance.
- **Gesture & Keyboard Controls:** Double-click and double-tap fullscreen toggles, keyboard navigation, scrubbing, volume adjustments, and mute toggle.
- **Persistent Media Library:** Embedded SQLite media database (`winsqlite3.dll`) tracking duration, resolution, codecs, frame rate, and playback positions.
- **Playlists & Auto-Advancement:** Create, rename, delete, and reorder playlists with seamless EOF auto-advancement to subsequent videos.
- **Offscreen Thumbnail Generation:** Automatic background video thumbnail extraction cached deterministically and served via the secure `nosved-thumb://` custom protocol.
- **Smart Resume Playback:** Remembers your exact playback position across restarts and prompts to resume where you left off.
- **Strict Electron Security:** Enforces `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, IPC sender validation, and strict Content Security Policy.

---

## System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit / x64)
- **Runtime Dependencies:** Universal C Runtime (`api-ms-win-crt-*`, pre-installed on Windows 10/11) and `C:\Windows\System32\winsqlite3.dll` (standard Windows component)
- **Node.js (for Development & Building):** Node.js 18+ (Node.js 20 or 22 recommended) with npm

---

## Native Engine Setup (libmpv)

Nosved Player relies on native Windows x64 `libmpv-2.dll` located at:

```
windows/x64/libmpv-2.dll
```

Because `libmpv-2.dll` is a large binary (~115MB), it is ignored by Git (`*.dll`) to keep the repository lightweight. When building from source, verify that `windows/x64/libmpv-2.dll` exists on disk before running the application.

---

## Getting Started (Development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Development Server

Launch the Vite development server and Electron shell:

```bash
npm run dev
```

The Electron desktop window will launch automatically with live reloading for the React renderer and hot-restart for the Electron main process.

---

## Production Packaging & Distribution

Nosved Player Desktop is packaged with `electron-builder` targeting Windows x64. The native `libmpv-2.dll` binary is automatically bundled via `extraResources` into the application runtime.

### Build Commands

```bash
# Compile and package unpacked directory in out/win-unpacked/
npm run pack

# Test the actual packaged production executable
npm run test:packaged

# Build Windows x64 NSIS Installer (.exe)
npm run dist:installer

# Build Windows x64 Standalone Portable Executable (.exe)
npm run dist:portable

# Build both installer and portable executables
npm run dist
```

### Generated Artifacts

Release outputs are generated inside the `out/` directory:

- **NSIS Installer:** `out/Nosved Player Desktop-Setup-0.1.0.exe` (~141 MB)
  - Installs to the per-user AppData directory (no administrator privileges required).
  - Creates Start Menu and Desktop shortcuts.
  - Safe uninstaller preserves user library databases and thumbnail caches.
- **Portable Executable:** `out/Nosved Player Desktop-Portable-0.1.0.exe` (~141 MB)
  - Standalone executable ready to run without installation.
- **Unpacked Directory:** `out/win-unpacked/`
  - Ready-to-run distribution directory containing `Nosved Player Desktop.exe` and bundled resources.

---

## Desktop User Guide

### Opening Videos

1. Click **Open Video File** on the main player screen, or use the sidebar navigation to import media.
2. Select any supported video format (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.flv`, `.ts`, `.m4v`, `.wmv`).
3. Hardware-accelerated playback starts immediately.

### Keyboard & Mouse Shortcuts

| Key / Action | Function |
| :--- | :--- |
| `Space` | Toggle Play / Pause (or Replay from beginning if finished) |
| `F` | Toggle Fullscreen mode |
| `Esc` | Exit Fullscreen or dismiss resume prompt |
| `Double Click` / `Double Tap` | Toggle Fullscreen on video surface |
| `Left Arrow` | Seek backward 5 seconds |
| `Right Arrow` | Seek forward 5 seconds |
| `Up Arrow` | Increase volume by 5% |
| `Down Arrow` | Decrease volume by 5% |
| `M` | Toggle Mute |

### Fullscreen Experience

- When entering Fullscreen (`F` or double-clicking the video), the video expands to fill your screen.
- Controls automatically hide after **5 seconds** of cursor inactivity.
- Moving your mouse or touching the screen instantly reveals the translucent playback controls overlay.
- High-DPI displays (125%, 150%, 200%) are natively scaled without offset margins or black borders.

### Playlists

1. Navigate to the **Playlists** tab in the sidebar.
2. Click **New Playlist** to create a named playlist.
3. Open a playlist and click **Add Media** to add videos from your library.
4. Drag and drop or use the reorder options to adjust playback sequence.
5. Playing a video from a playlist will automatically play the next video in order upon reaching the end.

### Library & History

- The **Library** tab catalogs imported media with extracted metadata (resolution, codecs, FPS, duration) and generated thumbnails.
- The **Recent** tab displays your watch history. Clicking any recent item will resume playback from your last saved position.

---

## Persistent Application Data

All user data is stored safely in your standard Windows User Profile directory and is never overwritten during application updates or uninstalls:

- **Database:** `%APPDATA%\nosved-player-desktop\nosved_media.db`
- **Thumbnails:** `%APPDATA%\nosved-player-desktop\thumbnails\`

---

## Security Architecture

Nosved Player Desktop enforces strict desktop security boundaries:

- **Context Isolation:** The React frontend runs in a sandboxed Chromium renderer with zero access to Node.js primitives (`process`, `require`, `Buffer` are completely blocked).
- **Type-Safe Bridge:** Only validated methods are exposed via `window.nosvedAPI`.
- **IPC Validation:** Every IPC request validates the sender's origin and frame URL before executing native calls.
- **Navigation Lock:** All external link requests and popup windows are blocked or restricted.
- **Content Security Policy:** Renderer images and media are restricted to `self`, `data:`, and the verified `nosved-thumb://` scheme.

---

## Known Limitations & Current Status

- **Target Platform:** Windows 10 and Windows 11 (64-bit / x64). Other operating systems are not currently supported due to Win32 Direct3D window embedding.
- **Native Runtime Binary:** `libmpv-2.dll` (~115MB) is not tracked directly in Git to prevent repository bloat; it is packaged via `extraResources` in release installers/portable bundles or supplied locally in `windows/x64/` for source builds.
- **Hardware Acceleration:** Requires Direct3D 11 compatible graphics hardware/drivers for optimal zero-copy rendering.

---

## License

Private / Proprietary. All rights reserved.
