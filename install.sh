#!/bin/bash
# CCclaw 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/badxtdss/CCclaw/main/install.sh | bash

set -e

REPO="https://github.com/badxtdss/CCclaw.git"
INSTALL_DIR="${CCCLAW_DIR:-$HOME/.ccclaw}"
PORT="${CCCLAW_PORT:-19789}"
CONFIG_DIR="$HOME/.openclaw-ccclaw"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ╔═══════════════════════════════════╗${NC}"
echo -e "${CYAN}  ║          CCclaw Installer         ║${NC}"
echo -e "${CYAN}  ║   AI 编程助手 · 工作流 + 专业工具   ║${NC}"
echo -e "${CYAN}  ╚═══════════════════════════════════╝${NC}"
echo ""

# 检查 Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}✗ 未检测到 Node.js${NC}"
    echo -e "  请先安装 Node.js >= 18: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 版本过低 (v${NODE_VERSION})，需要 >= 18${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# 检查 git
if ! command -v git &>/dev/null; then
    echo -e "${RED}✗ 未检测到 git${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Git $(git --version | awk '{print $3}')"

# 克隆或更新
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}⟳${NC} CCclaw 已安装，更新中..."
    cd "$INSTALL_DIR"
    git pull --quiet origin main 2>/dev/null || true
else
    echo -e "${CYAN}↓${NC} 下载 CCclaw..."
    git clone --depth 1 "$REPO" "$INSTALL_DIR" 2>/dev/null
fi
echo -e "${GREEN}✓${NC} CCclaw 安装在 $INSTALL_DIR"

# 安装依赖（如果有 package.json 且有 node_modules）
cd "$INSTALL_DIR"
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
    echo -e "${CYAN}↓${NC} 安装依赖..."
    npm install --production --silent 2>/dev/null || true
fi

# 创建配置目录
mkdir -p "$CONFIG_DIR/agents/main/agent"
mkdir -p "$INSTALL_DIR/data/sessions"

# 生成配置（如果不存在）
if [ ! -f "$CONFIG_DIR/openclaw.json" ]; then
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════${NC}"
    echo -e "${YELLOW}  配置 CCclaw${NC}"
    echo -e "${YELLOW}═══════════════════════════════════${NC}"
    echo ""

    # 读取 API Key
    echo -e "请输入你的 API Key（用于调用 AI 模型）"
    echo -e "${CYAN}支持: OpenRouter / Anthropic / OpenAI / 其他兼容 API${NC}"
    echo ""
    read -p "API Key: " API_KEY < /dev/tty

    if [ -z "$API_KEY" ]; then
        echo -e "${YELLOW}⚠ 未输入 API Key，稍后可以在配置文件中修改${NC}"
        API_KEY="sk-your-api-key-here"
    fi

    # 读取 API Base URL（可选）
    echo ""
    echo -e "API Base URL（留空使用 OpenRouter）"
    read -p "Base URL [https://openrouter.ai/api/v1]: " API_BASE < /dev/tty
    API_BASE="${API_BASE:-https://openrouter.ai/api/v1}"

    # 生成 token
    TOKEN=$(openssl rand -hex 16 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(16))" 2>/dev/null || echo "ccclaw-$(date +%s)")

    cat > "$CONFIG_DIR/openclaw.json" << CONF
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/anthropic/claude-sonnet-4",
        "fallbacks": ["openrouter/free"]
      }
    },
    "list": [
      {
        "id": "cc-main",
        "default": true,
        "name": "CCclaw",
        "workspace": "$INSTALL_DIR/data/workspace"
      }
    ]
  },
  "gateway": {
    "mode": "local",
    "port": $PORT,
    "auth": {
      "mode": "token",
      "token": "$TOKEN"
    }
  }
}
CONF

    echo -e "${GREEN}✓${NC} 配置已生成"
    echo ""
    echo -e "${CYAN}  Token: ${TOKEN}${NC}"
    echo -e "${CYAN}  请保存此 Token，首次打开 webchat 时需要输入${NC}"
    echo ""

    # 如果有 .env 示例，创建 .env
    if [ -f "$INSTALL_DIR/.env.example" ]; then
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        # 写入 API Key
        if grep -q "ANTHROPIC_API_KEY" "$INSTALL_DIR/.env" 2>/dev/null; then
            sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY|" "$INSTALL_DIR/.env"
        fi
        if grep -q "OPENAI_API_KEY" "$INSTALL_DIR/.env" 2>/dev/null; then
            sed -i.bak "s|OPENAI_API_KEY=.*|OPENAI_API_KEY=$API_KEY|" "$INSTALL_DIR/.env"
        fi
        rm -f "$INSTALL_DIR/.env.bak"
    fi
else
    echo -e "${GREEN}✓${NC} 配置文件已存在，跳过"
fi

# 创建启动脚本（全局）
LAUNCHER="/usr/local/bin/ccclaw"
cat > "$LAUNCHER" << LAUNCHER_EOF
#!/bin/bash
cd "$INSTALL_DIR"

ACTION="\${1:-open}"

case "\$ACTION" in
    start)
        bash start-ccclaw.sh start
        ;;
    stop)
        bash start-ccclaw.sh stop
        ;;
    restart)
        bash start-ccclaw.sh restart
        ;;
    status)
        bash start-ccclaw.sh status
        ;;
    open)
        # 检查是否在运行
        STATUS=\$(bash start-ccclaw.sh status 2>&1)
        if echo "\$STATUS" | grep -q "未运行"; then
            bash start-ccclaw.sh start
            sleep 3
        fi
        open "http://127.0.0.1:$PORT/"
        ;;
    update)
        cd "$INSTALL_DIR"
        git pull origin main
        echo "✅ 已更新"
        ;;
    *)
        echo "CCclaw — AI 编程助手"
        echo ""
        echo "用法: ccclaw [命令]"
        echo ""
        echo "命令:"
        echo "  open      打开 webchat（默认）"
        echo "  start     启动服务"
        echo "  stop      停止服务"
        echo "  restart   重启服务"
        echo "  status    查看状态"
        echo "  update    更新到最新版"
        ;;
esac
LAUNCHER_EOF

chmod +x "$LAUNCHER"
echo -e "${GREEN}✓${NC} 命令行工具已安装: ccclaw"

# 可选：LSP 工具
echo ""
read -p "安装 LSP 语言服务器工具？(y/N): " INSTALL_LSP < /dev/tty
if [[ "$INSTALL_LSP" =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}↓${NC} 安装 typescript + typescript-language-server..."
    npm i -g typescript typescript-language-server --silent 2>/dev/null || \
        echo -e "${YELLOW}⚠ 安装失败，可以稍后手动安装: npm i -g typescript typescript-language-server${NC}"
    echo -e "${GREEN}✓${NC} LSP 工具已安装"
fi

# 完成
echo ""
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ CCclaw 安装完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════${NC}"
echo ""
echo -e "  启动:     ${CYAN}ccclaw start${NC}"
echo -e "  打开:     ${CYAN}ccclaw open${NC}（或 ${CYAN}ccclaw${NC}）"
echo -e "  停止:     ${CYAN}ccclaw stop${NC}"
echo -e "  状态:     ${CYAN}ccclaw status${NC}"
echo -e "  更新:     ${CYAN}ccclaw update${NC}"
echo ""
echo -e "  安装目录: ${CYAN}$INSTALL_DIR${NC}"
echo -e "  配置文件: ${CYAN}$CONFIG_DIR/openclaw.json${NC}"
echo -e "  Webchat:  ${CYAN}http://127.0.0.1:$PORT/${NC}"
echo ""
echo -e "  ${YELLOW}首次打开 webchat 时，需要在设置中输入 Token${NC}"
echo ""
