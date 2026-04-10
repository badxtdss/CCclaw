#!/usr/bin/env zx

/**
 * bundle-ccclaw-fixed.mjs
 *
 * Fixed version of bundle-ccclaw.mjs
 * Bundles the local ccclaw (modified OpenClaw) with its dependencies
 * into a self-contained directory (build/openclaw/) for electron-builder.
 */

import 'zx/globals';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'build', 'openclaw');

// Source priority: explicit env var → node_modules/openclaw
const CCCLAW_SRC = process.env.CCCLAW_SRC || path.join(ROOT, 'node_modules', 'openclaw');

function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

echo`📦 Bundling CCCLAW for electron-builder...`;
echo`   Source: ${CCCLAW_SRC}`;

// 1. Verify source exists
if (!fs.existsSync(CCCLAW_SRC)) {
  echo`   ❌ Source directory does not exist: ${CCCLAW_SRC}`;
  echo`   Please install openclaw: pnpm add openclaw`;
  process.exit(1);
}

// 2. Clean output directory
if (fs.existsSync(OUTPUT)) {
  echo`   Cleaning existing output...`;
  fs.rmSync(OUTPUT, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT, { recursive: true });

// 3. Copy CCCLAW package
echo`   Copying CCCLAW package...`;
try {
  // Copy all files except node_modules (we'll install fresh)
  const items = fs.readdirSync(CCCLAW_SRC);
  for (const item of items) {
    if (item === 'node_modules') continue;
    const src = path.join(CCCLAW_SRC, item);
    const dest = path.join(OUTPUT, item);
    fs.cpSync(src, dest, { recursive: true });
  }
} catch (err) {
  echo`   ❌ Failed to copy CCCLAW package: ${err.message}`;
  process.exit(1);
}

// 4. Install production dependencies
const outputPackageJson = path.join(OUTPUT, 'package.json');
const outputNM = path.join(OUTPUT, 'node_modules');  // Define outputNM here

if (fs.existsSync(outputPackageJson)) {
  try {
    echo`   Installing CCCLAW dependencies...`;
    await $`cd ${OUTPUT} && npm install --production`;
    echo`   ✅ Dependencies installed successfully`;
  } catch (err) {
    echo`   ⚠️  Failed to install dependencies: ${err.message}`;
    echo`   Continuing without dependencies (may cause runtime errors)`;
  }
} else {
  echo`   ⚠️  No package.json found in output directory, skipping dependency installation`;
}

// 5. Verify dependencies were installed
const installedCount = fs.existsSync(outputNM) ? fs.readdirSync(outputNM).length : 0;
echo`   ✅ Installed ${installedCount} top-level packages in node_modules`;

// 6. Copy standalone deployment scripts
echo``;
echo`📋 Copying standalone deployment scripts...`;
const STANDALONE_SCRIPTS = ['install.sh', 'start-ccclaw.sh', '启动CCclaw.command'];
const standaloneDir = path.join(ROOT, 'scripts', 'standalone');
for (const script of STANDALONE_SCRIPTS) {
  const src = path.join(standaloneDir, script);
  const dest = path.join(OUTPUT, script);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    echo`   ✅ ${script}`;
  } else {
    echo`   ⚠️  Standalone script not found: ${script}`;
  }
}

// 7. Copy workspace templates
echo``;
echo`📁 Copying workspace templates...`;
const workspaceSrc = path.join(ROOT, 'data', 'workspace');
const workspaceDest = path.join(OUTPUT, 'data', 'workspace');
if (fs.existsSync(workspaceSrc)) {
  // Simple copy function
  const copyDirFiltered = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        copyDirFiltered(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };
  copyDirFiltered(workspaceSrc, workspaceDest);
  echo`   ✅ Workspace templates copied`;
} else {
  echo`   ⚠️  Workspace templates not found at ${workspaceSrc}`;
}

// 8. Add CCLAW specific config (from our fix)
echo``;
echo`🎯 Adding CCLAW-specific configuration...`;

// Add ccclaw-profile.json
const ccclawProfile = path.join(OUTPUT, 'ccclaw-profile.json');
fs.writeFileSync(ccclawProfile, JSON.stringify({
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
}, null, 2));
echo`   ✅ Added ccclaw-profile.json`;

// Modify openclaw.mjs to use ccclaw profile
const openclawEntry = path.join(OUTPUT, 'openclaw.mjs');
if (fs.existsSync(openclawEntry)) {
  const originalContent = fs.readFileSync(openclawEntry, 'utf-8');
  const modifiedContent = `#!/usr/bin/env node
// CCLAW 定制版本 - 使用 ccclaw profile

// 设置 CCLAW 环境变量
process.env.OPENCLAW_PROFILE = 'ccclaw';
process.env.OPENCLAW_SERVICE_NAME = 'ccclaw-gateway';
process.env.CCCLAW_MODE = 'packaged';

${originalContent}`;
  fs.writeFileSync(openclawEntry, modifiedContent);
  echo`   ✅ Modified openclaw.mjs to use ccclaw profile`;
}

echo``;
echo`✅ CCCLAW bundle ready at: ${OUTPUT}`;
echo`   Total size: ${(await $`du -sh ${OUTPUT} | cut -f1`).stdout.trim()}`;