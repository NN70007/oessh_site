/* Placement dans l'église et ordre de marche (cortège, procession d'entrée, procession de sortie),
   calculés à partir des inscrits d'un événement, selon le Rituel de l'Ordre (décret Prot. N. 219/2021).
   Référence : document du projet « Cortège et procession - Rituel de l'Ordre (2021) ».
   Ouverte depuis Courrier e-mail → inscriptions → « Placement et procession ». Paramètre : ?ids=<envoi>,<envoi>…
   Les qualités choisies sont gardées dans ce navigateur (localStorage), par événement. Rien n'est envoyé au serveur. */
(function () {
"use strict";
var E = window.Espace;
function $(id) { return document.getElementById(id); }
function esc(s) { return E.esc(s == null ? "" : String(s)); }

var s = E.requireLogin();
if (!s) return;
var u = s.user;
E.renderTop({ section: "Placement et procession", tabs: " " });
E.renderFoot();
if (!u.envois && !u.admin) { etat("Vous n'avez pas accès au Courrier e-mail."); return; }

var IDS_TXT = new URLSearchParams(location.search).get("ids") || "";
var IDS = IDS_TXT.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
$("cr-liste").href = "liste.html?ids=" + encodeURIComponent(IDS_TXT);
if (!IDS.length) { etat("Aucun envoi indiqué : ouvrez cette page depuis le suivi des inscriptions du Courrier e-mail."); return; }

/* ── Référentiels ── */
var QUALITES = [
  ["chevalier", "Chevalier"], ["dame", "Dame"],
  ["chev_imp", "Chevalier impétrant"], ["dame_imp", "Dame impétrante"],
  ["cardinal", "Cardinal"], ["eveque", "Archevêque ou évêque"], ["pretre", "Prêtre"], ["pretre_imp", "Prêtre impétrant"],
  ["diacre", "Diacre"], ["religieux", "Religieux-chevalier"], ["religieuse", "Religieuse-dame"],
  ["ordre", "Représentant d'un autre Ordre"], ["honneur", "Invité d'honneur (autorité)"], ["invite", "Invité (famille, ami)"]
];
var GRADES = [["", "-"], ["gc", "Grand-Croix"], ["go", "Grand Officier"], ["cp", "Commandeur avec plaque"], ["co", "Commandeur"], ["ch", "Chevalier / Dame"]];
var RANG_GRADE = { gc: 0, go: 1, cp: 2, co: 3, ch: 4, "": 5 };
var FONCTIONS = [
  ["", "-"],
  ["lieutenant", "Lieutenant"], ["lt_hon", "Lieutenant d'honneur"], ["conseil", "Membre du Conseil"],
  ["president", "Président de Section"], ["delegue", "Délégué local"],
  ["lt_gen", "Lieutenant général"], ["gouv", "Gouverneur général"], ["vice_gouv", "Vice-Gouverneur général"],
  ["gm", "Membre du Grand Magistère"], ["lt_invite", "Lieutenant invité"], ["rep_lt", "Représentant d'une autre Lieutenance"],
  ["celebrant", "Célébrant"], ["concel", "Concélébrant"], ["grand_prieur", "Grand Prieur de la Lieutenance"],
  ["prieur", "Prieur de Section ou de Délégation"], ["assistant", "Cérémoniaire et assistant spirituel de l'Ordre"],
  ["cer_eccl", "Cérémoniaire ecclésiastique"]
];
var ROLES = [
  ["", "-"], ["cer_laic", "Cérémoniaire laïc"], ["etendard", "Porte-étendard"], ["fanion_s", "Porte-fanion de Section"],
  ["fanion_d", "Porte-fanion de Délégation locale"], ["epee", "Porte-épée et éperons (Veillée)"], ["vase", "Porte-vase des huiles (Veillée)"],
  ["ferme", "Ferme la procession"], ["accueil", "Accueil à l'entrée de l'église"]
];
var CLERCS = { cardinal: 1, eveque: 1, pretre: 1, pretre_imp: 1 };
var FEMMES = { dame: 1, dame_imp: 1, religieuse: 1 };
var PROCESSION_F = { lieutenant: 1, lt_gen: 1, gouv: 1, vice_gouv: 1, celebrant: 1, concel: 1, grand_prieur: 1, prieur: 1, assistant: 1, cer_eccl: 1 };
var ROLES_MARCHE = { cer_laic: 1, etendard: 1, fanion_s: 1, fanion_d: 1, epee: 1, vase: 1, ferme: 1, accueil: 1 };
function lib(liste, v) { for (var i = 0; i < liste.length; i++) if (liste[i][0] === v) return liste[i][1]; return ""; }

/* ── Dates ── */
var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function dateEvt(iso) { var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); return JOURS[d.getUTCDay()] + " " + p[2] + (p[2] === 1 ? "er" : "") + " " + MOIS[p[1] - 1] + " " + p[0]; }
function aujourdhui() { var d = new Date(); return d.getDate() + (d.getDate() === 1 ? "er" : "") + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
function etat(t) { $("cr-etat").textContent = t; }
function norm(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function cleNom(nom) { var m = String(nom || "").trim().split(/\s+/); return norm((m.length > 1 ? m[m.length - 1] : m[0] || "") + " " + m.join(" ")); }

/* ── État ── */
var EVT = null, PERS = [], CHOIX = {}, REG = { type: "messe", places: 6, marche: "cote", grades: "haut" }, CLE = "";
function sauver() { try { localStorage.setItem(CLE, JSON.stringify({ reg: REG, p: CHOIX })); } catch (e) {} }
function relire() { try { var o = JSON.parse(localStorage.getItem(CLE) || "null"); if (o) { REG = Object.assign(REG, o.reg || {}); CHOIX = o.p || {}; } } catch (e) {} }

/* Qualité, grade et fonction proposés d'après le fichier des membres :
   colonne TITRE (« le Commandeur », « la Dame de Commanderie », « Komtur-Dame mit Stern », « le Candidat »…),
   puis formule d'appel et groupe ; appartenance au Conseil de la Lieutenance. */
function gradeDuTitre(t) {
  if (/gr(an)?d?[- .]*cr(oix)?\b|grand-croix|gro(ss|ß)kreuz/.test(t)) return "gc";
  if (/grand officier|gro(ss|ß)offizier/.test(t)) return "go";
  if (/(commandeur|commanderie).*plaque|komtur.*stern/.test(t)) return "cp";
  if (/commandeur|commanderie|komtur/.test(t)) return "co";
  if (/chevalier|\bdame\b|ritter/.test(t)) return "ch";
  return "";
}
function proposer(p, m) {
  if (p.accompagnant || !m) return { q: "invite", g: "", f: "" };
  var a = m.appel || "", t = norm(m.titre).replace(/^(le|la|l'|l’)\s*/, "");
  var femme = /^(Madame|Chère)/.test(a) || /^la\b|\bdame\b|komturdame|-dame|candidate|sympathisante|sekretarin/.test(norm(m.titre));
  var f = m.conseilLt ? "conseil" : "";
  if (/minence/.test(a) || /eminence|kardinal|cardinal/.test(t)) return { q: "cardinal", g: "", f: "" };
  if (/^Monseigneur/.test(a) || /monseigneur|eveque|bischof/.test(t)) return { q: "eveque", g: "", f: "" };
  if (/Abb/.test(a) || /abbe|chanoine|cure|pretre|pfarrer|domherr|pater|\bpere\b/.test(t)) return { q: "pretre", g: "", f: f };
  if (m.groupe === "candidat" || /candidat|kandidat/.test(t)) return { q: femme ? "dame_imp" : "chev_imp", g: "", f: "" };
  if (m.groupe === "malte") return { q: "ordre", g: "", f: "" };
  if (/lieutenant pour|statthalter/.test(t)) return { q: femme ? "dame" : "chevalier", g: gradeDuTitre(t), f: "lt_invite" };
  if (/sympathisant/.test(t)) return { q: "invite", g: "", f: "" };
  var g = gradeDuTitre(t);
  if (g || /Consœur|Confrère/.test(a)) return { q: femme ? "dame" : "chevalier", g: g, f: f };
  if (/^Excellence/.test(a)) return { q: "honneur", g: "", f: "" };
  return { q: "invite", g: "", f: "" };
}

/* ── Chargement : inscriptions (fusion des envois) + fichier des membres pour les qualités ── */
function charger() {
  etat("Chargement des inscriptions…");
  $("cr-imprimer").disabled = true;
  Promise.all([
    Promise.all(IDS.map(function (id) { return E.api("mail.inscriptions", { id: id }).catch(function (e) { return { erreur: e && e.message || "inscriptions indisponibles" }; }); })),
    E.api("mail.charger").catch(function () { return { membres: [] }; })
  ]).then(function (res) {
    var liste = res[0], membres = res[1].membres || [], parNom = {};
    membres.forEach(function (m) { parNom[norm((m.prenom ? m.prenom + " " : "") + m.nom)] = m; });
    var inscrits = {}, refus = [];
    liste.forEach(function (r) {
      if (r.erreur) { refus.push(r.erreur); return; }
      EVT = EVT || r.evenement;
      r.oui.forEach(function (x) { if (!inscrits[x.nom] || inscrits[x.nom].le < x.le) inscrits[x.nom] = x; });
    });
    if (!EVT) { etat(refus[0] || "Aucun événement rattaché à cet envoi."); return; }
    CLE = "oessh_ceremonial_" + EVT.id;
    relire();
    PERS = [];
    Object.keys(inscrits).forEach(function (n) {
      var x = inscrits[n];
      PERS.push({ nom: x.nom, accompagnant: false, avec: "" });
      x.noms.forEach(function (a) { PERS.push({ nom: a, accompagnant: true, avec: x.nom }); });
    });
    PERS.forEach(function (p) {
      p.prop = proposer(p, parNom[norm(p.nom)]);
      if (!CHOIX[p.nom]) CHOIX[p.nom] = { q: p.prop.q, g: p.prop.g, f: p.prop.f, r: "", par: "" };
    });
    PERS.sort(function (a, b) { return cleNom(a.avec || a.nom).localeCompare(cleNom(b.avec || b.nom), "fr") || (a.accompagnant - b.accompagnant) || cleNom(a.nom).localeCompare(cleNom(b.nom), "fr"); });
    $("cr-type").value = REG.type; $("cr-places").value = REG.places; $("cr-marche").value = REG.marche; $("cr-grades").value = REG.grades;
    $("cr-saisie").hidden = false;
    dessinerSaisie();
    tout();
    etat(refus.length ? "Attention : " + refus.length + " envoi(s) illisible(s) (" + refus[0] + ")." : PERS.length + " personnes inscrites.");
  });
}

function options(liste, v) { return liste.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); }
function dessinerSaisie() {
  $("cr-personnes").innerHTML = PERS.map(function (p, i) {
    var c = CHOIX[p.nom], imp = c.q === "chev_imp" || c.q === "dame_imp";
    var parrains = [["", "-"]].concat(PERS.filter(function (x) { return x.nom !== p.nom && /^(chevalier|dame|diacre)$/.test(CHOIX[x.nom].q); }).map(function (x) { return [x.nom, x.nom]; }));
    return '<tr data-i="' + i + '"><td>' + esc(p.nom) + (p.avec ? '<div class="avec">avec ' + esc(p.avec) + "</div>" : "") + "</td>" +
      '<td><select data-k="q">' + options(QUALITES, c.q) + "</select></td>" +
      '<td><select data-k="g"' + (/^(chevalier|dame|diacre|religieux|religieuse)$/.test(c.q) ? "" : " disabled") + ">" + options(GRADES, c.g) + "</select></td>" +
      '<td><select data-k="f"' + (c.q === "invite" || c.q === "honneur" ? " disabled" : "") + ">" + options(FONCTIONS, c.f) + "</select></td>" +
      '<td><select data-k="r"' + (c.q === "invite" || c.q === "honneur" ? " disabled" : "") + ">" + options(ROLES, c.r) + "</select></td>" +
      '<td><select data-k="par"' + (imp ? "" : " disabled") + ">" + options(parrains, c.par) + "</select></td></tr>";
  }).join("");
}
$("cr-personnes").addEventListener("change", function (ev) {
  var sel = ev.target, tr = sel.closest("tr"); if (!tr) return;
  var p = PERS[Number(tr.dataset.i)], c = CHOIX[p.nom];
  c[sel.dataset.k] = sel.value;
  if (sel.dataset.k === "q") { if (!/^(chevalier|dame|diacre|religieux|religieuse)$/.test(c.q)) c.g = ""; if (!/_imp$/.test(c.q) || c.q === "pretre_imp") c.par = ""; dessinerSaisie(); }
  sauver(); tout();
});
["cr-type", "cr-places", "cr-marche", "cr-grades"].forEach(function (id) {
  $(id).addEventListener("change", function () {
    REG.type = $("cr-type").value; REG.places = Math.max(2, Math.min(20, Number($("cr-places").value) || 6));
    REG.marche = $("cr-marche").value; REG.grades = $("cr-grades").value; sauver(); tout();
  });
});

/* ── Sélections ── */
function C(p) { return CHOIX[p.nom]; }
function qui(f) { return PERS.filter(function (p) { return f(C(p), p); }); }
function noms(l) { return l.map(function (p) { return p.nom; }); }
function triPreseance(l) {
  var sens = REG.grades === "bas" ? -1 : 1;
  return l.slice().sort(function (a, b) {
    var ga = RANG_GRADE[C(a).g || ""], gb = RANG_GRADE[C(b).g || ""];
    if (ga !== gb) {
      if (ga === 5) return 1; if (gb === 5) return -1;   // grade non précisé : toujours en fin
      return sens * (ga - gb);
    }
    return cleNom(a.nom).localeCompare(cleNom(b.nom), "fr");
  });
}
/* Parrains et marraines : ils accompagnent leur impétrant et sortent du rang des Chevaliers et Dames */
function parrainsUtilises() { var o = {}; PERS.forEach(function (p) { var c = C(p); if (/^(chev|dame)_imp$/.test(c.q) && c.par) o[c.par] = 1; }); return o; }
function avecParrain(l) { return l.map(function (p) { return p.nom + (C(p).par ? " (suivi de " + C(p).par + ")" : ""); }); }
function roleDe(r) { return qui(function (c) { return c.r === r; }); }
function fonc(f) { return qui(function (c) { return c.f === f; }); }
function enMarcheParticuliere(c) { return ROLES_MARCHE[c.r] || PROCESSION_F[c.f]; }

/* Chevaliers - Dames du cortège (membres sans fonction ni rôle particulier) */
function rangChevaliersDames(exclus) {
  var par = parrainsUtilises();
  var libre = function (c, p) { return !enMarcheParticuliere(c) && !par[p.nom] && !exclus[c.f]; };
  return {
    g: triPreseance(qui(function (c, p) { return (c.q === "chevalier" || c.q === "diacre") && libre(c, p); })),
    d: triPreseance(qui(function (c, p) { return c.q === "dame" && libre(c, p); }))
  };
}

/* ── Rendu ── */
function ligne(lbl, contenu, fixe) { return { lbl: lbl, contenu: contenu, fixe: !!fixe }; }
function L(lbl, liste) { return liste.length ? ligne(lbl, liste.map(esc).join("<br>")) : null; }
function paires(lbl, gauche, droite, tg, td) {
  if (!gauche.length && !droite.length) return null;
  if (REG.marche === "suite") {
    return ligne(lbl, (gauche.length ? '<div class="cd-sous">' + esc(tg) + "</div>" + gauche.map(esc).join("<br>") : "") +
      (droite.length ? '<div class="cd-sous" style="margin-top:1.5mm">' + esc(td) + "</div>" + droite.map(esc).join("<br>") : ""));
  }
  var n = Math.max(gauche.length, droite.length), h = '<table class="cd-paires"><tr><th>' + esc(tg) + "</th><th>" + esc(td) + "</th></tr>";
  for (var i = 0; i < n; i++) h += "<tr><td>" + esc(gauche[i] || "") + "</td><td>" + esc(droite[i] || "") + "</td></tr>";
  return ligne(lbl, h + "</table>");
}
function F(lbl, detail) { return ligne(lbl, detail || "", true); }
function tableau(lignes) {
  lignes = lignes.filter(Boolean);
  if (!lignes.length) return "";
  return '<table class="cd-t"><colgroup><col class="n"><col class="lib"><col></colgroup><tbody>' + lignes.map(function (l, i) {
    return '<tr><td class="n">' + (i + 1) + '</td><td class="lib' + (l.fixe ? " fixe" : "") + '">' + esc(l.lbl) + "</td><td" + (l.fixe ? ' class="fixe"' : "") + ">" + l.contenu + "</td></tr>";
  }).join("") + "</tbody></table>";
}
function feuille(titre, corps) {
  var e = EVT || {};
  return '<div class="ltr-sheet"><table class="ltr-flow">' +
    '<thead><tr><td><div class="ltr-sp-top"></div></td></tr></thead>' +
    '<tfoot><tr><td><div class="ltr-sp-bot"><div class="ltr-footer">OESSH Luxembourg,&nbsp; 2, rue Christophe Plantin,&nbsp; L-2339 Luxembourg</div></div></td></tr></tfoot>' +
    "<tbody><tr><td>" +
      '<div class="ltr-header"><div class="ltr-arms"><img class="ltr-logo" src="../../assets/logo-oessh-armoiries-transparent.png" alt="Armoiries OESSH"></div>' +
      '<div class="ltr-header-text"><div class="ltr-latin">ORDO EQUESTRIS SANCTI SEPULCRI HIEROSOLYMITANI</div><div class="ltr-ordre">Ordre Équestre du Saint-Sépulcre de Jérusalem</div><div class="ltr-lieutenance">Lieutenance pour le Luxembourg</div></div></div>' +
      '<div class="cd-date">Luxembourg, le ' + aujourdhui() + "</div>" +
      '<div class="cd-titre">' + esc(titre) + "</div>" +
      '<div class="cd-evt">' + esc(e.titre || "Événement") + "</div>" +
      '<div class="cd-quand">' + esc((e.date ? dateEvt(e.date) : "") + (e.heure ? " à " + e.heure.replace(":", "h") : "") + (e.lieu ? ", " + e.lieu : "")) + "</div>" +
      corps +
    "</td></tr></tbody></table></div>";
}
function section(titre, info, html) { return '<div class="cd-h"><span>' + esc(titre) + "</span>" + (info ? "<small>" + esc(info) + "</small>" : "") + "</div>" + html; }

/* Évêques dans la procession : du moins élevé au plus élevé (le plus digne marche le plus près du célébrant) */
function evequesProcession() {
  var l = qui(function (c) { return (c.q === "eveque" || c.q === "cardinal") && !PROCESSION_F[c.f]; });
  return l.sort(function (a, b) { return (C(a).q === "cardinal") - (C(b).q === "cardinal") || cleNom(a.nom).localeCompare(cleNom(b.nom), "fr"); });
}
function sexePaires(l) { return { g: l.filter(function (p) { return !FEMMES[C(p).q]; }), d: l.filter(function (p) { return FEMMES[C(p).q]; }) }; }

/* ── 1. Cortège et procession d'entrée ── */
function docEntree() {
  var veillee = REG.type === "veillee";
  var impCh = triPreseance(qui(function (c) { return c.q === "chev_imp"; })), impDa = triPreseance(qui(function (c) { return c.q === "dame_imp"; }));
  // Ceux qui marchent déjà à une ligne de fonction ne sont pas repris parmi les Chevaliers et Dames
  var cd = rangChevaliersDames({ conseil: 1, president: 1, delegue: 1, gm: 1, lt_hon: 1, lt_invite: 1, rep_lt: 1, prieur: veillee ? 1 : 0 });
  var rel = sexePaires(qui(function (c) { return (c.q === "religieux" || c.q === "religieuse") && !enMarcheParticuliere(c); }));
  var pretres = qui(function (c) { return c.q === "pretre" && !enMarcheParticuliere(c); });
  var pretresImp = qui(function (c) { return c.q === "pretre_imp"; });
  var ferme = sexePaires(roleDe("ferme"));
  var invites = [
    L("Membres du Grand Magistère", noms(fonc("gm"))),
    L("Lieutenant d'honneur", noms(fonc("lt_hon"))),
    L("Lieutenants invités", noms(fonc("lt_invite"))),
    L("Représentants des autres Lieutenances", noms(fonc("rep_lt"))),
    L("Représentants des autres Ordres", noms(qui(function (c) { return c.q === "ordre"; })))
  ];
  var cortege = [L("Cérémoniaire laïc", noms(roleDe("cer_laic")))];
  if (veillee) {
    cortege.push(paires("Porte-épée et éperons - Porte-vase", noms(roleDe("epee")), noms(roleDe("vase")), "Porte-épée", "Porte-vase"));
    cortege.push(L("Prêtres impétrants", noms(pretresImp)));
    cortege.push(paires("Chevaliers impétrants - Dames impétrantes", avecParrain(impCh), avecParrain(impDa), "Chevaliers", "Dames"));
  }
  cortege = cortege.concat([
    L("Porte-étendard de la Lieutenance", noms(roleDe("etendard"))),
    L("Porte-fanions de Section", noms(roleDe("fanion_s"))),
    L("Porte-fanions de Délégation locale", noms(roleDe("fanion_d")))
  ]).concat(invites).concat([
    L("Membres du Conseil de la Lieutenance", noms(triPreseance(qui(function (c) { return c.f === "conseil" && !ROLES_MARCHE[c.r]; })))),
    L(veillee ? "Présidents de Section et Délégués locaux" : "Présidents de Section", noms(veillee ? fonc("president").concat(fonc("delegue")) : fonc("president"))),
    veillee ? null : L("Délégués locaux", noms(fonc("delegue"))),
    veillee ? L("Prieurs de Section et de Délégation locale", noms(fonc("prieur"))) : null,
    L("Prêtres", noms(pretres)),
    paires("Religieux-chevaliers - Religieuses-dames", noms(rel.g), noms(rel.d), "Religieux", "Religieuses"),
    paires("Chevaliers - Dames", noms(cd.g), noms(cd.d), "Chevaliers", "Dames")
  ]);

  var proc = [F("Thuriféraire - Naviculaire"), F("Cruciféraire"), F("Céroféraire - Céroféraire")];
  if (!veillee) {
    proc.push(paires("Chevaliers impétrants - Dames impétrantes", avecParrain(impCh), avecParrain(impDa), "Chevaliers", "Dames"));
    proc.push(L("Prêtres impétrants", noms(pretresImp)));
  }
  proc = proc.concat([
    L("Lieutenant du lieu", noms(fonc("lieutenant"))),
    L("Vice-Gouverneur", noms(fonc("vice_gouv"))),
    L("Gouverneur général", noms(fonc("gouv"))),
    L("Lieutenant général", noms(fonc("lt_gen"))),
    F("Prêtre ou diacre porte-évangéliaire"),
    L("Prêtres concélébrants", noms(fonc("concel"))),
    veillee ? null : L("Prieurs de Délégation locale et de Section", noms(fonc("prieur"))),
    L("Cérémoniaire et assistant spirituel de l'Ordre", noms(fonc("assistant"))),
    L("Évêques", noms(evequesProcession())),
    L("Grand Prieur de la Lieutenance", noms(fonc("grand_prieur"))),
    L("Célébrant", noms(fonc("celebrant"))),
    ligne("Cérémoniaire ecclésiastique - Secrétaire ou assistant", noms(fonc("cer_eccl")).map(esc).join("<br>") || '<span class="fixe">à désigner</span>'),
    veillee ? null : F("Servants d'autel"),
    paires("Un Chevalier - une Dame", noms(ferme.g), noms(ferme.d), "Chevalier", "Dame")
  ]);
  return feuille("Cortège et procession d'entrée",
    section("Cortège d'entrée", "entre un temps avant la procession", tableau(cortege) || '<p class="cd-vide">Personne dans le cortège.</p>') +
    '<p class="cd-rem">Cortège : les plus hauts dignitaires passent en tête (Rituel, n° 33) ; familles et invités gagnent directement leurs places. Procession : les dignitaires laïcs marchent devant le porte-évangéliaire (n° 38) et le célébrant la ferme (n° 36).</p>' +
    section("Procession d'entrée", veillee ? "" : "Lauda Ierusalem ou Réjouis-toi Jérusalem", tableau(proc)));
}

/* ── 2. Procession de sortie ── */
function docSortie() {
  var veillee = REG.type === "veillee", ferme = sexePaires(roleDe("ferme"));
  var proc = [F("Thuriféraire - Naviculaire"), F("Cruciféraire"), F("Céroféraire - Céroféraire"),
    L("Porte-étendard de la Lieutenance", noms(roleDe("etendard"))),
    L("Porte-fanions de Section", noms(roleDe("fanion_s"))),
    L("Porte-fanions de Délégation locale", noms(roleDe("fanion_d"))),
    L("Lieutenant du lieu", noms(fonc("lieutenant"))),
    L("Vice-Gouverneur", noms(fonc("vice_gouv"))),
    L("Gouverneur général", noms(fonc("gouv"))),
    L("Lieutenant général", noms(fonc("lt_gen"))),
    L("Prêtres concélébrants", noms(fonc("concel"))),
    veillee ? null : L("Prieurs de Délégation locale et de Section", noms(fonc("prieur"))),
    L("Cérémoniaire et assistant spirituel de l'Ordre", noms(fonc("assistant"))),
    L("Évêques", noms(evequesProcession())),
    L("Grand Prieur de la Lieutenance", noms(fonc("grand_prieur"))),
    L("Célébrant", noms(fonc("celebrant"))),
    ligne("Cérémoniaire ecclésiastique - Secrétaire ou assistant", noms(fonc("cer_eccl")).map(esc).join("<br>") || '<span class="fixe">à désigner</span>'),
    veillee ? null : F("Servants d'autel"),
    paires("Un Chevalier - une Dame", noms(ferme.g), noms(ferme.d), "Chevalier", "Dame")
  ];
  var cd = rangChevaliersDames({});
  return feuille("Procession de sortie",
    section("Procession de sortie", "retour direct à la sacristie", tableau(proc)) +
    '<p class="cd-rem">La procession est conduite par le cérémoniaire ecclésiastique (n° 37). Si c’est prévu, les Chevaliers et les Dames forment une haie de salutation de part et d’autre de l’allée, selon les indications du cérémoniaire laïc.</p>' +
    ((cd.g.length || cd.d.length) ? section("Haie de salutation (si prévue)", "Chevaliers à gauche, Dames à droite", tableau([paires("Ordre de préséance, depuis le chœur", noms(cd.g), noms(cd.d), "Chevaliers", "Dames")])) : ""));
}

/* ── 3. Placement dans l'église ── */
function rangs(l, debut) {
  var n = REG.places, out = [];
  for (var i = 0; i < l.length; i += n) out.push({ r: debut + out.length, noms: l.slice(i, i + n) });
  return out;
}
function cote(impetrants, membres) {
  var par = parrainsUtilises(), rangImp = [];
  impetrants.forEach(function (p) { rangImp.push(p.nom + " (impétrant)"); if (C(p).par) rangImp.push(C(p).par + " (parrain)"); });
  var R = rangs(rangImp, 1);
  var suite = membres.filter(function (p) { return !par[p.nom]; }).map(function (p) { return p.nom; });
  return R.concat(rangs(suite, R.length + 1));
}
function triNef(l) {
  var ordre = { conseil: 0, president: 1, delegue: 2 };
  var t = triPreseance(l);
  return t.sort(function (a, b) { var oa = C(a).f in ordre ? ordre[C(a).f] : 3, ob = C(b).f in ordre ? ordre[C(b).f] : 3; return oa - ob || t.indexOf(a) - t.indexOf(b); });
}
function docPlacement() {
  var choeur = [
    L("Célébrant", noms(fonc("celebrant"))),
    L("Prêtres concélébrants", noms(fonc("concel"))),
    L("Cardinaux et évêques", noms(evequesProcession().reverse())),
    L("Grand Prieur de la Lieutenance", noms(fonc("grand_prieur"))),
    L("Prieurs", noms(fonc("prieur"))),
    L("Cérémoniaire et assistant spirituel", noms(fonc("assistant"))),
    L("Cérémoniaire ecclésiastique", noms(fonc("cer_eccl"))),
    L("Prêtres impétrants", noms(qui(function (c) { return c.q === "pretre_imp"; }))),
    L("Prêtres non célébrants", noms(qui(function (c) { return c.q === "pretre" && !PROCESSION_F[c.f]; }))),
    L("Religieux et religieuses (derrière le clergé)", noms(qui(function (c) { return c.q === "religieux" || c.q === "religieuse"; })))
  ];
  var dignitaires = [L("Lieutenant général", noms(fonc("lt_gen"))), L("Gouverneur général", noms(fonc("gouv"))), L("Vice-Gouverneur", noms(fonc("vice_gouv"))), L("Lieutenant du lieu", noms(fonc("lieutenant")))];
  var honneur = [
    L("Membres du Grand Magistère", noms(fonc("gm"))), L("Lieutenant d'honneur", noms(fonc("lt_hon"))),
    L("Lieutenants invités", noms(fonc("lt_invite"))), L("Représentants des autres Lieutenances", noms(fonc("rep_lt"))),
    L("Représentants des autres Ordres", noms(qui(function (c) { return c.q === "ordre"; }))),
    L("Autorités et invités d'honneur", noms(qui(function (c) { return c.q === "honneur"; })))
  ];
  var exclu = { lieutenant: 1, lt_gen: 1, gouv: 1, vice_gouv: 1, gm: 1, lt_hon: 1, lt_invite: 1, rep_lt: 1 };
  var gauche = cote(triPreseance(qui(function (c) { return c.q === "chev_imp"; })), triNef(qui(function (c) { return (c.q === "chevalier" || c.q === "diacre") && !exclu[c.f]; })));
  var droite = cote(triPreseance(qui(function (c) { return c.q === "dame_imp"; })), triNef(qui(function (c) { return c.q === "dame" && !exclu[c.f]; })));
  var nefRangs = Math.max(gauche.length, droite.length), nef = '<table class="cd-nef"><colgroup><col class="r"><col><col></colgroup><thead><tr><th>Rang</th><th>Côté gauche - Chevaliers</th><th>Côté droit - Dames</th></tr></thead><tbody>';
  for (var i = 0; i < nefRangs; i++) nef += '<tr><td class="r">' + (i + 1) + "</td><td>" + esc((gauche[i] || { noms: [] }).noms.join(", ")) + "</td><td>" + esc((droite[i] || { noms: [] }).noms.join(", ")) + "</td></tr>";
  nef += "</tbody></table>";
  var invites = qui(function (c) { return c.q === "invite"; }).map(function (p) { return p.nom + (p.avec ? " (avec " + p.avec + ")" : ""); });
  var accueil = noms(roleDe("accueil"));
  var corps =
    section("Chœur et sièges assignés", "clergé", tableau(choeur) || '<p class="cd-vide">Aucun ecclésiastique indiqué parmi les inscrits.</p>') +
    (dignitaires.filter(Boolean).length ? section("Dignitaires laïcs", "place assignée", tableau(dignitaires)) : "") +
    (honneur.filter(Boolean).length ? section("Places d'honneur", "premiers rangs réservés (n° 27)", tableau(honneur)) : "") +
    section("Nef - membres de l'Ordre", REG.places + " places par rang, en regardant l'autel", nefRangs ? nef : '<p class="cd-vide">Aucun Chevalier ni aucune Dame inscrits.</p>') +
    (nefRangs ? '<p class="cd-rem">Premier rang : impétrants avec leur parrain ou marraine. Ensuite, membres du Conseil, Présidents de Section et Délégués locaux, puis Chevaliers et Dames par grade. Si nécessaire, des Chevaliers peuvent prendre place derrière les Dames.</p>' : "") +
    (invites.length ? section("Familles et invités", invites.length + " personne" + (invites.length > 1 ? "s" : "") + ", derrière les membres", '<p class="cd-rem" style="font-size:10.5pt;color:#000">' + esc(invites.join(" ; ")) + "</p>") : "") +
    (accueil.length ? section("Accueil à l'entrée de l'église", "en manteau, faluche et gants (n° 30)", '<p class="cd-rem" style="font-size:10.5pt;color:#000">' + esc(accueil.join(", ")) + "</p>") : "");
  return feuille("Placement dans l'église", corps);
}

/* Points laissés ouverts par le Rituel : choix appliqués, à confirmer par les cérémoniaires */
function points() {
  var l = [
    "Grade : déduit de la colonne TITRE du fichier des membres (à vérifier). Sans grade, la personne est classée après les grades précisés, par ordre alphabétique.",
    "Chevaliers et Dames : " + (REG.marche === "cote" ? "côte à côte, comme le prévoit le Rituel" : "à la suite (usage du cérémonial de Luxembourg 2024)") + " ; " + (REG.grades === "haut" ? "plus hauts grades en tête (n° 33)." : "plus hauts grades en dernier."),
    "Évêques et cardinaux qui ne concélèbrent pas : dans la procession, à la ligne « Évêques », le plus digne le plus près du célébrant.",
    "Lieutenant d'honneur : dans le cortège après le Grand Magistère (cérémonial 2024).",
    "Diacres membres de l'Ordre : avec les Chevaliers (tenue, n° 17).",
    "Représentants des autres Ordres : à la même place à la Veillée qu'à l'Investiture.",
    "Messe de la Lieutenance hors Investiture : schéma de l'Investiture, sans les lignes sans titulaire."
  ];
  $("cr-points").innerHTML = "<b>Points que le Rituel ne tranche pas : choix appliqués, à confirmer par les cérémoniaires</b><ul>" + l.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
}

function tout() {
  points();
  $("cr-docs").innerHTML = docPlacement() + docEntree() + docSortie();
  document.title = "Placement et procession - " + ((EVT && EVT.titre) || "événement") + " · OESSH Luxembourg";
  $("cr-imprimer").disabled = false;
}
$("cr-imprimer").addEventListener("click", function () { window.print(); });
$("cr-actualiser").addEventListener("click", function () { EVT = null; charger(); });
charger();
})();
