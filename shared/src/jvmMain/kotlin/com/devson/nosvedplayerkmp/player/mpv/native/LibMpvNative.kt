package com.devson.nosvedplayerkmp.player.mpv.native

import com.sun.jna.Library
import com.sun.jna.Pointer

/**
 * JNA binding interface for libmpv C client API.
 * Contains only the bindings required for Phase 0 and Phase 1 foundations.
 */
internal interface LibMpvNative : Library {
    /**
     * Return the MPV_CLIENT_API_VERSION the mpv source has been compiled with.
     */
    fun mpv_client_api_version(): Long

    /**
     * Return a string describing the error code.
     */
    fun mpv_error_string(error: Int): String?

    /**
     * Free memory allocated by other libmpv APIs (e.g. mpv_get_property_string).
     */
    fun mpv_free(data: Pointer?)

    /**
     * Create a new mpv instance and an associated client API handle to control the mpv core.
     */
    fun mpv_create(): Pointer?

    /**
     * Initialize an uninitialized mpv instance.
     * If the instance is already initialized, an error is returned.
     */
    fun mpv_initialize(ctx: Pointer): Int

    /**
     * Disconnect and destroy the mpv_handle.
     */
    fun mpv_destroy(ctx: Pointer)

    /**
     * Similar to mpv_destroy(), but brings the player and all clients down as well.
     */
    fun mpv_terminate_destroy(ctx: Pointer)

    /**
     * Set an option on a created (and optionally initialized) mpv instance.
     */
    fun mpv_set_option_string(ctx: Pointer, name: String, data: String): Int

    /**
     * Send a command to the player.
     * The args array must be null-terminated.
     */
    fun mpv_command(ctx: Pointer, args: Array<String?>): Int

    /**
     * Same as mpv_command, but parses the command string with the same rules
     * as used in the config file.
     */
    fun mpv_command_string(ctx: Pointer, args: String): Int

    /**
     * Set a property to given value.
     */
    fun mpv_set_property(ctx: Pointer, name: String, format: Int, data: Pointer): Int

    /**
     * Set a property to given string value.
     */
    fun mpv_set_property_string(ctx: Pointer, name: String, data: String): Int

    /**
     * Read the value of the given property.
     */
    fun mpv_get_property(ctx: Pointer, name: String, format: Int, data: Pointer): Int

    /**
     * Return the value of the property with the given name as string.
     * Caller must free the returned string with mpv_free().
     */
    fun mpv_get_property_string(ctx: Pointer, name: String): Pointer?

    /**
     * Get a notification whenever the given property changes value.
     */
    fun mpv_observe_property(ctx: Pointer, replyUserdata: Long, name: String, format: Int): Int

    /**
     * Undo mpv_observe_property().
     */
    fun mpv_unobserve_property(ctx: Pointer, registeredReplyUserdata: Long): Int

    /**
     * Return a string describing the event.
     */
    fun mpv_event_name(event: Int): String?

    /**
     * Wait for the next event, or until the given timeout (in seconds) expires.
     */
    fun mpv_wait_event(ctx: Pointer, timeout: Double): Pointer?

    /**
     * Interrupt the current mpv_wait_event() call.
     */
    fun mpv_wakeup(ctx: Pointer)

    /**
     * Enable or disable receiving of log messages.
     */
    fun mpv_request_log_messages(ctx: Pointer, minLevel: String): Int
}
