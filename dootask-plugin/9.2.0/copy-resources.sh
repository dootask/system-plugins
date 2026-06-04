#!/bin/bash

# 本地基础路径 - 使用脚本所在目录
LOCAL_BASE="$(cd "$(dirname "$0")" && pwd)"

# 容器内基础路径
CONTAINER_BASE="/var/www/onlyoffice/documentserver/web-apps"

echo "正在查找 OnlyOffice 容器..."
echo ""

# 查找 OnlyOffice 容器
containers=$(docker ps --format "{{.ID}}\t{{.Image}}\t{{.Names}}" | grep onlyoffice)

if [ -z "$containers" ]; then
    echo "错误: 未找到运行中的 OnlyOffice 容器"
    exit 1
fi

echo "找到以下 OnlyOffice 容器:"
echo "----------------------------------------"
echo "序号  容器ID        镜像                    容器名称"
echo "----------------------------------------"

# 将容器信息存储到数组中 (兼容方式)
container_array=()
while IFS= read -r line; do
    container_array+=("$line")
done <<< "$containers"

index=1
for container in "${container_array[@]}"; do
    echo "$index.    $container"
    ((index++))
done
echo "----------------------------------------"
echo ""

# 让用户选择容器
read -p "请选择容器序号 [1-${#container_array[@]}]: " choice

if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#container_array[@]}" ]; then
    echo "错误: 无效的选择"
    exit 1
fi

# 获取选中的容器ID
selected_container="${container_array[$((choice-1))]}"
CONTAINER_ID=$(echo "$selected_container" | awk '{print $1}')

echo ""
echo "已选择容器: $CONTAINER_ID"
echo "目标目录: $LOCAL_BASE"
echo ""

# 删除旧的资源文件
rm -rf "$LOCAL_BASE/etc/documentserver"
rm -rf "$LOCAL_BASE/resources/documenteditor"
rm -rf "$LOCAL_BASE/resources/presentationeditor"
rm -rf "$LOCAL_BASE/resources/spreadsheeteditor"

# 创建必要的目录结构
mkdir -p "$LOCAL_BASE/etc/documentserver"
mkdir -p "$LOCAL_BASE/resources/documenteditor/main/resources/css"
mkdir -p "$LOCAL_BASE/resources/documenteditor/mobile/css"
mkdir -p "$LOCAL_BASE/resources/presentationeditor/main/resources/css"
mkdir -p "$LOCAL_BASE/resources/presentationeditor/mobile/css"
mkdir -p "$LOCAL_BASE/resources/spreadsheeteditor/main/resources/css"
mkdir -p "$LOCAL_BASE/resources/spreadsheeteditor/mobile/css"

# 函数: 复制固定路径的文件
copy_fixed_file() {
    local container_path="$1"
    local local_path="$2"
    
    echo "复制: $container_path -> $local_path"
    docker cp "$CONTAINER_ID:$container_path" "$local_path"
    
    if [ $? -eq 0 ]; then
        echo "✅ 成功"
    else
        echo "❌ 失败"
    fi
}

# 函数: 复制带哈希的文件 (使用模式匹配)
copy_hashed_file() {
    local container_dir="$1"
    local pattern="$2"
    local local_path="$3"
    
    echo "查找并复制: $container_dir/$pattern"
    
    # 在容器中查找匹配的文件
    file=$(docker exec "$CONTAINER_ID" sh -c "ls $container_dir/$pattern 2>/dev/null | head -n 1")
    
    if [ -z "$file" ]; then
        echo "❌ 未找到匹配文件: $pattern"
        return 1
    fi
    
    echo "找到文件: $file"
    docker cp "$CONTAINER_ID:$file" "$local_path"
    
    if [ $? -eq 0 ]; then
        echo "✅ 成功"
    else
        echo "❌ 失败"
    fi
}

echo "开始复制资源文件..."
echo ""

echo "=== 复制 default.json ==="
copy_fixed_file \
    "/etc/onlyoffice/documentserver/default.json" \
    "$LOCAL_BASE/etc/documentserver/default.json"

echo "=== 复制 require.js ==="
copy_fixed_file \
    "$CONTAINER_BASE/vendor/requirejs/require.js" \
    "$LOCAL_BASE/resources/require.js"

echo ""
echo "=== 复制 documenteditor 主 CSS ==="
copy_fixed_file \
    "$CONTAINER_BASE/apps/documenteditor/main/resources/css/app.css" \
    "$LOCAL_BASE/resources/documenteditor/main/resources/css/app.css"

echo ""
echo "=== 复制 documenteditor 移动端 CSS (带哈希) ==="
copy_hashed_file \
    "$CONTAINER_BASE/apps/documenteditor/mobile/css" \
    "526.*.css" \
    "$LOCAL_BASE/resources/documenteditor/mobile/css/"

echo ""
echo "=== 复制 presentationeditor 主 CSS ==="
copy_fixed_file \
    "$CONTAINER_BASE/apps/presentationeditor/main/resources/css/app.css" \
    "$LOCAL_BASE/resources/presentationeditor/main/resources/css/app.css"

echo ""
echo "=== 复制 presentationeditor 移动端 CSS (带哈希) ==="
copy_hashed_file \
    "$CONTAINER_BASE/apps/presentationeditor/mobile/css" \
    "923.*.css" \
    "$LOCAL_BASE/resources/presentationeditor/mobile/css/"

echo ""
echo "=== 复制 spreadsheeteditor 主 CSS ==="
copy_fixed_file \
    "$CONTAINER_BASE/apps/spreadsheeteditor/main/resources/css/app.css" \
    "$LOCAL_BASE/resources/spreadsheeteditor/main/resources/css/app.css"

echo ""
echo "=== 复制 spreadsheeteditor 移动端 CSS (带哈希) ==="
copy_hashed_file \
    "$CONTAINER_BASE/apps/spreadsheeteditor/mobile/css" \
    "611.*.css" \
    "$LOCAL_BASE/resources/spreadsheeteditor/mobile/css/"

echo ""
echo "所有文件复制完成!"
echo ""
echo "提示: 如果需要更新 docker-compose.yml 中的哈希文件名,"
echo "请检查 $LOCAL_BASE/resources/*/mobile/css/ 目录中的实际文件名"