#!/bin/bash
# CCCLAW 安装脚本 — 自动移除 Gatekeeper 限制
echo "正在安装 CCCLAW..."

# 复制到 Applications
cp -r "/Volumes/CCCLAW/CCCLAW.app" /Applications/ 2>/dev/null
if [ ! -d "/Applications/CCCLAW.app" ]; then
    echo "❌ 找不到 CCCLAW.app，请确保 DMG 已挂载"
    exit 1
fi

# 移除 Gatekeeper 限制
xattr -cr /Applications/CCCLAW.app
echo "✅ CCCLAW 安装完成！"
echo "现在可以正常打开 CCCLAW 了。"
open /Applications/CCCLAW.app
