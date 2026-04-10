#!/bin/bash
# CCclaw 启动脚本（后台运行）
# 用法: bash start-ccclaw.sh [start|stop|status|restart]
#
# 支持环境变量：
#   CCCLAW_DIR    安装目录（默认 $HOME/.ccclaw）
#   CCCLAW_PORT   Gateway 端口（默认 18799）

ACTION="${1:-start}"
INSTALL_DIR="${CCCLAW_DIR:-$HOME/.ccclaw}"
PIDFILE="$INSTALL_DIR/.gateway.pid"
PORT="${CCCLAW_PORT:-18799}"
CONFIG_DIR="$HOME/.ccclaw"
LOGFILE="$CONFIG_DIR/logs/gateway.log"

# 自动发现 OpenClaw 入口脚本
find_entry() {
    # 优先级：本地 openclaw.mjs → node_modules/openclaw → 报错
    if [ -f "$INSTALL_DIR/openclaw.mjs" ]; then
        echo "$INSTALL_DIR/openclaw.mjs"
    elif [ -f "$INSTALL_DIR/node_modules/openclaw/dist/entry.js" ]; then
        echo "$INSTALL_DIR/node_modules/openclaw/dist/entry.js"
    else
        echo ""
    fi
}

start_gateway() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "⚠️  CCclaw 已经在运行 (PID $(cat "$PIDFILE"))"
        exit 1
    fi

    # 检查端口是否被占用（防止与其他 OpenClaw 实例冲突）
    if lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        OCCUPIER=$(lsof -i :"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
        echo "⚠️  端口 $PORT 已被进程 $OCCUPIER 占用"
        echo "   可能是其他 OpenClaw 实例（如 ClawX）正在运行"
        echo "   请先停止该实例，或设置 CCCLAW_PORT 环境变量使用其他端口"
        exit 1
    fi

    ENTRY=$(find_entry)
    if [ -z "$ENTRY" ]; then
        echo "❌ 找不到 OpenClaw 入口脚本"
        echo "   检查路径: $INSTALL_DIR/openclaw.mjs"
        echo "   请确认已正确安装 CCclaw: bash install.sh"
        exit 1
    fi

    # 确保目录存在
    mkdir -p "$CONFIG_DIR/logs"

    echo "🚀 启动 CCclaw (端口 $PORT)..."

    # 加载 .env 文件中的 API Key
    ENV_FILE="$INSTALL_DIR/.env"
    if [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck disable=SC1090
        . "$ENV_FILE"
        set +a
    fi

    OPENCLAW_STATE_DIR="$CONFIG_DIR" \
    OPENCLAW_CONFIG_PATH="$CONFIG_DIR/openclaw.json" \
    OPENCLAW_PROFILE=ccclaw \
      nohup node "$ENTRY" gateway --port "$PORT" \
      >> "$LOGFILE" 2>&1 &

    echo $! > "$PIDFILE"
    sleep 3

    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "✅ CCclaw 启动成功！"
        echo "   PID: $(cat "$PIDFILE")"
        echo "   端口: $PORT"
        echo "   Webchat: http://127.0.0.1:$PORT/"
        echo "   日志: tail -f $LOGFILE"
    else
        echo "❌ 启动失败，查看日志: $LOGFILE"
        rm -f "$PIDFILE"
    fi
}

stop_gateway() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        kill "$(cat "$PIDFILE")"
        rm -f "$PIDFILE"
        echo "🛑 CCclaw 已停止"
    else
        echo "CCclaw 没有在运行"
        rm -f "$PIDFILE"
    fi
}

status_gateway() {
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "✅ CCclaw 运行中 (PID $(cat "$PIDFILE"), 端口 $PORT)"
    else
        echo "⏹  CCclaw 未运行"
    fi
}

case "$ACTION" in
    start)
        start_gateway
        ;;
    stop)
        stop_gateway
        ;;
    status)
        status_gateway
        ;;
    restart)
        stop_gateway
        sleep 1
        start_gateway
        ;;
    *)
        echo "用法: bash start-ccclaw.sh [start|stop|status|restart]"
        ;;
esac
