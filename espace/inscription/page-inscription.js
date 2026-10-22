/* Réponse à une invitation reçue par le Courrier e-mail.
   Le lien personnel (?t=…) suffit : aucune connexion. La réponse n'est enregistrée qu'au clic sur « Confirmer ». */
(function () {
"use strict";
var CFG = window.ESPACE_CONFIG || {};
var q = new URLSearchParams(location.search);
var T = q.get("t") || "", choix = q.get("r") === "oui" ? "oui" : q.get("r") === "non" ? "non" : "";
var D = null;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

function api(action, data) {
  return fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action: action, t: T }, data || {})), redirect: "follow" })
    .then(function (r) { return r.json(); }, function () { throw { message: "Impossible de joindre le serveur. Vérifiez votre connexion internet." }; })
    .then(function (o) { if (!o.ok) throw { message: o.error || "Erreur." }; return o; });
}

function erreur(msg) { $("contenu").innerHTML = '<div class="in-msg ko">' + esc(msg) + "</div>"; }

function dessiner() {
  var n = D.accompagnants || 0;
  var html = '<p class="eyebrow">Invitation</p><p>Bonjour ' + esc(D.nom) + ",</p>" +
    '<div class="in-evt"><h1>' + esc(D.evenement.titre) + '</h1><div class="q">' + esc(D.quand) + "</div>" +
    (D.repasTexte ? '<div class="q" style="margin-top:8px"><b>' + esc(D.repasTexte) + "</b><br>" + (D.repasFerme ? "Inscriptions au repas closes." : "Inscription au repas jusqu’au " + esc(D.repasLimite) + ".") +
      (D.evenement.repas && D.evenement.repas.note ? "<br><em>" + esc(D.evenement.repas.note) + "</em>" : "") + "</div>" : "") + "</div>";
  if (D.ferme) {
    $("contenu").innerHTML = html + '<div class="in-msg ko">Cet événement est passé : les réponses sont closes.</div>';
    return;
  }
  if (D.reponse) html += '<p class="in-note" style="margin-top:0">Votre réponse actuelle : <b>' + (D.reponse === "oui" ? "vous venez" + (n ? " avec " + n + " accompagnant" + (n > 1 ? "s" : "") : "") : "vous ne venez pas") + "</b>. Vous pouvez la modifier ci-dessous.</p>";
  html += '<div class="in-choix"><button type="button" data-r="oui">Je viendrai</button><button type="button" data-r="non">Je ne viendrai pas</button></div>' +
    '<div id="bloc-oui" hidden><div class="in-champ"><label for="nb">Personnes qui vous accompagnent</label><select id="nb">' +
    Array.from({ length: (D.max || 6) + 1 }, function (_, i) { return '<option value="' + i + '">' + (i ? i + " personne" + (i > 1 ? "s" : "") : "Je viens seul(e)") + "</option>"; }).join("") +
    '</select></div><div id="noms"></div>' +
    (D.repasTexte ? '<div class="in-champ" id="bloc-repas"><label>Qui restera pour le repas ?</label><div id="repas"></div>' +
      (D.repasFerme ? '<p class="in-note" style="margin-top:4px">Les inscriptions au repas sont closes : pour toute modification, contactez l’organisateur en répondant à l’e-mail d’invitation.</p>' : "") + "</div>" : "") +
    '</div>' +
    '<button type="button" class="in-ok" id="ok" disabled>Confirmer ma réponse</button><div class="in-msg" id="msg"></div>' +
    '<p class="in-note">Vous recevrez un rappel la veille si vous venez. Vous pouvez revenir sur cette page à tout moment avec le lien de votre invitation pour changer votre réponse.</p>';
  $("contenu").innerHTML = html;
  var anciens = D.noms || [];
  $("nb").value = String(n);
  function champsNoms() {
    var k = Number($("nb").value), deja = Array.prototype.map.call(document.querySelectorAll("#noms input"), function (i) { return i.value; });
    $("noms").innerHTML = Array.from({ length: k }, function (_, i) {
      var v = deja[i] != null ? deja[i] : (anciens[i] || "");
      return '<div class="in-champ"><label for="p' + i + '">Nom de la personne ' + (i + 1) + '</label><input type="text" id="p' + i + '" maxlength="80" autocomplete="name" value="' + esc(v) + '" placeholder="Prénom et nom"></div>';
    }).join("");
  }
  var repasAvant = D.repas || [];
  function casesRepas() {
    if (!$("repas")) return;
    var coches = {}, deja = document.querySelectorAll("#repas input");
    if (deja.length) Array.prototype.forEach.call(deja, function (c) { coches[c.dataset.i] = c.checked; });
    var noms = [D.nom].concat(Array.prototype.map.call(document.querySelectorAll("#noms input"), function (i) { return i.value.trim(); }));
    $("repas").innerHTML = noms.map(function (nom, i) {
      var c = i in coches ? coches[i] : repasAvant.indexOf(nom) > -1;
      return '<label class="in-case"><input type="checkbox" data-i="' + i + '"' + (c ? " checked" : "") + (D.repasFerme ? " disabled" : "") + "> " +
        esc(i === 0 ? nom + " (vous)" : (nom || "Personne " + i)) + "</label>";
    }).join("");
  }
  function choisir(r) {
    choix = r;
    document.querySelectorAll(".in-choix button").forEach(function (b) { b.classList.toggle("on", b.dataset.r === r); });
    $("bloc-oui").hidden = r !== "oui";
    $("ok").disabled = !r;
  }
  champsNoms();
  casesRepas();
  $("nb").addEventListener("change", function () { champsNoms(); casesRepas(); });
  $("noms").addEventListener("input", casesRepas);
  document.querySelectorAll(".in-choix button").forEach(function (b) { b.addEventListener("click", function () { choisir(b.dataset.r); }); });
  if (choix || D.reponse) choisir(choix || D.reponse);
  $("ok").addEventListener("click", function () {
    var b = this, k = choix === "oui" ? Number($("nb").value) : 0;
    var noms = Array.prototype.map.call(document.querySelectorAll("#noms input"), function (i) { return i.value.trim(); }).slice(0, k);
    var msg = $("msg");
    if (noms.some(function (s) { return !s; })) { msg.className = "in-msg ko"; msg.textContent = "Indiquez le nom de chaque personne qui vous accompagne."; return; }
    b.disabled = true; b.textContent = "Enregistrement…";
    var tous = [D.nom].concat(noms), repas = [];
    document.querySelectorAll("#repas input").forEach(function (c) { if (c.checked && tous[Number(c.dataset.i)]) repas.push(tous[Number(c.dataset.i)]); });
    api("insc.repondre", { reponse: choix, accompagnants: k, noms: noms, repas: repas }).then(function (r) {
      D.reponse = r.reponse; D.accompagnants = r.accompagnants; D.noms = r.noms; D.repas = r.repas || []; repasAvant = D.repas;
      msg.className = "in-msg ok";
      msg.innerHTML = r.reponse === "oui"
        ? "<b>Merci, votre inscription est enregistrée.</b> Nous nous réjouissons de vous accueillir" + (r.accompagnants ? " avec " + esc(r.noms.join(", ")) : "") + " : " + esc(r.quand) + "." +
          (D.repasTexte ? " Repas : " + (r.repas && r.repas.length ? r.repas.length + " couvert" + (r.repas.length > 1 ? "s" : "") + " (" + esc(r.repas.join(", ")) + ")." : "vous n’y participez pas.") : "")
        : "<b>Merci de nous avoir prévenus.</b> Votre réponse est enregistrée.";
    }).catch(function (e) { msg.className = "in-msg ko"; msg.textContent = e && e.message || "La réponse n’a pas pu être enregistrée."; })
      .then(function () { b.disabled = false; b.textContent = "Modifier ma réponse"; });
  });
}

if (!T) erreur("Ce lien est incomplet. Utilisez le bouton reçu dans votre e-mail d’invitation.");
else if (T === "essai") erreur("Ceci est un e-mail d’essai : dans le vrai courriel, ce bouton ouvre la page de réponse personnelle de chaque destinataire.");
else api("insc.lire").then(function (r) { D = r; dessiner(); }).catch(function (e) { erreur(e && e.message || "Invitation introuvable."); });
})();
