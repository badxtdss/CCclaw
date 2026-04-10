#!/bin/bash
# CCclaw 启动器（双击即用）
# 自动检测安装目录并启动 Gateway

INSTALL_DIR="${CCCLAW_DIR:-$HOME/.ccclaw}"
PORT="${CCCLAW_PORT:-18799}"

# 如果是硬盘盒安装模式，检测挂载
if [ ! -d "$INSTALL_DIR" ] && [ -d "/Volumes/硬盘盒/CCclaw" ]; then
    INSTALL_DIR="/Volumes/硬盘盒/CCclaw"
fi

if [ ! -d "$INSTALL_DIR" ]; then
    osascript -e 'display dialog "CCclaw 未安装。请先运行 install.sh" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

# 启动或打开
STATUS=$(cd "$INSTALL_DIR" && bash start-ccclaw.sh status 2>&1)

if echo "$STATUS" | grep -q "运行中"; then
    # 已运行，直接打开浏览器
    open "http://127.0.0.1:${PORT}/"
else
    # 未运行，先启动
    cd "$INSTALL_DIR" && bash start-ccclaw.sh start
    sleep 3
    open "http://127.0.0.1:${PORT}/"
fi
