/* Liste des inscrits (événement + repas) sur papier à en-tête de la Lieutenance.
   Ouverte depuis Courrier e-mail → Derniers envois → inscriptions → « Liste imprimable ».
   Paramètre : ?ids=<envoi>,<envoi>… (tous les envois rattachés au même événement ; les inscriptions sont fusionnées).
   Aucune donnée n'est stockée ici : tout vient de l'API « mail.inscriptions » (mêmes droits que le suivi des inscriptions). */
(function () {
"use strict";
var E = window.Espace;
function $(id) { return document.getElementById(id); }

var s = E.requireLogin();
if (!s) return;
var u = s.user;
E.renderTop({ section: "Liste des inscrits", tabs: " " });
E.renderFoot();
if (!u.envois && !u.admin) { etat("Vous n'avez pas accès au Courrier e-mail."); return; }

var IDS = (new URLSearchParams(location.search).get("ids") || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
$("li-ceremonial").href = "ceremonial.html?ids=" + encodeURIComponent(IDS.join(","));
if (!IDS.length) { etat("Aucun envoi indiqué : ouvrez cette page depuis le suivi des inscriptions du Courrier e-mail."); return; }

var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function dateEvt(iso) { var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); return JOURS[d.getUTCDay()] + " " + p[2] + (p[2] === 1 ? "er" : "") + " " + MOIS[p[1] - 1] + " " + p[0]; }
function heure(h) { return h ? h.replace(":", "h") : ""; }
function aujourdhui() { var d = new Date(); return d.getDate() + (d.getDate() === 1 ? "er" : "") + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
function etat(t) { $("li-etat").textContent = t; }
/* Tri par nom de famille (dernier mot, sans les particules), puis par prénom */
function cle(nom) {
  var m = String(nom || "").trim().split(/\s+/);
  var fam = m.length > 1 ? m[m.length - 1] : m[0] || "";
  return (fam + " " + m.join(" ")).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function parNom(a, b) { return cle(a.nom).localeCompare(cle(b.nom), "fr"); }

/* Fusion des inscriptions de plusieurs envois : une personne invitée deux fois garde sa réponse la plus récente. */
function fusionner(liste) {
  var evt = null, inscrits = {}, non = {}, sans = {}, refus = [];
  liste.forEach(function (r) {
    if (r.erreur) { refus.push(r.erreur); return; }
    evt = evt || r.evenement;
    r.oui.forEach(function (x) { if (!inscrits[x.nom] || inscrits[x.nom].le < x.le) inscrits[x.nom] = x; });
    r.non.forEach(function (n) { non[n] = 1; });
    r.sans.forEach(function (n) { sans[n] = 1; });
  });
  Object.keys(inscrits).forEach(function (n) { delete non[n]; delete sans[n]; });
  Object.keys(non).forEach(function (n) { delete sans[n]; });
  return { evt: evt, oui: Object.keys(inscrits).map(function (n) { return inscrits[n]; }).sort(parNom), non: Object.keys(non).length, sans: Object.keys(sans).length, refus: refus };
}

function dessiner(F) {
  var evt = F.evt || {}, rp = evt.repas;
  var lignesEvt = [], lignesRepas = [], lignesCh = [], hb = evt.hebergement;
  F.oui.forEach(function (x) {
    lignesEvt.push({ nom: x.nom, avec: "", acc: false });
    x.noms.forEach(function (n) { lignesEvt.push({ nom: n, avec: x.nom, acc: true }); });
    x.repas.forEach(function (n) { lignesRepas.push({ nom: n, avec: n === x.nom ? "" : x.nom }); });
    Object.keys(x.chambres || {}).forEach(function (n) { lignesCh.push({ nom: n, avec: n === x.nom ? "" : x.nom, ch: x.chambres[n], partage: n === x.nom ? x.partage : "" }); });
  });
  var prix = rp ? parseFloat(String(rp.prix || "").replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
  var montant = isFinite(prix) && prix > 0 ? Math.round(prix * lignesRepas.length * 100) / 100 : null;

  function tableau(lignes, pointage) {
    // Les deux tableaux ont toujours 4 colonnes de même largeur (la dernière reste vide pour le repas)
    return '<table class="li-t"><colgroup><col class="n"><col class="nom"><col><col class="c"></colgroup>' +
      '<thead><tr><th class="n">N°</th><th>Nom</th><th>Inscrit par</th><th class="c">' + (pointage ? "Présent" : "") + "</th></tr></thead><tbody>" +
      lignes.map(function (l, i) {
        return "<tr" + (l.acc ? ' class="acc"' : "") + '><td class="n">' + (i + 1) + "</td><td>" + E.esc(l.nom) + '</td><td class="avec">' + E.esc(l.avec) + "</td>" +
          '<td class="c">' + (pointage ? '<span class="li-case"></span>' : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  var corps =
    '<div class="li-date">Luxembourg, le ' + aujourdhui() + "</div>" +
    '<div class="li-titre">Liste des inscrits</div>' +
    '<div class="li-evt">' + E.esc(evt.titre || "Événement") + "</div>" +
    '<div class="li-quand">' + E.esc((evt.date ? dateEvt(evt.date) : "") + (evt.heure ? " à " + heure(evt.heure) : "") + (evt.lieu ? ", " + evt.lieu : "")) + "</div>" +
    '<div class="li-h"><span>Participants à l’événement</span><small>' + lignesEvt.length + " personne" + (lignesEvt.length > 1 ? "s" : "") + "</small></div>" +
    (lignesEvt.length ? tableau(lignesEvt, true) : '<p class="li-vide">Aucun inscrit pour le moment.</p>');
  if (rp) {
    corps +=
      '<div class="li-h"><span>Repas' + (rp.lieu ? " : " + E.esc(rp.lieu) : "") + (rp.heure ? ", " + heure(rp.heure) : "") + "</span><small>" +
        lignesRepas.length + " couvert" + (lignesRepas.length > 1 ? "s" : "") + (montant != null ? " · " + String(montant).replace(".", ",") + " €" : "") + "</small></div>" +
      (rp.prix || rp.note ? '<div class="li-sous">' + E.esc([rp.prix ? "Prix par personne : " + rp.prix : "", rp.note || ""].filter(Boolean).join(" · ")) + "</div>" : "") +
      (lignesRepas.length ? tableau(lignesRepas, false) : '<p class="li-vide">Aucun couvert pour le moment.</p>');
  }
  if (hb) {
    var LIB = { simple: "Individuelle", double: "Double", aucune: "Pas de nuitée" }, nS = 0, nD = 0;
    lignesCh.forEach(function (l) { if (l.ch === "simple") nS++; else if (l.ch === "double") nD++; });
    var avecNuit = lignesCh.filter(function (l) { return l.ch !== "aucune"; });
    corps +=
      '<div class="li-h"><span>Hébergement' + (hb.lieu ? " : " + E.esc(hb.lieu) : "") + (hb.nuit ? ", " + E.esc(hb.nuit) : "") + "</span><small>" +
        nS + " chambre" + (nS > 1 ? "s" : "") + " individuelle" + (nS > 1 ? "s" : "") + " · " + nD + " personne" + (nD > 1 ? "s" : "") + " en chambre double</small></div>" +
      (avecNuit.length ? '<table class="li-t"><colgroup><col class="n"><col class="nom"><col><col class="nom"></colgroup><thead><tr><th class="n">N°</th><th>Nom</th><th>Inscrit par</th><th>Chambre</th></tr></thead><tbody>' +
        avecNuit.map(function (l, i) { return '<tr><td class="n">' + (i + 1) + "</td><td>" + E.esc(l.nom) + '</td><td class="avec">' + E.esc(l.avec) + "</td><td>" + E.esc((LIB[l.ch] || l.ch) + (l.partage ? " (avec " + l.partage + ")" : "")) + "</td></tr>"; }).join("") + "</tbody></table>"
        : '<p class="li-vide">Aucune nuitée pour le moment.</p>');
  }
  corps += '<div class="li-bilan">Réponses : ' + F.oui.length + " inscription" + (F.oui.length > 1 ? "s" : "") + " · " + F.non + " ne vien" + (F.non > 1 ? "nent" : "t") + " pas · " + F.sans + " sans réponse.</div>";

  $("li-page").innerHTML =
    '<div class="ltr-sheet"><table class="ltr-flow">' +
      '<thead><tr><td><div class="ltr-sp-top"></div></td></tr></thead>' +
      '<tfoot><tr><td><div class="ltr-sp-bot"><div class="ltr-footer">OESSH Luxembourg,&nbsp; 2, rue Christophe Plantin,&nbsp; L-2339 Luxembourg</div></div></td></tr></tfoot>' +
      "<tbody><tr><td>" +
        '<div class="ltr-header"><div class="ltr-arms"><img class="ltr-logo" src="../../assets/logo-oessh-armoiries-transparent.png" alt="Armoiries OESSH"></div>' +
        '<div class="ltr-header-text"><div class="ltr-latin">ORDO EQUESTRIS SANCTI SEPULCRI HIEROSOLYMITANI</div><div class="ltr-ordre">Ordre Équestre du Saint-Sépulcre de Jérusalem</div><div class="ltr-lieutenance">Lieutenance pour le Luxembourg</div></div></div>' +
        corps +
      "</td></tr></tbody>" +
    "</table></div>";
  document.title = "Inscrits - " + (evt.titre || "événement") + (evt.date ? " - " + evt.date : "") + " · OESSH Luxembourg";
  $("li-imprimer").disabled = false;
  etat(F.refus.length ? "Attention : " + F.refus.length + " envoi(s) illisible(s) (" + F.refus[0] + ")." : "Liste à jour.");
}

function charger() {
  etat("Chargement des inscriptions…");
  $("li-imprimer").disabled = true;
  Promise.all(IDS.map(function (id) {
    return E.api("mail.inscriptions", { id: id }).catch(function (e) { return { erreur: e && e.message || "inscriptions indisponibles" }; });
  })).then(function (liste) {
    var F = fusionner(liste);
    if (!F.evt) { etat(F.refus[0] || "Aucun événement rattaché à cet envoi."); $("li-page").innerHTML = ""; return; }
    dessiner(F);
  });
}
$("li-imprimer").addEventListener("click", function () { window.print(); });
$("li-actualiser").addEventListener("click", charger);
charger();
})();
