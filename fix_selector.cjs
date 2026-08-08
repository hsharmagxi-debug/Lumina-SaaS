const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/button\[onclick="triggerFederatedLogin\(\\'google\\'\)"\]/g, 'div[onclick="triggerFederatedLogin(\\\'google\\\')"]');
fs.writeFileSync('index.html', html);
console.log("Fixed selector");
