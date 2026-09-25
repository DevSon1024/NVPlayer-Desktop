package com.devson.nosvedplayerkmp.player.mpv.native

import com.devson.nosvedplayerkmp.player.model.PlayerError
import com.devson.nosvedplayerkmp.player.model.PlayerException
import com.sun.jna.Native
import com.sun.jna.NativeLibrary
import java.io.File

/**
 * Handles discovery, architecture validation, and loading of libmpv-2.dll.
 */
internal object MpvLibraryLoader {
    private const val DLL_NAME = "libmpv-2.dll"
    private const val LIB_NAME = "mpv-2"
    private const val RELATIVE_NATIVE_PATH = "native/mpv/windows/x64/$DLL_NAME"

    @Volatile
    private var loadedInstance: LibMpvNative? = null

    private val lock = Any()

    /**
     * Finds and loads the libmpv native library.
     *
     * @return [LibMpvNative] instance bound to the loaded library.
     * @throws PlayerException if architecture is incompatible, library is missing, or linking fails.
     */
    fun load(): LibMpvNative {
        loadedInstance?.let { return it }

        synchronized(lock) {
            loadedInstance?.let { return it }

            validatePlatform()

            val dllFile = resolveDllFile()
            val loadOptions = mapOf(com.sun.jna.Library.OPTION_STRING_ENCODING to "UTF-8")
            val nativeLib = try {
                if (dllFile != null && dllFile.exists()) {
                    val parentDir = dllFile.parentFile.absolutePath
                    NativeLibrary.addSearchPath(LIB_NAME, parentDir)
                    Native.load(dllFile.absolutePath, LibMpvNative::class.java, loadOptions)
                } else {
                    // Fall back to default JNA search path
                    Native.load(LIB_NAME, LibMpvNative::class.java, loadOptions)
                }
            } catch (e: UnsatisfiedLinkError) {
                val searched = collectSearchPaths().map { it.absolutePath }
                val error = PlayerError.LibraryNotFound(
                    message = "Failed to load $DLL_NAME: ${e.message}",
                    searchedPaths = searched,
                    cause = e
                )
                throw PlayerException(error)
            } catch (e: Exception) {
                val error = PlayerError.LibraryNotFound(
                    message = "Unexpected error loading $DLL_NAME: ${e.message}",
                    searchedPaths = collectSearchPaths().map { it.absolutePath },
                    cause = e
                )
                throw PlayerException(error)
            }

            loadedInstance = nativeLib
            return nativeLib
        }
    }

    /**
     * Loads the render.h native library bindings.
     */
    fun loadRenderNative(): com.devson.nosvedplayerkmp.player.mpv.render.LibMpvRenderNative {
        val dllFile = resolveDllFile()
        val loadOptions = mapOf(com.sun.jna.Library.OPTION_STRING_ENCODING to "UTF-8")
        val dllPath = dllFile?.absolutePath ?: LIB_NAME
        return Native.load(dllPath, com.devson.nosvedplayerkmp.player.mpv.render.LibMpvRenderNative::class.java, loadOptions)
    }


    /**
     * Validates that the current host OS is Windows and architecture is 64-bit (x64/amd64).
     */
    private fun validatePlatform() {
        val osName = System.getProperty("os.name") ?: ""
        val osArch = System.getProperty("os.arch") ?: ""

        val isWindows = osName.lowercase().contains("windows")
        val is64Bit = osArch == "amd64" || osArch == "x86_64" || osArch == "x64"

        if (!isWindows || !is64Bit) {
            val error = PlayerError.IncompatibleArchitecture(
                message = "libmpv Windows desktop player requires Windows x64. Detected: OS='$osName', Arch='$osArch'",
                detectedOs = osName,
                detectedArch = osArch
            )
            throw PlayerException(error)
        }
    }

    /**
     * Locates the libmpv-2.dll file across known candidate directories.
     */
    internal fun resolveDllFile(): File? {
        val candidatePaths = collectSearchPaths()
        for (candidate in candidatePaths) {
            if (candidate.exists() && candidate.isFile) {
                return candidate
            }
        }
        return null
    }

    /**
     * Collects all candidate locations where libmpv-2.dll might reside.
     */
    private fun collectSearchPaths(): List<File> {
        val paths = mutableListOf<File>()

        // 1. Explicit system property
        System.getProperty("nosved.mpv.path")?.let {
            val file = File(it)
            paths.add(if (file.isDirectory) File(file, DLL_NAME) else file)
        }

        // 2. Explicit jna.library.path
        System.getProperty("jna.library.path")?.let { property ->
            property.split(File.pathSeparator).forEach { dir ->
                paths.add(File(dir.trim(), DLL_NAME))
            }
        }

        // 3. Environment variable
        System.getenv("NOSVED_MPV_PATH")?.let {
            val file = File(it)
            paths.add(if (file.isDirectory) File(file, DLL_NAME) else file)
        }

        // 4. Compose Desktop application resources dir
        System.getProperty("compose.application.resources.dir")?.let {
            paths.add(File(it, DLL_NAME))
            paths.add(File(it, RELATIVE_NATIVE_PATH))
        }

        // 5. Development project root search (walk up from user.dir)
        var currentDir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        for (i in 0..6) {
            if (currentDir == null) break
            paths.add(File(currentDir, RELATIVE_NATIVE_PATH))
            paths.add(File(currentDir, DLL_NAME))
            currentDir = currentDir.parentFile
        }

        return paths.distinct()
    }
}
