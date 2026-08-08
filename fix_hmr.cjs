const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(
  'server: { middlewareMode: true },',
  'server: { middlewareMode: true, hmr: false, watch: null },'
);
fs.writeFileSync('server.ts', code);
console.log("HMR disabled in server.ts");
