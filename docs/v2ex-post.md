# CCclaw — 我做了一个让 AI 像程序员一样思考的开源工具

## 起因

用 AI 写代码的人应该都有这个痛点：

**AI 上来就改代码，改了一半发现思路不对，白干了。**

或者更常见的情况：AI 用 grep 搜代码，找到了一个函数，改了，结果发现还有 3 个地方引用了这个函数没改。然后你一个个修 bug。

我就想，能不能让 AI **先想清楚再动手**？

做了个开源工具叫 CCclaw，解决这个问题。

## 核心思路

**用规则约束 AI 的行为 + 用专业工具提升 AI 的能力。**

### Plan Mode — 先规划再执行

```
你: "给这个接口加一个重试机制"

传统 AI: 直接开始改代码
CCclaw:  先读代码 → 理解架构 → 出方案 → 等你确认 → 再动手
```

3 步以上的任务自动进入 Plan Mode。简单修复（typo 之类的）直接跳过，不啰嗦。

### 任务追踪

多步任务自动创建清单，实时更新状态：

```
✅ 已完成: 分析现有路由结构
✅ 已完成: 设计重试策略
🔄 进行中: 修改 middleware
⏳ 待办: 更新调用方
⏳ 待办: 跑测试
```

同一时间只有一个"进行中"。卡住了自动标阻塞。

### Git 安全协议

- 禁止 `git push --force`
- 禁止 `git reset --hard`
- 禁止 `--no-verify`
- Commit 前必须先 `git status` + `git diff` + `git log`

### 只读探索模式

需要理解代码时，AI 只能读不能改。避免"我来看看这段代码 → 手滑改了 → 改坏了"。

### LSP 语言服务器

这是和普通 AI 助手最大的区别。不是 grep 瞎搜，而是精准代码导航：

- 跳转到定义（精确匹配）
- 查找所有引用（改函数后检查所有调用方）
- 类型信息（看签名和文档）
- 符号搜索（按名字搜函数/类/变量）
- 调用层级（谁调用了我，我调用了谁）

用 TypeScript Compiler API 实现，支持 8 种操作。

### Notebook 编辑

直接读写 `.ipynb` 文件，支持 cell 的增删改。做数据分析不用手动切 Jupyter。

### 上下文管理

- 会话记忆：结构化模板，长对话不丢上下文
- 上下文压缩：对话太长时智能压缩，保留关键信息
- 记忆提取：自动从对话中提取值得长期保存的信息

## 和现有方案的区别

**Cursor/Copilot：** 没有规划模式，没有多渠道接入，闭源，不能自定义模型

**Claude Code：** 有规划模式，但闭源，不能接入微信/飞书/QQ

**CCclaw：** 有规划模式 + LSP + 多渠道接入 + 开源 + 自定义模型

## 技术栈

- 基于 OpenClaw（MIT License）构建
- 工作流规则是纯 prompt 实现
- LSP 工具用 TypeScript Compiler API
- Apache 2.0 协议

## 安装

一行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/badxtdss/CCclaw/main/install.sh | bash
```

然后 `ccclaw` 打开 webchat。

前置要求：Node.js ≥ 18

GitHub: https://github.com/badxtdss/CCclaw

---

*v0.1.0，还在早期。试了觉得有用或者有建议，欢迎提 Issue。*
