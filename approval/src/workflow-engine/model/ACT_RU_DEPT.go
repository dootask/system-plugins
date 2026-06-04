package model

// 部门结构体 user_departments 包括【id, name, dialog_id, parent_id, owner_userid, created_at, updated_at】
type UserDepartments struct {
	Id          int    `json:"id"`
	Name        string `json:"name"`
	DialogId    string `json:"dialog_id"`
	ParentId    int    `json:"parent_id"`
	OwnerUserid string `json:"owner_userid"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// 用户结构体 users 包括【userid, identity, department, nickname, profession, userimg, created_at, updated_at】
type Users struct {
	Userid     string `json:"userid"`
	Identity   string `json:"identity"`
	Department string `json:"department"`
	Nickname   string `json:"nickname"`
	Email      string `json:"email"`
	Profession string `json:"profession"`
	Userimg    string `json:"userimg"`
	DisableAt  string `json:"disable_at"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

// GetAllDept 所有部门列表
func GetAllDept(parentId int) ([]*UserDepartments, error) {
	var datas []*UserDepartments
	dbModel := db
	if parentId != -1 {
		dbModel = dbModel.Where("parent_id=?", parentId)
	}
	err := dbModel.Find(&datas).Error
	return datas, err
}

// GetDeptByParentID 根据父级部门ID获取子部门列表
func GetDeptByParentID(parentID int) ([]*UserDepartments, error) {
	var datas []*UserDepartments
	err := db.Where("parent_id=?", parentID).Find(&datas).Error
	return datas, err
}

// GetDeptByID 根据部门ID获取部门信息
func GetDeptByID(deptID int) (*UserDepartments, error) {
	var data UserDepartments
	err := db.Where("id=?", deptID).Find(&data).Error
	return &data, err
}

// GetDeptByID 根据部门ID获取指定层级的部门信息
func GetDeptLevelByID(deptID int, level int) (*UserDepartments, error) {
	var datas []*UserDepartments
	err := db.Find(&datas).Error
	datas = getDeptTreeList(datas, deptID)
	for i, data := range datas {
		if level == i+1 {
			return data, nil
		}
	}
	return nil, err
}

// GetDeptByID 根据部门ID获取树列表
func GetDeptTreeList(deptID int) ([]*UserDepartments, error) {
	var datas []*UserDepartments
	err := db.Find(&datas).Error
	datas = getDeptTreeList(datas, deptID)
	return datas, err
}

// getDeptTreeList 获取树列表
func getDeptTreeList(nodes []*UserDepartments, ParentId int) []*UserDepartments {
	var result []*UserDepartments
	for _, node := range nodes {
		if node.Id == ParentId {
			result = append(result, node)
			childrens := getDeptTreeList(nodes, node.ParentId)
			for _, children := range childrens {
				result = append(result, children)
			}
		}
	}
	return result
}

// GetUsersByDept 根据部门名称获取用户列表
func GetUsersByDept(deptName string) ([]*Users, error) {
	var datas []*Users
	err := db.Where("department=?", deptName).Find(&datas).Error
	return datas, err
}

// GetUsersByDeptNames 根据多个部门名称获取用户列表
func GetUsersByDeptNames(deptNames []string) ([]*Users, error) {
	var datas []*Users
	err := db.Where("department in (?)", deptNames).Find(&datas).Error
	return datas, err
}

// GetUsersByDeptIds 根据部门id获取用户列表，使用find_in_set函数查询
func GetUsersByDeptId(deptId int) ([]*Users, error) {
	var datas []*Users
	modelDb := db.Where("bot=? and disable_at is null", 0)
	if deptId > 0 {
		modelDb = modelDb.Where("find_in_set(?,department)", deptId)
	} else {
		modelDb = modelDb.Where("(department=? or department=?)", "", ",,")
	}
	err := modelDb.Find(&datas).Error
	return datas, err
}

// GetUserByName 根据用户名称获取用户并分页
func GetUserByName(name string, page, pageSize int) ([]*Users, error) {
	var datas []*Users
	err := db.Where("bot = 0 and disable_at is null and (nickname like ? or email like ?)", "%"+name+"%", "%"+name+"%").Limit(pageSize).Offset((page - 1) * pageSize).Find(&datas).Error
	return datas, err
}

// GetUserByNameCount 根据用户名称获取用户总数
func GetUserByNameCount(name string) (int, error) {
	var count int
	err := db.Model(&Users{}).Where("bot = 0 and disable_at is null and (nickname like ? or email like ?)", "%"+name+"%", "%"+name+"%").Count(&count).Error
	return count, err
}

// GetUserDeptById 根据用户id获取用户部门
func GetUserDeptById(id string) ([]*Users, error) {
	var datas []*Users
	err := db.Model(&Users{}).Where("userid=?", id).Find(&datas).Error
	return datas, err
}

// GetUserInfoById 根据用户id获取用户信息
func GetUserInfoById(id string) (*Users, error) {
	var datas Users
	err := db.Model(&Users{}).Where("disable_at is null and userid=?", id).Find(&datas).Error
	return &datas, err
}

// GetAllUserInfoById 根据用户id获取用户信息
func GetAllUserInfoById(id string) (*Users, error) {
	var datas Users
	err := db.Model(&Users{}).Where("userid=?", id).Find(&datas).Error
	return &datas, err
}
