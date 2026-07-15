#!/bin/sh
# 初始化脚本：跨引擎/大版本升级时清理不兼容的旧数据。
# 所有 Manticore 数据都可由主程序从源库全量重建（sync/向量命令按进度指针补全），
# 因此清空是安全的（不是真正的数据丢失）。
# 覆盖两类不兼容：
#   1) 旧版 ZincSearch 数据（特征：_metadata.bolt / dialogMsg / dialogUser / keyValue）
#   2) 旧大版本 Manticore 索引格式（15.x → 28.x 等，磁盘格式可能不兼容导致 searchd 起不来）
# 用引擎版本标记文件判定：标记与当前版本不一致（含无标记的历史数据）即清空重建。

DATA_DIR="/var/lib/manticore"
ENGINE_VERSION="28.4.4"
MARKER="$DATA_DIR/.dootask_engine_version"

log() {
    echo "[search-init] $*"
}

cleanup_ok=1
if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    prev=""
    [ -f "$MARKER" ] && prev="$(cat "$MARKER" 2>/dev/null)"
    if [ "$prev" != "$ENGINE_VERSION" ]; then
        log "engine data version '$prev' != '$ENGINE_VERSION' (legacy/ZincSearch or older Manticore), cleaning up; indexes will be rebuilt from source"
        # find 连点前缀等隐藏文件一并清理（glob * 不匹配 dotfiles）；
        # 清理失败则不更新版本标记，避免把"没清干净"记成"已清理"导致崩溃循环无自愈
        if ! find "$DATA_DIR" -mindepth 1 -delete 2>/dev/null; then
            cleanup_ok=0
            log "WARNING: cleanup incomplete; keeping old marker so cleanup retries on next start"
        fi
    fi
fi

# 记录当前引擎版本，供后续启动/升级判定（首装亦写入，避免误判为需清空）；
# 仅在清理成功（或无需清理）时写入
if [ "$cleanup_ok" = "1" ]; then
    mkdir -p "$DATA_DIR" 2>/dev/null || true
    echo "$ENGINE_VERSION" > "$MARKER" 2>/dev/null || true
fi

log "initialization done, starting Manticore..."

# 执行原始命令
exec "$@"
