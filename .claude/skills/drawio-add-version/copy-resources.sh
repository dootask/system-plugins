#!/usr/bin/env bash
# 从官方 jgraph/drawio:<VER> 镜像提取需定制的原始文件，并从上一版本目录拷贝静态资源。
# 用法: copy-resources.sh <VER> <版本目录> <上一版本目录>
#   例: copy-resources.sh 30.0.4 drawio/30.0.4 drawio/24.7.17
set -euo pipefail

VER="${1:?需要镜像版本号，如 30.0.4}"
DEST="${2:?需要目标版本目录，如 drawio/30.0.4}"
PREV="${3:?需要上一版本目录，如 drawio/24.7.17}"

IMG="jgraph/drawio:${VER}"
B=/usr/local/tomcat/webapps/draw
W="${DEST}/webapp"
CID="drawio-extract-${VER//./_}"

echo "==> pull ${IMG}"
docker pull "${IMG}" >/dev/null

echo "==> 起临时容器并提取动态文件"
docker rm -f "${CID}" >/dev/null 2>&1 || true
docker create --name "${CID}" "${IMG}" >/dev/null

mkdir -p "${W}/js/diagramly"
docker cp "${CID}:${B}/index.html"                "${W}/index.html"
docker cp "${CID}:${B}/js/app.min.js"             "${W}/js/app.min.js"
docker cp "${CID}:${B}/js/diagramly/ElectronApp.js" "${W}/js/diagramly/ElectronApp.js"
docker rm -f "${CID}" >/dev/null

echo "==> 从 ${PREV} 拷贝静态资源 (croppie / stencils)"
rm -rf "${W}/js/croppie" "${W}/stencils"
cp -r "${PREV}/webapp/js/croppie" "${W}/js/croppie"
cp -r "${PREV}/webapp/stencils"   "${W}/stencils"

echo "==> 规范化权限为 644（docker cp 出来常是 444）"
find "${W}" -type f -exec chmod 644 {} +

echo "==> 完成。webapp 文件:"
( cd "${W}" && find . -maxdepth 3 -type f | sort )
