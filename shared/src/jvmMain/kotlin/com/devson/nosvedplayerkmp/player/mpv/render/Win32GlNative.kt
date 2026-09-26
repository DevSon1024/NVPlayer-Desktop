package com.devson.nosvedplayerkmp.player.mpv.render

import com.sun.jna.Library
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.Structure

/**
 * Windows Win32 PIXELFORMATDESCRIPTOR structure for OpenGL context creation.
 */
@Structure.FieldOrder(
    "nSize", "nVersion", "dwFlags", "iPixelType", "cColorBits",
    "cRedBits", "cRedShift", "cGreenBits", "cGreenShift", "cBlueBits", "cBlueShift",
    "cAlphaBits", "cAlphaShift", "cAccumBits", "cAccumRedBits", "cAccumGreenBits",
    "cAccumBlueBits", "cAccumAlphaBits", "cDepthBits", "cStencilBits", "cAuxBuffers",
    "iLayerType", "bReserved", "dwLayerMask", "dwVisibleMask", "dwDamageMask"
)
open class Win32PixelFormatDescriptor : Structure() {
    @JvmField var nSize: Short = 40
    @JvmField var nVersion: Short = 1
    // PFD_DRAW_TO_WINDOW (0x4) | PFD_SUPPORT_OPENGL (0x20) | PFD_DOUBLEBUFFER (0x1)
    @JvmField var dwFlags: Int = 0x00000004 or 0x00000020 or 0x00000001
    @JvmField var iPixelType: Byte = 0 // PFD_TYPE_RGBA
    @JvmField var cColorBits: Byte = 32
    @JvmField var cRedBits: Byte = 0
    @JvmField var cRedShift: Byte = 0
    @JvmField var cGreenBits: Byte = 0
    @JvmField var cGreenShift: Byte = 0
    @JvmField var cBlueBits: Byte = 0
    @JvmField var cBlueShift: Byte = 0
    @JvmField var cAlphaBits: Byte = 8
    @JvmField var cAlphaShift: Byte = 0
    @JvmField var cAccumBits: Byte = 0
    @JvmField var cAccumRedBits: Byte = 0
    @JvmField var cAccumGreenBits: Byte = 0
    @JvmField var cAccumBlueBits: Byte = 0
    @JvmField var cAccumAlphaBits: Byte = 0
    @JvmField var cDepthBits: Byte = 24
    @JvmField var cStencilBits: Byte = 8
    @JvmField var cAuxBuffers: Byte = 0
    @JvmField var iLayerType: Byte = 0 // PFD_MAIN_PLANE
    @JvmField var bReserved: Byte = 0
    @JvmField var dwLayerMask: Int = 0
    @JvmField var dwVisibleMask: Int = 0
    @JvmField var dwDamageMask: Int = 0
}

internal interface Win32User32 : Library {
    fun GetDC(hwnd: Pointer): Pointer?
    fun ReleaseDC(hwnd: Pointer, hdc: Pointer): Int
}

internal interface Win32Gdi32 : Library {
    fun ChoosePixelFormat(hdc: Pointer, pfd: Win32PixelFormatDescriptor): Int
    fun SetPixelFormat(hdc: Pointer, format: Int, pfd: Win32PixelFormatDescriptor): Boolean
    fun GetPixelFormat(hdc: Pointer): Int
    fun SwapBuffers(hdc: Pointer): Boolean
}

internal interface Win32Opengl32 : Library {
    fun wglCreateContext(hdc: Pointer): Pointer?
    fun wglMakeCurrent(hdc: Pointer?, hglrc: Pointer?): Boolean
    fun wglDeleteContext(hglrc: Pointer): Boolean
    fun wglGetProcAddress(name: String): Pointer?
}

internal interface Win32Kernel32 : Library {
    fun GetModuleHandleA(name: String?): Pointer?
    fun LoadLibraryA(name: String): Pointer?
    fun GetProcAddress(module: Pointer?, name: String): Pointer?
}

internal object Win32GlInterop {
    val user32: Win32User32 by lazy { Native.load("user32", Win32User32::class.java) }
    val gdi32: Win32Gdi32 by lazy { Native.load("gdi32", Win32Gdi32::class.java) }
    val opengl32: Win32Opengl32 by lazy { Native.load("opengl32", Win32Opengl32::class.java) }
    val kernel32: Win32Kernel32 by lazy { Native.load("kernel32", Win32Kernel32::class.java) }
    val openglModule: Pointer? by lazy {
        kernel32.GetModuleHandleA("opengl32.dll") ?: kernel32.LoadLibraryA("opengl32.dll")
    }

    /**
     * Resolves an OpenGL function pointer using wglGetProcAddress with a fallback
     * to opengl32.dll GetProcAddress for core OpenGL 1.1 symbols.
     */
    fun getProcAddress(name: String?): Pointer? {
        if (name == null) return null
        var proc = opengl32.wglGetProcAddress(name)
        val procAddr = Pointer.nativeValue(proc)
        if (proc == null || procAddr == 0L || procAddr == 1L || procAddr == 2L || procAddr == 3L || procAddr == -1L) {
            proc = kernel32.GetProcAddress(openglModule, name)
        }
        return proc
    }
}
