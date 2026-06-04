package model

import (
	"checkin/config"
	"time"
)

var TableNameCheckinDevice = config.EnvConfig.DB_PREFIX + "checkin_devices"

type CheckinDevice struct {
	ID        int       `gorm:"column:id;primaryKey;autoIncrement:true" json:"id"`
	Sn        string    `gorm:"comment:设备序列号; size:255" json:"sn"`
	Devinfo   string    `gorm:"comment:设备信息" json:"devinfo"`
	CreatedAt time.Time `gorm:"comment:创建时间" json:"created_at"`
	UpdatedAt time.Time `gorm:"comment:更新时间" json:"updated_at"`
}

func (*CheckinDevice) TableName() string {
	return TableNameCheckinDevice
}
