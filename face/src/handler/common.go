package handler

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/patrickmn/go-cache"
	log "github.com/sirupsen/logrus"
)

// 命令处理函数类型
type cmdHandlerFunc func(conn *websocket.Conn, msg []byte)
type cmdReceiverFunc func(conn *websocket.Conn, msg []byte)

// 定义不同命令的处理函数
var WsHandlers = map[string]cmdHandlerFunc{
	"reg":      ReceiveReg,
	"sendlog":  ReceiveSendlog,
	"senduser": ReceiveSenduser,
}

var WsReceives = map[string]cmdReceiverFunc{
	"getuserlist": ReceiveGetuserlist,
	"getuserinfo": ReceiveGetuserinfo,
	"setuserinfo": ReceiveSetuserinfo,
	"deleteuser":  ReceiveDeleteuser,
	"enableuser":  ReceiveEnableuser,
}

// 客户端连接信息
var ClientsByConn = make(map[*websocket.Conn]string)
var ClientsBySn = make(map[string]*websocket.Conn)

// 支持的命令

type CmdType string

const (
	CmdReg         = "reg"
	CmdSendlog     = "sendlog"
	CmdSenduser    = "senduser"
	CmdGetuserlist = "getuserlist"
	CmdGetuserinfo = "getuserinfo"
	CmdSetuserinfo = "setuserinfo"
	CmdDeleteuser  = "deleteuser"
	CmdEnableuser  = "enableuser"
)

var (
	GlobalCache            = cache.New(5*time.Minute, 10*time.Minute)
	CacheLock              = sync.Mutex{}
	CacheDefaultExpiration = 3 * time.Minute
	DefaultTimeout         = 10 * time.Second
)

func sendData(conn *websocket.Conn, data interface{}) {
	log.Debugf("发送数据: %+v", data)
	if err := conn.WriteJSON(data); err != nil {
		log.Println("Write error:", err)
		conn.Close()
		deleteDeviceConn(conn)
	}
}

// deleteDeviceConn 删除设备websocket连接信息
func deleteDeviceConn(conn *websocket.Conn) {
	sn := ClientsByConn[conn]
	log.Warnf("删除设备[%v]连接信息", sn)
	delete(ClientsBySn, sn)
	delete(ClientsByConn, conn)
}

type RetMessage struct {
	RoutingKey string
	Data       string
	RetryCount int
}

var MessagesChan = make(chan RetMessage, 100) // 缓冲区大小为 100

func waitForResponse[T any](routingKey string) <-chan T {
	responseChan := make(chan T)

	go func() {
		for {
			msg := <-MessagesChan
			if msg.RoutingKey == routingKey {
				var res T
				err := json.Unmarshal([]byte(msg.Data), &res)
				if err != nil {
					log.Debugf("Unmarshal json error")
					continue
				}
				responseChan <- res
				break
			} else {
				if msg.RetryCount > 100 {
					log.Debugf("RoutingKey [%s] retry count over 100", msg.RoutingKey)
					continue
				}
				msg.RetryCount += 1
				MessagesChan <- msg
			}
		}
	}()

	return responseChan
}

func waitForResponses[T any](routingKey string, count int, timeout time.Duration) ([]T, error) {
	responses := make([]T, 0)
	timeoutChan := time.After(timeout)

	for i := 0; i < count; i++ {
		select {
		case <-timeoutChan:
			return responses, fmt.Errorf("timeout waiting for device response")
		case response := <-waitForResponse[T](routingKey):
			responses = append(responses, response)
		}
	}
	return responses, nil
}
