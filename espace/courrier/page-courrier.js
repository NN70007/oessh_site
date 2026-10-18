/* Script de la page (fichier externe : la politique de sécurité de /espace/ interdit les scripts dans la page). */
(function(){
"use strict";
var E = window.Espace;

/* ── Auth ── */
var s = E.requireLogin();
if (!s) return;
var u = s.user;
if (!u.courrier && !u.admin) {
  document.getElementById("courrier-section").innerHTML =
    '<div class="container"><div class="notice"><h4>Accès non autorisé.</h4>' +
    '<p>Vous n\'avez pas accès à l\'outil de courrier. Contactez le secrétariat de la Lieutenance.</p>' +
    '</div></div>';
  E.renderTop({ section: "Courrier", tabs: " " });
  E.renderFoot();
  return;
}
// Menu propre à la page
E.renderTop({ section: "Courrier", tabs: E.sectionTabs([
  { id: "sec-rediger",    t: "Rédiger" },
  { id: "sec-apercu",     t: "Prévisualisation" },
  { id: "sec-historique", t: "Mes courriers" }
]) });
E.renderFoot();

/* ── Données membres ── */
// Rôles par entité
var ROLES = {
  lieutenance: [
    { v: "lieutenant",           t: "Le Lieutenant" },
    { v: "chancelier",           t: "Le Chancelier" },
    { v: "tresorier",            t: "Le Trésorier" },
    { v: "secretaire",           t: "Le Secrétaire" },
    { v: "secretaire_adjoint",   t: "Le Secrétaire adjoint" },
    { v: "ceremoniaire_laic",    t: "Le Cérémoniaire laïc" },
    { v: "ceremoniaire_eccl",    t: "Le Cérémoniaire ecclésiastique" },
    { v: "resp_informatique",    t: "Le Responsable informatique" },
    { v: "resp_communication",   t: "La Responsable de la communication" },
    { v: "conseiller",           t: "Le Conseiller" }
  ],
  asbl: [
    { v: "president_asbl",       t: "Le Président" },
    { v: "vice_president_asbl",  t: "Le Vice-Président" },
    { v: "secretaire_asbl",      t: "Le Secrétaire" },
    { v: "tresorier_asbl",       t: "Le Trésorier" },
    { v: "administrateur_asbl",  t: "L'Administrateur" },
    { v: "administratrice_asbl", t: "L'Administratrice" }
  ]
};

// Emails de l'utilisateur (colonnes Email + Emails de l'onglet Acces)
function lireEmails(x){
  if (Array.isArray(x.emails) && x.emails.length) return x.emails;
  if (x.userEmails && typeof x.userEmails === "string" && x.userEmails.trim())
    return x.userEmails.split("|").map(function(e){ return e.trim(); }).filter(Boolean);
  return x.email ? [x.email] : [];
}
// Qualités de l'utilisateur (colonne Roles de l'onglet Acces)
function lireRoles(x){
  if (x.roles && typeof x.roles === "string" && x.roles.trim())
    return x.roles.split(",").map(function(r){ return r.trim(); }).filter(Boolean);
  return Array.isArray(x.roles) ? x.roles : [];
}
var userEmails = lireEmails(u);
var userRoles  = lireRoles(u);

/* ── État ── */
var entite = "lieutenance";
var langCible = "fr";
// Libellés imprimés dans la lettre, selon la langue du courrier
var LIBELLES = {
  fr: { ref: "Réf.", objet: "Objet" },
  de: { ref: "Unser Zeichen", objet: "Betreff" },
  en: { ref: "Our ref.", objet: "Subject" },
  it: { ref: "Rif.", objet: "Oggetto" }
};
function setLangue(l){
  langCible = LIBELLES[l] ? l : "fr";
  document.querySelectorAll(".lang-btn").forEach(function(b){
    b.classList.toggle("active", b.dataset.lang === langCible);
  });
}

/* ── Éléments DOM ── */
var $  = function(id){ return document.getElementById(id); };
var selRole   = $("sel-role");
var selEmail  = $("sel-email");
var inRef     = $("in-ref");
var inDate    = $("in-date");
var inDest    = $("in-dest");
var inObjet   = $("in-objet");
var inCorps   = $("in-corps");
var preview   = $("letter-preview");
var spinner   = $("ia-spinner");
var langRow   = $("lang-row");

/* ── Date par défaut ── */
(function(){
  var d = new Date();
  var mois = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  inDate.value = "Luxembourg, le " + d.getDate() + " " + mois[d.getMonth()] + " " + d.getFullYear();
})();

/* ── Référence auto ── */
(function(){
  var now = new Date();
  var prefixes = { "secretaire":"Secr","lieutenant":"Lt","chancelier":"Chanc","tresorier":"Tres",
    "president_asbl":"Pres","secretaire_asbl":"SecrAsbl","tresorier_asbl":"TresAsbl" };
  function updateRef(){
    var role = selRole.value;
    var pfx = prefixes[role] || "OESSH";
    var num = String(Math.floor(Math.random()*900)+100);
    inRef.value = pfx + "-" + num + "/" + now.getFullYear();
  }
  selRole.addEventListener("change", updateRef);
  updateRef();
})();

/* ── Entité tabs ── */
document.querySelectorAll(".entite-tab").forEach(function(tab){
  tab.addEventListener("click", function(){
    document.querySelectorAll(".entite-tab").forEach(function(t){ t.classList.remove("active"); });
    tab.classList.add("active");
    entite = tab.dataset.entite;
    updateRoleSelect();
    updatePreview();
  });
});

/* ── Remplissage select rôle ── */
function updateRoleSelect(){
  var roles = ROLES[entite] || [];
  // Uniquement les qualités inscrites dans l'onglet Acces
  // (un administrateur sans aucune qualité voit tout, pour pouvoir tester)
  var filtered = (u.admin && !userRoles.length) ? roles : roles.filter(function(r){
    return userRoles.indexOf(r.v) > -1;
  });
  var avant = selRole.value;
  selRole.innerHTML = '<option value="">— Choisir votre qualité —</option>' +
    filtered.map(function(r){ return '<option value="'+r.v+'">'+r.t+'</option>'; }).join("");
  if (filtered.some(function(r){ return r.v === avant; })) selRole.value = avant;
  else if (filtered.length === 1) selRole.value = filtered[0].v;
  // Met à jour la référence et l'aperçu
  selRole.dispatchEvent(new Event("change"));
}

/* ── Emails select ── */
function remplirEmails(){
  var avant = selEmail.value;
  selEmail.innerHTML = '<option value="">— Ne pas afficher d\'adresse e-mail —</option>' +
    userEmails.map(function(em){
      return '<option value="'+E.esc(em)+'">'+E.esc(em)+'</option>';
    }).join("");
  if (userEmails.indexOf(avant) > -1) selEmail.value = avant;
}
remplirEmails();

/* ── Labels rôles ── */
function getRoleLabel(){
  var allRoles = ROLES.lieutenance.concat(ROLES.asbl);
  for (var i=0; i<allRoles.length; i++){
    if (allRoles[i].v === selRole.value) return allRoles[i].t;
  }
  return selRole.value;
}

/* ── Logos ── */
function getLogoSrc(){
  return entite === "asbl"
    ? "../../assets/croix-jerusalem-rouge-transparent.png"
    : "../../assets/logo-oessh-armoiries-transparent.png";
}
function getLogoAlt(){
  return entite === "asbl" ? "Croix de Jérusalem" : "Armoiries OESSH";
}
function getLieutenanceLabel(){
  return entite === "asbl"
    ? "Lieutenance pour le Luxembourg Asbl"
    : "Lieutenance pour le Luxembourg";
}

/* ── Construction de la prévisualisation ── */
function updatePreview(){
  var role     = getRoleLabel();
  var email    = selEmail.value;
  var ref      = inRef.value.trim();
  var date     = inDate.value.trim();
  var objet    = inObjet.value.trim();
  var corps    = inCorps.value.trim();
  var nom      = u.nom || "";

  var dest     = E.esc(inDest.value.trim()).replace(/\n/g,"<br>");
  var fonction = role.replace(/^(Le |La |L'|L’)/, "");
  fonction = fonction.charAt(0).toUpperCase() + fonction.slice(1);

  preview.innerHTML =
    '<div class="ltr-sheet">' +
    '<table class="ltr-flow">' +
      '<thead><tr><td><div class="ltr-sp-top"></div></td></tr></thead>' +
      // Pied de page dans le <tfoot> : le navigateur le répète au bas de chaque page imprimée
      '<tfoot><tr><td><div class="ltr-sp-bot"><div class="ltr-footer">OESSH Luxembourg,&nbsp; 2, rue Christophe Plantin,&nbsp; L-2339 Luxembourg' +
        (email ? '<br>'+E.esc(email) : '') + '</div></div></td></tr></tfoot>' +
      '<tbody><tr><td>' +
        // En-tête
        '<div class="ltr-header">' +
          '<div class="ltr-arms">' +
            '<img class="ltr-logo" src="'+getLogoSrc()+'" alt="'+getLogoAlt()+'">' +
            (role ? '<div class="ltr-qualite">'+E.esc(role)+'</div>' : '') +
          '</div>' +
          '<div class="ltr-header-text ltr-entite-'+entite+'">' +
            '<div class="ltr-latin">ORDO EQUESTRIS SANCTI SEPULCRI HIEROSOLYMITANI</div>' +
            '<div class="ltr-ordre">Ordre Équestre du Saint-Sépulcre de Jérusalem</div>' +
            '<div class="ltr-lieutenance">'+getLieutenanceLabel()+'</div>' +
          '</div>' +
        '</div>' +
        // Référence à gauche, destinataire et date à droite
        '<div class="ltr-top">' +
          '<div class="ltr-ref">'+(ref ? (LIBELLES[langCible]||LIBELLES.fr).ref+' : '+E.esc(ref) : '')+'</div>' +
          '<div>' +
            (dest ? '<div class="ltr-dest">'+dest+'</div>' : '') +
            (date ? '<div class="ltr-date">'+E.esc(date)+'</div>' : '') +
          '</div>' +
        '</div>' +
        (objet ? '<div class="ltr-objet"><u>'+(LIBELLES[langCible]||LIBELLES.fr).objet+'</u> : '+E.esc(objet)+'</div>' : '') +
        (corps ? '<div class="ltr-body">'+E.esc(corps)+'</div>' : '') +
        // Signature
        '<div class="ltr-signature">' +
          '<div class="ltr-signame">'+E.esc(nom)+'</div>' +
          (fonction ? '<div class="ltr-sigtitle">'+E.esc(fonction)+'</div>' : '') +
        '</div>' +
      '</td></tr></tbody>' +
    '</table>' +
    '</div>';
  fitPreview();
}

/* ── Réduire la page A4 à la largeur du panneau ── */
function fitPreview(){
  var sh = preview.querySelector(".ltr-sheet");
  if (!sh) return;
  sh.style.transform = "none";
  var k = preview.clientWidth / sh.offsetWidth;
  sh.style.transform = "scale(" + k + ")";
  preview.style.height = Math.ceil(sh.offsetHeight * k) + "px";
}
window.addEventListener("resize", fitPreview);
window.addEventListener("beforeprint", function(){ preview.style.height = "auto"; });
window.addEventListener("afterprint", fitPreview);

/* ── Événements formulaire ── */
[selRole, selEmail, inRef, inDate, inDest, inObjet, inCorps].forEach(function(el){
  el.addEventListener("input", updatePreview);
  el.addEventListener("change", updatePreview);
});
updateRoleSelect();

/* ── Relire qualités et adresses dans l'onglet Acces (la session peut être ancienne) ── */
E.api("moi").then(function(out){
  if (!out || !out.user) return;
  u = out.user;
  userRoles  = lireRoles(u);
  userEmails = lireEmails(u);
  updateRoleSelect();
  remplirEmails();
  updatePreview();
}).catch(function(){ /* on garde les données de la session */ });

/* ── Bouton Traduire — toggle langue ── */
$("btn-traduire").addEventListener("click", function(){
  langRow.style.display = langRow.style.display === "none" ? "flex" : "none";
});
document.querySelectorAll(".lang-btn").forEach(function(btn){
  btn.addEventListener("click", function(){
    setLangue(btn.dataset.lang);
    callIA("traduire");
  });
});

/* ── Appels IA ── */
$("btn-corriger").addEventListener("click", function(){ callIA("corriger"); });
$("btn-ameliorer").addEventListener("click", function(){ callIA("ameliorer"); });

function setSpinner(on){
  spinner.classList.toggle("visible", on);
  ["btn-corriger","btn-ameliorer","btn-traduire"].forEach(function(id){
    $(id).disabled = on;
  });
}

var REGLES_COURRIER =
  "RÈGLES DE LA LIEUTENANCE (skill oessh-style) : sigle OESSH (jamais OESSJ) ; majuscules à Le Lieutenant, Le Chancelier, Le Trésorier, Le Secrétaire, Chevaliers et Dames ; « Patriarcat latin de Jérusalem (PLJ) » ; « Lieutenance pour le Luxembourg » ; pas de titres académiques ni de noblesse ; guillemets « » et apostrophes courbes ; pas d'anglicismes ni de superlatifs.\n"
  +"PROTOCOLE (grille officielle) : prédicats Sa Sainteté, Sa Béatitude, Son Éminence, Son Excellence réservés à qui y a droit ; le rang ecclésiastique ou princier prévaut sur le grade ; la fonction (Lieutenant, Chancelier, Président) prévaut sur le grade.\n"
  +"BLOC DESTINATAIRE : nom de famille en MAJUSCULES ; prédicat puis fonction sur la ligne suivante ; pour un membre, le grade peut suivre le nom (« Madame Marie DURAND, Dame de Commanderie »). Ne pas écrire « À l'attention de ».\n"
  +"Format : destinataire — bloc | appel | formule finale.\n"
  +"- Saint-Père — « Sa Sainteté le pape [Nom] » | « Très Saint-Père, » | « Je prie Votre Sainteté de bien vouloir agréer l'hommage de mon profond respect et de mon filial dévouement. »\n"
  +"- Cardinal Grand Maître — « Son Éminence le cardinal [Prénom NOM] / Grand Maître de l'Ordre Équestre du Saint-Sépulcre de Jérusalem » | « Éminence, » ou « Monsieur le Cardinal, » | « Je vous prie d'agréer, Éminence, l'expression de mon profond respect et de mon fidèle dévouement. »\n"
  +"- Patriarche latin, Grand Prieur de l'Ordre — « Sa Béatitude le cardinal [Prénom NOM] / Patriarche latin de Jérusalem et Grand Prieur de l'Ordre » | « Votre Béatitude, » ou « Béatitude, » | « Je prie Votre Béatitude d'agréer l'expression de mon profond et respectueux dévouement. »\n"
  +"- Assesseur cardinal — « Son Éminence le cardinal [Prénom NOM] / Assesseur de l'Ordre » | « Éminence, » | « Je vous prie d'agréer, Éminence, l'expression de mon profond respect. » ; Assesseur évêque — « Son Excellence Révérendissime Monseigneur [Prénom NOM] / Assesseur de l'Ordre » | « Monseigneur, » | « Je vous prie d'agréer, Monseigneur, l'expression de mon profond et respectueux dévouement. »\n"
  +"- Lieutenant général — « Son Excellence Monsieur/Madame [Prénom NOM] / Lieutenant général(e) de l'Ordre » | « Excellence, » | « Je vous prie d'agréer, Excellence, l'expression de ma très haute considération. »\n"
  +"- Gouverneur général — « Son Excellence Monsieur [Prénom NOM] / Gouverneur général de l'Ordre » | « Excellence, » ou « Monsieur le Gouverneur général, » | « Je vous prie d'agréer, Excellence, l'expression de ma très haute considération. »\n"
  +"- Vice-Gouverneur général, Chancelier ou Trésorier de l'Ordre — appel par la fonction (« Monsieur le Chancelier, ») | « Je vous prie d'agréer, Monsieur le Chancelier, l'expression de ma haute considération. » ; membre du Grand Magistère — « Monsieur, » | « …l'expression de ma considération distinguée. » (Excellence non automatique au Grand Magistère).\n"
  +"- Lieutenant — « Son Excellence Monsieur/Madame [Prénom NOM] / Lieutenant(e) pour [territoire] » | courrier solennel : « Excellence, » — « Je vous prie d'agréer, Excellence, l'expression de ma haute et respectueuse considération. » ; courrier administratif : « Monsieur le Lieutenant, » / « Madame la Lieutenante, » — « Je vous prie d'agréer, Monsieur le Lieutenant, l'expression de ma considération distinguée. » (sans Excellence).\n"
  +"- Grand Prieur cardinal — « Son Éminence le cardinal [Prénom NOM] / Grand Prieur de la Lieutenance pour [territoire] » | « Éminence, » ou « Monsieur le Cardinal, » | « Je vous prie d'agréer, Éminence, l'expression de mon profond respect. » (évêque : « Monseigneur, » ; prêtre : « Mon Père, » ou « Monsieur l'Abbé, »).\n"
  +"- Chancelier de Lieutenance — « Monsieur le Chancelier, » / « Madame la Chancelière, » | « Je vous prie d'agréer, Monsieur le Chancelier, l'expression de ma considération distinguée. » ; Trésorier — « Monsieur le Trésorier, » | « Je vous prie d'agréer, Monsieur, l'expression de ma considération distinguée. » ; Secrétaire ou Conseiller — « Monsieur, » / « Madame, » | « Je vous prie d'agréer, Monsieur, l'expression de ma considération distinguée. »\n"
  +"- Délégué magistral — « Monsieur le Délégué magistral, » | « …l'expression de ma haute considération. » ; Régent, Président de Section, Délégué local — appel par la fonction | « …l'expression de ma considération distinguée. » ; Prieurs — selon leur titre ecclésiastique.\n"
  +"- Membre de l'Ordre, courrier administratif — « Monsieur, » / « Madame, » | « Je vous prie d'agréer, Monsieur, l'expression de mes sentiments distingués. » ; membre connu personnellement — « Cher Confrère, » / « Chère Consœur, » | « Avec mes sentiments fraternels et chevaleresques. » ; plusieurs membres — « Chères Consœurs, chers Confrères, » ; ensemble de l'Ordre — « Chères Dames, chers Chevaliers, » | « Fraternellement dans le Christ et au service de la Terre Sainte. » ; candidat non investi — « Monsieur, » | « …mes sentiments distingués. » JAMAIS « Monsieur le Chevalier, » ni le grade dans l'appel.\n"
  +"- Cardinal — « Son Éminence le cardinal [Prénom NOM] » | « Éminence, » ou « Monsieur le Cardinal, » | « Je vous prie d'agréer, Éminence, l'expression de mon profond respect. »\n"
  +"- Archevêque / Évêque — « Son Excellence Révérendissime Monseigneur [Prénom NOM] » | « Monseigneur, » | « Je vous prie d'agréer, Monseigneur, l'expression de mon profond et respectueux dévouement. » ; prélat — « Monseigneur [Prénom NOM] » | « …l'expression de mon profond respect. »\n"
  +"- Nonce apostolique — « Monseigneur, » ou « Excellence, » | « Je prie Votre Excellence d'agréer l'expression de ma très haute considération. »\n"
  +"- Prêtre diocésain — « Monsieur l'Abbé [Prénom NOM] » | « Monsieur l'Abbé, » | « Je vous prie d'agréer, Monsieur l'Abbé, l'expression de mon respectueux dévouement. » ; prêtre religieux — « Révérend Père [Prénom NOM] » | « Mon Père, » ; diacre — « Monsieur le Diacre, » | « …l'expression de mes sentiments respectueux. » ; religieuse — « Ma Mère, » ou « Ma Sœur, » | « …l'expression de mon profond respect. »\n"
  +"- Grand-Duc / Grande-Duchesse et Famille grand-ducale — « Monseigneur, » / « Madame, » | « Je prie Votre Altesse Royale d'agréer l'expression de mon plus profond respect. » (princes : « …de mes hommages les plus respectueux. ») ; corps à la troisième personne (Votre Altesse Royale).\n"
  +"- Ambassadeur étranger — « Monsieur l'Ambassadeur, » ou « Excellence, » | « Je prie Votre Excellence d'agréer l'assurance de ma très haute considération. » ; Consul général — « Monsieur le Consul général, » | « Je vous prie d'agréer, Monsieur le Consul général, l'assurance de ma haute considération. »\n"
  +"- Ordre de Malte : Grand Maître « Monseigneur, » ou « Altesse Éminentissime, » ; Chevalier « Monsieur le Chevalier, ».\n"
  +"La formule d'appel est reprise dans la formule finale. Formule au singulier (« Je vous prie ») quand une personne signe. Ne jamais faire précéder la signature de « Son Excellence », « Monsieur » ou « Monseigneur ».\n";

var LANGUES = { fr: "français", de: "allemand", en: "anglais", it: "italien" };

// Formules officielles en langue étrangère (skill oessh-style, section 6.8)
var FORMULES_ETRANGERES =
  "FORMULES OFFICIELLES POUR UN CARDINAL, à utiliser telles quelles (ne pas traduire mot à mot la formule française) :\n"
  +"- DE : appel « Eure Eminenz, » ou « Hochwürdigster Herr Kardinal, » — formule finale « Mit dem Ausdruck meiner tiefen Hochachtung und Ehrerbietung verbleibe ich Eurer Eminenz sehr ergebener » (sans point final, « sehr ergebene » pour une signataire).\n"
  +"- EN : appel « Your Eminence, » ou « My Lord Cardinal, » — formule finale « I have the honor to be, Your Eminence, your most obedient servant. »\n"
  +"- IT : appel « Eminentissimo Signor Cardinale, » ou « Eminenza, » — formule finale « Voglia la Vostra Eminenza gradire i sensi del mio più profondo rispetto. »\n"
  +"- FR : appel « Éminence, » ou « Monsieur le Cardinal, » — formule finale « Je vous prie d'agréer, Éminence, l'expression de mon profond respect. »\n";

function sectionIA(txt, nom){
  var m = txt.match(new RegExp("###" + nom + "###\\s*([\\s\\S]*?)\\s*(?=###[A-Z]+###|$)"));
  return m ? m[1].trim() : null;
}

async function callIA(mode){
  var corps = inCorps.value.trim();
  if (!corps){ E.toast("Veuillez saisir un texte avant d'utiliser l'IA."); return; }

  setSpinner(true);

  var sortie = "\nRéponds UNIQUEMENT dans ce format, sans aucun commentaire :\n"
    + (mode === "ameliorer" ? "###DESTINATAIRE###\n(bloc destinataire)\n" : "")
    + "###OBJET###\n(objet)\n"
    + (mode === "traduire" ? "###DATE###\n(ligne de date)\n" : "")
    + "###CORPS###\n(corps du courrier)\n###FIN###";

  var systemMap = {
    corriger:
      "Tu es correcteur de texte pour l'Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH), Lieutenance pour le Luxembourg. "
      +"Corrige UNIQUEMENT les fautes d'orthographe, de grammaire, de ponctuation et de typographie (guillemets « », apostrophes courbes) "
      +"dans l'objet et dans le corps du courrier. Ne change pas le style ni le contenu." + sortie,
    ameliorer:
      "Tu es rédacteur officiel de la Lieutenance pour le Luxembourg de l'Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH). "
      +"Améliore l'objet et le corps du courrier dans le style solennel mais accessible de l'Ordre : ton digne sans être pompeux, français soutenu. "
      +"Déduis le rang du destinataire de ce qui est indiqué (par exemple « commandeur », « cardinal », « Grand-Duc »), dans le destinataire ou dans le texte. "
      +"Le corps doit COMMENCER par la formule d'appel et SE TERMINER par la formule de politesse correspondant à ce rang ; "
      +"si une indication de rang figure seule dans le texte, intègre-la dans ces formules au lieu de la laisser telle quelle. "
      +"Ne mets ni signature ni nom du signataire à la fin. Mets le bloc destinataire en forme selon la règle ci-dessous, "
      +"sans inventer d'adresse ni de nom absents. Le signataire écrit en qualité de : " + (getRoleLabel() || "membre de la Lieutenance") + ".\n"
      + REGLES_COURRIER + sortie,
    traduire:
      "Tu traduis un courrier officiel de l'Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH), Lieutenance pour le Luxembourg. "
      +"Traduis l'objet, la ligne de date et le corps en " + (LANGUES[langCible] || "français") + " "
      +"en conservant le registre solennel et les conventions de l'Ordre, et en remplaçant la formule d'appel et la formule de politesse "
      +"par leurs équivalents protocolaires usuels dans cette langue : "
      +"DE : Ritterorden vom Heiligen Grab zu Jerusalem / Statthalterei Luxemburg ; "
      +"EN : Equestrian Order of the Holy Sepulchre of Jerusalem / Lieutenancy for Luxembourg ; "
      +"IT : Ordine Equestre del Santo Sepolcro di Gerusalemme / Luogotenenza per il Lussemburgo. "
      +"Guillemets DE : „…“ / EN et IT : \"…\" / FR : « ». "
      +"La ligne de date garde le lieu (Luxembourg) et la date, à la manière de la langue cible (ex. DE « Luxemburg, den 18. Oktober 2026 »).\n"
      + FORMULES_ETRANGERES + sortie
  };

  var message =
      (mode === "ameliorer" ? "DESTINATAIRE :\n" + (inDest.value.trim() || "(non renseigné)") + "\n\n" : "")
    + "OBJET :\n" + (inObjet.value.trim() || "(vide)") + "\n\n"
    + (mode === "traduire" ? "DATE :\n" + (inDate.value.trim() || "(vide)") + "\n\n" : "")
    + "CORPS :\n" + corps;

  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": "PROXY"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 3000,
        system: systemMap[mode],
        messages: [{ role: "user", content: message }]
      })
    });
    var data = await res.json();
    var txt = data.content && data.content[0] && data.content[0].text;
    var nvCorps = txt && sectionIA(txt, "CORPS");
    if (nvCorps){
      nvCorps = nvCorps.replace(/\s*###FIN###\s*$/, "");
      var nvObjet = sectionIA(txt, "OBJET");
      var nvDate  = sectionIA(txt, "DATE");
      var nvDest  = sectionIA(txt, "DESTINATAIRE");
      inCorps.value = nvCorps;
      if (nvObjet && nvObjet !== "(vide)") inObjet.value = nvObjet;
      if (mode === "traduire" && nvDate && nvDate !== "(vide)") inDate.value = nvDate;
      if (mode === "ameliorer" && nvDest && nvDest !== "(non renseigné)") inDest.value = nvDest;
      updatePreview();
      E.toast(mode === "corriger" ? "Texte corrigé ✓" : mode === "ameliorer" ? "Texte amélioré ✓" : "Texte traduit ✓");
    } else {
      E.toast("Erreur de l'IA. Réessayez.");
    }
  } catch(e){
    E.toast("Impossible de joindre le serveur IA.");
  } finally {
    setSpinner(false);
  }
}

/* ── Impression ── */
$("btn-print").addEventListener("click", function(){
  updatePreview();
  setTimeout(function(){ window.print(); }, 100);
});

/* ── Sauvegarde ── */
$("btn-save").addEventListener("click", async function(){
  var payload = {
    ref:     inRef.value.trim(),
    date:    inDate.value.trim(),
    entite:  entite,
    role:    selRole.value,
    email:   selEmail.value,
    dest:    inDest.value.trim(),
    objet:   inObjet.value.trim(),
    corps:   inCorps.value.trim(),
    lang:    langCible
  };
  if (!payload.corps){ E.toast("Rien à enregistrer."); return; }
  try {
    await E.api("courrier.sauvegarder", payload);
    E.toast("Courrier enregistré ✓");
    chargerHistorique();
  } catch(e){
    E.toast("Erreur : " + (e.message || "impossible d'enregistrer."));
  }
});

/* ── Historique ── */
async function chargerHistorique(){
  var liste = $("historique-list");
  try {
    var out = await E.api("courrier.liste", {});
    var items = out.courriers || [];
    if (!items.length){
      liste.innerHTML = '<div class="hist-empty">Aucun courrier enregistré.</div>';
      return;
    }
    liste.innerHTML = items.slice(0,8).map(function(c){
      return '<div class="hist-item" data-courrier="'+E.esc(JSON.stringify(c))+'">' +
        '<div class="hi-ref">'+E.esc(c.ref||"")+'</div>' +
        '<div class="hi-obj">'+E.esc(c.objet||"(sans objet)")+'</div>' +
        '<div class="hi-meta">'+E.esc(c.date||"")+(c.entite?" · "+E.esc(c.entite):"")+'</div>' +
        '</div>';
    }).join("");
    // Clic sur un courrier pour le recharger
    liste.querySelectorAll(".hist-item").forEach(function(item){
      item.addEventListener("click", function(){
        try {
          var c = JSON.parse(item.dataset.courrier);
          // Restaurer entité
          document.querySelectorAll(".entite-tab").forEach(function(t){ t.classList.remove("active"); });
          var tab = document.querySelector('[data-entite="'+(c.entite||"lieutenance")+'"]');
          if (tab){ tab.classList.add("active"); entite = c.entite||"lieutenance"; }
          updateRoleSelect();
          selRole.value   = c.role  || "";
          selEmail.value  = c.email || "";
          inRef.value     = c.ref   || "";
          inDate.value    = c.date  || "";
          inDest.value    = c.dest  || "";
          inObjet.value   = c.objet || "";
          inCorps.value   = [c.salut ? c.salut + "," : "", c.corps || "", c.formule || ""]
                              .filter(Boolean).join("\n\n");
          setLangue(c.lang || "fr");
          updatePreview();
          E.toast("Courrier rechargé.");
        } catch(e){}
      });
    });
  } catch(e){
    liste.innerHTML = '<div class="hist-empty">Historique non disponible.</div>';
  }
}
chargerHistorique();

// Initialiser
updatePreview();

})();
