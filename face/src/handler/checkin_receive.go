// 处理设备主动发送的消息
package handler

import (
	"checkin/config"
	"checkin/query"
	"checkin/query/model"
	checkinMsg "checkin/schema"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// receiveReg 处理设备注册
func ReceiveReg(conn *websocket.Conn, msg []byte) {
	var regMsg checkinMsg.RegMessage
	if err := json.Unmarshal(msg, &regMsg); err != nil {
		log.Println("RegMessage unmarshal error:", err)
		// 返回失败响应
		sendErrorResponse(conn, "reg", 1)
		return
	}
	// 判断是否允许自由注册
	checkinDevice, err := query.CheckinDevice.WithContext(context.Background()).
		Where(query.CheckinDevice.Sn.Eq(regMsg.Sn)).
		First()
	if err != nil {
		if err != gorm.ErrRecordNotFound {
			sendErrorResponse(conn, "reg", 1)
			return
		}
	}

	if config.EnvConfig.FREE_REGISTRATION == 0 && checkinDevice == nil {
		log.Warnf("该设备[%v]不允许被注册", regMsg.Sn)
		sendErrorResponse(conn, "reg", 1)
		conn.Close()
		return
	}

	// 记录连接信息
	ClientsBySn[regMsg.Sn] = conn
	ClientsByConn[conn] = regMsg.Sn

	jsonData, err := json.Marshal(regMsg.Devinfo)
	if err != nil {
		// 发送失败响应
		sendErrorResponse(conn, "reg", 1)
		return
	}
	// 设备没被记录
	if checkinDevice == nil {
		query.CheckinDevice.WithContext(context.Background()).
			Create(&model.CheckinDevice{
				Sn:      regMsg.Sn,
				Devinfo: string(jsonData),
			})
		sendSuccessResponse(conn, "reg")
		return
	}

	// 更新设备信息
	query.CheckinDevice.WithContext(context.Background()).
		Where(query.CheckinDevice.Sn.Eq(checkinDevice.Sn)).
		Update(query.CheckinDevice.Devinfo, jsonData)
	sendSuccessResponse(conn, "reg")
}

// 发送注册错误响应
func sendErrorResponse(conn *websocket.Conn, ret string, reason int) {
	sendData(conn, checkinMsg.WSResponse{
		Ret:    ret,
		Result: false,
		Reason: reason,
	})
}

// 发送成功响应
func sendSuccessResponse(conn *websocket.Conn, ret string) {
	sendData(conn, checkinMsg.WSResponse{
		Ret:       ret,
		Result:    true,
		Cloudtime: time.Now().Format(time.DateTime),
	})
}

// receiveSendlog 处理上传考勤记录，不记录，仅推送数据，并返回成功响应
func ReceiveSendlog(conn *websocket.Conn, msg []byte) {
	var sendlogMsg checkinMsg.SendlogMessage
	if err := json.Unmarshal(msg, &sendlogMsg); err != nil {
		log.Println("RegMessage unmarshal error:", err)
		// 返回失败响应
		sendErrorResponse(conn, "sendlog", 1)
		return
	}
	settingsRow, err := query.Setting.WithContext(context.Background()).Where(query.Setting.Name.Eq("checkinSetting")).First()
	if err != nil {
		log.Warnf("查询设置失败: %v", err)
		// 返回错误
		sendData(conn, checkinMsg.WSResponse{
			Ret:       "sendlog",
			Result:    false,
			Count:     sendlogMsg.Count,
			Logindex:  0,
			Cloudtime: time.Now().Format(time.DateTime),
			Access:    1,
		})
		return
	}
	var settings map[string]interface{}
	if err := json.Unmarshal([]byte(settingsRow.Setting), &settings); err != nil {
		sendData(conn, checkinMsg.WSResponse{
			Ret:       "sendlog",
			Result:    false,
			Count:     sendlogMsg.Count,
			Logindex:  0,
			Cloudtime: time.Now().Format(time.DateTime),
			Access:    1,
		})
		return
	}
	key, ok := settings["face_key"].(string)
	if !ok || key == "" {
		log.Warnf("查询不到对应的Key或Key为空")
		return
	}

	for _, record := range sendlogMsg.Record {
		reportTime, err := time.Parse(time.DateTime, record.Time)
		if err != nil {
			reportTime = time.Now()
		}
		// 用户被禁用
		if record.Event == 15 {
			log.Debugf("该用户被禁用,userid=%d", record.Enrollid)
			continue
		}
		// 推送考勤信息
		mac := fmt.Sprintf("checkin-%d", record.Enrollid)
		url := fmt.Sprintf("%s?key=%v&mac=%s&time=%d&type=face",
			config.EnvConfig.REPORT_API, key, mac, reportTime.Unix())
		_, err = http.Post(url, "", nil)
		if err != nil {
			log.Println("推送考勤信息失败,", err)
		}
	}
	sendData(conn, checkinMsg.WSResponse{
		Ret:       "sendlog",
		Result:    true,
		Count:     sendlogMsg.Count,
		Logindex:  0,
		Cloudtime: time.Now().Format(time.DateTime),
		Access:    1,
	})
}

// receiveSenduser 处理用户上报，不记录，直接返回成功
func ReceiveSenduser(conn *websocket.Conn, msg []byte) {
	var senduserMsg checkinMsg.SenduserMessage
	if err := json.Unmarshal(msg, &senduserMsg); err != nil {
		log.Println("RegMessage unmarshal error:", err)
		sendErrorResponse(conn, "senduser", 1)
		return
	}
	sendSuccessResponse(conn, "senduser")
}

func DeviceInit() {
	ctx := context.Background()
	if config.EnvConfig.FREE_REGISTRATION == 0 {
		log.Warnf("删库跑路中....")
		query.DB.Where("1=1").Delete(&model.CheckinDevice{})

		deviceSnList := strings.Split(config.EnvConfig.INIT_SN, ",")
		for _, sn := range deviceSnList {
			log.Debugf("Init device [#%s] infomation", sn)
			err := query.CheckinDevice.WithContext(ctx).Save(&model.CheckinDevice{
				Sn: sn,
			})
			if err != nil {
				log.Warnf("Error create device: %v", err)
			}
		}
	}

}
