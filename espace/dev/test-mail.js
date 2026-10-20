/* Tests du Courrier e-mail (Code.gs) avec le simulateur. Lancer : node espace/dev/test-mail.js */
'use strict';
const assert = require('assert');
const { charger } = require('./gas-fake');

// Fichier des membres fictif, mêmes titres de colonnes que « 0_Fichier_Membres_actif ».
const ENTETE = ['18/10/2026JBN', '', 'Conseil Lt', 'Conseil ASBL', 'NOM', 'PRENOM usuel', 'CIVILITE', 'FONCTION', 'TITRE', 'NOBLESSE DR', 'ADRESSE', 'CP', 'LIEU', 'PAYS', 'COURRIEL', 'COURRIEL \nOFFICIEL', 'TELEPHONE', 'GSM'];
const L = (g, sg, clt, ca, nom, prenom, civ, titre, mail) => [g, sg, clt, ca, nom, prenom, civ, '', titre, '', '', '', '', '', mail, '', '', ''];
const MEMBRES = [
  ENTETE,
  L('Lt', '', 1, 1, 'KLEIN', 'Jacques', 'Monsieur', 'Son Excellence le Chevalier Grand-Croix', 'jacques.klein@pt.lu'),
  L('Lt', '', 1, '', 'GOEDERT', 'Alfred', 'Monsieur', 'le Grand Officier', 'goedert1@pt.lu'),
  L('Lt', '', '', '', 'GOEDERT-DEWANS', 'Marie-Jeanne', 'Madame', 'la Dame de Commanderie', 'goedert1@pt.lu'),
  L('Lt', '', 1, 1, 'CARDINAL HOLLERICH', 'Jean-Claude', 'Éminence', 'Son Éminence', 'archeveque@cathol.lu'),
  L('Lt', '', '', 1, 'WEBER', 'Léon', "Monsieur l'Abbé", "l'Abbé", 'leon.weber@cathol.lu'),
  L('Candidat', '', '', '', 'DAUPHIN', 'Michel', 'Monsieur', 'le Candidat', 'mdauphin@pt.lu'),
  L('ASBL', 'Sympathisant', '', '', 'SPAUTZ', 'Jean', 'Monsieur', 'le Président honoraire', ''),
  L('Cognati', 'Deutschland', '', '', 'OTTE', 'Regan', 'Frau', 'Komtur-Dame mit Stern', 'otte@pt.lu'),
  L('Malte', 'Malte', '', '', 'MORBÉ', 'Jessy', 'Monsieur', '', 'jessy.morbe@malteser.lu'),
  L('Lt', 'Défunt', 1, '', 'ANCIEN', 'Paul', 'Monsieur', 'le Chevalier', 'paul.ancien@pt.lu'),
  L('ASBL', 'décédée', '', '', 'ANCIENNE', 'Anne', 'Madame', '', 'anne@pt.lu')
];

const srv = charger({ membres: MEMBRES });
let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); }

console.log('Installation');
srv.run('installer');
const acc = srv.sheets.Acces.data;
const iEnv = acc[0].indexOf('Envois');
ok(iEnv > -1 && acc[1][iEnv] === 'oui', 'colonne Envois créée, l\'administrateur initial y a droit');
ok(srv.sheets.JournalEnvois, 'onglet JournalEnvois créé');
// Colonnes Roles et Emails, comme dans la vraie feuille
acc[0].push('Roles', 'Emails', 'Signature ');
acc[1][acc[0].indexOf('Roles')] = 'secretaire';
acc[1][acc[0].indexOf('Emails')] = 'secretariat@oessh.lu|jb@niedercorn.com';
acc[1][acc[0].indexOf('Signature ')] = 'Dr Jean-Baptiste Niedercorn';
// Un membre du Conseil sans droit d'envoi
acc.push(['joris.b@me.com', 'Joris Buyse', '', '', '', '', '', 'oui', '']);

console.log('Connexion par la colonne Emails');
srv.post({ action: 'auth.demanderCode', email: 'secretariat@oessh.lu' });
let r = srv.post({ action: 'auth.verifierCode', email: 'secretariat@oessh.lu', code: srv.lastCode('secretariat@oessh.lu') });
ok(r.ok && r.user.envois === true, 'adresse de la colonne Emails acceptée à la connexion, droit Envois exposé');
const tJB = r.token;
srv.post({ action: 'auth.demanderCode', email: 'joris.b@me.com' });
r = srv.post({ action: 'auth.verifierCode', email: 'joris.b@me.com', code: srv.lastCode('joris.b@me.com') });
const tJoris = r.token;
ok(!srv.post({ action: 'mail.charger', token: tJoris }).ok, 'sans droit Envois : Courrier e-mail refusé');

console.log('Chargement');
r = srv.post({ action: 'mail.charger', token: tJB });
ok(r.ok && r.membres.length === 9, 'les 9 membres du fichier sont lus, les défunts sont écartés');
const G = {}; r.groupes.forEach(g => (G[g.id] = g.ids.length));
ok(G.lt === 5 && G.candidats === 1 && G.asbl === 1 && G.cognati === 1 && G.malte === 1, 'groupes principaux corrects');
ok(G.conseil_lt === 3 && G.conseil_asbl === 3, 'conseils corrects');
ok(r.signataire === 'Dr Jean-Baptiste Niedercorn', 'signature lue à chaque chargement (titre de colonne avec espace toléré)');
ok(r.casquettes.length === 1 && r.casquettes[0].repondreA === 'secretariat@oessh.lu', 'casquette Secrétaire, réponse vers secretariat@');
const par = {}; r.membres.forEach(m => (par[m.nom] = m));
ok(par.KLEIN.appel === 'Excellence,', 'appel : Excellence pour le Lieutenant');
ok(par['CARDINAL HOLLERICH'].appel === 'Éminence,', 'appel : Éminence pour le Cardinal');
ok(par.WEBER.appel === 'Monsieur l’Abbé,', 'appel : Monsieur l’Abbé');
ok(par['GOEDERT-DEWANS'].appel === 'Chère Consœur,' && par.GOEDERT.appel === 'Cher Confrère,', 'appel : Consœur / Confrère pour les membres');
ok(par.DAUPHIN.appel === 'Monsieur,' && par.OTTE.appel === 'Chère Consœur,', 'appel : Monsieur pour un candidat, Consœur pour une Cognata');
ok(par.SPAUTZ.sansCourriel === true, 'personne sans courriel signalée');
ok(!JSON.stringify(r.membres).includes('@'), 'aucune adresse e-mail des membres envoyée au navigateur');

const asbl = srv.run('(() => casquettesDe_({ nom: "Serge de Cillia", roles: "secretaire_asbl", emails: [] })[0])');
ok(asbl.expediteur === 'Serge de Cillia - Ordre Équestre du Saint-Sépulcre de Jérusalem, Lieutenance pour le Luxembourg, a.s.b.l.', 'Asbl : expéditeur sous la dénomination officielle');
ok(asbl.ligneFonction === 'Secrétaire' && asbl.ligneOrdre === 'Ordre Équestre du Saint-Sépulcre de Jérusalem, Lieutenance pour le Luxembourg, a.s.b.l.', 'Asbl : signature avec la fonction seule puis la dénomination officielle');

console.log('Garde-fous');
const base = { token: tJB, casquette: 'secretaire', objet: 'Messe du 9 janvier', corps: '{appel}\n\nNous vous invitons à la messe.' };
ok(!srv.post(Object.assign({}, base, { action: 'mail.essai', casquette: 'lieutenant' })).ok, 'casquette non attribuée refusée');
ok(!srv.post(Object.assign({}, base, { action: 'mail.essai', corps: 'Date : [à compléter]' })).ok, 'texte avec [à compléter] refusé');
ok(!srv.post(Object.assign({}, base, { action: 'mail.essai', corps: 'Messe — samedi' })).ok, 'tiret long refusé');
const ids = r.groupes.find(g => g.id === 'lt').ids;
ok(srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids })).code === 'essai', 'envoi réel refusé sans essai préalable');

console.log('Essai');
r = srv.post(Object.assign({}, base, { action: 'mail.essai', apercu: par.KLEIN.id }));
let m = srv.gmails.pop();
ok(r.ok && m.to === 'secretariat@oessh.lu' && m.subject === '[ESSAI] Messe du 9 janvier', 'essai envoyé à l\'auteur');
ok(m.from === 'envois@oessh.lu' && m.replyTo === 'secretariat@oessh.lu' && m.name === 'Le Secrétaire - Ordre Équestre du Saint-Sépulcre de Jérusalem, Lieutenance pour le Luxembourg', 'expéditeur, nom affiché et Répondre à corrects');
ok(m.body.startsWith('Excellence,') && m.body.includes('Jean-Baptiste Niedercorn') && m.htmlBody.includes('Excellence,'), 'appel et signature personnalisés');
ok(m.body.includes('Dr Jean-Baptiste Niedercorn\nSecrétaire pour le Luxembourg\nde l’Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH)\nsecretariat@oessh.lu'), 'signature selon le modèle du Lieutenant');
ok(m.htmlBody.includes('assets/email/entete-lieutenance.png') && m.htmlBody.includes('assets/email/croix-signature.png'), 'Lieutenance : armoiries en en-tête, croix devant le nom');
ok(!srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids, objet: 'Autre objet' })).ok, 'texte modifié après l\'essai : envoi refusé');

console.log('Envoi réel');
r = srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids, groupes: ['Lieutenance'] }));
ok(r.ok && r.envoyes === 5 && srv.gmails.length === 5, 'un courriel par membre de la Lieutenance (5)');
ok(srv.gmails.filter(x => x.to === 'goedert1@pt.lu').length === 2, 'adresse partagée : deux courriels, un par personne');
ok(srv.gmails.some(x => x.to === 'goedert1@pt.lu' && x.body.startsWith('Chère Consœur,')) && srv.gmails.some(x => x.to === 'goedert1@pt.lu' && x.body.startsWith('Cher Confrère,')), 'chacun reçoit son propre appel');
ok(srv.gmails.every(x => !Array.isArray(x.to) && !x.cc && !x.bcc), 'aucune liste visible');
const j = srv.sheets.JournalEnvois.data;
ok(j[j.length - 1][7] === 'envoi' && j[j.length - 1][5] === '5', 'envoi consigné dans le journal');
srv.gmails.length = 0;
const idAsbl = srv.post({ action: 'mail.charger', token: tJB }).groupes.find(g => g.id === 'asbl').ids;
r = srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids: idAsbl }));
ok(r.ok && r.envoyes === 0 && r.sansCourriel.length === 1 && srv.gmails.length === 0, 'personne sans courriel : rien envoyé, nom renvoyé pour envoi postal');

console.log('Formule de politesse et adresse de réponse');
srv.gmails.length = 0;
const base2 = { token: tJB, casquette: 'secretaire', objet: 'Vœux', corps: '{appel}\n\nMeilleurs vœux.\n\n{politesse}', repondreA: 'jb@niedercorn.com' };
const ch = srv.post({ action: 'mail.charger', token: tJB });
ok(ch.adresses.indexOf('jb@niedercorn.com') > -1 && ch.adresses.indexOf('envois@oessh.lu') < 0, 'adresses personnelles proposées en Répondre à');
const pk = {}; ch.membres.forEach(x => (pk[x.nom] = x));
ok(pk.KLEIN.politesse.indexOf('Excellence') > -1 && pk.GOEDERT.politesse === 'Avec mes sentiments fraternels et chevaleresques.' && pk.DAUPHIN.politesse.indexOf('Monsieur, l’expression de mes sentiments distingués') > -1, 'formule de politesse selon la qualité');
ok(!srv.post(Object.assign({}, base2, { action: 'mail.essai', repondreA: 'pirate@example.com' })).ok, 'adresse de réponse étrangère refusée');
r = srv.post(Object.assign({}, base2, { action: 'mail.essai' }));
ok(r.ok && srv.gmails.pop().replyTo === 'jb@niedercorn.com', 'essai avec l’adresse de réponse choisie');
ok(srv.post(Object.assign({}, base2, { action: 'mail.envoyer', ids: [pk.KLEIN.id], repondreA: '' })).code === 'essai', 'changer l’adresse de réponse après l’essai impose un nouvel essai');
r = srv.post(Object.assign({}, base2, { action: 'mail.envoyer', ids: [pk.KLEIN.id, pk.WEBER.id] }));
const mk = srv.gmails.find(x => x.to === 'jacques.klein@pt.lu'), mw = srv.gmails.find(x => x.to === 'leon.weber@cathol.lu');
ok(r.ok && mk.body.indexOf('Je vous prie d’agréer, Excellence') > -1 && mw.body.indexOf('Monsieur l’Abbé, l’expression de mes sentiments respectueux') > -1 && mk.replyTo === 'jb@niedercorn.com', 'chaque destinataire reçoit sa formule de politesse');

console.log('Pièces jointes');
let drive_vieux;
const pdf = Buffer.from('%PDF-1.4 programme').toString('base64');
let j1 = srv.post({ action: 'mail.joindre', token: tJB, nom: 'Programme.pdf', contenu: pdf });
ok(j1.ok && j1.id && j1.taille > 0, 'PDF déposé dans le dossier des pièces jointes');
ok(!srv.post({ action: 'mail.joindre', token: tJB, nom: 'virus.exe', contenu: pdf }).ok, 'type de fichier non accepté refusé');
ok(!srv.post({ action: 'mail.joindre', token: tJB, nom: 'lourd.pdf', contenu: Buffer.alloc(10 * 1024 * 1024 + 10).toString('base64') }).ok, 'fichier de plus de 10 Mo refusé');
ok(!srv.post({ action: 'mail.joindre', token: tJoris, nom: 'a.pdf', contenu: pdf }).ok, 'sans droit Envois : dépôt refusé');
srv.gmails.length = 0;
const base3 = { token: tJB, casquette: 'secretaire', objet: 'Programme', corps: '{appel}\n\nVeuillez trouver le programme ci-joint.\n\n{politesse}' };
r = srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: [j1.id] }));
m = srv.gmails.pop();
ok(r.ok && m.attachments && m.attachments.length === 1 && m.attachments[0].getName() === 'Programme.pdf', 'essai envoyé avec la pièce jointe');
ok(srv.post(Object.assign({}, base3, { action: 'mail.envoyer', ids: [pk.KLEIN.id] })).code === 'essai', 'retirer la pièce jointe après l’essai impose un nouvel essai');
r = srv.post(Object.assign({}, base3, { action: 'mail.envoyer', ids: [pk.KLEIN.id, pk.WEBER.id], pieces: [j1.id] }));
ok(r.ok && r.envoyes === 2 && srv.gmails.every(x => x.attachments && x.attachments.length === 1), 'chaque destinataire reçoit la pièce jointe');
const jr = srv.sheets.JournalEnvois.data;
ok(jr[0][8] === 'PJ' && jr[jr.length - 1][8] === 'Programme.pdf', 'pièce jointe notée dans le journal');
ok(!srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: ['inexistant'] })).ok, 'identifiant de fichier inconnu refusé');
srv.drive.fichiers[j1.id].setDescription('auteur:autre@oessh.lu');
ok(!srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: [j1.id] })).ok, 'fichier déposé par quelqu’un d’autre refusé');
srv.drive.fichiers[j1.id].setDescription('auteur:secretariat@oessh.lu');
const autre = srv.ctx.DriveApp.createFolder('Autre').createFile(srv.ctx.Utilities.newBlob([1, 2], 'application/pdf', 'prive.pdf'));
autre.setDescription('auteur:secretariat@oessh.lu');
ok(!srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: [autre.getId()] })).ok, 'fichier hors du dossier des pièces jointes refusé');
const ids6 = [1, 2, 3, 4, 5, 6].map(i => srv.post({ action: 'mail.joindre', token: tJB, nom: 'p' + i + '.pdf', contenu: pdf }).id);
ok(!srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: ids6 })).ok, 'plus de 5 pièces jointes refusé');
console.log('Ménage des pièces jointes');
const j2 = srv.post({ action: 'mail.joindre', token: tJB, nom: 'Bulletin.pdf', contenu: pdf });
srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: [j2.id] }));
ok(!srv.drive.fichiers[j2.id].isTrashed(), 'après l’essai, la pièce jointe est gardée');
r = srv.post(Object.assign({}, base3, { action: 'mail.envoyer', ids: [pk.KLEIN.id], pieces: [j2.id] }));
ok(r.ok && r.pjSupprimees === true && srv.drive.fichiers[j2.id].isTrashed(), 'après l’envoi réel, la pièce jointe est mise à la corbeille');
ok(!srv.post(Object.assign({}, base3, { action: 'mail.essai', pieces: [j2.id] })).ok, 'une pièce jointe à la corbeille ne peut plus être envoyée');
drive_vieux = srv.drive; drive_vieux.maintenant = Date.now() - 8 * 24 * 3600 * 1000;
const vieux = srv.post({ action: 'mail.joindre', token: tJB, nom: 'Oublie.pdf', contenu: pdf });
drive_vieux.maintenant = 0;
const recent = srv.post({ action: 'mail.joindre', token: tJB, nom: 'Recent.pdf', contenu: pdf });
srv.post({ action: 'mail.charger', token: tJB });
ok(srv.drive.fichiers[vieux.id].isTrashed() && !srv.drive.fichiers[recent.id].isTrashed(), 'fichier jamais envoyé : corbeille après 7 jours, les récents sont gardés');

jr[0][8] = '';
srv.post(Object.assign({}, base3, { action: 'mail.essai' }));
ok(jr[0][8] === 'PJ', 'onglet JournalEnvois ancien : colonne PJ ajoutée');

console.log('\n' + n + ' vérifications réussies.');
