/* =====================================================================
   OESSH Lectures — dynamic loader
   Injecter ce script avant </body> dans index.html, de.html, en.html
   Remplace le contenu statique de <div class="lectures"> par le JSON.
   ===================================================================== */
(function () {
  'use strict';

  /* ── langue de la page ──────────────────────────────────────────── */
  var lang = (document.documentElement.lang || 'fr').substring(0, 2).toLowerCase();
  if (['fr', 'de', 'en'].indexOf(lang) === -1) lang = 'fr';

  /* ── helpers ────────────────────────────────────────────────────── */
  function t(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field[lang] || field['fr'] || '';
  }

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── rendu d'un ouvrage ─────────────────────────────────────────── */
  function buildBook(ouvrage) {
    var imgSrc = ouvrage.img_filename ? 'assets/' + ouvrage.img_filename : '';
    var imgAlt = esc(t(ouvrage.titre));

    /* cover */
    var coverHTML;
    var firstLien = (ouvrage.liens || []).filter(function (l) { return !l.muted; })[0];
    if (firstLien && firstLien.url && firstLien.url !== '#' && !firstLien.reveal_order) {
      coverHTML = '<a class="cover" href="' + esc(firstLien.url) + '" target="_blank" rel="noopener" aria-label="' + (lang === 'fr' ? 'Acheter le livre' : lang === 'de' ? 'Buch kaufen' : 'Buy the book') + '">' +
        (imgSrc ? '<img src="' + esc(imgSrc) + '" alt="' + imgAlt + '" loading="lazy" decoding="async"/>' : '') +
        '</a>';
    } else {
      var coverNote = t(ouvrage.cover_note);
      coverHTML = '<div class="cover-wrap">' +
        '<span class="cover">' +
        (imgSrc ? '<img src="' + esc(imgSrc) + '" alt="' + imgAlt + '" loading="lazy" decoding="async"/>' : '') +
        '</span>' +
        (coverNote ? '<p class="cover-note">' + esc(coverNote) + '</p>' : '') +
        '</div>';
    }

    /* citation */
    var citHTML = '';
    if (t(ouvrage.citation)) {
      citHTML = '<blockquote class="quote">« ' + esc(t(ouvrage.citation)) + ' »' +
        (ouvrage.citation_source ? '<br><span style="font-style:normal;font-size:14px;color:var(--ink-mute);display:block;margin-top:8px">' + esc(ouvrage.citation_source) + '</span>' : '') +
        '</blockquote>';
    }

    /* meta-row */
    var metaHTML = '';
    if (ouvrage.meta && ouvrage.meta.length) {
      metaHTML = '<div class="meta-row">' +
        ouvrage.meta.map(function (m) {
          return '<div class="item">' + esc(t(m.label)) + '<strong>' + esc(t(m.valeur)) + '</strong></div>';
        }).join('') +
        '</div>';
    }

    /* liens */
    var liensHTML = '<div class="links">' +
      (ouvrage.liens || []).map(function (l) {
        if (l.reveal_order) {
          /* lien "commander" avec bloc caché */
          var oi = l.order_info || {};
          var orderBlock = '<div class="order-info" hidden>' +
            '<p class="summary" style="font-size:14px"><strong>' +
            (lang === 'fr' ? 'Pour commander :' : lang === 'de' ? 'Zum Bestellen:' : 'To order:') +
            '</strong> ' + esc(t(oi.text)) + '</p>' +
            (oi.iban ? '<div class="iban-box"><span class="iban-num">' + esc(oi.iban) + '</span>' +
              '<button type="button" class="iban-copy" onclick="navigator.clipboard.writeText(\'' + esc(oi.iban) + '\').then(function(){var t=this;t.textContent=\'COPIÉ ✓\';setTimeout(function(){t.textContent=\'COPIER\';},1600);}.bind(this))">COPIER</button></div>' : '') +
            '</div>';
          return '<a href="#" class="reveal-order" onclick="this.closest(\'.body\').querySelector(\'.order-info\').hidden=false;this.remove();return false;">' +
            esc(t(l.label)) + ' ↗</a>' + orderBlock;
        }
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener"' +
          (l.muted ? ' class="muted"' : '') + '>' + esc(t(l.label)) + ' ↗</a>';
      }).join('') +
      '</div>';

    /* résumé : 1 ou 2 paragraphes */
    var resumeText = t(ouvrage.resume) || '';
    var resumeParts = resumeText.split(/\n\n+/);
    var resumeHTML = resumeParts.map(function (p) {
      return '<p class="summary">' + esc(p.trim()) + '</p>';
    }).join('');

    return '<article class="book">' +
      coverHTML +
      '<div class="body">' +
      '<div class="eyebrow">' + esc(t(ouvrage.categorie)) + '</div>' +
      '<h3>' + esc(t(ouvrage.titre)) + '</h3>' +
      '<div class="author">' + esc(t(ouvrage.auteur)) + '</div>' +
      resumeHTML +
      citHTML +
      metaHTML +
      liensHTML +
      '</div>' +
      '</article>';
  }

  /* ── chargement et injection ────────────────────────────────────── */
  var slot = document.querySelector('#lectures .lectures');
  if (!slot) return;

  /* placeholder pendant le chargement */
  slot.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--ink-mute);font-size:14px">Chargement…</div>';

  fetch('lectures.json?v=' + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var ouvrages = (data.ouvrages || []).filter(function (o) { return o.published !== false; });
      if (!ouvrages.length) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = ouvrages.map(buildBook).join('');
    })
    .catch(function () {
      /* En cas d'échec (dev local sans serveur, etc.) on laisse le slot vide
         pour ne pas casser la page — le HTML statique existant reste intact
         si on n'a pas encore supprimé les <article> statiques. */
      slot.innerHTML = '';
    });
})();
