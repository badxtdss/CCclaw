#!/bin/bash
# CCclaw 启动器（双击即用）

# 检查硬盘盒是否挂载
if [ ! -d "/Volumes/硬盘盒/CCclaw" ]; then
    osascript -e 'display dialog "请先连接硬盘盒" buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

# 启动或打开
STATUS=$(bash "/Volumes/硬盘盒/CCclaw/start-ccclaw.sh" status 2>&1)

if echo "$STATUS" | grep -q "运行中"; then
    # 已运行，直接打开浏览器
    open "http://127.0.0.1:19789/"
else
    # 未运行，先启动
    bash "/Volumes/硬盘盒/CCclaw/start-ccclaw.sh" start
    sleep 3
    open "http://127.0.0.1:19789/"
fi
