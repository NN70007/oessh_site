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
  ["chev_imp", "Candidat (impétrant à l'Investiture)"], ["dame_imp", "Candidate (impétrante à l'Investiture)"],
  ["cardinal", "Cardinal"], ["eveque", "Archevêque ou évêque"], ["pretre", "Prêtre"], ["pretre_imp", "Prêtre impétrant"],
  ["diacre", "Diacre"], ["religieux", "Religieux-chevalier"], ["religieuse", "Religieuse-dame"],
  ["ordre", "Représentant d'un autre Ordre"], ["honneur", "Invité d'honneur (autorité)"], ["invite", "Invité (famille, ami)"]
];
var GRADES = [["", "-"], ["gc", "Grand-Croix"], ["go", "Grand Officier"], ["cp", "Commandeur avec plaque / Dame de Commanderie avec plaque"], ["co", "Commandeur / Dame de Commanderie"], ["ch", "Chevalier / Dame"]];
var RANG_GRADE = { gc: 0, go: 1, cp: 2, co: 3, ch: 4, "": 5 };
var FONCTIONS = [
  ["", "-"],
  ["lieutenant", "Lieutenant"], ["lt_hon", "Lieutenant d'honneur"],
  ["chancelier", "Chancelier"], ["tresorier", "Trésorier"], ["secretaire", "Secrétaire"], ["secr_adj", "Secrétaire adjoint"],
  ["com", "Responsable de la communication"], ["info", "Responsable informatique"], ["conseil", "Membre du Conseil"],
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
/* Conseil de la Lieutenance (Statuts 2021, art. 28 à 32) : d'abord les trois membres de droit dans l'ordre des Statuts
   (Chancelier, Trésorier, Secrétaire), puis les autres conseillers, classés par grade. Le Règlement général fait foi s'il dit autre chose. */
var CONSEIL_F = { chancelier: 1, tresorier: 2, secretaire: 3, secr_adj: 4, com: 4, info: 4, conseil: 4 };
var COURT = { chancelier: "Chancelier", tresorier: "Trésorier", secretaire: "Secrétaire", secr_adj: "Secrétaire adjoint", com: "Communication", info: "Informatique", conseil: "Conseil",
  lieutenant: "Lieutenant", lt_hon: "Lieutenant d'honneur", president: "Président de Section", delegue: "Délégué local", lt_gen: "Lieutenant général", gouv: "Gouverneur général",
  vice_gouv: "Vice-Gouverneur", gm: "Grand Magistère", lt_invite: "Lieutenant invité", rep_lt: "Autre Lieutenance", celebrant: "Célébrant", concel: "Concélébrant",
  grand_prieur: "Grand Prieur", prieur: "Prieur", assistant: "Assistant spirituel", cer_eccl: "Cérémoniaire ecclésiastique" };
function estConseil(f) { return !!CONSEIL_F[f]; }
/* Hors Veillée et Investiture, les candidats ne sont pas impétrants : candidats en manteau gris (usage de la Lieutenance, hors Rituel) */
function messe() { return REG.type === "messe"; }
var NOTE_CAND = '<p class="cd-rem">* Candidats en manteau gris : usage de la Lieutenance pour le Luxembourg. Le Rituel ne prévoit leur place qu’à la Veillée et à l’Investiture ; ici, ils ferment le cortège et s’assoient derrière les membres.</p>';
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
/* Tri par nom de famille : colonne NOM du fichier des membres quand on la connaît (sans particule), sinon dernier mot */
var FAMILLE = {};
function sansParticule(n) { return norm(n).replace(/^((de|della|del|du|des|d'|d’|von|van|le|la|cardinal)\s*)+/, ""); }
function cleNom(nom) {
  var m = String(nom || "").trim().split(/\s+/);
  return (FAMILLE[nom] || norm(m.length > 1 ? m[m.length - 1] : m[0] || "")) + " " + norm(m.join(" "));
}

/* ── État ── */
var EVT = null, PERS = [], CHOIX = {}, REG = { type: "messe", placesG: 3, placesD: 3, marche: "cote", grades: "haut", haie: "aucune" }, CLE = "";
function sauver() { try { localStorage.setItem(CLE, JSON.stringify({ reg: REG, p: CHOIX })); } catch (e) {} }
function relire() { try { var o = JSON.parse(localStorage.getItem(CLE) || "null"); if (o) { REG = Object.assign(REG, o.reg || {}); CHOIX = o.p || {}; } } catch (e) {} if (REG.haie !== "prevue") REG.haie = "aucune"; }

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
      var mb = parNom[norm(p.nom)];
      if (mb) FAMILLE[p.nom] = sansParticule(mb.nom);
      p.prop = proposer(p, mb);
      if (!CHOIX[p.nom]) CHOIX[p.nom] = { q: p.prop.q, g: p.prop.g, f: p.prop.f, r: "", par: "" };
    });
    PERS.sort(function (a, b) { return cleNom(a.avec || a.nom).localeCompare(cleNom(b.avec || b.nom), "fr") || (a.accompagnant - b.accompagnant) || cleNom(a.nom).localeCompare(cleNom(b.nom), "fr"); });
    $("cr-type").value = REG.type; $("cr-placesG").value = REG.placesG; $("cr-placesD").value = REG.placesD;
    $("cr-marche").value = REG.marche; $("cr-grades").value = REG.grades; $("cr-haie").value = REG.haie;
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
function borne(v) { return Math.max(1, Math.min(12, Number(v) || 3)); }
["cr-type", "cr-placesG", "cr-placesD", "cr-marche", "cr-grades", "cr-haie"].forEach(function (id) {
  $(id).addEventListener("change", function () {
    REG.type = $("cr-type").value; REG.placesG = borne($("cr-placesG").value); REG.placesD = borne($("cr-placesD").value);
    REG.marche = $("cr-marche").value; REG.grades = $("cr-grades").value; REG.haie = $("cr-haie").value; sauver(); tout();
  });
});

/* ── Sélections ── */
function C(p) { return CHOIX[p.nom]; }
function qui(f) { return PERS.filter(function (p) { return f(C(p), p); }); }
function noms(l) { return l; }   // les lignes gardent les personnes : le rendu affiche nom + fonction ou grade
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
function triConseil(l) { var t = triPreseance(l); return t.sort(function (a, b) { return (CONSEIL_F[C(a).f] || 9) - (CONSEIL_F[C(b).f] || 9) || t.indexOf(a) - t.indexOf(b); }); }
/* Parrains et marraines : ils accompagnent leur impétrant et sortent du rang des Chevaliers et Dames */
function parrainsUtilises() { var o = {}; PERS.forEach(function (p) { var c = C(p); if (/^(chev|dame)_imp$/.test(c.q) && c.par) o[c.par] = 1; }); return o; }
function avecParrain(l) { return l.map(function (p) { return { p: p, extra: C(p).par ? "suivi de " + C(p).par : "" }; }); }
function roleDe(r) { return qui(function (c) { return c.r === r; }); }
function fonc(f) { return qui(function (c) { return c.f === f; }); }
function enMarcheParticuliere(c) { return ROLES_MARCHE[c.r] || PROCESSION_F[c.f]; }

/* Chevaliers - Dames du cortège (membres sans fonction ni rôle particulier) */
function rangChevaliersDames(exclus) {
  var par = parrainsUtilises();
  var libre = function (c, p) { return !enMarcheParticuliere(c) && !par[p.nom] && !exclus[c.f] && !(exclus.conseil && estConseil(c.f)); };
  return {
    g: triPreseance(qui(function (c, p) { return (c.q === "chevalier" || c.q === "diacre") && libre(c, p); })),
    d: triPreseance(qui(function (c, p) { return c.q === "dame" && libre(c, p); }))
  };
}

/* ── Rendu graphique ── */
function femme(p) { return !!FEMMES[C(p).q]; }
function gradeTxt(p) {
  var f = femme(p);
  return { gc: "Grand-Croix", go: "Grand Officier", cp: f ? "Dame de Commanderie avec plaque" : "Commandeur avec plaque", co: f ? "Dame de Commanderie" : "Commandeur", ch: f ? "Dame" : "Chevalier" }[C(p).g] || "";
}
/* Ce qui s'affiche sous le nom : la fonction (avec le grade pour le Conseil), sinon le grade, sinon la qualité */
function etiquette(p) {
  var c = C(p), g = gradeTxt(p);
  if (c.q === "chev_imp") return messe() ? "Candidat *" : "Impétrant";
  if (c.q === "dame_imp") return messe() ? "Candidate *" : "Impétrante";
  if (COURT[c.f]) return COURT[c.f] + (estConseil(c.f) && g ? " · " + g : "");
  if (g) return g;
  if (c.q === "invite" || c.q === "chevalier" || c.q === "dame") return "";
  return lib(QUALITES, c.q);
}
function chip(x) {
  var p = x && x.p ? x.p : x, extra = x && x.extra ? x.extra : "";
  if (typeof p === "string") return '<span class="ch"><b>' + esc(p) + "</b></span>";
  var t = [etiquette(p), extra].filter(Boolean).join(" · ");
  return '<span class="ch' + (estConseil(C(p).f) ? " cons" : "") + '"><b>' + esc(p.nom) + "</b>" + (t ? "<i>" + esc(t) + "</i>" : "") + "</span>";
}
function chips(l) { return l.map(function (x) { return chip(x); }).join(""); }

/* Étapes de marche */
function L(lbl, liste) { return liste.length ? { lbl: lbl, l: liste } : null; }
function F(lbl) { return { lbl: lbl, fixe: true }; }
function paires(lbl, g, d, tg, td) { return g.length || d.length ? { lbl: lbl, g: g, d: d, tg: tg, td: td } : null; }
function marche(lignes) {
  lignes = lignes.filter(Boolean);
  if (!lignes.length) return '<p class="cd-vide">Personne.</p>';
  var h = '<div class="mc"><div class="mc-bout">Ouvre la marche</div>';
  lignes.forEach(function (l, i) {
    h += '<div class="mc-fl">&#8595;</div><div class="mc-e' + (l.fixe ? " fixe" : "") + '"><div class="mc-n">' + (i + 1) + '</div><div class="mc-c"><div class="mc-l">' + esc(l.lbl) + "</div>";
    if (l.l) h += '<div class="mc-ch">' + chips(l.l) + "</div>";
    if (l.g) {
      if (REG.marche === "suite") {
        h += (l.g.length ? '<div class="mc-s">' + esc(l.tg) + '</div><div class="mc-ch">' + chips(l.g) + "</div>" : "") +
             (l.d.length ? '<div class="mc-s">' + esc(l.td) + ", à la suite</div><div class=\"mc-ch\">" + chips(l.d) + "</div>" : "");
      } else {
        var n = Math.max(l.g.length, l.d.length);
        h += '<div class="mc-pa"><div class="mc-s">' + esc(l.tg) + ' (gauche)</div><div class="mc-s">' + esc(l.td) + " (droite)</div>";
        for (var k = 0; k < n; k++) h += "<div>" + (l.g[k] ? chip(l.g[k]) : "") + "</div><div>" + (l.d[k] ? chip(l.d[k]) : "") + "</div>";
        h += "</div>";
      }
    }
    h += "</div></div>";
  });
  return h + '<div class="mc-fl">&#8595;</div><div class="mc-bout">Ferme la marche</div></div>';
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
function sexePaires(l) { return { g: l.filter(function (p) { return !femme(p); }), d: l.filter(function (p) { return femme(p); }) }; }
function membresConseil() { return triConseil(qui(function (c) { return estConseil(c.f) && !ROLES_MARCHE[c.r]; })); }

/* Vue d'en haut de l'église : autel en haut, porte en bas, la file avance dans l'allée centrale.
   Entrée : la tête de la file est la plus proche de l'autel. Sortie : la tête est la plus proche de la porte.
   Les personnes qui marchent côte à côte sont dessinées côte à côte (gauche et droite en regardant l'autel). */
function allee(lignes, sens) {
  lignes = lignes.filter(Boolean);
  if (!lignes.length) return '<p class="cd-vide">Personne.</p>';
  var entree = sens === "entree", vue = lignes.map(function (l, i) { return { l: l, n: i + 1 }; });
  if (!entree) vue.reverse();
  var haut = entree ? "&#9650; Tête de la file : elle avance vers l’autel" : "Fin de la file : le célébrant ferme la marche";
  var bas = entree ? "Fin de la file" : "&#9660; Tête de la file : elle va directement à la sacristie";
  var h = '<div class="eg"><div class="eg-autel">' + (entree ? "Autel" : "Chœur · départ") + '</div><div class="eg-nef' + (entree ? "" : " sans") + '"><div class="eg-banc"></div><div class="eg-allee ' + (entree ? "monte" : "descend") + '"><div class="al-tete">' + haut + "</div>";
  vue.forEach(function (v) {
    var l = v.l;
    h += '<div class="al-e' + (l.fixe ? " fixe" : "") + '"><div class="al-l"><span class="al-n">' + v.n + "</span>" + esc(l.lbl) + "</div>";
    // Rangées de marche : deux par deux (Chevalier à gauche, Dame à droite pour les paires du Rituel)
    var rg = [];
    if (l.l) for (var k = 0; k < l.l.length; k += 2) rg.push([l.l[k], l.l[k + 1]]);
    if (l.g) {
      if (REG.marche === "suite") {
        for (var a1 = 0; a1 < l.g.length; a1 += 2) rg.push([l.g[a1], l.g[a1 + 1]]);
        for (var a2 = 0; a2 < l.d.length; a2 += 2) rg.push([l.d[a2], l.d[a2 + 1]]);
      } else {
        // Paires Chevalier - Dame tant qu'il y en a des deux côtés, puis les restants deux par deux
        var np = Math.min(l.g.length, l.d.length), reste = l.g.length > np ? l.g.slice(np) : l.d.slice(np);
        for (var k2 = 0; k2 < np; k2++) rg.push([l.g[k2], l.d[k2], true]);
        for (var k3 = 0; k3 < reste.length; k3 += 2) rg.push([reste[k3], reste[k3 + 1]]);
      }
    }
    rg.forEach(function (r) {
      if (!r[2] && !r[1]) h += '<div class="al-r un"><div>' + chip(r[0]) + "</div></div>";
      else h += '<div class="al-r"><div>' + (r[0] ? chip(r[0]) : "") + "</div><div>" + (r[1] ? chip(r[1]) : "") + "</div></div>";
    });
    h += "</div>";
  });
  h += '<div class="al-tete">' + bas + "</div>";
  h += '</div><div class="eg-banc"></div></div><div class="eg-porte">' + (entree ? "Porte de l’église · départ" : "Sacristie") + "</div></div>";
  return h;
}
/* Mise en rang au point de départ : ordre d'appel, sans les noms */
function appel(lignes) {
  return '<div class="ap"><b>Mise en rang au départ, dans cet ordre :</b> ' + lignes.filter(Boolean).map(function (l, i) {
    var nb = l.l ? l.l.length : l.g ? l.g.length + l.d.length : 0;
    return '<span class="ap-e"><span class="al-n">' + (i + 1) + "</span>" + esc(l.lbl) + (nb ? " (" + nb + ")" : "") + "</span>";
  }).join(" ") + "</div>";
}
var LEGENDE = '<p class="cd-sens">Vue d’en haut : l’autel en haut, la porte en bas. Les personnes côte à côte marchent ensemble, Chevalier à gauche et Dame à droite en regardant l’autel. Sous chaque nom : fonction ou grade.</p>';

/* ── 1. Cortège et procession d'entrée ── */
function docEntree() {
  var veillee = REG.type === "veillee";
  var candH = triPreseance(qui(function (c) { return c.q === "chev_imp"; })), candF = triPreseance(qui(function (c) { return c.q === "dame_imp"; }));
  var impCh = messe() ? [] : candH, impDa = messe() ? [] : candF;
  if (!messe()) { candH = []; candF = []; }
  // Ceux qui marchent déjà à une ligne de fonction ne sont pas repris parmi les Chevaliers et Dames
  var cd = rangChevaliersDames({ conseil: 1, president: 1, delegue: 1, gm: 1, lt_hon: 1, lt_invite: 1, rep_lt: 1, prieur: veillee ? 1 : 0 });
  var rel = sexePaires(qui(function (c) { return (c.q === "religieux" || c.q === "religieuse") && !enMarcheParticuliere(c); }));
  var pretres = qui(function (c) { return c.q === "pretre" && !enMarcheParticuliere(c); });
  var pretresImp = qui(function (c) { return c.q === "pretre_imp"; });
  var ferme = sexePaires(roleDe("ferme"));
  var cortege = [L("Cérémoniaire laïc", roleDe("cer_laic"))];
  if (veillee) {
    cortege.push(paires("Porte-épée et éperons - Porte-vase", roleDe("epee"), roleDe("vase"), "Porte-épée", "Porte-vase"));
    cortege.push(L("Prêtres impétrants", pretresImp));
    cortege.push(paires("Chevaliers impétrants - Dames impétrantes", avecParrain(impCh), avecParrain(impDa), "Chevaliers", "Dames"));
  }
  cortege = cortege.concat([
    L("Porte-étendard de la Lieutenance", roleDe("etendard")),
    L("Porte-fanions de Section", roleDe("fanion_s")),
    L("Porte-fanions de Délégation locale", roleDe("fanion_d")),
    L("Membres du Grand Magistère", fonc("gm")),
    L("Lieutenant d'honneur", fonc("lt_hon")),
    L("Lieutenants invités", fonc("lt_invite")),
    L("Représentants des autres Lieutenances", fonc("rep_lt")),
    L("Représentants des autres Ordres", qui(function (c) { return c.q === "ordre"; })),
    L("Membres du Conseil de la Lieutenance", membresConseil()),
    L(veillee ? "Présidents de Section et Délégués locaux" : "Présidents de Section", veillee ? fonc("president").concat(fonc("delegue")) : fonc("president")),
    veillee ? null : L("Délégués locaux", fonc("delegue")),
    veillee ? L("Prieurs de Section et de Délégation locale", fonc("prieur")) : null,
    L("Prêtres", pretres),
    paires("Religieux-chevaliers - Religieuses-dames", rel.g, rel.d, "Religieux", "Religieuses"),
    paires("Chevaliers - Dames", cd.g, cd.d, "Chevaliers", "Dames"),
    paires("Candidats en manteau gris *", candH, candF, "Candidats", "Candidates")
  ]);
  var proc = [F("Thuriféraire - Naviculaire"), F("Cruciféraire"), F("Céroféraire - Céroféraire")];
  if (REG.type === "investiture") {
    proc.push(paires("Chevaliers impétrants - Dames impétrantes", avecParrain(impCh), avecParrain(impDa), "Chevaliers", "Dames"));
    proc.push(L("Prêtres impétrants", pretresImp));
  }
  proc = proc.concat(dignitairesEtClerge(veillee, ferme, false));
  var noteCand = candH.length || candF.length ? NOTE_CAND : "";
  return feuille("1. Cortège d'entrée", LEGENDE +
      '<p class="cd-rem">Le cortège entre <b>avant</b> la procession. Chacun gagne ensuite sa place (voir le plan). Les plus hauts dignitaires passent en tête (Rituel, n° 33).</p>' +
      appel(cortege) + allee(cortege, "entree") + noteCand) +
    feuille("2. Procession d'entrée", LEGENDE +
      '<p class="cd-rem">La procession entre quand le cortège est placé' + (veillee ? "" : ", au chant du <i>Lauda Ierusalem</i> ou du <i>Réjouis-toi Jérusalem</i>") + '. Les dignitaires laïcs marchent devant le porte-évangéliaire (n° 38) ; le célébrant ferme la procession (n° 36).</p>' +
      appel(proc) + allee(proc, "entree"));
}
function dignitairesEtClerge(veillee, ferme, sortie) {
  var l = [];
  if (sortie) l = l.concat([L("Porte-étendard de la Lieutenance", roleDe("etendard")), L("Porte-fanions de Section", roleDe("fanion_s")), L("Porte-fanions de Délégation locale", roleDe("fanion_d"))]);
  l = l.concat([
    L("Lieutenant du lieu", fonc("lieutenant")), L("Vice-Gouverneur", fonc("vice_gouv")), L("Gouverneur général", fonc("gouv")), L("Lieutenant général", fonc("lt_gen")),
    sortie ? null : F("Prêtre ou diacre porte-évangéliaire"),
    L("Prêtres concélébrants", fonc("concel")),
    veillee ? null : L("Prieurs de Délégation locale et de Section", fonc("prieur")),
    L("Cérémoniaire et assistant spirituel de l'Ordre", fonc("assistant")),
    L("Évêques", evequesProcession()),
    L("Grand Prieur de la Lieutenance", fonc("grand_prieur")),
    L("Célébrant", fonc("celebrant")),
    fonc("cer_eccl").length ? L("Cérémoniaire ecclésiastique - Secrétaire ou assistant", fonc("cer_eccl")) : F("Cérémoniaire ecclésiastique - Secrétaire ou assistant"),
    veillee ? null : F("Servants d'autel"),
    paires("Un Chevalier - une Dame", ferme.g, ferme.d, "Chevalier", "Dame")
  ]);
  return l;
}

/* ── 2. Procession de sortie et haie ── */
function docSortie() {
  var veillee = REG.type === "veillee", ferme = sexePaires(roleDe("ferme"));
  var proc = [F("Thuriféraire - Naviculaire"), F("Cruciféraire"), F("Céroféraire - Céroféraire")].concat(dignitairesEtClerge(veillee, ferme, true));
  var haie = REG.haie === "prevue" ? section("Haie de salutation", "Rituel, n° 37",
    '<div class="hx">Les Chevaliers et les Dames forment une <b>haie de part et d’autre de l’allée</b>, selon les indications du cérémoniaire laïc.</div>') : "";
  return feuille("3. Procession de sortie", LEGENDE +
    '<p class="cd-rem">À la fin, la procession retourne <b>directement à la sacristie</b>, conduite par le cérémoniaire ecclésiastique (Rituel, n° 37). Le célébrant la ferme (n° 36).</p>' +
    appel(proc) + allee(proc, "sortie") + haie);
}

/* ── 3. Placement dans l'église : plan des bancs ── */
function rangs(items, n) { var out = []; for (var i = 0; i < items.length; i += n) out.push(items.slice(i, i + n)); return out; }
function cote(imp, membres) {
  var par = parrainsUtilises(), a = [];
  imp.forEach(function (p) {
    a.push({ p: p, tag: femme(p) ? "Impétrante" : "Impétrant", cls: "imp" });
    var pr = C(p).par && PERS.filter(function (x) { return x.nom === C(p).par; })[0];
    if (pr) a.push({ p: pr, tag: (femme(pr) ? "Marraine" : "Parrain") + " de " + p.nom.split(" ")[0], cls: "par" });
  });
  return { imp: a, m: membres.filter(function (p) { return !par[p.nom]; }).map(function (p) { return { p: p, tag: etiquette(p), cls: estConseil(C(p).f) ? "cons" : "" }; }) };
}
function triNef(l) {
  var ordre = { president: 1, delegue: 2 };
  var t = triPreseance(l);
  return t.sort(function (a, b) {
    var oa = estConseil(C(a).f) ? CONSEIL_F[C(a).f] / 10 : (C(a).f in ordre ? ordre[C(a).f] : 3), ob = estConseil(C(b).f) ? CONSEIL_F[C(b).f] / 10 : (C(b).f in ordre ? ordre[C(b).f] : 3);
    return oa - ob || t.indexOf(a) - t.indexOf(b);
  });
}
function siege(x) { return '<div class="sg' + (x && x.cls ? " " + x.cls : "") + '">' + (x ? "<b>" + esc(x.p.nom) + "</b>" + (x.tag ? "<i>" + esc(x.tag) + "</i>" : "") : "") + "</div>"; }
function banc(row, n, cls) { var h = '<div class="bc ' + cls + '">'; for (var i = 0; i < n; i++) h += siege(row && row[i]); return h + "</div>"; }
/* Rangs des bancs (gauche, droite) : servent au plan et à la haie de sortie */
function planBancs() {
  var nG = REG.placesG, nD = REG.placesD;
  var exclu = { lieutenant: 1, lt_gen: 1, gouv: 1, vice_gouv: 1, gm: 1, lt_hon: 1, lt_invite: 1, rep_lt: 1 };
  var candH = triPreseance(qui(function (c) { return c.q === "chev_imp"; })), candF = triPreseance(qui(function (c) { return c.q === "dame_imp"; }));
  var G = cote(messe() ? [] : candH, triNef(qui(function (c) { return (c.q === "chevalier" || c.q === "diacre") && !exclu[c.f]; })));
  var D = cote(messe() ? [] : candF, triNef(qui(function (c) { return c.q === "dame" && !exclu[c.f]; })));
  if (messe()) {   // candidats en manteau gris : derrière les membres, hommes à gauche, femmes à droite
    G.m = G.m.concat(candH.map(function (p) { return { p: p, tag: "Candidat *", cls: "cand" }; }));
    D.m = D.m.concat(candF.map(function (p) { return { p: p, tag: "Candidate *", cls: "cand" }; }));
  }
  // Rituel : « si nécessaire, des Chevaliers peuvent aussi se placer derrière les Dames » : les derniers passent à droite
  var depl = [];
  function nb(c, extra, n) { return rangs(c.imp, n).length + Math.ceil((c.m.length + extra) / n); }
  while (G.m.length && nb(G, 0, nG) - nb(D, depl.length, nD) >= 2) { var x = G.m.pop(); depl.unshift({ p: x.p, tag: x.tag || "Chevalier", cls: "dep" }); }
  return { RG: rangs(G.imp, nG).concat(rangs(G.m, nG)), RD: rangs(D.imp, nD).concat(rangs(D.m.concat(depl), nD)) };
}
function docPlacement() {
  var nG = REG.placesG, nD = REG.placesD, PB = planBancs(), RG = PB.RG, RD = PB.RD;
  var nr = Math.max(RG.length, RD.length), nef = "";
  for (var i = 0; i < nr; i++) nef += '<tr><td class="r">' + (i + 1) + "</td><td>" + banc(RG[i], nG, "g") + '</td><td class="al">&#8593;</td><td>' + banc(RD[i], nD, "d") + "</td></tr>";
  var clerge = [].concat(fonc("celebrant"), fonc("concel"), evequesProcession().reverse(), fonc("grand_prieur"), fonc("prieur"), fonc("assistant"), fonc("cer_eccl"),
    qui(function (c) { return c.q === "pretre_imp"; }), qui(function (c) { return c.q === "pretre" && !PROCESSION_F[c.f]; }));
  var religieux = qui(function (c) { return c.q === "religieux" || c.q === "religieuse"; });
  var dignit = [].concat(fonc("lt_gen"), fonc("gouv"), fonc("vice_gouv"), fonc("lieutenant"), fonc("lt_hon"));
  var honneur = [].concat(fonc("gm"), fonc("lt_invite"), fonc("rep_lt"), qui(function (c) { return c.q === "ordre"; }), qui(function (c) { return c.q === "honneur"; }));
  var invites = qui(function (c) { return c.q === "invite"; }).map(function (p) { return { p: p, extra: p.avec ? "avec " + p.avec : "" }; });
  var accueil = roleDe("accueil");
  var plan =
    '<div class="pl">' +
      '<div class="pl-choeur"><div class="pl-t">Autel · chœur</div>' + (clerge.length ? '<div class="mc-ch">' + chips(clerge) + "</div>" : '<div class="pl-vide">Clergé : places prévues par le cérémoniaire ecclésiastique</div>') +
        (religieux.length ? '<div class="pl-s">Derrière le clergé</div><div class="mc-ch">' + chips(religieux) + "</div>" : "") + "</div>" +
      (dignit.length || honneur.length ? '<div class="pl-res">' +
        (dignit.length ? '<div><div class="pl-t">Dignitaires · place assignée</div><div class="mc-ch">' + chips(dignit) + "</div></div>" : "") +
        (honneur.length ? '<div><div class="pl-t">Places d’honneur (n° 27)</div><div class="mc-ch">' + chips(honneur) + "</div></div>" : "") + "</div>" : "") +
      '<table class="nef"><colgroup><col class="r"><col><col class="al"><col></colgroup><thead><tr><th class="r">Rang</th><th>Gauche · Chevaliers</th><th class="al">Allée</th><th>Droite · Dames</th></tr></thead><tbody>' +
        (nef || '<tr><td colspan="4" class="pl-vide">Aucun Chevalier ni aucune Dame inscrits.</td></tr>') + "</tbody></table>" +
      (invites.length ? '<div class="pl-inv"><div class="pl-t">Familles et invités · rangs suivants</div><div class="mc-ch">' + chips(invites) + "</div></div>" : "") +
      '<div class="pl-porte">&#8593; Entrée de l’église' + (accueil.length ? " · accueil : " + esc(accueil.map(function (p) { return p.nom; }).join(", ")) : "") + "</div>" +
    "</div>" +
    '<div class="lg"><span class="sg imp"></span>Impétrant, avec parrain ou marraine <span class="sg cons"></span>Conseil de la Lieutenance <span class="sg dep"></span>Chevaliers placés derrière les Dames' + (messe() ? ' <span class="sg cand"></span>Candidats en manteau gris *' : '') + ' <span class="lg-t">Côté allée : 1re place de chaque rang. ' + nG + " place" + (nG > 1 ? "s" : "") + " à gauche, " + nD + " à droite.</span></div>";
  var aCand = messe() && qui(function (c) { return c.q === "chev_imp" || c.q === "dame_imp"; }).length;
  return feuille("Placement dans l'église", plan + (aCand ? NOTE_CAND : ""));
}

/* Points laissés ouverts par le Rituel : choix appliqués, à confirmer par les cérémoniaires */
function points() {
  var l = [
    "Candidats (manteau gris) : impétrants seulement à la Veillée et à l’Investiture ; aux autres messes, ils ferment le cortège et s’assoient derrière les membres (usage de la Lieutenance, signalé par un astérisque).",
    "Grade : déduit de la colonne TITRE du fichier des membres (à vérifier). Sans grade, la personne est classée après les grades précisés.",
    "Conseil (cortège et bancs) : d’abord les membres de droit dans l’ordre des Statuts (Chancelier, Trésorier, Secrétaire, art. 29 à 31), puis les autres conseillers (art. 32) par grade. Le Règlement général de l’Ordre fait foi s’il en dispose autrement.",
    "Chevaliers et Dames : " + (REG.marche === "cote" ? "côte à côte, comme le prévoit le Rituel" : "à la suite (usage du cérémonial de Luxembourg 2024)") + " ; " + (REG.grades === "haut" ? "plus hauts grades en tête (n° 33)." : "plus hauts grades en dernier."),
    "Dans les bancs : place la plus proche de l’allée pour le plus haut rang ; Chevaliers en surnombre derrière les Dames.",
    "Évêques et cardinaux qui ne concélèbrent pas : dans la procession, le plus digne au plus près du célébrant.",
    "Lieutenant d'honneur : dans le cortège après le Grand Magistère (cérémonial 2024) ; à l'église, avec les dignitaires près du Lieutenant. Diacres : avec les Chevaliers (n° 17)."
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
