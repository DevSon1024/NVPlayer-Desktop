package com.devson.nosvedplayerkmp.queue

import com.devson.nosvedplayerkmp.media.model.MediaFile
import com.devson.nosvedplayerkmp.queue.model.PlaybackMode
import com.devson.nosvedplayerkmp.queue.model.QueueItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Manages the transient playback queue and sequence navigation.
 *
 * Implements queue modification, reordering, index tracking, and playback modes
 * (Sequential, Repeat One, Repeat All, Shuffle).
 */
class PlaybackQueueManager {

    private val _queue = MutableStateFlow<List<QueueItem>>(emptyList())
    val queue: StateFlow<List<QueueItem>> = _queue.asStateFlow()

    private val _currentIndex = MutableStateFlow(-1)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    private val _playbackMode = MutableStateFlow(PlaybackMode.SEQUENTIAL)
    val playbackMode: StateFlow<PlaybackMode> = _playbackMode.asStateFlow()

    private val _currentItem = MutableStateFlow<QueueItem?>(null)
    val currentItem: StateFlow<QueueItem?> = _currentItem.asStateFlow()

    private var shuffleOrder: List<Int> = emptyList()

    private fun generateId(): String =
        "${System.currentTimeMillis()}-${(1000..9999).random()}"

    private fun updateCurrentItem() {
        val q = _queue.value
        val idx = _currentIndex.value
        _currentItem.value = if (idx in q.indices) q[idx] else null
    }

    fun setPlaybackMode(mode: PlaybackMode) {
        _playbackMode.value = mode
        if (mode == PlaybackMode.SHUFFLE) {
            rebuildShuffleOrder()
        }
    }

    fun togglePlaybackMode() {
        val nextMode = when (_playbackMode.value) {
            PlaybackMode.SEQUENTIAL -> PlaybackMode.REPEAT_ALL
            PlaybackMode.REPEAT_ALL -> PlaybackMode.REPEAT_ONE
            PlaybackMode.REPEAT_ONE -> PlaybackMode.SHUFFLE
            PlaybackMode.SHUFFLE -> PlaybackMode.SEQUENTIAL
        }
        setPlaybackMode(nextMode)
    }

    private fun rebuildShuffleOrder() {
        val size = _queue.value.size
        if (size > 0) {
            val list = (0 until size).toMutableList()
            list.shuffle()
            val current = _currentIndex.value
            if (current in list.indices) {
                list.remove(current)
                list.add(0, current)
            }
            shuffleOrder = list
        } else {
            shuffleOrder = emptyList()
        }
    }

    fun setQueue(items: List<MediaFile>, startIndex: Int = 0): QueueItem? {
        val queueItems = items.map { QueueItem(id = generateId(), media = it) }
        _queue.value = queueItems
        _currentIndex.value = if (queueItems.isNotEmpty()) startIndex.coerceIn(queueItems.indices) else -1
        if (_playbackMode.value == PlaybackMode.SHUFFLE) {
            rebuildShuffleOrder()
        }
        updateCurrentItem()
        return _currentItem.value
    }

    fun addToQueue(media: MediaFile): QueueItem {
        val item = QueueItem(id = generateId(), media = media)
        _queue.update { it + item }
        if (_currentIndex.value == -1) {
            _currentIndex.value = 0
        }
        if (_playbackMode.value == PlaybackMode.SHUFFLE) {
            rebuildShuffleOrder()
        }
        updateCurrentItem()
        return item
    }

    fun addAllToQueue(mediaList: List<MediaFile>) {
        val items = mediaList.map { QueueItem(id = generateId(), media = it) }
        _queue.update { it + items }
        if (_currentIndex.value == -1 && items.isNotEmpty()) {
            _currentIndex.value = 0
        }
        if (_playbackMode.value == PlaybackMode.SHUFFLE) {
            rebuildShuffleOrder()
        }
        updateCurrentItem()
    }

    fun playNext(media: MediaFile): QueueItem {
        val item = QueueItem(id = generateId(), media = media)
        val currentIdx = _currentIndex.value
        _queue.update { current ->
            val mutable = current.toMutableList()
            if (currentIdx in mutable.indices) {
                mutable.add(currentIdx + 1, item)
            } else {
                mutable.add(item)
            }
            mutable
        }
        if (_currentIndex.value == -1) {
            _currentIndex.value = 0
        }
        updateCurrentItem()
        return item
    }

    fun removeAt(index: Int) {
        val current = _currentIndex.value
        val list = _queue.value.toMutableList()
        if (index in list.indices) {
            list.removeAt(index)
            _queue.value = list
            if (current == index) {
                _currentIndex.value = if (list.isEmpty()) -1 else current.coerceAtMost(list.size - 1)
            } else if (current > index) {
                _currentIndex.value = current - 1
            }
            if (_playbackMode.value == PlaybackMode.SHUFFLE) {
                rebuildShuffleOrder()
            }
            updateCurrentItem()
        }
    }

    fun moveItem(fromIndex: Int, toIndex: Int) {
        val list = _queue.value.toMutableList()
        if (fromIndex in list.indices && toIndex in list.indices && fromIndex != toIndex) {
            val item = list.removeAt(fromIndex)
            list.add(toIndex, item)
            _queue.value = list

            val current = _currentIndex.value
            if (current == fromIndex) {
                _currentIndex.value = toIndex
            } else if (fromIndex < current && toIndex >= current) {
                _currentIndex.value = current - 1
            } else if (fromIndex > current && toIndex <= current) {
                _currentIndex.value = current + 1
            }
            updateCurrentItem()
        }
    }

    fun playIndex(index: Int): QueueItem? {
        if (index in _queue.value.indices) {
            _currentIndex.value = index
            updateCurrentItem()
            return _currentItem.value
        }
        return null
    }

    fun getNextItem(): QueueItem? {
        val q = _queue.value
        if (q.isEmpty()) return null
        val current = _currentIndex.value

        val nextIndex = when (_playbackMode.value) {
            PlaybackMode.REPEAT_ONE -> current.takeIf { it in q.indices } ?: 0
            PlaybackMode.REPEAT_ALL -> if (current + 1 < q.size) current + 1 else 0
            PlaybackMode.SEQUENTIAL -> if (current + 1 < q.size) current + 1 else -1
            PlaybackMode.SHUFFLE -> {
                if (shuffleOrder.size != q.size) rebuildShuffleOrder()
                val currentShufflePos = shuffleOrder.indexOf(current)
                if (currentShufflePos != -1 && currentShufflePos + 1 < shuffleOrder.size) {
                    shuffleOrder[currentShufflePos + 1]
                } else if (_playbackMode.value == PlaybackMode.REPEAT_ALL) {
                    rebuildShuffleOrder()
                    shuffleOrder.firstOrNull() ?: 0
                } else {
                    -1
                }
            }
        }

        if (nextIndex in q.indices) {
            _currentIndex.value = nextIndex
            updateCurrentItem()
            return _currentItem.value
        }
        return null
    }

    fun getPreviousItem(): QueueItem? {
        val q = _queue.value
        if (q.isEmpty()) return null
        val current = _currentIndex.value

        val prevIndex = when (_playbackMode.value) {
            PlaybackMode.REPEAT_ONE -> current.takeIf { it in q.indices } ?: 0
            PlaybackMode.REPEAT_ALL -> if (current - 1 >= 0) current - 1 else q.size - 1
            PlaybackMode.SEQUENTIAL -> if (current - 1 >= 0) current - 1 else -1
            PlaybackMode.SHUFFLE -> {
                if (shuffleOrder.size != q.size) rebuildShuffleOrder()
                val currentShufflePos = shuffleOrder.indexOf(current)
                if (currentShufflePos > 0) {
                    shuffleOrder[currentShufflePos - 1]
                } else {
                    shuffleOrder.lastOrNull() ?: 0
                }
            }
        }

        if (prevIndex in q.indices) {
            _currentIndex.value = prevIndex
            updateCurrentItem()
            return _currentItem.value
        }
        return null
    }

    fun clear() {
        _queue.value = emptyList()
        _currentIndex.value = -1
        _currentItem.value = null
        shuffleOrder = emptyList()
    }
}
