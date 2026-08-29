/* =====================================================================
   OESSH Newsletters — dynamic loader
   Injecter ce script avant </body> dans index.html, de.html, en.html
   Remplace le contenu statique de <div class="newsletters"> par le JSON.
   ===================================================================== */
(function () {
  'use strict';

  /* ── helpers ────────────────────────────────────────────────────── */
  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── rendu d'une newsletter ─────────────────────────────────────── */
  function buildNewsletter(nl, isFeatured) {
    var imgSrc = nl.img_filename ? 'assets/' + nl.img_filename : '';
    var imgAlt = esc(nl.titre);
    var newTag = nl.nouvelle ? '<span class="new-tag">Nouvelle</span>' : '';
    var pages = nl.pages || 'PDF';
    var classe = isFeatured ? 'nl featured has-image' : 'nl has-image';

    return '<a class="' + classe + '" href="' + esc(nl.pdf_url) + '" target="_blank" rel="noopener">' +
      '<div class="cover">' +
      (imgSrc ? '<img src="' + esc(imgSrc) + '" alt="' + imgAlt + '" loading="lazy" decoding="async"/>' : '') +
      newTag +
      '</div>' +
      '<div class="info"><span class="name">' + esc(nl.titre) + '</span><span class="pages">' + esc(pages) + '</span></div>' +
      '</a>';
  }

  /* ── chargement et injection ────────────────────────────────────── */
  var slot = document.querySelector('#publications .newsletters');
  if (!slot) return;

  /* placeholder pendant le chargement */
  slot.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--ink-mute);font-size:14px">Chargement…</div>';

  fetch('newsletters.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var newsletters = (data.newsletters || []).filter(function (nl) { return nl.published !== false; });
      if (!newsletters.length) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = newsletters.map(function (nl, i) {
        return buildNewsletter(nl, i === 0);
      }).join('');
    })
    .catch(function () {
      /* En cas d'échec (dev local sans serveur, etc.) on laisse le slot vide */
      slot.innerHTML = '';
    });
})();
