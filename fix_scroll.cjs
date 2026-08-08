const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(/if \(activeProfileIndex !== null && profiles\.length > 0\) \{/, `if (profiles.length === 0) {
      // Auto-fill the form with their name and scroll to it
      const inpName = document.getElementById('inp-name');
      if (inpName && !inpName.value && currentUser.name) {
        inpName.value = currentUser.name;
      }
      setTimeout(() => {
        scrollToSection('calculator-form');
      }, 300);
    } else if (activeProfileIndex !== null && profiles.length > 0) {`);

fs.writeFileSync('index.html', html);
console.log("Updated checkAuth scroll");
