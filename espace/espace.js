/* Espace membres OESSH — fonctions communes (session, appels au serveur, en-tête, pied de page). */
(function () {
  "use strict";
  var CFG = window.ESPACE_CONFIG || {};
  var KEY = "oessh_espace_session";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && s.token && s.expire > Date.now()) return s;
    } catch (e) {}
    return null;
  }
  function setSession(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /** Appel au serveur. Rejette avec {message, code}. */
  async function api(action, data) {
    if (!CFG.API_URL) throw { message: "Le serveur n'est pas encore configuré (adresse manquante dans espace/config.js).", code: "config" };
    var body = Object.assign({ action: action }, data || {});
    var s = getSession();
    if (s && !body.token) body.token = s.token;
    var res;
    try {
      res = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" });
    } catch (e) {
      throw { message: "Impossible de joindre le serveur. Vérifiez votre connexion internet.", code: "reseau" };
    }
    var out;
    try { out = await res.json(); } catch (e) { throw { message: "Réponse inattendue du serveur.", code: "serveur" }; }
    if (!out.ok) {
      if (out.code === "session") { clearSession(); if (!/\/espace\/?(index\.html)?$/.test(location.pathname)) { location.href = "./?expire=1"; } }
      throw { message: out.error || "Erreur.", code: out.code };
    }
    if (out.user && s) { s.user = out.user; setSession(s); }
    return out;
  }

  function requireLogin() {
    var s = getSession();
    if (!s) { location.replace("./"); return null; }
    return s;
  }

  async function logout() {
    try { await api("auth.deconnexion"); } catch (e) {}
    clearSession();
    location.href = "./";
  }

  function cross() { return '<img class="cross" src="../assets/croix-jerusalem.svg" alt="Croix de Jérusalem">'; }

  function dateTopbar() {
    var d = new Date();
    var j = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
    var m = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
    return j[d.getDay()] + " " + d.getDate() + " " + m[d.getMonth()] + " " + d.getFullYear();
  }

  /** Liens de navigation entre pages, selon les droits. */
  function pageLinks(user, active) {
    var L = [{ k: "accueil", href: "./", t: "Accueil" }];
    if (user && user.inv) L.push({ k: "investiture", href: "investiture.html", t: "Investiture 2027" });
    if (user && user.gestion) L.push({ k: "acces", href: "acces.html", t: "Accès" });
    if (user && user.site && (user.site.actualites || user.site.lectures || user.site.newsletter)) L.push({ k: "site", href: "../admin/", t: "Administration du site ↗" });
    return L.map(function (l) { return '<a class="nav-tab' + (l.k === active ? " active" : "") + '" href="' + l.href + '">' + esc(l.t) + "</a>"; }).join("");
  }

  /**
   * Construit topbar + header. opts.tabs : HTML d'onglets à mettre dans la barre (sinon liens de pages).
   * opts.cta : HTML du bouton d'action à droite.
   */
  function renderTop(opts) {
    opts = opts || {};
    var s = getSession(), user = s && s.user;
    var el = document.getElementById("chrome-top");
    var right = user
      ? '<span class="tb-right"><span>' + esc(user.nom) + "</span>" + (opts.tabs ? '<a href="./">Espace membres</a>' : "") + '<button type="button" id="btn-logout">Se déconnecter</button></span>'
      : '<span class="tb-center">Ordre pontifical au service de la Terre Sainte</span>';
    el.innerHTML =
      '<div class="topbar"><div class="topbar-inner"><span class="tb-left"><span class="tb-dot' + (user ? " live" : "") + '"></span><span>' + (user ? "ESPACE MEMBRES" : dateTopbar()) + "</span></span>" + right + "</div></div>" +
      '<header class="site"><nav class="nav" aria-label="Navigation">' +
      '<a class="brand" href="./">' + cross() + '<span class="brand-text"><span class="l1">Ordre Équestre du Saint-Sépulcre de Jérusalem</span><span class="l2">Lieutenance pour le Luxembourg · Espace membres</span></span></a>' +
      '<div class="nav-cta">' + (opts.cta || "") + "</div>" +
      (user ? '<div class="nav-links" role="tablist">' + (opts.tabs || pageLinks(user, opts.active)) + "</div>" : "") +
      "</nav></header>";
    var b = document.getElementById("btn-logout");
    if (b) b.addEventListener("click", logout);
  }

  function renderFoot() {
    var el = document.getElementById("chrome-foot");
    if (!el) return;
    el.innerHTML =
      '<footer class="site"><div class="container"><div class="foot-top"><div class="brand">' + cross().replace('alt="Croix de Jérusalem"', 'alt=""') +
      '<span class="brand-text"><span class="l1">Ordre Équestre du Saint-Sépulcre de Jérusalem</span><span class="l2">Lieutenance pour le Luxembourg</span></span></div>' +
      '<a href="../" style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)">← Site public</a></div>' +
      '<div class="foot-bottom"><div>© ' + new Date().getFullYear() + " OESSH · Lieutenance pour le Luxembourg</div><div>Espace réservé · données privées</div></div></div></footer>";
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  window.Espace = { CFG: CFG, esc: esc, api: api, getSession: getSession, setSession: setSession, clearSession: clearSession, requireLogin: requireLogin, logout: logout, renderTop: renderTop, renderFoot: renderFoot, toast: toast };
})();
