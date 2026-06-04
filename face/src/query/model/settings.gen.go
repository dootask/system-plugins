package model

import (
	"checkin/config"
	"time"
)

var TableNameSetting = config.EnvConfig.DB_PREFIX + "settings"

type Setting struct {
	ID        int64     `gorm:"column:id;primaryKey;autoIncrement:true" json:"id"`
	Name      string    `gorm:"column:name" json:"name"`
	Desc      string    `gorm:"column:desc;comment:参数描述、备注" json:"desc"` // 参数描述、备注
	Setting   string    `gorm:"column:setting" json:"setting"`
	CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at" json:"updated_at"`
}

// TableName Setting's table name
func (*Setting) TableName() string {
	return TableNameSetting
}
