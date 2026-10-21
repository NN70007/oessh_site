/*
 * Pont entre l'admin de publication et l'espace membres.
 * - La connexion se fait par l'espace membres (Google ou code e-mail) ; plus de liste d'adresses dans le code.
 * - Plus aucune clé dans le navigateur : les appels à GitHub et à Claude passent par le script Google,
 *   qui vérifie les droits de la personne (Actualités / Lectures / Newsletter) avant chaque publication.
 * Ce fichier est chargé APRÈS le script principal de l'admin et remplace quelques-unes de ses fonctions.
 */
(function () {
  "use strict";
  var E = window.Espace;
  if (!E) return;

  /* ---------- Réponses au format fetch ---------- */
  function reponse(status, data) {
    return new Response(typeof data === "string" ? data : JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json" } });
  }
  var GITHUB_RE = /^https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+\/contents\/([^?#]+)/;
  var fetchOrigine = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    init = init || {};
    var m = url.match(GITHUB_RE);
    if (m) {
      var corps = null;
      try { corps = init.body ? JSON.parse(init.body) : null; } catch (e) { corps = null; }
      try {
        var out = await E.api("pub.github", { methode: (init.method || "GET").toUpperCase(), chemin: decodeURIComponent(m[1]), corps: corps });
        return reponse(out.status, out.data);
      } catch (e) {
        return reponse(e.code === "droits" ? 403 : 500, { message: e.message });
      }
    }
    if (url.indexOf("https://api.anthropic.com/") === 0) {
      var b = {};
      try { b = JSON.parse(init.body || "{}"); } catch (e) {}
      try {
        var o = await E.api("pub.claude", { corps: { system: b.system, messages: b.messages, max_tokens: b.max_tokens, tache: b.tache } });
        return reponse(o.status, o.data);
      } catch (e) {
        return reponse(500, { error: { message: e.message } });
      }
    }
    return fetchOrigine(input, init);
  };

  /* ---------- Fonctions de l'admin remplacées ---------- */
  window.getSettings = function () { return { claudeKey: "serveur", githubToken: "serveur", repo: "NN70007/oessh_site" }; };
  window.hasSettings = function () { return true; };
  window.showSetup = function () {};
  window.onGoogleLogin = function () {};
  // L'ancien indicateur « qui est connecté » écrivait l'adresse e-mail dans un fichier public du dépôt : supprimé.
  window.sessionStart = window.sessionWrite = window.sessionRead = window.sessionEnd = function () {};
  window.logout = function () { E.logout(); };

  /* ---------- Démarrage ---------- */
  var droitsOnglets = {};
  function appliquerDroits(u) {
    var d = (u && u.site) || {};
    droitsOnglets = { "new": !!d.actualites, articles: !!d.actualites, lectures: !!d.lectures, newsletters: !!d.newsletter, calendrier: !!d.actualites, "export": !!(d.newsletter || d.actualites), config: false };
    Object.keys(droitsOnglets).forEach(function (k) {
      var b = document.getElementById("tab-" + k);
      if (b) b.style.display = droitsOnglets[k] ? "" : "none";
      document.querySelectorAll('#mobile-menu [onclick*="showTab(\'' + k + '\')"]').forEach(function (x) { x.style.display = droitsOnglets[k] ? "" : "none"; });
    });
    document.querySelectorAll('[onclick="showSetup()"]').forEach(function (x) { x.style.display = "none"; });
    var tu = document.getElementById("tb-user"); if (tu) tu.textContent = u.nom;
  }

  var showTabOrigine = window.showTab;
  window.showTab = function (t) {
    if (droitsOnglets[t] === false) return;
    return showTabOrigine(t);
  };

  function ecranSansAcces(message) {
    var login = document.getElementById("login-screen");
    document.getElementById("app").style.display = "none";
    var setup = document.getElementById("setup-screen"); if (setup) setup.style.display = "none";
    login.innerHTML =
      '<div class="login-card" style="max-width:460px;text-align:left">' +
      '<h2>Édition du site</h2>' +
      '<p>' + E.esc(message) + '</p>' +
      '<p style="margin-top:18px"><a href="../" style="display:inline-block;background:#b10103;color:#fff;padding:11px 20px;border-radius:2px;text-decoration:none;font-weight:500">Aller à l’espace membres →</a></p>' +
      '</div>';
    login.style.display = "flex";
  }

  function demarrer() {
    // Le pont est aussi chargé par l'outil courrier (pour l'IA) : l'écran de l'admin n'y existe pas.
    if (!document.getElementById("app")) return;
    var s = E.getSession(), u = s && s.user;
    if (!u) { ecranSansAcces("Connectez-vous d’abord à l’espace membres de la Lieutenance, avec votre compte Google ou un code reçu par e-mail."); return; }
    var d = u.site || {};
    if (!(d.actualites || d.lectures || d.newsletter)) { ecranSansAcces("Votre accès ne comprend pas l’édition du site. Le secrétariat peut vous l’ouvrir depuis la page Accès."); return; }
    document.getElementById("login-screen").style.display = "none";
    var setup = document.getElementById("setup-screen"); if (setup) setup.style.display = "none";
    document.getElementById("app").style.display = "block";
    appliquerDroits(u);
    var premier = ["articles", "lectures", "calendrier", "newsletters"].filter(function (k) { return droitsOnglets[k]; })[0];
    if (premier) showTabOrigine(premier);
    // Droits à jour depuis le serveur (un accès retiré est appliqué immédiatement).
    E.api("moi").then(function (out) { appliquerDroits(out.user); var d2 = out.user.site || {}; if (!(d2.actualites || d2.lectures || d2.newsletter || d2.calendrier)) ecranSansAcces("Votre accès à l’édition du site a été retiré."); })
      .catch(function (e) { if (e && e.code === "session") ecranSansAcces("Votre session a expiré. Reconnectez-vous à l’espace membres."); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
