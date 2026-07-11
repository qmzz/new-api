package common

import (
	"testing"
	"time"
)

func TestInMemoryRateLimiterSnapshot(t *testing.T) {
	limiter := InMemoryRateLimiter{
		store: map[string]*[]int64{},
	}
	now := time.Now().Unix()
	events := []int64{now - 11, now - 5, now - 1}
	limiter.store["user"] = &events

	count, resetAt := limiter.Snapshot("user", 10)
	if count != 2 {
		t.Fatalf("expected 2 active events, got %d", count)
	}
	if resetAt != events[0]+10 {
		t.Fatalf("expected reset at %d, got %d", events[0]+10, resetAt)
	}
	if got := len(*limiter.store["user"]); got != 2 {
		t.Fatalf("expected expired event to be pruned, got %d events", got)
	}
}

func TestInMemoryRateLimiterSnapshotEmpty(t *testing.T) {
	limiter := InMemoryRateLimiter{
		store: map[string]*[]int64{},
	}
	events := []int64{time.Now().Unix() - 20}
	limiter.store["user"] = &events

	count, resetAt := limiter.Snapshot("user", 10)
	if count != 0 || resetAt != 0 {
		t.Fatalf("expected empty snapshot, got count=%d resetAt=%d", count, resetAt)
	}
	if _, ok := limiter.store["user"]; ok {
		t.Fatal("expected empty key to be removed")
	}
}

func TestInMemoryRateLimiterSnapshotMissingKey(t *testing.T) {
	limiter := InMemoryRateLimiter{store: map[string]*[]int64{}}
	count, resetAt := limiter.Snapshot("missing", 10)
	if count != 0 || resetAt != 0 {
		t.Fatalf("expected zero snapshot, got count=%d resetAt=%d", count, resetAt)
	}
}
