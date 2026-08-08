const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  /showToast\('Login failed: ' \+ error\.message\);/,
  `if (error.code === 'auth/popup-closed-by-user') {
        showToast('Sign-in cancelled.');
      } else {
        showToast('Login failed: ' + error.message);
      }`
);

fs.writeFileSync('index.html', html);
console.log("Updated error handling");
