# 项目名称

实现考勤机的人员管理和考勤数据上报

## 目录

- [简介](#简介)
- [安装](#安装)
- [使用](#使用)

## 简介

简介~

## 使用

本地运行 

修改`config/env.go`中的变量，或者可以在环境变量中配置

```bash
go run main.go migrate # 执行数据库迁移
go run main.go up # 启动服务
```

docker

```bash
docker-compose up -d
```
