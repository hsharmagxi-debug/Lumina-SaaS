const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I also noticed in triggerFederatedLogin we don't hide the auth-initial-view if google is clicked (it returns early)
// Let's make sure it hides initial view and shows a loading state if they want, but the original code had:
/*
  if (providerName === 'google') {
    auth.signInWithPopup(provider)...
    return;
  }
*/
// Which means the UI doesn't change until popup resolves. That's fine.
