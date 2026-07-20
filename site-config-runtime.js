// site-config-runtime.js — aplica el "Site Config" que se edita desde
// Esmera (app.indexte.cloud/contenido) o el Index Portal sobre el sitio YA
// renderizado: ocultar/reordenar secciones, pisar título/subtítulo o
// reemplazarlas por HTML libre, imagen/color de fondo, y recolorear las
// variables de marca. Config vacía o ausente = no-op total.
//
// La aplicación es IDEMPOTENTE: cada sección guarda su HTML original la
// primera vez (pristineHTML) y cada llamada a applyConfigToDom resetea a
// ese original antes de reaplicar — así el preview en vivo del editor
// puede cambiar/vaciar cualquier campo en cualquier momento sin dejar
// residuos del estado anterior.
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

  // innerHTML no ejecuta <script> insertados — hay que recrearlos como
  // nodos nuevos para que el navegador los corra (así el "modo HTML libre"
  // del editor puede incluir animaciones/efectos con JS propio).
  function setInnerHTMLWithScripts(el, html) {
    el.innerHTML = html;
    var scripts = el.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var fresh = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        fresh.setAttribute(old.attributes[j].name, old.attributes[j].value);
      }
      fresh.textContent = old.textContent;
      old.parentNode.replaceChild(fresh, old);
    }
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
    var pristineHTML = {};
    sections.forEach(function (el) {
      var id = el.getAttribute('data-section');
      byId[id] = el;
      pristineHTML[id] = el.innerHTML;
    });

    function applyConfigToDom(cfg) {
      if (!cfg) return;

      sections.forEach(function (el) {
        var id = el.getAttribute('data-section');
        if (pristineHTML[id] !== undefined) el.innerHTML = pristineHTML[id];
      });

      (function applyHidden() {
        var hidden = cfg.hidden || [];
        sections.forEach(function (el) {
          el.style.display = hidden.indexOf(el.getAttribute('data-section')) !== -1 ? 'none' : '';
        });
      })();

      if (Array.isArray(cfg.order) && cfg.order.length) {
        var first = sections.filter(function (el) { return cfg.order.indexOf(el.getAttribute('data-section')) !== -1; })[0];
        var parent = first && first.parentElement;
        if (parent) {
          cfg.order.forEach(function (id) {
            if (byId[id] && byId[id].parentElement === parent) parent.appendChild(byId[id]);
          });
        }
      }

      Object.keys(byId).forEach(function (id) {
        var section = byId[id];
        var customHtml = (cfg.html || {})[id];
        if (customHtml) {
          setInnerHTMLWithScripts(section, customHtml);
          return;
        }
        var t = (cfg.texts || {})[id];
        if (t) {
          if (t.title) { var h = pickTitleEl(section); if (h) h.textContent = t.title; }
          if (t.sub)   { var p = pickSubEl(section);   if (p) p.textContent = t.sub; }
        }
      });

      Object.keys(byId).forEach(function (id) {
        var section = byId[id];
        var img = (cfg.images || {})[id];
        section.style.backgroundImage = img ? 'url("' + img + '")' : '';
        if (img) { section.style.backgroundSize = 'cover'; section.style.backgroundPosition = 'center'; }
        section.style.backgroundColor = (cfg.backgrounds || {})[id] || '';
      });

      if (cfg.theme && opts.themeVars) {
        Object.keys(cfg.theme).forEach(function (key) {
          var varName = opts.themeVars[key];
          if (varName && cfg.theme[key]) document.documentElement.style.setProperty(varName, cfg.theme[key]);
        });
      }
    }

    wireEditorClicks(sections);

    // Preview en vivo: el editor de Esmera postea el draft en cada cambio,
    // antes de guardar. Solo se activa embebido (mismo gate que los clicks).
    if (window.top !== window.self) {
      window.addEventListener('message', function (e) {
        if (e.data && e.data.source === 'esmera-editor-preview') applyConfigToDom(e.data.config);
      });
    }

    var base = (opts.apiBase || 'https://app.indexte.cloud') + '/api/' + tenant + '/site-config';
    fetch(base).then(function (r) { return r.ok ? r.json() : {}; }).then(function (cfg) {
      if (!cfg || !Object.keys(cfg).length) return;
      applyConfigToDom(cfg);
    }).catch(function () { /* config rota o de red: el sitio queda como está */ });
  }

  global.applySiteConfig = applySiteConfig;
})(window);
