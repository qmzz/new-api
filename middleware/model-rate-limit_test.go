package middleware

import "testing"

func TestBuildRateLimitMetric(t *testing.T) {
	tests := []struct {
		name      string
		used      int
		limit     int
		remaining int
	}{
		{name: "below limit", used: 3, limit: 10, remaining: 7},
		{name: "at limit", used: 10, limit: 10, remaining: 0},
		{name: "over limit", used: 12, limit: 10, remaining: 0},
		{name: "unlimited", used: 0, limit: 0, remaining: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			metric := buildRateLimitMetric(tt.used, tt.limit, 123)
			if metric.Used != tt.used || metric.Limit != tt.limit {
				t.Fatalf("unexpected metric: %+v", metric)
			}
			if metric.Remaining != tt.remaining {
				t.Fatalf("expected remaining %d, got %d", tt.remaining, metric.Remaining)
			}
			if metric.ResetAt != 123 {
				t.Fatalf("expected reset timestamp to be preserved, got %d", metric.ResetAt)
			}
		})
	}
}
