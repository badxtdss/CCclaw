const fs = require('fs');
const path = require('path');

console.log("=== 应用 CCLAW 内核修复 ===");

const openclawDir = path.join(__dirname, 'build', 'openclaw');
if (!fs.existsSync(openclawDir)) {
  console.log("创建 build/openclaw 目录...");
  fs.mkdirSync(openclawDir, { recursive: true });
}

// 1. 复制 OpenClaw 文件
console.log("复制 OpenClaw 文件...");
const openclawSrc = path.join(__dirname, 'node_modules', 'openclaw');
const items = fs.readdirSync(openclawSrc);
for (const item of items) {
  if (item === 'node_modules') continue;
  const src = path.join(openclawSrc, item);
  const dest = path.join(openclawDir, item);
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
}
console.log("✅ OpenClaw 文件复制完成");

// 2. 添加 CCLAW profile 配置
console.log("添加 CCLAW profile 配置...");
const profileConfig = {
  name: "ccclaw",
  description: "CCLAW customized OpenClaw profile",
  runtime: {
    type: "ccclaw-opencloud",
    port: 18799,
    serviceName: "ccclaw-gateway"
  },
  features: {
    ccclawExtensions: true,
    graphicalAssistant: true,
    legalComputing: true
  }
};

fs.writeFileSync(
  path.join(openclawDir, 'ccclaw-profile.json'),
  JSON.stringify(profileConfig, null, 2)
);
console.log("✅ ccclaw-profile.json 创建完成");

// 3. 修改 openclaw.mjs 使用 ccclaw profile
console.log("修改 openclaw.mjs...");
const entryPath = path.join(openclawDir, 'openclaw.mjs');
if (fs.existsSync(entryPath)) {
  let content = fs.readFileSync(entryPath, 'utf-8');
  
  // 在文件开头添加 CCLAW 配置
  const cclawHeader = `#!/usr/bin/env node
// CCLAW 定制版本 - 使用 ccclaw profile

// 设置 CCLAW 环境变量
process.env.OPENCLAW_PROFILE = 'ccclaw';
process.env.OPENCLAW_SERVICE_NAME = 'ccclaw-gateway';
process.env.CCCLAW_MODE = 'packaged';

`;
  
  // 确保不是已经添加了
  if (!content.includes('OPENCLAW_PROFILE = \'ccclaw\'')) {
    content = cclawHeader + content;
    fs.writeFileSync(entryPath, content);
    console.log("✅ openclaw.mjs 已修改为使用 ccclaw profile");
  } else {
    console.log("✅ openclaw.mjs 已经包含 ccclaw profile 配置");
  }
} else {
  console.log("❌ openclaw.mjs 不存在");
}

// 4. 添加启动脚本
console.log("添加启动脚本...");
const startScript = `#!/bin/bash
# CCLAW 专用启动脚本

export OPENCLAW_PROFILE=ccclaw
export OPENCLAW_SERVICE_NAME=ccclaw-gateway
export CCCLAW_MODE=packaged

# 使用 CCLAW 特定端口
PORT="\${1:-18799}"

echo "🚀 启动 CCLAW 内核 (profile: ccclaw, port: \$PORT)"

# 执行 OpenClaw
exec node "\$(dirname "\$0")/openclaw.mjs" gateway --port "\$PORT" --profile ccclaw
`;

fs.writeFileSync(
  path.join(openclawDir, 'start-ccclaw.sh'),
  startScript
);
fs.chmodSync(path.join(openclawDir, 'start-ccclaw.sh'), '755');
console.log("✅ start-ccclaw.sh 创建完成");

console.log("\n=== CCLAW 内核修复完成 ===");
console.log("位置:", openclawDir);
console.log("包含:");
console.log("  • CCLAW profile 配置");
console.log("  • 定制启动脚本");
console.log("  • 环境变量: OPENCLAW_PROFILE=ccclaw");
console.log("  • 服务名称: ccclaw-gateway");