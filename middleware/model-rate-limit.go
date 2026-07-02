package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

const (
	ModelRequestRateLimitCountMark        = "MRRL"
	ModelRequestRateLimitSuccessCountMark = "MRRLS"
	AccountFiveHourRateLimitMark          = "5H"
	AccountWeeklyRateLimitMark            = "1W"
)

// Dedicated in-memory limiters for the long windows so their cleanup
// expiration matches the window size instead of the shared limiter's.
var accountFiveHourRateLimiter common.InMemoryRateLimiter
var accountWeeklyRateLimiter common.InMemoryRateLimiter

const redisTotalWindowScript = `
local now = redis.call('TIME')
local nowMs = tonumber(now[1]) * 1000 + math.floor(tonumber(now[2]) / 1000)

for i = 1, #KEYS do
    local maxCount = tonumber(ARGV[(i - 1) * 2 + 1])
    local durationSeconds = tonumber(ARGV[(i - 1) * 2 + 2])
    if maxCount > 0 and durationSeconds > 0 then
        local cutoff = nowMs - durationSeconds * 1000
        redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', cutoff)
        if redis.call('ZCARD', KEYS[i]) >= maxCount then
            redis.call('EXPIRE', KEYS[i], durationSeconds)
            return i
        end
    end
end

for i = 1, #KEYS do
    local maxCount = tonumber(ARGV[(i - 1) * 2 + 1])
    local durationSeconds = tonumber(ARGV[(i - 1) * 2 + 2])
    if maxCount > 0 and durationSeconds > 0 then
        local seqKey = KEYS[i] .. ':seq'
        local seq = redis.call('INCR', seqKey)
        redis.call('ZADD', KEYS[i], nowMs, tostring(nowMs) .. '-' .. tostring(seq))
        redis.call('EXPIRE', KEYS[i], durationSeconds)
        redis.call('EXPIRE', seqKey, durationSeconds)
    end
end

return 0
`

// rateLimitWindow describes one rate-limit window to check and record.
type rateLimitWindow struct {
	durationSeconds   int64
	durationMinutes   int
	totalMaxCount     int
	successMaxCount   int
	redisTotalKey     string // sliding-window zset key
	redisSuccessKey   string // sliding-window list key
	memTotalKey       string
	memSuccessKey     string
	memLimiter        *common.InMemoryRateLimiter
	successBlockedMsg string
	totalBlockedMsg   string
}

// 检查Redis中的请求限制
func checkRedisRateLimit(ctx context.Context, rdb *redis.Client, key string, maxCount int, durationSeconds int64) (bool, error) {
	// 如果maxCount为0，表示不限制
	if maxCount == 0 {
		return true, nil
	}

	// 获取当前计数
	length, err := rdb.LLen(ctx, key).Result()
	if err != nil {
		return false, err
	}

	// 如果未达到限制，允许请求
	if length < int64(maxCount) {
		return true, nil
	}

	// 检查时间窗口
	oldTimeStr, _ := rdb.LIndex(ctx, key, -1).Result()
	oldTime, err := time.Parse(timeFormat, oldTimeStr)
	if err != nil {
		return false, err
	}

	nowTimeStr := time.Now().Format(timeFormat)
	nowTime, err := time.Parse(timeFormat, nowTimeStr)
	if err != nil {
		return false, err
	}
	// 如果在时间窗口内已达到限制，拒绝请求
	subTime := nowTime.Sub(oldTime).Seconds()
	if int64(subTime) < durationSeconds {
		rdb.Expire(ctx, key, time.Duration(durationSeconds)*time.Second)
		return false, nil
	}

	return true, nil
}

// 记录Redis请求
func recordRedisRequest(ctx context.Context, rdb *redis.Client, key string, maxCount int, durationSeconds int64) {
	// 如果maxCount为0，不记录请求
	if maxCount == 0 {
		return
	}

	now := time.Now().Format(timeFormat)
	rdb.LPush(ctx, key, now)
	rdb.LTrim(ctx, key, 0, int64(maxCount-1))
	rdb.Expire(ctx, key, time.Duration(durationSeconds)*time.Second)
}

// checkRedisWindow checks the success limit for a window.
func checkRedisWindow(ctx context.Context, rdb *redis.Client, w rateLimitWindow) (bool, string, error) {
	// 1. 检查成功请求数限制
	allowed, err := checkRedisRateLimit(ctx, rdb, w.redisSuccessKey, w.successMaxCount, w.durationSeconds)
	if err != nil {
		return false, "", err
	}
	if !allowed {
		return false, w.successBlockedMsg, nil
	}

	return true, "", nil
}

// checkAndRecordRedisTotalWindows atomically checks all total-request windows
// and records the request in all of them only when every window allows it.
func checkAndRecordRedisTotalWindows(ctx context.Context, rdb *redis.Client, windows []rateLimitWindow) (bool, string, error) {
	keys := make([]string, 0, len(windows))
	args := make([]interface{}, 0, len(windows)*2)
	blockedMessages := make([]string, 0, len(windows))

	for _, w := range windows {
		if w.totalMaxCount <= 0 || w.durationSeconds <= 0 {
			continue
		}
		keys = append(keys, w.redisTotalKey)
		args = append(args, w.totalMaxCount, w.durationSeconds)
		blockedMessages = append(blockedMessages, w.totalBlockedMsg)
	}

	if len(keys) == 0 {
		return true, "", nil
	}

	blockedIndex, err := rdb.Eval(ctx, redisTotalWindowScript, keys, args...).Int()
	if err != nil {
		return false, "", err
	}
	if blockedIndex > 0 && blockedIndex <= len(blockedMessages) {
		return false, blockedMessages[blockedIndex-1], nil
	}

	return true, "", nil
}

// recordRedisSuccess records a successful request for a window.
func recordRedisSuccess(ctx context.Context, rdb *redis.Client, w rateLimitWindow) {
	recordRedisRequest(ctx, rdb, w.redisSuccessKey, w.successMaxCount, w.durationSeconds)
}

// checkAndRecordMemoryTotal atomically checks and records a total request for
// a window. Returns (allowed, blockedMsg). Using Request instead of a separate
// Check+Record avoids a TOCTOU race under concurrent load.
func checkAndRecordMemoryTotal(w rateLimitWindow) (bool, string) {
	w.memLimiter.Init(time.Duration(w.durationMinutes) * time.Minute)

	if w.totalMaxCount > 0 && !w.memLimiter.Request(w.memTotalKey, w.totalMaxCount, w.durationSeconds) {
		return false, w.totalBlockedMsg
	}
	return true, ""
}

// checkMemorySuccess checks the success limit for a window without recording.
func checkMemorySuccess(w rateLimitWindow) (bool, string) {
	w.memLimiter.Init(time.Duration(w.durationMinutes) * time.Minute)

	if w.successMaxCount > 0 && !w.memLimiter.Check(w.memSuccessKey, w.successMaxCount, w.durationSeconds) {
		return false, w.successBlockedMsg
	}
	return true, ""
}

// recordMemorySuccess records a successful request for a window in memory.
func recordMemorySuccess(w rateLimitWindow) {
	if w.successMaxCount > 0 {
		w.memLimiter.Request(w.memSuccessKey, w.successMaxCount, w.durationSeconds)
	}
}

// buildRateLimitWindows assembles the enabled rate-limit windows for a request.
func buildRateLimitWindows(userId, group string) []rateLimitWindow {
	var windows []rateLimitWindow

	// 分钟窗口
	if setting.ModelRequestRateLimitEnabled {
		totalMaxCount := setting.ModelRequestRateLimitCount
		successMaxCount := setting.ModelRequestRateLimitSuccessCount
		if gt, gs, found := setting.GetGroupRateLimit(group); found {
			totalMaxCount = gt
			successMaxCount = gs
		}
		windows = append(windows, rateLimitWindow{
			durationSeconds: int64(setting.ModelRequestRateLimitDurationMinutes * 60),
			durationMinutes: setting.ModelRequestRateLimitDurationMinutes,
			totalMaxCount:   totalMaxCount,
			successMaxCount: successMaxCount,
			redisTotalKey:   fmt.Sprintf("rateLimit:%s:%s", ModelRequestRateLimitCountMark, userId),
			redisSuccessKey: fmt.Sprintf("rateLimit:%s:%s", ModelRequestRateLimitSuccessCountMark, userId),
			memTotalKey:     ModelRequestRateLimitCountMark + userId,
			memSuccessKey:   ModelRequestRateLimitSuccessCountMark + userId,
			memLimiter:      &inMemoryRateLimiter,
			successBlockedMsg: fmt.Sprintf("您已达到请求数限制：%d分钟内最多请求%d次",
				setting.ModelRequestRateLimitDurationMinutes, successMaxCount),
			totalBlockedMsg: fmt.Sprintf("您已达到总请求数限制：%d分钟内最多请求%d次，包括失败次数，请检查您的请求是否正确",
				setting.ModelRequestRateLimitDurationMinutes, totalMaxCount),
		})
	}

	// 5小时窗口
	if setting.AccountFiveHourRateLimitEnabled {
		totalMaxCount := setting.AccountFiveHourRateLimitCount
		successMaxCount := setting.AccountFiveHourRateLimitSuccessCount
		if gt, gs, found := setting.GetAccountFiveHourRateLimitGroup(group); found {
			totalMaxCount = gt
			successMaxCount = gs
		}
		windows = append(windows, rateLimitWindow{
			durationSeconds: 5 * 60 * 60,
			durationMinutes: 300,
			totalMaxCount:   totalMaxCount,
			successMaxCount: successMaxCount,
			redisTotalKey:   fmt.Sprintf("rateLimit:%s:%s:%s", AccountFiveHourRateLimitMark, "T", userId),
			redisSuccessKey: fmt.Sprintf("rateLimit:%s:%s:%s", AccountFiveHourRateLimitMark, "S", userId),
			memTotalKey:     AccountFiveHourRateLimitMark + userId,
			memSuccessKey:   AccountFiveHourRateLimitMark + "S" + userId,
			memLimiter:      &accountFiveHourRateLimiter,
			successBlockedMsg: fmt.Sprintf("您已达到5小时请求数限制：5小时内最多请求%d次", successMaxCount),
			totalBlockedMsg:   fmt.Sprintf("您已达到5小时总请求数限制：5小时内最多请求%d次，包括失败次数，请检查您的请求是否正确", totalMaxCount),
		})
	}

	// 周窗口（7天）
	if setting.AccountWeeklyRateLimitEnabled {
		totalMaxCount := setting.AccountWeeklyRateLimitCount
		successMaxCount := setting.AccountWeeklyRateLimitSuccessCount
		if gt, gs, found := setting.GetAccountWeeklyRateLimitGroup(group); found {
			totalMaxCount = gt
			successMaxCount = gs
		}
		windows = append(windows, rateLimitWindow{
			durationSeconds: 7 * 24 * 60 * 60,
			durationMinutes: 7 * 24 * 60,
			totalMaxCount:   totalMaxCount,
			successMaxCount: successMaxCount,
			redisTotalKey:   fmt.Sprintf("rateLimit:%s:%s:%s", AccountWeeklyRateLimitMark, "T", userId),
			redisSuccessKey: fmt.Sprintf("rateLimit:%s:%s:%s", AccountWeeklyRateLimitMark, "S", userId),
			memTotalKey:     AccountWeeklyRateLimitMark + userId,
			memSuccessKey:   AccountWeeklyRateLimitMark + "S" + userId,
			memLimiter:      &accountWeeklyRateLimiter,
			successBlockedMsg: fmt.Sprintf("您已达到周请求数限制：7天内最多请求%d次", successMaxCount),
			totalBlockedMsg:   fmt.Sprintf("您已达到周总请求数限制：7天内最多请求%d次，包括失败次数，请检查您的请求是否正确", totalMaxCount),
		})
	}

	return windows
}

// ModelRequestRateLimit 模型请求限流中间件
func ModelRequestRateLimit() func(c *gin.Context) {
	return func(c *gin.Context) {
		userId := strconv.Itoa(c.GetInt("id"))

		// 获取分组
		group := common.GetContextKeyString(c, constant.ContextKeyTokenGroup)
		if group == "" {
			group = common.GetContextKeyString(c, constant.ContextKeyUserGroup)
		}

		windows := buildRateLimitWindows(userId, group)
		if len(windows) == 0 {
			c.Next()
			return
		}

		ctx := context.Background()

		if common.RedisEnabled {
			rdb := common.RDB
			// 检查所有启用窗口
			for _, w := range windows {
				allowed, msg, err := checkRedisWindow(ctx, rdb, w)
				if err != nil {
					fmt.Println("检查请求限制失败:", err.Error())
					abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate_limit_check_failed")
					return
				}
				if !allowed {
					abortWithOpenAiMessage(c, http.StatusTooManyRequests, msg)
					return
				}
			}
			allowed, msg, err := checkAndRecordRedisTotalWindows(ctx, rdb, windows)
			if err != nil {
				fmt.Println("检查总请求限制失败:", err.Error())
				abortWithOpenAiMessage(c, http.StatusInternalServerError, "rate_limit_check_failed")
				return
			}
			if !allowed {
				abortWithOpenAiMessage(c, http.StatusTooManyRequests, msg)
				return
			}

			// 处理请求
			c.Next()

			// 如果请求成功，记录成功请求
			if c.Writer.Status() < 400 {
				for _, w := range windows {
					recordRedisSuccess(ctx, rdb, w)
				}
			}
		} else {
			// 检查成功请求限制（只读检查，成功后才记录）
			for _, w := range windows {
				allowed, msg := checkMemorySuccess(w)
				if !allowed {
					abortWithOpenAiMessage(c, http.StatusTooManyRequests, msg)
					return
				}
			}
			// 原子检查+记录总请求数
			for _, w := range windows {
				allowed, msg := checkAndRecordMemoryTotal(w)
				if !allowed {
					abortWithOpenAiMessage(c, http.StatusTooManyRequests, msg)
					return
				}
			}

			// 处理请求
			c.Next()

			// 如果请求成功，记录成功请求
			if c.Writer.Status() < 400 {
				for _, w := range windows {
					recordMemorySuccess(w)
				}
			}
		}
	}
}
