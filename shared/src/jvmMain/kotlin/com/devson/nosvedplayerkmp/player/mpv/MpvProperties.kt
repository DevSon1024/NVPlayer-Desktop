package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerException
import com.devson.nosvedplayerkmp.player.mpv.native.MpvFormat
import com.sun.jna.Memory

/**
 * Type-safe accessors and constants for mpv properties.
 */
object MpvProperties {
    // Standard playback properties
    const val PAUSE = "pause"
    const val TIME_POS = "time-pos"
    const val DURATION = "duration"
    const val VOLUME = "volume"
    const val SPEED = "speed"
    const val CORE_IDLE = "core-idle"
    const val EOF_REACHED = "eof-reached"
    const val IDLE_ACTIVE = "idle-active"
    const val MEDIA_TITLE = "media-title"
    const val PATH = "path"
    const val MUTE = "mute"
    const val PLAYBACK_ABORT = "playback-abort"

    /**
     * Reads a property value as a String using mpv_get_property_string.
     * Automatically frees native memory returned by libmpv.
     */
    fun getString(instance: MpvInstance, name: String): Result<String?> = runCatching {
        val ptr = instance.native.mpv_get_property_string(instance.rawHandle, name)
        if (ptr == null) {
            return@runCatching null
        }
        try {
            ptr.getString(0, "UTF-8")
        } finally {
            instance.native.mpv_free(ptr)
        }
    }

    /**
     * Sets a property value as a String using mpv_set_property_string.
     */
    fun setString(instance: MpvInstance, name: String, value: String): Result<Unit> = runCatching {
        val status = instance.native.mpv_set_property_string(instance.rawHandle, name, value)
        if (status < 0) {
            throwPropertyError(instance, name, status, "setString failed")
        }
    }

    /**
     * Reads a flag property (Boolean) using MPV_FORMAT_FLAG.
     */
    fun getBoolean(instance: MpvInstance, name: String): Result<Boolean> = runCatching {
        val mem = Memory(4)
        val status = instance.native.mpv_get_property(instance.rawHandle, name, MpvFormat.FLAG, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "getBoolean failed")
        }
        mem.getInt(0) == 1
    }

    /**
     * Sets a flag property (Boolean) using MPV_FORMAT_FLAG.
     */
    fun setBoolean(instance: MpvInstance, name: String, value: Boolean): Result<Unit> = runCatching {
        val mem = Memory(4)
        mem.setInt(0, if (value) 1 else 0)
        val status = instance.native.mpv_set_property(instance.rawHandle, name, MpvFormat.FLAG, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "setBoolean failed")
        }
    }

    /**
     * Reads a numeric property as Double using MPV_FORMAT_DOUBLE.
     */
    fun getDouble(instance: MpvInstance, name: String): Result<Double> = runCatching {
        val mem = Memory(8)
        val status = instance.native.mpv_get_property(instance.rawHandle, name, MpvFormat.DOUBLE, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "getDouble failed")
        }
        mem.getDouble(0)
    }

    /**
     * Sets a numeric property as Double using MPV_FORMAT_DOUBLE.
     */
    fun setDouble(instance: MpvInstance, name: String, value: Double): Result<Unit> = runCatching {
        val mem = Memory(8)
        mem.setDouble(0, value)
        val status = instance.native.mpv_set_property(instance.rawHandle, name, MpvFormat.DOUBLE, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "setDouble failed")
        }
    }

    /**
     * Reads an integer property as Long using MPV_FORMAT_INT64.
     */
    fun getLong(instance: MpvInstance, name: String): Result<Long> = runCatching {
        val mem = Memory(8)
        val status = instance.native.mpv_get_property(instance.rawHandle, name, MpvFormat.INT64, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "getLong failed")
        }
        mem.getLong(0)
    }

    /**
     * Sets an integer property as Long using MPV_FORMAT_INT64.
     */
    fun setLong(instance: MpvInstance, name: String, value: Long): Result<Unit> = runCatching {
        val mem = Memory(8)
        mem.setLong(0, value)
        val status = instance.native.mpv_set_property(instance.rawHandle, name, MpvFormat.INT64, mem)
        if (status < 0) {
            throwPropertyError(instance, name, status, "setLong failed")
        }
    }

    /**
     * Registers a property change observation using mpv_observe_property.
     *
     * @param replyUserdata ID to associate with the property changes.
     * @param name Name of the property to observe.
     * @param format Data format for the property change notification.
     */
    fun observe(
        instance: MpvInstance,
        replyUserdata: Long,
        name: String,
        format: Int = MpvFormat.NONE
    ): Result<Unit> = runCatching {
        val status = instance.native.mpv_observe_property(instance.rawHandle, replyUserdata, name, format)
        if (status < 0) {
            throwPropertyError(instance, name, status, "observeProperty failed")
        }
    }

    /**
     * Unregisters a property change observation using mpv_unobserve_property.
     */
    fun unobserve(instance: MpvInstance, replyUserdata: Long): Result<Unit> = runCatching {
        val status = instance.native.mpv_unobserve_property(instance.rawHandle, replyUserdata)
        if (status < 0) {
            throwPropertyError(instance, "userdata:$replyUserdata", status, "unobserveProperty failed")
        }
    }

    private fun throwPropertyError(
        instance: MpvInstance,
        propertyName: String,
        status: Int,
        action: String
    ): Nothing {
        val desc = instance.native.mpv_error_string(status) ?: "Unknown error"
        throw PlayerException(
            PlayerError.PropertyAccessFailed(
                message = "$action for '$propertyName': code $status ($desc)",
                propertyName = propertyName,
                errorCode = status
            )
        )
    }
}
