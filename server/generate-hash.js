/**
 * ==========================================================================
 * CivicFix — Secure Password Hash Generator (generate-hash.js)
 * ==========================================================================
 * Interactively prompts for an administrator password with masked input
 * so the plaintext password is never saved in PowerShell, bash, or terminal
 * command history.
 *
 * Usage:
 *   cd server
 *   node generate-hash.js
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');

console.log('====================================================');
console.log('CivicFix — Secure Password Hash Generator');
console.log('Generates a bcrypt hash without exposing your');
console.log('plaintext password in shell history or command logs.');
console.log('====================================================\n');

function hashAndDisplay(password) {
  if (!password || password.length < 8) {
    console.error('\n❌ Error: Password should be at least 8 characters long for security.\n');
    process.exit(1);
  }

  process.stdout.write('Generating bcrypt salt and hash (10 rounds)... ');
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  console.log('Done!\n');

  console.log('----------------------------------------------------');
  console.log('✅ Generated Hash:');
  console.log(hash);
  console.log('----------------------------------------------------');
  console.log('\nAdd or update this in your server/.env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  console.log('====================================================');
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

if (process.stdin.isTTY) {
  process.stdout.write('Enter desired administrator password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let enteredPassword = '';
  process.stdin.on('data', (char) => {
    char = String(char);
    if (char === '\n' || char === '\r' || char === '\u0004') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      hashAndDisplay(enteredPassword);
    } else if (char === '\u0003') { // Ctrl+C
      process.stdout.write('\nAborted.\n');
      process.exit(0);
    } else if (char === '\u0008' || char === '\u007f') { // Backspace
      if (enteredPassword.length > 0) {
        enteredPassword = enteredPassword.slice(0, -1);
      }
    } else {
      enteredPassword += char;
    }
  });
} else {
  // Non-TTY fallback
  rl.question('Enter desired administrator password: ', (pw) => {
    rl.close();
    hashAndDisplay(pw);
  });
}
