#!/bin/bash
echo "=== 最终打包 CCLAW ==="

# 停止所有相关进程
pkill -f "vite" 2>/dev/null
pkill -f "electron" 2>/dev/null
sleep 2

# 清理
cd /Users/xuting/CCCLAW
rm -rf release/ build/ dist-electron/ 2>/dev/null
echo "清理完成"

# 步骤1: 构建前端
echo "步骤1: 构建前端..."
pnpm run build:vite 2>&1 | tail -20

# 步骤2: 手动创建 CCLAW 内核
echo ""
echo "步骤2: 创建 CCLAW 内核..."
mkdir -p build/openclaw

# 复制 OpenClaw
cp -R node_modules/openclaw/* build/openclaw/ 2>/dev/null || true

# 添加 CCLAW 配置
cat > build/openclaw/ccclaw-config.js << 'JS'
// CCLAW 配置
module.exports = {
  profile: 'ccclaw',
  serviceName: 'ccclaw-gateway',
  port: 18799,
  features: {
    graphicalAssistant: true,
    legalComputing: true,
    ccclawExtensions: true
  }
};
JS

# 修改 openclaw.mjs 使用 CCLAW profile
if [ -f build/openclaw/openclaw.mjs ]; then
  mv build/openclaw/openclaw.mjs build/openclaw/openclaw.mjs.backup
  cat > build/openclaw/openclaw.mjs << 'JS'
#!/usr/bin/env node
// CCLAW 定制版本

// 设置 CCLAW 环境变量
process.env.OPENCLAW_PROFILE = 'ccclaw';
process.env.OPENCLAW_SERVICE_NAME = 'ccclaw-gateway';
process.env.CCCLAW_MODE = 'packaged';

// 加载原始模块
const modulePath = require('path').join(__dirname, 'dist', 'entry.js');
require(modulePath);
JS
  cat build/openclaw/openclaw.mjs.backup >> build/openclaw/openclaw.mjs 2>/dev/null
fi

# 步骤3: 构建 Electron
echo ""
echo "步骤3: 构建 Electron..."
# 直接运行 Vite 构建 Electron
npx vite build 2>&1 | tail -30

# 步骤4: 打包插件和技能
echo ""
echo "步骤4: 打包插件..."
if pnpm run bundle:openclaw-plugins 2>&1 | tail -10; then
  echo "插件打包完成"
else
  echo "插件打包失败，继续..."
fi

echo ""
echo "步骤5: 最终打包..."
# 使用 SKIP_PREINSTALLED_SKILLS 跳过技能打包（避免错误）
SKIP_PREINSTALLED_SKILLS=1 electron-builder --mac --publish never 2>&1 | tail -50

echo ""
echo "=== 打包完成 ==="
echo "检查 release/ 目录中的 .dmg 文件"