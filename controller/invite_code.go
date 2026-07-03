package controller

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

func GetAllInviteCodes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.GetAllInviteCodes(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func SearchInviteCodes(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	codes, total, err := model.SearchInviteCodes(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(codes)
	common.ApiSuccess(c, pageInfo)
}

func GetInviteCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	code, err := model.GetInviteCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    code,
	})
}

func AddInviteCode(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "支付、邀请码、兑换码和订阅功能已禁用。管理员需先确认合规声明后方可启用。",
		})
		return
	}

	code := model.InviteCode{}
	err := c.ShouldBindJSON(&code)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(code.Name) == 0 || len(code.Name) > 20 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "邀请码名称长度必须在1-20之间",
		})
		return
	}
	if code.Count <= 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "邀请码个数必须大于0",
		})
		return
	}
	if code.Count > 100 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "一次邀请码批量生成的个数不能大于 100",
		})
		return
	}
	if code.ExpiredTime != 0 && code.ExpiredTime < common.GetTimestamp() {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "邀请码过期时间不能早于当前时间",
		})
		return
	}

	var keys []string
	for i := 0; i < code.Count; i++ {
		key := common.GetUUID()
		cleanCode := model.InviteCode{
			Name:        code.Name,
			Key:         key,
			CreatedTime: common.GetTimestamp(),
			ExpiredTime: code.ExpiredTime,
		}
		err = cleanCode.Insert()
		if err != nil {
			logger.SysLog("failed to insert invite code: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "创建邀请码失败，请稍后重试",
				"data":    keys,
			})
			return
		}
		keys = append(keys, key)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    keys,
	})
}

func DeleteInviteCode(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}
	err = model.DeleteInviteCodeById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func UpdateInviteCode(c *gin.Context) {
	statusOnly := c.Query("status_only")
	code := model.InviteCode{}
	err := c.ShouldBindJSON(&code)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanCode, err := model.GetInviteCodeById(code.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly == "" {
		if len(code.Name) == 0 || len(code.Name) > 20 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "邀请码名称长度必须在1-20之间",
			})
			return
		}
		if code.ExpiredTime != 0 && code.ExpiredTime < common.GetTimestamp() {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "邀请码过期时间不能早于当前时间",
			})
			return
		}
		cleanCode.Name = code.Name
		cleanCode.ExpiredTime = code.ExpiredTime
	}
	if statusOnly != "" {
		if code.Status != common.InviteCodeStatusEnabled &&
			code.Status != common.InviteCodeStatusDisabled &&
			code.Status != common.InviteCodeStatusUsed {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "无效的状态值",
			})
			return
		}
		cleanCode.Status = code.Status
	}
	err = cleanCode.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanCode,
	})
}

func DeleteInvalidInviteCode(c *gin.Context) {
	rows, err := model.DeleteInvalidInviteCodes()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
}

func ExportInviteCodesCSV(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	pageInfo.SetPageSize(10000)
	codes, _, err := model.GetAllInviteCodes(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=invite_codes.csv")
	if _, err := c.Writer.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil { // BOM for Excel
		logger.SysLog("failed to write invite codes csv BOM: " + err.Error())
		return
	}

	w := csv.NewWriter(c.Writer)
	if err := w.Write([]string{"ID", "Name", "Key", "Status", "Created", "Expires", "Used By"}); err != nil {
		logger.SysLog("failed to write invite codes csv header: " + err.Error())
		return
	}
	for _, code := range codes {
		statusStr := "Enabled"
		if code.Status == common.InviteCodeStatusDisabled {
			statusStr = "Disabled"
		} else if code.Status == common.InviteCodeStatusUsed {
			statusStr = "Used"
		}
		createdStr := time.Unix(code.CreatedTime, 0).Format("2006-01-02 15:04:05")
		expiredStr := "Never"
		if code.ExpiredTime > 0 {
			expiredStr = time.Unix(code.ExpiredTime, 0).Format("2006-01-02 15:04:05")
		}
		usedByStr := "-"
		if code.UsedUserId > 0 {
			usedByStr = strconv.Itoa(code.UsedUserId)
		}
		if err := w.Write([]string{
			strconv.Itoa(code.Id),
			code.Name,
			code.Key,
			statusStr,
			createdStr,
			expiredStr,
			usedByStr,
		}); err != nil {
			logger.SysLog("failed to write invite codes csv row: " + err.Error())
			return
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		logger.SysLog("failed to flush invite codes csv: " + err.Error())
		return
	}
}
