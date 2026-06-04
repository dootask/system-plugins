package server

import (
	"checkin/handler"
	"net/http"

	log "github.com/sirupsen/logrus"
)

func Run() {
	http.HandleFunc("/user/enable", handler.UserHandle)
	http.HandleFunc("/user/delete", handler.DeleteUserHandle)
	http.HandleFunc("/user", handler.UserHandle)
	// 设置路由，定义 WebSocket 处理路径
	http.HandleFunc("/", handler.WsHandler)
	// 启动 HTTP 服务器并监听端口
	log.Println("Server started at :7788")

	// 设备初始化
	handler.DeviceInit()

	if err := http.ListenAndServe(":7788", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
