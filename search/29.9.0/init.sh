#!/bin/sh
# 初始化脚本：跨引擎/大版本升级时清理不兼容的旧数据；启动前自愈损坏的 binlog。
# 所有 Manticore 数据都可由主程序从源库全量重建（sync/向量命令按进度指针补全），
# 因此清空是安全的（不是真正的数据丢失）。
# 覆盖两类不兼容：
#   1) 旧版 ZincSearch 数据（特征：_metadata.bolt / dialogMsg / dialogUser / keyValue）
#   2) 旧大版本 Manticore 索引格式（15.x → 28.x 等，磁盘格式可能不兼容导致 searchd 起不来）
# 用引擎版本标记文件判定：标记与当前版本不一致（含无标记的历史数据）即清空重建；
# 但 COMPATIBLE_PREV 里列出的旧版本已实测可直接读取，只更新标记、不清库
# （msg_vectors 动辄百万行，重建要重新生成全部向量，代价很大）。

DATA_DIR="/var/lib/manticore"
ENGINE_VERSION="29.9.0"
# 已验证磁盘格式兼容、升级时无需清库的旧版本（空格分隔）。
# 注意：只验证了「旧 → 新」，降级回旧版本不保证能读新版本打开过的数据。
COMPATIBLE_PREV="28.4.4"
MARKER="$DATA_DIR/.dootask_engine_version"
BINLOG_DIR="$DATA_DIR/binlog"
SEARCHD_LOG="$DATA_DIR/searchd.log"

log() {
    echo "[search-init] $*"
}

cleanup_ok=1
if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    prev=""
    [ -f "$MARKER" ] && prev="$(cat "$MARKER" 2>/dev/null)"
    if [ "$prev" != "$ENGINE_VERSION" ]; then
        case " $COMPATIBLE_PREV " in
            *" $prev "*)
                log "engine data version '$prev' is compatible with '$ENGINE_VERSION', keeping data"
                ;;
            *)
                log "engine data version '$prev' != '$ENGINE_VERSION' (legacy/ZincSearch or older Manticore), cleaning up; indexes will be rebuilt from source"
                # find 连点前缀等隐藏文件一并清理（glob * 不匹配 dotfiles）；
                # 清理失败则不更新版本标记，避免把"没清干净"记成"已清理"导致崩溃循环无自愈
                if ! find "$DATA_DIR" -mindepth 1 -delete 2>/dev/null; then
                    cleanup_ok=0
                    log "WARNING: cleanup incomplete; keeping old marker so cleanup retries on next start"
                fi
                ;;
        esac
    fi
fi

# binlog 自愈（兜底）：上一次启动若因 binlog 损坏而 FATAL 退出，把整个 binlog 目录改名备份后重来。
# - 「登记了但文件不存在」不在此列：由 compose 的 --replay-flags=ignore-open-errors 跳过，
#   不会 FATAL，且保留其余日志里尚未落盘的数据，不应在这里丢弃。
# - 只认 searchd.log 里最近一次「FATAL: binlog」/「accepting connections」哪个在后，
#   启动成功过就不再处理；binlog 目录已空则无事可做，避免空转。
# - 改名而非删除，保留最近 3 份，必要时可手工取回。
if [ -f "$SEARCHD_LOG" ] && [ -d "$BINLOG_DIR" ] && [ -n "$(ls -A "$BINLOG_DIR" 2>/dev/null)" ]; then
    last="$(tail -n 2000 "$SEARCHD_LOG" 2>/dev/null | grep -E 'FATAL: binlog|accepting connections' | tail -n 1)"
    case "$last" in
        *"FATAL: binlog"*)
            case "$last" in
                *"No such file or directory"*) ;;
                *)
                    backup="$DATA_DIR/binlog.corrupt-$(date +%Y%m%d-%H%M%S)"
                    log "last start failed on binlog ($last); moving binlog aside to $backup, unflushed writes in it are dropped and main app will resync from source"
                    if mv "$BINLOG_DIR" "$backup" 2>/dev/null; then
                        # 按名字（含时间戳）倒序保留最新 3 份；不能按 mtime，mv 会保留 binlog 目录原来的旧时间
                        ls -d "$DATA_DIR"/binlog.corrupt-* 2>/dev/null | sort -r | tail -n +4 | while read -r old; do
                            rm -rf "$old"
                        done
                    else
                        log "WARNING: failed to move binlog aside"
                    fi
                    ;;
            esac
            ;;
    esac
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
