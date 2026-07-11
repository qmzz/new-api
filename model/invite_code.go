package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type InviteCode struct {
	Id          int            `json:"id"`
	Key         string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status      int            `json:"status" gorm:"default:1"`
	Name        string         `json:"name" gorm:"index"`
	CreatedTime int64          `json:"created_time" gorm:"bigint"`
	UsedTime    int64          `json:"used_time" gorm:"bigint"`
	UsedUserId  int            `json:"used_user_id"`
	ExpiredTime int64          `json:"expired_time" gorm:"bigint"`
	Count       int            `json:"count" gorm:"-:all"`
	DeletedAt   gorm.DeletedAt `gorm:"index"`
}

func GetAllInviteCodes(startIdx int, num int) (codes []*InviteCode, total int64, err error) {
	err = DB.Model(&InviteCode{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = DB.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		return nil, 0, err
	}
	return codes, total, nil
}

func SearchInviteCodes(keyword string, startIdx int, num int) (codes []*InviteCode, total int64, err error) {
	query := DB.Model(&InviteCode{})
	if keyword != "" {
		query = query.Where("name LIKE ?", "%"+keyword+"%")
	}
	err = query.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&codes).Error
	if err != nil {
		return nil, 0, err
	}
	return codes, total, nil
}

func GetInviteCodeById(id int) (*InviteCode, error) {
	if id == 0 {
		return nil, errors.New("id is empty")
	}
	code := InviteCode{Id: id}
	err := DB.First(&code, "id = ?", id).Error
	return &code, err
}

func ValidateInviteCode(key string) (*InviteCode, error) {
	if key == "" {
		return nil, errors.New("invite code not provided")
	}
	code := &InviteCode{}

	keyCol := "`key`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		keyCol = `"key"`
	}

	err := DB.Where(keyCol+" = ?", key).First(code).Error
	if err != nil {
		return nil, errors.New("invalid invite code")
	}
	if code.Status != common.InviteCodeStatusEnabled {
		return nil, errors.New("this invite code has been used or disabled")
	}
	if code.ExpiredTime != 0 && code.ExpiredTime < common.GetTimestamp() {
		return nil, errors.New("this invite code has expired")
	}
	return code, nil
}

func UseInviteCode(tx *gorm.DB, key string, userId int) error {
	if key == "" || userId == 0 {
		return errors.New("invalid invite code or user id")
	}

	keyCol := "`key`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		keyCol = `"key"`
	}

	now := common.GetTimestamp()
	result := tx.Model(&InviteCode{}).
		Where(keyCol+" = ? AND status = ? AND (expired_time = 0 OR expired_time >= ?)", key, common.InviteCodeStatusEnabled, now).
		Updates(map[string]interface{}{
			"status":       common.InviteCodeStatusUsed,
			"used_time":    now,
			"used_user_id": userId,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("invalid, used, disabled, or expired invite code")
	}

	return nil
}

func (code *InviteCode) Insert() error {
	return DB.Create(code).Error
}

func (code *InviteCode) Update() error {
	return DB.Model(code).Select("name", "status", "expired_time").Updates(code).Error
}

func (code *InviteCode) Delete() error {
	return DB.Delete(code).Error
}

func DeleteInviteCodeById(id int) error {
	if id == 0 {
		return errors.New("id is empty")
	}
	code := InviteCode{Id: id}
	err := DB.Where(code).First(&code).Error
	if err != nil {
		return err
	}
	return code.Delete()
}

func DeleteInvalidInviteCodes() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where("status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)",
		[]int{common.InviteCodeStatusUsed, common.InviteCodeStatusDisabled},
		common.InviteCodeStatusEnabled, now).Delete(&InviteCode{})
	common.SysLog(fmt.Sprintf("deleted %d invalid invite codes", result.RowsAffected))
	return result.RowsAffected, result.Error
}
