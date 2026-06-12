#!/usr/bin/env bash
# 构建 doo CLI 的 linux 静态二进制并落到本目录 vendor/，供 Dockerfile COPY。
# doo 源码在 dootask-tools 仓库（与本插件不同仓库），构建上下文不互通，故预编译落盘。
#
# 用法：在 AI 插件 src/ 目录执行 ./vendor-doo.sh [doo-cmd-dir]
#   默认 doo 源码目录：../../../../dootask-tools/server/go/cmd/doo
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DOO_DIR="${1:-$HERE/../../../../dootask-tools/server/go/cmd/doo}"

if [ ! -f "$DOO_DIR/Makefile" ]; then
  echo "找不到 doo 源码：$DOO_DIR（可传参指定 cmd/doo 目录）" >&2
  exit 1
fi

# 版本对齐：用 doo 源码所在仓库的短 commit 作为版本号，便于核对镜像内 doo 与源码一致
DOO_VERSION="${DOO_VERSION:-$(git -C "$DOO_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)}"
echo "==> 在 $DOO_DIR 交叉编译 linux 二进制（version=$DOO_VERSION）"
make -C "$DOO_DIR" build-all VERSION="$DOO_VERSION"

mkdir -p "$HERE/vendor"
cp "$DOO_DIR/dist/doo-linux-amd64" "$HERE/vendor/doo-linux-amd64"
cp "$DOO_DIR/dist/doo-linux-arm64" "$HERE/vendor/doo-linux-arm64"
chmod 0755 "$HERE/vendor/doo-linux-amd64" "$HERE/vendor/doo-linux-arm64"
echo "==> 已落盘：$HERE/vendor/doo-linux-{amd64,arm64}"
