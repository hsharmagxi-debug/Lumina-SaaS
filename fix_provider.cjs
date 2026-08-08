const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Add select_account prompt to GoogleAuthProvider
if (!html.includes("provider.setCustomParameters({ prompt: 'select_account' });")) {
  html = html.replace(/const provider = new firebase\.auth\.GoogleAuthProvider\(\);/, 
    "const provider = new firebase.auth.GoogleAuthProvider();\nprovider.setCustomParameters({ prompt: 'select_account' });");
  fs.writeFileSync('index.html', html);
  console.log("Updated GoogleAuthProvider with select_account");
}
