#!/usr/bin/env node
/**
 * cc-brief.mjs — Brief 工具（Claude Code 移植版）
 * 
 * 发送带附件的消息。移植自 Claude Code 的 BriefTool。
 * 
 * 命令:
 *   send   <message> [file1] [file2] ...    发送消息+附件
 *   check  <file1> [file2] ...               检查附件是否有效
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { resolve, extname, basename } from 'path';

function output(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function fail(msg) {
  output({ error: msg });
  process.exit(1);
}

function getFileSize(filePath) {
  try { return statSync(filePath).size; } catch { return 0; }
}

function isImage(path) {
  const ext = extname(path).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(ext);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function cmdSend(message, attachmentPaths) {
  const attachments = [];
  const errors = [];
  
  for (const p of (attachmentPaths || [])) {
    const absPath = resolve(p);
    if (!existsSync(absPath)) {
      errors.push(`File not found: ${p}`);
      continue;
    }
    const size = getFileSize(absPath);
    if (size > 100 * 1024 * 1024) {
      errors.push(`File too large (>100MB): ${p}`);
      continue;
    }
    attachments.push({
      path: absPath,
      name: basename(absPath),
      size,
      sizeFormatted: formatSize(size),
      isImage: isImage(absPath),
      type: isImage(absPath) ? 'image' : 'file',
    });
  }
  
  output({
    message,
    attachments,
    errors: errors.length > 0 ? errors : undefined,
    status: 'prepared',
    note: 'Attachments ready. Use the message tool or exec to deliver to the user.',
  });
}

function cmdCheck(attachmentPaths) {
  const results = [];
  
  for (const p of attachmentPaths) {
    const absPath = resolve(p);
    const exists = existsSync(absPath);
    const size = exists ? getFileSize(absPath) : 0;
    
    results.push({
      path: absPath,
      exists,
      size: exists ? size : undefined,
      sizeFormatted: exists ? formatSize(size) : undefined,
      isImage: exists ? isImage(absPath) : undefined,
      valid: exists && size <= 100 * 1024 * 1024,
    });
  }
  
  output({ results });
}

// ---- 入口 ----

const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  output({
    tool: 'cc-brief — Brief 工具（Claude Code 移植版）',
    usage: 'cc-brief.mjs <command> <args>',
    commands: {
      'send':  'cc-brief.mjs send  <message> [file1] [file2] ...  — 发送消息+附件',
      'check': 'cc-brief.mjs check <file1> [file2] ...             — 检查附件有效性',
    },
    notes: {
      message: '要发送的消息，支持 markdown',
      attachments: '文件路径（绝对或相对），支持图片、日志、diff 等',
      limits: '单文件最大 100MB',
    },
  });
  process.exit(0);
}

try {
  switch (cmd) {
    case 'send':
      if (args.length < 1) fail('Usage: send <message> [file1] [file2] ...');
      cmdSend(args[0], args.slice(1));
      break;
    case 'check':
      if (args.length < 1) fail('Usage: check <file1> [file2] ...');
      cmdCheck(args);
      break;
    default:
      fail(`Unknown command: ${cmd}. Run with --help for usage.`);
  }
} catch (err) {
  output({ error: err.message });
  process.exit(1);
}
