/**
 * Espace membres OESSH Luxembourg — serveur (Google Apps Script)
 * ---------------------------------------------------------------
 * Ce script est rattaché à une feuille Google Sheets PRIVÉE (compte jb.niedercorn@oessh.lu, Google Workspace de la Lieutenance).
 * Il est le seul point d'accès aux données : chaque demande doit porter une session valide,
 * obtenue soit par connexion Google (jeton vérifié auprès de Google), soit par code envoyé par e-mail.
 *
 * Ce fichier ne contient AUCUNE donnée : il peut être publié sans risque.
 * Les données vivent uniquement dans la feuille (onglets Acces, Taches, Intervenants, Activite, Jalons, Journal,
 * et pour le week-end de retraite : RetTaches, RetIntervenants, RetActivite, RetJalons, RetProgramme, RetOrganisation).
 *
 * Installation : voir espace/INSTALLATION.md
 */

/* ======================= Réglages ======================= */
var CONFIG = {
  GOOGLE_CLIENT_ID: '52829295071-cer9p7voptd0lgdrmgk5a35furmtn256.apps.googleusercontent.com',
  ADMINS_INITIAUX: [{ emails: ['jb.niedercorn@oessh.lu', 'jb.niedercorn@gmail.com'], nom: 'Jean-Baptiste Niedercorn' }],
  SESSION_JOURS: 30,
  CODE_MINUTES: 10,
  CODE_ESSAIS_MAX: 5,
  CODES_PAR_HEURE_PAR_ADRESSE: 5,
  CODES_PAR_HEURE_TOTAL: 60,
  NOM_EXPEDITEUR: 'OESSH Luxembourg',
  ACTIVITE_MAX: 40,
  // Courrier e-mail : fichier des membres (Google Sheets « 0_Fichier_Membres_actif ») et adresse d'envoi commune.
  MEMBRES_SHEET_ID: '1WPR56P1h8u7lSIVJRMc8S2lR8aMGQgbCJ_-UDwdidnQ',
  ENVOI_ALIAS: 'envois@oessh.lu',
  // Version du code, comparée par la page Courrier e-mail pour signaler un déploiement oublié
  VERSION: '2026-10-22a',
  // Suivi des réponses : actif seulement quand la propriété du script REPONSES_ALIAS est renseignée
  // (alias de collecte du compte du script, par ex. reponses@oessh.lu). Copies effacées après ce délai.
  REPONSES_JOURS: 30,
  REPONSES_LABEL: 'Réponses courrier',
  // Pièces jointes du Courrier e-mail : 10 Mo au total, 5 fichiers au plus
  PJ_MAX: 10 * 1024 * 1024,
  PJ_NB_MAX: 5,
  PJ_JOURS: 7,   // pièces jointes jamais envoyées : mises à la corbeille après ce délai
  // Images des courriels (en-tête, croix de signature), servies par le site public
  IMAGES_MAIL: 'https://luxembourg.oessh.lu/assets/email/',
  ENVOI_MAX: 200
};

var ONGLETS = {
  Acces: ['Email', 'Nom', 'Investiture', 'Actualites', 'Lectures', 'Newsletter', 'Gestion', 'Actif', 'Note'],
  Taches: ['Id', 'Titre', 'Pole', 'Responsables', 'Echeance', 'Statut', 'Note', 'Source', 'MajLe', 'MajPar'],
  Intervenants: ['TacheId', 'Nom', 'Role', 'Telephone', 'Email'],
  Activite: ['Date', 'Qui', 'Texte'],
  Jalons: ['Date', 'Titre', 'Detail', 'Cle'],
  Journal: ['Date', 'Qui', 'Action', 'Detail'],
  RetTaches: ['Id', 'Titre', 'Pole', 'Responsables', 'Echeance', 'Statut', 'Note', 'Source', 'MajLe', 'MajPar'],
  RetIntervenants: ['TacheId', 'Nom', 'Role', 'Telephone', 'Email'],
  RetActivite: ['Date', 'Qui', 'Texte'],
  RetJalons: ['Date', 'Titre', 'Detail', 'Cle'],
  RetProgramme: ['Id', 'Jour', 'Debut', 'Fin', 'Titre', 'Intervenant', 'Statut', 'Note'],
  RetOrganisation: ['Fonction', 'Nom'],
  JournalEnvois: ['Date', 'Qui', 'Casquette', 'Objet', 'Groupes', 'Nb', 'Erreurs', 'Type', 'PJ', 'Id', 'RepondreA', 'Destinataires']
};
// Colonne de droits du Courrier e-mail, ajoutée en fin d'onglet « Acces » par « installer ».
var COL_ENVOIS = 'Envois';
// Colonne de droits du week-end de retraite, ajoutée en fin d'onglet « Acces » par « installer » (les colonnes existantes ne bougent pas).
var COL_RETRAITE = 'Retraite';

var ROLES_INV = ['organisateur', 'contributeur', 'lecture', 'intervenant'];
var POLES = ['liturgie', 'lieux', 'invites', 'accueil', 'com', 'finances', 'candidats'];
var POLES_RET = ['programme', 'temoignages', 'liturgie', 'lieu', 'inscriptions', 'com'];
var STATUTS = ['afaire', 'encours', 'fait'];

/* ======================= Points d'entrée ======================= */
function doGet() {
  return json_({ ok: true, service: 'Espace membres OESSH Luxembourg' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Requête illisible.' }); }
  try {
    return json_(route_(req));
  } catch (err) {
    if (err && err.public) return json_({ ok: false, error: err.message, code: err.code || 'refus' });
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'Erreur du serveur. Réessayez dans un instant.', code: 'serveur' });
  }
}

function route_(req) {
  var a = String(req.action || '');
  // Actions sans session
  if (a === 'auth.google') return authGoogle_(req.idToken);
  if (a === 'auth.demanderCode') return demanderCode_(req.email);
  if (a === 'auth.verifierCode') return verifierCode_(req.email, req.code);

  // Actions avec session
  var user = userFromToken_(req.token);
  switch (a) {
    case 'auth.deconnexion': return deconnexion_(req.token);
    case 'moi': return { ok: true, user: publicUser_(user) };
    case 'inv.charger': return chargerProjet_(PROJETS.inv, user);
    case 'inv.statut': return statutTache_(PROJETS.inv, user, req.id, req.statut);
    case 'inv.prendre': return prendreTache_(PROJETS.inv, user, req.id, req.nom);
    case 'inv.enregistrer': return enregistrerTache_(PROJETS.inv, user, req.tache);
    case 'inv.supprimer': return supprimerTache_(PROJETS.inv, user, req.id);
    case 'ret.charger': return chargerProjet_(PROJETS.ret, user);
    case 'ret.statut': return statutTache_(PROJETS.ret, user, req.id, req.statut);
    case 'ret.prendre': return prendreTache_(PROJETS.ret, user, req.id, req.nom);
    case 'ret.enregistrer': return enregistrerTache_(PROJETS.ret, user, req.tache);
    case 'ret.supprimer': return supprimerTache_(PROJETS.ret, user, req.id);
    case 'ret.creneau': return enregistrerCreneau_(PROJETS.ret, user, req.creneau);
    case 'ret.creneauSupprimer': return supprimerCreneau_(PROJETS.ret, user, req.id);
    case 'acces.lister': return accesLister_(user);
    case 'acces.enregistrer': return accesEnregistrer_(user, req.personne, req.emailOriginal);
    case 'acces.supprimer': return accesSupprimer_(user, req.email);
    case 'acces.deconnecter': return accesDeconnecter_(user, req.email);
    case 'pub.github': return pubGithub_(user, req.methode, req.chemin, req.corps);
    case 'pub.claude': return pubClaude_(user, req.corps);
    case 'courrier.sauvegarder': return courrierSauvegarder_(user, req);
    case 'courrier.liste': return courrierListe_(user);
    case 'mail.charger': return mailCharger_(user);
    case 'mail.essai': return mailEssai_(user, req);
    case 'mail.envoyer': return mailEnvoyer_(user, req);
    case 'mail.joindre': return mailJoindre_(user, req);
    case 'mail.reponses': return mailReponses_(user, req);
    default: throw refus_('Action inconnue.', 'inconnu');
  }
}

/* ======================= Installation ======================= */
function installer() {
  var ss = classeur_(true);
  Object.keys(ONGLETS).forEach(function (nom) {
    var sh = ss.getSheetByName(nom) || ss.insertSheet(nom);
    var head = ONGLETS[nom];
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), head.length).setNumberFormat('@');
  });
  var acc = lire_('Acces');
  CONFIG.ADMINS_INITIAUX.forEach(function (a) {
    var em = a.emails.map(norm_);
    if (!acc.some(function (r) { return emails_(r.Email).some(function (x) { return em.indexOf(x) > -1; }); })) {
      ajouter_('Acces', { Email: em.join('; '), Nom: a.nom, Investiture: 'organisateur', Actualites: 'oui', Lectures: 'oui', Newsletter: 'oui', Gestion: 'oui', Actif: 'oui', Note: 'Administrateur initial' });
    }
  });
  // Week-end de retraite : colonne de droits (créée une fois), l'administrateur initial y est organisateur.
  if (ajouterColonne_('Acces', COL_RETRAITE)) {
    CONFIG.ADMINS_INITIAUX.forEach(function (a) {
      var em = a.emails.map(norm_);
      ecrireColonne_('Acces', function (r) { return emails_(r.Email).some(function (x) { return em.indexOf(x) > -1; }); }, COL_RETRAITE, 'organisateur');
    });
  }
  if (ajouterColonne_('Acces', COL_ENVOIS)) {
    CONFIG.ADMINS_INITIAUX.forEach(function (a) {
      var em = a.emails.map(norm_);
      ecrireColonne_('Acces', function (r) { return emails_(r.Email).some(function (x) { return em.indexOf(x) > -1; }); }, COL_ENVOIS, 'oui');
    });
  }
  if (!lire_('RetJalons').length) {
    [
      ['2026-11-14', 'Conseil de la Lieutenance', 'Programme du week-end de formation', ''],
      ['2027-01-09', 'Ouverture du week-end · messe', 'Maison d\u2019Accueil des Franciscaines · samedi 9h00', 'oui'],
      ['2027-01-10', 'Messe de clôture avec les membres', 'Maison d\u2019Accueil des Franciscaines · dimanche 16h00', 'oui'],
      ['2027-01-31', 'Dossiers des candidats finalisés', 'Échéance fixée par le Conseil', '']
    ].forEach(function (j) { ajouter_('RetJalons', { Date: j[0], Titre: j[1], Detail: j[2], Cle: j[3] }); });
  }
  if (!lire_('Jalons').length) {
    [
      ['2026-09-26', 'Conseil de la Lieutenance', "Lancement de l'organisation des cérémonies", ''],
      ['2026-11-14', 'Conseil de la Lieutenance', 'Programme et newsletter 2027', ''],
      ['2027-01-09', 'Week-end de formation des candidats', 'Maison mère des Sœurs franciscaines · 9 et 10 janvier', ''],
      ['2027-01-31', 'Dossiers des candidats finalisés', 'Échéance fixée par le Conseil', ''],
      ['2027-03-12', "Assemblée générale de l'OESSH Asbl", 'Messe à 18h00, AG à 19h30 chez les Sœurs franciscaines', ''],
      ['2027-04-09', 'Grands clercs à prévenir', 'Trois mois avant les cérémonies', ''],
      ['2027-07-09', 'Veillée de prière', 'Église Saint-Michel · vendredi soir', 'oui'],
      ['2027-07-10', "Investiture et lunch de gala", 'Église Saint-Michel · Parc Hôtel Alvisse · agape au Cercle Munster', 'oui']
    ].forEach(function (j) { ajouter_('Jalons', { Date: j[0], Titre: j[1], Detail: j[2], Cle: j[3] }); });
  }
  journal_('installation', 'installer', 'Onglets créés');
  MailApp.getRemainingDailyQuota();
  var msg = 'Installation terminée. Feuille : ' + ss.getUrl();
  console.log(msg);
  return msg;
}

function nettoyerSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), now = Date.now(), n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s:') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) { props.deleteProperty(k); n++; } } catch (e) { props.deleteProperty(k); n++; }
  });
  return n + ' session(s) supprimée(s)';
}

function effacerContactsIntervenants() {
  var sh = feuille_('Intervenants'), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 4, last - 1, 2).setValues(new Array(last - 1).fill(['', '']));
  journal_('installation', 'rgpd', 'Contacts des intervenants effacés');
  return 'Contacts effacés';
}

function effacerContactsRetraite() {
  var sh = feuille_('RetIntervenants'), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 4, last - 1, 2).setValues(new Array(last - 1).fill(['', '']));
  journal_('installation', 'rgpd', 'Contacts des intervenants du week-end de retraite effacés');
  return 'Contacts effacés';
}

/* ======================= Authentification ======================= */
function authGoogle_(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 5000) throw refus_('Connexion Google invalide.', 'auth');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw refus_('Connexion Google refusée. Réessayez.', 'auth');
  var info = JSON.parse(res.getContentText());
  var okIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  var okVerified = info.email_verified === true || info.email_verified === 'true';
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID || !okIss || !okVerified || Number(info.exp) * 1000 < Date.now()) {
    throw refus_('Connexion Google refusée. Réessayez.', 'auth');
  }
  var row = accesPour_(info.email);
  if (!row) {
    journal_(norm_(info.email), 'refus', 'Connexion Google sans autorisation');
    throw refus_("Votre compte n'est pas autorisé. Demandez l'accès au secrétariat de la Lieutenance.", 'non_autorise');
  }
  return ouvrirSession_(row, 'google', info.email);
}

function demanderCode_(email) {
  email = norm_(email);
  var neutre = { ok: true, message: "Si cette adresse est autorisée, un code vient d'y être envoyé." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw refus_('Adresse e-mail invalide.', 'email');
  var cache = CacheService.getScriptCache();
  var nAdr = Number(cache.get('otpn:' + email) || 0), nTot = Number(cache.get('otpn:*') || 0);
  if (nAdr >= CONFIG.CODES_PAR_HEURE_PAR_ADRESSE || nTot >= CONFIG.CODES_PAR_HEURE_TOTAL) throw refus_('Trop de demandes. Réessayez dans une heure.', 'limite');
  cache.put('otpn:' + email, String(nAdr + 1), 3600);
  cache.put('otpn:*', String(nTot + 1), 3600);
  var row = accesPour_(email);
  if (!row) { journal_(email, 'refus', 'Code demandé sans autorisation'); return neutre; }
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, JSON.stringify({ h: hash_(code + '|' + email), essais: 0 }), CONFIG.CODE_MINUTES * 60);
  var prenom = String(row.Nom || '').split(' ')[0];
  var corps = 'Bonjour ' + prenom + ',\n\nVoici votre code de connexion à l’espace membres de la Lieutenance : ' + code +
    '\n\nCe code est valable ' + CONFIG.CODE_MINUTES + ' minutes. Si vous n’avez rien demandé, ignorez ce message.\n\nOrdre Équestre du Saint-Sépulcre de Jérusalem\nLieutenance pour le Luxembourg';
  MailApp.sendEmail({ to: email, subject: 'Votre code de connexion : ' + code, body: corps, name: CONFIG.NOM_EXPEDITEUR });
  return neutre;
}

function verifierCode_(email, code) {
  email = norm_(email);
  code = String(code || '').replace(/\D/g, '');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otp:' + email);
  if (!raw) throw refus_('Code expiré ou inconnu. Demandez un nouveau code.', 'code');
  var o = JSON.parse(raw);
  if (o.essais >= CONFIG.CODE_ESSAIS_MAX) { cache.remove('otp:' + email); throw refus_('Trop d’essais. Demandez un nouveau code.', 'code'); }
  if (hash_(code + '|' + email) !== o.h) {
    o.essais++;
    cache.put('otp:' + email, JSON.stringify(o), CONFIG.CODE_MINUTES * 60);
    throw refus_('Code incorrect.', 'code');
  }
  cache.remove('otp:' + email);
  var row = accesPour_(email);
  if (!row) throw refus_("Votre compte n'est pas autorisé.", 'non_autorise');
  return ouvrirSession_(row, 'code', email);
}

function ouvrirSession_(row, via, loginEmail) {
  try { nettoyerSessions(); } catch (e) {}
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + CONFIG.SESSION_JOURS * 86400000;
  loginEmail = norm_(loginEmail);
  PropertiesService.getScriptProperties().setProperty('s:' + hash_(token), JSON.stringify({ email: loginEmail, exp: exp }));
  journal_(loginEmail, 'connexion', via);
  return { ok: true, token: token, expire: exp, user: publicUser_(userFromRow_(row, loginEmail)) };
}

function deconnexion_(token) {
  PropertiesService.getScriptProperties().deleteProperty('s:' + hash_(String(token || '')));
  return { ok: true };
}

function userFromToken_(token) {
  if (!token || typeof token !== 'string') throw refus_('Session expirée. Reconnectez-vous.', 'session');
  var props = PropertiesService.getScriptProperties();
  var key = 's:' + hash_(token), raw = props.getProperty(key);
  if (!raw) throw refus_('Session expirée. Reconnectez-vous.', 'session');
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) { props.deleteProperty(key); throw refus_('Session expirée. Reconnectez-vous.', 'session'); }
  var row = accesPour_(s.email);
  if (!row) { props.deleteProperty(key); throw refus_("Votre accès a été retiré.", 'session'); }
  return userFromRow_(row, s.email);
}

/* ======================= Droits ======================= */
function accesPour_(email) {
  email = norm_(email);
  if (!email) return null;
  var rows = lire_('Acces');
  for (var i = 0; i < rows.length; i++) {
    // Adresses de connexion : colonne Email (séparées par ; ou ,) et colonne Emails (séparées par |)
    if ((emails_(rows[i].Email).indexOf(email) > -1 || emails_(String(rows[i].Emails || '').replace(/\|/g, ';')).indexOf(email) > -1) && oui_(rows[i].Actif)) return rows[i];
  }
  return null;
}
function emails_(v) {
  var out = [];
  String(v || '').split(/[;,\s]+/).forEach(function (e) { e = norm_(e); if (e && out.indexOf(e) < 0) out.push(e); });
  return out;
}
function cle_(r) { return emails_(r.Email)[0] || ''; }

/** Colonne facultative « Signature » de l'onglet Acces (titre lu sans tenir compte des majuscules ni des espaces). */
function colSignature_(r) {
  for (var k in r) if (String(k).trim().toLowerCase() === 'signature') return String(r[k] || '').trim();
  return '';
}
function userFromRow_(r, loginEmail) {
  var inv = String(r.Investiture || '').toLowerCase().trim();
  var ret = String(r[COL_RETRAITE] || '').toLowerCase().trim();
  var ems = emails_(r.Email);
  // Emails supplémentaires (colonne Emails, séparés par |)
  var extraEmails = String(r.Emails || '').split('|').map(function(e){ return norm_(e); }).filter(Boolean);
  // Fusionner sans doublon
  extraEmails.forEach(function(e){ if (ems.indexOf(e) < 0) ems.push(e); });
  return {
    email: norm_(loginEmail) || ems[0] || '',
    emails: ems,
    cle: emails_(r.Email)[0] || '',
    nom: String(r.Nom || ems[0] || ''),
    inv: ROLES_INV.indexOf(inv) > -1 ? inv : '',
    ret: ROLES_INV.indexOf(ret) > -1 ? ret : '',
    site: { actualites: oui_(r.Actualites), lectures: oui_(r.Lectures), newsletter: oui_(r.Newsletter) },
    gestion: oui_(r.Gestion),
    admin: oui_(r.Admin),
    media: oui_(r.Media),
    courrier: oui_(r.Courrier),
    envois: oui_(r[COL_ENVOIS]),
    roles: String(r.Roles || ''),
    // Nom tel qu'il est signé dans le Courrier e-mail (colonne facultative Signature, ex. « Dr Jean-Baptiste Niedercorn »)
    signature: colSignature_(r) || String(r.Nom || ems[0] || ''),
    userEmails: String(r.Emails || '')
  };
}

function publicUser_(u) {
  return {
    email: u.email,
    emails: u.emails,
    nom: u.nom,
    signature: u.signature || u.nom,
    inv: u.inv,
    ret: u.ret,
    site: u.site,
    gestion: u.gestion,
    admin: u.admin,
    media: u.media,
    courrier: u.courrier,
    envois: u.envois,
    roles: u.roles,
    userEmails: u.userEmails
  };
}

function exigerProjet_(u, P, roles) {
  if (roles.indexOf(u[P.droit]) < 0) throw refus_("Vous n'avez pas les droits pour cette action.", 'droits');
}
function exigerGestion_(u) { if (!u.gestion) throw refus_("Vous n'avez pas les droits pour gérer les accès.", 'droits'); }

function peutModifier_(u, t, P) {
  var role = u[P.droit];
  if (role === 'organisateur') return true;
  if (role !== 'contributeur') return false;
  return !t.resp.length || t.resp.indexOf(u.nom) > -1;
}

/* ======================= Projets (investiture, retraite) ======================= */
/* Les deux tableaux de bord partagent le même fonctionnement : chaque projet a ses propres onglets,
   sa colonne de droits dans « Acces » et ses pôles. */
var PROJETS = {
  inv: { droit: 'inv', col: 'Investiture', T: 'Taches', I: 'Intervenants', A: 'Activite', J: 'Jalons', poles: POLES },
  ret: { droit: 'ret', col: 'Retraite', T: 'RetTaches', I: 'RetIntervenants', A: 'RetActivite', J: 'RetJalons', poles: POLES_RET, programme: 'RetProgramme', organisation: 'RetOrganisation' }
};

function chargerProjet_(P, u) {
  exigerProjet_(u, P, ROLES_INV);
  var role = u[P.droit];
  var taches = toutesTaches_(P);
  if (role === 'intervenant') {
    taches = taches.filter(function (t) {
      return t.equipe.some(function (m) { return (m.email && u.emails.indexOf(norm_(m.email)) > -1) || (m.nom && m.nom === u.nom); });
    });
  }
  var activite = role === 'intervenant' ? [] : lire_(P.A).slice(-CONFIG.ACTIVITE_MAX).reverse().map(function (r) { return { ts: Number(r.Date) || 0, qui: r.Qui, texte: r.Texte }; });
  var jalons = lire_(P.J).map(function (r) { return { d: dateTxt_(r.Date), t: r.Titre, w: r.Detail, key: oui_(r.Cle) }; });
  var noms = {};
  lire_('Acces').forEach(function (r) { var x = String(r[P.col] || '').toLowerCase().trim(); if (oui_(r.Actif) && x && x !== 'intervenant') noms[r.Nom] = 1; });
  taches.forEach(function (t) { t.resp.forEach(function (n) { noms[n] = 1; }); });
  var out = { ok: true, user: publicUser_(u), taches: taches, activite: activite, jalons: jalons, personnes: Object.keys(noms).filter(Boolean), peutModifierTout: role === 'organisateur' };
  if (P.programme) out.programme = toutProgramme_(P);
  // Qui organise (affiché sous le titre) : renseigné dans l'onglet, une ligne par personne.
  if (P.organisation) out.organisation = lire_(P.organisation).filter(function (r) { return r.Nom; }).map(function (r) { return { fonction: r.Fonction, nom: r.Nom }; });
  return out;
}

function statutTache_(P, u, id, statut) {
  exigerProjet_(u, P, ['organisateur', 'contributeur']);
  if (STATUTS.indexOf(statut) < 0) throw refus_('Statut inconnu.', 'donnees');
  return verrou_(function () {
    var t = tache_(P, id);
    if (!peutModifier_(u, t, P)) throw refus_("Seul le responsable de cette tâche ou un organisateur peut la modifier.", 'droits');
    if (t.statut === statut) return { ok: true };
    majTache_(P, id, { Statut: statut, MajLe: String(Date.now()), MajPar: u.nom });
    var verbe = { afaire: 'remis « à faire »', encours: 'passé « en cours »', fait: 'terminé' }[statut];
    activite_(P, u.nom, '« ' + t.titre + ' » : ' + verbe);
    return { ok: true };
  });
}

function prendreTache_(P, u, id, nom) {
  exigerProjet_(u, P, ['organisateur', 'contributeur']);
  var org = u[P.droit] === 'organisateur';
  nom = texte_(nom || u.nom, 80);
  if (!org && nom !== u.nom) throw refus_('Vous ne pouvez inscrire que vous-même.', 'droits');
  return verrou_(function () {
    var t = tache_(P, id);
    if (!org && t.resp.length) throw refus_('Cette tâche a déjà un responsable.', 'droits');
    if (t.resp.indexOf(nom) < 0) t.resp.push(nom);
    majTache_(P, id, { Responsables: t.resp.join('; '), MajLe: String(Date.now()), MajPar: u.nom });
    activite_(P, u.nom, (nom === u.nom ? 'prend en charge' : 'attribue à ' + nom) + ' « ' + t.titre + ' »');
    return { ok: true };
  });
}

function enregistrerTache_(P, u, x) {
  exigerProjet_(u, P, ['organisateur', 'contributeur']);
  var org = u[P.droit] === 'organisateur';
  if (!x || typeof x !== 'object') throw refus_('Tâche invalide.', 'donnees');
  var titre = texte_(x.titre, 160);
  if (!titre) throw refus_('Le titre est obligatoire.', 'donnees');
  var pole = P.poles.indexOf(x.pole) > -1 ? x.pole : P.poles[0];
  var statut = STATUTS.indexOf(x.statut) > -1 ? x.statut : 'afaire';
  var ech = /^\d{4}-\d{2}-\d{2}$/.test(String(x.echeance || '')) ? x.echeance : '';
  var resp = (Array.isArray(x.resp) ? x.resp : []).map(function (n) { return texte_(n, 80); }).filter(Boolean).slice(0, 8);
  var equipe = (Array.isArray(x.equipe) ? x.equipe : []).slice(0, 40).map(function (m) {
    return { nom: texte_(m && m.nom, 80), role: texte_(m && m.role, 60), tel: texte_(m && m.tel, 30), email: norm_(m && m.email).slice(0, 120) };
  }).filter(function (m) { return m.nom || m.tel; });
  var note = texte_(x.note, 600);

  return verrou_(function () {
    if (x.id) {
      var t = tache_(P, x.id);
      if (!peutModifier_(u, t, P)) throw refus_("Seul le responsable de cette tâche ou un organisateur peut la modifier.", 'droits');
      if (!org) resp = t.resp.length ? t.resp : resp.filter(function (n) { return n === u.nom; });
      majTache_(P, x.id, { Titre: titre, Pole: pole, Responsables: resp.join('; '), Echeance: ech, Statut: statut, Note: note, MajLe: String(Date.now()), MajPar: u.nom });
      ecrireEquipe_(P, x.id, equipe);
      activite_(P, u.nom, 'met à jour « ' + titre + ' »');
      return { ok: true, id: x.id };
    }
    if (!org) resp = [u.nom];
    var id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    ajouter_(P.T, { Id: id, Titre: titre, Pole: pole, Responsables: resp.join('; '), Echeance: ech, Statut: statut, Note: note, Source: 'Ajout', MajLe: String(Date.now()), MajPar: u.nom });
    ecrireEquipe_(P, id, equipe);
    activite_(P, u.nom, 'ajoute « ' + titre + ' »');
    return { ok: true, id: id };
  });
}

function supprimerTache_(P, u, id) {
  exigerProjet_(u, P, ['organisateur']);
  return verrou_(function () {
    var t = tache_(P, id);
    supprimerLignes_(P.T, function (r) { return r.Id === id; });
    supprimerLignes_(P.I, function (r) { return r.TacheId === id; });
    activite_(P, u.nom, 'supprime « ' + t.titre + ' »');
    return { ok: true };
  });
}

function toutesTaches_(P) {
  var eq = {};
  lire_(P.I).forEach(function (r) {
    (eq[r.TacheId] = eq[r.TacheId] || []).push({ nom: r.Nom, role: r.Role, tel: r.Telephone, email: r.Email });
  });
  return lire_(P.T).filter(function (r) { return r.Id; }).map(function (r) {
    return {
      id: String(r.Id), titre: r.Titre, pole: r.Pole,
      resp: String(r.Responsables || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean),
      echeance: dateTxt_(r.Echeance), statut: STATUTS.indexOf(r.Statut) > -1 ? r.Statut : 'afaire',
      note: r.Note, source: r.Source, maj: Number(r.MajLe) || 0, majPar: r.MajPar,
      equipe: eq[r.Id] || []
    };
  });
}
function tache_(P, id) {
  var ts = toutesTaches_(P);
  for (var i = 0; i < ts.length; i++) if (ts[i].id === String(id)) return ts[i];
  throw refus_('Tâche introuvable (elle a peut-être été supprimée).', 'introuvable');
}
function majTache_(P, id, champs) { majLigne_(P.T, function (r) { return r.Id === String(id); }, champs); }
function ecrireEquipe_(P, id, equipe) {
  supprimerLignes_(P.I, function (r) { return r.TacheId === id; });
  equipe.forEach(function (m) { ajouter_(P.I, { TacheId: id, Nom: m.nom, Role: m.role, Telephone: m.tel, Email: m.email }); });
}
function activite_(P, qui, texte) {
  ajouter_(P.A, { Date: String(Date.now()), Qui: qui, Texte: texte });
  var sh = feuille_(P.A), extra = sh.getLastRow() - 1 - 500;
  if (extra > 0) sh.deleteRows(2, extra);
}

/* ---------- Programme du week-end de retraite (créneaux horaires) ---------- */
var STATUTS_CRENEAU = ['confirme', 'principe', 'aconfirmer', 'atrouver', ''];

function toutProgramme_(P) {
  return lire_(P.programme).filter(function (r) { return r.Id; }).map(function (r) {
    var st = String(r.Statut || '').toLowerCase().trim();
    return {
      id: String(r.Id), jour: String(r.Jour || '').slice(0, 10), debut: String(r.Debut || ''), fin: String(r.Fin || ''),
      titre: r.Titre, qui: r.Intervenant, statut: STATUTS_CRENEAU.indexOf(st) > -1 ? st : '', note: r.Note
    };
  });
}

function enregistrerCreneau_(P, u, x) {
  exigerProjet_(u, P, ['organisateur']);
  if (!x || typeof x !== 'object') throw refus_('Créneau invalide.', 'donnees');
  var titre = texte_(x.titre, 300);
  if (!titre) throw refus_('Le titre est obligatoire.', 'donnees');
  var heure = function (h) { h = String(h || '').trim(); return /^\d{2}:\d{2}$/.test(h) ? h : ''; };
  var jour = /^\d{4}-\d{2}-\d{2}$/.test(String(x.jour || '')) ? x.jour : 'notes';
  var ligne = {
    Jour: jour, Debut: heure(x.debut), Fin: heure(x.fin), Titre: titre, Intervenant: texte_(x.qui, 200),
    Statut: STATUTS_CRENEAU.indexOf(x.statut) > -1 ? x.statut : '', Note: texte_(x.note, 400)
  };
  return verrou_(function () {
    if (x.id) {
      majLigne_(P.programme, function (r) { return r.Id === String(x.id); }, ligne);
      activite_(P, u.nom, 'modifie le programme : « ' + titre + ' »');
      return { ok: true, id: x.id };
    }
    var id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    ligne.Id = id;
    ajouter_(P.programme, ligne);
    activite_(P, u.nom, 'ajoute au programme « ' + titre + ' »');
    return { ok: true, id: id };
  });
}

function supprimerCreneau_(P, u, id) {
  exigerProjet_(u, P, ['organisateur']);
  return verrou_(function () {
    var c = toutProgramme_(P).filter(function (x) { return x.id === String(id); })[0];
    if (!c) throw refus_('Créneau introuvable.', 'introuvable');
    supprimerLignes_(P.programme, function (r) { return r.Id === String(id); });
    activite_(P, u.nom, 'retire du programme « ' + c.titre + ' »');
    return { ok: true };
  });
}

/* ======================= Accès ======================= */
function accesLister_(u) {
  exigerGestion_(u);
  var personnes = lire_('Acces').map(function (r) {
    var x = userFromRow_(r); delete x.email; x.actif = oui_(r.Actif); x.note = r.Note || ''; return x;
  });
  var journal = lire_('Journal').slice(-60).reverse().map(function (r) { return { ts: Number(r.Date) || 0, qui: r.Qui, action: r.Action, detail: r.Detail }; });
  return { ok: true, personnes: personnes, journal: journal };
}

function accesEnregistrer_(u, p, cleOriginale) {
  exigerGestion_(u);
  if (!p || typeof p !== 'object') throw refus_('Données invalides.', 'donnees');
  var ems = emails_(p.email);
  if (!ems.length) throw refus_('Indiquez au moins une adresse e-mail.', 'donnees');
  ems.forEach(function (e) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw refus_('Adresse e-mail invalide : ' + e, 'donnees'); });
  if (ems.length > 5) throw refus_('Cinq adresses au maximum par personne.', 'donnees');
  var orig = norm_(cleOriginale);
  var inv = ROLES_INV.indexOf(p.inv) > -1 ? p.inv : '';
  var ret = ROLES_INV.indexOf(p.ret) > -1 ? p.ret : '';
  var site = p.site || {};
  var ligne = {
    Email: ems.join('; '), Nom: texte_(p.nom, 80) || ems[0], Investiture: inv,
    Actualites: site.actualites ? 'oui' : '', Lectures: site.lectures ? 'oui' : '', Newsletter: site.newsletter ? 'oui' : '',
    Gestion: p.gestion ? 'oui' : '', Actif: p.actif === false ? 'non' : 'oui', Note: texte_(p.note, 200)
  };
  return verrou_(function () {
    var rows = lire_('Acces');
    var cible = orig ? rows.filter(function (r) { return cle_(r) === orig; })[0] : null;
    if (orig && !cible) throw refus_('Cette personne n’existe plus dans la liste.', 'introuvable');
    if (cible && emails_(cible.Email).indexOf(u.email) > -1 && (!ligne.Gestion || ligne.Actif !== 'oui' || ems.indexOf(u.email) < 0)) {
      throw refus_('Vous ne pouvez pas retirer vos propres droits de gestion, ni l’adresse avec laquelle vous êtes connecté.', 'droits');
    }
    var doublon = rows.filter(function (r) { return r !== cible && emails_(r.Email).some(function (e) { return ems.indexOf(e) > -1; }); })[0];
    if (doublon) throw refus_('Une de ces adresses est déjà attribuée à ' + (doublon.Nom || cle_(doublon)) + '.', 'donnees');
    if (cible) majLigne_('Acces', function (r) { return cle_(r) === orig; }, ligne);
    else ajouter_('Acces', ligne);
    if (!ecrireColonne_('Acces', function (r) { return cle_(r) === ems[0]; }, COL_RETRAITE, ret) && ret) {
      throw refus_("La colonne « Retraite » manque dans l'onglet Acces : lancez « installer » dans le script.", 'installation');
    }
    ligne.Retraite = ret;
    journal_(u.email, cible ? 'acces.modifie' : 'acces.ajoute', resumeDroits_(ligne));
    return { ok: true };
  });
}

function accesSupprimer_(u, cle) {
  exigerGestion_(u);
  cle = norm_(cle);
  return verrou_(function () {
    var cible = lire_('Acces').filter(function (r) { return cle_(r) === cle; })[0];
    if (!cible) return { ok: true };
    if (emails_(cible.Email).indexOf(u.email) > -1) throw refus_('Vous ne pouvez pas supprimer votre propre accès.', 'droits');
    supprimerLignes_('Acces', function (r) { return cle_(r) === cle; });
    journal_(u.email, 'acces.supprime', cible.Email);
    return { ok: true };
  });
}
function accesDeconnecter_(u, cle) {
  exigerGestion_(u);
  cle = norm_(cle);
  var cible = lire_('Acces').filter(function (r) { return cle_(r) === cle; })[0];
  if (!cible) throw refus_('Personne introuvable.', 'introuvable');
  var ems = emails_(cible.Email);
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s:') !== 0) return;
    try { if (ems.indexOf(JSON.parse(all[k]).email) > -1) { props.deleteProperty(k); n++; } } catch (e) {}
  });
  journal_(u.email, 'acces.deconnecte', cible.Email + ' — ' + n + ' session(s) fermée(s)');
  return { ok: true, fermees: n, vous: ems.indexOf(u.email) > -1 };
}
function resumeDroits_(l) {
  var d = [];
  if (l.Investiture) d.push('investiture : ' + l.Investiture);
  if (l.Retraite) d.push('retraite : ' + l.Retraite);
  ['Actualites', 'Lectures', 'Newsletter'].forEach(function (k) { if (l[k]) d.push(k.toLowerCase()); });
  if (l.Gestion) d.push('gestion des accès');
  return l.Email + ' — ' + (d.join(', ') || 'aucun droit') + (l.Actif !== 'oui' ? ' (désactivé)' : '');
}
function journal_(qui, action, detail) { ajouter_('Journal', { Date: String(Date.now()), Qui: qui, Action: action, Detail: detail }); }

/* ======================= Publication sur le site (admin) ======================= */
var FICHIERS_PUB = { 'actualites.json': 'actualites', 'lectures.json': 'lectures', 'newsletters.json': 'newsletter', 'calendrier.json': 'actualites' };
var ASSET_RE = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(jpe?g|png|webp|gif|pdf)$/i;

function aUnDroitSite_(u) { return !!(u.site && (u.site.actualites || u.site.lectures || u.site.newsletter)); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function pubGithub_(u, methode, chemin, corps) {
  if (!aUnDroitSite_(u)) throw refus_("Vous n'avez pas accès à l'administration du site.", 'droits');
  methode = String(methode || 'GET').toUpperCase();
  if (methode !== 'GET' && methode !== 'PUT') throw refus_('Opération non autorisée.', 'droits');
  chemin = String(chemin || '').split('?')[0].replace(/^\/+/, '');
  if (chemin.indexOf('..') > -1) throw refus_('Fichier non autorisé.', 'droits');
  var droit = FICHIERS_PUB[chemin];
  var estAsset = ASSET_RE.test(chemin);
  if (!droit && !estAsset) throw refus_('Fichier non autorisé : ' + chemin, 'droits');
  if (methode === 'PUT' && droit && !u.site[droit]) throw refus_("Vous n'avez pas le droit de modifier cette rubrique.", 'droits');

  var token = prop_('GITHUB_TOKEN');
  if (!token) throw refus_("La publication n'est pas encore configurée (jeton GitHub manquant dans le script).", 'config');
  var repo = prop_('GITHUB_REPO') || 'NN70007/oessh_site';
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + chemin.split('/').map(encodeURIComponent).join('/');
  var opts = {
    method: methode.toLowerCase(), muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'oessh-espace-membres' }
  };
  var detail = '';
  if (methode === 'PUT') {
    if (!corps || typeof corps.content !== 'string') throw refus_('Contenu manquant.', 'donnees');
    if (corps.content.length > 20 * 1024 * 1024) throw refus_('Fichier trop volumineux.', 'donnees');
    if (droit) {
      var txt;
      try { txt = Utilities.newBlob(Utilities.base64Decode(corps.content.replace(/\s/g, ''))).getDataAsString('UTF-8'); JSON.parse(txt); }
      catch (e) { throw refus_('Le contenu envoyé n’est pas un fichier valide : publication refusée.', 'donnees'); }
    }
    var message = texte_(corps.message, 180) || ('Mise à jour ' + chemin);
    message += ' — par ' + u.nom;
    var payload = { message: message, content: corps.content.replace(/\s/g, '') };
    if (corps.sha) payload.sha = String(corps.sha);
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(payload);
    detail = chemin + ' — ' + message;
  }
  var res = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode(), txtRes = res.getContentText(), data;
  try { data = JSON.parse(txtRes); } catch (e) { data = { message: txtRes }; }
  if (methode === 'PUT') journal_(u.email, code < 300 ? 'publication' : 'publication.echec', detail + (code < 300 ? '' : ' (' + code + ')'));
  return { ok: true, status: code, data: data };
}

function pubClaude_(u, corps) {
  // Rédaction assistée : éditeurs du site et utilisateurs de l'outil courrier
  if (!aUnDroitSite_(u) && !u.courrier && !u.envois) throw refus_("Vous n'avez pas accès à la rédaction assistée.", 'droits');
  var key = prop_('CLAUDE_KEY');
  if (!key) throw refus_("La rédaction assistée n'est pas encore configurée (clé Claude manquante dans le script).", 'config');
  var cache = CacheService.getScriptCache(), k = 'claude:' + u.email, n = Number(cache.get(k) || 0);
  if (n >= 80) throw refus_('Trop de demandes de rédaction cette heure-ci. Réessayez plus tard.', 'limite');
  cache.put(k, String(n + 1), 3600);
  corps = corps || {};
  var messages = (Array.isArray(corps.messages) ? corps.messages : []).filter(function (m) {
    return m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content));
  }).slice(0, 20);
  if (!messages.length) throw refus_('Demande vide.', 'donnees');
  var body = { model: prop_('CLAUDE_MODEL') || 'claude-sonnet-4-6', max_tokens: Math.min(Math.max(Number(corps.max_tokens) || 2000, 1), 8000), messages: messages };
  if (typeof corps.system === 'string') body.system = corps.system.slice(0, 50000);
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  var data; try { data = JSON.parse(res.getContentText()); } catch (e) { data = { error: { message: 'Réponse illisible du service de rédaction.' } }; }
  return { ok: true, status: res.getResponseCode(), data: data };
}

/* ======================= Courrier officiel ======================= */
var SHEET_COURRIERS = 'Courriers';

function courrierSauvegarder_(u, data) {
  if (!u.courrier && !u.admin) throw refus_("Vous n'avez pas accès à l'outil de courrier.", 'droits');
  var ss = classeur_(false);
  var tab = ss.getSheetByName(SHEET_COURRIERS);
  if (!tab) {
    tab = ss.insertSheet(SHEET_COURRIERS);
    tab.appendRow(['Date', 'Email', 'Ref', 'Entite', 'Role', 'Destinataire', 'Objet', 'Corps', 'Formule', 'Salut', 'EmailAffiche', 'Lang']);
    tab.setFrozenRows(1);
    tab.getRange('A1:L1').setFontWeight('bold');
  }
  tab.appendRow([
    new Date(),
    u.email,
    texte_(data.ref,     80),
    texte_(data.entite,  30),
    texte_(data.role,    60),
    texte_(data.dest,   400),
    texte_(data.objet,  200),
    texte_(data.corps, 8000),
    texte_(data.formule, 300),
    texte_(data.salut,  100),
    texte_(data.email,  120),
    texte_(data.lang,    10) || 'fr'
  ]);
  journal_(u.email, 'courrier.sauvegarde', texte_(data.ref, 80) + ' — ' + texte_(data.objet, 80));
  return { ok: true };
}

function courrierListe_(u) {
  if (!u.courrier && !u.admin) throw refus_("Vous n'avez pas accès à l'outil de courrier.", 'droits');
  var ss = classeur_(false);
  var tab = ss.getSheetByName(SHEET_COURRIERS);
  if (!tab) return { ok: true, courriers: [] };

  var rows = tab.getDataRange().getValues();
  var idx = {};
  rows[0].forEach(function (h, i) { idx[h] = i; });

  var result = [];
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (String(row[idx['Email']]).toLowerCase() !== u.email.toLowerCase()) continue;
    result.push({
      date:    row[idx['Date']] ? Utilities.formatDate(new Date(row[idx['Date']]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
      ref:     String(row[idx['Ref']]          || ''),
      entite:  String(row[idx['Entite']]       || ''),
      role:    String(row[idx['Role']]         || ''),
      dest:    String(row[idx['Destinataire']] || ''),
      objet:   String(row[idx['Objet']]        || ''),
      corps:   String(row[idx['Corps']]        || ''),
      formule: String(row[idx['Formule']]      || ''),
      salut:   String(row[idx['Salut']]        || ''),
      email:   String(row[idx['EmailAffiche']] || ''),
      lang:    String(row[idx['Lang']]         || 'fr')
    });
  }
  result.reverse();
  return { ok: true, courriers: result.slice(0, 50) };
}

/* ======================= Courrier e-mail ======================= */
/* Envoi de courriels personnalisés aux groupes du fichier des membres.
   Tout part de l'adresse commune CONFIG.ENVOI_ALIAS (alias du compte qui exécute le script) ;
   le nom affiché et l'adresse « Répondre à » dépendent de la casquette choisie par l'auteur.
   Un courriel par ligne du fichier des membres, même quand deux personnes partagent une adresse. */

var CASQUETTES = {
  lieutenant:                  { e: 'lt',   t: 'Le Lieutenant',                     s: 'Lieutenant',                     r: 'lieutenant@oessh.lu' },
  chancelier:                  { e: 'lt',   t: 'Le Chancelier',                     s: 'Chancelier',                     r: 'chancelier@oessh.lu' },
  tresorier:                   { e: 'lt',   t: 'Le Trésorier',                      s: 'Trésorier',                      r: 'tresorier@oessh.lu' },
  secretaire:                  { e: 'lt',   t: 'Le Secrétaire',                     s: 'Secrétaire',                     r: 'secretariat@oessh.lu' },
  secretaire_adjoint:          { e: 'lt',   t: 'Le Secrétaire adjoint',             s: 'Secrétaire adjoint',             r: 'secretaire.adjoint@oessh.lu' },
  ceremoniaire_laic:           { e: 'lt',   t: 'Le Cérémoniaire laïc',              s: 'Cérémoniaire laïc',              r: 'ceremoniaire.laic@oessh.lu' },
  ceremoniaire_ecclesiastique: { e: 'lt',   t: 'Le Cérémoniaire ecclésiastique',    s: 'Cérémoniaire ecclésiastique',    r: 'ceremoniaire.ecclesiastique@oessh.lu' },
  resp_informatique:           { e: 'lt',   t: 'Le Responsable de l’informatique',  s: 'Responsable de l’informatique',  r: 'webadmin@oessh.lu' },
  resp_communication:          { e: 'lt',   t: 'La Responsable de la communication', s: 'Responsable de la communication', r: 'communication@oessh.lu' },
  conseiller:                  { e: 'lt',   t: 'Le Conseiller',                     s: 'Conseiller',                     r: '' },
  president_asbl:              { e: 'asbl', t: 'Le Président',                      s: 'Président',                      r: 'president@oessh.lu' },
  vice_president_asbl:         { e: 'asbl', t: 'Le Vice-Président',                 s: 'Vice-Président',                 r: 'vice-president@oessh.lu' },
  secretaire_asbl:             { e: 'asbl', t: 'Le Secrétaire',                     s: 'Secrétaire',                     r: 'secretariat.asbl@oessh.lu' },
  tresorier_asbl:              { e: 'asbl', t: 'Le Trésorier',                      s: 'Trésorier',                      r: 'tresorier@oessh.lu' },
  administrateur_asbl:         { e: 'asbl', t: 'L’Administrateur',                  s: 'Administrateur',                 r: '' },
  administratrice_asbl:        { e: 'asbl', t: 'L’Administratrice',                 s: 'Administratrice',                r: '' }
};
// Codes déjà utilisés par l'outil Courrier papier (colonne Roles) : même casquette.
var CASQUETTES_ALIAS = { ceremoniaire_eccl: 'ceremoniaire_ecclesiastique' };
var ENTITES = { lt: 'Lieutenance pour le Luxembourg', asbl: 'Lieutenance pour le Luxembourg Asbl' };
// Nom affiché comme expéditeur : « Le Secrétaire - Ordre…, Lieutenance pour le Luxembourg » ;
// pour l'Asbl : « Prénom Nom - » suivi de sa dénomination officielle.
var EXPEDITEURS = { lt: 'Ordre Équestre du Saint-Sépulcre de Jérusalem, Lieutenance pour le Luxembourg', asbl: 'Ordre Équestre du Saint-Sépulcre de Jérusalem, Lieutenance pour le Luxembourg, a.s.b.l.' };

var GROUPES_ENVOI = [
  { id: 'lt',           nom: 'Lieutenance',                 f: function (m) { return m.groupe === 'lt'; } },
  { id: 'candidats',    nom: 'Candidats',                   f: function (m) { return m.groupe === 'candidat'; } },
  { id: 'asbl',         nom: 'Asbl',                        f: function (m) { return m.groupe === 'asbl'; } },
  { id: 'cognati',      nom: 'Cognati',                     f: function (m) { return m.groupe === 'cognati'; } },
  { id: 'malte',        nom: 'Ordre de Malte',              f: function (m) { return m.groupe === 'malte'; } },
  { id: 'conseil_lt',   nom: 'Conseil de la Lieutenance',   f: function (m) { return m.conseilLt; } },
  { id: 'conseil_asbl', nom: 'Conseil de l’Asbl',           f: function (m) { return m.conseilAsbl; } }
];

function journalEnvoi_(obj) {
  var ss = classeur_(false);
  var head = ONGLETS.JournalEnvois, sh = ss.getSheetByName('JournalEnvois');
  if (!sh) {
    sh = ss.insertSheet('JournalEnvois');
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  } else {
    // Colonnes ajoutées après coup (PJ, puis Id, RepondreA, Destinataires) : en-têtes complétés à leur place
    var actuel = sh.getRange(1, 1, 1, head.length).getValues()[0];
    head.forEach(function (h, j) { if (actuel[j] !== h) sh.getRange(1, j + 1).setValue(h); });
  }
  ajouter_('JournalEnvois', obj);
}
function exigerEnvois_(u) { if (!u.envois && !u.admin) throw refus_("Vous n'avez pas accès au Courrier e-mail.", 'droits'); }

/** Casquettes de la personne connectée, lues dans la colonne Roles (codes séparés par des virgules). */
function casquettesDe_(u) {
  var codes = String(u.roles || '').split(/[,;\s]+/).map(function (c) { c = norm_(c); return CASQUETTES_ALIAS[c] || c; }).filter(function (c) { return CASQUETTES[c]; });
  return codes.filter(function (c, i) { return codes.indexOf(c) === i; }).map(function (c) {
    var k = CASQUETTES[c];
    return { code: c, entite: k.e, titre: k.t, signature: k.s, ligneFonction: ligneFonction_(k), ligneOrdre: ligneOrdre_(k), entiteNom: ENTITES[k.e], expediteur: (k.e === 'asbl' ? (u.signature || u.nom) : k.t) + ' - ' + EXPEDITEURS[k.e], repondreA: repondreA_(u, c) };
  });
}
/** Ligne de fonction de la signature (modèle du Lieutenant) : « Secrétaire pour le Luxembourg » ; pour l'Asbl : « Secrétaire ». */
function ligneFonction_(k) { return k.e === 'asbl' ? k.s : k.s + ' pour le Luxembourg'; }
/** Ligne sous la fonction : rattachement à l'Ordre (Lieutenance) ou dénomination officielle (Asbl). */
function ligneOrdre_(k) { return k.e === 'asbl' ? EXPEDITEURS.asbl : 'de l’Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH)'; }
/** Adresse « Répondre à » : adresse de fonction ; pour un conseiller ou un administrateur, son adresse @oessh.lu nominative. */
function repondreA_(u, code) {
  var k = CASQUETTES[code];
  if (k.r) return k.r;
  var fonctions = Object.keys(CASQUETTES).map(function (c) { return CASQUETTES[c].r; });
  var perso = (u.emails || []).filter(function (e) { return /@oessh\.lu$/.test(e) && fonctions.indexOf(e) < 0 && e !== CONFIG.ENVOI_ALIAS; })[0];
  return perso || (u.emails || [])[0] || u.email;
}

/** Lit le fichier des membres. Colonnes repérées par leur titre (accents, espaces et retours à la ligne ignorés) ;
    les deux premières colonnes (sans titre stable) donnent le groupe principal et le sous-groupe. */
function lireMembres_() {
  var id = prop_('MEMBRES_SHEET_ID') || CONFIG.MEMBRES_SHEET_ID;
  var sh = SpreadsheetApp.openById(id).getSheets()[0];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var cle = function (h) { return String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase(); };
  var col = {};
  vals[0].forEach(function (h, j) { var k = cle(h); if (k && !(k in col)) col[k] = j; });
  var v = function (row, k) { return k in col ? String(row[col[k]] == null ? '' : row[col[k]]).trim() : ''; };
  var out = [], vus = {};
  vals.slice(1).forEach(function (row) {
    var nom = v(row, 'NOM');
    if (!nom) return;
    // « Défunt » ou « Décédé(e) » dans la 1re ou la 2e colonne : la personne n'est plus proposée à l'envoi.
    if (/d[ée]funt|d[ée]c[ée]d/i.test(String(row[0] || '') + ' ' + String(row[1] || ''))) return;
    var m = {
      groupe: norm_(row[0]), sousGroupe: String(row[1] || '').trim(),
      conseilLt: oui_(v(row, 'CONSEILLT')), conseilAsbl: oui_(v(row, 'CONSEILASBL')),
      nom: nom, prenom: v(row, 'PRENOMUSUEL'), civilite: v(row, 'CIVILITE'), titre: v(row, 'TITRE'),
      email: norm_(v(row, 'COURRIEL'))
    };
    var base = hash_(norm_(m.nom) + '|' + norm_(m.prenom) + '|' + m.email).slice(0, 12), id2 = base, n = 2;
    while (vus[id2]) id2 = base + '-' + (n++);
    vus[id2] = 1;
    m.id = id2;
    m.appel = appel_(m);
    m.politesse = politesse_(m.appel);
    out.push(m);
  });
  return out;
}

/** Formule d'appel selon la charte : clergé et dignitaires d'abord, puis Confrère / Consœur pour les membres de l'Ordre. */
function appel_(m) {
  var civ = norm_(m.civilite), titre = norm_(m.titre);
  if (civ.indexOf('éminence') > -1) return 'Éminence,';
  if (civ.indexOf('monseigneur') > -1) return 'Monseigneur,';
  if (civ.indexOf('abbé') > -1) return 'Monsieur l’Abbé,';
  if (titre.indexOf('son excellence') === 0) return 'Excellence,';
  var femme = civ === 'madame' || civ === 'frau' || civ === 'mme';
  var membreOrdre = m.groupe === 'lt' || m.groupe === 'cognati';
  if (membreOrdre) return femme ? 'Chère Consœur,' : 'Cher Confrère,';
  return femme ? 'Madame,' : 'Monsieur,';
}

/** Formule de politesse finale, liée à la formule d'appel (charte, § 6). */
function politesse_(appel) {
  switch (appel) {
    case 'Éminence,': return 'Je vous prie d’agréer, Éminence, l’expression de mon profond respect.';
    case 'Monseigneur,': return 'Je vous prie d’agréer, Monseigneur, l’expression de mon profond respect.';
    case 'Monsieur l’Abbé,': return 'Je vous prie d’agréer, Monsieur l’Abbé, l’expression de mes sentiments respectueux.';
    case 'Excellence,': return 'Je vous prie d’agréer, Excellence, l’expression de ma haute et respectueuse considération.';
    case 'Cher Confrère,': case 'Chère Consœur,': return 'Avec mes sentiments fraternels et chevaleresques.';
    case 'Madame,': return 'Je vous prie d’agréer, Madame, l’expression de mes sentiments distingués.';
    default: return 'Je vous prie d’agréer, Monsieur, l’expression de mes sentiments distingués.';
  }
}

function mailCharger_(u) {
  exigerEnvois_(u);
  nettoyerPJ_();
  entretienLeger_();
  var membres = lireMembres_();
  var groupes = GROUPES_ENVOI.map(function (g) {
    return { id: g.id, nom: g.nom, ids: membres.filter(g.f).map(function (m) { return m.id; }) };
  });
  var historique = [];
  try {
    var index = suiviActif_() ? indexReponses_() : {};
    historique = lire_('JournalEnvois').slice(-30).reverse().map(function (r) {
      var h = { ts: Number(r.Date) || 0, qui: r.Qui, casquette: r.Casquette, objet: r.Objet, groupes: r.Groupes, nb: Number(r.Nb) || 0, erreurs: r.Erreurs, type: r.Type };
      // Suivi des réponses : visible par l'auteur de l'envoi et par l'administrateur
      if (r.Id && r.Type === 'envoi' && peutVoirReponses_(u, r)) {
        h.id = r.Id;
        h.reponses = (index[r.Id] || []).length;
        h.efface = h.ts && (Date.now() - h.ts > CONFIG.REPONSES_JOURS * 24 * 3600 * 1000);
      }
      return h;
    });
  } catch (e) { historique = []; }
  return {
    ok: true,
    casquettes: casquettesDe_(u),
    groupes: groupes,
    membres: membres.map(function (m) {
      return { id: m.id, nom: m.nom, prenom: m.prenom, appel: m.appel, politesse: m.politesse, groupe: m.groupe, sousGroupe: m.sousGroupe, sansCourriel: !m.email };
    }),
    historique: historique,
    adresses: adressesReponse_(u),
    signataire: u.signature || u.nom,
    version: CONFIG.VERSION,
    suivi: suiviActif_(),
    quota: MailApp.getRemainingDailyQuota(),
    essaiA: u.email
  };
}

/** Adresses personnelles de l'auteur, proposées en « Répondre à » à la place de l'adresse de fonction. */
function adressesReponse_(u) {
  var out = [];
  (u.emails || []).concat([u.email]).forEach(function (e) { e = norm_(e); if (e && e !== norm_(CONFIG.ENVOI_ALIAS) && out.indexOf(e) < 0) out.push(e); });
  return out;
}

/** Vérifie et normalise le courriel demandé ; refuse les textes inachevés. */
function preparerMail_(u, req) {
  var casq = casquettesDe_(u).filter(function (c) { return c.code === norm_(req.casquette); })[0];
  if (!casq) throw refus_('Choisissez une fonction au nom de laquelle vous écrivez.', 'donnees');
  var objet = texte_(req.objet, 200), corps = String(req.corps == null ? '' : req.corps).replace(/\r\n?/g, '\n').slice(0, 20000).trim();
  if (!objet) throw refus_('Indiquez un objet.', 'donnees');
  if (!corps) throw refus_('Le message est vide.', 'donnees');
  var reste = (objet + '\n' + corps).match(/\[[^\]\n]{0,60}\]/);
  if (reste) throw refus_('Le texte contient encore « ' + reste[0] + ' » : complétez-le avant d’envoyer.', 'donnees');
  if (/[–—]/.test(objet + corps)) throw refus_('Le texte contient un tiret long (— ou –) : la charte n’admet que le tiret court (-).', 'donnees');
  // Adresse de réponse : celle de la fonction, ou l'une des adresses de l'auteur
  var rep = norm_(req.repondreA);
  if (rep && rep !== norm_(casq.repondreA)) {
    if (adressesReponse_(u).indexOf(rep) < 0) throw refus_('Cette adresse de réponse ne vous est pas attribuée.', 'donnees');
    casq.repondreA = rep;
  }
  var pj = piecesJointes_(u, req.pieces);
  return { casq: casq, objet: objet, corps: corps, pj: pj, empreinte: hash_(casq.code + '|' + casq.repondreA + '|' + objet + '|' + corps + '|' + pj.ids.join(',')).slice(0, 24) };
}

var APPEL_ECRIT = /^\s*(Cher|Chère|Chers|Chères|Madame|Monsieur|Mesdames|Messieurs|Mademoiselle|Excellence|Éminence|Monseigneur|Mon Père|Révérend|Bonjour|Bonsoir|Liebe|Lieber|Sehr geehrte|Dear)\b/i;
function personnaliser_(texte, m) {
  var t = texte;
  // Formule d'appel ajoutée en tête seulement si le texte n'a ni {appel} ni sa propre formule (« Cher Carlo, »…).
  var avecAppel = t.indexOf('{appel}') > -1 || APPEL_ECRIT.test(t);
  t = t.replace(/\{appel\}/g, m.appel).replace(/\{politesse\}/g, m.politesse || politesse_(m.appel)).replace(/\{prenom\}/g, m.prenom || '').replace(/\{nom\}/g, m.nom || '');
  return avecAppel ? t : m.appel + '\n\n' + t;
}

function composerMail_(u, P, m) {
  var corps = personnaliser_(P.corps, m);
  var OESSH = P.casq.ligneOrdre;
  var signataire = u.signature || u.nom;
  var signature = [signataire, P.casq.ligneFonction, OESSH, P.casq.repondreA];
  var pied = P.suivi ? PIED_SUIVI : 'Pour répondre, utilisez simplement « Répondre » : votre message parviendra directement à son auteur.';
  var texte = texteBrut_(corps) + '\n\n' + signature.join('\n') + '\n\n-- \n' + pied;
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var img = CONFIG.IMAGES_MAIL, lt = P.casq.entite !== 'asbl';
  var paras = corpsHtml_(corps, esc);
  // En-tête : armoiries (Lieutenance) ou croix de Jérusalem (Asbl), puis l'Ordre et l'entité.
  var embleme = lt ? '<img src="' + img + 'entete-lieutenance.png" width="44" height="56" alt="" class="oe-img" style="display:block;border:0">'
                   : '<img src="' + img + 'entete-asbl.png" width="60" height="56" alt="" class="oe-img" style="display:block;border:0">';
  // Signature : croix rouge devant le nom pour la Lieutenance, sans croix pour l'Asbl.
  var croix = lt ? '<img src="' + img + 'croix-signature.png" width="16" height="15" alt="" style="vertical-align:-2px;margin-right:6px;border:0">' : '';
  var styleMobile = '<style>@media only screen and (max-width:480px){' +
    '.oe-fond{padding:12px 6px !important}.oe-tete{padding:16px 18px 14px !important}.oe-pad{padding-left:18px !important;padding-right:18px !important}' +
    '.oe-emb{padding-right:14px !important}.oe-img{width:' + (lt ? 66 : 90) + 'px !important;height:84px !important}' +
    '.oe-l1,.oe-l2{font-size:16px !important}}</style>';
  var html = styleMobile +
    '<div class="oe-fond" style="background:#f7f4ee;padding:24px 12px;font-family:Georgia,\'Times New Roman\',serif;color:#1a1a1a">' +
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-top:4px solid #b10103">' +
    '<div class="oe-tete" style="padding:16px 28px 14px;border-bottom:1px solid #b08a4f">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    '<td class="oe-emb" style="padding-right:18px;vertical-align:middle">' + embleme + '</td>' +
    '<td style="vertical-align:middle;font-family:Georgia,\'Times New Roman\',serif">' +
    '<div class="oe-l1" style="font-size:18px;color:#8a0102">Ordre Équestre du Saint-Sépulcre de Jérusalem</div>' +
    '<div class="oe-l2" style="font-size:18px;margin-top:2px;color:#1a1a1a">' + esc(P.casq.entiteNom) + '</div></td></tr></table></div>' +
    '<div class="oe-pad" style="padding:22px 28px 8px;font-size:16px;line-height:1.55">' + paras + '</div>' +
    '<div class="oe-pad" style="padding:6px 28px 24px;font-size:15px;line-height:1.45">' +
    '<div>' + croix + '<strong style="font-weight:bold">' + esc(signataire) + '</strong></div>' +
    '<div>' + esc(P.casq.ligneFonction) + '<br>' + esc(OESSH) + '<br>' +
    '<a href="mailto:' + esc(P.casq.repondreA) + '" style="color:#8a0102;text-decoration:underline">' + esc(P.casq.repondreA) + '</a></div></div>' +
    '<div style="padding:12px 28px;background:#faf7f0;font-size:12px;color:#6e6e6e;font-family:Arial,sans-serif">' + esc(pied) + '</div>' +
    '</div></div>';
  return { texte: texte, html: html };
}

/** Mise en forme légère du message : lignes commençant par « - » ou « • » = liste à puces, **texte** = gras. */
function corpsHtml_(corps, esc) {
  var gras = function (t) { return esc(t).replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>'); };
  return corps.split(/\n{2,}/).map(function (bloc) {
    var out = '', para = [], liste = [];
    var finPara = function () { if (para.length) { out += '<p style="margin:0 0 14px">' + para.map(gras).join('<br>') + '</p>'; para = []; } };
    var finListe = function () { if (liste.length) { out += '<ul style="margin:0 0 14px;padding-left:24px">' + liste.map(function (l) { return '<li style="margin:0 0 6px">' + gras(l) + '</li>'; }).join('') + '</ul>'; liste = []; } };
    bloc.split('\n').forEach(function (l) {
      var m = l.match(/^\s*[-•]\s+(.*)$/);
      if (m) { finPara(); liste.push(m[1]); } else { finListe(); para.push(l); }
    });
    finPara(); finListe();
    return out;
  }).join('');
}
/** Version texte (messageries sans HTML) : gras retiré, puces « • ». */
function texteBrut_(corps) { return corps.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/^(\s*)[-•]\s+/gm, '$1• '); }

function expedier_(P, to, contenu, objet) {
  GmailApp.sendEmail(to, objet, contenu.texte, {
    from: CONFIG.ENVOI_ALIAS,
    name: P.casq.expediteur,
    // Avec le suivi des réponses : l'adresse de l'auteur ET l'adresse de collecte propre à cet envoi
    replyTo: P.suivi ? P.casq.repondreA + ', ' + P.suivi : P.casq.repondreA,
    htmlBody: contenu.html,
    attachments: P.pj.blobs
  });
}
function verifierAlias_() {
  var alias = [];
  try { alias = GmailApp.getAliases().map(norm_); } catch (e) { alias = []; }
  if (alias.indexOf(norm_(CONFIG.ENVOI_ALIAS)) < 0) throw refus_("L'adresse d'envoi " + CONFIG.ENVOI_ALIAS + " n'est pas configurée sur le compte du script (Gmail > « Envoyer en tant que »).", 'config');
}

/** Envoi d'essai à l'auteur, obligatoire avant l'envoi réel du même texte. */
function mailEssai_(u, req) {
  exigerEnvois_(u);
  var P = preparerMail_(u, req);
  verifierAlias_();
  var membres = lireMembres_();
  var modele = membres.filter(function (m) { return m.id === String(req.apercu || ''); })[0] ||
    { nom: '', prenom: '', appel: 'Cher Confrère,', groupe: 'lt' };
  P.suivi = adresseSuivi_('essai');   // l'essai montre exactement ce que recevront les destinataires
  var c = composerMail_(u, P, modele);
  expedier_(P, u.email, c, '[ESSAI] ' + P.objet);
  CacheService.getScriptCache().put('essai:' + u.email + ':' + P.empreinte, '1', 6 * 3600);
  journalEnvoi_({ Date: String(Date.now()), Qui: u.email, Casquette: P.casq.code, Objet: P.objet, Groupes: 'essai', Nb: '1', Erreurs: '', Type: 'essai', PJ: P.pj.noms.join(', ') });
  return { ok: true, envoyeA: u.email, empreinte: P.empreinte };
}

/** Envoi réel : un courriel par destinataire, jamais de liste visible. */
function mailEnvoyer_(u, req) {
  exigerEnvois_(u);
  var P = preparerMail_(u, req);
  if (!CacheService.getScriptCache().get('essai:' + u.email + ':' + P.empreinte)) {
    throw refus_('Faites d’abord un envoi d’essai de ce texte exact : il a changé depuis le dernier essai.', 'essai');
  }
  verifierAlias_();
  var ids = (Array.isArray(req.ids) ? req.ids : []).map(String);
  var membres = lireMembres_();
  var cibles = membres.filter(function (m) { return ids.indexOf(m.id) > -1; });
  if (!cibles.length) throw refus_('Aucun destinataire sélectionné.', 'donnees');
  if (cibles.length > CONFIG.ENVOI_MAX) throw refus_('Trop de destinataires en une fois (' + cibles.length + ', maximum ' + CONFIG.ENVOI_MAX + ').', 'donnees');
  var avec = cibles.filter(function (m) { return m.email; });
  if (avec.length > MailApp.getRemainingDailyQuota()) throw refus_('Le quota d’envoi du jour est insuffisant. Réessayez demain.', 'limite');
  var envoiId = 'e' + Date.now().toString(36);
  P.suivi = adresseSuivi_(envoiId);
  var envoyes = 0, erreurs = [], recus = [];
  avec.forEach(function (m) {
    try { expedier_(P, m.email, composerMail_(u, P, m), P.objet); envoyes++; recus.push([(m.prenom ? m.prenom + ' ' : '') + m.nom, m.email]); }
    catch (e) { erreurs.push((m.prenom ? m.prenom + ' ' : '') + m.nom); }
  });
  // Pièces jointes envoyées à tous : plus utiles, mises à la corbeille de Drive (gardées en cas d'échec, pour renvoyer).
  var pjSupprimees = !erreurs.length && P.pj.ids.length ? corbeillePJ_(P.pj.ids) : false;
  var sans = cibles.filter(function (m) { return !m.email; }).map(function (m) { return (m.prenom ? m.prenom + ' ' : '') + m.nom; });
  var groupesTxt = texte_(Array.isArray(req.groupes) ? req.groupes.join(', ') : req.groupes, 200);
  journalEnvoi_({ Date: String(Date.now()), Qui: u.email, Casquette: P.casq.code, Objet: P.objet, Groupes: groupesTxt, Nb: String(envoyes), Erreurs: erreurs.join(', '), Type: 'envoi', PJ: P.pj.noms.join(', '),
    Id: P.suivi ? envoiId : '', RepondreA: P.casq.repondreA, Destinataires: P.suivi ? JSON.stringify(recus) : '' });
  journal_(u.email, 'mail.envoi', P.objet + ' - ' + envoyes + ' destinataire(s)' + (erreurs.length ? ', ' + erreurs.length + ' erreur(s)' : ''));
  return { ok: true, envoyes: envoyes, erreurs: erreurs, sansCourriel: sans, pjSupprimees: pjSupprimees };
}

/* ======================= Courrier e-mail : suivi des réponses ======================= */
/* Chaque courriel porte deux adresses « Répondre à » : celle de l'auteur (alias de sa fonction) et une adresse
   de collecte propre à l'envoi, reponses+<id>@oessh.lu (alias du compte du script). Les copies reçues sont
   rangées sous l'étiquette « Réponses courrier », sorties de la boîte de réception, puis mises à la corbeille
   après CONFIG.REPONSES_JOURS jours. Actif seulement si la propriété du script REPONSES_ALIAS est renseignée. */
var PIED_SUIVI = 'Pour répondre, utilisez simplement « Répondre » en conservant les deux adresses proposées : votre message parviendra à son auteur et sera bien suivi.';

function aliasReponses_() { var a = norm_(prop_('REPONSES_ALIAS')); return /^[^\s@+]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : ''; }
function suiviActif_() { return !!aliasReponses_(); }
function adresseSuivi_(id) { var a = aliasReponses_(); if (!a) return ''; var p = a.split('@'); return p[0] + '+' + id + '@' + p[1]; }
function peutVoirReponses_(u, r) { return !!(u.admin || u.gestion) || (u.emails || []).concat([u.email]).map(norm_).indexOf(norm_(r.Qui)) > -1; }
function joursMs_(j) { return j * 24 * 3600 * 1000; }

/** Adresses du compte du script (principale et alias) : une copie qui leur est aussi adressée reste dans la boîte de réception. */
function adressesCompte_() {
  var out = CONFIG.ADMINS_INITIAUX[0].emails.map(norm_);
  try { GmailApp.getAliases().forEach(function (a) { out.push(norm_(a)); }); } catch (e) { /* sans alias */ }
  return out;
}
function etiquette_(nom) { return GmailApp.getUserLabelByName(nom) || GmailApp.createLabel(nom); }

/** Réponses reçues sur l'adresse de collecte, regroupées par envoi ; les range au passage. Résultat gardé 10 minutes. */
function indexReponses_(frais) {
  var cache = CacheService.getScriptCache();
  if (!frais) { var c = cache.get('rep:index'); if (c) { try { return JSON.parse(c); } catch (e) { /* recalcul */ } } }
  var alias = aliasReponses_();
  if (!alias) return {};
  var p = alias.split('@');
  var re = new RegExp(p[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\+([a-z0-9]+)@' + p[1].replace(/\./g, '\\.'), 'i');
  var tout = etiquette_(CONFIG.REPONSES_LABEL), copie = etiquette_(CONFIG.REPONSES_LABEL + '/copie');
  var miens = adressesCompte_().filter(function (a) { return a !== alias; });
  var index = {};
  GmailApp.search('{to:' + p[0] + ' deliveredto:' + p[0] + ' cc:' + p[0] + '} newer_than:' + (CONFIG.REPONSES_JOURS + 1) + 'd', 0, 200).forEach(function (t) {
    var trouve = false, garder = false;
    t.getMessages().forEach(function (msg) {
      var dest = norm_((msg.getTo() || '') + ',' + (msg.getCc() || ''));
      var m = dest.match(re);
      if (!m) return;
      trouve = true;
      // Copie aussi adressée à une adresse de ce compte (par ex. secretariat@) : c'est aussi le courrier de l'auteur, on la laisse en place.
      if (miens.some(function (a) { return dest.indexOf(a) > -1; })) garder = true;
      var id = m[1].toLowerCase();
      if (id === 'essai') return;
      (index[id] = index[id] || []).push({ m: msg.getId(), t: msg.getDate().getTime() });
    });
    if (!trouve) return;
    try {
      t.addLabel(tout);
      if (!garder) { t.addLabel(copie); if (t.isInInbox()) t.moveToArchive(); }
    } catch (e) { /* le rangement ne doit jamais bloquer le suivi */ }
  });
  try { cache.put('rep:index', JSON.stringify(index), 600); } catch (e) { /* index trop gros pour le cache */ }
  return index;
}

/** Copies de plus de CONFIG.REPONSES_JOURS jours : à la corbeille (seulement celles de l'étiquette « copie »). */
function purgerCopiesReponses_() {
  var copie = GmailApp.getUserLabelByName(CONFIG.REPONSES_LABEL + '/copie');
  if (!copie) return 0;
  var limite = Date.now() - joursMs_(CONFIG.REPONSES_JOURS), vieux = [];
  copie.getThreads(0, 200).forEach(function (t) { if (t.getLastMessageDate().getTime() < limite) vieux.push(t); });
  for (var i = 0; i < vieux.length; i += 100) GmailApp.moveThreadsToTrash(vieux.slice(i, i + 100));
  return vieux.length;
}

/** Entretien : à brancher sur un déclencheur horaire (Déclencheurs > Ajouter > entretienReponses > toutes les heures).
    Sans déclencheur, le rangement se fait à l'ouverture de la page et le ménage une fois par jour. */
function entretienReponses() {
  if (!suiviActif_()) return;
  indexReponses_(true);
  purgerCopiesReponses_();
}
function entretienLeger_() {
  if (!suiviActif_()) return;
  var cache = CacheService.getScriptCache();
  if (cache.get('rep:purge')) return;
  try { purgerCopiesReponses_(); } catch (e) { /* jamais bloquant */ }
  cache.put('rep:purge', '1', 6 * 3600);
}

/** Réponses à un envoi (auteur de l'envoi ou administrateur) : texte sans la citation, et liste de ceux qui n'ont pas répondu. */
function mailReponses_(u, req) {
  exigerEnvois_(u);
  var id = norm_(req.id);
  var r = lire_('JournalEnvois').filter(function (x) { return norm_(x.Id) === id && x.Type === 'envoi'; })[0];
  if (!id || !r) throw refus_('Envoi introuvable.', 'introuvable');
  if (!peutVoirReponses_(u, r)) throw refus_("Seul l'auteur de l'envoi peut en voir les réponses.", 'droits');
  var dest = [];
  try { dest = JSON.parse(r.Destinataires || '[]'); } catch (e) { dest = []; }
  var reponses = [];
  (indexReponses_(!!req.actualiser)[id] || []).forEach(function (x) {
    var msg;
    try { msg = GmailApp.getMessageById(x.m); } catch (e) { msg = null; }
    if (!msg || msg.isInTrash()) return;
    var de = adresseDe_(msg.getFrom());
    var d = dest.filter(function (q) { return norm_(q[1]) === de.email; })[0];
    reponses.push({ nom: d ? d[0] : (de.nom || de.email), email: de.email, ts: msg.getDate().getTime(), texte: sansCitation_(msg.getPlainBody()).slice(0, 8000) });
  });
  reponses.sort(function (a, b) { return a.ts - b.ts; });
  var ont = reponses.map(function (x) { return x.email; });
  return {
    ok: true,
    reponses: reponses,
    sansReponse: dest.filter(function (q) { return ont.indexOf(norm_(q[1])) < 0; }).map(function (q) { return q[0]; }),
    efface: Date.now() - (Number(r.Date) || 0) > joursMs_(CONFIG.REPONSES_JOURS)
  };
}
function adresseDe_(s) {
  var m = String(s || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  return m ? { nom: m[1].trim(), email: norm_(m[2]) } : { nom: '', email: norm_(s) };
}
/** Retire du texte d'une réponse le message d'origine cité (« Le … a écrit : », lignes « > », « De : »…). */
function sansCitation_(t) {
  var l = String(t || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  var entete = /^(le|on|am|el|il)\s.{4,400}(a écrit|wrote|schrieb|escribió|ha scritto)\s*:?\s*$/i;
  for (var i = 0; i < l.length; i++) {
    var x = l[i].trim(), bloc = x, coupe = entete.test(x);
    // L'en-tête « Le … a écrit : » tient souvent sur 2 à 4 lignes (nom et adresse longs)
    for (var k = 1; k < 4 && !coupe && /^(le|on|am|el|il)\s/i.test(x); k++) { bloc += ' ' + String(l[i + k] || '').trim(); coupe = entete.test(bloc); }
    if (coupe) break;
    if (/^-{2,}\s*(original message|message d.origine|ursprüngliche nachricht|message transféré)/i.test(x)) break;
    if (/^_{5,}$/.test(x)) break;
    if (/^(de|from|von)\s*:/i.test(x) && out.length && /^(envoyé|sent|gesendet|date)\s*:/i.test((l[i + 1] || '').trim())) break;
    if (/^>/.test(x)) continue;
    out.push(l[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ======================= Courrier e-mail : pièces jointes ======================= */
// Types acceptés, reconnus par l'extension du nom de fichier.
var PJ_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
/** Dossier Drive où sont déposées les pièces jointes (créé au premier usage). */
function dossierPJ_() {
  var id = prop_('PJ_DOSSIER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé : on le recrée */ } }
  var d = DriveApp.createFolder('Courrier e-mail - pièces jointes');
  PropertiesService.getScriptProperties().setProperty('PJ_DOSSIER_ID', d.getId());
  return d;
}
/** Met à la corbeille les pièces jointes données (récupérables 30 jours dans la corbeille de Drive). */
function corbeillePJ_(ids) {
  var ok = true;
  ids.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { ok = false; } });
  return ok;
}
/** Pièces jointes déposées mais jamais envoyées : à la corbeille après CONFIG.PJ_JOURS jours. */
function nettoyerPJ_() {
  if (!prop_('PJ_DOSSIER_ID')) return;   // aucune pièce jointe encore déposée
  try {
    var limite = Date.now() - CONFIG.PJ_JOURS * 24 * 3600 * 1000, it = dossierPJ_().getFiles();
    while (it.hasNext()) { var f = it.next(); if (f.getDateCreated().getTime() < limite) f.setTrashed(true); }
  } catch (e) { /* le ménage ne doit jamais empêcher d'ouvrir la page */ }
}
/** À lancer une fois depuis l'éditeur Apps Script après la mise à jour : demande l'autorisation Google Drive et crée le dossier. */
function autoriserPiecesJointes() {
  var d = dossierPJ_();
  Logger.log('Dossier des pièces jointes : ' + d.getUrl());
}
/** Dépose un fichier envoyé par la page (contenu en base64) ; renvoie son identifiant. */
function mailJoindre_(u, req) {
  exigerEnvois_(u);
  var nom = texte_(req.nom, 150).replace(/[\\\/:*?"<>|]/g, '_');
  var ext = (nom.match(/\.([A-Za-z0-9]+)$/) || [])[1];
  var type = ext && PJ_TYPES[ext.toLowerCase()];
  if (!nom || !type) throw refus_('Type de fichier non accepté : PDF, images (JPG, PNG), Word ou Excel uniquement.', 'donnees');
  var b64 = String(req.contenu || '');
  if (!b64 || b64.length > Math.ceil(CONFIG.PJ_MAX / 3) * 4 + 8) throw refus_('Fichier trop lourd : 10 Mo au maximum.', 'donnees');
  var octets = Utilities.base64Decode(b64);
  if (!octets.length || octets.length > CONFIG.PJ_MAX) throw refus_('Fichier vide ou trop lourd : 10 Mo au maximum.', 'donnees');
  var f = dossierPJ_().createFile(Utilities.newBlob(octets, type, nom));
  f.setDescription('auteur:' + norm_(u.email));
  return { ok: true, id: f.getId(), nom: nom, taille: octets.length };
}
/** Pièces jointes d'un courriel : seulement des fichiers du dossier, déposés par la même personne, 10 Mo au total. */
function piecesJointes_(u, ids) {
  ids = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  ids = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  var out = { ids: [], noms: [], blobs: [] };
  if (!ids.length) return out;
  if (ids.length > CONFIG.PJ_NB_MAX) throw refus_('Trop de pièces jointes : ' + CONFIG.PJ_NB_MAX + ' au maximum.', 'donnees');
  var dossier = dossierPJ_().getId(), mes = (u.emails || []).concat([u.email]).map(norm_), total = 0;
  ids.forEach(function (id) {
    var f;
    try { f = DriveApp.getFileById(id); } catch (e) { f = null; }
    var dansDossier = false;
    if (f) { var it = f.getParents(); while (it.hasNext()) { if (it.next().getId() === dossier) dansDossier = true; } }
    var auteur = f ? String(f.getDescription() || '').replace(/^auteur:/, '') : '';
    if (!f || f.isTrashed() || !dansDossier || mes.indexOf(auteur) < 0) throw refus_('Une pièce jointe est introuvable : retirez-la et joignez-la de nouveau.', 'donnees');
    total += f.getSize();
    out.ids.push(id); out.noms.push(f.getName()); out.blobs.push(f.getBlob());
  });
  if (total > CONFIG.PJ_MAX) throw refus_('Pièces jointes trop lourdes : 10 Mo au total au maximum.', 'donnees');
  return out;
}

/* ======================= Feuille : utilitaires ======================= */
function classeur_(creerSiAbsent) {
  var actif = null;
  try { actif = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { actif = null; }
  if (actif) return actif;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  if (!creerSiAbsent) throw refus_("La feuille n'est pas installée. Lancez « installer ».", 'installation');
  var ss = SpreadsheetApp.create('OESSH – Espace membres (privé)');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function feuille_(nom) {
  var sh = classeur_(false).getSheetByName(nom);
  if (!sh) throw refus_("La feuille n'est pas installée (onglet " + nom + ' manquant). Lancez « installer ».', 'installation');
  return sh;
}
function lire_(nom) {
  var sh = feuille_(nom), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0];
  return vals.slice(1).map(function (row, i) {
    var o = { _ligne: i + 2 };
    head.forEach(function (h, j) {
      var v = row[j];
      if (v === null || v === undefined) v = '';
      else if (!(v instanceof Date)) v = String(v).replace(/^'(?=[=+\-@])/, '');
      o[h] = v;
    });
    return o;
  });
}
function ajouter_(nom, obj) {
  var sh = feuille_(nom), head = ONGLETS[nom];
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([head.map(function (h) { return sur_(obj[h]); })]);
}
function majLigne_(nom, pred, champs) {
  var sh = feuille_(nom), head = ONGLETS[nom], rows = lire_(nom);
  for (var i = 0; i < rows.length; i++) {
    if (!pred(rows[i])) continue;
    var cur = head.map(function (h) { return h in champs ? sur_(champs[h]) : sur_(rows[i][h]); });
    sh.getRange(rows[i]._ligne, 1, 1, head.length).setNumberFormat('@').setValues([cur]);
    return true;
  }
  throw refus_('Ligne introuvable.', 'introuvable');
}
/** Ajoute une colonne en fin d'onglet si elle n'existe pas. Renvoie true si elle vient d'être créée. */
function ajouterColonne_(nom, entete) {
  var sh = feuille_(nom), head = sh.getDataRange().getValues()[0] || [];
  if (head.indexOf(entete) > -1) return false;
  var n = head.length; while (n > 0 && String(head[n - 1]) === '') n--;
  sh.getRange(1, n + 1, 1, 1).setNumberFormat('@').setValues([[entete]]);
  return true;
}
/** Écrit une seule cellule, repérée par le nom de sa colonne, dans la première ligne qui satisfait pred. */
function ecrireColonne_(nom, pred, entete, val) {
  var sh = feuille_(nom), head = sh.getDataRange().getValues()[0] || [];
  var c = head.indexOf(entete);
  if (c < 0) return false;
  var rows = lire_(nom);
  for (var i = 0; i < rows.length; i++) {
    if (!pred(rows[i])) continue;
    sh.getRange(rows[i]._ligne, c + 1, 1, 1).setNumberFormat('@').setValues([[sur_(val)]]);
    return true;
  }
  return false;
}
function supprimerLignes_(nom, pred) {
  var sh = feuille_(nom), rows = lire_(nom);
  for (var i = rows.length - 1; i >= 0; i--) if (pred(rows[i])) sh.deleteRow(rows[i]._ligne);
}
function verrou_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw refus_('Le serveur est occupé. Réessayez dans un instant.', 'occupe');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ======================= Divers ======================= */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function refus_(msg, code) { var e = new Error(msg); e.public = true; e.code = code; return e; }
function norm_(s) { return String(s || '').trim().toLowerCase(); }
function oui_(v) { v = String(v || '').trim().toLowerCase(); return v === 'oui' || v === 'x' || v === 'true' || v === '1' || v === 'yes'; }
function texte_(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function sur_(v) { v = v instanceof Date ? dateTxt_(v) : String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function dateTxt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Luxembourg', 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
