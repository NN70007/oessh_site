/* Tests du serveur (Code.gs) avec le simulateur. Lancer : node espace/dev/test-serveur.js */
'use strict';
const assert = require('assert');
const { charger } = require('./gas-fake');

const CLIENT = '52829295071-cer9p7voptd0lgdrmgk5a35furmtn256.apps.googleusercontent.com';
const futur = String(Math.floor(Date.now() / 1000) + 3600);
const srv = charger({
  googleTokens: {
    'tok-jb': { aud: CLIENT, iss: 'https://accounts.google.com', email: 'jb.niedercorn@gmail.com', email_verified: 'true', exp: futur },
    'tok-autre-app': { aud: 'autre-client', iss: 'https://accounts.google.com', email: 'jb.niedercorn@gmail.com', email_verified: 'true', exp: futur },
    'tok-inconnu': { aud: CLIENT, iss: 'accounts.google.com', email: 'pirate@example.com', email_verified: 'true', exp: futur },
    'tok-non-verifie': { aud: CLIENT, iss: 'accounts.google.com', email: 'jb.niedercorn@gmail.com', email_verified: 'false', exp: futur }
  }
});
let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); }

console.log('Installation');
srv.run('installer');
ok(srv.sheets.Acces.data.length === 2, 'onglet Acces créé avec l\'administrateur initial (deux adresses)');
ok(srv.sheets.Jalons.data.length === 9, 'jalons par défaut créés');
srv.run('installer');
ok(srv.sheets.Acces.data.length === 2, 'réinstaller ne duplique rien');

console.log('Connexion Google');
let r = srv.post({ action: 'auth.google', idToken: 'tok-jb' });
ok(r.ok && r.token && r.user.gestion && r.user.inv === 'organisateur', 'jeton Google valide → session avec tous les droits');
const tJB = r.token;
ok(!srv.post({ action: 'auth.google', idToken: 'tok-autre-app' }).ok, 'jeton émis pour une autre application refusé');
ok(!srv.post({ action: 'auth.google', idToken: 'tok-non-verifie' }).ok, 'adresse non vérifiée refusée');
r = srv.post({ action: 'auth.google', idToken: 'tok-inconnu' });
ok(!r.ok && r.code === 'non_autorise', 'compte Google non autorisé refusé');
ok(!srv.post({ action: 'auth.google', idToken: 'faux' }).ok, 'jeton forgé refusé');
ok(Object.keys(srv.props).every(k => !k.includes(tJB)), 'le jeton de session n\'est pas stocké en clair');

console.log('Sans session');
ok(srv.post({ action: 'inv.charger' }).code === 'session', 'aucune donnée sans session');
ok(srv.post({ action: 'inv.charger', token: 'n-importe-quoi' }).code === 'session', 'aucune donnée avec une session inventée');

console.log('Gestion des accès');
const add = (p) => srv.post({ action: 'acces.enregistrer', token: tJB, personne: p });
ok(add({ email: 'Joris@Example.lu', nom: 'Joris Buyse', inv: 'contributeur', site: {}, gestion: false }).ok, 'ajout d\'un contributeur');
ok(add({ email: 'lecteur@example.lu', nom: 'Lucie Lecture', inv: 'lecture', site: {} }).ok, 'ajout d\'un lecteur');
ok(add({ email: 'chauffeur@example.lu', nom: 'Charles Chauffeur', inv: 'intervenant', site: {} }).ok, 'ajout d\'un intervenant');
ok(add({ email: 'site@example.lu', nom: 'Sam Site', inv: '', site: { actualites: true } }).ok, 'ajout d\'un éditeur du site seulement');
r = add({ email: 'jb.niedercorn@gmail.com', nom: 'JB', inv: 'organisateur', site: {}, gestion: false });
ok(!r.ok, 'impossible de retirer ses propres droits de gestion');
ok(!srv.post({ action: 'acces.supprimer', token: tJB, email: 'jb.niedercorn@oessh.lu' }).ok, 'impossible de supprimer son propre accès');
r = srv.post({ action: 'acces.lister', token: tJB });
ok(r.ok && r.personnes.length === 5 && r.journal.length > 0, 'liste des accès et journal');

console.log('Connexion par code');
r = srv.post({ action: 'auth.demanderCode', email: 'joris@example.lu' });
ok(r.ok && srv.mails.length === 1, 'code envoyé à une adresse autorisée');
r = srv.post({ action: 'auth.demanderCode', email: 'inconnu@example.lu' });
ok(r.ok && srv.mails.length === 1, 'adresse inconnue : même réponse, aucun e-mail envoyé');
ok(!srv.post({ action: 'auth.verifierCode', email: 'joris@example.lu', code: '000000' }).ok, 'mauvais code refusé');
const code = srv.lastCode('joris@example.lu');
r = srv.post({ action: 'auth.verifierCode', email: 'JORIS@example.lu', code });
ok(r.ok && r.user.inv === 'contributeur', 'bon code → session contributeur');
const tJoris = r.token;
ok(!srv.post({ action: 'auth.verifierCode', email: 'joris@example.lu', code }).ok, 'un code ne sert qu\'une fois');
srv.post({ action: 'auth.demanderCode', email: 'lecteur@example.lu' });
for (let i = 0; i < 5; i++) srv.post({ action: 'auth.verifierCode', email: 'lecteur@example.lu', code: '111111' });
ok(!srv.post({ action: 'auth.verifierCode', email: 'lecteur@example.lu', code: srv.lastCode('lecteur@example.lu') }).ok, 'code bloqué après 5 essais');
for (let i = 0; i < 6; i++) r = srv.post({ action: 'auth.demanderCode', email: 'site@example.lu' });
ok(!r.ok && r.code === 'limite', 'limite de demandes de code par heure');
const login = (email) => { srv.cache['otpn:' + email] = '0'; srv.post({ action: 'auth.demanderCode', email }); return srv.post({ action: 'auth.verifierCode', email, code: srv.lastCode(email) }).token; };
const tLect = login('lecteur@example.lu');
const tChauf = login('chauffeur@example.lu');
const tSite = login('site@example.lu');

console.log('Investiture : droits');
r = srv.post({ action: 'inv.enregistrer', token: tJB, tache: { titre: '=HYPERLINK("x")', pole: 'accueil', resp: ['Joris Buyse'], echeance: '2027-06-15', statut: 'afaire', note: '+352 au téléphone', equipe: [{ nom: 'Charles Chauffeur', role: 'chauffeur', tel: '+352 621 000 000' }] } });
ok(r.ok, 'organisateur crée une tâche (saisies commençant par = et + neutralisées)');
const idJ = r.id;
r = srv.post({ action: 'inv.enregistrer', token: tJB, tache: { titre: 'Fleurs', pole: 'liturgie', resp: [], echeance: '2027-06-15' } });
const idLibre = r.id;
r = srv.post({ action: 'inv.enregistrer', token: tJB, tache: { titre: 'Livret', pole: 'liturgie', resp: ['Personne Autre'], echeance: '2027-06-01' } });
const idAutre = r.id;
r = srv.post({ action: 'inv.charger', token: tJB });
ok(r.ok && r.taches.length === 3, 'organisateur voit toutes les tâches');
const tj = r.taches.find(t => t.id === idJ);
ok(tj.titre === '=HYPERLINK("x")' && tj.equipe[0].tel === '+352 621 000 000', 'les valeurs relues sont intactes');
ok(srv.post({ action: 'inv.statut', token: tJoris, id: idJ, statut: 'encours' }).ok, 'contributeur modifie sa propre tâche');
ok(!srv.post({ action: 'inv.statut', token: tJoris, id: idAutre, statut: 'fait' }).ok, 'contributeur ne modifie pas la tâche d\'un autre');
ok(srv.post({ action: 'inv.prendre', token: tJoris, id: idLibre }).ok, 'contributeur prend une tâche libre');
ok(!srv.post({ action: 'inv.prendre', token: tJoris, id: idAutre }).ok, 'contributeur ne s\'impose pas sur une tâche attribuée');
ok(!srv.post({ action: 'inv.supprimer', token: tJoris, id: idLibre }).ok, 'contributeur ne supprime pas');
ok(!srv.post({ action: 'inv.statut', token: tLect, id: idJ, statut: 'fait' }).ok, 'lecteur ne modifie rien');
ok(srv.post({ action: 'inv.charger', token: tLect }).taches.length === 3, 'lecteur voit tout');
r = srv.post({ action: 'inv.charger', token: tChauf });
ok(r.ok && r.taches.length === 1 && r.taches[0].id === idJ && r.activite.length === 0, 'intervenant ne voit que ses tâches');
ok(srv.post({ action: 'inv.charger', token: tSite }).code === 'droits', 'éditeur du site sans droit investiture : refusé');
ok(srv.post({ action: 'inv.supprimer', token: tJB, id: idAutre }).ok, 'organisateur supprime');
r = srv.post({ action: 'inv.charger', token: tJB });
ok(r.taches.length === 2 && r.activite.length >= 5, 'activité journalisée côté serveur');

console.log('Déconnecter partout');
const tLect2 = login('lecteur@example.lu');
r = srv.post({ action: 'acces.deconnecter', token: tJB, email: 'lecteur@example.lu' });
ok(r.ok && r.fermees >= 2, 'toutes les sessions de la personne sont fermées');
ok(srv.post({ action: 'moi', token: tLect2 }).code === 'session' && srv.post({ action: 'moi', token: tLect }).code === 'session', 'ses appareils sont déconnectés');
ok(srv.post({ action: 'moi', token: tJB }).ok, 'les autres sessions restent ouvertes');
ok(srv.post({ action: 'acces.deconnecter', token: tJoris, email: 'lecteur@example.lu' }).code === 'droits', 'réservé aux gestionnaires');
const tLect3 = login('lecteur@example.lu');
ok(srv.post({ action: 'inv.charger', token: tLect3 }).ok, 'la personne peut se reconnecter (droits inchangés)');

console.log('Retrait d\'accès');
ok(srv.post({ action: 'acces.supprimer', token: tJB, email: 'lecteur@example.lu' }).ok, 'suppression d\'un accès');
ok(srv.post({ action: 'inv.charger', token: tLect3 }).code === 'session', 'la session de la personne retirée ne marche plus');
srv.post({ action: 'acces.enregistrer', token: tJB, emailOriginal: 'joris@example.lu', personne: { email: 'joris@example.lu', nom: 'Joris Buyse', inv: 'contributeur', site: {}, actif: false } });
ok(srv.post({ action: 'moi', token: tJoris }).code === 'session', 'désactiver un accès coupe la session');
ok(srv.post({ action: 'auth.deconnexion', token: tChauf }).ok && srv.post({ action: 'moi', token: tChauf }).code === 'session', 'déconnexion');

console.log('RGPD');
srv.run('effacerContactsIntervenants');
r = srv.post({ action: 'inv.charger', token: tJB });
ok(r.taches.find(t => t.id === idJ).equipe[0].tel === '', 'effacement des téléphones des intervenants');

console.log('Publication (admin du site)');
{
  const sp = charger({ googleTokens: { gj: { aud: CLIENT, iss: 'accounts.google.com', email: 'jb.niedercorn@oessh.lu', email_verified: 'true', exp: futur } } });
  sp.run('installer');
  const tA = sp.post({ action: 'auth.google', idToken: 'gj' }).token;
  const addP = (p) => sp.post({ action: 'acces.enregistrer', token: tA, personne: p });
  addP({ email: 'redac@x.lu', nom: 'Rita Rédaction', inv: '', site: { actualites: true } });
  addP({ email: 'conseil@x.lu', nom: 'Carl Conseil', inv: 'organisateur', site: {} });
  const lg = (e) => { sp.cache = {}; sp.post({ action: 'auth.demanderCode', email: e }); return sp.post({ action: 'auth.verifierCode', email: e, code: sp.lastCode(e) }).token; };
  const tR = lg('redac@x.lu'), tC = lg('conseil@x.lu');
  let x = sp.post({ action: 'pub.github', token: tR, methode: 'GET', chemin: 'actualites.json' });
  ok(x.code === 'config', 'sans jeton GitHub configuré : publication refusée proprement');
  sp.props.GITHUB_TOKEN = 'ghp_test'; sp.props.CLAUDE_KEY = 'sk-test';
  x = sp.post({ action: 'pub.github', token: tR, methode: 'GET', chemin: 'actualites.json' });
  ok(x.ok && x.status === 200 && x.data.content, 'lecture des actualités via le serveur');
  const b64 = Buffer.from(JSON.stringify({ articles: [] })).toString('base64');
  x = sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'actualites.json', corps: { message: 'Admin: test', content: b64, sha: 'abc' } });
  ok(x.ok && sp.github.length === 1 && /par Rita Rédaction/.test(sp.github[0].message) && sp.github[0].auth === 'Bearer ghp_test', 'publication d\'une actualité, signée du nom de la personne');
  ok(!sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'lectures.json', corps: { content: b64 } }).ok, 'pas de publication dans une rubrique non autorisée');
  ok(!sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'index.html', corps: { content: b64 } }).ok, 'impossible de modifier une page du site');
  ok(!sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'assets/../index.html', corps: { content: b64 } }).ok, 'chemins détournés refusés');
  ok(!sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'assets/x.svg', corps: { content: b64 } }).ok, 'fichiers SVG refusés (pourraient contenir du code)');
  ok(sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'assets/photo-1.jpg', corps: { content: 'AAAA' } }).ok, 'envoi d\'une image');
  ok(!sp.post({ action: 'pub.github', token: tR, methode: 'PUT', chemin: 'actualites.json', corps: { content: Buffer.from('pas du json').toString('base64') } }).ok, 'contenu invalide refusé avant publication');
  ok(sp.post({ action: 'pub.github', token: tC, methode: 'GET', chemin: 'actualites.json' }).code === 'droits', 'un membre sans droit « site » n\'a pas accès');
  x = sp.post({ action: 'pub.claude', token: tR, corps: { system: 'S', messages: [{ role: 'user', content: 'Bonjour' }], max_tokens: 99999, model: 'autre' } });
  ok(x.ok && x.data.content[0].text === 'Texte rédigé.' && sp.claude[0].key === 'sk-test' && sp.claude[0].body.max_tokens === 8000 && sp.claude[0].body.model === 'claude-sonnet-4-6', 'rédaction via Claude : clé et modèle côté serveur, plafond de tokens');
  ok(sp.post({ action: 'pub.claude', token: tC, corps: { messages: [{ role: 'user', content: 'x' }] } }).code === 'droits', 'rédaction réservée aux éditeurs du site');
  ok(JSON.stringify(sp.post({ action: 'moi', token: tR })).indexOf('ghp_test') < 0, 'les clés ne sont jamais renvoyées au navigateur');
  ok(sp.sheets.Journal.data.some(r => r[2] === 'publication'), 'publications inscrites au journal');
}

console.log('Plusieurs adresses par personne');
const s2 = charger({ googleTokens: { g1: { aud: CLIENT, iss: 'accounts.google.com', email: 'jb.niedercorn@gmail.com', email_verified: 'true', exp: futur }, g2: { aud: CLIENT, iss: 'accounts.google.com', email: 'jb.niedercorn@oessh.lu', email_verified: 'true', exp: futur } } });
s2.run('installer');
const a1 = s2.post({ action: 'auth.google', idToken: 'g1' }), a2 = s2.post({ action: 'auth.google', idToken: 'g2' });
ok(a1.ok && a2.ok && a1.user.nom === a2.user.nom && a1.user.emails.length === 2, 'connexion avec l\'une ou l\'autre adresse : même personne');
ok(s2.post({ action: 'acces.enregistrer', token: a1.token, personne: { email: 'a@x.lu, b@y.lu', nom: 'Alice', inv: 'lecture', site: {} } }).ok, 'ajout d\'une personne avec deux adresses');
s2.cache = {}; s2.post({ action: 'auth.demanderCode', email: 'b@y.lu' });
ok(s2.post({ action: 'auth.verifierCode', email: 'b@y.lu', code: s2.lastCode('b@y.lu') }).user.nom === 'Alice', 'connexion par code avec la seconde adresse');
ok(!s2.post({ action: 'acces.enregistrer', token: a1.token, personne: { email: 'b@y.lu', nom: 'Bob', inv: 'lecture', site: {} } }).ok, 'une adresse ne peut appartenir qu\'à une seule personne');
ok(!s2.post({ action: 'acces.enregistrer', token: a1.token, emailOriginal: 'jb.niedercorn@oessh.lu', personne: { email: 'jb.niedercorn@oessh.lu', nom: 'JB', inv: 'organisateur', site: {}, gestion: true } }).ok, 'on ne peut pas retirer l\'adresse avec laquelle on est connecté');
ok(s2.post({ action: 'acces.enregistrer', token: a1.token, emailOriginal: 'a@x.lu', personne: { email: 'a@x.lu', nom: 'Alice', inv: 'contributeur', site: {} } }).ok, 'retirer une adresse à quelqu\'un d\'autre');
ok(!s2.post({ action: 'acces.supprimer', token: a2.token, email: 'jb.niedercorn@oessh.lu' }).ok, 'impossible de supprimer sa propre fiche, quelle que soit l\'adresse de connexion');

console.log('Week-end de retraite');
{
  const s3 = charger({ googleTokens: { g: { aud: CLIENT, iss: 'accounts.google.com', email: 'jb.niedercorn@oessh.lu', email_verified: 'true', exp: futur } } });
  s3.run('installer');
  // Feuille existante : une colonne ajoutée à la main (ex. « Admin ») doit rester en place.
  s3.sheets.Acces.data[0].splice(9); s3.sheets.Acces.data[0].push('Admin'); s3.sheets.Acces.data[1].splice(9); s3.sheets.Acces.data[1].push('oui');
  s3.run('installer');
  const head = s3.sheets.Acces.data[0];
  ok(head[9] === 'Admin' && head[10] === 'Retraite' && s3.sheets.Acces.data[1][9] === 'oui', 'installer ajoute la colonne Retraite en fin d\'onglet sans déplacer les autres');
  ok(s3.sheets.RetJalons.data.length === 5 && s3.sheets.RetProgramme && s3.sheets.RetTaches, 'onglets de la retraite créés, jalons par défaut');
  const tA = s3.post({ action: 'auth.google', idToken: 'g' }).token;
  let x = s3.post({ action: 'ret.charger', token: tA });
  ok(x.ok && x.user.ret === 'organisateur' && Array.isArray(x.programme), 'l\'administrateur initial est organisateur de la retraite');
  const add3 = (p) => s3.post({ action: 'acces.enregistrer', token: tA, personne: p });
  ok(add3({ email: 'inv@x.lu', nom: 'Ivan Investiture', inv: 'contributeur', ret: '', site: {} }).ok, 'ajout d\'un membre investiture seulement');
  ok(add3({ email: 'ret@x.lu', nom: 'Rose Retraite', inv: '', ret: 'contributeur', site: {} }).ok, 'ajout d\'une contributrice retraite seulement');
  ok(s3.post({ action: 'acces.lister', token: tA }).personnes.find(p => p.nom === 'Rose Retraite').ret === 'contributeur', 'le droit Retraite est enregistré et relu');
  const lg = (e) => { s3.cache = {}; s3.post({ action: 'auth.demanderCode', email: e }); return s3.post({ action: 'auth.verifierCode', email: e, code: s3.lastCode(e) }).token; };
  const tI = lg('inv@x.lu'), tR = lg('ret@x.lu');
  ok(s3.post({ action: 'ret.charger', token: tI }).code === 'droits', 'droit investiture seul : pas d\'accès à la retraite');
  ok(s3.post({ action: 'inv.charger', token: tR }).code === 'droits', 'droit retraite seul : pas d\'accès à l\'investiture');
  x = s3.post({ action: 'ret.enregistrer', token: tA, tache: { titre: 'Lettres d\'inscription', pole: 'inscriptions', resp: [] } });
  ok(x.ok, 'organisateur crée une tâche de la retraite');
  const idR = x.id;
  ok(s3.post({ action: 'ret.enregistrer', token: tA, tache: { titre: 'Pôle inconnu', pole: 'candidats' } }).ok && s3.post({ action: 'ret.charger', token: tA }).taches.some(t => t.titre === 'Pôle inconnu' && t.pole === 'programme'), 'pôle inconnu ramené au premier pôle de la retraite');
  ok(s3.post({ action: 'ret.prendre', token: tR, id: idR }).ok && s3.post({ action: 'ret.statut', token: tR, id: idR, statut: 'fait' }).ok, 'contributrice prend une tâche libre et la termine');
  ok(s3.sheets.Taches.data.length === 1 && s3.sheets.RetTaches.data.length === 3, 'les tâches de la retraite restent dans leurs propres onglets');
  x = s3.post({ action: 'ret.creneau', token: tA, creneau: { jour: '2027-01-09', debut: '19:00', fin: '20:00', titre: '=Conférence', qui: 'Intervenant fictif', statut: 'principe', note: '' } });
  ok(x.ok, 'organisateur ajoute un créneau au programme');
  const idC = x.id;
  ok(s3.post({ action: 'ret.creneau', token: tR, creneau: { jour: '2027-01-09', titre: 'x' } }).code === 'droits', 'contributeur ne modifie pas le programme');
  ok(s3.post({ action: 'ret.creneau', token: tA, creneau: { id: idC, jour: '2027-01-09', debut: '19h', fin: '20:00', titre: '=Conférence', qui: 'Intervenant fictif', statut: 'nimporte', note: '' } }).ok, 'modification d\'un créneau');
  x = s3.post({ action: 'ret.charger', token: tR }).programme.find(c => c.id === idC);
  ok(x.titre === '=Conférence' && x.debut === '' && x.statut === '', 'heures et statuts invalides ignorés, saisies neutralisées');
  ok(s3.post({ action: 'ret.creneau', token: tA, creneau: { jour: 'n-importe', titre: 'Remarque' } }).ok && s3.post({ action: 'ret.charger', token: tA }).programme.some(c => c.jour === 'notes'), 'jour inconnu : enregistré comme remarque');
  ok(s3.post({ action: 'ret.creneauSupprimer', token: tA, id: idC }).ok && !s3.post({ action: 'ret.charger', token: tA }).programme.some(c => c.id === idC), 'suppression d\'un créneau');
  ok(s3.sheets.RetActivite.data.length > 3 && s3.sheets.Activite.data.length === 1, 'activité de la retraite séparée de celle de l\'investiture');
}

console.log('Script autonome (hors feuille)');
const auto = charger({ autonome: true });
ok(/Installation terminée/.test(auto.run('installer')) && auto.props.SHEET_ID === 'fake', 'installer crée et mémorise la feuille si le script n\'est pas rattaché');
ok(auto.sheets.Acces.data.length === 2, 'onglets créés dans la feuille mémorisée');

console.log('\n' + n + ' vérifications réussies.');
