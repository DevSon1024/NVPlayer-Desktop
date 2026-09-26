package com.devson.nosvedplayerkmp.repository

import kotlinx.coroutines.flow.StateFlow

/**
 * Repository interface governing starred/favorite media items.
 */
interface FavoritesRepository {
    val favoritePaths: StateFlow<Set<String>>

    suspend fun toggleFavorite(mediaPath: String): Boolean
    suspend fun isFavorite(mediaPath: String): Boolean
    suspend fun clearFavorites()
}
