package com.devson.nosvedplayerkmp.player.mpv.native

import com.sun.jna.Pointer
import com.sun.jna.Structure

/**
 * Native C structure representing an mpv_event.
 */
@Structure.FieldOrder("event_id", "error", "reply_userdata", "data")
open class MpvEventNative(p: Pointer? = null) : Structure(p) {
    @JvmField var event_id: Int = 0
    @JvmField var error: Int = 0
    @JvmField var reply_userdata: Long = 0L
    @JvmField var data: Pointer? = null

    init {
        p?.let {
            useMemory(it)
            read()
        }
    }
}

/**
 * Native C structure representing an mpv_event_property.
 */
@Structure.FieldOrder("name", "format", "data")
open class MpvEventPropertyNative(p: Pointer? = null) : Structure(p) {
    @JvmField var name: String? = null
    @JvmField var format: Int = 0
    @JvmField var data: Pointer? = null

    init {
        p?.let {
            useMemory(it)
            read()
        }
    }
}

/**
 * Native C structure representing an mpv_event_end_file.
 */
@Structure.FieldOrder("reason", "error", "playlist_entry_id", "playlist_insert_id", "playlist_insert_num_entries")
open class MpvEventEndFileNative(p: Pointer? = null) : Structure(p) {
    @JvmField var reason: Int = 0
    @JvmField var error: Int = 0
    @JvmField var playlist_entry_id: Long = 0L
    @JvmField var playlist_insert_id: Long = 0L
    @JvmField var playlist_insert_num_entries: Int = 0

    init {
        p?.let {
            useMemory(it)
            read()
        }
    }
}

/**
 * Native C structure representing an mpv_event_log_message.
 */
@Structure.FieldOrder("prefix", "level", "text", "log_level")
open class MpvEventLogMessageNative(p: Pointer? = null) : Structure(p) {
    @JvmField var prefix: String? = null
    @JvmField var level: String? = null
    @JvmField var text: String? = null
    @JvmField var log_level: Int = 0

    init {
        p?.let {
            useMemory(it)
            read()
        }
    }
}

/**
 * Data format identifiers used by mpv_get_property/mpv_set_property.
 */
object MpvFormat {
    const val NONE = 0
    const val STRING = 1
    const val OSD_STRING = 2
    const val FLAG = 3
    const val INT64 = 4
    const val DOUBLE = 5
    const val NODE = 6
    const val NODE_ARRAY = 7
    const val NODE_MAP = 8
    const val BYTE_ARRAY = 9
}

/**
 * Event IDs returned by mpv_wait_event.
 */
object MpvEventId {
    const val NONE = 0
    const val SHUTDOWN = 1
    const val LOG_MESSAGE = 2
    const val GET_PROPERTY_REPLY = 3
    const val SET_PROPERTY_REPLY = 4
    const val COMMAND_REPLY = 5
    const val START_FILE = 6
    const val END_FILE = 7
    const val FILE_LOADED = 8
    const val TRACKS_CHANGED = 9
    const val TRACK_SWITCHED = 10
    const val IDLE = 11
    const val PAUSE = 12
    const val UNPAUSE = 13
    const val TICK = 14
    const val SCRIPT_INPUT_DISPATCH = 15
    const val CLIENT_MESSAGE = 16
    const val VIDEO_RECONFIG = 17
    const val AUDIO_RECONFIG = 18
    const val METADATA_UPDATE = 19
    const val SEEK = 20
    const val PLAYBACK_RESTART = 21
    const val PROPERTY_CHANGE = 22
    const val CHAPTER_CHANGE = 23
    const val QUEUE_OVERFLOW = 24
    const val HOOK = 25
}

/**
 * Standard error codes returned by libmpv functions.
 */
object MpvError {
    const val SUCCESS = 0
    const val EVENT_QUEUE_FULL = -1
    const val NOMEM = -2
    const val UNINITIALIZED = -3
    const val INVALID_PARAMETER = -4
    const val OPTION_NOT_FOUND = -5
    const val OPTION_FORMAT = -6
    const val OPTION_ERROR = -7
    const val PROPERTY_NOT_FOUND = -8
    const val PROPERTY_FORMAT = -9
    const val PROPERTY_UNAVAILABLE = -10
    const val PROPERTY_ERROR = -11
    const val COMMAND = -12
    const val LOADING_FAILED = -13
    const val AO_INIT_FAILED = -14
    const val VO_INIT_FAILED = -15
    const val NOTHING_TO_PLAY = -16
    const val UNKNOWN_FORMAT = -17
    const val UNSUPPORTED = -18
    const val NOT_IMPLEMENTED = -19
    const val GENERIC = -20
}

/**
 * Reason codes for MPV_EVENT_END_FILE.
 */
object MpvEndFileReason {
    const val EOF = 0
    const val STOP = 2
    const val QUIT = 3
    const val ERROR = 4
    const val REDIRECT = 5
}
