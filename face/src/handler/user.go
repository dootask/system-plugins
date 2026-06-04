// 处理与用户相关的http请求

package handler

import (
	"checkin/schema"
	"encoding/json"
	"net/http"

	log "github.com/sirupsen/logrus"
)

type SetUserInfoParams struct {
	Enrollid  int         `json:"enrollid,omitempty"`
	Name      string      `json:"name,omitempty"`
	Backupnum int         `json:"backupnum,omitempty"`
	Admin     int         `json:"admin,omitempty"`
	Record    interface{} `json:"record"` // 为密码的时候为number，其他时候为字符串
}

type DeleteUserParams struct {
	Enrollid  int `json:"enrollid"`
	Backupnum int `json:"backupnum"`
}

type EnableUserParams struct {
	Enrollid int `json:"enrollid"`
	Enflag   int `json:"enflag"`
}

func UserHandle(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		listUserHandle(w, r)
	case http.MethodPost:
		setUserHandle(w, r)
	case http.MethodDelete:
		DeleteUserHandle(w, r)
	default:
		// 如果请求方法不支持，返回405 Method Not Allowed
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func UserStatusHandle(w http.ResponseWriter, r *http.Request) {
	log.Println("设置用户状态")
	var params EnableUserParams
	err := json.NewDecoder(r.Body).Decode(&params)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	if params.Enrollid == 0 || (params.Enflag != 0 && params.Enflag != 1) {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	HandleEnableuserAll(schema.EnableuserMessage{
		Cmd:      CmdEnableuser,
		Enrollid: params.Enrollid,
		Enflag:   params.Enflag,
	})
}

func listUserHandle(w http.ResponseWriter, r *http.Request) {
	_, _ = w, r
	HandleGetuserlistRandomDevice()
}

func setUserHandle(w http.ResponseWriter, r *http.Request) {
	var userInfo SetUserInfoParams
	err := json.NewDecoder(r.Body).Decode(&userInfo)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
	}
	log.Infof("处理设置用户: %+v", userInfo)
	if userInfo.Name == "" || userInfo.Enrollid == 0 || userInfo.Backupnum == 0 {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	ret := HandleSetUserInfoAll(schema.SetuserinfoMessage{
		Cmd:       CmdSetuserinfo,
		Name:      userInfo.Name,
		Enrollid:  userInfo.Enrollid,
		Backupnum: userInfo.Backupnum,
		Admin:     userInfo.Admin,
		Record:    userInfo.Record,
	})
	sendJsonData(w, ret)
}

func DeleteUserHandle(w http.ResponseWriter, r *http.Request) {
	var params DeleteUserParams
	err := json.NewDecoder(r.Body).Decode(&params)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if params.Enrollid == 0 || (params.Backupnum != 50 && (params.Backupnum < 0 || params.Backupnum > 13)) {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	// handleDeleteuser()
	ret := HandleDeleteuserAll(schema.DeleteuserMessage{
		Cmd:       CmdDeleteuser,
		Enrollid:  params.Enrollid,
		Backupnum: params.Backupnum,
	})
	sendJsonData(w, ret)

}

func sendJsonData(w http.ResponseWriter, data interface{}) {
	log.Debugf("返回数据 %+v", data)
	// 设置响应头的内容类型为 JSON
	w.Header().Set("Content-Type", "application/json")

	// 将数据编码为 JSON 并写入响应
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
