#!/usr/bin/env zx

/**
 * bundle-ccclaw.mjs
 *
 * Bundles the local ccclaw (modified OpenClaw) with its dependencies
 * into a self-contained directory (build/openclaw/) for electron-builder.
 *
 * Unlike the original bundle-openclaw.mjs which BFS through pnpm virtual store,
 * ccclaw uses npm-style flat node_modules so we just copy directly.
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
  echo`❌ CCCLAW source not found: ${CCCLAW_SRC}`;
  process.exit(1);
}

const entryMjs = path.join(CCCLAW_SRC, 'openclaw.mjs');
const distDir = path.join(CCCLAW_SRC, 'dist');
if (!fs.existsSync(entryMjs) || !fs.existsSync(distDir)) {
  echo`❌ CCCLAW source missing openclaw.mjs or dist/`;
  process.exit(1);
}

// 2. Clean and create output directory
if (fs.existsSync(OUTPUT)) {
  fs.rmSync(OUTPUT, { recursive: true });
}
fs.mkdirSync(OUTPUT, { recursive: true });

// 3. Copy ccclaw package itself (excluding node_modules, .git, etc.)
echo`   Copying CCCLAW package...`;
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.github', 'test', 'tests', '__tests__', '.artifacts']);
function copyDirFiltered(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      copyDirFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
copyDirFiltered(CCCLAW_SRC, OUTPUT);

// 4. Install dependencies using pnpm in the output directory
echo`   Installing CCCLAW dependencies...`;
const outputPackageJson = path.join(OUTPUT, 'package.json');
const outputNM = path.join(OUTPUT, 'node_modules');
if (fs.existsSync(outputPackageJson)) {
  try {
    await $`pnpm install --production --prefix ${OUTPUT}`;
    echo`   Dependencies installed successfully`;
  } catch (err) {
    echo`   ⚠️  Failed to install dependencies: ${err.message}`;
    process.exit(1);
  }
} else {
  echo`   ⚠️  No package.json found in output directory, skipping dependency installation`;
}

// 4b. Verify dependencies were installed
const installedCount = fs.existsSync(outputNM) ? fs.readdirSync(outputNM).length : 0;
echo`   Installed ${installedCount} top-level packages in node_modules`;

// 5. Merge CCCLAW app-specific deps (from the CCCLAW project's own node_modules)
//    These are deps needed by the Electron main process that may not be in ccclaw's deps
const APP_SPECIFIC_DEPS = [
  'electron-store',
  'ws',
  'lru-cache',
  'ms',
  'node-machine-id',
  'posthog-node',
  '@sinclair/typebox',
  'clawhub',
  'chalk',  // Force chalk v4 (CJS) over openclaw's v5 (ESM-only, breaks in UtilityProcess)
];
const projectNM = path.join(ROOT, 'node_modules');
let mergedCount = 0;
for (const dep of APP_SPECIFIC_DEPS) {
  const src = path.join(projectNM, dep);
  const dest = path.join(outputNM, dep);
  if (!fs.existsSync(src)) {
    echo`   ⚠️  App dep ${dep} not found in project node_modules`;
    continue;
  }
  if (fs.existsSync(dest)) {
    // Force override chalk (v5 ESM → v4 CJS fix)
    if (dep !== 'chalk') continue;
  }
  try {
    fs.cpSync(src, dest, { recursive: true, dereference: true });
    mergedCount++;
  } catch (err) {
    echo`   ⚠️  Failed to copy ${dep}: ${err.message}`;
  }
}
if (mergedCount > 0) {
  echo`   Merged ${mergedCount} app-specific dependencies`;
}

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
    echo`   ✓ ${script}`;
  } else {
    echo`   ⚠️  Standalone script not found: ${script}`;
  }
}

// 6b. Copy workspace templates
echo``;
echo`📁 Copying workspace templates...`;
const workspaceSrc = path.join(ROOT, 'data', 'workspace');
const workspaceDest = path.join(OUTPUT, 'data', 'workspace');
if (fs.existsSync(workspaceSrc)) {
  copyDirFiltered(workspaceSrc, workspaceDest);
  echo`   ✓ Workspace templates copied`;
} else {
  echo`   ⚠️  Workspace templates not found at ${workspaceSrc}`;
}

// 6c. Copy tools (cc-lsp, cc-notebook, cc-brief)
echo``;
echo`🔧 Copying tools...`;
const toolsSrc = path.join(ROOT, 'tools');
const toolsDest = path.join(OUTPUT, 'tools');
if (fs.existsSync(toolsSrc)) {
  copyDirFiltered(toolsSrc, toolsDest);
  echo`   ✓ Tools copied`;
} else {
  echo`   ⚠️  Tools directory not found at ${toolsSrc}`;
}

// 7. Clean up bundle to reduce size
function getDirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += getDirSize(p);
      else if (entry.isFile()) total += fs.statSync(p).size;
    }
  } catch { /* ignore */ }
  return total;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

function rmSafe(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
    else fs.rmSync(target, { force: true });
    return true;
  } catch { return false; }
}

function cleanupBundle(outputDir) {
  let removedCount = 0;
  const nm = path.join(outputDir, 'node_modules');

  const REMOVE_DIRS = new Set([
    'test', 'tests', '__tests__', '.github', 'docs', 'examples', 'example',
    'coverage', '.nyc_output', 'benchmark',
  ]);
  const REMOVE_FILE_EXTS = ['.d.ts', '.d.ts.map', '.js.map', '.mjs.map', '.ts.map', '.markdown'];
  const REMOVE_FILE_NAMES = new Set([
    '.DS_Store', 'README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md',
    'tsconfig.json', '.npmignore', '.eslintrc', '.prettierrc', '.editorconfig',
    'LICENSE', 'LICENSE.txt', 'LICENSE-MIT', 'AUTHORS', 'HISTORY.md',
  ]);

  function walkClean(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (REMOVE_DIRS.has(entry.name)) {
          if (rmSafe(full)) removedCount++;
        } else {
          walkClean(full);
        }
      } else if (entry.isFile()) {
        const name = entry.name;
        if (REMOVE_FILE_NAMES.has(name) || REMOVE_FILE_EXTS.some(e => name.endsWith(e))) {
          if (rmSafe(full)) removedCount++;
        }
      }
    }
  }

  if (fs.existsSync(nm)) walkClean(nm);

  // Remove large unused packages
  const LARGE_REMOVALS = [
    'node_modules/pdfjs-dist/legacy',
    'node_modules/pdfjs-dist/types',
    'node_modules/node-llama-cpp/llama',
    'node_modules/koffi/src',
    'node_modules/koffi/vendor',
    'node_modules/koffi/doc',
    'node_modules/typescript',
    'node_modules/playwright-core',
  ];
  for (const rel of LARGE_REMOVALS) {
    if (rmSafe(path.join(outputDir, rel))) removedCount++;
  }

  return removedCount;
}

echo``;
echo`🧹 Cleaning up bundle...`;
const sizeBefore = getDirSize(OUTPUT);
const cleanedCount = cleanupBundle(OUTPUT);
const sizeAfter = getDirSize(OUTPUT);
echo`   Removed ${cleanedCount} files/directories`;
echo`   Size: ${formatSize(sizeBefore)} → ${formatSize(sizeAfter)} (saved ${formatSize(sizeBefore - sizeAfter)})`;

// 7. Verify the bundle
const entryExists = fs.existsSync(path.join(OUTPUT, 'openclaw.mjs'));
const distExists = fs.existsSync(path.join(OUTPUT, 'dist', 'entry.js'));
const pkgExists = fs.existsSync(path.join(OUTPUT, 'package.json'));

echo``;
echo`✅ Bundle complete: ${OUTPUT}`;
echo`   openclaw.mjs: ${entryExists ? '✓' : '✗'}`;
echo`   dist/entry.js: ${distExists ? '✓' : '✗'}`;
echo`   package.json: ${pkgExists ? '✓' : '✗'}`;

if (!entryExists || !distExists) {
  echo`❌ Bundle verification failed!`;
  process.exit(1);
}

// 8. Apply CCLAW profile customization
echo``;
echo`🔧 Applying CCLAW profile customization...`;

// Create ccclaw-profile.json
const ccclawProfile = {
  name: "ccclaw",
  description: "CCLAW customized OpenClaw profile",
  runtime: { type: "ccclaw-opencloud", port: 18799, serviceName: "ccclaw-gateway" },
  features: { ccclawExtensions: true, graphicalAssistant: true, legalComputing: true }
};
fs.writeFileSync(path.join(OUTPUT, 'ccclaw-profile.json'), JSON.stringify(ccclawProfile, null, 2));
echo`   ✅ ccclaw-profile.json`;

// Inject ccclaw env vars into openclaw.mjs
const entryPath = path.join(OUTPUT, 'openclaw.mjs');
const origEntry = fs.readFileSync(entryPath, 'utf-8');
if (!origEntry.includes('OPENCLAW_PROFILE')) {
  const lines = origEntry.split('\n');
  // Insert after shebang + first blank line
  let insertAt = 0;
  if (lines[0].startsWith('#!')) insertAt = 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;
  lines.splice(insertAt, 0,
    '',
    '// CCLAW customized profile',
    'process.env.OPENCLAW_PROFILE = "ccclaw";',
    'process.env.OPENCLAW_SERVICE_NAME = "ccclaw-gateway";',
    'process.env.CCCLAW_MODE = "packaged";',
    ''
  );
  fs.writeFileSync(entryPath, lines.join('\n'));
  echo`   ✅ openclaw.mjs patched with ccclaw profile`;
} else {
  echo`   ✅ openclaw.mjs already has ccclaw profile`;
}

// Create start-ccclaw.sh
const startScript = `#!/bin/bash\nexport OPENCLAW_PROFILE=ccclaw\nexport OPENCLAW_SERVICE_NAME=ccclaw-gateway\nexport CCCLAW_MODE=packaged\nPORT="\${1:-18799}"\nexec node "$(dirname "$0")/openclaw.mjs" gateway --port "$PORT" --profile ccclaw\n`;
fs.writeFileSync(path.join(OUTPUT, 'start-ccclaw.sh'), startScript);
fs.chmodSync(path.join(OUTPUT, 'start-ccclaw.sh'), 0o755);
echo`   ✅ start-ccclaw.sh`;

echo``;
echo`🎯 CCLAW profile applied. App will use ccclaw-opencloud service.`;
