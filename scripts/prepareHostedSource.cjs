const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'logs/site-template');
fs.mkdirSync(destination, { recursive: true });
// Copy only source needed by the hosted app. Credentials, user records,
// uploaded files, logs, backups and local runtime settings are excluded.
for (const name of ['src', 'package.json', 'package-lock.json', 'index.html', 'vite.config.mts']) {
  fs.cpSync(path.join(root, 'client', name), path.join(destination, 'client', name), { recursive: true });
}
fs.mkdirSync(path.join(destination, 'data'), { recursive: true });
fs.copyFileSync(path.join(root, 'data/bollywood-youtube.json'), path.join(destination, 'data/bollywood-youtube.json'));
console.log(destination);
