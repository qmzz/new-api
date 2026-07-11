package common

import (
	"sync"
	"time"
)

type InMemoryRateLimiter struct {
	store              map[string]*[]int64
	mutex              sync.Mutex
	expirationDuration time.Duration
}

func (l *InMemoryRateLimiter) Init(expirationDuration time.Duration) {
	if l.store == nil {
		l.mutex.Lock()
		if l.store == nil {
			l.store = make(map[string]*[]int64)
			l.expirationDuration = expirationDuration
			if expirationDuration > 0 {
				go l.clearExpiredItems()
			}
		}
		l.mutex.Unlock()
	}
}

func (l *InMemoryRateLimiter) clearExpiredItems() {
	for {
		time.Sleep(l.expirationDuration)
		l.mutex.Lock()
		now := time.Now().Unix()
		for key := range l.store {
			queue := l.store[key]
			size := len(*queue)
			if size == 0 || now-(*queue)[size-1] > int64(l.expirationDuration.Seconds()) {
				delete(l.store, key)
			}
		}
		l.mutex.Unlock()
	}
}

// Request parameter duration's unit is seconds
func (l *InMemoryRateLimiter) Request(key string, maxRequestNum int, duration int64) bool {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	// [old <-- new]
	queue, ok := l.store[key]
	now := time.Now().Unix()
	if ok {
		if len(*queue) < maxRequestNum {
			*queue = append(*queue, now)
			return true
		} else {
			if now-(*queue)[0] >= duration {
				*queue = (*queue)[1:]
				*queue = append(*queue, now)
				return true
			} else {
				return false
			}
		}
	} else {
		s := make([]int64, 0, maxRequestNum)
		l.store[key] = &s
		*(l.store[key]) = append(*(l.store[key]), now)
	}
	return true
}

// Check reports whether a request would fit in the current sliding window
// without mutating the limiter state.
func (l *InMemoryRateLimiter) Check(key string, maxRequestNum int, duration int64) bool {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	if maxRequestNum <= 0 {
		return true
	}

	queue, ok := l.store[key]
	if !ok || len(*queue) < maxRequestNum {
		return true
	}

	now := time.Now().Unix()
	return now-(*queue)[0] >= duration
}

// Snapshot returns the number of events still inside the sliding window and
// the Unix timestamp when the oldest event expires. It does not record a
// request or extend the window.
func (l *InMemoryRateLimiter) Snapshot(key string, duration int64) (count int, resetAt int64) {
	l.mutex.Lock()
	defer l.mutex.Unlock()

	queue, ok := l.store[key]
	if !ok || duration <= 0 {
		return 0, 0
	}

	now := time.Now().Unix()
	firstValid := 0
	for firstValid < len(*queue) && now-(*queue)[firstValid] >= duration {
		firstValid++
	}
	if firstValid > 0 {
		*queue = append((*queue)[:0], (*queue)[firstValid:]...)
	}
	if len(*queue) == 0 {
		delete(l.store, key)
		return 0, 0
	}

	return len(*queue), (*queue)[0] + duration
}
