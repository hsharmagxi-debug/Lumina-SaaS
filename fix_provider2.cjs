const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

if (!html.includes("provider.setCustomParameters({ prompt: 'select_account' });")) {
  html = html.replace(/provider = new firebase\.auth\.GoogleAuthProvider\(\);/, 
    "provider = new firebase.auth.GoogleAuthProvider();\n  provider.setCustomParameters({ prompt: 'select_account' });");
  fs.writeFileSync('index.html', html);
  console.log("Updated GoogleAuthProvider with select_account!");
} else {
  console.log("Already updated.");
}
