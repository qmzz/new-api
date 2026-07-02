package setting

import (
	"fmt"
	"math"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var ModelRequestRateLimitEnabled = false
var ModelRequestRateLimitDurationMinutes = 1
var ModelRequestRateLimitCount = 0
var ModelRequestRateLimitSuccessCount = 1000
var ModelRequestRateLimitGroup = map[string][2]int{}
var ModelRequestRateLimitMutex sync.RWMutex

// Account-level 5-hour window (300 minutes).
var AccountFiveHourRateLimitEnabled = false
var AccountFiveHourRateLimitCount = 0
var AccountFiveHourRateLimitSuccessCount = 0
var AccountFiveHourRateLimitGroup = map[string][2]int{}
var AccountFiveHourRateLimitMutex sync.RWMutex

// Account-level weekly window (7 days = 168 hours = 10080 minutes).
var AccountWeeklyRateLimitEnabled = false
var AccountWeeklyRateLimitCount = 0
var AccountWeeklyRateLimitSuccessCount = 0
var AccountWeeklyRateLimitGroup = map[string][2]int{}
var AccountWeeklyRateLimitMutex sync.RWMutex

// rateLimitGroup2JSONString serializes a rate-limit group map under its mutex.
func rateLimitGroup2JSONString(m map[string][2]int, mu *sync.RWMutex) string {
	mu.RLock()
	defer mu.RUnlock()

	jsonBytes, err := common.Marshal(m)
	if err != nil {
		common.SysLog("error marshalling rate limit group: " + err.Error())
	}
	return string(jsonBytes)
}

// updateRateLimitGroupByJSONString replaces a rate-limit group map from JSON.
func updateRateLimitGroupByJSONString(jsonStr string, m *map[string][2]int, mu *sync.RWMutex) error {
	mu.Lock()
	defer mu.Unlock()

	*m = make(map[string][2]int)
	return common.Unmarshal([]byte(jsonStr), m)
}

// getGroupRateLimit looks up a group's [total, success] limits.
func getGroupRateLimit(group string, m map[string][2]int, mu *sync.RWMutex) (totalCount, successCount int, found bool) {
	mu.RLock()
	defer mu.RUnlock()

	if m == nil {
		return 0, 0, false
	}

	limits, found := m[group]
	if !found {
		return 0, 0, false
	}
	return limits[0], limits[1], true
}

// checkRateLimitGroup validates a JSON rate-limit group map. total must be >= 0;
// success can be 0 only for windows that explicitly treat 0 as unlimited.
func checkRateLimitGroup(jsonStr string, allowSuccessZero bool) error {
	check := make(map[string][2]int)
	if err := common.Unmarshal([]byte(jsonStr), &check); err != nil {
		return err
	}
	minSuccess := 1
	if allowSuccessZero {
		minSuccess = 0
	}
	for group, limits := range check {
		if limits[0] < 0 || limits[1] < minSuccess {
			return fmt.Errorf("group %s has invalid rate limit values: [%d, %d]", group, limits[0], limits[1])
		}
		if limits[0] > math.MaxInt32 || limits[1] > math.MaxInt32 {
			return fmt.Errorf("group %s [%d, %d] has max rate limits value 2147483647", group, limits[0], limits[1])
		}
	}

	return nil
}

// --- Minute window (existing API, delegates to generic helpers) ---

func ModelRequestRateLimitGroup2JSONString() string {
	return rateLimitGroup2JSONString(ModelRequestRateLimitGroup, &ModelRequestRateLimitMutex)
}

func UpdateModelRequestRateLimitGroupByJSONString(jsonStr string) error {
	return updateRateLimitGroupByJSONString(jsonStr, &ModelRequestRateLimitGroup, &ModelRequestRateLimitMutex)
}

func GetGroupRateLimit(group string) (totalCount, successCount int, found bool) {
	return getGroupRateLimit(group, ModelRequestRateLimitGroup, &ModelRequestRateLimitMutex)
}

func CheckModelRequestRateLimitGroup(jsonStr string) error {
	return checkRateLimitGroup(jsonStr, false)
}

// --- 5-hour window ---

func AccountFiveHourRateLimitGroup2JSONString() string {
	return rateLimitGroup2JSONString(AccountFiveHourRateLimitGroup, &AccountFiveHourRateLimitMutex)
}

func UpdateAccountFiveHourRateLimitGroupByJSONString(jsonStr string) error {
	return updateRateLimitGroupByJSONString(jsonStr, &AccountFiveHourRateLimitGroup, &AccountFiveHourRateLimitMutex)
}

func GetAccountFiveHourRateLimitGroup(group string) (totalCount, successCount int, found bool) {
	return getGroupRateLimit(group, AccountFiveHourRateLimitGroup, &AccountFiveHourRateLimitMutex)
}

func CheckAccountFiveHourRateLimitGroup(jsonStr string) error {
	return checkRateLimitGroup(jsonStr, true)
}

// --- Weekly window ---

func AccountWeeklyRateLimitGroup2JSONString() string {
	return rateLimitGroup2JSONString(AccountWeeklyRateLimitGroup, &AccountWeeklyRateLimitMutex)
}

func UpdateAccountWeeklyRateLimitGroupByJSONString(jsonStr string) error {
	return updateRateLimitGroupByJSONString(jsonStr, &AccountWeeklyRateLimitGroup, &AccountWeeklyRateLimitMutex)
}

func GetAccountWeeklyRateLimitGroup(group string) (totalCount, successCount int, found bool) {
	return getGroupRateLimit(group, AccountWeeklyRateLimitGroup, &AccountWeeklyRateLimitMutex)
}

func CheckAccountWeeklyRateLimitGroup(jsonStr string) error {
	return checkRateLimitGroup(jsonStr, true)
}
