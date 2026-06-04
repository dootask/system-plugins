#!/bin/bash
#
# 把 DooTask 定制重新套用到「刚复制出来的官方原始资源」上。幂等：重复运行不会重复追加。
#
# 套用内容：
#   1. require.js  —— 在原版 requirejs 前注入一段 JS（工具栏 postMessage、注入链接/历史按钮、disableDownload、清 ui-theme-id）
#   2. 三个编辑器 main/.../app.css —— 末尾追加 5 行（隐藏 logo / about / loading logo / 禁用下载）
#   3. 三个编辑器 mobile/css/<hash>.css —— 末尾追加 3 行（隐藏带 logo 的 navbar / 禁用下载）
#
# header logo（resources/common/.../img/header/）是跨版本通用的静态空白 svg，不在这里处理，
# 由 SKILL 流程从上一版本目录直接 cp 过来。
#
# 用法： ./apply-customizations.sh <目标版本目录，如 ../dootask-plugin/9.4.0>

set -euo pipefail

if [ $# -lt 1 ]; then echo "用法: $0 <目标版本目录>"; exit 1; fi
VDIR="$(cd "$1" && pwd)"
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
P="$SKILL_DIR/patches"
RES="$VDIR/resources"

# 1) require.js 注入
if grep -q "_toolbarClick" "$RES/require.js"; then
    echo "require.js 已注入，跳过"
else
    cat "$P/require-head.js" "$RES/require.js" > "$RES/require.js.tmp"
    mv "$RES/require.js.tmp" "$RES/require.js"
    echo "✅ require.js 已注入"
fi

# 2) main app.css 追加
for e in documenteditor presentationeditor spreadsheeteditor; do
    f="$RES/$e/main/resources/css/app.css"
    if grep -q "left-btn-about{display:none}" "$f"; then
        echo "$e main css 已追加，跳过"
    else
        cat "$P/main-append.css" >> "$f"
        echo "✅ $e main css 已追加"
    fi
done

# 3) mobile css 追加（复制出来后每个编辑器 mobile/css 目录里只有一个 chunk 文件）
for e in documenteditor presentationeditor spreadsheeteditor; do
    f=$(ls "$RES/$e/mobile/css/"*.css 2>/dev/null | head -n 1 || true)
    if [ -z "$f" ]; then echo "⚠️  $e 缺少 mobile css，跳过（检查 copy-resources.sh 是否成功）"; continue; fi
    if grep -q "navbar-with-logo{height:0px}" "$f"; then
        echo "$e mobile css 已追加，跳过"
    else
        cat "$P/mobile-append.css" >> "$f"
        echo "✅ $e mobile css 已追加: $(basename "$f")"
    fi
done

echo ""
echo "定制套用完成。请确认 docker-compose.yml 的镜像 tag 与下列 mobile 哈希名一致："
ls -1 "$RES"/*/mobile/css/
