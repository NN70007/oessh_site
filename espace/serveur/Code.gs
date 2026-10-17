/**
 * Espace membres OESSH Luxembourg — serveur (Google Apps Script)
 * ---------------------------------------------------------------
 * Ce script est rattaché à une feuille Google Sheets PRIVÉE (compte jb.niedercorn@oessh.lu, Google Workspace de la Lieutenance).
 * Il est le seul point d'accès aux données : chaque demande doit porter une session valide,
 * obtenue soit par connexion Google (jeton vérifié auprès de Google), soit par code envoyé par e-mail.
 *
 * Ce fichier ne contient AUCUNE donnée : il peut être publié sans risque.
 * Les données vivent uniquement dans la feuille (onglets Acces, Taches, Intervenants, Activite, Jalons, Journal).
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
  ACTIVITE_MAX: 40
};

var ONGLETS = {
  Acces: ['Email', 'Nom', 'Investiture', 'Actualites', 'Lectures', 'Newsletter', 'Gestion', 'Actif', 'Note'],
  Taches: ['Id', 'Titre', 'Pole', 'Responsables', 'Echeance', 'Statut', 'Note', 'Source', 'MajLe', 'MajPar'],
  Intervenants: ['TacheId', 'Nom', 'Role', 'Telephone', 'Email'],
  Activite: ['Date', 'Qui', 'Texte'],
  Jalons: ['Date', 'Titre', 'Detail', 'Cle'],
  Journal: ['Date', 'Qui', 'Action', 'Detail']
};

var ROLES_INV = ['organisateur', 'contributeur', 'lecture', 'intervenant'];
var POLES = ['liturgie', 'lieux', 'invites', 'accueil', 'com', 'finances', 'candidats'];
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
    case 'inv.charger': return invCharger_(user);
    case 'inv.statut': return invStatut_(user, req.id, req.statut);
    case 'inv.prendre': return invPrendre_(user, req.id, req.nom);
    case 'inv.enregistrer': return invEnregistrer_(user, req.tache);
    case 'inv.supprimer': return invSupprimer_(user, req.id);
    case 'acces.lister': return accesLister_(user);
    case 'acces.enregistrer': return accesEnregistrer_(user, req.personne, req.emailOriginal);
    case 'acces.supprimer': return accesSupprimer_(user, req.email);
    case 'acces.deconnecter': return accesDeconnecter_(user, req.email);
    case 'pub.github': return pubGithub_(user, req.methode, req.chemin, req.corps);
    case 'pub.claude': return pubClaude_(user, req.corps);
    case 'courrier.sauvegarder': return courrierSauvegarder_(user, req);
    case 'courrier.liste': return courrierListe_(user);
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
    if (emails_(rows[i].Email).indexOf(email) > -1 && oui_(rows[i].Actif)) return rows[i];
  }
  return null;
}
function emails_(v) {
  var out = [];
  String(v || '').split(/[;,\s]+/).forEach(function (e) { e = norm_(e); if (e && out.indexOf(e) < 0) out.push(e); });
  return out;
}
function cle_(r) { return emails_(r.Email)[0] || ''; }

function userFromRow_(r, loginEmail) {
  var inv = String(r.Investiture || '').toLowerCase().trim();
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
    site: { actualites: oui_(r.Actualites), lectures: oui_(r.Lectures), newsletter: oui_(r.Newsletter) },
    gestion: oui_(r.Gestion),
    admin: oui_(r.Admin),
    media: oui_(r.Media),
    courrier: oui_(r.Courrier),
    roles: String(r.Roles || ''),
    userEmails: String(r.Emails || '')
  };
}

function publicUser_(u) {
  return {
    email: u.email,
    emails: u.emails,
    nom: u.nom,
    inv: u.inv,
    site: u.site,
    gestion: u.gestion,
    admin: u.admin,
    media: u.media,
    courrier: u.courrier,
    roles: u.roles,
    userEmails: u.userEmails
  };
}

function exigerInv_(u, roles) {
  if (roles.indexOf(u.inv) < 0) throw refus_("Vous n'avez pas les droits pour cette action.", 'droits');
}
function exigerGestion_(u) { if (!u.gestion) throw refus_("Vous n'avez pas les droits pour gérer les accès.", 'droits'); }

function peutModifier_(u, t) {
  if (u.inv === 'organisateur') return true;
  if (u.inv !== 'contributeur') return false;
  return !t.resp.length || t.resp.indexOf(u.nom) > -1;
}

/* ======================= Investiture ======================= */
function invCharger_(u) {
  exigerInv_(u, ROLES_INV);
  var taches = toutesTaches_();
  if (u.inv === 'intervenant') {
    taches = taches.filter(function (t) {
      return t.equipe.some(function (m) { return (m.email && u.emails.indexOf(norm_(m.email)) > -1) || (m.nom && m.nom === u.nom); });
    });
  }
  var activite = u.inv === 'intervenant' ? [] : lire_('Activite').slice(-CONFIG.ACTIVITE_MAX).reverse().map(function (r) { return { ts: Number(r.Date) || 0, qui: r.Qui, texte: r.Texte }; });
  var jalons = lire_('Jalons').map(function (r) { return { d: dateTxt_(r.Date), t: r.Titre, w: r.Detail, key: oui_(r.Cle) }; });
  var noms = {};
  lire_('Acces').forEach(function (r) { if (oui_(r.Actif) && r.Investiture && String(r.Investiture).toLowerCase() !== 'intervenant') noms[r.Nom] = 1; });
  taches.forEach(function (t) { t.resp.forEach(function (n) { noms[n] = 1; }); });
  return { ok: true, user: publicUser_(u), taches: taches, activite: activite, jalons: jalons, personnes: Object.keys(noms).filter(Boolean), peutModifierTout: u.inv === 'organisateur' };
}

function invStatut_(u, id, statut) {
  exigerInv_(u, ['organisateur', 'contributeur']);
  if (STATUTS.indexOf(statut) < 0) throw refus_('Statut inconnu.', 'donnees');
  return verrou_(function () {
    var t = tache_(id);
    if (!peutModifier_(u, t)) throw refus_("Seul le responsable de cette tâche ou un organisateur peut la modifier.", 'droits');
    if (t.statut === statut) return { ok: true };
    majTache_(id, { Statut: statut, MajLe: String(Date.now()), MajPar: u.nom });
    var verbe = { afaire: 'remis « à faire »', encours: 'passé « en cours »', fait: 'terminé' }[statut];
    activite_(u.nom, '« ' + t.titre + ' » : ' + verbe);
    return { ok: true };
  });
}

function invPrendre_(u, id, nom) {
  exigerInv_(u, ['organisateur', 'contributeur']);
  nom = texte_(nom || u.nom, 80);
  if (u.inv !== 'organisateur' && nom !== u.nom) throw refus_('Vous ne pouvez inscrire que vous-même.', 'droits');
  return verrou_(function () {
    var t = tache_(id);
    if (u.inv !== 'organisateur' && t.resp.length) throw refus_('Cette tâche a déjà un responsable.', 'droits');
    if (t.resp.indexOf(nom) < 0) t.resp.push(nom);
    majTache_(id, { Responsables: t.resp.join('; '), MajLe: String(Date.now()), MajPar: u.nom });
    activite_(u.nom, (nom === u.nom ? 'prend en charge' : 'attribue à ' + nom) + ' « ' + t.titre + ' »');
    return { ok: true };
  });
}

function invEnregistrer_(u, x) {
  exigerInv_(u, ['organisateur', 'contributeur']);
  if (!x || typeof x !== 'object') throw refus_('Tâche invalide.', 'donnees');
  var titre = texte_(x.titre, 160);
  if (!titre) throw refus_('Le titre est obligatoire.', 'donnees');
  var pole = POLES.indexOf(x.pole) > -1 ? x.pole : 'liturgie';
  var statut = STATUTS.indexOf(x.statut) > -1 ? x.statut : 'afaire';
  var ech = /^\d{4}-\d{2}-\d{2}$/.test(String(x.echeance || '')) ? x.echeance : '';
  var resp = (Array.isArray(x.resp) ? x.resp : []).map(function (n) { return texte_(n, 80); }).filter(Boolean).slice(0, 8);
  var equipe = (Array.isArray(x.equipe) ? x.equipe : []).slice(0, 40).map(function (m) {
    return { nom: texte_(m && m.nom, 80), role: texte_(m && m.role, 60), tel: texte_(m && m.tel, 30), email: norm_(m && m.email).slice(0, 120) };
  }).filter(function (m) { return m.nom || m.tel; });
  var note = texte_(x.note, 600);

  return verrou_(function () {
    if (x.id) {
      var t = tache_(x.id);
      if (!peutModifier_(u, t)) throw refus_("Seul le responsable de cette tâche ou un organisateur peut la modifier.", 'droits');
      if (u.inv !== 'organisateur') resp = t.resp.length ? t.resp : resp.filter(function (n) { return n === u.nom; });
      majTache_(x.id, { Titre: titre, Pole: pole, Responsables: resp.join('; '), Echeance: ech, Statut: statut, Note: note, MajLe: String(Date.now()), MajPar: u.nom });
      ecrireEquipe_(x.id, equipe);
      activite_(u.nom, 'met à jour « ' + titre + ' »');
      return { ok: true, id: x.id };
    }
    if (u.inv !== 'organisateur') resp = [u.nom];
    var id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    ajouter_('Taches', { Id: id, Titre: titre, Pole: pole, Responsables: resp.join('; '), Echeance: ech, Statut: statut, Note: note, Source: 'Ajout', MajLe: String(Date.now()), MajPar: u.nom });
    ecrireEquipe_(id, equipe);
    activite_(u.nom, 'ajoute « ' + titre + ' »');
    return { ok: true, id: id };
  });
}

function invSupprimer_(u, id) {
  exigerInv_(u, ['organisateur']);
  return verrou_(function () {
    var t = tache_(id);
    supprimerLignes_('Taches', function (r) { return r.Id === id; });
    supprimerLignes_('Intervenants', function (r) { return r.TacheId === id; });
    activite_(u.nom, 'supprime « ' + t.titre + ' »');
    return { ok: true };
  });
}

function toutesTaches_() {
  var eq = {};
  lire_('Intervenants').forEach(function (r) {
    (eq[r.TacheId] = eq[r.TacheId] || []).push({ nom: r.Nom, role: r.Role, tel: r.Telephone, email: r.Email });
  });
  return lire_('Taches').filter(function (r) { return r.Id; }).map(function (r) {
    return {
      id: String(r.Id), titre: r.Titre, pole: r.Pole,
      resp: String(r.Responsables || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean),
      echeance: dateTxt_(r.Echeance), statut: STATUTS.indexOf(r.Statut) > -1 ? r.Statut : 'afaire',
      note: r.Note, source: r.Source, maj: Number(r.MajLe) || 0, majPar: r.MajPar,
      equipe: eq[r.Id] || []
    };
  });
}
function tache_(id) {
  var ts = toutesTaches_();
  for (var i = 0; i < ts.length; i++) if (ts[i].id === String(id)) return ts[i];
  throw refus_('Tâche introuvable (elle a peut-être été supprimée).', 'introuvable');
}
function majTache_(id, champs) { majLigne_('Taches', function (r) { return r.Id === String(id); }, champs); }
function ecrireEquipe_(id, equipe) {
  supprimerLignes_('Intervenants', function (r) { return r.TacheId === id; });
  equipe.forEach(function (m) { ajouter_('Intervenants', { TacheId: id, Nom: m.nom, Role: m.role, Telephone: m.tel, Email: m.email }); });
}
function activite_(qui, texte) {
  ajouter_('Activite', { Date: String(Date.now()), Qui: qui, Texte: texte });
  var sh = feuille_('Activite'), extra = sh.getLastRow() - 1 - 500;
  if (extra > 0) sh.deleteRows(2, extra);
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
  ['Actualites', 'Lectures', 'Newsletter'].forEach(function (k) { if (l[k]) d.push(k.toLowerCase()); });
  if (l.Gestion) d.push('gestion des accès');
  return l.Email + ' — ' + (d.join(', ') || 'aucun droit') + (l.Actif !== 'oui' ? ' (désactivé)' : '');
}
function journal_(qui, action, detail) { ajouter_('Journal', { Date: String(Date.now()), Qui: qui, Action: action, Detail: detail }); }

/* ======================= Publication sur le site (admin) ======================= */
var FICHIERS_PUB = { 'actualites.json': 'actualites', 'lectures.json': 'lectures', 'newsletters.json': 'newsletter' };
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
  if (!aUnDroitSite_(u) && !u.courrier) throw refus_("Vous n'avez pas accès à la rédaction assistée.", 'droits');
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
