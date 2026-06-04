package schema

type BaseMessage struct {
	Cmd string `json:"cmd"`
	Ret string `json:"ret"`
}

// RegMessage 登录注册消息
type RegMessage struct {
	Cmd     string `json:"cmd"`
	Sn      string `json:"sn"`
	Devinfo struct {
		Modelname  string `json:"modelname"`
		Usersize   int    `json:"usersize"`
		Fpsize     int    `json:"fpsize"`
		Cardsize   int    `json:"cardsize"`
		Pwdsize    int    `json:"pwdsize"`
		Logsize    int    `json:"logsize"`
		Useduser   int    `json:"useduser"`
		Usedfp     int    `json:"usedfp"`
		Usedcard   int    `json:"usedcard"`
		Usedpwd    int    `json:"usedpwd"`
		Usedlog    int    `json:"usedlog"`
		Usednewlog int    `json:"usednewlog"`
		Fpalgo     string `json:"fpalgo"`
		Firmware   string `json:"firmware"`
		Time       string `json:"time"`
	} `json:"devinfo"`
}

// SendlogMessage 上传考勤记录消息
type SendlogMessage struct {
	Cmd      string `json:"cmd"`
	Count    int    `json:"count"`
	Sn       string `json:"sn"`
	Logindex int    `json:"logindex"`
	Record   []struct {
		Enrollid   int    `json:"enrollid"`
		Name       string `json:"name"`
		Time       string `json:"time,omitempty"`
		Mode       int    `json:"mode"`
		Event      int    `json:"event"`
		Verifymode int    `json:"verifymode"`
		Image      string `json:"image"`
		Inout      int    `json:"inout,omitempty"`
	} `json:"record"`
}

// SenduserMessage 发送用户信息消息
type SenduserMessage struct {
	Cmd       string      `json:"cmd"`
	Sn        string      `json:"sn"`
	Enrollid  int         `json:"enrollid"`
	Name      string      `json:"name"`
	Backupnum int         `json:"backupnum"`
	Admin     int         `json:"admin"`
	Record    interface{} `json:"record"`
}

// SetuserinfoMessage
type SetuserinfoMessage struct {
	Cmd       string      `json:"cmd"`
	Enrollid  int         `json:"enrollid"`
	Name      string      `json:"name"`
	Backupnum int         `json:"backupnum"`
	Admin     int         `json:"admin"`
	Record    interface{} `json:"record"` // 为密码的时候为number，其他时候为字符串
}

// 响应
type WSResponse struct {
	Ret       string `json:"ret"`
	Result    bool   `json:"result"`
	Sn        string `json:"sn,omitempty"`
	Enrollid  int    `json:"enrollid,omitempty"`
	Backupnum int    `json:"backupnum,omitempty"`
	Count     int    `json:"count,omitempty"`
	Logindex  int    `json:"logindex,omitempty"`
	Cloudtime string `json:"cloudtime,omitempty"`
	Reason    int    `json:"reason,omitempty"`
	Msg       string `json:"msg,omitempty"`
	Access    int    `json:"access,omitempty"` // 拓展功能，用于指示这个用户是否可以进门。1，可以进门， 0不可以进门
}

// user
type GetuserlistMessage struct {
	Cmd string `json:"cmd"`
	Stn bool   `json:"stn"`
}

type GetuserlistResponse struct {
	Ret    string `json:"ret"`
	Result bool   `json:"result"`
	Count  int    `json:"count"`
	From   int    `json:"from"`
	To     int    `json:"to"`
	Record []struct {
		Enrollid  int `json:"enrollid "`
		Admin     int `json:"admin "`
		Backupnum int `json:"backupnum"`
	} `json:"record"`
	Reason int `json:"reason,omitempty"`
}

type GetuserinfoMessage struct {
	Cmd       string `json:"cmd"`
	Enrollid  int    `json:"enrollid"`
	Backupnum int    `json:"backupnum"`
}

type DeleteuserMessage struct {
	Cmd       string `json:"cmd"`
	Enrollid  int    `json:"enrollid"`
	Backupnum int    `json:"backupnum"` // 0-9 指纹 10 密码 11 卡 12 删除所有指纹信息  13 删除整个人
}

type DeleteuserResponse struct {
	Ret       string `json:"ret"`
	Enrollid  int    `json:"enrollid"`
	Sn        string `json:"sn"`
	Backupnum int    `json:"backupnum"` // 0-9 指纹 10 密码 11 卡 12 删除所有指纹信息  13 删除整个人
	Result    bool   `json:"result"`
	Reason    int    `json:"reason"`
}

// EnableuserMessage 用户启用、禁用消息
type EnableuserMessage struct {
	Cmd      string `json:"cmd"`
	Enrollid int    `json:"enrollid"`
	Enflag   int    `json:"enflag"`
}

type EnableuserResponse struct {
	Ret    string `json:"ret"`
	Result bool   `json:"result"`
	Reason int    `json:"reason,omitempty"`
}

// 响应
type RetSetuserinfo struct {
	Result bool `json:"result"`
	Reason int  `json:"reason"`
}

type RetDeviceSetuserinfo struct {
	Ret    int    `json:"ret"`
	Sn     string `json:"sn"`
	Reason int    `json:"reason"`
	Msg    string `json:"msg"`
}
