const fs = require('fs');
const path = require('path');

const buildOpenclawDir = path.join(__dirname, 'build', 'openclaw');

// 1. 创建 ccclaw-profile.json
const ccclawProfile = {
  name: "ccclaw",
  description: "CCLAW customized OpenClaw profile",
  runtime: {
    type: "ccclaw-opencloud",
    port: 18799,
    serviceName: "ccclaw-gateway"
  },
  features: {
    ccclawExtensions: true,
    graphicalAssistant: true,
    legalComputing: true
  }
};
fs.writeFileSync(path.join(buildOpenclawDir, 'ccclaw-profile.json'), JSON.stringify(ccclawProfile, null, 2));
console.log('✅ ccclaw-profile.json 已创建');

// 2. 修改 openclaw.mjs 使用 ccclaw profile
const openclawPath = path.join(buildOpenclawDir, 'openclaw.mjs');
const content = fs.readFileSync(openclawPath, 'utf-8');
const lines = content.split('\n');

// 插入环境变量
let insertAt = 0;
if (lines[0].startsWith('#!')) insertAt = 1;
while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt++;

lines.splice(insertAt, 0,
  '',
  '// CCLAW 定制 - 使用 ccclaw profile',
  'process.env.OPENCLAW_PROFILE = "ccclaw";',
  'process.env.OPENCLAW_SERVICE_NAME = "ccclaw-gateway";',
  'process.env.CCCLAW_MODE = "packaged";',
  ''
);

fs.writeFileSync(openclawPath, lines.join('\n'));
console.log('✅ openclaw.mjs 已修复');

// 3. 创建 start-ccclaw.sh
const startScript = `#!/bin/bash
export OPENCLAW_PROFILE=ccclaw
export OPENCLAW_SERVICE_NAME=ccclaw-gateway
export CCCLAW_MODE=packaged
PORT="\${1:-18799}"
exec node "\$(dirname "\$0")/openclaw.mjs" gateway --port "\$PORT" --profile ccclaw
`;
fs.writeFileSync(path.join(buildOpenclawDir, 'start-ccclaw.sh'), startScript);
fs.chmodSync(path.join(buildOpenclawDir, 'start-ccclaw.sh'), 0o755);
console.log('✅ start-ccclaw.sh 已创建');

console.log('🎯 CCLAW 内核修复完成！');