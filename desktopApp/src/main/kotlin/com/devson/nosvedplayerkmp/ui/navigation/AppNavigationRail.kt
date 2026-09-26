package com.devson.nosvedplayerkmp.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Adaptive Material 3 Navigation Rail for desktop navigation.
 */
@Composable
fun AppNavigationRail(
    currentScreen: Screen,
    queueCount: Int,
    isMediaLoaded: Boolean,
    onNavigate: (Screen) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationRail(
        modifier = modifier
            .width(84.dp)
            .fillMaxHeight(),
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        header = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 16.dp, bottom = 12.dp)
            ) {
                // App Logo / Glyph
                Column(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "N",
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontWeight = FontWeight.Black,
                        fontSize = 20.sp
                    )
                }
            }
        }
    ) {
        val itemColors = NavigationRailItemDefaults.colors(
            selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
            selectedTextColor = MaterialTheme.colorScheme.primary,
            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
        )

        NavigationRailItem(
            selected = currentScreen is Screen.Home,
            onClick = { onNavigate(Screen.Home) },
            icon = { Icon(Icons.Rounded.Home, contentDescription = "Home") },
            label = { Text("Home", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        NavigationRailItem(
            selected = currentScreen is Screen.Library,
            onClick = { onNavigate(Screen.Library) },
            icon = { Icon(Icons.Rounded.VideoLibrary, contentDescription = "Library") },
            label = { Text("Library", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        NavigationRailItem(
            selected = currentScreen is Screen.Playlists || currentScreen is Screen.PlaylistDetail,
            onClick = { onNavigate(Screen.Playlists) },
            icon = { Icon(Icons.AutoMirrored.Rounded.PlaylistPlay, contentDescription = "Playlists") },
            label = { Text("Playlists", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        NavigationRailItem(
            selected = currentScreen is Screen.Queue,
            onClick = { onNavigate(Screen.Queue) },
            icon = {
                BadgedBox(
                    badge = {
                        if (queueCount > 0) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.secondary,
                                contentColor = MaterialTheme.colorScheme.onSecondary
                            ) {
                                Text(queueCount.toString(), fontSize = 10.sp)
                            }
                        }
                    }
                ) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = "Queue")
                }
            },
            label = { Text("Queue", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        NavigationRailItem(
            selected = currentScreen is Screen.History,
            onClick = { onNavigate(Screen.History) },
            icon = { Icon(Icons.Rounded.History, contentDescription = "History") },
            label = { Text("History", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        NavigationRailItem(
            selected = currentScreen is Screen.Favorites,
            onClick = { onNavigate(Screen.Favorites) },
            icon = { Icon(Icons.Rounded.Favorite, contentDescription = "Favorites") },
            label = { Text("Favorites", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors
        )

        if (isMediaLoaded) {
            NavigationRailItem(
                selected = currentScreen is Screen.Player,
                onClick = { onNavigate(Screen.Player) },
                icon = { Icon(Icons.Rounded.PlayCircle, contentDescription = "Now Playing") },
                label = { Text("Player", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
                colors = itemColors
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        NavigationRailItem(
            selected = currentScreen is Screen.Settings,
            onClick = { onNavigate(Screen.Settings) },
            icon = { Icon(Icons.Rounded.Settings, contentDescription = "Settings") },
            label = { Text("Settings", fontSize = 11.sp, fontWeight = FontWeight.Medium) },
            colors = itemColors,
            modifier = Modifier.padding(bottom = 12.dp)
        )
    }
}
