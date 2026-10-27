/* Courrier e-mail : script de la page (fichier externe, la politique de sécurité de /espace/ interdit les scripts dans la page). */
(function () {
"use strict";
var E = window.Espace;
function $(id) { return document.getElementById(id); }

/* ── Connexion et droits ── */
var s = E.requireLogin();
if (!s) return;
var u = s.user;
if (!u.envois && !u.admin) {
  $("ce-section").innerHTML = '<div class="container"><div class="notice"><h4>Accès non autorisé.</h4>' +
    "<p>Vous n'avez pas accès au Courrier e-mail. Contactez le secrétariat de la Lieutenance.</p></div></div>";
  E.renderTop({ section: "Courrier e-mail", tabs: " " });
  E.renderFoot();
  return;
}
E.renderTop({ section: "Courrier e-mail", tabs: E.sectionTabs([
  { id: "sec-rediger", t: "Rédiger" },
  { id: "sec-dest", t: "Destinataires" },
  { id: "sec-envoi", t: "Aperçu et envoi" },
  { id: "sec-journal", t: "Derniers envois" }
]) });
E.renderFoot();

/* ── Modèles (les mentions entre crochets doivent être complétées : l'envoi est bloqué sinon) ── */
var MODELES = [
  { id: "noel", t: "Vœux de Noël", objet: "Vœux de Noël de la Lieutenance",
    corps: "{appel}\n\nEn ce temps de Noël, nos pensées se tournent vers Bethléem et vers les chrétiens de Terre Sainte, que notre Ordre a la mission de soutenir.\n\n[message personnel]\n\nJe vous souhaite, ainsi qu’à vos proches, un saint et joyeux Noël et une heureuse année.\n\n{politesse}" },
  { id: "paques", t: "Vœux de Pâques", objet: "Vœux de Pâques de la Lieutenance",
    corps: "{appel}\n\nEn cette fête de la Résurrection, nous nous unissons dans la prière à l’Église de Jérusalem, gardienne du Tombeau vide.\n\n[message personnel]\n\nJe vous souhaite de saintes et joyeuses fêtes de Pâques.\n\n{politesse}" },
  { id: "memoriam", t: "In memoriam", objet: "In memoriam - [prénom et nom]",
    corps: "{appel}\n\nC’est avec tristesse que nous vous faisons part du décès de [titre, prénom et nom], survenu le [date].\n\n[quelques mots sur le défunt]\n\nLes funérailles seront célébrées le [date] à [heure] en [église, lieu]. Nous le confions à vos prières.\n\n{politesse}" },
  { id: "circulaire", t: "Circulaire", objet: "[objet de la circulaire]",
    corps: "{appel}\n\n[texte de la circulaire]\n\n{politesse}" }
];

/* ── État ── */
var D = null;              // données du serveur : casquettes, groupes, membres, historique
var MEMBRES = {};          // id -> membre
var choisis = {};          // id -> true (destinataires cochés)
var groupesCoches = {};    // id de groupe -> true
var essaiOk = "";          // empreinte du texte dont l'essai a été envoyé
var PIECES = [];           // pièces jointes déposées : { id, nom, taille }
var EVTS = [];             // événements à venir du calendrier du site

var PIED_SUIVI = "Pour répondre, utilisez simplement « Répondre » en conservant les deux adresses proposées : votre message parviendra à son auteur et sera bien suivi.";   // même texte que Code.gs
function nomComplet(m) { return (m.prenom ? m.prenom + " " : "") + m.nom; }
function repondre() { return $("in-repondre").value; }
function casq() { var c = $("in-casq").value; return (D.casquettes || []).filter(function (x) { return x.code === c; })[0]; }
function empreinte() { var ev = evtChoisi(); return [$("in-casq").value, repondre(), $("in-objet").value.trim(), $("in-corps").value.replace(/\r\n?/g, "\n").trim(), PIECES.map(function (p) { return p.id; }).join(","), $("in-evt").value, ev ? JSON.stringify([ev.repas || null, ev.limite || "", ev.hebergement || null, !!ev.sansAccompagnants, ev.engagement || ""]) : ""].join("\u0001"); }
function evtChoisi() {
  var id = $("in-evt").value, e = EVTS.filter(function (x) { return x.id === id; })[0];
  if (!e) return null;
  e = Object.assign({}, e);
  if ($("rp-actif").checked) e.repas = { actif: true, lieu: $("rp-lieu").value.trim(), heure: $("rp-heure").value, prix: $("rp-prix").value.trim(), limite: $("rp-limite").value, note: $("rp-note").value.trim() };
  if ($("ev-limite").value) e.limite = $("ev-limite").value;
  if (!$("ev-accomp").checked) e.sansAccompagnants = true;
  if ($("ev-engage").value.trim()) e.engagement = $("ev-engage").value.trim();
  if ($("hb-actif").checked) e.hebergement = { actif: true, lieu: $("hb-lieu").value.trim(), nuit: $("hb-nuit").value.trim(), prixSimple: $("hb-simple").value.trim(), prixDouble: $("hb-double").value.trim(), note: $("hb-note").value.trim() };
  return e;
}
function hebergTxt(h) {   // même texte que hebergTxt_ dans Code.gs
  var p = [h.prixSimple ? "individuelle " + h.prixSimple : "", h.prixDouble ? "double " + h.prixDouble : ""].filter(Boolean).join(", ");
  return "Hébergement" + (h.lieu ? " : " + h.lieu : "") + (h.nuit ? ", " + h.nuit : "") + (p ? " (chambre " + p + ")" : "");
}
var CHAMBRES = { simple: "individuelle", double: "double", aucune: "sans nuitée" };
function repasTxt(r) { return "Repas" + (r.lieu ? " : " + r.lieu : "") + (r.heure ? ", " + r.heure.replace(":", "h") : "") + (r.prix ? " (" + r.prix + ")" : ""); }
function decaler(iso, n) { var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12)); return d.toISOString().slice(0, 10); }

/* ── Chargement ── */
var VERSION_SERVEUR = "2026-10-27c";   // doit correspondre à CONFIG.VERSION dans Code.gs
E.api("mail.charger").then(function (r) {
  D = r;
  D.membres.forEach(function (m) { MEMBRES[m.id] = m; });
  remplirCasquettes();
  remplirModeles();
  dessinerGroupes();
  dessinerHistorique();
  chargerEvenements();
  maj();
  if (D.version !== VERSION_SERVEUR) etat("Le serveur Apps Script n’est pas à jour (version " + (D.version || "ancienne") + ", attendue " + VERSION_SERVEUR + ") : collez le dernier Code.gs, enregistrez, puis Déployer > Gérer les déploiements > Modifier > Nouvelle version.", false);
}).catch(function (e) {
  if (e && e.code === "session") { location.replace("../?expire=1"); return; }
  $("ce-section").querySelector(".ce-layout").innerHTML = '<div class="notice"><h4>Chargement impossible.</h4><p>' + E.esc(e && e.message || "Erreur inconnue.") + "</p></div>";
});

function remplirCasquettes() {
  var sel = $("in-casq");
  if (!D.casquettes.length) {
    sel.innerHTML = '<option value="">Aucune fonction attribuée</option>';
    sel.disabled = true;
    $("casq-info").textContent = "Aucune fonction n’est indiquée pour vous dans l’onglet Accès (colonne Roles) : demandez au secrétariat de la compléter.";
    return;
  }
  sel.innerHTML = D.casquettes.map(function (c) { return '<option value="' + E.esc(c.code) + '">' + E.esc(c.titre + " - " + c.entiteNom) + "</option>"; }).join("");
  sel.disabled = D.casquettes.length < 2;
  sel.addEventListener("change", function () { remplirRepondre(); maj(); });
  remplirRepondre();
}
/** « Répondre à » : l'adresse de la fonction est proposée par défaut, les autres adresses de l'auteur au choix. */
function remplirRepondre() {
  var c = casq(), sel = $("in-repondre");
  if (!c) { sel.innerHTML = ""; sel.disabled = true; return; }
  var autres = (D.adresses || []).filter(function (a) { return a !== c.repondreA; });
  sel.innerHTML = '<option value="' + E.esc(c.repondreA) + '">' + E.esc(c.repondreA) + " (adresse de la fonction)</option>" +
    autres.map(function (a) { return '<option value="' + E.esc(a) + '">' + E.esc(a) + "</option>"; }).join("");
  sel.disabled = !autres.length;
}
function remplirModeles() {
  $("in-modele").innerHTML += MODELES.map(function (m) { return '<option value="' + m.id + '">' + E.esc(m.t) + "</option>"; }).join("");
  $("in-modele").addEventListener("change", function () {
    var m = MODELES.filter(function (x) { return x.id === $("in-modele").value; })[0];
    if (!m) return;
    if (($("in-objet").value.trim() || $("in-corps").value.trim()) && !confirm("Remplacer l’objet et le message actuels par le modèle ?")) { $("in-modele").value = ""; return; }
    $("in-objet").value = m.objet; $("in-corps").value = m.corps;
    maj();
  });
}

/* ── Destinataires ── */
function dessinerGroupes() {
  $("groupes").innerHTML = D.groupes.map(function (g) {
    var liste = g.ids.map(function (id) {
      var m = MEMBRES[id];
      return '<label class="pers' + (m.sansCourriel ? " sans" : "") + '"><input type="checkbox" data-pers="' + E.esc(id) + '"> ' + E.esc(nomComplet(m)) +
        (m.sansCourriel ? '<span class="badge-sans">sans courriel</span>' : "") + '<span class="ap">' + E.esc(m.appel) + "</span></label>";
    }).join("");
    return '<div class="grp" data-grp="' + g.id + '"><div class="grp-head"><label><input type="checkbox" data-g="' + g.id + '"> ' + E.esc(g.nom) + "</label>" +
      '<button type="button" class="grp-count" data-ouvrir="' + g.id + '" title="Voir les noms">' + g.ids.length + "</button></div>" +
      '<div class="grp-list">' + (liste || '<div class="hint">Personne dans ce groupe.</div>') + "</div></div>";
  }).join("");
  $("groupes").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-ouvrir]");
    if (b) b.closest(".grp").classList.toggle("open");
  });
  $("groupes").addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.dataset.g) {
      var g = D.groupes.filter(function (x) { return x.id === t.dataset.g; })[0];
      groupesCoches[g.id] = t.checked;
      g.ids.forEach(function (id) { if (t.checked) choisis[id] = true; else if (!encoreCouvert(id, g.id)) delete choisis[id]; });
    } else if (t.dataset.pers) {
      if (t.checked) choisis[t.dataset.pers] = true; else delete choisis[t.dataset.pers];
    }
    maj();
  });
}
/** Une personne décochée d'un groupe reste choisie si un autre groupe coché la contient. */
function encoreCouvert(id, sauf) {
  return D.groupes.some(function (g) { return g.id !== sauf && groupesCoches[g.id] && g.ids.indexOf(id) > -1; });
}

$("in-recherche").addEventListener("input", function () {
  var q = this.value.trim().toLowerCase(), box = $("res-recherche");
  if (q.length < 2 || !D) { box.style.display = "none"; return; }
  var res = D.membres.filter(function (m) { return nomComplet(m).toLowerCase().indexOf(q) > -1; }).slice(0, 12);
  box.innerHTML = res.length ? res.map(function (m) { return '<button type="button" data-ajout="' + E.esc(m.id) + '">' + E.esc(nomComplet(m)) + (m.sansCourriel ? " (sans courriel)" : "") + "</button>"; }).join("") : '<div class="hint" style="padding:8px 14px">Aucun résultat.</div>';
  box.style.display = "block";
});
$("res-recherche").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-ajout]");
  if (!b) return;
  choisis[b.dataset.ajout] = true;
  $("in-recherche").value = ""; $("res-recherche").style.display = "none";
  maj();
});

/* ── Mise à jour de l'écran ── */
function maj() {
  if (!D) return;
  // Cases à cocher des personnes et des groupes
  document.querySelectorAll("[data-pers]").forEach(function (c) { c.checked = !!choisis[c.dataset.pers]; });
  D.groupes.forEach(function (g) {
    var c = document.querySelector('[data-g="' + g.id + '"]');
    var n = g.ids.filter(function (id) { return choisis[id]; }).length;
    c.checked = g.ids.length > 0 && n === g.ids.length;
    c.indeterminate = n > 0 && n < g.ids.length;
  });
  var ids = Object.keys(choisis);
  var sans = ids.filter(function (id) { return MEMBRES[id].sansCourriel; });
  var avec = ids.length - sans.length;
  $("total").innerHTML = avec + " destinataire" + (avec > 1 ? "s" : "") + " <small>(chaque personne n’est comptée qu’une fois)</small>";
  $("sans-courriel").textContent = sans.length ? "Sans adresse e-mail, à prévenir par courrier postal : " + sans.map(function (id) { return nomComplet(MEMBRES[id]); }).join(", ") + "." : "";
  // Personnes ajoutées hors groupe
  var hors = ids.filter(function (id) { return !D.groupes.some(function (g) { return groupesCoches[g.id] && g.ids.indexOf(id) > -1; }); });
  $("ajouts").innerHTML = hors.length ? '<div class="hint">Ajoutés individuellement :</div>' + hors.map(function (id) {
    return '<label class="pers"><input type="checkbox" checked data-pers="' + E.esc(id) + '"> ' + E.esc(nomComplet(MEMBRES[id])) + '<span class="ap">' + E.esc(MEMBRES[id].appel) + "</span></label>";
  }).join("") : "";
  // Aperçu
  var sel = $("in-apercu"), avant = sel.value;
  var pourApercu = ids.length ? ids : D.membres.slice(0, 1).map(function (m) { return m.id; });
  sel.innerHTML = pourApercu.map(function (id) { return '<option value="' + E.esc(id) + '">' + E.esc(nomComplet(MEMBRES[id])) + "</option>"; }).join("");
  if (avant && pourApercu.indexOf(avant) > -1) sel.value = avant;
  dessinerApercu();
  // Boutons
  var c = casq(), pret = !!(c && $("in-objet").value.trim() && $("in-corps").value.trim());
  $("btn-essai").disabled = !pret || pjEnCours > 0;
  var essaiValide = essaiOk && essaiOk === empreinte();
  $("btn-envoyer").disabled = !(pret && essaiValide && avec > 0) || pjEnCours > 0;
  $("btn-envoyer").textContent = "Envoyer à " + avec + " personne" + (avec > 1 ? "s" : "");
  $("envoi-aide").textContent = essaiValide ? "Essai fait pour ce texte : vous pouvez envoyer." : "L’envoi réel s’active après un essai du texte exact.";
}
["in-objet", "in-corps"].forEach(function (id) { $(id).addEventListener("input", maj); });

/* ── Mise en forme légère : « - » en début de ligne = puce, **texte** = gras (même règle que le serveur) ── */
function corpsHtml(corps) {
  var gras = function (t) { return E.esc(t).replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>"); };
  return corps.split(/\n{2,}/).map(function (bloc) {
    var out = "", para = [], liste = [];
    var finPara = function () { if (para.length) { out += "<p>" + para.map(gras).join("<br>") + "</p>"; para = []; } };
    var finListe = function () { if (liste.length) { out += "<ul>" + liste.map(function (l) { return "<li>" + gras(l) + "</li>"; }).join("") + "</ul>"; liste = []; } };
    bloc.split("\n").forEach(function (l) {
      var m = l.match(/^\s*[-•]\s+(.*)$/);
      if (m) { finPara(); liste.push(m[1]); } else { finListe(); para.push(l); }
    });
    finPara(); finListe();
    return out;
  }).join("");
}
/* Collage depuis un document (Claude, Word, Google Docs, page web) : listes et gras convertis en « - » et **…** */
function htmlVersTexte(html) {
  var doc = new DOMParser().parseFromString(html, "text/html");
  var estGras = function (n) {
    var fw = n.style && n.style.fontWeight;
    if (fw) return fw === "bold" || fw === "bolder" || Number(fw) >= 600;
    return /^(B|STRONG)$/.test(n.tagName) || /^H[1-6]$/.test(n.tagName);
  };
  // Texte d'un nœud ; dansLi : un paragraphe dans un élément de liste ne crée pas de ligne vide.
  function texte(n, dejaGras, dansLi) {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, " ");
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|META|TITLE|HEAD)$/.test(n.tagName)) return "";
    var t = n.tagName;
    if (t === "BR") return "\n";
    var g = !dejaGras && estGras(n);
    var li = t === "LI";
    var dedans = Array.prototype.map.call(n.childNodes, function (c) { return texte(c, dejaGras || g, dansLi || li); }).join("");
    if (g) {   // gras ligne par ligne, espaces laissés hors des astérisques
      dedans = dedans.split("\n").map(function (l) {
        var m = l.match(/^(\s*)([\s\S]*?)(\s*)$/);
        return m[2] ? m[1] + "**" + m[2] + "**" + m[3] : l;
      }).join("\n");
    }
    if (li) return "\n- " + dedans.replace(/\n+/g, " ").trim() + "\n";
    if (/^(P|DIV|H[1-6]|UL|OL|TABLE|TR|BLOCKQUOTE|SECTION|ARTICLE)$/.test(t)) return dansLi ? " " + dedans + " " : "\n\n" + dedans + "\n\n";
    return dedans;
  }
  return texte(doc.body, false, false)
    .replace(/ /g, " ").replace(/[–—]/g, "-")
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\n- [^\n]*)\n\n(?=- )/g, "$1\n")     // pas de ligne vide entre deux puces
    .trim();
}
$("in-corps").addEventListener("paste", function (ev) {
  var html = ev.clipboardData && ev.clipboardData.getData("text/html");
  if (!html || !/<(li|b|strong|h[1-6])\b|font-weight/i.test(html)) return;   // texte simple : collage normal
  ev.preventDefault();
  var texte = htmlVersTexte(html);
  this.setRangeText(texte, this.selectionStart, this.selectionEnd, "end");
  maj();
});
$("in-apercu").addEventListener("change", dessinerApercu);
$("in-repondre").addEventListener("change", maj);

function dessinerApercu() {
  var c = casq(), m = MEMBRES[$("in-apercu").value];
  if (!c || !m) { $("apercu").innerHTML = '<div class="hint">Choisissez une fonction et des destinataires.</div>'; $("mp-meta").innerHTML = ""; return; }
  var corps = $("in-corps").value.replace(/\r\n?/g, "\n").trim();
  var avecAppel = corps.indexOf("{appel}") > -1 || /^\s*(Cher|Chère|Chers|Chères|Madame|Monsieur|Mesdames|Messieurs|Mademoiselle|Excellence|Éminence|Monseigneur|Mon Père|Révérend|Bonjour|Bonsoir|Liebe|Lieber|Sehr geehrte|Dear)\b/i.test(corps);   // même règle que le serveur
  corps = corps.replace(/\{appel\}/g, m.appel).replace(/\{politesse\}/g, m.politesse || "").replace(/\{prenom\}/g, m.prenom || "").replace(/\{nom\}/g, m.nom || "");
  if (!avecAppel) corps = m.appel + "\n\n" + corps;
  var paras = corpsHtml(corps);
  var ev = evtChoisi();
  if (ev) {
    var bloc = '<div class="mp-invit"><strong>' + E.esc(ev.titre) + "</strong><br>" + E.esc(quandEvt(ev)) +
      (ev.repas ? "<br>" + E.esc(repasTxt(ev.repas)) + " · inscription au repas jusqu’au " + E.esc(dateEvt(ev.repas.limite || decaler(ev.date, -3))) + (ev.repas.note ? "<br><em>" + E.esc(ev.repas.note) + "</em>" : "") : "") +
      (ev.hebergement ? "<br>" + E.esc(hebergTxt(ev.hebergement)) + (ev.hebergement.note ? "<br><em>" + E.esc(ev.hebergement.note) + "</em>" : "") : "") +
      (ev.limite ? "<br><strong>Réponse attendue au plus tard le " + E.esc(dateEvt(ev.limite)) + ".</strong>" : "") +
      (ev.engagement ? '<div style="margin-top:8px;padding:8px 10px;background:#fff;border:1px solid #b10103"><strong>Important :</strong> ' + E.esc(ev.engagement) + "</div>" : "") +
      '<br><span class="b p">Je viendrai</span><span class="b">Je ne viendrai pas</span></div>';
    var k = m.politesse ? corps.lastIndexOf(m.politesse) : -1;   // même règle que le serveur : avant la formule de politesse
    paras = k > 0 ? corpsHtml(corps.slice(0, k).trim()) + bloc + corpsHtml(corps.slice(k).trim()) : paras + bloc;
  }
  $("mp-meta").innerHTML = "<b>De :</b> " + E.esc(c.expediteur || c.entiteNom + " - " + c.titre) + " &lt;envois@oessh.lu&gt;<br><b>Répondre à :</b> " + E.esc(repondre()) + (D && D.suivi ? " + adresse de suivi des réponses" : "") +
    "<br><b>Objet :</b> " + E.esc($("in-objet").value.trim() || "(vide)") +
    (PIECES.length ? "<br><b>Pièces jointes :</b> " + E.esc(PIECES.map(function (p) { return p.nom; }).join(", ")) : "");
  var lt = c.entite !== "asbl", img = "../../assets/email/";
  var embleme = '<img class="mp-emb" src="' + img + (lt ? 'entete-lieutenance.png" width="34' : 'entete-asbl.png" width="46') + '" height="43" alt="">';
  var croix = lt ? '<img class="mp-croix" src="' + img + 'croix-signature.png" width="14" height="13" alt="">' : "";
  var ligne = c.ligneFonction || c.signature;
  $("apercu").innerHTML = '<div class="mp-box"><div class="mp-head">' + embleme + '<div><div class="mp-ordre">Ordre Équestre du Saint-Sépulcre de Jérusalem</div><div class="mp-ent">' + E.esc(c.entiteNom) + "</div></div></div>" +
    '<div class="mp-body">' + paras + '</div><div class="mp-sig"><div class="mp-nom">' + croix + "<strong>" + E.esc((D && D.signataire) || u.signature || u.nom) + "</strong></div><div class=\"mp-fn\">" + E.esc(ligne) +
    "<br>" + E.esc(c.ligneOrdre || "de l’Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH)") + "<br><a href=\"mailto:" + E.esc(repondre()) + "\">" + E.esc(repondre()) + "</a></div></div>" +
    '<div class="mp-foot">' + (D && D.suivi ? PIED_SUIVI : "Pour répondre, utilisez simplement « Répondre » : votre message parviendra directement à son auteur.") + '</div></div>';
}

/* ── Essai et envoi ── */
function etat(txt, ok) { var el = $("etat"); el.textContent = txt; el.className = "etat visible " + (ok ? "ok" : "ko"); }
function demande() { return { casquette: $("in-casq").value, repondreA: repondre(), objet: $("in-objet").value.trim(), corps: $("in-corps").value, pieces: PIECES.map(function (p) { return p.id; }), evenement: evtChoisi() }; }

$("btn-essai").addEventListener("click", function () {
  var b = this, f = empreinte();
  b.disabled = true; b.textContent = "Envoi de l’essai…";
  E.api("mail.essai", Object.assign(demande(), { apercu: $("in-apercu").value })).then(function (r) {
    essaiOk = f;
    etat("Essai envoyé à " + r.envoyeA + ". Vérifiez-le dans votre boîte, puis envoyez.", true);
    rafraichirHistorique();
  }).catch(function (e) { etat(e && e.message || "L’essai n’a pas pu partir.", false); })
    .then(function () { b.textContent = "Envoyer un essai à moi-même"; maj(); });
});

$("btn-envoyer").addEventListener("click", function () {
  var b = this, c = casq();
  var ids = Object.keys(choisis), avec = ids.filter(function (id) { return !MEMBRES[id].sansCourriel; }).length;
  if (!confirm("Vous allez envoyer ce courriel à " + avec + " personne" + (avec > 1 ? "s" : "") + ", en qualité de " + c.signature + " (" + c.entiteNom + ")" + (PIECES.length ? ", avec " + PIECES.length + " pièce" + (PIECES.length > 1 ? "s jointes" : " jointe") : "") + ".\n\nConfirmer l’envoi ?")) return;
  var groupes = D.groupes.filter(function (g) { return groupesCoches[g.id]; }).map(function (g) { return g.nom; });
  b.disabled = true; b.textContent = "Envoi en cours…";
  E.api("mail.envoyer", Object.assign(demande(), { ids: ids, groupes: groupes.length ? groupes : ["sélection individuelle"] })).then(function (r) {
    var txt = "Courriel envoyé à " + r.envoyes + " personne" + (r.envoyes > 1 ? "s" : "") + ".";
    if (r.erreurs && r.erreurs.length) txt += " Échec pour : " + r.erreurs.join(", ") + ".";
    if (r.sansCourriel && r.sansCourriel.length) txt += " À prévenir par la poste : " + r.sansCourriel.join(", ") + ".";
    if (r.pjSupprimees) { txt += " Pièces jointes retirées du Drive."; PIECES = []; dessinerPieces(); }
    etat(txt, !(r.erreurs && r.erreurs.length));
    essaiOk = "";
    rafraichirHistorique();
  }).catch(function (e) { etat(e && e.message || "L’envoi a échoué.", false); })
    .then(function () { maj(); });
});

/* ── Pièces jointes : déposées sur le serveur dès qu'elles sont choisies ── */
var PJ_EXT = /\.(pdf|jpe?g|png|docx?|xlsx?)$/i, PJ_MAX = 10 * 1024 * 1024, PJ_NB_MAX = 5;
var pjEnCours = 0;
function taille(o) { return o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + " Ko" : (o / 1024 / 1024).toFixed(1).replace(".", ",") + " Mo"; }
function dessinerPieces() {
  $("pj-liste").innerHTML = PIECES.map(function (p, i) {
    return '<li><span class="pj-nom">' + E.esc(p.nom) + '</span><span class="pj-taille">' + taille(p.taille) + '</span>' +
      '<button type="button" data-retirer="' + i + '" title="Retirer" aria-label="Retirer ' + E.esc(p.nom) + '">×</button></li>';
  }).join("") + (pjEnCours ? '<li class="encours">Envoi de ' + pjEnCours + " fichier" + (pjEnCours > 1 ? "s" : "") + "…</li>" : "");
  $("btn-pj").disabled = pjEnCours > 0 || PIECES.length >= PJ_NB_MAX;
}
function lireBase64(fichier) {
  return new Promise(function (ok, ko) {
    var r = new FileReader();
    r.onload = function () { ok(String(r.result).split(",")[1] || ""); };
    r.onerror = function () { ko({ message: "Impossible de lire « " + fichier.name + " »." }); };
    r.readAsDataURL(fichier);
  });
}
$("btn-pj").addEventListener("click", function () { $("in-pj").click(); });
$("in-pj").addEventListener("change", function () {
  var fichiers = Array.prototype.slice.call(this.files || []);
  this.value = "";
  var total = PIECES.reduce(function (t, p) { return t + p.taille; }, 0);
  var refus = [];
  fichiers = fichiers.filter(function (f) {
    if (!PJ_EXT.test(f.name)) { refus.push("« " + f.name + " » : type non accepté"); return false; }
    if (PIECES.length + pjEnCours + 1 > PJ_NB_MAX) { refus.push("« " + f.name + " » : 5 fichiers au maximum"); return false; }
    if (total + f.size > PJ_MAX) { refus.push("« " + f.name + " » : 10 Mo au total dépassés"); return false; }
    total += f.size; pjEnCours++;
    return true;
  });
  if (refus.length) etat("Fichier non ajouté : " + refus.join(" ; ") + ".", false);
  dessinerPieces();
  fichiers.forEach(function (f) {
    lireBase64(f).then(function (b64) { return E.api("mail.joindre", { nom: f.name, contenu: b64 }); })
      .then(function (r) { PIECES.push({ id: r.id, nom: r.nom, taille: r.taille }); })
      .catch(function (e) { etat(e && e.message || "Le fichier « " + f.name + " » n’a pas pu être joint.", false); })
      .then(function () { pjEnCours--; dessinerPieces(); maj(); });
  });
});
$("pj-liste").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-retirer]");
  if (!b) return;
  PIECES.splice(Number(b.dataset.retirer), 1);
  dessinerPieces(); maj();
});

/* ── Journal et suivi des réponses ── */
function dateLongue(ts) { return ts ? new Date(ts).toLocaleDateString("fr-LU", { day: "numeric", month: "long", year: "numeric" }) : ""; }
function dateCourte(ts) { return ts ? new Date(ts).toLocaleString("fr-LU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }
function dessinerHistorique() {
  var h = D.historique || [];
  $("historique").innerHTML = h.length ? h.map(function (x) {
    var insc = x.id && x.insc ? ' · <button type="button" class="h-insc" data-envoi="' + E.esc(x.id) + '" aria-expanded="false">' + E.esc(resumeInsc(x.insc, x.nb)) + "</button>" : "";
    var suivi = x.id ? ' · <button type="button" class="h-rep" data-envoi="' + E.esc(x.id) + '" aria-expanded="false">' +
      (x.efface ? "réponses effacées le " + dateLongue(x.expire) : x.reponses + " réponse" + (x.reponses > 1 ? "s" : "")) + "</button>" +
      (x.efface || !x.expire ? "" : ' <span class="h-exp">· conservées ici jusqu’au ' + E.esc(dateLongue(x.expire)) + "</span>") : "";
    return "<li>" + E.esc(x.objet) + '<div class="h-meta">' + E.esc(dateCourte(x.ts)) + " · " + E.esc(x.qui) + " · " +
      (x.type === "essai" ? "essai" : E.esc(x.nb + " destinataire" + (x.nb > 1 ? "s" : "") + (x.groupes ? " · " + x.groupes : ""))) +
      (x.erreurs ? " · échecs : " + E.esc(x.erreurs) : "") + insc + suivi + "</div>" +
      (x.id ? '<div class="h-detail" id="rep-' + E.esc(x.id) + '" hidden></div>' : "") + "</li>";
  }).join("") : '<li class="h-meta">Aucun envoi pour le moment.</li>';
}
function rafraichirHistorique() {
  E.api("mail.charger").then(function (r) { D.historique = r.historique; dessinerHistorique(); }).catch(function () {});
}
function chargerReponses(id, actualiser) {
  var box = $("rep-" + id);
  box.hidden = false;
  box.innerHTML = '<div class="h-meta">Chargement des réponses…</div>';
  E.api("mail.reponses", { id: id, actualiser: !!actualiser }).then(function (r) {
    var rep = r.reponses || [];
    var html = rep.length ? '<ul class="rep-liste">' + rep.map(function (x, i) {
      var court = x.texte.replace(/\s+/g, " ").slice(0, 140);
      return '<li><button type="button" class="rep-tete" data-rep="' + i + '"><span class="rep-nom">' + E.esc(x.nom) + '</span><span class="rep-date">' + E.esc(dateCourte(x.ts)) + "</span>" +
        '<span class="rep-extrait">' + E.esc(court) + (x.texte.length > 140 ? "…" : "") + '</span></button><div class="rep-texte" hidden>' + E.esc(x.texte).replace(/\n/g, "<br>") + "</div></li>";
    }).join("") + "</ul>" : '<div class="h-meta">' + (r.efface ? "Les réponses à cet envoi ont été effacées le " + E.esc(dateLongue(r.expire)) + "." : "Aucune réponse pour le moment.") + "</div>";
    if (r.sansReponse && r.sansReponse.length && !r.efface) html += '<div class="rep-sans"><b>Sans réponse (' + r.sansReponse.length + ') :</b> ' + E.esc(r.sansReponse.join(", ")) + "</div>";
    var boite = r.repondreA ? "la boîte " + E.esc(r.repondreA) : "la boîte mail de votre fonction";
    html += '<div class="rep-note">' + (r.efface ? "Elles restent disponibles dans " + boite + "." :
      "Ces réponses sont conservées ici jusqu’au " + E.esc(dateLongue(r.expire)) + ". Après cette date, elles restent disponibles dans " + boite + ".") + "</div>";
    html += '<button type="button" class="rep-maj" data-maj="' + E.esc(id) + '">Actualiser</button>';
    box.innerHTML = html;
  }).catch(function (e) { box.innerHTML = '<div class="h-meta">' + E.esc(e && e.message || "Réponses indisponibles.") + "</div>"; });
}
$("historique").addEventListener("click", function (ev) {
  var b = ev.target.closest(".h-rep");
  if (b) {
    var box = $("rep-" + b.dataset.envoi), ouvert = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", ouvert ? "false" : "true");
    if (ouvert) { box.hidden = true; return; }
    chargerReponses(b.dataset.envoi, false);
    return;
  }
  var m = ev.target.closest("[data-maj]");
  if (m) { chargerReponses(m.dataset.maj, true); return; }
  var t = ev.target.closest(".rep-tete");
  if (t) { var tx = t.nextElementSibling; tx.hidden = !tx.hidden; t.classList.toggle("ouvert", !tx.hidden); }
});

/* ── Invitation à un événement du calendrier ── */
var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function dateEvt(iso) { var p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); return JOURS[d.getUTCDay()] + " " + p[2] + (p[2] === 1 ? "er" : "") + " " + MOIS[p[1] - 1] + " " + p[0]; }
function quandEvt(e) {   // même texte que quandEvt_ dans Code.gs
  if (e.fin && e.fin > e.date) {
    var a = e.date.split("-"), b = e.fin.split("-");
    var debut = a[0] === b[0] && a[1] === b[1] ? dateEvt(e.date).replace(/ [^ ]+ \d{4}$/, "") : a[0] === b[0] ? dateEvt(e.date).replace(/ \d{4}$/, "") : dateEvt(e.date);
    return "du " + debut + " au " + dateEvt(e.fin) + (e.heure ? ", dès " + e.heure.replace(/^0/, "").replace(":", "h") : "") + (e.lieu ? ", " + e.lieu : "");
  }
  return dateEvt(e.date) + (e.heure ? " à " + e.heure.replace(/^0/, "").replace(":", "h") : "") + (e.lieu ? ", " + e.lieu : "");
}
function remplirEvenements(choisir) {
  $("in-evt").innerHTML = '<option value="">Aucune : simple courriel</option>' +
    EVTS.map(function (e) { return '<option value="' + E.esc(e.id) + '">' + E.esc(dateEvt(e.date) + " · " + e.titre) + (e.publie === false ? " (non publié)" : "") + "</option>"; }).join("") +
    '<option value="__nouveau">+ Créer un nouvel événement…</option>';
  if (choisir) $("in-evt").value = choisir;
}
function chargerEvenements() {
  E.api("mail.evenements").then(function (r) { EVTS = r.evenements || []; remplirEvenements($("in-evt").value); })
    .catch(function () { remplirEvenements(); });
}
/* Texte d'invitation proposé dès qu'un événement est choisi (si l'objet et le message sont vides ou encore ceux proposés) */
var AUTO = { objet: "", corps: "" };
function proposerTexte(ev) {
  var o = $("in-objet").value.trim(), c = $("in-corps").value.trim();
  var libre = (!o || o === AUTO.objet) && (!c || c === AUTO.corps);
  if (!libre || !ev) return;
  AUTO.objet = "Invitation - " + ev.titre;
  AUTO.corps = "{appel}\n\nJ’ai l’honneur de vous inviter à : **" + ev.titre + "**, le " + quandEvt(ev) + "." +
    (ev.repas ? " Un repas suivra" + (ev.repas.lieu ? " (" + ev.repas.lieu + (ev.repas.heure ? ", " + ev.repas.heure.replace(":", "h") : "") + ")" : "") + " : merci d’indiquer qui y participera." : "") + "\n\n" +
    "Nous serions heureux de vous compter parmi nous. Je vous remercie de bien vouloir nous indiquer votre présence d’un simple clic, à l’aide des boutons ci-dessous.\n\n{politesse}";
  $("in-objet").value = AUTO.objet; $("in-corps").value = AUTO.corps;
  $("in-modele").value = "";
}
function majRepas() {
  var ev = EVTS.filter(function (x) { return x.id === $("in-evt").value; })[0];
  $("evt-repas").hidden = !ev;
  $("evt-heberg").hidden = !ev;
  $("hb-champs").hidden = !$("hb-actif").checked;
  if (ev) $("ev-limite").max = ev.date;
  $("rp-champs").hidden = !$("rp-actif").checked;
  if (ev && !$("rp-limite").value) $("rp-limite").value = decaler(ev.date, -3);
  if (ev) $("rp-limite").max = ev.date;
}
$("in-evt").addEventListener("change", function () {
  $("evt-nouveau").hidden = this.value !== "__nouveau";
  $("rp-limite").value = "";
  $("ev-limite").value = "";
  majRepas();
  proposerTexte(evtChoisi());
  maj();
});
["rp-actif", "rp-lieu", "rp-heure", "rp-prix", "rp-limite", "rp-note", "ev-limite", "ev-accomp", "ev-engage", "hb-actif", "hb-lieu", "hb-nuit", "hb-simple", "hb-double", "hb-note"].forEach(function (id) {
  $(id).addEventListener(id === "rp-actif" || id === "hb-actif" || id === "ev-limite" || id === "ev-accomp" ? "change" : "input", function () { majRepas(); proposerTexte(evtChoisi()); maj(); });
});
$("btn-evt-creer").addEventListener("click", function () {
  var b = this;
  var d = { date: $("ev-date").value, heure: $("ev-heure").value, titre: $("ev-titre").value.trim(), lieu: $("ev-lieu").value.trim(), publier: $("ev-publier").checked };
  if (!d.date || !d.titre) { etat("Indiquez au moins la date et le titre de l’événement.", false); return; }
  b.disabled = true; b.textContent = "Création…";
  E.api("mail.creerEvenement", d).then(function (r) {
    EVTS.push(r.evenement);
    EVTS.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    remplirEvenements(r.evenement.id);
    $("evt-nouveau").hidden = true;
    $("rp-limite").value = "";
    majRepas();
    proposerTexte(r.evenement);
    etat("Événement créé" + (r.evenement.publie ? " et ajouté au calendrier du site." : " (non publié sur le site).") + " Il est joint à ce courriel.", true);
    maj();
  }).catch(function (e) { etat(e && e.message || "L’événement n’a pas pu être créé.", false); })
    .then(function () { b.disabled = false; b.textContent = "Créer l'événement"; });
});

/* ── Inscriptions : tableau de bord de l'auteur ── */
function resumeInsc(s, nb) {
  var total = s.total || nb;
  return s.oui + " inscrit" + (s.oui > 1 ? "s" : "") + (s.personnes > s.oui ? " (" + s.personnes + " personnes)" : "") + (s.repas ? " · repas : " + (s.couverts || 0) + " couvert" + (s.couverts > 1 ? "s" : "") : "") + (s.heberg ? " · chambres : " + (s.simples || 0) + " ind., " + (s.doubles || 0) + " doubles" : "") + " · " + s.non + " ne vien" + (s.non > 1 ? "nent" : "t") + " pas · " + s.sans + " sans réponse · sur " + total;
}
function chargerInscriptions(id) {
  var box = $("rep-" + id);
  box.hidden = false;
  box.innerHTML = '<div class="h-meta">Chargement des inscriptions…</div>';
  E.api("mail.inscriptions", { id: id }).then(function (r) {
    var html = '<div class="insc-kpi"><div><b>' + r.oui.length + "</b>inscrits</div><div><b>" + r.personnes + "</b>personnes attendues</div><div><b>" + r.non.length + "</b>ne viennent pas</div><div><b>" + r.sans.length + "</b>sans réponse</div><div><b>" + r.total + "</b>invités</div>" +
      (r.evenement && r.evenement.repas ? "<div><b>" + r.couverts + "</b>couverts au repas" + (r.montant != null ? " · " + r.montant + " €" : "") + "</div>" : "") +
      (r.hebergement ? "<div><b>" + r.hebergement.simples + "</b>chambres individuelles</div><div><b>" + r.hebergement.doubles + "</b>chambres doubles" + (r.hebergement.montant ? " · " + r.hebergement.montant + " € au total" : "") + "</div><div><b>" + r.hebergement.sansNuitee + "</b>sans nuitée</div>" : "") + "</div>" +
      (r.hebergement && r.hebergement.seuls && r.hebergement.seuls.length ? '<div class="insc-liste"><b>À vérifier :</b> chambre double sans partenaire inscrit pour ' + E.esc(r.hebergement.seuls.join(", ")) + "</div>" : "");
    if (r.evenement) html += '<div class="h-meta">' + E.esc(r.evenement.titre + " · " + quandEvt(r.evenement)) + (r.evenement.limite ? " · réponses " + (r.limitePassee ? "closes depuis le " : "jusqu’au ") + E.esc(dateEvt(r.evenement.limite)) : "") + "</div>";
    if (r.hebergement) {
      // Une ligne par réponse : qui, avec qui, chambre de chacun, remarque
      html += '<div class="insc-liste"><b>Inscrits :</b>' + (r.oui.length ? "<ul class=\"insc-det\">" + r.oui.map(function (x) {
        var ch = Object.keys(x.chambres || {}).map(function (n) { return E.esc(n) + " : " + E.esc(CHAMBRES[x.chambres[n]] || x.chambres[n]); }).join(" · ");
        return "<li><b>" + E.esc(x.nom) + "</b>" + (x.accompagnants ? " + " + E.esc(x.noms.join(", ")) : "") + (ch ? "<br><small>" + ch + (x.partage ? " · partagée avec " + E.esc(x.partage) : "") + "</small>" : "") + (x.remarque ? "<br><small><em>" + E.esc(x.remarque) + "</em></small>" : "") + "</li>";
      }).join("") + "</ul>" : " aucun pour le moment") + "</div>";
    } else html += '<div class="insc-liste"><b>Inscrits :</b> ' + (r.oui.length ? r.oui.map(function (x) { return E.esc(x.nom) + (x.accompagnants ? " <small>+ " + E.esc(x.noms.join(", ")) + "</small>" : "") + (x.remarque ? " <small><em>(" + E.esc(x.remarque) + ")</em></small>" : ""); }).join(" ; ") : "aucun pour le moment") + "</div>";
    if (r.evenement && r.evenement.repas) {
      var conv = [];
      r.oui.forEach(function (x) { x.repas.forEach(function (n) { conv.push(n === x.nom ? n : n + " (avec " + x.nom + ")"); }); });
      html += '<div class="insc-liste"><b>' + E.esc(repasTxt(r.evenement.repas)) + " :</b> " + (conv.length ? E.esc(conv.join(", ")) : "aucun couvert pour le moment") +
        ' <small>· inscriptions ' + (r.repasFerme ? "closes" : "jusqu’au " + E.esc(dateEvt(r.evenement.repas.limite))) + "</small></div>";
    }
    if (r.non.length) html += '<div class="insc-liste"><b>Ne viennent pas :</b> ' + E.esc(r.non.join(", ")) + "</div>";
    if (r.sans.length) html += '<div class="insc-liste"><b>Sans réponse :</b> ' + E.esc(r.sans.join(", ")) + "</div>";
    html += '<button type="button" class="rep-maj" data-insc-maj="' + E.esc(id) + '">Actualiser</button>';
    if (r.evenement) {
      // Liste imprimable : regroupe tous les envois récents rattachés au même événement
      var ids = ((D && D.historique) || []).filter(function (h) { return h.id && h.evenement && h.evenement.id === r.evenement.id; }).map(function (h) { return h.id; });
      if (ids.indexOf(id) < 0) ids.unshift(id);
      html += ' <a class="rep-maj" target="_blank" rel="noopener" href="liste.html?ids=' + encodeURIComponent(ids.join(",")) + '">Liste imprimable</a>';
      html += ' <a class="rep-maj" target="_blank" rel="noopener" href="ceremonial.html?ids=' + encodeURIComponent(ids.join(",")) + '">Placement et procession</a>';
    }
    box.innerHTML = html;
  }).catch(function (e) { box.innerHTML = '<div class="h-meta">' + E.esc(e && e.message || "Inscriptions indisponibles.") + "</div>"; });
}
$("historique").addEventListener("click", function (ev) {
  var b = ev.target.closest(".h-insc");
  if (b) {
    var ouvert = b.getAttribute("aria-expanded") === "true";
    document.querySelectorAll(".h-rep,.h-insc").forEach(function (x) { if (x.dataset.envoi === b.dataset.envoi) x.setAttribute("aria-expanded", "false"); });
    if (ouvert) { $("rep-" + b.dataset.envoi).hidden = true; return; }
    b.setAttribute("aria-expanded", "true");
    chargerInscriptions(b.dataset.envoi);
    return;
  }
  var m = ev.target.closest("[data-insc-maj]");
  if (m) chargerInscriptions(m.dataset.inscMaj);
});

/* ── Aide à la rédaction (charte OESSH) ── */
var CHARTE = "Règles de la Lieutenance : sigle OESSH ; « Lieutenance pour le Luxembourg » ; majuscules à Le Lieutenant, Le Chancelier, Le Secrétaire, Chevaliers et Dames ; " +
  "guillemets « » et apostrophes courbes ; JAMAIS de tiret long (—) ni demi-cadratin (–), uniquement le tiret court (-) ; pas d’anglicismes ni de superlatifs ; registre digne et fraternel. " +
  "Le message commence par la ligne {appel} et se termine par la ligne {politesse}, à laisser tels quels : ils sont remplacés pour chaque destinataire par la formule d’appel et la formule de politesse qui correspondent à sa qualité (Excellence, Monsieur l’Abbé, Cher Confrère, Madame…). " +
  "N’écris donc AUCUNE formule d’appel ni AUCUNE formule de politesse toi-même, et jamais de choix entre crochets comme [Chevalier / Dame] ; si le texte contient déjà une formule de politesse, remplace-la par {politesse}. Ne mets ni signature ni nom à la fin ; " +
  "laisse intactes les mentions entre crochets [..] qui restent à compléter, et vérifie que les jours de la semaine correspondent aux dates. " +
  "Mise en forme : garde les listes (lignes commençant par « - ») et le gras écrit **ainsi** ; n’utilise aucune autre mise en forme (pas de titres #, pas d’italique).";
var SORTIE = "\nRéponds UNIQUEMENT dans ce format :\n###OBJET###\n(objet)\n###CORPS###\n(message)\n###REMARQUES###\n(remarques pour l’auteur, une par ligne, ou rien)\n###FIN###";

function ia(mode) {
  var objet = $("in-objet").value.trim(), corps = $("in-corps").value.trim(), c = casq();
  if (!corps) { etat("Écrivez d’abord un message.", false); return; }
  var systeme = mode === "corriger"
    ? "Tu es correcteur pour l’Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH), Lieutenance pour le Luxembourg. Corrige UNIQUEMENT l’orthographe, la grammaire, la ponctuation et la typographie de l’objet et du message, sans changer le style ni le contenu. " + CHARTE + SORTIE
    : "Tu es rédacteur de la Lieutenance pour le Luxembourg de l’Ordre Équestre du Saint-Sépulcre de Jérusalem (OESSH). Améliore l’objet et le message d’un courriel adressé à plusieurs membres, en français soutenu mais accessible, sans rien inventer. L’auteur écrit en qualité de : " + (c ? c.titre + ", " + c.entiteNom : "membre du Conseil") + ". " + CHARTE + SORTIE;
  ["btn-corriger", "btn-ameliorer"].forEach(function (id) { $(id).disabled = true; });
  etat(mode === "corriger" ? "Correction en cours…" : "Amélioration en cours…", true);
  E.api("pub.claude", { corps: { system: systeme, max_tokens: 3000, messages: [{ role: "user", content: "OBJET :\n" + (objet || "(vide)") + "\n\nMESSAGE :\n" + corps }] } })
    .then(function (r) {
      var txt = r && r.data && r.data.content && r.data.content[0] && r.data.content[0].text || "";
      var pick = function (k) { var m = txt.match(new RegExp("###" + k + "###\\s*([\\s\\S]*?)(?=###[A-Z]+###|$)")); return m ? m[1].trim() : ""; };
      var o = pick("OBJET"), b = pick("CORPS"), rem = pick("REMARQUES");
      if (!b) throw new Error("Réponse inattendue du service de rédaction.");
      if (o) $("in-objet").value = o.replace(/[–—]/g, "-");
      $("in-corps").value = b.replace(/[–—]/g, "-");
      var lignes = rem.split("\n").map(function (x) { return x.replace(/^[-•*]\s*/, "").trim(); }).filter(Boolean);
      $("ia-remarques").innerHTML = lignes.length ? "<strong>Remarques</strong><ul>" + lignes.map(function (l) { return "<li>" + E.esc(l) + "</li>"; }).join("") + "</ul>" : "";
      $("ia-remarques").classList.toggle("visible", lignes.length > 0);
      etat(mode === "corriger" ? "Texte corrigé. Relisez-le avant l’essai." : "Texte amélioré. Relisez-le avant l’essai.", true);
      maj();
    })
    .catch(function (e) { etat(e && e.message || "Le service de rédaction n’a pas répondu.", false); })
    .then(function () { ["btn-corriger", "btn-ameliorer"].forEach(function (id) { $(id).disabled = false; }); });
}
$("btn-corriger").addEventListener("click", function () { ia("corriger"); });
$("btn-ameliorer").addEventListener("click", function () { ia("ameliorer"); });
})();
