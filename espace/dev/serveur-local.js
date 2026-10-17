/**
 * Serveur local de développement : sert le site et simule le script Google (Code.gs) en mémoire.
 * Lancer : node espace/dev/serveur-local.js [port] [chemin/vers/Import.gs]
 * Puis ouvrir http://localhost:8787/espace/
 * Les codes de connexion envoyés « par e-mail » sont visibles sur http://localhost:8787/__mails
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { charger } = require('./gas-fake');

function demarrer(port, importPath) {
  const root = path.join(__dirname, '..', '..');
  const extra = importPath && fs.existsSync(importPath) ? fs.readFileSync(importPath, 'utf8') : '';
  const srv = charger({ extra });
  srv.run('installer');
  if (extra) srv.run('importerTaches');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

  // Applique la même politique de sécurité que espace/.htaccess, pour détecter toute ressource bloquée.
  const ht = fs.readFileSync(path.join(root, 'espace', '.htaccess'), 'utf8');
  const csp = (ht.match(/Content-Security-Policy "([^"]+)"/) || [])[1];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (csp && url.pathname.startsWith('/espace/')) res.setHeader('Content-Security-Policy', csp);
    if (req.method === 'POST' && url.pathname === '/api') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const out = srv.ctx.doPost({ postData: { contents: body } }).content;
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out);
      });
      return;
    }
    if (url.pathname === '/__mails') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(srv.mails.map((m) => ({ to: m.to, subject: m.subject }))));
      return;
    }
    if (url.pathname === '/espace/config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end("window.ESPACE_CONFIG={API_URL:'/api',GOOGLE_CLIENT_ID:'test'};");
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, srv })));
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8787);
  demarrer(port, process.argv[3]).then(() => console.log('Espace membres local : http://localhost:' + port + '/espace/'));
}
module.exports = { demarrer };
