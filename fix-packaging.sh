#!/bin/bash
# 修复 CCLAW 打包问题 - 内核没有一起打包进去

echo "=== 修复 CCLAW 打包问题 ==="
echo "问题: 内核(OpenClaw运行时)没有正确打包"
echo ""

PROJECT_DIR="/Users/xuting/CCCLAW"
OPENCLAW_SRC="$PROJECT_DIR/node_modules/openclaw"
OPENCLAW_BUILD="$PROJECT_DIR/build/openclaw"

echo "1. 检查源目录..."
if [ ! -d "$OPENCLAW_SRC" ]; then
    echo "   ❌ OpenClaw 源目录不存在: $OPENCLAW_SRC"
    exit 1
fi
echo "   ✅ 源目录存在"

echo ""
echo "2. 检查关键文件..."
for file in "openclaw.mjs" "package.json" "dist/index.js"; do
    if [ -f "$OPENCLAW_SRC/$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ 缺失: $file"
    fi
done

echo ""
echo "3. 检查关键依赖..."
cd "$OPENCLAW_SRC"
echo "   关键依赖:"
npm ls koffi sharp @napi-rs/canvas @img/sharp 2>/dev/null | grep -E "^(├─|└─|│)" | head -20

echo ""
echo "4. 重建打包目录..."
cd "$PROJECT_DIR"
echo "   清理 build 目录..."
rm -rf "$PROJECT_DIR/build/openclaw" 2>/dev/null

echo "   运行打包脚本..."
if pnpm run bundle:openclaw-plugins 2>&1 | tail -20; then
    echo "   ✅ 插件打包完成"
else
    echo "   ❌ 插件打包失败"
fi

if pnpm run bundle:preinstalled-skills 2>&1 | tail -20; then
    echo "   ✅ 技能打包完成"
else
    echo "   ❌ 技能打包失败"
fi

echo ""
echo "5. 检查打包结果..."
if [ -d "$OPENCLAW_BUILD" ]; then
    echo "   ✅ 打包目录存在"
    echo "   大小: $(du -sh "$OPENCLAW_BUILD" | cut -f1)"
    
    # 检查 node_modules
    if [ -d "$OPENCLAW_BUILD/node_modules" ]; then
        echo "   ✅ node_modules 存在"
        echo "   依赖数量: $(ls "$OPENCLAW_BUILD/node_modules" | wc -l)"
        
        # 检查关键依赖
        echo "   检查关键依赖..."
        for dep in "koffi" "sharp" "@napi-rs/canvas"; do
            if [ -d "$OPENCLAW_BUILD/node_modules/$dep" ] || ls "$OPENCLAW_BUILD/node_modules/" | grep -q "$dep"; then
                echo "   ✅ $dep"
            else
                echo "   ⚠️  可能缺失: $dep"
            fi
        done
    else
        echo "   ❌ node_modules 不存在 - 这是问题所在！"
    fi
else
    echo "   ❌ 打包目录不存在"
fi

echo ""
echo "6. 重新打包应用..."
echo "   运行: pnpm run package:mac:local"
echo ""
echo "注意: 如果打包后仍然有问题，可能需要:"
echo "  1. 修改 scripts/after-pack.cjs - 确保所有文件正确复制"
echo "  2. 检查 electron-builder.yml 配置"
echo "  3. 查看打包日志中的具体错误"
echo ""
echo "运行以下命令查看详细错误:"
echo "  cd /Users/xuting/CCCLAW"
echo "  pnpm run package:mac:local 2>&1 | tail -50"