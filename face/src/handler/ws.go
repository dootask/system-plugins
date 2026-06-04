package handler

import (
	"checkin/schema"
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
)

// 创建一个 WebSocket 升级器
var upgrader = websocket.Upgrader{
	// 允许跨域请求
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func WsHandler(w http.ResponseWriter, r *http.Request) {
	// 将 HTTP 连接升级为 WebSocket 连接
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Failed to upgrade connection:", err)
		return
	}
	defer conn.Close() // 在函数返回前关闭连接
	// clients[conn] = true
	log.Println("Client connected")

	// 监听来自客户端的消息
	for {
		// 读取客户端发送的消息
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket connection closed unexpectedly: %v", err)
			} else {
				log.Println("WebSocket connection closed normally:", err)
			}
			deleteDeviceConn(conn)
			break
		}

		// 打印收到的消息
		log.Infof("Received message: %s\n", message)
		var baseMsg schema.BaseMessage
		if err := json.Unmarshal(message, &baseMsg); err != nil {
			log.Println("Base JSON unmarshal error:", err)
			continue
		}
		if baseMsg.Cmd != "" {
			// 调用处理函数，根据 cmd 字段执行不同逻辑
			if handler, ok := WsHandlers[baseMsg.Cmd]; ok {
				handler(conn, message)
			} else {
				log.Printf("Unknown command: %s", baseMsg.Cmd)
				sendData(conn, schema.WSResponse{
					Ret:    baseMsg.Cmd,
					Result: false,
					Reason: 1002,
				})
			}
		} else if baseMsg.Ret != "" {
			if receiver, ok := WsReceives[baseMsg.Ret]; ok {
				receiver(conn, message)
			} else {
				log.Printf("Unknown command: %s", baseMsg.Ret)
			}
		}

	}
}
