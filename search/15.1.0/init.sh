#!/bin/sh
# 初始化脚本：清理旧版 ZincSearch 数据
# ZincSearch 数据特征：_metadata.bolt 文件 + dialogMsg/dialogUser/keyValue 目录

DATA_DIR="/var/lib/manticore"

log() {
    echo "[search-init] $*"
}

if [ -d "$DATA_DIR" ]; then
    if [ -f "$DATA_DIR/_metadata.bolt" ] || [ -d "$DATA_DIR/dialogMsg" ] || [ -d "$DATA_DIR/dialogUser" ] || [ -d "$DATA_DIR/keyValue" ]; then
        log "detected old ZincSearch data, cleaning up..."
        rm -rf "$DATA_DIR"/* 2>/dev/null || true
        log "old ZincSearch data cleaned, Manticore will rebuild indexes"
    fi
fi

log "initialization done, starting Manticore..."

# 执行原始命令
exec "$@"
