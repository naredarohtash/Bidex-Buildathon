const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'src/handler/Middleware.js'), 'utf8');

// Find the _0x4c70 array definition
const arrayMatch = content.match(/function _0x4c70\(\)\{\s*const _0x\w+=\s*(\[[\s\S]*?\]);\s*_0x4c70\s*=\s*function\(\)\{\s*return _0x\w+;\s*\};\s*return _0x4c70\(\);\s*\}/);
if (!arrayMatch) {
  console.error("Failed to find _0x4c70 array");
  process.exit(1);
}

// Find the _0x443e function definition
const fnMatch = content.match(/function _0x443e\([\s\S]*?return _0x\w+;\s*\}/);
if (!fnMatch) {
  console.error("Failed to find _0x443e function");
  process.exit(1);
}

// Evaluate both in a helper context
const arrayStr = `function _0x4c70() { return ${arrayMatch[1]}; }`;
const fnStr = fnMatch[0].replace('function _0x443e', 'const _0x443e = function');

const sandboxCode = `
${arrayStr}
${fnStr}
module.exports = { _0x443e };
`;

fs.writeFileSync('temp-decode.js', sandboxCode);
const { _0x443e } = require('./temp-decode.js');

console.log("Decoded some key strings:");
// Let's print strings from index 0x100 to 0x300
for (let i = 0x100; i < 0x300; i++) {
  try {
    const val = _0x443e(i);
    if (val && val.length > 0) {
      console.log(`0x${i.toString(16)} (${i}): ${JSON.stringify(val)}`);
    }
  } catch (e) {}
}

fs.unlinkSync('temp-decode.js');
