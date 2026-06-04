# system-plugins — DooTask 系统插件 mono-repo

插件清单见 @README.md。下面只记容易踩错的约定。

## 发布只由 tag 触发

- 推 `<插件>/<版本>` tag 才会发布（`.github/workflows/release.yml`）；**纯版本号 tag（无斜杠）不触发**。
- 走 `release-plugin` 技能，别手写发布步骤。同一版本号不能重发（AppStore 拒重复），要发就升新版本号。

## 目录即配置

- **目录名 = AppStore appid**，工作流据此发布。改目录名 = 改 appid，会发成另一个新应用。
- 「版本目录」= 含 `docker-compose.yml` 的子目录。打包只取 `<插件>/{config.yml,logo*,README*}` + 目标 `<版本>/` + 其它非版本子目录（如 `icon/`）；`src/`、`.build.yml`、点文件不入包。

## 构建镜像型插件（有 `src/` 与 `.build.yml`）

- 镜像统一 `dootask/<appid>`，源码在 `<插件>/src/`，发版时 CI 按 `.build.yml`（image/context/dockerfile）构建并推送。
- 改这类插件的程序 → 改 `src/`，再升版本目录发版。

## 其它

- 各插件的专属约定见其目录下的 `CLAUDE.md`（动到该目录文件时才加载）。
- 插件的 `README.md` 是 AppStore 展示文案，不是开发说明。
