#!/bin/bash
#
# 从运行中的 OnlyOffice documentserver 容器里复制需要定制的「原始」资源到版本目录。
# 复制出来的是未改动的官方文件，定制（JS 注入 / CSS 追加 / logo）由 apply-customizations.sh 再套用。
#
# 用法：
#   ./copy-resources.sh [目标版本目录]
#   不传参数时，默认使用脚本所在目录（沿用旧约定，可把本脚本拷进版本目录后直接运行）。
#
# 相比旧版的改进：mobile CSS 的 webpack chunk 号每个 OnlyOffice 版本都会变（旧版硬编码
# 526/923/611），这里改成按内容标记 `navbar-with-logo` 自动定位目标 chunk。

set -u

# 目标版本目录
LOCAL_BASE="${1:-$(cd "$(dirname "$0")" && pwd)}"
LOCAL_BASE="$(cd "$LOCAL_BASE" && pwd)"

CONTAINER_BASE="/var/www/onlyoffice/documentserver/web-apps"
MOBILE_MARKER="navbar-with-logo"   # 用来定位每个编辑器需要打补丁的 mobile chunk

echo "正在查找 OnlyOffice 容器..."
containers=$(docker ps --format "{{.ID}}\t{{.Image}}\t{{.Names}}" | grep -i onlyoffice)
if [ -z "$containers" ]; then
    echo "错误: 未找到运行中的 OnlyOffice 容器"
    exit 1
fi

container_array=()
while IFS= read -r line; do container_array+=("$line"); done <<< "$containers"

echo "找到以下 OnlyOffice 容器:"
echo "序号  容器ID        镜像                    容器名称"
index=1
for container in "${container_array[@]}"; do echo "$index.    $container"; ((index++)); done

if [ "${#container_array[@]}" -eq 1 ]; then
    choice=1
    echo "(只有一个容器，自动选择)"
else
    read -p "请选择容器序号 [1-${#container_array[@]}]: " choice
fi
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#container_array[@]}" ]; then
    echo "错误: 无效的选择"; exit 1
fi
CONTAINER_ID=$(echo "${container_array[$((choice-1))]}" | awk '{print $1}')

echo ""
echo "容器: $CONTAINER_ID"
echo "目标: $LOCAL_BASE"
echo ""

# 清理并重建目录结构（注意：不动 resources/common 下的 header logo，那是跨版本通用的）
rm -rf "$LOCAL_BASE/etc/documentserver"
for e in documenteditor presentationeditor spreadsheeteditor; do
    rm -rf "$LOCAL_BASE/resources/$e"
    mkdir -p "$LOCAL_BASE/resources/$e/main/resources/css"
    mkdir -p "$LOCAL_BASE/resources/$e/mobile/css"
done
mkdir -p "$LOCAL_BASE/etc/documentserver"

copy_fixed() {
    echo "复制: $1 -> $2"
    docker cp "$CONTAINER_ID:$1" "$2" && echo "✅" || echo "❌ 失败: $1"
}

# default.json
copy_fixed "/etc/onlyoffice/documentserver/default.json" "$LOCAL_BASE/etc/documentserver/default.json"
# require.js
copy_fixed "$CONTAINER_BASE/vendor/requirejs/require.js" "$LOCAL_BASE/resources/require.js"

# 各编辑器：main app.css（固定路径） + mobile chunk（按内容定位）
for e in documenteditor presentationeditor spreadsheeteditor; do
    echo ""
    echo "=== $e ==="
    copy_fixed "$CONTAINER_BASE/apps/$e/main/resources/css/app.css" \
               "$LOCAL_BASE/resources/$e/main/resources/css/app.css"

    mobile_file=$(docker exec "$CONTAINER_ID" sh -c \
        "grep -l '$MOBILE_MARKER' $CONTAINER_BASE/apps/$e/mobile/css/*.css 2>/dev/null | head -n 1")
    if [ -z "$mobile_file" ]; then
        echo "❌ 未找到含 '$MOBILE_MARKER' 的 mobile chunk（$e）—— 该版本结构可能变化，需人工排查"
    else
        echo "mobile chunk: $mobile_file"
        copy_fixed "$mobile_file" "$LOCAL_BASE/resources/$e/mobile/css/"
    fi
done

echo ""
echo "原始资源复制完成。下一步运行 apply-customizations.sh 套用定制，再更新 docker-compose.yml 的挂载哈希名。"
echo "当前各 mobile chunk 实际文件名："
ls -1 "$LOCAL_BASE"/resources/*/mobile/css/ 2>/dev/null
