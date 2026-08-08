const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  /\(function\(\)\{ const p = new firebase\.auth\.GoogleAuthProvider\(\); p\.setCustomParameters\(\{ prompt: 'select_account' \}\); return auth\.signInWithPopup\(p\); \}\)\(\)/,
  `(function(){ 
      if (auth.currentUser) auth.signOut();
      const p = new firebase.auth.GoogleAuthProvider(); 
      p.setCustomParameters({ prompt: 'select_account' }); 
      return auth.signInWithPopup(p); 
    })()`
);

fs.writeFileSync('index.html', html);
console.log("Updated google provider with signout");
