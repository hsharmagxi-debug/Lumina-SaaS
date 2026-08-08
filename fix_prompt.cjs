const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(/auth\.signInWithPopup\(provider\)/, `(function(){ provider.setCustomParameters({ prompt: 'select_account' }); return auth.signInWithPopup(provider); })()`);

fs.writeFileSync('index.html', html);
console.log("Updated signInWithPopup");
