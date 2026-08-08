const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  /if \(btn\) btn\.innerHTML = '<img src="https:\/\/www\.svgrepo\.com\/show\/475656\/google-color\.svg" style="width:18px;height:18px"> Continue with Google';/,
  `if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .5 4.1 1.5l3.1-3.1C17.3 1.6 14.8 1 12 1 7.3 1 3.4 3.7 1.4 7.5l3.9 3C6.2 7 8.9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.8c2.1-2 3.4-4.9 3.4-8.6z"/><path fill="#FBBC05" d="M5.3 14.5c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.4 7C.5 8.8 0 10.8 0 12.9s.5 4.1 1.4 5.9l3.9-3z"/><path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-2.9l-3.7-2.8c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2-6.7-5l-3.9 3C3.4 20.3 7.3 23 12 23z"/></svg> Google Account';`
);

fs.writeFileSync('index.html', html);
console.log("Updated btn HTML");
