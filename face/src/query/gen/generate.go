package main

import (
	"checkin/query/model"

	"gorm.io/gen"
)

func main() {
	g := gen.NewGenerator(gen.Config{
		OutPath: "../",
		Mode:    gen.WithDefaultQuery | gen.WithQueryInterface, // generate mode
	})

	// dialector := config.EnvConfig.GetGormDialector()

	// gormdb, _ := gorm.Open(dialector, &gorm.Config{

	// 	NamingStrategy: schema.NamingStrategy{
	// 		TablePrefix: config.EnvConfig.DB_PREFIX,
	// 	},
	// })

	// g.UseDB(gormdb) // reuse your gorm db

	g.ApplyBasic(model.CheckinDevice{}, model.Setting{})

	g.Execute()
}
