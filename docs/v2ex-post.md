# CCclaw — 我做了一个让 AI 像程序员一样思考的工具

## 起因

用 AI 写代码的人都有这个痛点：

**AI 上来就改代码，改了一半发现思路不对，白干了。**

或者更常见的情况：AI 用 grep 搜代码，找到了一个函数，改了，结果发现还有 3 个地方引用了这个函数没改。然后你一个个修 bug。

我就想，能不能让 AI **先想清楚再动手**？

## 做了什么

CCclaw 是一个基于 [OpenClaw](https://github.com/openclaw/openclaw) 的 AI 编程助手，在开源框架上加了 14 个编程工作流规则和 3 个专业开发工具。

### 工作流规则

核心思路是**用规则约束 AI 的行为**：

**Plan Mode（先规划再动手）**
```
你: "给这个接口加一个重试机制"

传统 AI: 直接开始改代码
CCclaw:  先读代码 → 理解架构 → 出方案 → 等你确认 → 再动手
```

3 步以上的任务自动进入 Plan Mode。简单修复（typo 之类的）直接跳过，不啰嗦。

**任务追踪**
```
✅ 已完成: 分析现有路由结构
✅ 已完成: 设计重试策略
🔄 进行中: 修改 middleware
⏳ 待办: 更新调用方
⏳ 待办: 跑测试
```

多步任务自动创建清单，同一时间只有一个"进行中"。卡住了自动标阻塞。

**Git 安全协议**
- 禁止 `git push --force`
- 禁止 `git reset --hard`
- 禁止 `--no-verify`
- Commit 前必须先 `git status` + `git diff` + `git log`

**只读探索模式**
需要理解代码时，AI 只能读不能改。避免"我来看看这段代码 → 手滑改了 → 改坏了"的情况。

### 专业工具

**LSP 语言服务器**
这是和 grep 最大的区别。LSP 能做：
- 跳转到定义（不是模糊匹配，是精确的）
- 查找所有引用（改函数后检查所有调用方）
- 类型信息（鼠标悬停看签名）
- 符号搜索（按名字搜函数/类/变量）
- 调用层级（谁调用了我，我调用了谁）

支持 8 种操作，用 TypeScript Compiler API 实现。

**Notebook 编辑**
直接读写 `.ipynb` 文件，支持 cell 的增删改。做数据分析的时候不用手动切到 Jupyter 了。

**Brief 附件**
完成任务后如果有生成的文件（图片、日志、报告），自动附带发送。

### 上下文管理

**会话记忆** — 结构化模板（Current State / Task / Files / Errors / Learnings），长对话不丢上下文。

**上下文压缩** — 对话太长时智能压缩，保留关键信息（文件路径、代码片段、用户反馈），丢弃冗余的探索过程。

**记忆提取** — 从对话中自动提取值得长期保存的信息（用户偏好、项目决策、踩坑经验）。

## 技术细节

- 基于 OpenClaw（MIT License）构建
- 工作流规则是纯 prompt 实现，零代码
- LSP 工具用 TypeScript Compiler API，支持 TS/JS 项目
- Notebook 工具纯 Node.js，无外部依赖
- Apache 2.0 协议

## 和现有方案的区别

| | Cursor/Copilot | Claude Code | CCclaw |
|---|---|---|---|
| 先规划再执行 | ❌ | ✅ | ✅ |
| LSP 代码导航 | ✅ | ✅ | ✅ |
| 多渠道接入 | ❌ | ❌ | ✅（微信/飞书/QQ等）|
| 持久化记忆 | ❌ | 有限 | ✅ |
| 定时任务 | ❌ | ✅ | ✅ |
| 开源 | ❌ | ❌ | ✅ |
| 自定义模型 | 有限 | ❌ | ✅ |

## 试用

一行命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/badxtdss/CCclaw/main/install.sh | bash
```

然后 `ccclaw` 打开 webchat。

GitHub: https://github.com/badxtdss/CCclaw

---

*这是 v0.1.0，还在早期。如果你试了觉得有用或者有建议，欢迎提 Issue。*
