#!/bin/bash
#
# 把 DooTask 定制重新套用到「刚从官方容器复制出来的原始资源」上。幂等：重复运行不会重复套用。
#
# 这些定制是用「干净 9.2.0 容器 vs 现有插件目录」逐文件 diff 实测得出的，共 5 类：
#   1. require.js   —— 在 license 注释与 requirejs 主体之间插入一段 IIFE（patches/require-head.js）：
#                      工具栏 postMessage、注入「链接/历史」按钮、disableDownload、清 ui-theme-id。主体不改。
#   2. 三个编辑器 main/.../app.css   —— 末尾追加 patches/main-append.css（隐藏 logo/about/loading logo/禁用下载）
#   3. 三个编辑器 mobile/css/<hash>.css —— 末尾追加 patches/mobile-append.css（隐藏带 logo 的 navbar/禁用下载）
#   4. etc/documentserver/default.json —— 把 FileConverter 的体积上限调大 10 倍（patches/default-json-edits.tsv）
#   5. header logo  —— header-logo_s.svg / dark-logo_s.svg 换成空白 svg（patches/blank-*.svg）；icons.svg 不动
#
# 用法： ./apply-customizations.sh <目标版本目录，如 ../dootask-plugin/9.4.0>

set -euo pipefail

if [ $# -lt 1 ]; then echo "用法: $0 <目标版本目录>"; exit 1; fi
VDIR="$(cd "$1" && pwd)"
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
P="$SKILL_DIR/patches"
RES="$VDIR/resources"
HDR="$RES/common/main/resources/img/header"

# ---------- 1) require.js：在 'var requirejs,require,define;' 之前插入注入块 ----------
req="$RES/require.js"
if grep -q "_toolbarClick" "$req"; then
    echo "require.js 已注入，跳过"
else
    off=$(grep -abo 'var requirejs,require,define;' "$req" | head -1 | cut -d: -f1)
    if [ -z "${off:-}" ]; then
        echo "❌ require.js 未找到 'var requirejs,require,define;' 标记，该版本结构可能变化，需人工排查"; exit 1
    fi
    { head -c "$off" "$req"; cat "$P/require-head.js"; tail -c +"$((off+1))" "$req"; } > "$req.tmp"
    mv "$req.tmp" "$req"
    echo "✅ require.js 已在 offset $off 处插入注入块"
fi

# ---------- 2) main app.css 追加 ----------
for e in documenteditor presentationeditor spreadsheeteditor; do
    f="$RES/$e/main/resources/css/app.css"
    if grep -q "left-btn-about{display:none}" "$f"; then
        echo "$e main css 已追加，跳过"
    else
        cat "$P/main-append.css" >> "$f"; echo "✅ $e main css 已追加"
    fi
done

# ---------- 3) mobile css 追加（复制出来后每个编辑器 mobile/css 只有一个 chunk）----------
for e in documenteditor presentationeditor spreadsheeteditor; do
    f=$(ls "$RES/$e/mobile/css/"*.css 2>/dev/null | head -n 1 || true)
    if [ -z "$f" ]; then echo "⚠️  $e 缺少 mobile css，跳过（检查 copy-resources.sh）"; continue; fi
    if grep -q "navbar-with-logo{height:0px}" "$f"; then
        echo "$e mobile css 已追加，跳过"
    else
        cat "$P/mobile-append.css" >> "$f"; echo "✅ $e mobile css 已追加: $(basename "$f")"
    fi
done

# ---------- 4) default.json：FileConverter 体积上限 ×10（按字面整词替换，幂等）----------
dj="$VDIR/etc/documentserver/default.json"
if [ -f "$dj" ]; then
    python3 - "$dj" "$P/default-json-edits.tsv" <<'PY'
import sys
path, tsv = sys.argv[1], sys.argv[2]
s = open(path, encoding='utf-8').read()
changed = False
for line in open(tsv, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line: continue
    old, new = line.split('\t')
    n = s.count(old)
    if n:
        s = s.replace(old, new); changed = True
        print(f"✅ default.json: 替换 {n} 处 [{old}] -> [{new}]")
    elif new in s:
        print(f"default.json: 已是新值，跳过 [{new}]")
    else:
        print(f"⚠️  default.json: 未找到 [{old}] 也无新值 —— 该版默认值可能变了，需人工核对")
if changed:
    open(path, 'w', encoding='utf-8').write(s)
PY
else
    echo "⚠️  缺少 $dj，跳过 default.json"
fi

# ---------- 5) header logo 空白化 ----------
if [ -d "$HDR" ]; then
    cp "$P/blank-header-logo_s.svg" "$HDR/header-logo_s.svg"
    cp "$P/blank-dark-logo_s.svg"   "$HDR/dark-logo_s.svg"
    echo "✅ header-logo_s.svg / dark-logo_s.svg 已空白化（icons.svg 保持原版）"
else
    echo "⚠️  缺少 $HDR，跳过 logo 空白化（确认 copy-resources.sh 已复制 header 目录）"
fi

echo ""
echo "定制套用完成。请确认 docker-compose.yml 的镜像 tag 与下列 mobile 哈希名一致："
ls -1 "$RES"/*/mobile/css/
