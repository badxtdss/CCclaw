#!/usr/bin/env node
/**
 * cc-notebook.mjs — Jupyter Notebook 编辑工具
 * 
 * 移植自 Claude Code 的 NotebookEditTool，用于读取和编辑 .ipynb 文件。
 * 
 * 命令:
 *   read     <notebook>                     读取 notebook 内容
 *   info     <notebook>                     获取 notebook 元信息
 *   replace  <notebook> <cell_id> <source>  替换指定 cell 的内容
 *   insert   <notebook> <cell_type> <source> [after_cell_id]  插入新 cell
 *   delete   <notebook> <cell_id>           删除指定 cell
 *   list     <notebook>                     列出所有 cell
 */

import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, extname } from 'path';

// ---- 输出 ----
function output(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function fail(msg) {
  output({ error: msg });
  process.exit(1);
}

// ---- 核心函数 ----

function readNotebook(path) {
  if (!existsSync(path)) fail(`Notebook not found: ${path}`);
  if (extname(path) !== '.ipynb') fail('File must be a .ipynb file');
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    fail(`Failed to parse notebook: ${e.message}`);
  }
}

function writeNotebook(path, notebook) {
  writeFileSync(path, JSON.stringify(notebook, null, 1), 'utf-8');
}

function findCellIndex(notebook, cellId) {
  // 先按 id 查找
  let idx = notebook.cells.findIndex(c => c.id === cellId);
  if (idx !== -1) return idx;
  
  // 尝试 cell-N 格式（按索引查找）
  const match = cellId?.match(/^cell-(\d+)$/);
  if (match) {
    const numIdx = parseInt(match[1], 10);
    if (numIdx >= 0 && numIdx < notebook.cells.length) return numIdx;
  }
  
  // 尝试纯数字索引
  const directIdx = parseInt(cellId, 10);
  if (!isNaN(directIdx) && directIdx >= 0 && directIdx < notebook.cells.length) {
    return directIdx;
  }
  
  return -1;
}

function generateCellId() {
  return Math.random().toString(36).substring(2, 15);
}

function getLanguage(notebook) {
  return notebook.metadata?.language_info?.name || 'python';
}

// ---- 命令实现 ----

function cmdRead(notebookPath) {
  const nb = readNotebook(notebookPath);
  const cells = nb.cells.map((cell, i) => {
    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    return {
      index: i,
      id: cell.id || `cell-${i}`,
      type: cell.cell_type,
      source: source,
      lines: source.split('\n').length,
    };
  });
  
  output({
    notebook: notebookPath,
    nbformat: `${nb.nbformat}.${nb.nbformat_minor}`,
    language: getLanguage(nb),
    kernel: nb.metadata?.kernelspec?.name || 'unknown',
    cellCount: cells.length,
    cells,
  });
}

function cmdInfo(notebookPath) {
  const nb = readNotebook(notebookPath);
  const codeCells = nb.cells.filter(c => c.cell_type === 'code').length;
  const mdCells = nb.cells.filter(c => c.cell_type === 'markdown').length;
  
  output({
    notebook: notebookPath,
    nbformat: `${nb.nbformat}.${nb.nbformat_minor}`,
    language: getLanguage(nb),
    kernel: nb.metadata?.kernelspec?.name || 'unknown',
    totalCells: nb.cells.length,
    codeCells,
    markdownCells: mdCells,
  });
}

function cmdList(notebookPath) {
  const nb = readNotebook(notebookPath);
  
  output({
    notebook: notebookPath,
    cells: nb.cells.map((cell, i) => {
      const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
      const firstLine = source.split('\n')[0]?.slice(0, 80) || '(empty)';
      return {
        index: i,
        id: cell.id || `cell-${i}`,
        type: cell.cell_type,
        preview: firstLine,
      };
    }),
  });
}

function cmdReplace(notebookPath, cellId, newSource) {
  const nb = readNotebook(notebookPath);
  const idx = findCellIndex(nb, cellId);
  
  if (idx === -1) fail(`Cell not found: ${cellId}`);
  
  const cell = nb.cells[idx];
  const oldSource = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
  
  cell.source = newSource;
  
  // 如果是 code cell，重置执行状态
  if (cell.cell_type === 'code') {
    cell.execution_count = null;
    cell.outputs = [];
  }
  
  writeNotebook(notebookPath, nb);
  
  output({
    operation: 'replace',
    notebook: notebookPath,
    cellId: cell.id || `cell-${idx}`,
    cellType: cell.cell_type,
    language: getLanguage(nb),
    oldSource: oldSource.slice(0, 200) + (oldSource.length > 200 ? '...' : ''),
    newSource: newSource.slice(0, 200) + (newSource.length > 200 ? '...' : ''),
    status: 'updated',
  });
}

function cmdInsert(notebookPath, cellType, newSource, afterCellId) {
  const nb = readNotebook(notebookPath);
  
  let insertIdx = 0;
  if (afterCellId) {
    const idx = findCellIndex(nb, afterCellId);
    if (idx === -1) fail(`Cell not found: ${afterCellId}`);
    insertIdx = idx + 1;
  }
  
  const newId = (nb.nbformat >= 4 && nb.nbformat_minor >= 5) 
    ? generateCellId() 
    : undefined;
  
  let newCell;
  if (cellType === 'markdown') {
    newCell = {
      cell_type: 'markdown',
      id: newId,
      source: newSource,
      metadata: {},
    };
  } else {
    newCell = {
      cell_type: 'code',
      id: newId,
      source: newSource,
      metadata: {},
      execution_count: null,
      outputs: [],
    };
  }
  
  nb.cells.splice(insertIdx, 0, newCell);
  writeNotebook(notebookPath, nb);
  
  output({
    operation: 'insert',
    notebook: notebookPath,
    cellId: newCell.id || `cell-${insertIdx}`,
    cellType,
    language: getLanguage(nb),
    insertedAt: insertIdx,
    totalCells: nb.cells.length,
    status: 'inserted',
  });
}

function cmdDelete(notebookPath, cellId) {
  const nb = readNotebook(notebookPath);
  const idx = findCellIndex(nb, cellId);
  
  if (idx === -1) fail(`Cell not found: ${cellId}`);
  
  const deleted = nb.cells.splice(idx, 1)[0];
  writeNotebook(notebookPath, nb);
  
  output({
    operation: 'delete',
    notebook: notebookPath,
    deletedCellId: deleted.id || `cell-${idx}`,
    deletedCellType: deleted.cell_type,
    remainingCells: nb.cells.length,
    status: 'deleted',
  });
}

// ---- 入口 ----

const [,, cmd, ...args] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  output({
    tool: 'cc-notebook — Jupyter Notebook 编辑工具（Claude Code 移植版）',
    usage: 'cc-notebook.mjs <command> <args>',
    commands: {
      'read':    'cc-notebook.mjs read    <notebook>                        — 读取全部 cell',
      'info':    'cc-notebook.mjs info    <notebook>                        — notebook 元信息',
      'list':    'cc-notebook.mjs list    <notebook>                        — 列出所有 cell（简要）',
      'replace': 'cc-notebook.mjs replace <notebook> <cell_id> <source>     — 替换 cell 内容',
      'insert':  'cc-notebook.mjs insert  <notebook> <type> <source> [after_id] — 插入新 cell',
      'delete':  'cc-notebook.mjs delete  <notebook> <cell_id>              — 删除 cell',
    },
    notes: {
      cell_id: 'cell 的 id 属性，或 cell-N（N 为索引），或纯数字索引',
      cell_type: 'code 或 markdown',
      source: '新内容（用引号包裹多行内容）',
    },
  });
  process.exit(0);
}

try {
  switch (cmd) {
    case 'read':
      if (args.length < 1) fail('Usage: read <notebook>');
      cmdRead(resolve(args[0]));
      break;
    case 'info':
      if (args.length < 1) fail('Usage: info <notebook>');
      cmdInfo(resolve(args[0]));
      break;
    case 'list':
      if (args.length < 1) fail('Usage: list <notebook>');
      cmdList(resolve(args[0]));
      break;
    case 'replace':
      if (args.length < 3) fail('Usage: replace <notebook> <cell_id> <source>');
      cmdReplace(resolve(args[0]), args[1], args[2]);
      break;
    case 'insert':
      if (args.length < 3) fail('Usage: insert <notebook> <type> <source> [after_id]');
      cmdInsert(resolve(args[0]), args[1], args[2], args[3]);
      break;
    case 'delete':
      if (args.length < 2) fail('Usage: delete <notebook> <cell_id>');
      cmdDelete(resolve(args[0]), args[1]);
      break;
    default:
      fail(`Unknown command: ${cmd}. Run with --help for usage.`);
  }
} catch (err) {
  output({ error: err.message });
  process.exit(1);
}
