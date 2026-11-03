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
const evt2 = Object.assign({}, evt, { id: '2027-01-09-retraite-b', limite: '2026-11-05', sansAccompagnants: true, suiviA: 'chancelier@oessh.lu', suiviCc: 'lieutenant@oessh.lu' });
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

console.log('Point quotidien jusqu’à la date limite');
ok(!srv.post(Object.assign({}, base2, { action: 'mail.essai', evenement: Object.assign({}, evt2, { suiviCc: 'pas-une-adresse' }) })).ok, 'adresse de copie invalide refusée');
const jl = srv.sheets.JournalEnvois.data, iDate = jl[0].indexOf('Date');
jl.forEach((x, i) => { if (i && x[9] === id2) x[iDate] = String(Date.now() - 2 * 86400000); });
srv.gmails.length = 0;
srv.run('rappelsInscriptions');
const pj = srv.gmails.filter(x => x.subject.startsWith('Inscriptions au ') && x.body.includes('Retraite') === false);
const point = srv.gmails.find(x => x.subject.startsWith('Inscriptions au ') && / : \d+\/3 réponses$/.test(x.subject));
ok(point && point.to === 'secretariat@oessh.lu,chancelier@oessh.lu' && point.cc === 'lieutenant@oessh.lu' && point.body.includes('Point des inscriptions du') && point.body.includes('Date limite : jeudi 5 novembre 2026') && point.body.includes('Nouvelles réponses ou modifications depuis hier'), 'point du jour envoyé à l’auteur et à Joris, Lieutenant en copie');
srv.gmails.length = 0;
srv.run('rappelsInscriptions');
ok(!srv.gmails.some(x => x.subject.startsWith('Inscriptions au ')), 'un seul point par jour');

console.log('État des inscriptions sur la page du week-end');
const ie = srv.run('(() => inscriptionsEvenement_("2027-01-09-retraite"))');
ok(ie.envoye && !ie.test && ie.total === 3 && ie.oui === 2 && ie.non === 1 && ie.personnes.length === 3, 'synthèse par événement : invités, réponses, personnes');
ok(srv.run('(() => inscriptionsEvenement_("inconnu"))').envoye === false, 'événement sans envoi : « pas encore envoyée »');

console.log('Appel personnalisé {Cher} {prenom}');
srv.gmails.length = 0;
const per = Object.assign({}, base3, { action: 'mail.essai', corps: '{Cher} {prenom},\n\nTexte.\n\nJe vous prie d’agréer, {cher} {prenom}, l’expression de mes sentiments dévoués.' });
srv.post(Object.assign({}, per, { apercu: ids[1] }));
let mp = srv.gmails.pop();
ok(mp.body.startsWith('Chère Claire,') && mp.body.includes('agréer, chère Claire,'), 'Madame : « Chère Claire, », sans formule d’appel ajoutée');
srv.post(Object.assign({}, per, { apercu: ids[0] }));
mp = srv.gmails.pop();
ok(mp.body.startsWith('Cher Michel,') && mp.body.includes('agréer, cher Michel,'), 'Monsieur : « Cher Michel, »');
ok(srv.post({ action: 'mail.charger', token: tJB }).membres.find(x => x.prenom === 'Claire').feminin === true, 'feminin exposé pour l’aperçu');

console.log('Orateurs, parrains et marraines : liste séparée, repas au choix, texte {perso}');
const evt5 = Object.assign({}, evt, { id: '2027-01-09-retraite', categorie: 'Orateurs, parrains et marraines', limite: '2026-11-08',
  repasListe: 'Déjeuner du samedi 9 janvier : 25 €\nDîner du samedi 9 janvier : 30 €\nDéjeuner du dimanche 10 janvier' });
const base5 = { token: tJB, casquette: 'secretaire', objet: 'Parrains', corps: '{Cher} {prenom},\n\nVous êtes {perso}.\n\nBien amicalement,', evenement: evt5 };
ok(!srv.post(Object.assign({}, base5, { action: 'mail.essai', apercu: ids[0] })).ok, '{perso} sans lignes : refusé');
const perso = 'Michel DAUPHIN : parrain de Jean\nClaire Martin : marraine de Paul';
r = srv.post(Object.assign({}, base5, { action: 'mail.essai', apercu: ids[1], perso }));
const m5 = srv.gmails.pop();
ok(r.ok && m5.body.includes('Vous êtes marraine de Paul.') && m5.body.includes('Repas proposés : Déjeuner du samedi 9 janvier (25 €), Dîner du samedi 9 janvier (30 €), Déjeuner du dimanche 10 janvier'), 'essai : {perso} remplacé, repas proposés listés');
const rr = srv.post(Object.assign({}, base5, { action: 'mail.envoyer', ids, perso }));
ok(!rr.ok && /Paul NEU/.test(rr.error), 'envoi refusé : {perso} manquant pour Paul NEU');
const perso2 = perso + '\nPaul Neu : parrain de Marc';
srv.post(Object.assign({}, base5, { action: 'mail.essai', apercu: ids[1], perso: perso2 }));
ok(srv.post(Object.assign({}, base5, { action: 'mail.envoyer', ids, perso: perso2 })).ok, 'envoi avec {perso} complet');
const id5 = srv.sheets.JournalEnvois.data.slice(-1)[0][9];
const tok5 = (i) => srv.run('(() => jetonInsc_("' + id5 + '", "' + ids[i] + '"))');
const l5 = srv.post({ action: 'insc.lire', t: tok5(0) });
ok(l5.repasListe.length === 3 && l5.max > 0, 'page : 3 repas au choix, accompagnants permis');
r = srv.post({ action: 'insc.repondre', t: tok5(0), reponse: 'oui', accompagnants: 1, noms: ['Anne Dauphin'], chambres: ['double', 'double'], repasChoix: [['r1', 'r2', 'zz'], ['r2']] });
ok(r.ok && r.repasChoix['Michel DAUPHIN'].join() === 'r1,r2' && r.repasChoix['Anne Dauphin'].join() === 'r2', 'repas cochés par personne (identifiant inconnu ignoré)');
const t5 = srv.post({ action: 'mail.inscriptions', token: tJB, id: id5 });
ok(t5.repasListe[0].n === 1 && t5.repasListe[1].n === 2 && t5.repasListe[2].n === 0, 'tableau de bord : couverts par repas');
const cands = srv.run('(() => inscriptionsEvenement_("2027-01-09-retraite", ""))');
const autres = srv.run('(() => inscriptionsEvenement_("2027-01-09-retraite", "Orateurs, parrains et marraines"))');
ok(autres.total === 3 && autres.oui === 1 && autres.repas[1].n === 2 && cands.personnes.every(p => p.nom !== 'Anne Dauphin'), 'liste séparée des candidats sur la page du week-end');

console.log('Rappels à dates choisies');
{
  const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const fr = (x) => x.split('-').reverse().join('/');
  const ev = { id: '2027-01-10-messe', date: iso(40), heure: '16:00', titre: 'Messe du dimanche', lieu: 'Chapelle', categorie: 'Messe', rappels: fr(iso(-1)) + ', ' + iso(5) + ', ' + iso(90) };
  ok(srv.run('(() => evenementDe_(' + JSON.stringify(ev) + ').rappels.join())') === [iso(-1), iso(5)].join(), 'dates lues (jj/mm/aaaa ou aaaa-mm-jj), au plus tard le jour de l’événement');
  const b2 = { token: tJB, casquette: 'secretaire', objet: 'Messe', corps: '{appel}\n\nInvitation.\n\n{politesse}', evenement: ev };
  srv.post(Object.assign({}, b2, { action: 'mail.essai', apercu: ids[0] })); srv.gmails.length = 0;
  ok(srv.post(Object.assign({}, b2, { action: 'mail.envoyer', ids })).ok, 'invitation avec rappels envoyée');
  const J = srv.sheets.JournalEnvois.data, lg = J[J.length - 1], id2 = lg[9];
  lg[0] = String(Date.now() - 5 * 86400000);   // invitation partie il y a 5 jours
  srv.post({ action: 'insc.repondre', t: srv.run('(() => jetonInsc_("' + id2 + '", "' + ids[0] + '"))'), reponse: 'oui', accompagnants: 0, noms: [] });
  srv.gmails.length = 0; srv.run('rappelsInscriptions');
  const rel = srv.gmails.filter(x => x.subject.startsWith('Votre réponse'));
  ok(rel.length === 2 && !rel.some(x => x.to === 'mdauphin@pt.lu'), 'rappel à la date atteinte, seulement à ceux qui n’ont pas répondu');
  srv.gmails.length = 0; srv.run('rappelsInscriptions');
  ok(!srv.gmails.some(x => x.subject.startsWith('Votre réponse')), 'pas de second rappel le même jour ni pour la même date');
  const iE = J[0].indexOf('Evenement'), e3 = JSON.parse(lg[iE]); e3.rappels = [iso(-3), iso(-1)].concat(e3.rappels.slice(1)); e3.rappels = [iso(-3), iso(-1), iso(0)]; lg[iE] = JSON.stringify(e3);
  srv.gmails.length = 0; srv.run('rappelsInscriptions');
  ok(srv.gmails.filter(x => x.subject.startsWith('Votre réponse')).length === 2, 'nouvelle date de rappel atteinte : nouveau rappel aux non-répondants');
}

{
  const autres = srv.run('(() => { var u = userFromRow_(lire_("Acces")[0]); u.ret = "organisateur"; return chargerProjet_(PROJETS.ret, u).inscriptionsAutres; })');
  const messe = autres.find(x => x.evenement === '2027-01-10-messe');
  ok(messe && messe.categorie === 'Messe' && messe.total === 3 && messe.oui === 1 && messe.nbPersonnes === 1 && autres.some(x => x.evenement === '2027-01-09-retraite'), 'réponses de la messe du dimanche visibles sur la page du week-end, à côté des autres listes');
}

console.log('Invitation ajoutée ou renvoyée après l’envoi groupé');
{
  const ev = { id: '2027-02-01-ajout', date: '2027-02-01', heure: '10:00', titre: 'Essai ajout', lieu: 'Chapelle' };
  const b = { token: tJB, casquette: 'secretaire', objet: 'Ajout', corps: '{appel}\n\nInvitation.\n\n{politesse}', evenement: ev };
  const J = srv.sheets.JournalEnvois.data;
  srv.post(Object.assign({}, b, { action: 'mail.essai', apercu: ids[0] }));
  ok(srv.post(Object.assign({}, b, { action: 'mail.envoyer', ids: [ids[0], ids[1]] })).ok, 'envoi groupé à deux personnes');
  J[J.length - 1][0] = String(Date.now() - 60000);
  let s1 = srv.run('(() => inscriptionsEvenement_("2027-02-01-ajout"))');
  ok(s1.total === 2 && !s1.test, 'deux invités');
  ok(srv.post(Object.assign({}, b, { action: 'mail.envoyer', ids: [ids[2]] })).ok, 'personne ajoutée : envoi individuel');
  s1 = srv.run('(() => inscriptionsEvenement_("2027-02-01-ajout"))');
  ok(s1.total === 3, 'envoi individuel après l’envoi groupé : compté');
  ok(srv.post(Object.assign({}, b, { action: 'mail.envoyer', ids: [ids[1]] })).ok, 'invitation renvoyée à une personne déjà invitée');
  const idR = J[J.length - 1][9];
  s1 = srv.run('(() => inscriptionsEvenement_("2027-02-01-ajout"))');
  ok(s1.total === 3 && s1.personnes.length === 3, 'personne réinvitée comptée une seule fois');
  srv.post({ action: 'insc.repondre', t: srv.run('(() => jetonInsc_("' + idR + '", "' + ids[1] + '"))'), reponse: 'oui', accompagnants: 0, noms: [] });
  s1 = srv.run('(() => inscriptionsEvenement_("2027-02-01-ajout"))');
  ok(s1.total === 3 && s1.oui === 1 && s1.sans === 2, 'réponse à l’invitation renvoyée prise en compte');
  const rempl = srv.run('(() => { var e = lire_("JournalEnvois").filter(function (r) { return r.Type === "envoi" && r.Id; }), l = lignesInsc_(), f = invitationsRemplacees_(e, l); return l.filter(f).length; })');
  ok(rempl >= 1, 'ancienne invitation marquée remplacée (plus de relance)');
}

console.log('\n' + n + ' vérifications réussies.');
