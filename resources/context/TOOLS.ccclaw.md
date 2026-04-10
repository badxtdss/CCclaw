## CCCLAW Tool Notes

### uv (Python)
- `uv` is bundled with CCCLAW and on PATH. Do NOT use bare `python` or `pip`.
- Run scripts: `uv run python <script>` | Install packages: `uv pip install <package>`

### Browser
- `browser` tool provides full automation (scraping, form filling, testing) via an isolated managed browser.
- Flow: `action="start"` → `action="snapshot"` (see page + get element refs like `e12`) → `action="act"` (click/type using refs).
- Open new tabs: `action="open"` with `targetUrl`.

### LSP Code Navigation
- Tool: `cc-lsp.mjs` (bundled with CCCLAW)
- Commands: `goto <file> <line> <col>`, `refs <file> <line> <col>`, `hover <file> <line> <col>`, `symbols <file>`, `search <dir> <query>`, `impl <file> <line> <col>`, `calls-in <file> <line> <col>`, `calls-out <file> <line> <col>`
- Best for TypeScript/JavaScript projects with tsconfig.json

### Cron / Scheduled Tasks
- `cron` tool: add/list/update/remove/run jobs
- Schedule types: `at` (one-shot), `every` (interval), `cron` (expression)
- Session targets: `main` (systemEvent), `isolated` (agentTurn), `current`
