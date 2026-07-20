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

  var INTRO_ANIMS = ['fade', 'zoom', 'slide', 'blur', 'draw'];

  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Clona el logo real del nav (marca + nombre — imagen o texto, lo que sea
  // que cada sitio ya use) para que el splash quede alineado a la marca
  // real sin pedirle al tenant un texto/imagen aparte para el intro.
  function findBrandMark() {
    var selectors = ['.nav-logo', '.nav__logo', '.nav-brand', 'a[href="/"] [class*="logo" i]', 'header [class*="logo" i]', 'nav [class*="brand" i]'];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      // outerHTML (no innerHTML): clonar solo los hijos pierde las reglas
      // de layout propias del elemento (ej. .nav-logo es flex-column para
      // apilar marca+nombre) — con outerHTML ese layout viaja con el clon.
      if (el && (el.textContent.replace(/\s/g, '') || el.querySelector('img'))) return el.outerHTML;
    }
    var t = (document.title || '').split(/[—\-|]/)[0];
    return '<span>' + escText(t.trim()) + '</span>';
  }

  var INTRO_CSS =
    '.esm-intro{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;' +
    'background:#fafafa;transition:transform .85s cubic-bezier(.76,0,.24,1)}' +
    '.esm-intro.esm-intro-out{transform:translateY(-101%)}' +
    '.esm-intro-mark{transform:scale(2.2);transform-origin:center;opacity:0;text-align:center;color:#111}' +
    '.esm-intro-fade .esm-intro-mark{animation:esmIntroFade .9s .3s cubic-bezier(.22,1,.36,1) forwards}' +
    '@keyframes esmIntroFade{from{opacity:0;transform:scale(2.2) translateY(14px)}to{opacity:1;transform:scale(2.2) translateY(0)}}' +
    '.esm-intro-zoom .esm-intro-mark{animation:esmIntroZoom .9s .3s cubic-bezier(.22,1,.36,1) forwards}' +
    '@keyframes esmIntroZoom{from{opacity:0;transform:scale(3.6)}to{opacity:1;transform:scale(2.2)}}' +
    '.esm-intro-slide .esm-intro-mark{animation:esmIntroSlide .8s .3s cubic-bezier(.22,1,.36,1) forwards}' +
    '@keyframes esmIntroSlide{from{opacity:0;transform:scale(2.2) translateY(46px)}to{opacity:1;transform:scale(2.2) translateY(0)}}' +
    '.esm-intro-blur .esm-intro-mark{animation:esmIntroBlur 1s .3s ease-out forwards}' +
    '@keyframes esmIntroBlur{from{opacity:0;filter:blur(16px);transform:scale(2.2)}to{opacity:1;filter:blur(0);transform:scale(2.2)}}' +
    '.esm-intro-draw .esm-intro-mark{animation:esmIntroFade .7s .3s cubic-bezier(.22,1,.36,1) forwards;position:relative;padding-bottom:.6em}' +
    '.esm-intro-draw .esm-intro-mark::after{content:"";position:absolute;left:50%;bottom:0;width:60%;height:2px;' +
    'background:currentColor;transform:translateX(-50%) scaleX(0);transform-origin:center;animation:esmIntroDraw 1s .9s cubic-bezier(.65,0,.35,1) forwards}' +
    '@keyframes esmIntroDraw{to{transform:translateX(-50%) scaleX(1)}}' +
    '@media (max-width:640px){.esm-intro-mark{transform:scale(1.5)}' +
    '.esm-intro-fade .esm-intro-mark,.esm-intro-slide .esm-intro-mark,.esm-intro-blur .esm-intro-mark,.esm-intro-draw .esm-intro-mark{animation-name:esmIntroFadeSm}' +
    '.esm-intro-zoom .esm-intro-mark{animation-name:esmIntroZoomSm}}' +
    '@keyframes esmIntroFadeSm{from{opacity:0;transform:scale(1.5) translateY(10px)}to{opacity:1;transform:scale(1.5) translateY(0)}}' +
    '@keyframes esmIntroZoomSm{from{opacity:0;transform:scale(2.3)}to{opacity:1;transform:scale(1.5)}}';

  function ensureIntroStyles() {
    if (document.getElementById('esm-intro-style')) return;
    var style = document.createElement('style');
    style.id = 'esm-intro-style';
    style.textContent = INTRO_CSS;
    document.head.appendChild(style);
  }

  // Intro de marca configurable desde el editor visual: apagado, animación
  // de logo (varias a elegir, clonando el logo real del nav) o HTML/CSS/JS
  // 100% libre (para intros a medida, como las de Victoria/Bom Pain).
  // Corre UNA sola vez por sesión, respeta prefers-reduced-motion, y nunca
  // se ejecuta dentro del preview embebido del editor (solo en visitas
  // reales) para no repetir la animación en cada tecla que el cliente
  // escribe mientras edita.
  function applyIntro(cfg, tenant) {
    if (window.top !== window.self) return;
    var intro = cfg && cfg.intro;
    var mode = intro && intro.mode;
    if (!mode || mode === 'off') return;

    var key = 'esmIntroSeen:' + tenant;
    if (sessionStorage.getItem(key)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sessionStorage.setItem(key, '1');

    var pre = document.getElementById('pre-intro');

    if (mode === 'html' && intro.html) {
      var wrap = document.createElement('div');
      document.body.insertBefore(wrap, document.body.firstChild);
      setInnerHTMLWithScripts(wrap, intro.html);
      if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
      return;
    }

    ensureIntroStyles();
    var anim = INTRO_ANIMS.indexOf(intro.animation) !== -1 ? intro.animation : 'fade';
    var overlay = document.createElement('div');
    overlay.className = 'esm-intro esm-intro-' + anim;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="esm-intro-mark">' + findBrandMark() + '</div>';
    document.body.insertBefore(overlay, document.body.firstChild);
    if (pre && pre.parentNode) pre.parentNode.removeChild(pre);

    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      overlay.classList.add('esm-intro-out');
      document.body.style.overflow = '';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 900);
    }, 2000);
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
        var present = sections.filter(function (el) { return cfg.order.indexOf(el.getAttribute('data-section')) !== -1; });
        var parent = present[0] && present[0].parentElement;
        if (parent) {
          // Ancla = lo que sigue a la última sección en su posición ORIGINAL.
          // insertBefore(anchor) en vez de appendChild evita correr hermanos
          // que no son secciones (footer, scripts, chrome inyectado por
          // shop.js) hacia arriba — appendChild los movía al fondo del
          // parent, dejando esos hermanos "varados" antes de las secciones.
          var anchor = present[present.length - 1].nextSibling;
          cfg.order.forEach(function (id) {
            if (byId[id] && byId[id].parentElement === parent) parent.insertBefore(byId[id], anchor);
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
      applyIntro(cfg, tenant);
      if (!cfg || !Object.keys(cfg).length) return;
      applyConfigToDom(cfg);
    }).catch(function () { /* config rota o de red: el sitio queda como está */ });
  }

  global.applySiteConfig = applySiteConfig;
})(window);
