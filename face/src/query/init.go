package query

import (
	"checkin/config"
	"context"
	"time"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

type LogrusLogger struct {
	logger *logrus.Logger
}

func (l *LogrusLogger) LogMode(level logger.LogLevel) logger.Interface {
	newlogger := *l
	switch level {
	case logger.Silent:
		newlogger.logger.SetLevel(logrus.PanicLevel)
	case logger.Error:
		newlogger.logger.SetLevel(logrus.ErrorLevel)
	case logger.Warn:
		newlogger.logger.SetLevel(logrus.WarnLevel)
	case logger.Info:
		newlogger.logger.SetLevel(logrus.InfoLevel)
	default:
		newlogger.logger.SetLevel(logrus.InfoLevel)
	}
	return &newlogger
}

func (l *LogrusLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	l.logger.WithContext(ctx).Infof(msg, data...)
}

func (l *LogrusLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	l.logger.WithContext(ctx).Warnf(msg, data...)
}

func (l *LogrusLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	l.logger.WithContext(ctx).Errorf(msg, data...)
}

func (l *LogrusLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	elapsed := time.Since(begin)
	sql, rows := fc()
	if err != nil {
		l.logger.WithContext(ctx).WithFields(logrus.Fields{
			"error":   err,
			"rows":    rows,
			"elapsed": elapsed,
		}).Errorf("SQL: %s", sql)
	} else {
		l.logger.WithContext(ctx).WithFields(logrus.Fields{
			"rows":    rows,
			"elapsed": elapsed,
		}).Infof("SQL: %s", sql)
	}
}

func init() {
	var err error
	// 初始化 logrus
	// log := logrus.New()
	// log.SetFormatter(&logrus.JSONFormatter{})
	// log.SetLevel(logrus.InfoLevel)
	// logrusLogger := &LogrusLogger{
	// 	logger: log,
	// }
	dialector := config.EnvConfig.GetGormDialector()
	DB, err = gorm.Open(
		dialector,
		&gorm.Config{
			PrepareStmt: true,
			// Logger:      logrusLogger,
		},
	)
	SetDefault(DB)
	if err != nil {
		panic(err)
	}
}
