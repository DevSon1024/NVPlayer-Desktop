package com.devson.nosvedplayerkmp.player.mpv.render

import com.sun.jna.Callback
import com.sun.jna.Library
import com.sun.jna.Pointer
import com.sun.jna.Structure
import com.sun.jna.ptr.PointerByReference

/**
 * Parameter type constants matching libmpv's render.h [mpv_render_param_type].
 */
object MpvRenderParamType {
    const val INVALID: Int = 0
    const val API_TYPE: Int = 1
    const val OPENGL_INIT_PARAMS: Int = 2
    const val OPENGL_FBO: Int = 3
    const val FLIP_Y: Int = 4
    const val DEPTH: Int = 5
    const val ADVANCED_CONTROL: Int = 10
    const val BLOCK_FOR_TARGET_TIME: Int = 12
    const val SKIP_RENDERING: Int = 13
}

/**
 * Bit flags returned by [LibMpvRenderNative.mpv_render_context_update].
 */
object MpvRenderUpdateFlag {
    /** A new video frame must be rendered via mpv_render_context_render. */
    const val FRAME: Long = 1L shl 0
}

/**
 * OpenGL function pointer resolver callback for [MpvOpenglInitParams].
 */
fun interface MpvGetProcAddressCallback : Callback {
    fun invoke(ctx: Pointer?, name: String?): Pointer?
}

/**
 * Frame update notification callback for [LibMpvRenderNative.mpv_render_context_set_update_callback].
 */
fun interface MpvRenderUpdateCallback : Callback {
    fun invoke(cbCtx: Pointer?)
}

/**
 * Struct for MPV_RENDER_PARAM_OPENGL_INIT_PARAMS.
 */
@Structure.FieldOrder("get_proc_address", "get_proc_address_ctx")
open class MpvOpenglInitParams : Structure(), Structure.ByReference {
    @JvmField var get_proc_address: MpvGetProcAddressCallback? = null
    @JvmField var get_proc_address_ctx: Pointer? = null
}

/**
 * Struct for MPV_RENDER_PARAM_OPENGL_FBO.
 */
@Structure.FieldOrder("fbo", "w", "h", "internal_format")
open class MpvOpenglFbo : Structure(), Structure.ByReference {
    @JvmField var fbo: Int = 0
    @JvmField var w: Int = 0
    @JvmField var h: Int = 0
    @JvmField var internal_format: Int = 0
}

/**
 * JNA binding interface for libmpv's render.h API.
 */
internal interface LibMpvRenderNative : Library {
    fun mpv_render_context_create(res: PointerByReference, mpv: Pointer, params: Pointer): Int
    fun mpv_render_context_set_parameter(ctx: Pointer, type: Int, data: Pointer?): Int
    fun mpv_render_context_get_info(ctx: Pointer, type: Int, data: Pointer?): Int
    fun mpv_render_context_set_update_callback(ctx: Pointer, callback: MpvRenderUpdateCallback?, callback_ctx: Pointer?)
    fun mpv_render_context_update(ctx: Pointer): Long
    fun mpv_render_context_render(ctx: Pointer, params: Pointer): Int
    fun mpv_render_context_report_swap(ctx: Pointer)
    fun mpv_render_context_free(ctx: Pointer)
}
