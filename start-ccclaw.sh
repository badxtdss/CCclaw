#!/bin/bash
# CCclaw 启动脚本（后台运行）
# 用法: bash start-ccclaw.sh [start|stop|status]

ACTION="${1:-start}"
PIDFILE="/tmp/ccclaw-gateway.pid"
PORT=18989

case "$ACTION" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "⚠️  CCclaw 已经在运行 (PID $(cat "$PIDFILE"))"
      exit 1
    fi
    
    echo "🚀 启动 CCclaw (端口 $PORT)..."
    OPENCLAW_STATE_DIR=/Users/xuting/.openclaw-ccclaw \
    OPENCLAW_CONFIG_PATH=/Users/xuting/.openclaw-ccclaw/openclaw.json \
    OPENCLAW_PROFILE=ccclaw \
      nohup node /Applications/ClawX.app/Contents/Resources/openclaw/dist/index.js gateway --port $PORT \
      > /tmp/ccclaw-gateway.log 2>&1 &
    
    echo $! > "$PIDFILE"
    sleep 3
    
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
      echo "✅ CCclaw 启动成功！"
      echo "   PID: $(cat "$PIDFILE")"
      echo "   端口: $PORT"
      echo "   Webchat: http://127.0.0.1:$PORT/"
      echo "   日志: tail -f /tmp/ccclaw-gateway.log"
    else
      echo "❌ 启动失败，查看日志: /tmp/ccclaw-gateway.log"
    fi
    ;;
    
  stop)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      kill "$(cat "$PIDFILE")"
      rm -f "$PIDFILE"
      echo "🛑 CCclaw 已停止"
    else
      echo "CCclaw 没有在运行"
      rm -f "$PIDFILE"
    fi
    ;;
    
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "✅ CCclaw 运行中 (PID $(cat "$PIDFILE"), 端口 $PORT)"
    else
      echo "⏹  CCclaw 未运行"
    fi
    ;;
    
  restart)
    bash "$0" stop
    sleep 1
    bash "$0" start
    ;;
    
  *)
    echo "用法: bash start-ccclaw.sh [start|stop|status|restart]"
    ;;
esac
