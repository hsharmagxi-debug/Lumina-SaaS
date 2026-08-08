const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Revert GIS login to Firebase login
html = html.replace(/if \(!window\.handleCredentialResponse\) \{[\s\S]*?const initialView/m, 'const initialView');

html = html.replace(/if \(providerName === 'google'\) \{[\s\S]*?\} else if \(providerName === 'github'\) \{/m, `if (providerName === 'google') {
    auth.signInWithPopup(provider).then((result) => {
      const user = result.user;
      submitInlineAuth(user.displayName || 'User', user.email, user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', 'google');
    }).catch((error) => {
      console.error(error);
      showToast('Login failed: ' + error.message);
    });
    return;
  }
  
  if (providerName === 'github') {`);

fs.writeFileSync('index.html', html);
