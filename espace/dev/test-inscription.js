/* Tests des invitations avec date limite et hébergement (Code.gs). Lancer : node espace/dev/test-inscription.js */
'use strict';
const assert = require('assert');
const { charger } = require('./gas-fake');

const ENTETE = ['18/10/2026JBN', '', 'Conseil Lt', 'Conseil ASBL', 'NOM', 'PRENOM usuel', 'CIVILITE', 'FONCTION', 'TITRE', 'NOBLESSE DR', 'ADRESSE', 'CP', 'LIEU', 'PAYS', 'COURRIEL', 'COURRIEL \nOFFICIEL', 'TELEPHONE', 'GSM'];
const L = (g, nom, prenom, civ, mail) => [g, '', '', '', nom, prenom, civ, '', 'le Candidat', '', '', '', '', '', mail, '', '', ''];
const MEMBRES = [ENTETE,
  L('Candidat', 'DAUPHIN', 'Michel', 'Monsieur', 'mdauphin@pt.lu'),
  L('Candidat', 'MARTIN', 'Claire', 'Madame', 'claire.martin@pt.lu'),
  L('Candidat', 'NEU', 'Paul', 'Monsieur', 'paul.neu@pt.lu')];

const srv = charger({ membres: MEMBRES });
let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); }

srv.run('installer');
const acc = srv.sheets.Acces.data;
acc[0].push('Roles', 'Emails');
acc[1][acc[0].indexOf('Roles')] = 'secretaire';
acc[1][acc[0].indexOf('Emails')] = 'secretariat@oessh.lu';
srv.post({ action: 'auth.demanderCode', email: 'secretariat@oessh.lu' });
const tJB = srv.post({ action: 'auth.verifierCode', email: 'secretariat@oessh.lu', code: srv.lastCode('secretariat@oessh.lu') }).token;
const ch = srv.post({ action: 'mail.charger', token: tJB });
const ids = ch.groupes.find(g => g.id === 'candidats').ids;
ok(ids.length === 3, '3 candidats');

const evt = { id: '2027-01-09-retraite', date: '2027-01-09', heure: '09:00', titre: 'Week-end de retraite', lieu: 'Sœurs franciscaines, Belair', limite: '2026-11-05',
  hebergement: { actif: true, lieu: 'Sœurs franciscaines', nuit: 'nuit du samedi 9 au dimanche 10 janvier', prixSimple: '60 €', prixDouble: '90 €', note: '' } };
const base = { token: tJB, casquette: 'secretaire', objet: 'Week-end de retraite', corps: '{appel}\n\nVous êtes invité.\n\n{politesse}', evenement: evt };

console.log('Courriel');
let r = srv.post(Object.assign({}, base, { action: 'mail.essai', apercu: ids[0] }));
const essai = srv.gmails.pop();
ok(r.ok && essai.htmlBody.includes('Réponse attendue au plus tard le jeudi 5 novembre 2026') && essai.htmlBody.includes('Hébergement : Sœurs franciscaines, nuit du samedi 9 au dimanche 10 janvier (chambre individuelle 60 €, double 90 €)'), 'date limite et hébergement dans le bloc d’invitation');
ok(essai.body.includes('Réponse attendue au plus tard le jeudi 5 novembre 2026.'), 'version texte avec la date limite');
const autre = JSON.parse(JSON.stringify(evt)); autre.hebergement.prixDouble = '95 €';
ok(srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids, evenement: autre })).code === 'essai', 'changer un prix après l’essai impose un nouvel essai');
r = srv.post(Object.assign({}, base, { action: 'mail.envoyer', ids }));
ok(r.ok && r.envoyes === 3, 'invitations envoyées');
const envoi = srv.sheets.JournalEnvois.data.slice(-1)[0];
const envoiId = envoi[9];
const tok = (i) => srv.run('(() => jetonInsc_("' + envoiId + '", "' + ids[i] + '"))');

console.log('Réponses');
let l = srv.post({ action: 'insc.lire', t: tok(0) });
ok(l.ok && l.limite === 'jeudi 5 novembre 2026' && l.hebergTexte.startsWith('Hébergement') && !l.fige, 'page : date limite et hébergement lus');
ok(!srv.post({ action: 'insc.repondre', t: tok(0), reponse: 'oui', accompagnants: 1, noms: ['Anne Dauphin'], chambres: ['double'] }).ok, 'chambre manquante pour un accompagnant : refusé');
ok(!srv.post({ action: 'insc.repondre', t: tok(0), reponse: 'oui', accompagnants: 0, noms: [], chambres: ['suite'] }).ok, 'type de chambre inconnu : refusé');
r = srv.post({ action: 'insc.repondre', t: tok(0), reponse: 'oui', accompagnants: 1, noms: ['Anne Dauphin'], chambres: ['double', 'double'], remarque: 'Arrivée vendredi soir' });
ok(r.ok && r.chambres['Michel DAUPHIN'] === 'double' && r.chambres['Anne Dauphin'] === 'double' && r.remarque === 'Arrivée vendredi soir', 'couple en chambre double, remarque enregistrée');
r = srv.post({ action: 'insc.repondre', t: tok(1), reponse: 'oui', accompagnants: 0, noms: [], chambres: ['simple'] });
ok(r.ok, 'candidate seule en chambre individuelle');
r = srv.post({ action: 'insc.repondre', t: tok(2), reponse: 'non' });
ok(r.ok && !Object.keys(r.chambres).length, 'désistement : aucune chambre');

console.log('Tableau de bord');
const t = srv.post({ action: 'mail.inscriptions', token: tJB, id: envoiId });
ok(t.hebergement.simples === 1 && t.hebergement.doubles === 1 && t.hebergement.personnesDouble === 2, '1 individuelle, 1 double (2 personnes)');
ok(t.hebergement.montant === 150, 'coût estimé : 60 + 90 = 150 €');
ok(t.personnes === 3 && t.non.length === 1, '3 personnes attendues, 1 désistement');
const h = srv.post({ action: 'mail.charger', token: tJB }).historique.find(x => x.id === envoiId);
ok(h.insc.heberg && h.insc.simples === 1 && h.insc.doubles === 1, 'résumé de l’historique avec les chambres');

console.log('Après la date limite');
const iEvt = srv.sheets.JournalEnvois.data[0].indexOf('Evenement');
const ligne = srv.sheets.JournalEnvois.data.find(x => x[9] === envoiId);
const e2 = JSON.parse(ligne[iEvt]); e2.limite = '2026-01-01'; ligne[iEvt] = JSON.stringify(e2);
l = srv.post({ action: 'insc.lire', t: tok(0) });
ok(l.fige === true, 'réponse donnée : figée après la date limite');
ok(!srv.post({ action: 'insc.repondre', t: tok(0), reponse: 'non' }).ok, 'modification refusée après la date limite');
srv.gmails.length = 0;
srv.run('rappelsInscriptions');
const recap = srv.gmails.find(x => x.subject.startsWith('Inscriptions closes'));
ok(recap && recap.to === 'secretariat@oessh.lu' && recap.body.includes('Chambres : 1 individuelle, 1 double') && recap.body.includes('Remarque : Arrivée vendredi soir') && recap.body.includes('Ne viennent pas : Paul NEU'), 'récapitulatif envoyé à l’auteur le lendemain de la date limite');
srv.gmails.length = 0;
srv.run('rappelsInscriptions');
ok(!srv.gmails.some(x => x.subject.startsWith('Inscriptions closes')), 'récapitulatif envoyé une seule fois');

console.log('Invitation personnelle (candidats) : pas d’accompagnants, chambre double partagée entre deux inscrits');
const evt2 = Object.assign({}, evt, { id: '2027-01-09-retraite-b', limite: '2026-11-05', sansAccompagnants: true });
const base2 = Object.assign({}, base, { evenement: evt2, objet: 'Retraite des candidats' });
srv.post(Object.assign({}, base2, { action: 'mail.essai', apercu: ids[0] }));
const essai2 = srv.gmails.pop();
ok(essai2.htmlBody.includes('Vous pourrez indiquer la chambre souhaitée.') && !essai2.htmlBody.includes('personnes qui vous accompagnent'), 'courriel sans mention des accompagnants');
ok(srv.post(Object.assign({}, base2, { action: 'mail.envoyer', ids })).ok, 'invitations personnelles envoyées');
const id2 = srv.sheets.JournalEnvois.data.slice(-1)[0][9];
const tok2 = (i) => srv.run('(() => jetonInsc_("' + id2 + '", "' + ids[i] + '"))');
ok(srv.post({ action: 'insc.lire', t: tok2(0) }).max === 0, 'page : aucun accompagnant proposé');
r = srv.post({ action: 'insc.repondre', t: tok2(0), reponse: 'oui', accompagnants: 2, noms: ['X', 'Y'], chambres: ['simple'] });
ok(r.ok && r.accompagnants === 0, 'accompagnants ignorés même si envoyés');
ok(!srv.post({ action: 'insc.repondre', t: tok2(1), reponse: 'oui', chambres: ['double'] }).ok, 'chambre double sans partenaire : refusé');
r = srv.post({ action: 'insc.repondre', t: tok2(1), reponse: 'oui', chambres: ['double'], partage: 'Paul Neu' });
ok(r.ok && r.partage === 'Paul Neu', 'chambre double partagée avec Paul Neu');
r = srv.post({ action: 'insc.repondre', t: tok2(2), reponse: 'oui', chambres: ['double'], partage: 'Claire Martin' });
let t2 = srv.post({ action: 'mail.inscriptions', token: tJB, id: id2 });
ok(t2.hebergement.simples === 1 && t2.hebergement.doubles === 1 && t2.hebergement.personnesDouble === 2 && !t2.hebergement.seuls.length, 'deux inscrits qui se nomment : une seule chambre double');
srv.post({ action: 'insc.repondre', t: tok2(2), reponse: 'oui', chambres: ['double'], partage: 'Quelqu’un d’autre' });
t2 = srv.post({ action: 'mail.inscriptions', token: tJB, id: id2 });
ok(t2.hebergement.doubles === 1 && !t2.hebergement.seuls.length, 'un seul des deux nomme l’autre : toujours une chambre');
srv.post({ action: 'insc.repondre', t: tok2(1), reponse: 'oui', chambres: ['double'], partage: 'Jeanne Inconnue' });
t2 = srv.post({ action: 'mail.inscriptions', token: tJB, id: id2 });
ok(t2.hebergement.doubles === 2 && t2.hebergement.seuls.length === 2, 'partenaires non reconnus : deux chambres, signalées à vérifier');

console.log('Conditions à accepter (paiement, annulation)');
const evt3 = Object.assign({}, evt2, { id: '2027-01-09-retraite-c', engagement: 'Je m’engage à régler environ 260 €.' });
const base3 = Object.assign({}, base2, { evenement: evt3, objet: 'Retraite avec engagement' });
srv.post(Object.assign({}, base3, { action: 'mail.essai', apercu: ids[0] }));
const essai3 = srv.gmails.pop();
ok(essai3.htmlBody.includes('<strong>Important :</strong> Je m’engage à régler environ 260 €.') && essai3.body.includes('Important : Je m’engage'), 'conditions rappelées au-dessus des boutons');
ok(srv.post(Object.assign({}, base3, { action: 'mail.envoyer', ids })).ok, 'invitations envoyées');
const id3 = srv.sheets.JournalEnvois.data.slice(-1)[0][9];
const tok3 = (i) => srv.run('(() => jetonInsc_("' + id3 + '", "' + ids[i] + '"))');
ok(srv.post({ action: 'insc.lire', t: tok3(0) }).engagement === 'Je m’engage à régler environ 260 €.', 'page : conditions affichées');
ok(!srv.post({ action: 'insc.repondre', t: tok3(0), reponse: 'oui', chambres: ['simple'] }).ok, 'sans la case cochée : refusé');
ok(srv.post({ action: 'insc.repondre', t: tok3(0), reponse: 'oui', chambres: ['simple'], engage: true }).ok, 'case cochée : inscription enregistrée');
ok(srv.post({ action: 'insc.lire', t: tok3(0) }).engageLe > 0, 'date d’acceptation conservée');
ok(srv.post({ action: 'insc.repondre', t: tok3(1), reponse: 'non' }).ok, 'désistement sans case à cocher');

console.log('Formule finale écrite à la main');
srv.post(Object.assign({}, base3, { action: 'mail.essai', apercu: ids[0], corps: 'Chère candidate, cher candidat,\n\nTexte.\n\nJe vous prie d’agréer, chère candidate, cher candidat, l’expression de mes sentiments dévoués.' }));
const m4 = srv.gmails.pop();
ok(m4.body.startsWith('Chère candidate, cher candidat,') && m4.body.indexOf('Je viendrai :') < m4.body.indexOf('Je vous prie d’agréer, chère candidate'), 'encadré placé avant la formule finale écrite à la main, sans formule d’appel ajoutée');

console.log('\n' + n + ' vérifications réussies.');
