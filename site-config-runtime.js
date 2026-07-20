// site-config-runtime.js — aplica el "Site Config" que se edita desde el
// Index Portal (App · Clientes · [tenant] · Sitio) sobre el sitio YA
// renderizado: ocultar/reordenar secciones, pisar título/subtítulo, y
// recolorear las variables de marca. Config vacía o ausente = no-op total,
// el sitio se ve exactamente como sin este script.
//
// Convención de selección de texto por sección (en este orden):
//   1) .section-title / .section-sub dentro de [data-section="id"]
//   2) si no existen: el primer h1/h2/h3 (título) y el primer <p> (sub)
// Por eso títulos con <em>/<br> quedan en texto plano al pisarlos — se
// pierde el énfasis inline, no se rompe nada.
//
// Uso: <script src="assets/site-config-runtime.js"></script> al final del
// body, después de que el contenido principal ya esté en el DOM, y luego
// applySiteConfig('<slug-del-tenant>', { themeVars: { key: '--css-var' } }).
(function (global) {
  function pickTitleEl(section) {
    return section.querySelector('.section-title') || section.querySelector('h1,h2,h3');
  }
  function pickSubEl(section) {
    return section.querySelector('.section-sub') || section.querySelector('p');
  }

  // Click-to-jump: cuando el sitio corre embebido en el editor visual de
  // Esmera (iframe en /contenido), clickear una sección le avisa al padre
  // para que salte/resalte la tarjeta correspondiente. No hace nada para
  // un visitante real (solo se activa dentro de un iframe).
  function wireEditorClicks(sections) {
    if (window.top === window.self) return;
    sections.forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('mouseenter', function () { el.style.outline = '2px dashed rgba(37,99,235,.55)'; el.style.outlineOffset = '-2px'; });
      el.addEventListener('mouseleave', function () { el.style.outline = ''; });
      el.addEventListener('click', function () {
        window.top.postMessage({ source: 'esmera-site', id: el.getAttribute('data-section') }, 'https://app.indexte.cloud');
      }, true);
    });
  }

  function applySiteConfig(tenant, opts) {
    opts = opts || {};
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));
    var byId = {};
    sections.forEach(function (el) { byId[el.getAttribute('data-section')] = el; });
    wireEditorClicks(sections);

    var base = (opts.apiBase || 'https://app.indexte.cloud') + '/api/' + tenant + '/site-config';
    fetch(base).then(function (r) { return r.ok ? r.json() : {}; }).then(function (cfg) {
      if (!cfg || !Object.keys(cfg).length) return;

      (cfg.hidden || []).forEach(function (id) {
        if (byId[id]) byId[id].style.display = 'none';
      });

      if (Array.isArray(cfg.order) && cfg.order.length) {
        var first = sections.filter(function (el) { return cfg.order.indexOf(el.getAttribute('data-section')) !== -1; })[0];
        var parent = first && first.parentElement;
        if (parent) {
          cfg.order.forEach(function (id) {
            if (byId[id] && byId[id].parentElement === parent) parent.appendChild(byId[id]);
          });
        }
      }

      Object.keys(cfg.texts || {}).forEach(function (id) {
        var section = byId[id];
        if (!section) return;
        var t = cfg.texts[id];
        if (t.title) { var h = pickTitleEl(section); if (h) h.textContent = t.title; }
        if (t.sub) { var p = pickSubEl(section); if (p) p.textContent = t.sub; }
      });

      if (cfg.theme && opts.themeVars) {
        Object.keys(cfg.theme).forEach(function (key) {
          var varName = opts.themeVars[key];
          if (varName && cfg.theme[key]) document.documentElement.style.setProperty(varName, cfg.theme[key]);
        });
      }
    }).catch(function () { /* config rota o de red: el sitio queda como está */ });
  }

  global.applySiteConfig = applySiteConfig;
})(window);
