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
ok(srv.sheets.Acces.data.length === 3, 'onglet Acces créé avec les administrateurs initiaux');
ok(srv.sheets.Jalons.data.length === 9, 'jalons par défaut créés');
srv.run('installer');
ok(srv.sheets.Acces.data.length === 3, 'réinstaller ne duplique rien');

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
ok(!srv.post({ action: 'acces.supprimer', token: tJB, email: 'jb.niedercorn@gmail.com' }).ok, 'impossible de supprimer son propre accès');
r = srv.post({ action: 'acces.lister', token: tJB });
ok(r.ok && r.personnes.length === 6 && r.journal.length > 0, 'liste des accès et journal');

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

console.log('Retrait d\'accès');
ok(srv.post({ action: 'acces.supprimer', token: tJB, email: 'lecteur@example.lu' }).ok, 'suppression d\'un accès');
ok(srv.post({ action: 'inv.charger', token: tLect }).code === 'session', 'la session de la personne retirée ne marche plus');
add({ email: 'joris@example.lu', nom: 'Joris Buyse', inv: 'contributeur', site: {}, actif: false });
ok(srv.post({ action: 'moi', token: tJoris }).code === 'session', 'désactiver un accès coupe la session');
ok(srv.post({ action: 'auth.deconnexion', token: tChauf }).ok && srv.post({ action: 'moi', token: tChauf }).code === 'session', 'déconnexion');

console.log('RGPD');
srv.run('effacerContactsIntervenants');
r = srv.post({ action: 'inv.charger', token: tJB });
ok(r.taches.find(t => t.id === idJ).equipe[0].tel === '', 'effacement des téléphones des intervenants');

console.log('\n' + n + ' vérifications réussies.');
