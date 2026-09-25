package com.devson.nosvedplayerkmp.player.mpv

import com.devson.nosvedplayerkmp.player.core.createPlatformPlayer
import com.devson.nosvedplayerkmp.player.model.PlaybackState
import com.devson.nosvedplayerkmp.player.mpv.native.MpvLibraryLoader
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class MpvPhase0Test {

    @Test
    fun testLibMpvLoadedSuccessfully() {
        val native = MpvLibraryLoader.load()
        assertNotNull(native, "LibMpvNative should be loaded")

        val apiVersion = native.mpv_client_api_version()
        println("libmpv loaded successfully! API Version: 0x${apiVersion.toString(16)} ($apiVersion)")
        assertTrue(apiVersion > 0, "API version should be greater than 0")
    }

    @Test
    fun testMpvInstanceCreationAndInitialization() {
        val instance = MpvInstance.createAndInitialize()
        println("mpv instance created and initialized successfully! State: ${instance.state}")
        assertEquals(MpvState.INITIALIZED, instance.state)
        assertTrue(instance.isInitialized)

        instance.terminateAndDestroy()
        assertEquals(MpvState.TERMINATED, instance.state)
        println("mpv instance terminated cleanly")
    }

    @Test
    fun testMpvPropertiesGetAndSet() {
        val instance = MpvInstance.createAndInitialize()
        try {
            // Test volume
            MpvProperties.setDouble(instance, MpvProperties.VOLUME, 75.0).getOrThrow()
            val volume = MpvProperties.getDouble(instance, MpvProperties.VOLUME).getOrThrow()
            assertEquals(75.0, volume, 0.01)

            // Test speed
            MpvProperties.setDouble(instance, MpvProperties.SPEED, 1.25).getOrThrow()
            val speed = MpvProperties.getDouble(instance, MpvProperties.SPEED).getOrThrow()
            assertEquals(1.25, speed, 0.01)

            // Test pause flag
            MpvProperties.setBoolean(instance, MpvProperties.PAUSE, true).getOrThrow()
            val isPaused = MpvProperties.getBoolean(instance, MpvProperties.PAUSE).getOrThrow()
            assertTrue(isPaused)
            println("Basic property get/set communication verified successfully")
        } finally {
            instance.terminateAndDestroy()
        }
    }

    @Test
    fun testMpvCommandsExecution() {
        val instance = MpvInstance.createAndInitialize()
        try {
            // Test pause/play command helpers
            MpvCommands.pause(instance).getOrThrow()
            val isPaused = MpvProperties.getBoolean(instance, MpvProperties.PAUSE).getOrThrow()
            assertTrue(isPaused)

            MpvCommands.play(instance).getOrThrow()
            val isUnpaused = MpvProperties.getBoolean(instance, MpvProperties.PAUSE).getOrThrow()
            assertTrue(!isUnpaused)
            println("MpvCommands execution verified successfully")
        } finally {
            instance.terminateAndDestroy()
        }
    }

    @Test
    fun testPlayerLifecycleAndRelease() = runTest {
        val player = createPlatformPlayer()
        assertEquals(PlaybackState.IDLE, player.playbackState.first())

        player.initialize()
        println("Player initialized via common Player interface")

        player.setVolume(80f)
        assertEquals(80f, player.volume.first())

        player.setPlaybackSpeed(1.5f)
        assertEquals(1.5f, player.playbackSpeed.first())

        player.release()
        println("Player released cleanly via common Player interface")
    }
}
