package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerException

/**
 * Type-safe execution of mpv commands.
 */
object MpvCommands {

    /**
     * Executes a raw command using a null-terminated array of argument strings.
     *
     * @param instance The active [MpvInstance].
     * @param args Command name followed by its arguments (e.g. "loadfile", "path/to/file.mp4").
     */
    fun execute(instance: MpvInstance, vararg args: String): Result<Unit> = runCatching {
        require(args.isNotEmpty()) { "Command arguments cannot be empty" }

        // mpv_command expects a NULL-terminated array of char* pointers
        val argsWithNull = arrayOfNulls<String>(args.size + 1)
        for (i in args.indices) {
            argsWithNull[i] = args[i]
        }
        argsWithNull[args.size] = null

        val status = instance.native.mpv_command(instance.rawHandle, argsWithNull)
        if (status < 0) {
            val desc = instance.native.mpv_error_string(status) ?: "Unknown error"
            throw PlayerException(
                PlayerError.CommandExecutionFailed(
                    message = "Command '${args.joinToString(" ")}' failed: code $status ($desc)",
                    command = args[0],
                    errorCode = status
                )
            )
        }
    }

    /**
     * Executes a command string parsed using mpv config/input parsing rules.
     */
    fun executeString(instance: MpvInstance, commandString: String): Result<Unit> = runCatching {
        val status = instance.native.mpv_command_string(instance.rawHandle, commandString)
        if (status < 0) {
            val desc = instance.native.mpv_error_string(status) ?: "Unknown error"
            throw PlayerException(
                PlayerError.CommandExecutionFailed(
                    message = "Command string '$commandString' failed: code $status ($desc)",
                    command = commandString,
                    errorCode = status
                )
            )
        }
    }

    /**
     * Loads a file or URL for playback.
     *
     * @param uri Local file path or network URL.
     * @param mode Load mode: "replace", "append", or "append-play".
     */
    fun loadFile(instance: MpvInstance, uri: String, mode: String = "replace"): Result<Unit> =
        execute(instance, "loadfile", uri, mode)

    /**
     * Starts or resumes playback by unpausing.
     */
    fun play(instance: MpvInstance): Result<Unit> =
        MpvProperties.setBoolean(instance, MpvProperties.PAUSE, false)

    /**
     * Pauses playback.
     */
    fun pause(instance: MpvInstance): Result<Unit> =
        MpvProperties.setBoolean(instance, MpvProperties.PAUSE, true)

    /**
     * Stops playback and unloads the current media.
     */
    fun stop(instance: MpvInstance): Result<Unit> =
        execute(instance, "stop")

    /**
     * Seeks to a specific target position.
     *
     * @param seconds Position in seconds.
     * @param mode Seek mode: "absolute", "relative", "exact", etc.
     */
    fun seek(instance: MpvInstance, seconds: Double, mode: String = "absolute"): Result<Unit> =
        execute(instance, "seek", seconds.toString(), mode)

    /**
     * Seeks to an absolute timestamp in seconds.
     */
    fun seekAbsolute(instance: MpvInstance, seconds: Double): Result<Unit> =
        seek(instance, seconds, "absolute")

    /**
     * Seeks relative to the current position in seconds (+ forward, - backward).
     */
    fun seekRelative(instance: MpvInstance, seconds: Double): Result<Unit> =
        seek(instance, seconds, "relative")
}
