/**
 * cc-lsp-manager.mjs — LSP 服务器管理器
 * 
 * 管理 TypeScript/JavaScript 语言服务器 (tsserver) 的生命周期
 * 和通信。移植自 Claude Code 的 LSP 管理器，移除了 Claude Code
 * 运行时依赖。
 * 
 * 支持的语言服务器:
 * - typescript-language-server (tsserver) — TS/JS 项目
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, extname, join } from 'path';
import {
  createProtocolConnection,
  InitializeRequest,
  DidOpenTextDocumentNotification,
  DefinitionRequest,
  ReferencesRequest,
  HoverRequest,
  DocumentSymbolRequest,
  WorkspaceSymbolRequest,
  ImplementationRequest,
  CallHierarchyPrepareRequest,
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest,
} from 'vscode-languageserver-protocol';

// ---- 工具函数 ----

function log(msg) {
  if (process.env.CC_LSP_DEBUG) {
    process.stderr.write(`[cc-lsp] ${msg}\n`);
  }
}

function findConfig(startDir, name) {
  let dir = resolve(startDir);
  while (true) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findNodeModulesBin(dir, name) {
  const binPath = join(dir, 'node_modules', '.bin', name);
  if (existsSync(binPath)) return binPath;
  const parent = dirname(dir);
  if (parent !== dir) return findNodeModulesBin(parent, name);
  return null;
}

// ---- LSP 服务器管理器 ----

class LspServerManager {
  constructor() {
    this.connection = null;
    this.serverProcess = null;
    this.initialized = false;
    this.openFiles = new Map();
    this.rootUri = null;
  }

  /**
   * 启动 typescript-language-server 并建立连接
   */
  async start(projectDir) {
    const absDir = resolve(projectDir);
    this.rootUri = `file://${absDir}`;

    // 找 typescript-language-server
    let serverCmd = findNodeModulesBin(absDir, 'typescript-language-server');
    if (!serverCmd) {
      serverCmd = 'typescript-language-server';
    }

    // 找 typescript 模块路径
    let tsPath = join(absDir, 'node_modules', 'typescript');
    if (!existsSync(join(tsPath, 'lib', 'typescript.js'))) {
      // 尝试全局
      try {
        tsPath = require.resolve('typescript').replace('/lib/typescript.js', '');
      } catch {
        tsPath = null;
      }
    }

    const args = ['--stdio'];
    // 新版 typescript-language-server 自动从 node_modules 找 typescript
    // 旧版需要 --tsserver-path，但新版不支持

    log(`Starting: ${serverCmd} ${args.join(' ')}`);
    log(`TS path: ${tsPath}`);
    log(`Root: ${absDir}`);

    this.serverProcess = spawn(serverCmd, args, {
      cwd: absDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.serverProcess.stderr.on('data', (data) => {
      log(`Server stderr: ${data.toString().trim()}`);
    });

    this.serverProcess.on('exit', (code) => {
      log(`Server exited with code ${code}`);
      this.initialized = false;
      this.connection = null;
    });

    // 创建 LSP 连接（使用 stdio 传输）
    const reader = this.serverProcess.stdout;
    const writer = this.serverProcess.stdin;

    this.connection = createProtocolConnection(
      new StdioMessageReader(reader),
      new StdioMessageWriter(writer),
    );

    this.connection.onError((error) => {
      log(`Connection error: ${JSON.stringify(error)}`);
    });

    this.connection.listen();

    // 发送 initialize 请求
    const initResult = await this.connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          definition: { linkSupport: true },
          references: {},
          hover: { contentFormat: ['markdown', 'plaintext'] },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          implementation: {},
          callHierarchy: {},
        },
        workspace: {
          symbol: {},
        },
      },
      workspaceFolders: [{ uri: this.rootUri, name: basename(absDir) }],
    });

    this.initialized = true;
    log(`Server initialized: ${initResult.serverInfo?.name || 'unknown'}`);
    return initResult;
  }

  /**
   * 打开文件（通知 LSP 服务器）
   */
  async openFile(filePath, content) {
    const absPath = resolve(filePath);
    if (this.openFiles.has(absPath)) return;

    const uri = `file://${absPath}`;
    const ext = extname(absPath);
    const languageId = getLanguageId(ext);

    await this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    this.openFiles.set(absPath, true);
    log(`Opened file: ${absPath} (${languageId})`);
  }

  /**
   * 发送 LSP 请求
   */
  async sendRequest(filePath, method, params) {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP server not initialized');
    }

    const absPath = resolve(filePath);

    // 确保文件已打开
    if (!this.openFiles.has(absPath) && existsSync(absPath)) {
      const content = readFileSync(absPath, 'utf-8');
      await this.openFile(absPath, content);
    }

    // 映射方法到 LSP 请求类型
    const uri = `file://${absPath}`;
    const position = params.position || { line: 0, character: 0 };

    switch (method) {
      case 'textDocument/definition':
        return this.connection.sendRequest(DefinitionRequest.type, {
          textDocument: { uri },
          position,
        });

      case 'textDocument/references':
        return this.connection.sendRequest(ReferencesRequest.type, {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true },
        });

      case 'textDocument/hover':
        return this.connection.sendRequest(HoverRequest.type, {
          textDocument: { uri },
          position,
        });

      case 'textDocument/documentSymbol':
        return this.connection.sendRequest(DocumentSymbolRequest.type, {
          textDocument: { uri },
        });

      case 'workspace/symbol':
        return this.connection.sendRequest(WorkspaceSymbolRequest.type, {
          query: params.query || '',
        });

      case 'textDocument/implementation':
        return this.connection.sendRequest(ImplementationRequest.type, {
          textDocument: { uri },
          position,
        });

      case 'textDocument/prepareCallHierarchy':
        return this.connection.sendRequest(CallHierarchyPrepareRequest.type, {
          textDocument: { uri },
          position,
        });

      case 'callHierarchy/incomingCalls':
        return this.connection.sendRequest(CallHierarchyIncomingCallsRequest.type, {
          item: params.item,
        });

      case 'callHierarchy/outgoingCalls':
        return this.connection.sendRequest(CallHierarchyOutgoingCallsRequest.type, {
          item: params.item,
        });

      default:
        throw new Error(`Unknown LSP method: ${method}`);
    }
  }

  /**
   * 关闭服务器
   */
  async stop() {
    if (this.connection) {
      try {
        await this.connection.shutdown();
        await this.connection.exit();
      } catch {}
    }
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    this.initialized = false;
    this.connection = null;
    this.serverProcess = null;
  }
}

// ---- stdio 传输层 (使用 vscode-jsonrpc 的 AbstractMessageReader/Writer) ----

import {
  AbstractMessageReader,
  AbstractMessageWriter,
} from 'vscode-jsonrpc';

class StdioMessageReader extends AbstractMessageReader {
  constructor(stream) {
    super();
    this.stream = stream;
    this.buffer = Buffer.alloc(0);
    this._callback = null;
  }

  listen(callback) {
    this._callback = callback;
    this.stream.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._parseMessages();
    });
    this.stream.on('error', (err) => {
      this.fireError(err);
    });
    this.stream.on('close', () => {
      this.fireClose();
    });
  }

  _parseMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headerStr = this.buffer.slice(0, headerEnd).toString('utf-8');
      const contentLengthMatch = headerStr.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;

      if (this.buffer.length < messageStart + contentLength) break;

      const messageStr = this.buffer.slice(messageStart, messageStart + contentLength).toString('utf-8');
      this.buffer = this.buffer.slice(messageStart + contentLength);

      try {
        const message = JSON.parse(messageStr);
        if (this._callback) this._callback(message);
      } catch (err) {
        log(`Failed to parse message: ${err.message}`);
      }
    }
  }
}

class StdioMessageWriter extends AbstractMessageWriter {
  constructor(stream) {
    super();
    this.stream = stream;
  }

  write(msg) {
    const content = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf-8')}\r\n\r\n`;
    this.stream.write(header + content);
    return Promise.resolve();
  }
}

// ---- 辅助函数 ----

function getLanguageId(ext) {
  const map = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.mts': 'typescript',
    '.json': 'json',
  };
  return map[ext] || 'plaintext';
}

function basename(p) {
  return p.split('/').pop();
}

// ---- 导出 ----

export { LspServerManager };
