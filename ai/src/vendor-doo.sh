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

echo "==> 在 $DOO_DIR 交叉编译 linux 二进制"
make -C "$DOO_DIR" build-all

mkdir -p "$HERE/vendor"
cp "$DOO_DIR/dist/doo-linux-amd64" "$HERE/vendor/doo-linux-amd64"
cp "$DOO_DIR/dist/doo-linux-arm64" "$HERE/vendor/doo-linux-arm64"
chmod 0755 "$HERE/vendor/doo-linux-amd64" "$HERE/vendor/doo-linux-arm64"
echo "==> 已落盘：$HERE/vendor/doo-linux-{amd64,arm64}"
