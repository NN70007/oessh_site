/**
 * Simulateur minimal de Google Apps Script pour tester espace/serveur/Code.gs hors de Google.
 * Usage : const gas = require('./gas-fake'); const srv = gas.charger(); srv.post({action:...})
 * Aucune donnée réelle : tout vit en mémoire.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function charger(opts) {
  opts = opts || {};
  const sheets = {};
  const props = {};
  const cache = {};
  const mails = [];
  const github = [];
  const claude = [];
  const gmails = []; // courriels envoyés par GmailApp (Courrier e-mail)
  const googleTokens = opts.googleTokens || {}; // idToken -> infos tokeninfo

  function makeSheet(name) {
    const data = [];
    const sh = {
      name,
      data,
      getMaxRows: () => Math.max(1000, data.length),
      setFrozenRows: () => sh,
      getLastRow: () => data.length,
      getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        const rg = {
          setNumberFormat: () => rg,
          setValues: (vals) => {
            for (let i = 0; i < nr; i++) {
              while (data.length < r + i) data.push([]);
              const row = data[r + i - 1];
              for (let j = 0; j < nc; j++) {
                let v = vals[i][j];
                // Comportement Sheets : l'apostrophe initiale n'est pas conservée dans la valeur.
                if (typeof v === 'string' && /^[=+\-@]/.test(v)) throw new Error('Valeur interprétable comme formule écrite sans protection : ' + v);
                if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);
                row[c + j - 1] = v;
              }
            }
            return rg;
          }
        };
        return rg;
      },
      deleteRow: (r) => { data.splice(r - 1, 1); },
      deleteRows: (r, n) => { data.splice(r - 1, n); }
    };
    return sh;
  }

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/fake',
    getId: () => 'fake'
  };

  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opts.autonome ? null : ss),
      // Fichier des membres (Courrier e-mail) : feuille distincte fournie par opts.membres (tableau de lignes, en-tête compris).
      openById: (id) => (opts.membres && id !== 'fake' ? { getSheets: () => [{ getDataRange: () => ({ getValues: () => opts.membres.map(r => r.slice()) }) }] } : ss),
      create: () => ss
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: (k) => { delete cache[k]; }
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    GmailApp: {
      sendEmail: (to, subject, body, o) => { gmails.push(Object.assign({ to, subject, body }, o || {})); },
      getAliases: () => (opts.aliases || ['envois@oessh.lu'])
    },
    MailApp: {
      sendEmail: (m) => { mails.push(m); },
      getRemainingDailyQuota: () => 100
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        o = o || {};
        if (url.startsWith('https://api.github.com/')) {
          const chemin = decodeURIComponent(url.split('/contents/')[1] || '');
          const methode = (o.method || 'get').toUpperCase();
          let code = 200, body;
          if (methode === 'GET') {
            const f = path.join(__dirname, '..', '..', chemin);
            if (fs.existsSync(f)) body = { sha: 'sha-' + chemin, content: fs.readFileSync(f).toString('base64'), path: chemin };
            else { code = 404; body = { message: 'Not Found' }; }
          } else {
            const p = JSON.parse(o.payload || '{}');
            github.push({ chemin, message: p.message, content: p.content, sha: p.sha, auth: (o.headers || {}).Authorization });
            body = { content: { sha: 'nouveau-sha', path: chemin } };
          }
          return { getResponseCode: () => code, getContentText: () => JSON.stringify(body) };
        }
        if (url.startsWith('https://api.anthropic.com/')) {
          const p = JSON.parse(o.payload || '{}');
          claude.push({ body: p, key: (o.headers || {})['x-api-key'] });
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ content: [{ type: 'text', text: 'Texte rédigé.' }] }) };
        }
        const tok = decodeURIComponent(url.split('id_token=')[1] || '');
        const info = googleTokens[tok];
        return {
          getResponseCode: () => (info ? 200 : 400),
          getContentText: () => JSON.stringify(info || { error: 'invalid_token' })
        };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
      base64Decode: (b64) => Array.from(Buffer.from(b64, 'base64')),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => d.toISOString().slice(0, 10)
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ content: s }) })
    }
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, '..', 'serveur', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });
  if (opts.extra) vm.runInContext(opts.extra, ctx, { filename: 'extra.gs' });

  return {
    ctx, sheets, props, cache, mails, github, claude, gmails,
    run: (fnName) => vm.runInContext(fnName + '()', ctx),
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content),
    lastCode: (email) => {
      const m = mails.filter(x => x.to === email).pop();
      return m ? (m.subject.match(/(\d{6})/) || [])[1] : null;
    }
  };
}

module.exports = { charger };
