package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.core.createPlatformPlayer
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.model.PlayerError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

class MpvPhase1Test {

    private val testMediaDir: File by lazy {
        var current: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        for (i in 0..5) {
            if (current == null) break
            val candidate = File(current, "test_media")
            if (candidate.exists() && candidate.isDirectory) {
                return@lazy candidate
            }
            current = current.parentFile
        }
        File("test_media").absoluteFile
    }

    private fun runRealTimeTest(block: suspend CoroutineScope.() -> Unit) =
        runBlocking(Dispatchers.Default, block)

    private suspend fun waitUntil(timeoutMs: Long = 5000, condition: suspend () -> Boolean): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return true
            delay(50)
        }
        return condition()
    }

    @Test
    fun testInitializationAndIdempotentRelease() = runRealTimeTest {
        val player = createPlatformPlayer()
        assertEquals(PlaybackState.IDLE, player.playbackState.value)

        player.initialize()
        assertEquals(PlaybackState.IDLE, player.playbackState.value)

        // Multiple calls to release must be safe and idempotent
        player.release()
        assertEquals(PlaybackState.IDLE, player.playbackState.value)
        player.release()
        assertEquals(PlaybackState.IDLE, player.playbackState.value)
    }

    @Test
    fun testLoadAndPlaybackLifecycleH264() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val file = File(testMediaDir, "test_h264.mp4")
            assertTrue(file.exists(), "Test file test_h264.mp4 should exist at ${file.absolutePath}")

            player.load(file.absolutePath, autoPlay = true)

            // Wait for media to start playing
            val reachedPlaying = waitUntil(5000) {
                player.playbackState.value == PlaybackState.PLAYING
            }
            assertTrue(reachedPlaying, "State should reach PLAYING, was ${player.playbackState.value}")

            // Wait for duration to be parsed
            val gotDuration = waitUntil(3000) {
                player.duration.value.inWholeMilliseconds > 0
            }
            assertTrue(gotDuration, "Duration should be positive, was ${player.duration.value}")

            player.stop()
            assertEquals(PlaybackState.STOPPED, player.playbackState.value)
            assertEquals(0.seconds, player.position.value)
        } finally {
            player.release()
        }
    }

    @Test
    fun testPauseResumeToggle() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val file = File(testMediaDir, "test_h264.mp4")
            player.load(file.absolutePath, autoPlay = true)

            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })

            // Test Pause
            player.pause()
            assertTrue(waitUntil(3000) { player.playbackState.value == PlaybackState.PAUSED })
            assertEquals(PlaybackState.PAUSED, player.playbackState.value)

            // Test Resume / Play
            player.play()
            assertTrue(waitUntil(3000) { player.playbackState.value == PlaybackState.PLAYING })
            assertEquals(PlaybackState.PLAYING, player.playbackState.value)

            // Test Toggle Pause
            player.togglePause()
            assertTrue(waitUntil(3000) { player.playbackState.value == PlaybackState.PAUSED })
            assertEquals(PlaybackState.PAUSED, player.playbackState.value)

            player.togglePause()
            assertTrue(waitUntil(3000) { player.playbackState.value == PlaybackState.PLAYING })
            assertEquals(PlaybackState.PLAYING, player.playbackState.value)
        } finally {
            player.release()
        }
    }

    @Test
    fun testSeekingAbsoluteAndRelative() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val file = File(testMediaDir, "test_with_audio.mp4") // 4-second video
            player.load(file.absolutePath, autoPlay = true)

            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })

            // Seek Absolute to 2 seconds
            player.seekTo(2.seconds)
            assertTrue(waitUntil(3000) { player.position.value.inWholeMilliseconds >= 1000 })

            // Seek Relative forward 1 second
            player.seekForward(1.0)
            delay(200)

            // Seek Relative backward 1 second
            player.seekBackward(1.0)
            delay(200)
        } finally {
            player.release()
        }
    }

    @Test
    fun testVolumeAndSpeedControls() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            player.setVolume(65f)
            assertTrue(waitUntil(2000) { player.volume.value == 65f })

            player.setVolume(120f) // should clamp to 100f
            assertTrue(waitUntil(2000) { player.volume.value == 100f })

            player.setVolume(-10f) // should clamp to 0f
            assertTrue(waitUntil(2000) { player.volume.value == 0f })

            player.setPlaybackSpeed(1.75f)
            assertTrue(waitUntil(2000) { player.playbackSpeed.value == 1.75f })

            player.setPlaybackSpeed(0.5f)
            assertTrue(waitUntil(2000) { player.playbackSpeed.value == 0.5f })
        } finally {
            player.release()
        }
    }

    @Test
    fun testSupportedFormatsMkvAviAndAudio() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            // Test MKV
            val mkvFile = File(testMediaDir, "test_mkv.mkv")
            assertTrue(mkvFile.exists())
            player.load(mkvFile.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })
            assertTrue(waitUntil(3000) { player.duration.value.inWholeMilliseconds > 0 })

            // Test AVI
            val aviFile = File(testMediaDir, "test_avi.avi")
            assertTrue(aviFile.exists())
            player.load(aviFile.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })
            assertTrue(waitUntil(3000) { player.duration.value.inWholeMilliseconds > 0 })
        } finally {
            player.release()
        }
    }

    @Test
    fun testUnicodeAndSpecialCharacterPath() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val unicodeFile = File(testMediaDir, "test_üñîçødé_日本語.mp4")
            assertTrue(unicodeFile.exists(), "Unicode test file should exist: ${unicodeFile.absolutePath}")

            player.load(unicodeFile.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })
            assertTrue(waitUntil(3000) { player.duration.value.inWholeMilliseconds > 0 })
            println("Successfully loaded and played Unicode path: ${unicodeFile.name}")
        } finally {
            player.release()
        }
    }

    @Test
    fun testSequentialLoadingWithoutRestart() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val file1 = File(testMediaDir, "test_h264.mp4")
            val file2 = File(testMediaDir, "test_mkv.mkv")

            // Load file 1
            player.load(file1.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })
            assertEquals(file1.absolutePath, player.currentMediaItem.value?.uri)

            // Load file 2 immediately without restarting player
            player.load(file2.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })
            assertEquals(file2.absolutePath, player.currentMediaItem.value?.uri)
            assertTrue(waitUntil(3000) { player.duration.value.inWholeMilliseconds > 0 })
            println("Sequential loading verified successfully")
        } finally {
            player.release()
        }
    }

    @Test
    fun testEndOfFileDetection() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            val file = File(testMediaDir, "test_h264.mp4")
            player.load(file.absolutePath, autoPlay = true)
            assertTrue(waitUntil(5000) { player.playbackState.value == PlaybackState.PLAYING })

            // Speed up playback to 4x to quickly reach end of file
            player.setPlaybackSpeed(4.0f)

            // Seek near the end
            player.seekTo(2.8.seconds)

            // Wait for ENDED state
            val reachedEnded = waitUntil(8000) {
                player.playbackState.value == PlaybackState.ENDED
            }
            assertTrue(reachedEnded, "Player should detect end of file, current state: ${player.playbackState.value}")
            println("End-of-file state successfully detected")
        } finally {
            player.release()
        }
    }

    @Test
    fun testCorruptAndNonExistentMediaErrorHandling() = runRealTimeTest {
        val player = createPlatformPlayer()
        player.initialize()

        try {
            // 1. Non-existent file
            var nonExistentCaught = false
            try {
                player.load("C:\\non_existent_folder_xyz\\no_such_file.mp4")
            } catch (e: Exception) {
                nonExistentCaught = true
            }
            assertTrue(nonExistentCaught, "Loading non-existent file should report failure")
            assertEquals(PlaybackState.ERROR, player.playbackState.value)

            // 2. Corrupt media file - player must not crash
            val corruptFile = File(testMediaDir, "corrupt_file.mp4")
            assertTrue(corruptFile.exists())

            val collectedErrors = mutableListOf<PlayerError>()
            val job = launch {
                player.errors.collect { collectedErrors.add(it) }
            }

            try {
                player.load(corruptFile.absolutePath, autoPlay = true)
            } catch (_: Exception) {}

            delay(600)
            job.cancel()

            // State should be ERROR or an error should be caught, but no JVM crash
            assertTrue(
                player.playbackState.value == PlaybackState.ERROR || collectedErrors.isNotEmpty(),
                "Corrupt file should transition player to ERROR or emit error"
            )
            println("Corrupt media error handling verified without crashing")
        } finally {
            player.release()
        }
    }
}
