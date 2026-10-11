# AI Agent Instructions for Nosved Player Desktop Development

This document serves as the absolute source of truth for any AI agent assisting with the development of the **Nosved Player Desktop** project. You must strictly adhere to these rules, architectural guidelines, and development philosophies before generating or modifying any code.

## 1. Core Development Philosophy

- **Goal:** Nosved Player Desktop is a high-performance, native Windows x64 desktop video player application built with React, TypeScript, Electron, Vite, Material 3 Expressive UI (Vanilla CSS), and the native libmpv engine.
- **Greeting Requirement:** Always start every chat response with the words "Hey Devson".
- **One Line Explanation & Brevity:** Be extremely short, precise, and direct. Never provide long explanatory essays, filler, or unrequested conversational text.
- **Flawless Execution:** The application MUST run smoothly without stutter, memory leaks, or UI lag.
- **Zero Crash Tolerance:** Graceful degradation over unhandled exceptions. Handle errors safely in both Electron Main and React Renderer without taking down the app.
- **No Hallucinations:** Only use verified APIs, packages, files, and assets present in the project. If unsure, request inspection before assuming.
- **Forbidden Character:** Do not add the unicode box-drawing character '─' anywhere in any file.

## 2. Desktop UI & Styling Guidelines

- **Framework:** React with strict TypeScript.
- **Styling:** Vanilla CSS with Material 3 Expressive design tokens. Avoid Tailwind CSS unless explicitly requested.
- **Desktop-First & Touch-Aware:** Design intuitive, responsive desktop layouts with generous click/touch targets, clean surface hierarchies, and accessible contrast.
- **Icons:** Use `lucide-react` for consistent iconography.
- **Component Hygiene:** Keep components focused and stateless where possible. Never run heavy computation, synchronous blocking loops, or direct filesystem I/O in the renderer.

## 3. Electron Security & Architecture Boundaries

- **BrowserWindow Enforcements:**
  - `contextIsolation: true` is mandatory.
  - `nodeIntegration: false` is mandatory.
  - `sandbox: true` is mandatory.
  - Web security enabled; running insecure content forbidden.
- **Preload Exposure:**
  - Only expose minimal, strictly-typed methods through `contextBridge.exposeInMainWorld('nosvedAPI', ...)`.
  - Never expose raw `ipcRenderer`, Node.js globals, `require`, `process`, `Buffer`, or filesystem primitives to React.
- **IPC Validation:** Every IPC invoke must validate `event.senderFrame.url` and verify the sender against the approved window origin before executing privileged tasks.
- **Navigation Lock:** Deny unapproved navigations (`will-navigate`) and block new window popups (`setWindowOpenHandler` deny).
- **Content Security Policy:** Maintain strict CSP headers on all pages and responses.

## 4. Code Quality, Toolchain & Native Asset Preservation

- **Language:** TypeScript with strict type checking (`tsc --noEmit` must pass with 0 errors).
- **Native libmpv Assets:**
  - Never move, rename, delete, or overwrite assets in `windows/x64/` (`libmpv-2.dll`, `libmpv.dll.a`, `include/mpv/*`, `note.md`).
  - `libmpv-2.dll` is an untracked binary (>100MB) preserved locally on disk. Never attempt to force-track it into standard Git commits without authorization.
- **Build & Quality Gates:**
  - After any change, verify: `npm run typecheck`, `npm run build`, and `npm test`.
  - Never leave broken builds, failed tests, or unresolved linter errors.

## 5. Strict Limits for Agent Actions

- **Phase Discipline:** Strictly follow current phase objectives. Never jump to future phases, implement ahead of approval, or preload unapproved libraries.
- **Package Management:** Do not install, upgrade, or remove packages without explicit developer direction or approval.
- **Git Restrictions:**
  - Do not automatically commit or push to Git repositories.
  - Never automatically modify `.gitignore`.
  - Never discard user changes or force-rewrite git history.

## 6. Documentation & Update Tracking

You must actively maintain the project's changelog. After every completed task, error resolution, or feature addition, you must append an entry to the `update_details.md` file.

**Format and Rules for `update_details.md`:**
- Do NOT read or rewrite the whole file every time. Simply append the new data at the very end of the document.
- Include a Date and Time stamp for the update.
- Use the following format:
  - **Issue:** (Briefly describe the exact issue or bottleneck that was solved)
  - **Type:** (Specify category: e.g., Error, Bug, UI, Performance, Architecture, Feature, Dependency)
  - **Solution:** (Explain how the issue was solved. Maximum 10 lines.)
- Append exactly `---` on a new line after the update details to close the entry.
- Do not include any conversational filler in the file.
