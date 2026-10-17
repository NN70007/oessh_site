/* Script de la page (fichier externe : la politique de sécurité de /espace/ interdit les scripts dans la page). */
(function(){
  "use strict";
  var E = window.Espace;
  var s = E.requireLogin({ redirect: "../?expire=1" });
  if (!s) return;

  // Vérifier le droit media (ou admin)
  var u = s.user;
  if (!u.media && !u.admin && !u.gestion) {
    document.getElementById("media-section").innerHTML =
      '<div class="container"><div class="notice"><h4>Accès non autorisé.</h4>' +
      '<p>Vous n\'avez pas accès à la médiathèque. Contactez le secrétariat de la Lieutenance.</p></div></div>';
    E.renderTop({ section: "Médiathèque", tabs: " " });
    E.renderFoot();
    return;
  }

  // Menu propre à la page : ses rubriques
  E.renderTop({ section: "Médiathèque", tabs: E.sectionTabs([
    { id: "section-logos",  t: "Logos & armoiries" },
    { id: "section-photos", t: "Photos institutionnelles" },
    { id: "section-docs",   t: "Documents officiels" }
  ]) });
  E.renderFoot();
})();
