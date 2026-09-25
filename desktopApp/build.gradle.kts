import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    alias(libs.plugins.kotlinJvm)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
}

dependencies {
    implementation(project(":shared"))

    implementation(compose.desktop.currentOs)
    implementation(libs.kotlinx.coroutinesSwing)

    implementation(libs.compose.uiToolingPreview)
}

compose.desktop {
    application {
        mainClass = "com.devson.nosvedplayerkmp.MainKt"
        val nativeMpvDir = rootProject.file("native/mpv/windows/x64")
        if (nativeMpvDir.exists()) {
            jvmArgs += listOf("-Djna.library.path=${nativeMpvDir.absolutePath}")
        }

        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "com.devson.nosvedplayerkmp"
            packageVersion = "1.0.0"
        }
    }
}