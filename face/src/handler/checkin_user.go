// 处理与用户相关的逻辑
// 1. 获取用户列表
// 2. 获取用户信息
// 3. 下发用户信息
// 4. 禁用\启用用户

package handler

import (
	"checkin/query"
	"checkin/schema"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
)

// handleGeuserlistRandomDevice 从已连接的设备中随机请求设备获取用户数据
func HandleGetuserlistRandomDevice() {

	deviceSn := make([]string, len(ClientsBySn))
	for sn := range ClientsBySn {
		deviceSn = append(deviceSn, sn)
	}
	randomKey := rand.Intn(len(deviceSn))
	conn := ClientsBySn[deviceSn[randomKey]]

	HandleGetuserlist(conn, true)
}

// handleGetuserlist 处理获取用户数据
func HandleGetuserlist(conn *websocket.Conn, stn bool) {
	sendData(conn, schema.GetuserlistMessage{
		Cmd: CmdGetuserlist,
		Stn: stn,
	})
}

func ReceiveGetuserlist(conn *websocket.Conn, msg []byte) {
	var response schema.GetuserlistResponse
	if err := json.Unmarshal(msg, &response); err != nil {
		log.Printf("JSON unmarshal error: %v", err)
		return
	}
	if !response.Result {
		return
	}

	if response.Count == 0 {
		log.Println("获取用户列表结束")
		return
	}

	HandleGetuserlist(conn, false)

}

func HandleGetuserinfo(conn *websocket.Conn, msg schema.GetuserinfoMessage) {
	sendData(conn, msg)
}

func ReceiveGetuserinfo(conn *websocket.Conn, msg []byte) {

}

// HandleSetUserInfoAll 向所有设备下发用户信息,
func HandleSetUserInfoAll(msg schema.SetuserinfoMessage) *schema.HttpRetMessage[schema.RetSetuserinfo] {

	devices, err := query.CheckinDevice.WithContext(context.Background()).Find()
	if err != nil {
		log.Errorf("Error query machines: %v", err)
		return schema.Error[schema.RetSetuserinfo]("获取设备信息失败")
	}
	routingKey := fmt.Sprintf("setuserinfo-%d-%d", msg.Enrollid, msg.Backupnum)
	activeDeviceNum := 0
	for _, device := range devices {
		conn, exists := ClientsBySn[device.Sn]
		if !exists {
			log.Warnf("下发用户失败，设备[%s]未连接", device.Sn)
			continue
		}
		activeDeviceNum++
		go HandleSetuserinfo(conn, msg)
	}
	log.Debugf("当前活跃设备数量:%v", activeDeviceNum)

	if activeDeviceNum == 0 {
		log.Warn("当前没有活跃设备")
		return schema.Error[schema.RetSetuserinfo]("获取设备信息失败")
	}
	// 等待处理
	response, err := waitForResponses[schema.RetDeviceSetuserinfo](routingKey, activeDeviceNum, DefaultTimeout)
	if err != nil {
		// 部分设备成功
		if len(response) != 0 {
			device_sns := make([]string, len(response))
			for i, res := range response {
				device_sns[i] = res.Sn
			}
			log.Warnf("部分设备[%v]下发用户信息成功", device_sns)
		}
		log.Warnf("等待返回信息错误: %v", err)
		return schema.Error[schema.RetSetuserinfo]("上传失败")
	}
	data := schema.RetSetuserinfo{
		Result: true,
	}
	for _, res := range response {
		if res.Ret != 1 {
			data.Reason = res.Reason
			data.Result = false
			return schema.ErrorWithData(res.Msg, data)
		}
	}

	return schema.SuccessWithData(data)
}

// handleSetuserinfo设置 仅对设备下发，不记录
func HandleSetuserinfo(conn *websocket.Conn, msg schema.SetuserinfoMessage) {
	_, exists := ClientsByConn[conn]
	if !exists {
		log.Warn("连接已断开")
		return
	}
	sendData(conn, msg)
}

func ReceiveSetuserinfo(conn *websocket.Conn, msg []byte) {

	var response schema.WSResponse
	if err := json.Unmarshal(msg, &response); err != nil {
		log.Printf("JSON unmarshal error: %v", err)
		return
	}

	ret := schema.RetDeviceSetuserinfo{}

	// 处理设备响应
	if !response.Result {
		if sn := ClientsByConn[conn]; sn != "" {
			log.Warnf("对设备[%s]下发用户信息失败: %v", sn, response.Msg)
			ret.Msg = response.Msg
			ret.Reason = response.Reason
			ret.Ret = 0
		} else {
			log.Println("Error set user info:", response.Msg)
		}
	} else {
		log.Printf("对设备[%s]下发用户信息[%d]成功", response.Sn, response.Enrollid)
		ret.Msg = "success"
		ret.Ret = 1
	}

	jsonData, err := json.Marshal(ret)
	if err != nil {
		log.Debugf("Marshal json error %v", err)
	}

	// 添加消息
	MessagesChan <- RetMessage{
		RoutingKey: fmt.Sprintf("setuserinfo-%d-%d", response.Enrollid, response.Backupnum),
		Data:       string(jsonData),
		RetryCount: 0,
	}
}

// HandleSetUserInfoAll 向所有设备下发
func HandleDeleteuserAll(msg schema.DeleteuserMessage) *schema.HttpRetMessage[schema.RetSetuserinfo] {

	devices, err := query.CheckinDevice.WithContext(context.Background()).Find()
	if err != nil {
		log.Errorf("Error query devices: %v", err)
		return schema.Error[schema.RetSetuserinfo]("获取设备信息失败")
	}
	routingKey := fmt.Sprintf("deleteuser-%d-%d", msg.Enrollid, msg.Backupnum)
	for _, device := range devices {
		conn, exists := ClientsBySn[device.Sn]
		if !exists {
			log.Warnf("删除用户失败，设备[%s]未连接", device.Sn)
			continue
		}
		// clientsBySn
		HandleDeleteuser(conn, msg)
	}
	// 等待处理
	response, err := waitForResponses[schema.RetDeviceSetuserinfo](routingKey, len(devices), DefaultTimeout)
	if err != nil {
		return schema.Error[schema.RetSetuserinfo]("处理失败")
	}
	data := schema.RetSetuserinfo{
		Result: true,
	}
	for _, res := range response {
		if res.Ret != 1 {
			data.Reason = res.Reason
			data.Result = false
			return schema.ErrorWithData(res.Msg, data)
		}
	}

	return schema.SuccessWithData(data)
}

// handleDeleteuser 处理删除用户信息
func HandleDeleteuser(conn *websocket.Conn, msg schema.DeleteuserMessage) {
	sendData(conn, msg)
}

// receiveDeleteser 接收设备删除用户命令的响应
func ReceiveDeleteuser(conn *websocket.Conn, msg []byte) {
	var response schema.DeleteuserResponse
	if err := json.Unmarshal(msg, &response); err != nil {
		log.Printf("JSON unmarshal error: %v", err)
		return
	}
	ret := schema.RetDeviceSetuserinfo{}
	sn := ClientsByConn[conn]
	if !response.Result {
		log.Errorf("设备[%s]删除用户信息失败, 原因:%d", sn, response.Reason)
		ret.Msg = "error"
		ret.Reason = response.Reason
		ret.Ret = 0
	} else {
		log.Printf("设备[%s]删除用户信息[%d]成功", sn, response.Enrollid)
		ret.Msg = "success"
		ret.Ret = 1
	}
	jsonData, err := json.Marshal(ret)
	if err != nil {
		log.Debugf("Marshal json error %v", err)
	}

	MessagesChan <- RetMessage{
		RoutingKey: fmt.Sprintf("deleteuser-%d-%d", response.Enrollid, response.Backupnum),
		Data:       string(jsonData),
		RetryCount: 0,
	}
}

// handleEnableuserAll 对所有设备更新用户状态
func HandleEnableuserAll(msg schema.EnableuserMessage) {
	devices, err := query.CheckinDevice.WithContext(context.Background()).Find()
	if err != nil {
		log.Errorf("Error query machines: %v", err)
		return
	}
	for _, device := range devices {
		conn, exists := ClientsBySn[device.Sn]
		if !exists {
			log.Warnf("设置用户状态失败，设备[%s]未连接", device.Sn)
			continue
		}
		// clientsBySn
		HandleEnableuser(conn, msg)
	}
}

// handleEnableuser 处理用户禁用\启用命令
func HandleEnableuser(conn *websocket.Conn, msg schema.EnableuserMessage) {
	sendData(conn, msg)
}

// receiveEnableuser 接收设备处理用户禁用\启用命令的响应
func ReceiveEnableuser(conn *websocket.Conn, msg []byte) {
	var response schema.EnableuserResponse
	if err := json.Unmarshal(msg, &response); err != nil {
		log.Printf("JSON unmarshal error: %v", err)
		return
	}
	sn := ClientsByConn[conn]
	if !response.Result {
		log.Errorf("设备[%s]设置用户状态失败, 原因:%d", sn, response.Reason)
	} else {
		log.Printf("设备[%s]设置用户状态成功", sn)
	}

}
