package config

import (
	"checkin/logging"
	"fmt"
	"log"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"github.com/sirupsen/logrus"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var EnvConfig = envConfigSchema{}

func (s *envConfigSchema) GetDSN() string {
	return dsn
}

func (s *envConfigSchema) GetGormDialector() gorm.Dialector {
	switch s.STORAGE {
	case "mysql":
		return mysql.Open(s.GetDSN())
	default:
		return sqlite.Open(s.SQLITE_PATH)
	}
}

var dsn string

func init() {
	envInit()
	dsn = fmt.Sprintf("%s:%s@(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local", EnvConfig.MYSQL_USERNAME, EnvConfig.MYSQL_PASSWORD, EnvConfig.MYSQL_HOST, EnvConfig.MYSQL_PORT, EnvConfig.MYSQL_DB_NAME)
}

var defaultConfig = envConfigSchema{
	ENV: "dev",

	FREE_REGISTRATION: 1,

	INIT_SN: "",

	STORAGE: "sqlite",

	SQLITE_PATH: "./checkin.db",

	MYSQL_HOST:     "127.0.0.1",
	MYSQL_PORT:     "50000",
	MYSQL_USERNAME: "dootask",
	MYSQL_PASSWORD: "123456",
	MYSQL_DB_NAME:  "dootask",

	DB_PREFIX: "pre_",

	REPORT_API: "http://10.55.158.3:80/api/public/checkin/report",
	// REPORT_API: "http://127.0.0.1:2223/api/public/checkin/report",
	REPORT_KEY: "2fc24d61be12502d4414503efb48308f",

	MAX_REQUEST_BODY_SIZE: 200 * 1024 * 1024,
}

type envConfigSchema struct {
	ENV string `env:"ENV,DREAM_ENV"`

	// 是否允许自由注册
	FREE_REGISTRATION int

	// 初始化设备sn，多个使用逗号分隔，只有不允许自由注册的时候生效，
	INIT_SN string

	STORAGE string

	SQLITE_PATH string

	MYSQL_HOST     string
	MYSQL_PORT     string
	MYSQL_USERNAME string
	MYSQL_PASSWORD string
	MYSQL_DB_NAME  string

	DB_PREFIX string

	REPORT_API string
	REPORT_KEY string

	MAX_REQUEST_BODY_SIZE int
}

func (s *envConfigSchema) IsDev() bool {
	return s.ENV == "dev" || s.ENV == "TESTING"
}

// envInit Reads .env as environment variables and fill corresponding fields into EnvConfig.
// To use a value from EnvConfig , simply call EnvConfig.FIELD like EnvConfig.ENV
// Note: Please keep Env as the first field of envConfigSchema for better logging.
func envInit() {
	err := godotenv.Load()
	if err != nil {
		log.Print("Error loading .env file, ignored")
	}
	v := reflect.ValueOf(defaultConfig)
	typeOfV := v.Type()

	for i := 0; i < v.NumField(); i++ {
		envNameAlt := make([]string, 0)
		fieldName := typeOfV.Field(i).Name
		fieldType := typeOfV.Field(i).Type
		fieldValue := v.Field(i).Interface()

		envNameAlt = append(envNameAlt, fieldName)
		if fieldTag, ok := typeOfV.Field(i).Tag.Lookup("env"); ok && len(fieldTag) > 0 {
			tags := strings.Split(fieldTag, ",")
			envNameAlt = append(envNameAlt, tags...)
		}

		switch fieldType {
		case reflect.TypeOf(0):
			{
				configDefaultValue, ok := fieldValue.(int)
				if !ok {
					logging.Logger.WithFields(logrus.Fields{
						"field": fieldName,
						"type":  "int",
						"value": fieldValue,
						"env":   envNameAlt,
					}).Warningf("Failed to parse default value")
					continue
				}
				envValue := resolveEnv(envNameAlt, fmt.Sprintf("%d", configDefaultValue))
				if EnvConfig.IsDev() {
					fmt.Printf("Reading field[ %s ] default: %v env: %s\n", fieldName, configDefaultValue, envValue)
				}
				if len(envValue) > 0 {
					envValueInteger, err := strconv.ParseInt(envValue, 10, 64)
					if err != nil {
						logging.Logger.WithFields(logrus.Fields{
							"field": fieldName,
							"type":  "int",
							"value": fieldValue,
							"env":   envNameAlt,
						}).Warningf("Failed to parse env value, ignored")
						continue
					}
					reflect.ValueOf(&EnvConfig).Elem().Field(i).SetInt(envValueInteger)
				}
				continue
			}
		case reflect.TypeOf(""):
			{
				configDefaultValue, ok := fieldValue.(string)
				if !ok {
					logging.Logger.WithFields(logrus.Fields{
						"field": fieldName,
						"type":  "int",
						"value": fieldValue,
						"env":   envNameAlt,
					}).Warningf("Failed to parse default value")
					continue
				}
				envValue := resolveEnv(envNameAlt, configDefaultValue)

				if EnvConfig.IsDev() {
					fmt.Printf("Reading field[ %s ] default: %v env: %s\n", fieldName, configDefaultValue, envValue)
				}
				if len(envValue) > 0 {
					reflect.ValueOf(&EnvConfig).Elem().Field(i).SetString(envValue)
				}
			}
		}

	}
}

func resolveEnv(configKeys []string, defaultValue string) string {
	for _, item := range configKeys {
		envValue := os.Getenv(item)
		if envValue != "" {
			return envValue
		}
	}
	return defaultValue
}
