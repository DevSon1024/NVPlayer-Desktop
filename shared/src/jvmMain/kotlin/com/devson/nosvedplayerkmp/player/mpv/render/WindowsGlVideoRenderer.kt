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
 * copying pixel data through JVM heap memory.
 */
class WindowsGlVideoRenderer(
    private val player: Player
) : VideoRenderer {

    private val attached = AtomicBoolean(false)
    private val disposed = AtomicBoolean(false)

    private val surfaceWidth = AtomicInteger(640)
    private val surfaceHeight = AtomicInteger(480)
    private val forceRedraw = AtomicBoolean(false)

    @Volatile
    private var renderThread: Thread? = null

    private val renderLock = java.util.concurrent.locks.ReentrantLock()
    private val frameCondition = renderLock.newCondition()

    // Strong references to JNA callbacks to prevent premature GC by JVM
    private val getProcCallback = MpvGetProcAddressCallback { _, name ->
        Win32GlInterop.getProcAddress(name)
    }

    private val updateCallback = MpvRenderUpdateCallback { _ ->
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

    override fun attachSurface(surface: Component) {
        if (disposed.get()) return
        if (attached.get()) {
            detachSurface()
        }

        val hwnd = Native.getComponentPointer(surface)
            ?: throw IllegalStateException("Failed to obtain HWND from native surface component")

        val initialW = if (surface.width > 0) surface.width else 640
        val initialH = if (surface.height > 0) surface.height else 480
        surfaceWidth.set(initialW)
        surfaceHeight.set(initialH)

        val initLatch = CountDownLatch(1)
        var initError: Throwable? = null

        val thread = Thread({
            try {
                runRenderLoop(hwnd, initLatch)
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
            detachSurface()
            throw IllegalStateException("Failed to initialize OpenGL video renderer: ${initError?.message}", initError)
        }

        applyAspectRatio(currentMode)
    }

    private fun runRenderLoop(hwnd: Pointer, initLatch: CountDownLatch) {
        val user32 = Win32GlInterop.user32
        val gdi32 = Win32GlInterop.gdi32
        val opengl32 = Win32GlInterop.opengl32

        val hdc = user32.GetDC(hwnd)
            ?: throw IllegalStateException("GetDC returned NULL for HWND $hwnd")

        var hglrc: Pointer? = null
        var renderCtx: Pointer? = null
        var renderNative: LibMpvRenderNative? = null

        try {
            val pfd = Win32PixelFormatDescriptor()
            val pixelFormat = gdi32.ChoosePixelFormat(hdc, pfd)
            if (pixelFormat <= 0) {
                throw IllegalStateException("ChoosePixelFormat failed")
            }
            if (!gdi32.SetPixelFormat(hdc, pixelFormat, pfd)) {
                throw IllegalStateException("SetPixelFormat failed")
            }

            hglrc = opengl32.wglCreateContext(hdc)
                ?: throw IllegalStateException("wglCreateContext failed")

            if (!opengl32.wglMakeCurrent(hdc, hglrc)) {
                throw IllegalStateException("wglMakeCurrent failed on render thread")
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

            val rawMpv = (player as? MpvPlayer)?.rawMpvHandle
                ?: throw IllegalStateException("Raw mpv handle not available on player instance")

            val loadedRender = MpvLibraryLoader.loadRenderNative()
            renderNative = loadedRender

            val renderCtxRef = PointerByReference()
            val createStatus = loadedRender.mpv_render_context_create(renderCtxRef, rawMpv, paramsMem)
            if (createStatus < 0) {
                throw IllegalStateException("mpv_render_context_create failed with error: $createStatus")
            }

            val ctx = renderCtxRef.value
                ?: throw IllegalStateException("mpv_render_context_create returned NULL pointer")
            renderCtx = ctx

            // Register frame update callback
            loadedRender.mpv_render_context_set_update_callback(ctx, updateCallback, null)


            // FBO parameter memory (fbo, w, h, internal_format)
            val fboMem = Memory(16)
            val flipYMem = Memory(4).apply { setInt(0, 1) }

            // Render params: MPV_RENDER_PARAM_OPENGL_FBO (3), MPV_RENDER_PARAM_FLIP_Y (4), terminator (0)
            val renderParamsMem = Memory(48).apply {
                clear()
                setInt(0, MpvRenderParamType.OPENGL_FBO)
                setPointer(8, fboMem)
                setInt(16, MpvRenderParamType.FLIP_Y)
                setPointer(24, flipYMem)
                setInt(32, MpvRenderParamType.INVALID)
                setPointer(40, null)
            }

            // Signal initialization success
            initLatch.countDown()

            // Main rendering event loop
            while (!disposed.get() && attached.get()) {
                renderLock.lock()
                try {
                    frameCondition.await(100, TimeUnit.MILLISECONDS)
                } finally {
                    renderLock.unlock()
                }
                if (disposed.get() || !attached.get()) break

                val w = surfaceWidth.get().coerceAtLeast(1)
                val h = surfaceHeight.get().coerceAtLeast(1)

                val flags = loadedRender.mpv_render_context_update(ctx)
                val needsRender = (flags and MpvRenderUpdateFlag.FRAME) != 0L || forceRedraw.compareAndSet(true, false)

                if (needsRender) {
                    fboMem.setInt(0, 0) // Default window framebuffer
                    fboMem.setInt(4, w)
                    fboMem.setInt(8, h)
                    fboMem.setInt(12, 0)

                    val status = loadedRender.mpv_render_context_render(ctx, renderParamsMem)
                    if (status >= 0) {
                        gdi32.SwapBuffers(hdc)
                        loadedRender.mpv_render_context_report_swap(ctx)
                    }
                }
            }
        } finally {
            try {
                if (renderCtx != null && renderNative != null) {
                    renderNative.mpv_render_context_free(renderCtx)
                }
            } catch (_: Throwable) {}

            try {
                opengl32.wglMakeCurrent(null, null)
            } catch (_: Throwable) {}

            try {
                if (hglrc != null) {
                    opengl32.wglDeleteContext(hglrc)
                }
            } catch (_: Throwable) {}

            try {
                user32.ReleaseDC(hwnd, hdc)
            } catch (_: Throwable) {}
        }
    }

    override fun detachSurface() {
        if (!attached.compareAndSet(true, false)) return

        renderLock.lock()
        try {
            frameCondition.signalAll()
        } finally {
            renderLock.unlock()
        }

        renderThread?.let { t ->
            try {
                t.join(1000)
            } catch (_: InterruptedException) {}
        }
        renderThread = null
    }

    override fun setSurfaceSize(width: Int, height: Int) {
        if (width > 0 && height > 0) {
            surfaceWidth.set(width)
            surfaceHeight.set(height)
            triggerRedraw()
        }
    }

    override fun setAspectRatioMode(mode: AspectRatioMode) {
        currentMode = mode
        applyAspectRatio(mode)
    }

    private fun applyAspectRatio(mode: AspectRatioMode) {
        val mpv = (player as? MpvPlayer)?.currentInstance ?: return
        try {
            when (mode) {
                AspectRatioMode.FIT -> {
                    MpvProperties.setString(mpv, "panscan", "0.0")
                    MpvProperties.setString(mpv, "keepaspect", "yes")
                    MpvProperties.setString(mpv, "video-aspect-override", "-1")
                }
                AspectRatioMode.FILL -> {
                    MpvProperties.setString(mpv, "panscan", "1.0")
                    MpvProperties.setString(mpv, "keepaspect", "yes")
                    MpvProperties.setString(mpv, "video-aspect-override", "-1")
                }
                AspectRatioMode.ORIGINAL -> {
                    MpvProperties.setString(mpv, "panscan", "0.0")
                    MpvProperties.setString(mpv, "keepaspect", "yes")
                    MpvProperties.setString(mpv, "video-aspect-override", "-1")
                }
            }
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
        disposed.set(true)
        detachSurface()
    }
}
