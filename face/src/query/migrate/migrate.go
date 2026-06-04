package migrate

import (
	"checkin/config"
	"checkin/query/model"
	"fmt"

	"gorm.io/gorm"
)

func Migrate() {
	var err error
	dialector := config.EnvConfig.GetGormDialector()
	db, err := gorm.Open(
		dialector,
		&gorm.Config{
			DisableForeignKeyConstraintWhenMigrating: true,
		},
	)
	if err != nil {
		panic(fmt.Errorf("db connection failed: %v", err))
	}
	err = db.AutoMigrate(&model.CheckinDevice{})
	if err != nil {
		panic(fmt.Errorf("db migrate failed: %v", err))
	}
}
