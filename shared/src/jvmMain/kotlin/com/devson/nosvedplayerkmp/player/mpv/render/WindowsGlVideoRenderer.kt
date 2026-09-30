package com.devson.nosvedplayerkmp.player.mpv.render

import com.devson.nosvedplayerkmp.player.api.Player
import com.devson.nosvedplayerkmp.player.mpv.MpvPlayer
import com.devson.nosvedplayerkmp.player.mpv.MpvProperties
import com.devson.nosvedplayerkmp.player.mpv.native.MpvLibraryLoader
import com.sun.jna.Memory
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.ptr.PointerByReference
import java.awt.Component
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Windows-specific GPU hardware-accelerated video renderer using WGL and libmpv's render API.
 *
 * Renders video frames directly to an AWT [Component] native surface via OpenGL without
 * copying pixel data through JVM heap memory. Supports dynamic HWND re-attachment for
 * seamless window resizing, fullscreen transitions, and display changes without interrupting
 * media playback or desynchronizing audio.
 */
class WindowsGlVideoRenderer(
    private val player: Player
) : VideoRenderer {

    private val attached = AtomicBoolean(false)
    private val disposed = AtomicBoolean(false)

    private val lifecycleLock = Any()

    @Volatile
    private var attachedHwnd: Pointer? = null

    val currentHwnd: Pointer?
        get() = attachedHwnd

    private val surfaceWidth = AtomicInteger(640)
    private val surfaceHeight = AtomicInteger(480)
    private val forceRedraw = AtomicBoolean(false)
    val renderedFramesCount = AtomicInteger(0)

    @Volatile
    private var renderThread: Thread? = null

    private val renderLock = java.util.concurrent.locks.ReentrantLock()
    private val frameCondition = renderLock.newCondition()

    private val hasPendingUpdate = AtomicBoolean(false)

    // Strong references to JNA callbacks to prevent premature GC by JVM
    private val getProcCallback = MpvGetProcAddressCallback { _, name ->
        Win32GlInterop.getProcAddress(name)
    }

    private val updateCallback = MpvRenderUpdateCallback { _ ->
        hasPendingUpdate.set(true)
        renderLock.lock()
        try {
            frameCondition.signalAll()
        } finally {
            renderLock.unlock()
        }
    }

    @Volatile
    private var currentMode: AspectRatioMode = AspectRatioMode.FIT

    override val isAttached: Boolean
        get() = attached.get() && !disposed.get()

    override fun isAttachedTo(surface: Component): Boolean {
        if (!isAttached) return false
        val hwnd = try {
            Native.getComponentPointer(surface)
        } catch (_: Throwable) {
            null
        }
        return hwnd != null && Pointer.nativeValue(hwnd) != 0L && hwnd == attachedHwnd
    }

    override fun attachSurface(surface: Component) {
        synchronized(lifecycleLock) {
            if (disposed.get()) return

            val newHwnd = try {
                Native.getComponentPointer(surface)
            } catch (t: Throwable) {
                null
            }

            if (newHwnd == null || Pointer.nativeValue(newHwnd) == 0L) {
                throw IllegalStateException("Failed to obtain valid HWND from native surface component")
            }

            // Idempotency check: if already attached to this HWND, avoid recreating renderer
            if (attached.get() && attachedHwnd == newHwnd) {
                val w = if (surface.width > 0) surface.width else surfaceWidth.get()
                val h = if (surface.height > 0) surface.height else surfaceHeight.get()
                setSurfaceSize(w, h)
                applyAspectRatio(currentMode)
                triggerRedraw()
                return
            }

            val oldHwnd = attachedHwnd
            if (attached.get()) {
                println("[WindowsGlVideoRenderer] Reattaching surface: old HWND=$oldHwnd -> new HWND=$newHwnd")
                detachSurfaceInternal()
            } else {
                println("[WindowsGlVideoRenderer] Attaching surface to HWND=$newHwnd")
            }

            val clientRect = Win32GlInterop.getWindowClientRect(newHwnd)
            val initialW = (clientRect?.width ?: if (surface.width > 0) surface.width else 640).coerceAtLeast(1)
            val initialH = (clientRect?.height ?: if (surface.height > 0) surface.height else 480).coerceAtLeast(1)
            surfaceWidth.set(initialW)
            surfaceHeight.set(initialH)
            attachedHwnd = newHwnd

            val initLatch = CountDownLatch(1)
            var initError: Throwable? = null

            val thread = Thread({
                try {
                    runRenderLoop(newHwnd, initLatch)
                } catch (t: Throwable) {
                    initError = t
                    initLatch.countDown()
                }
            }, "MpvGlRenderThread").apply {
                isDaemon = true
            }

            renderThread = thread
            attached.set(true)
            thread.start()

            val inited = initLatch.await(4, TimeUnit.SECONDS)
            if (!inited || initError != null) {
                detachSurfaceInternal()
                val errorMsg = initError?.message ?: "Initialization timeout"
                System.err.println("[WindowsGlVideoRenderer] Render initialization failed: $errorMsg")
                throw IllegalStateException("Failed to initialize OpenGL video renderer: $errorMsg", initError)
            }

            applyAspectRatio(currentMode)
            triggerRedraw()
            println("[WindowsGlVideoRenderer] Surface attached successfully to HWND=$newHwnd")
        }
    }

    private fun runRenderLoop(hwnd: Pointer, initLatch: CountDownLatch) {
        println("[WindowsGlVideoRenderer] Render thread started for HWND=$hwnd")
        val user32 = Win32GlInterop.user32
        val gdi32 = Win32GlInterop.gdi32
        val opengl32 = Win32GlInterop.opengl32

        val hdc = user32.GetDC(hwnd)
        if (hdc == null || Pointer.nativeValue(hdc) == 0L) {
            val err = "GetDC returned NULL for HWND $hwnd"
            System.err.println("[WindowsGlVideoRenderer] $err")
            initLatch.countDown()
            throw IllegalStateException(err)
        }
        println("[WindowsGlVideoRenderer] Acquired HDC=$hdc for HWND=$hwnd")

        var hglrc: Pointer? = null
        var renderCtx: Pointer? = null
        var renderNative: LibMpvRenderNative? = null

        try {
            var pixelFormat = gdi32.GetPixelFormat(hdc)
            if (pixelFormat <= 0) {
                val pfd = Win32PixelFormatDescriptor()
                pixelFormat = gdi32.ChoosePixelFormat(hdc, pfd)
                if (pixelFormat <= 0) {
                    val err = "ChoosePixelFormat failed for HDC $hdc"
                    System.err.println("[WindowsGlVideoRenderer] $err")
                    throw IllegalStateException(err)
                }
                if (!gdi32.SetPixelFormat(hdc, pixelFormat, pfd)) {
                    val err = "SetPixelFormat failed for HDC $hdc"
                    System.err.println("[WindowsGlVideoRenderer] $err")
                    throw IllegalStateException(err)
                }
            }

            hglrc = opengl32.wglCreateContext(hdc)
            if (hglrc == null || Pointer.nativeValue(hglrc) == 0L) {
                val err = "wglCreateContext failed for HDC $hdc"
                System.err.println("[WindowsGlVideoRenderer] $err")
                throw IllegalStateException(err)
            }
            println("[WindowsGlVideoRenderer] Created WGL context HGLRC=$hglrc")

            if (!opengl32.wglMakeCurrent(hdc, hglrc)) {
                val err = "wglMakeCurrent failed for HDC=$hdc, HGLRC=$hglrc"
                System.err.println("[WindowsGlVideoRenderer] $err")
                throw IllegalStateException(err)
            }

            // Enable VSync via wglSwapIntervalEXT to eliminate stuttering and frame tearing
            val swapIntervalProc = Win32GlInterop.getProcAddress("wglSwapIntervalEXT")
            if (swapIntervalProc != null && Pointer.nativeValue(swapIntervalProc) != 0L) {
                try {
                    val swapFunc = com.sun.jna.Function.getFunction(swapIntervalProc)
                    swapFunc.invoke(Int::class.java, arrayOf(1))
                    println("[WindowsGlVideoRenderer] VSync locked to monitor refresh via wglSwapIntervalEXT(1)")
                } catch (t: Throwable) {
                    System.err.println("[WindowsGlVideoRenderer] wglSwapIntervalEXT notice: ${t.message}")
                }
            }

            // Prepare mpv_opengl_init_params
            val glInitParams = MpvOpenglInitParams().apply {
                get_proc_address = this@WindowsGlVideoRenderer.getProcCallback
                get_proc_address_ctx = null
                write()
            }

            val apiTypeStr = Native.toByteArray("opengl", "UTF-8")
            val apiTypeMem = Memory((apiTypeStr.size + 1).toLong()).apply {
                write(0, apiTypeStr, 0, apiTypeStr.size)
                setByte(apiTypeStr.size.toLong(), 0)
            }

            val advControlMem = Memory(4).apply {
                setInt(0, 1)
            }

            // Setup mpv_render_param array: 3 params + 1 null terminator (16 bytes each on 64-bit)
            val paramsMem = Memory(64).apply {
                clear()
                // Param 0: MPV_RENDER_PARAM_API_TYPE (1)
                setInt(0, MpvRenderParamType.API_TYPE)
                setPointer(8, apiTypeMem)
                // Param 1: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS (2)
                setInt(16, MpvRenderParamType.OPENGL_INIT_PARAMS)
                setPointer(24, glInitParams.pointer)
                // Param 2: MPV_RENDER_PARAM_ADVANCED_CONTROL (10)
                setInt(32, MpvRenderParamType.ADVANCED_CONTROL)
                setPointer(40, advControlMem)
                // Param 3: MPV_RENDER_PARAM_INVALID (0) - terminator
                setInt(48, MpvRenderParamType.INVALID)
                setPointer(56, null)
            }

            val mpvPlayer = player as? MpvPlayer
            val rawMpv = mpvPlayer?.rawMpvHandle
                ?: throw IllegalStateException("Raw mpv handle not available on player instance")

            val loadedRender = MpvLibraryLoader.loadRenderNative()
            renderNative = loadedRender

            val renderCtxRef = PointerByReference()
            val createStatus = loadedRender.mpv_render_context_create(renderCtxRef, rawMpv, paramsMem)
            if (createStatus < 0) {
                val err = "mpv_render_context_create failed with error: $createStatus"
                System.err.println("[WindowsGlVideoRenderer] $err")
                throw IllegalStateException(err)
            }

            val ctx = renderCtxRef.value
                ?: throw IllegalStateException("mpv_render_context_create returned NULL pointer")
            renderCtx = ctx
            println("[WindowsGlVideoRenderer] Created mpv_render_context=$ctx")

            // Register frame update callback
            loadedRender.mpv_render_context_set_update_callback(ctx, updateCallback, null)

            // Re-engage video decoder pipeline in libmpv if media is loaded
            val mpvInstance = mpvPlayer.currentInstance
            if (mpvInstance != null) {
                try {
                    val currentVid = MpvProperties.getString(mpvInstance, "vid").getOrNull()
                    val targetVid = if (currentVid.isNullOrEmpty() || currentVid == "no") "auto" else currentVid
                    // Resetting vid to "no" then restoring to targetVid forces libmpv to re-bind
                    // its video decoder stream to the newly created mpv_render_context
                    MpvProperties.setString(mpvInstance, "vid", "no")
                    MpvProperties.setString(mpvInstance, "vid", targetVid)
                } catch (t: Throwable) {
                    System.err.println("[WindowsGlVideoRenderer] Error re-engaging video track: ${t.message}")
                }
            }

            // Sync initial physical dimensions
            val initClientRect = Win32GlInterop.getWindowClientRect(hwnd)
            val currentInitW = (initClientRect?.width ?: surfaceWidth.get()).coerceAtLeast(1)
            val currentInitH = (initClientRect?.height ?: surfaceHeight.get()).coerceAtLeast(1)
            surfaceWidth.set(currentInitW)
            surfaceHeight.set(currentInitH)

            // FBO parameter memory (fbo, w, h, internal_format)
            val fboMem = Memory(16)
            val flipYMem = Memory(4).apply { setInt(0, 1) }
            val blockTimeMem = Memory(4).apply { setInt(0, 0) }

            // Render params: MPV_RENDER_PARAM_OPENGL_FBO (3), MPV_RENDER_PARAM_FLIP_Y (4), MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME (12), terminator (0)
            val renderParamsMem = Memory(64).apply {
                clear()
                setInt(0, MpvRenderParamType.OPENGL_FBO)
                setPointer(8, fboMem)
                setInt(16, MpvRenderParamType.FLIP_Y)
                setPointer(24, flipYMem)
                setInt(32, MpvRenderParamType.BLOCK_FOR_TARGET_TIME)
                setPointer(40, blockTimeMem)
                setInt(48, MpvRenderParamType.INVALID)
                setPointer(56, null)
            }

            // Signal initialization success
            initLatch.countDown()

            var lastViewportW = -1
            var lastViewportH = -1
            val clientRect = Win32Rect()

            // Main rendering event loop
            while (!disposed.get() && attached.get()) {
                renderLock.lock()
                try {
                    while (!hasPendingUpdate.get() && !forceRedraw.get() && !disposed.get() && attached.get()) {
                        frameCondition.await(15, TimeUnit.MILLISECONDS)
                    }
                    hasPendingUpdate.set(false)
                } finally {
                    renderLock.unlock()
                }
                if (disposed.get() || !attached.get()) break

                // Continually sync with true Win32 physical client dimensions without object allocation
                var w = surfaceWidth.get().coerceAtLeast(1)
                var h = surfaceHeight.get().coerceAtLeast(1)
                if (user32.GetClientRect(hwnd, clientRect)) {
                    w = clientRect.width.coerceAtLeast(1)
                    h = clientRect.height.coerceAtLeast(1)
                    surfaceWidth.set(w)
                    surfaceHeight.set(h)
                }

                val flags = loadedRender.mpv_render_context_update(ctx)
                val wasForced = forceRedraw.compareAndSet(true, false)
                val needsRender = (flags and MpvRenderUpdateFlag.FRAME) != 0L || wasForced

                if (needsRender) {
                    val sizeChanged = (w != lastViewportW || h != lastViewportH)
                    if (sizeChanged) {
                        opengl32.glViewport(0, 0, w, h)
                        lastViewportW = w
                        lastViewportH = h
                    }

                    // Clear letterbox / pillarbox area to black before rendering video frame
                    opengl32.glClearColor(0.0f, 0.0f, 0.0f, 1.0f)
                    opengl32.glClear(Win32GlInterop.GL_COLOR_BUFFER_BIT)

                    fboMem.setInt(0, 0) // Default window framebuffer
                    fboMem.setInt(4, w)
                    fboMem.setInt(8, h)
                    fboMem.setInt(12, 0)

                    val status = loadedRender.mpv_render_context_render(ctx, renderParamsMem)
                    if (status >= 0) {
                        gdi32.SwapBuffers(hdc)
                        loadedRender.mpv_render_context_report_swap(ctx)
                        renderedFramesCount.incrementAndGet()
                    } else {
                        System.err.println("[WindowsGlVideoRenderer] mpv_render_context_render failed: $status")
                    }
                }
            }
        } finally {
            // Strict cleanup order: mpv_render_context -> wglMakeCurrent(null, null) -> HGLRC -> HDC
            try {
                if (renderCtx != null && renderNative != null) {
                    println("[WindowsGlVideoRenderer] Freeing mpv_render_context=$renderCtx")
                    renderNative.mpv_render_context_free(renderCtx)
                }
            } catch (t: Throwable) {
                System.err.println("[WindowsGlVideoRenderer] Error freeing mpv_render_context: ${t.message}")
            }

            try {
                opengl32.wglMakeCurrent(null, null)
            } catch (t: Throwable) {
                System.err.println("[WindowsGlVideoRenderer] Error unbinding WGL context: ${t.message}")
            }

            try {
                if (hglrc != null && Pointer.nativeValue(hglrc) != 0L) {
                    println("[WindowsGlVideoRenderer] Destroying WGL context HGLRC=$hglrc")
                    opengl32.wglDeleteContext(hglrc)
                }
            } catch (t: Throwable) {
                System.err.println("[WindowsGlVideoRenderer] Error deleting HGLRC: ${t.message}")
            }

            try {
                if (Pointer.nativeValue(hdc) != 0L) {
                    println("[WindowsGlVideoRenderer] Releasing HDC=$hdc for HWND=$hwnd")
                    user32.ReleaseDC(hwnd, hdc)
                }
            } catch (t: Throwable) {
                System.err.println("[WindowsGlVideoRenderer] Error releasing HDC: ${t.message}")
            }

            println("[WindowsGlVideoRenderer] Render thread stopped for HWND=$hwnd")
        }
    }

    override fun detachSurface() {
        synchronized(lifecycleLock) {
            detachSurfaceInternal()
        }
    }

    private fun detachSurfaceInternal() {
        val oldHwnd = attachedHwnd
        if (oldHwnd != null) {
            println("[WindowsGlVideoRenderer] Detaching surface from HWND=$oldHwnd")
        }

        if (!attached.compareAndSet(true, false)) {
            attachedHwnd = null
            return
        }

        renderLock.lock()
        try {
            frameCondition.signalAll()
        } finally {
            renderLock.unlock()
        }

        renderThread?.let { t ->
            try {
                t.join(3000)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        renderThread = null
        attachedHwnd = null
        println("[WindowsGlVideoRenderer] Surface detached successfully")
    }

    override fun setSurfaceSize(width: Int, height: Int) {
        if (width > 0 && height > 0) {
            val changed = surfaceWidth.getAndSet(width) != width || surfaceHeight.getAndSet(height) != height
            if (changed) {
                triggerRedraw()
            }
        }
    }

    override fun setAspectRatioMode(mode: AspectRatioMode) {
        if (currentMode == mode) return
        currentMode = mode
        applyAspectRatio(mode)
    }

    private fun applyAspectRatio(mode: AspectRatioMode) {
        val mpv = (player as? MpvPlayer)?.currentInstance ?: return
        try {
            MpvProperties.setString(mpv, "panscan", mode.panscan)
            MpvProperties.setString(mpv, "video-unscaled", mode.unscaled)
            MpvProperties.setString(mpv, "keepaspect", "yes")
            MpvProperties.setString(mpv, "video-aspect-override", "-1")
            MpvProperties.setString(mpv, "video-align-x", "0.0")
            MpvProperties.setString(mpv, "video-align-y", "0.0")
            triggerRedraw()
        } catch (_: Throwable) {}
    }

    override fun triggerRedraw() {
        forceRedraw.set(true)
        renderLock.lock()
        try {
            frameCondition.signalAll()
        } finally {
            renderLock.unlock()
        }
    }

    override fun close() {
        synchronized(lifecycleLock) {
            disposed.set(true)
            detachSurfaceInternal()
        }
    }
}
