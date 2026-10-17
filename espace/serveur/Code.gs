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
  // Identifiant OAuth Google du site (le même que celui de l'admin actuel).
  GOOGLE_CLIENT_ID: '52829295071-cer9p7voptd0lgdrmgk5a35furmtn256.apps.googleusercontent.com',
  // Personne(s) qui reçoivent tous les droits à l'installation (modifiable ensuite dans l'onglet Acces).
  ADMINS_INITIAUX: [
    { email: 'jb.niedercorn@oessh.lu', nom: 'Jean-Baptiste Niedercorn' },
    { email: 'jb.niedercorn@gmail.com', nom: 'Jean-Baptiste Niedercorn (Gmail)' }
  ],
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
    default: throw refus_('Action inconnue.', 'inconnu');
  }
}

/* ======================= Installation ======================= */
/** À lancer une fois depuis l'éditeur : crée les onglets et donne les droits aux administrateurs initiaux. */
function installer() {
  var ss = classeur_(true);
  Object.keys(ONGLETS).forEach(function (nom) {
    var sh = ss.getSheetByName(nom) || ss.insertSheet(nom);
    var head = ONGLETS[nom];
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), head.length).setNumberFormat('@'); // tout en texte : pas de conversion de dates ni de numéros
  });
  var acc = lire_('Acces');
  CONFIG.ADMINS_INITIAUX.forEach(function (a) {
    if (!acc.some(function (r) { return norm_(r.Email) === norm_(a.email); })) {
      ajouter_('Acces', { Email: norm_(a.email), Nom: a.nom, Investiture: 'organisateur', Actualites: 'oui', Lectures: 'oui', Newsletter: 'oui', Gestion: 'oui', Actif: 'oui', Note: 'Administrateur initial' });
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
  // Déclenche la demande d'autorisation pour l'envoi d'e-mails et les appels à Google.
  MailApp.getRemainingDailyQuota();
  var msg = 'Installation terminée. Feuille : ' + ss.getUrl();
  console.log(msg);
  return msg;
}

/** Supprime les sessions expirées (peut être programmé chaque nuit). */
function nettoyerSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties(), now = Date.now(), n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s:') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) { props.deleteProperty(k); n++; } } catch (e) { props.deleteProperty(k); n++; }
  });
  return n + ' session(s) supprimée(s)';
}

/** Après l'investiture : efface les téléphones et e-mails des intervenants (RGPD). */
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
  return ouvrirSession_(row, 'google');
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
  return ouvrirSession_(row, 'code');
}

function ouvrirSession_(row, via) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + CONFIG.SESSION_JOURS * 86400000;
  PropertiesService.getScriptProperties().setProperty('s:' + hash_(token), JSON.stringify({ email: norm_(row.Email), exp: exp }));
  journal_(norm_(row.Email), 'connexion', via);
  return { ok: true, token: token, expire: exp, user: publicUser_(userFromRow_(row)) };
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
  return userFromRow_(row);
}

/* ======================= Droits ======================= */
function accesPour_(email) {
  email = norm_(email);
  if (!email) return null;
  var rows = lire_('Acces');
  for (var i = 0; i < rows.length; i++) {
    if (norm_(rows[i].Email) === email && oui_(rows[i].Actif)) return rows[i];
  }
  return null;
}
function userFromRow_(r) {
  var inv = String(r.Investiture || '').toLowerCase().trim();
  return {
    email: norm_(r.Email), nom: String(r.Nom || r.Email),
    inv: ROLES_INV.indexOf(inv) > -1 ? inv : '',
    site: { actualites: oui_(r.Actualites), lectures: oui_(r.Lectures), newsletter: oui_(r.Newsletter) },
    gestion: oui_(r.Gestion)
  };
}
function publicUser_(u) { return { email: u.email, nom: u.nom, inv: u.inv, site: u.site, gestion: u.gestion }; }
function exigerInv_(u, roles) {
  if (roles.indexOf(u.inv) < 0) throw refus_("Vous n'avez pas les droits pour cette action.", 'droits');
}
function exigerGestion_(u) { if (!u.gestion) throw refus_("Vous n'avez pas les droits pour gérer les accès.", 'droits'); }

/** Un contributeur peut modifier une tâche dont il est responsable, ou une tâche sans responsable. */
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
      return t.equipe.some(function (m) { return (m.email && norm_(m.email) === u.email) || (m.nom && m.nom === u.nom); });
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
    var x = userFromRow_(r); x.actif = oui_(r.Actif); x.note = r.Note || ''; return x;
  });
  var journal = lire_('Journal').slice(-60).reverse().map(function (r) { return { ts: Number(r.Date) || 0, qui: r.Qui, action: r.Action, detail: r.Detail }; });
  return { ok: true, personnes: personnes, journal: journal };
}

function accesEnregistrer_(u, p, emailOriginal) {
  exigerGestion_(u);
  if (!p || typeof p !== 'object') throw refus_('Données invalides.', 'donnees');
  var email = norm_(p.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw refus_('Adresse e-mail invalide.', 'donnees');
  var orig = norm_(emailOriginal || email);
  var inv = ROLES_INV.indexOf(p.inv) > -1 ? p.inv : '';
  var site = p.site || {};
  var ligne = {
    Email: email, Nom: texte_(p.nom, 80) || email, Investiture: inv,
    Actualites: site.actualites ? 'oui' : '', Lectures: site.lectures ? 'oui' : '', Newsletter: site.newsletter ? 'oui' : '',
    Gestion: p.gestion ? 'oui' : '', Actif: p.actif === false ? 'non' : 'oui', Note: texte_(p.note, 200)
  };
  if (orig === u.email && (!ligne.Gestion || ligne.Actif !== 'oui' || email !== u.email)) {
    throw refus_('Vous ne pouvez pas retirer vos propres droits de gestion (demandez à un autre gestionnaire).', 'droits');
  }
  return verrou_(function () {
    var rows = lire_('Acces');
    var existe = rows.some(function (r) { return norm_(r.Email) === orig; });
    if (email !== orig && rows.some(function (r) { return norm_(r.Email) === email; })) throw refus_('Cette adresse figure déjà dans la liste.', 'donnees');
    if (existe) majLigne_('Acces', function (r) { return norm_(r.Email) === orig; }, ligne);
    else ajouter_('Acces', ligne);
    journal_(u.email, existe ? 'acces.modifie' : 'acces.ajoute', resumeDroits_(ligne));
    return { ok: true };
  });
}

function accesSupprimer_(u, email) {
  exigerGestion_(u);
  email = norm_(email);
  if (email === u.email) throw refus_('Vous ne pouvez pas supprimer votre propre accès.', 'droits');
  return verrou_(function () {
    supprimerLignes_('Acces', function (r) { return norm_(r.Email) === email; });
    journal_(u.email, 'acces.supprime', email);
    return { ok: true };
  });
}
function resumeDroits_(l) {
  var d = [];
  if (l.Investiture) d.push('investiture : ' + l.Investiture);
  ['Actualites', 'Lectures', 'Newsletter'].forEach(function (k) { if (l[k]) d.push(k.toLowerCase()); });
  if (l.Gestion) d.push('gestion des accès');
  return l.Email + ' — ' + (d.join(', ') || 'aucun droit') + (l.Actif !== 'oui' ? ' (désactivé)' : '');
}
function journal_(qui, action, detail) { ajouter_('Journal', { Date: String(Date.now()), Qui: qui, Action: action, Detail: detail }); }

/* ======================= Feuille : utilitaires ======================= */
/**
 * Retrouve la feuille de données.
 * - Script ouvert depuis la feuille (Extensions → Apps Script) : la feuille elle-même.
 * - Script autonome (créé sur script.google.com) : la feuille mémorisée, ou créée à l'installation.
 */
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
/** Empêche l'interprétation d'une saisie comme formule (=, +, -, @). */
function sur_(v) { v = v instanceof Date ? dateTxt_(v) : String(v == null ? '' : v); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function dateTxt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Luxembourg', 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
