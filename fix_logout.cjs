const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Add auth.signOut() to logout function
html = html.replace(/function logout\(\) \{/, "function logout() {\n  if (typeof auth !== 'undefined' && auth) auth.signOut();");

fs.writeFileSync('index.html', html);
console.log("Updated logout()");
