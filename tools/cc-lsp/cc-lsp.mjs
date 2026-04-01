#!/usr/bin/env node
/**
 * cc-lsp.mjs — Claude Code LSP Tool 的 OpenClaw 移植版
 * 
 * 移植自 Claude Code 的 LSPTool，移除了 Claude Code 运行时依赖，
 * 使用独立的 LSP 服务器管理器。
 * 
 * 命令:
 *   goto     <file> <line> <col>       跳转到定义
 *   refs     <file> <line> <col>       查找所有引用
 *   hover    <file> <line> <col>       获取类型信息
 *   symbols  <file>                    文件内符号
 *   search   <dir> <query>             workspace 符号搜索
 *   impl     <file> <line> <col>       查找实现
 *   calls-in <file> <line> <col>       调用层级（谁调用了我）
 *   calls-out <file> <line> <col>      调用层级（我调用了谁）
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { resolve, dirname, extname, basename, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { LspServerManager } from './cc-lsp-manager.mjs';

// ---- 输出 ----

function output(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function fail(msg) {
  output({ error: msg });
  process.exit(1);
}

// ---- 格式化（移植自 Claude Code formatters.ts）----

function formatUri(uri) {
  if (!uri) return '<unknown>';
  let filePath = uri.replace(/^file:\/\//, '');
  if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
  try { filePath = decodeURIComponent(filePath); } catch {}
  return filePath;
}

function formatLocation(location) {
  // Handle both Location (uri + range) and LocationLink (targetUri + targetRange)
  const uri = location.uri || location.targetUri;
  const range = location.range || location.targetSelectionRange || location.targetRange;
  if (!uri || !range) return '<unknown>';
  const filePath = formatUri(uri);
  const line = range.start.line + 1;
  const character = range.start.character + 1;
  return `${filePath}:${line}:${character}`;
}

function symbolKind(kind) {
  const kinds = {
    1:'File',2:'Module',3:'Namespace',4:'Package',5:'Class',
    6:'Method',7:'Property',8:'Field',9:'Constructor',10:'Enum',
    11:'Interface',12:'Function',13:'Variable',14:'Constant',
    15:'String',16:'Number',17:'Boolean',18:'Array',19:'Object',
    20:'Key',21:'Null',22:'EnumMember',23:'Struct',24:'Event',
    25:'Operator',26:'TypeParameter',
  };
  return kinds[kind] || 'Unknown';
}

function formatGoToDefinition(result) {
  if (!result) return 'No definition found';
  const items = Array.isArray(result) ? result : [result];
  if (items.length === 0) return 'No definition found';
  if (items.length === 1) return `Defined in ${formatLocation(items[0])}`;
  return items.map((l, i) => `  ${i + 1}. ${formatLocation(l)}`).join('\n');
}

function formatFindReferences(result) {
  if (!result || result.length === 0) return 'No references found';
  const lines = [`Found ${result.length} references:`];
  const byFile = {};
  for (const loc of result) {
    const file = formatUri(loc.uri);
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(loc);
  }
  for (const [file, locs] of Object.entries(byFile)) {
    lines.push(`\n${file}:`);
    for (const loc of locs) {
      const line = loc.range.start.line + 1;
      const col = loc.range.start.character + 1;
      lines.push(`  Line ${line}:${col}`);
    }
  }
  return lines.join('\n');
}

function formatHover(result) {
  if (!result) return 'No hover information';
  const contents = result.contents;
  let text = '';
  if (typeof contents === 'string') {
    text = contents;
  } else if (Array.isArray(contents)) {
    text = contents.map(c => typeof c === 'string' ? c : c.value || '').join('\n\n');
  } else if (contents?.value) {
    text = contents.value;
  }
  return text || 'No hover information';
}

function formatDocumentSymbol(result) {
  if (!result || result.length === 0) return 'No symbols found';
  const lines = ['Document symbols:'];
  function walk(symbols, indent = 0) {
    for (const sym of symbols) {
      const prefix = '  '.repeat(indent);
      const kind = symbolKind(sym.kind);
      const line = sym.range?.start?.line != null ? sym.range.start.line + 1 : '?';
      let line2 = `${prefix}${sym.name} (${kind})`;
      if (sym.detail) line2 += ` ${sym.detail}`;
      line2 += ` - Line ${line}`;
      lines.push(line2);
      if (sym.children?.length) walk(sym.children, indent + 1);
    }
  }
  walk(result);
  return lines.join('\n');
}

function formatWorkspaceSymbol(result) {
  if (!result || result.length === 0) return 'No symbols found in workspace';
  const lines = [`Found ${result.length} symbols:`];
  const byFile = {};
  for (const sym of result) {
    if (!sym.location?.uri) continue;
    const file = formatUri(sym.location.uri);
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(sym);
  }
  for (const [file, syms] of Object.entries(byFile)) {
    lines.push(`\n${file}:`);
    for (const sym of syms) {
      const kind = symbolKind(sym.kind);
      const line = sym.location.range.start.line + 1;
      let s = `  ${sym.name} (${kind}) - Line ${line}`;
      if (sym.containerName) s += ` in ${sym.containerName}`;
      lines.push(s);
    }
  }
  return lines.join('\n');
}

function formatCallHierarchyItem(item) {
  const filePath = formatUri(item.uri);
  const line = item.range.start.line + 1;
  const kind = symbolKind(item.kind);
  let result = `${item.name} (${kind}) - ${filePath}:${line}`;
  if (item.detail) result += ` [${item.detail}]`;
  return result;
}

function formatPrepareCallHierarchy(result) {
  if (!result || result.length === 0) return 'No call hierarchy item found';
  if (result.length === 1) return `Call hierarchy: ${formatCallHierarchyItem(result[0])}`;
  return result.map(i => `  ${formatCallHierarchyItem(i)}`).join('\n');
}

function formatIncomingCalls(result) {
  if (!result || result.length === 0) return 'No incoming calls found';
  const lines = [`Found ${result.length} incoming calls:`];
  for (const call of result) {
    if (!call.from) continue;
    const kind = symbolKind(call.from.kind);
    const line = call.from.range.start.line + 1;
    let s = `  ${call.from.name} (${kind}) - Line ${line}`;
    if (call.fromRanges?.length) {
      const sites = call.fromRanges.map(r => `${r.start.line+1}:${r.start.character+1}`).join(', ');
      s += ` [calls at: ${sites}]`;
    }
    lines.push(s);
  }
  return lines.join('\n');
}

function formatOutgoingCalls(result) {
  if (!result || result.length === 0) return 'No outgoing calls found';
  const lines = [`Found ${result.length} outgoing calls:`];
  for (const call of result) {
    if (!call.to) continue;
    const kind = symbolKind(call.to.kind);
    const line = call.to.range.start.line + 1;
    let s = `  ${call.to.name} (${kind}) - Line ${line}`;
    if (call.fromRanges?.length) {
      const sites = call.fromRanges.map(r => `${r.start.line+1}:${r.start.character+1}`).join(', ');
      s += ` [called from: ${sites}]`;
    }
    lines.push(s);
  }
  return lines.join('\n');
}

// ---- 命令实现 ----

const manager = new LspServerManager();


function findAnyTsFile(dir) {
  try {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
        return resolve(dir, f);
      }
    }
  } catch {}
  return resolve(dir, '__dummy__.ts');
}

async function run(operation, fileOrDir, line, col) {
  const absPath = resolve(fileOrDir);
  let dir, absFile;
  
  if (operation === 'search') {
    // search 用目录
    dir = absPath;
    absFile = null;
  } else {
    // 其他操作用文件
    if (!existsSync(absPath)) fail(`File not found: ${fileOrDir}`);
    absFile = absPath;
    dir = statSync(absPath).isDirectory() ? absPath : dirname(absPath);
  }

  // 检查是否有 typescript-language-server
  try {
    const { execSync } = await import('child_process');
    execSync('which typescript-language-server', { stdio: 'ignore' });
  } catch {
    fail('typescript-language-server not found. Install: npm i -g typescript-language-server typescript');
  }

  // 启动 LSP 服务器
  await manager.start(dir);

  const pos = { line: parseInt(line) - 1, character: parseInt(col) - 1 };

  let result, formatted, count;

  try {
    switch (operation) {
      case 'goto': {
        result = await manager.sendRequest(absFile, 'textDocument/definition', { position: pos });
        formatted = formatGoToDefinition(result);
        count = Array.isArray(result) ? result.length : result ? 1 : 0;
        break;
      }
      case 'refs': {
        result = await manager.sendRequest(absFile, 'textDocument/references', { position: pos });
        formatted = formatFindReferences(result);
        count = result?.length || 0;
        break;
      }
      case 'hover': {
        result = await manager.sendRequest(absFile, 'textDocument/hover', { position: pos });
        formatted = formatHover(result);
        count = result ? 1 : 0;
        break;
      }
      case 'symbols': {
        result = await manager.sendRequest(absFile, 'textDocument/documentSymbol', {});
        formatted = formatDocumentSymbol(result);
        count = result?.length || 0;
        break;
      }
      case 'search': {
        // workspace/symbol 不需要文件路径，用项目内的一个文件
        const anyFile = absFile || findAnyTsFile(dir);
        result = await manager.sendRequest(anyFile, 'workspace/symbol', { query: line }); // line is query here
        formatted = formatWorkspaceSymbol(result);
        count = result?.length || 0;
        break;
      }
      case 'impl': {
        result = await manager.sendRequest(absFile, 'textDocument/implementation', { position: pos });
        formatted = formatGoToDefinition(result); // same format
        count = Array.isArray(result) ? result.length : result ? 1 : 0;
        break;
      }
      case 'calls-in': {
        const items = await manager.sendRequest(absFile, 'textDocument/prepareCallHierarchy', { position: pos });
        if (!items || items.length === 0) {
          formatted = 'No call hierarchy item found';
          count = 0;
          break;
        }
        result = await manager.sendRequest(absFile, 'callHierarchy/incomingCalls', { item: items[0] });
        formatted = formatIncomingCalls(result);
        count = result?.length || 0;
        break;
      }
      case 'calls-out': {
        const items = await manager.sendRequest(absFile, 'textDocument/prepareCallHierarchy', { position: pos });
        if (!items || items.length === 0) {
          formatted = 'No call hierarchy item found';
          count = 0;
          break;
        }
        result = await manager.sendRequest(absFile, 'callHierarchy/outgoingCalls', { item: items[0] });
        formatted = formatOutgoingCalls(result);
        count = result?.length || 0;
        break;
      }
      default:
        fail(`Unknown operation: ${operation}`);
    }

    output({
      operation,
      file: absFile,
      result: formatted,
      count,
    });
  } finally {
    await manager.stop();
  }
}

// ---- 入口 ----

const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  output({
    tool: 'cc-lsp — Claude Code LSP Tool (OpenClaw 移植版)',
    usage: 'cc-lsp.mjs <command> <args>',
    commands: {
      'goto':      'cc-lsp.mjs goto    <file> <line> <col>  — 跳转到定义',
      'refs':      'cc-lsp.mjs refs    <file> <line> <col>  — 查找所有引用',
      'hover':     'cc-lsp.mjs hover   <file> <line> <col>  — 类型信息和文档',
      'symbols':   'cc-lsp.mjs symbols <file>               — 文件内符号列表',
      'search':    'cc-lsp.mjs search  <dir>  <query>        — workspace 符号搜索',
      'impl':      'cc-lsp.mjs impl    <file> <line> <col>  — 查找实现',
      'calls-in':  'cc-lsp.mjs calls-in  <file> <line> <col> — 谁调用了这个函数',
      'calls-out': 'cc-lsp.mjs calls-out <file> <line> <col> — 这个函数调用了谁',
    },
    env: {
      CC_LSP_DEBUG: '设为 1 开启调试日志',
    },
    dependency: 'npm i -g typescript-language-server typescript',
  });
  process.exit(0);
}

try {
  if (cmd === 'search') {
    if (args.length < 2) fail('Usage: search <dir> <query>');
    await run('search', args[0], args[1], '0'); // query passed as "line" param
  } else if (cmd === 'symbols') {
    if (args.length < 1) fail('Usage: symbols <file>');
    await run('symbols', args[0], '1', '1'); // line/col ignored for symbols
  } else {
    if (args.length < 3) fail(`Usage: ${cmd} <file> <line> <col>`);
    await run(cmd, args[0], args[1], args[2]);
  }
} catch (err) {
  output({ error: err.message });
  process.exit(1);
}
