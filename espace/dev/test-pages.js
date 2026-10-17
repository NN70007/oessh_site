/* Test navigateur des pages de l'espace membres avec le serveur simulé.
   Lancer : NODE_PATH=$(npm root -g) node espace/dev/test-pages.js [dossier-captures] */
'use strict';
const assert = require('assert');
const { chromium } = require('playwright');
const { demarrer } = require('./serveur-local');

const PORT = 8799, BASE = 'http://localhost:' + PORT;
const shots = process.argv[2];
// Données fictives uniquement (aucune donnée réelle dans le dépôt).
const FAUX = [
  ['f1', 'Tâche fictive liturgie', 'liturgie', '', '2027-03-01', 'afaire', '', 'Test'],
  ['f2', 'Tâche fictive du contributeur', 'candidats', 'Joris Buyse', '2027-01-31', 'afaire', '', 'Test'],
  ['f3', 'Tâche fictive d\'un autre', 'liturgie', 'Personne Autre', '2027-06-01', 'afaire', '', 'Test'],
  ['f4', 'Transport fictif', 'accueil', '', '2027-06-15', 'afaire', '', 'Test'],
  ['f5', 'Tâche fictive libre', 'com', '', '2027-04-30', 'afaire', '', 'Test']
];
const extra = 'function importerTaches(){var T=' + JSON.stringify(FAUX) + ';T.forEach(function(r){ajouter_("Taches",{Id:r[0],Titre:r[1],Pole:r[2],Responsables:r[3],Echeance:r[4],Statut:r[5],Note:r[6],Source:r[7],MajLe:"0",MajPar:"test"});});}';
const fs = require('fs'), os = require('os'), path = require('path');
const importPath = path.join(os.tmpdir(), 'import-fictif.gs');
fs.writeFileSync(importPath, extra);
let n = 0;
function ok(c, m) { assert.ok(c, m); n++; console.log('  ✓ ' + m); }

(async () => {
  const { server, srv } = await demarrer(PORT, importPath);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const errors = [];
  async function page(w) {
    const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    return p;
  }
  async function login(p, email) {
    await p.goto(BASE + '/espace/');
    await p.fill('#in-email', email);
    await p.click('#btn-code');
    await p.waitForSelector('#f-code:not([hidden])');
    const code = srv.lastCode(email);
    await p.fill('#in-code', code);
    await p.click('#btn-verif');
    await p.waitForSelector('#home:not([hidden])');
  }

  console.log('Organisateur');
  let p = await page();
  await p.goto(BASE + '/espace/');
  ok(await p.isVisible('#login'), 'page de connexion affichée sans session');
  await p.goto(BASE + '/espace/investiture.html');
  await p.waitForURL(/\/espace\/$/);
  ok(true, 'la page investiture renvoie vers la connexion sans session');
  await p.fill('#in-email', 'inconnu@example.lu'); await p.click('#btn-code');
  await p.waitForSelector('#f-code:not([hidden])');
  ok(srv.mails.length === 0, 'adresse inconnue : aucun e-mail, même écran');
  await login(p, 'jb.niedercorn@gmail.com');
  ok(await p.locator('.tile').count() === 3, 'trois tuiles pour l\'administrateur (investiture, site, accès)');
  if (shots) await p.screenshot({ path: shots + '/1-accueil.png', fullPage: true });

  await p.click('a.tile[href="investiture.html"]');
  await p.waitForSelector('.hero-grid');
  await p.waitForSelector('.poles');
  const total = await p.locator('.ring-wrap .cap strong').nth(1).innerText();
  ok(total === String(FAUX.length), 'les tâches sont chargées depuis le serveur');
  if (shots) await p.screenshot({ path: shots + '/2-investiture.png', fullPage: true });

  await p.click('button.nav-tab[data-tab="poles"]');
  const firstTodo = p.locator('#pole-liturgie .task').filter({ hasText: 'Tâche fictive liturgie' });
  await firstTodo.locator('button[data-st="fait"]').click();
  await p.waitForFunction(() => /Enregistré/.test(document.getElementById('toast')?.textContent || ''));
  ok(srv.sheets.Taches.data.some(r => r[1] === 'Tâche fictive liturgie' && r[5] === 'fait'), 'clic sur « Fait » enregistré dans la feuille');

  const bus = p.locator('#pole-accueil .task').filter({ hasText: 'Transport fictif' });
  await bus.locator('button[data-act="edit"]').click();
  await p.waitForSelector('dialog[open]');
  await p.click('#f-people label:has-text("Jean-Baptiste Niedercorn")');
  await p.click('#f-add-mate');
  await p.fill('#crew-nom-0', 'Charles Chauffeur'); await p.fill('#crew-role-0', 'chauffeur'); await p.fill('#crew-tel-0', '+352 621 000 000');
  await p.click('#f-add-mate');
  await p.fill('#crew-nom-1', 'Bernard Volant'); await p.fill('#crew-role-1', 'chauffeur');
  await p.click('#f-save');
  await p.waitForFunction(() => /Enregistré/.test(document.getElementById('toast')?.textContent || ''));
  ok(srv.sheets.Intervenants.data.length === 3, 'deux intervenants enregistrés (feuille Intervenants)');
  await p.click('button.nav-tab[data-tab="contacts"]');
  await p.waitForSelector('.contact-card');
  ok((await p.locator('.contact-card').innerText()).includes('+352 621 000 000'), 'onglet Équipes & contacts : téléphone affiché');
  ok((await p.locator('.contact-card').innerText()).includes('à compléter'), 'téléphone manquant signalé');
  if (shots) await p.screenshot({ path: shots + '/3-contacts.png', fullPage: true });

  console.log('Accès');
  await p.goto(BASE + '/espace/acces.html');
  await p.waitForSelector('table.acc');
  async function ajouter(nom, email, inv) {
    await p.click('#btn-add'); await p.fill('#p-nom', nom); await p.fill('#p-email', email); await p.selectOption('#p-inv', inv);
    await p.click('#f button[type="submit"]'); await p.waitForFunction((e) => document.querySelector('table.acc')?.innerText.includes(e), email);
  }
  await ajouter('Joris Buyse', 'joris@example.lu', 'contributeur');
  await ajouter('Charles Chauffeur', 'chauffeur@example.lu', 'intervenant');
  ok(await p.locator('table.acc tbody tr').count() === 3, 'deux personnes ajoutées depuis la page Accès');
  await p.locator('button[data-email="jb.niedercorn@oessh.lu"]').click();
  ok(await p.isDisabled('#p-gest'), 'on ne peut pas se retirer soi-même le droit de gestion');
  await p.click('#p-cancel');
  await p.locator('button[data-email="joris@example.lu"]').click();
  await p.click('#p-logout');
  await p.waitForFunction(() => /session|Aucune session/.test(document.getElementById('toast')?.textContent || ''));
  ok(true, 'bouton « Déconnecter partout »');
  ok((await p.locator('#journal').innerText()).includes('ajoute'), 'journal des changements de droits');
  if (shots) await p.screenshot({ path: shots + '/4-acces.png', fullPage: true });
  await p.click('#btn-logout'); await p.waitForSelector('#login:not([hidden])');
  ok(true, 'déconnexion');

  console.log('Contributeur');
  await login(p, 'joris@example.lu');
  ok(await p.locator('.tile').count() === 1, 'contributeur : une seule tuile (investiture)');
  await p.evaluate(() => localStorage.removeItem('inv27_view'));
  await p.goto(BASE + '/espace/investiture.html');
  await p.waitForSelector('.poles');
  await p.click('button.nav-tab[data-tab="poles"]');
  const own = p.locator('.task').filter({ hasText: 'Tâche fictive du contributeur' });
  ok(await own.locator('.seg').count() === 1, 'il peut changer l\'état de ses tâches');
  const other = p.locator('.task').filter({ hasText: 'Tâche fictive d\'un autre' });
  ok(await other.locator('.seg').count() === 0 && await other.locator('.st-pill').count() === 1, 'il ne peut pas changer les tâches des autres');
  await p.click('button.nav-tab[data-tab="qui"]');
  const nFree = await p.locator('.free-card').count();
  await p.locator('.free-card button[data-act="take"]').first().click();
  await p.waitForFunction((k) => document.querySelectorAll('.free-card').length === k - 1, nFree);
  ok(true, 'il peut prendre une tâche libre');
  ok(await p.locator('select[data-act="assign"]').count() === 0, 'il ne peut pas attribuer à d\'autres');
  await p.click('#btn-logout'); await p.waitForSelector('#login:not([hidden])');

  console.log('Intervenant');
  await login(p, 'chauffeur@example.lu');
  await p.evaluate(() => localStorage.removeItem('inv27_view'));
  await p.goto(BASE + '/espace/investiture.html');
  await p.waitForSelector('.poles');
  ok((await p.locator('.ring-wrap .cap strong').nth(1).innerText()) === '1', 'l\'intervenant ne voit que la tâche où il intervient');
  ok(await p.locator('button[data-act="new"]').count() === 0, 'pas de bouton Nouvelle tâche');
  await p.click('#btn-logout');

  console.log('Téléphone');
  const m = await page(390);
  await login(m, 'jb.niedercorn@gmail.com');
  await m.evaluate(() => localStorage.removeItem('inv27_view'));
  await m.goto(BASE + '/espace/investiture.html');
  await m.waitForSelector('.poles');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 1, 'pas de défilement horizontal sur téléphone');
  if (shots) await m.screenshot({ path: shots + '/5-mobile.png', fullPage: false });
  await m.goto(BASE + '/espace/');
  if (shots) await m.screenshot({ path: shots + '/6-mobile-accueil.png', fullPage: false });

  ok(errors.length === 0, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  await browser.close(); server.close();
  console.log('\n' + n + ' vérifications réussies.');
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
