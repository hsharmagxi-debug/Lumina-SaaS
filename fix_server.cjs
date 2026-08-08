const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(
  /if \(process\.env\.NODE_ENV !== "production"\) \{[\s\S]*?\} else \{/m,
  `if (process.env.NODE_ENV !== "production") {
    app.use(express.static(process.cwd()));
  } else {`
);
fs.writeFileSync('server.ts', code);
console.log("Removed Vite middleware from server.ts");
