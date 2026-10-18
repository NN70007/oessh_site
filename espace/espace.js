/* Espace membres OESSH — fonctions communes (session, appels au serveur, en-tête, pied de page). */
(function () {
  "use strict";
  var CFG = window.ESPACE_CONFIG || {};
  var KEY = "oessh_espace_session";

  /* Racine de l'espace membres (le dossier de ce script), pour que les liens marchent
     depuis n'importe quelle sous-page : /espace/, /espace/courrier/, /espace/admin/… */
  var SCRIPT = document.currentScript;
  var BASE = SCRIPT && SCRIPT.src ? new URL(".", SCRIPT.src).href : location.origin + "/espace/";
  function lien(p) { return new URL(p || "./", BASE).href; }
  function surPageConnexion() {
    var ici = location.href.split(/[?#]/)[0];
    return ici === BASE || ici === BASE + "index.html";
  }

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
      if (out.code === "session") {
        clearSession();
        if (!surPageConnexion()) location.href = lien("./?expire=1");
      }
      throw { message: out.error || "Erreur.", code: out.code };
    }
    if (out.user && s) { s.user = out.user; setSession(s); }
    return out;
  }

  function requireLogin() {
    var s = getSession();
    if (!s) { if (!surPageConnexion()) location.replace(lien("./")); return null; }
    return s;
  }

  async function logout() {
    try { await api("auth.deconnexion"); } catch (e) {}
    clearSession();
    location.href = lien("./");
  }

  function cross() { return '<img class="cross" src="' + lien("../assets/croix-jerusalem-cardinal-liseree.svg") + '" alt="Croix de Jérusalem">'; }

  function dateTopbar() {
    var d = new Date();
    var j = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
    var m = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
    return j[d.getDay()] + " " + d.getDate() + " " + m[d.getMonth()] + " " + d.getFullYear();
  }

  /** Liens de navigation entre pages, selon les droits. */
  function pageLinks(user, active) {
    var L = [{ k: "accueil", href: lien("./"), t: "Accueil" }];
    if (user && user.inv) L.push({ k: "investiture", href: lien("investiture.html"), t: "Investiture 2027" });
    if (user && (user.media || user.admin || user.gestion)) L.push({ k: "media", href: lien("media/"), t: "Médiathèque" });
    if (user && (user.courrier || user.admin)) L.push({ k: "courrier", href: lien("courrier/"), t: "Courrier" });
    if (user && user.gestion) L.push({ k: "acces", href: lien("acces.html"), t: "Accès" });
    if (user && user.site && (user.site.actualites || user.site.lectures || user.site.newsletter)) L.push({ k: "site", href: lien("admin/"), t: "Édition du site ↗" });
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
      ? '<span class="tb-right"><span>' + esc(user.nom) + "</span>" + '<button type="button" id="btn-logout">Se déconnecter</button></span>'
      : '<span class="tb-center">Ordre pontifical au service de la Terre Sainte</span>';
    // Fil d'Ariane : « Espace membres / Section » (lien de retour vers l'accueil de l'espace)
    var fil = !user ? "<span>" + dateTopbar() + "</span>"
      : opts.section
        ? '<a class="tb-home" href="' + lien("./") + '">Espace membres</a><span class="tb-sep" aria-hidden="true">/</span><span class="tb-here" aria-current="page">' + esc(opts.section) + "</span>"
        : '<span class="tb-here" aria-current="page">Espace membres</span>';
    el.innerHTML =
      '<div class="topbar"><div class="topbar-inner"><nav class="tb-left" aria-label="Fil d’Ariane"><span class="tb-dot' + (user ? " live" : "") + '"></span>' + fil + "</nav>" + right + "</div></div>" +
      '<header class="site"><nav class="nav" aria-label="Navigation">' +
      '<a class="brand" href="' + lien("./") + '">' + cross() + '<span class="brand-text"><span class="l1">Ordre Équestre du Saint-Sépulcre de Jérusalem</span><span class="l2">Lieutenance pour le Luxembourg · Espace membres</span></span></a>' +
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
      '<a href="' + lien("../") + '" style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-mute)">← Site public</a></div>' +
      '<div class="foot-bottom"><div>© ' + new Date().getFullYear() + " OESSH · Lieutenance pour le Luxembourg</div><div>Espace réservé · données privées</div></div></div></footer>";
  }

  /**
   * Menu propre à une page : liens vers ses sections (ancres), à passer à renderTop({ tabs: … }).
   * secs : [{ id: "section-x", t: "Libellé" }]. L'onglet de la section visible est mis en évidence.
   */
  function sectionTabs(secs) {
    setTimeout(function () { suivreSections(secs); }, 0);
    return secs.map(function (x, i) {
      return '<a class="nav-tab' + (i === 0 ? " active" : "") + '" href="#' + esc(x.id) + '" data-sec="' + esc(x.id) + '">' + esc(x.t) + "</a>";
    }).join("");
  }
  function suivreSections(secs) {
    var tabs = document.querySelectorAll(".nav-tab[data-sec]");
    function activer(id) { tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.sec === id); }); }
    tabs.forEach(function (t) { t.addEventListener("click", function () { activer(t.dataset.sec); }); });
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) activer(e.target.id); });
    }, { rootMargin: "-30% 0px -60% 0px" });
    secs.forEach(function (x) { var el = document.getElementById(x.id); if (el) obs.observe(el); });
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  window.Espace = { CFG: CFG, esc: esc, api: api, getSession: getSession, setSession: setSession, clearSession: clearSession, requireLogin: requireLogin, logout: logout, renderTop: renderTop, renderFoot: renderFoot, sectionTabs: sectionTabs, lien: lien, toast: toast };
})();
