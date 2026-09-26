# AI Agent Instructions for Nosved Player KMP Development

This document serves as the absolute source of truth for any AI agent or LLM assisting with the development of the **Nosved Player KMP** project (`com.devson.nosvedplayerkmp`). You must strictly adhere to these rules, architectural guidelines, resource-saving rules, and development philosophies before generating or modifying any code.

## 1. Core Development Philosophy & Architecture

- **Goal:** Nosved Player KMP is a high-performance, native Kotlin Multiplatform media player targeting Windows Desktop (via Kotlin/JVM, JNA, OpenGL, and native libmpv 2.0) and Android, built with Compose Multiplatform, Coroutines/Flow, and Material 3 Expressive.
- **Strict Layer Separation:**
  ```
  UI (Compose Multiplatform)
    ↓
  ViewModels / UI State Flow
    ↓
  Shared Media / Queue / Repository Layer
    ↓
  Shared Player API (Player interface)
    ↓
  Platform Engine (MpvPlayer)
    ↓
  Native Engine (libmpv 2.0 C API via JNA / C bindings)
  ```
- **Engine Isolation:** Never bypass the Player API. Never put mpv, JNA, C bindings, or platform native rendering calls inside Compose UI.
- **Flawless Execution:** The app MUST run with maximum fluidity. UI stutter, frame drops, or blocking the Main/UI thread are completely unacceptable.
- **Zero Crash Tolerance:** Always prioritize graceful degradation (error states, fallbacks, empty states) over unhandled exceptions. **Never** use the not-null assertion operator (`!!`).
- **No Hallucinations:** Only use existing APIs, classes, and dependencies in the project. Always start every response with the words: **"Hey Devson"**.
- **Short & Concise Explanations:** Keep explanations short, precise, and direct (preferably one-line summaries). Do not produce unnecessary long paragraphs or conversational filler.

## 2. UI & Compose Multiplatform Guidelines

- **UI Framework:** Compose Multiplatform is the exclusive UI framework. No legacy XML screens or web-based UI technologies.
- **Material 3 Expressive:** Exclusively use Material 3 components and design tokens. Never hardcode colors; always use the centralized `NosvedTheme`.
- **Desktop & Mobile Adaptivity:**
  - On desktop, use desktop-first conventions: `NavigationRail`, window placement/fullscreen synchronization, keyboard shortcuts, mouse-wheel volume/scrubbing, and drag-and-drop file support.
  - Do not force mobile-only navigation patterns onto desktop interfaces.
- **State Hoisting & Recomposition:**
  - Keep composables stateless through state hoisting.
  - Ensure StateFlow updates are targeted to avoid unnecessary recompositions across unaffected branches of the UI tree.
  - **Never** perform I/O, heavy parsing, or object allocations inside composables.

## 3. Code Quality, Concurrency & Resource Optimization

- **Language:** Kotlin is the exclusive programming language.
- **Asynchronous Operations:** Use Kotlin Coroutines and Flows (`StateFlow`/`SharedFlow`) exclusively.
- **Disk & Filesystem I/O:**
  - Dispatch all filesystem queries, folder scanning, and repository reads/writes to `Dispatchers.IO`.
  - Never query the filesystem (e.g. `File.exists()`, `File.lastModified()`, `File.listFiles()`) on the Main thread or inside rendering/animation loops.
  - Cache folder indexes and library metadata locally in `~/.nosved/` rather than repeatedly traversing disk directories.
- **Coroutine Scope & Lifecycle Management:**
  - Always manage ViewModel coroutines using a dedicated child `SupervisorJob` chained to the parent scope, cancelling only the child job upon ViewModel release. This prevents `JobCancellationException` during testing and prevents coroutine leaks in runtime.
- **Memory & Resource Efficiency:**
  - Avoid redundant allocations, duplicate collections, and repetitive string processing in hot paths.
  - Use lazy collections (`LazyVerticalGrid`, `LazyColumn`) for all media listings.
- **Code Writing Constraint:** Do not add '─' anywhere in the code files.

## 4. Documentation & Update Tracking

Maintain the project changelog by appending updates to `update_details.md` after completing a task, feature, or bug fix:
- Do NOT rewrite or overwrite existing contents; only append new entries at the end.
- Use the following required format:
  ```markdown
  ### [YYYY-MM-DD HH:mm]
  - **Issue:** (Brief description of the problem or task)
  - **Type:** (Error | Bug | UI | Performance | Architecture | Feature)
  - **Solution:** (Concise explanation of the solution, max 10 lines)
  ---
  ```
- Do not include conversational filler in `update_details.md`.

## 5. Version Control (Git) Protocol

- **Do not commit or push** any changes to the repository until explicitly being asked to do so by the developer.
- **Do not change any `.gitignore`** file automatically. Leave all `.gitignore` files as they are.
