#!/bin/bash
# 修复 CCLAW 内核打包问题

echo "=== 修复 CCLAW 内核打包 ==="
echo "问题: 内核应该是 CCLAW 项目特定的运行时，不是普通 OpenClaw"
echo ""

PROJECT_DIR="/Users/xuting/CCCLAW"
OPENCLAW_SRC="$PROJECT_DIR/node_modules/openclaw"
BUILD_DIR="$PROJECT_DIR/build/openclaw"

echo "1. 创建 CCLAW 内核目录..."
mkdir -p "$BUILD_DIR"

echo "2. 复制 OpenClaw 基础文件..."
cp -R "$OPENCLAW_SRC"/* "$BUILD_DIR/" 2>/dev/null || true

echo "3. 添加 CCLAW 特定配置..."
# 创建 CCLAW profile 配置文件
cat > "$BUILD_DIR/ccclaw-profile.json" << 'JSON'
{
  "name": "ccclaw",
  "description": "CCLAW customized OpenClaw profile",
  "runtime": {
    "type": "ccclaw-opencloud",
    "port": 18799,
    "serviceName": "ccclaw-gateway"
  },
  "features": {
    "ccclawExtensions": true,
    "graphicalAssistant": true,
    "legalComputing": true
  },
  "channels": {
    "default": "openclaw-weixin",
    "supported": ["openclaw-weixin", "feishu", "dingtalk", "wecom"]
  }
}
JSON

echo "4. 修改启动脚本以使用 CCLAW profile..."
# 备份原 openclaw.mjs
cp "$BUILD_DIR/openclaw.mjs" "$BUILD_DIR/openclaw.mjs.backup"

# 在 openclaw.mjs 开头添加环境变量
cat > "$BUILD_DIR/openclaw.mjs" << 'JS'
#!/usr/bin/env node
// CCLAW 定制版本 - 使用 ccclaw profile

// 设置 CCLAW 环境变量
process.env.OPENCLAW_PROFILE = 'ccclaw';
process.env.OPENCLAW_SERVICE_NAME = 'ccclaw-gateway';
process.env.CCCLAW_MODE = 'packaged';

// 加载原始模块
const modulePath = require('path').join(__dirname, 'dist', 'entry.js');
require(modulePath);
JS

# 追加原始内容
tail -n +2 "$BUILD_DIR/openclaw.mjs.backup" >> "$BUILD_DIR/openclaw.mjs" 2>/dev/null

echo "5. 创建 CCLAW 启动脚本..."
cat > "$BUILD_DIR/start-ccclaw.sh" << 'BASH'
#!/bin/bash
# CCLAW 专用启动脚本

export OPENCLAW_PROFILE=ccclaw
export OPENCLAW_SERVICE_NAME=ccclaw-gateway
export CCCLAW_MODE=packaged

# 使用 CCLAW 特定端口
PORT="${1:-18799}"

echo "🚀 启动 CCLAW 内核 (profile: ccclaw, port: $PORT)"

# 执行 OpenClaw
exec node "$(dirname "$0")/openclaw.mjs" gateway --port "$PORT" --profile ccclaw
BASH

chmod +x "$BUILD_DIR/start-ccclaw.sh"
chmod +x "$BUILD_DIR/openclaw.mjs"

echo "6. 验证打包结构..."
echo "   检查关键文件:"
for file in "openclaw.mjs" "ccclaw-profile.json" "start-ccclaw.sh"; do
    if [ -f "$BUILD_DIR/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file"
    fi
done

echo ""
echo "=== 修复完成 ==="
echo ""
echo "CCLAW 内核现在包含:"
echo "  • CCLAW profile 配置 (ccclaw-profile.json)"
echo "  • 定制启动脚本 (使用 OPENCLAW_PROFILE=ccclaw)"
echo "  • CCLAW 特定环境变量"
echo ""
echo "现在重新打包应用:"
echo "  cd /Users/xuting/CCCLAW"
echo "  pnpm run package:mac:local"
echo ""
echo "应用将使用 'ccclaw' profile 而不是默认的 'cloudx'"
echo "端口/服务名称: ccclaw-opencloud / ccclaw-gateway"