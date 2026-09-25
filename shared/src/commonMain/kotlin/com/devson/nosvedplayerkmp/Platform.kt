package com.devson.nosvedplayerkmp

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform