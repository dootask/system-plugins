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

# 定位某编辑器「真正被运行时加载」的 mobile chunk css（容器内绝对路径）。
# 新版（如 9.4.0）同一 chunk 号会有多个 hash 变体，只有 dist/js/app.js 的 miniCssF
# 指向的那个才会被加载；旧版（9.2.0）只有一个变体。策略：
#   1) 从 app.js 的 miniCssF 取实际 hash，匹配 *.<hash>.css 且含 navbar-with-logo 者；
#   2) 取不到则回退到「按内容 grep navbar-with-logo」，若仍有多个候选则报警。
find_mobile_css() {
    local e="$1"
    local cssdir="$CONTAINER_BASE/apps/$e/mobile/css"
    local appjs="$CONTAINER_BASE/apps/$e/mobile/dist/js/app.js"
    local hash f
    hash=$(docker exec "$CONTAINER_ID" sh -c \
        "grep -oE 'miniCssF=function\([a-z]\)\{return\"css/\"\+[a-z]\+\"\.[0-9a-f]+\.css\"' '$appjs' 2>/dev/null" \
        | grep -oE '[0-9a-f]{16,}' | head -n 1)
    if [ -n "$hash" ]; then
        f=$(docker exec "$CONTAINER_ID" sh -c \
            "for x in $cssdir/*.$hash.css; do grep -lq '$MOBILE_MARKER' \"\$x\" 2>/dev/null && { echo \"\$x\"; break; }; done")
        [ -n "$f" ] && { echo "$f"; return; }
        echo "（$e: miniCssF hash=$hash 未匹配到含 $MOBILE_MARKER 的 css，回退 grep）" >&2
    fi
    # 回退：按内容定位
    local hits
    hits=$(docker exec "$CONTAINER_ID" sh -c "grep -l '$MOBILE_MARKER' $cssdir/*.css 2>/dev/null")
    local n; n=$(printf '%s\n' "$hits" | grep -c .)
    if [ "$n" -gt 1 ]; then
        echo "⚠️  $e: 含 $MOBILE_MARKER 的 css 有 $n 个候选，miniCssF 又取不到 hash —— 请人工确认运行时加载的是哪个" >&2
    fi
    printf '%s\n' "$hits" | head -n 1
}

# default.json
copy_fixed "/etc/onlyoffice/documentserver/default.json" "$LOCAL_BASE/etc/documentserver/default.json"
# require.js
copy_fixed "$CONTAINER_BASE/vendor/requirejs/require.js" "$LOCAL_BASE/resources/require.js"

# header logo 目录（原版，含真 logo + icons.svg；apply 步骤会把两个 logo 换成空白 svg）
mkdir -p "$LOCAL_BASE/resources/common/main/resources/img/header"
copy_fixed "$CONTAINER_BASE/apps/common/main/resources/img/header/." \
           "$LOCAL_BASE/resources/common/main/resources/img/header/"

# 各编辑器：main app.css（固定路径） + mobile chunk（按内容定位）
for e in documenteditor presentationeditor spreadsheeteditor; do
    echo ""
    echo "=== $e ==="
    copy_fixed "$CONTAINER_BASE/apps/$e/main/resources/css/app.css" \
               "$LOCAL_BASE/resources/$e/main/resources/css/app.css"

    mobile_file=$(find_mobile_css "$e")
    if [ -z "$mobile_file" ]; then
        echo "❌ 未能定位 $e 的 mobile chunk —— 该版本结构可能变化，需人工排查"
    else
        echo "mobile chunk: $mobile_file"
        copy_fixed "$mobile_file" "$LOCAL_BASE/resources/$e/mobile/css/"
    fi
done

# docker cp 出来的文件权限是只读(444)，规范化为 644/755，否则 apply 步骤追加 CSS 会 Permission denied
# （插件 config.yml 的 install/upgrade 钩子也会再 chmod 644，这里保持一致）
find "$LOCAL_BASE/etc" "$LOCAL_BASE/resources" -type d -exec chmod 755 {} + 2>/dev/null || true
find "$LOCAL_BASE/etc" "$LOCAL_BASE/resources" -type f -exec chmod 644 {} + 2>/dev/null || true

echo ""
echo "原始资源复制完成。下一步运行 apply-customizations.sh 套用定制，再更新 docker-compose.yml 的挂载哈希名。"
echo "当前各 mobile chunk 实际文件名："
ls -1 "$LOCAL_BASE"/resources/*/mobile/css/ 2>/dev/null
