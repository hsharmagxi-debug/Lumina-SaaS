const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Ensure that we show a loading spinner on the google button
html = html.replace(/if \(providerName === 'google'\) \{/, `if (providerName === 'google') {
    const btn = document.querySelector('button[onclick="triggerFederatedLogin(\\'google\\')"]');
    if (btn) btn.innerHTML = '<span class="loader" style="border-color:#000;border-bottom-color:transparent"></span> Connecting...';
`);

html = html.replace(/showToast\('Login failed: ' \+ error\.message\);/, `showToast('Login failed: ' + error.message);
      const btn = document.querySelector('button[onclick="triggerFederatedLogin(\\'google\\')"]');
      if (btn) btn.innerHTML = '<img src="https://www.svgrepo.com/show/475656/google-color.svg" style="width:18px;height:18px"> Continue with Google';`);

fs.writeFileSync('index.html', html);
