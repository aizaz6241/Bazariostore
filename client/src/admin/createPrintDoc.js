// Turns the Create / Print tool's files (index.html + its .js / .css files) into ONE html page that
// runs inside a locked (sandboxed) frame. Nothing in the tool is changed: its own <script src> and
// <link href> tags are swapped for the same file's text, in the same order.
// Shared copy: team-portal/lib/createPrintDoc.js — keep both the same.

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// In the locked frame the browser blocks localStorage / sessionStorage; give the tool a memory copy
// instead so it keeps working (it simply forgets when the page closes).
const STORAGE_SHIM =
  '<script>(function(){function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}' +
  "['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('_')}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}})})();<\/script>";

// The tool's picture download (html2canvas) copies the page into an extra inner frame. Inside the
// locked frame that inner frame counts as a different site, so it always failed and the tool fell
// back to the print dialog (Ctrl + P). This small helper makes the picture without an inner frame
// (the element is copied into an SVG image and drawn on a canvas), so "Download" saves the picture
// directly. It only takes over inside the locked frame; the tool's own code is not changed.
const PICTURE_SHIM = '<script>' + String.raw`/* CREATE / PRINT — picture download inside the locked frame.
   html2canvas copies the page into an extra inner frame; inside a locked (sandboxed) frame that
   inner frame is a different origin, so it always failed and the tool fell back to the print
   dialog. Here the picture is made without an inner frame: the element and its look are copied
   into an SVG image and drawn on a canvas. The tool's own code is not changed. */
(function () {
  var original = window.html2canvas;
  var locked = false;
  try { locked = window.location.origin === 'null' || window.origin === 'null'; } catch (e) { locked = true; }

  var uid = 0;
  var SKIP = { transition: 1, 'transition-property': 1, 'transition-duration': 1, animation: 1, 'animation-name': 1, 'caret-color': 1 };

  function styleText(cs) {
    var out = '';
    for (var i = 0; i < cs.length; i++) {
      var p = cs[i];
      if (SKIP[p]) continue;
      out += p + ':' + cs.getPropertyValue(p) + (cs.getPropertyPriority(p) ? ' !important' : '') + ';';
    }
    return out;
  }

  function toDataUrl(url) {
    return fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('fetch'); return r.blob(); })
      .then(function (b) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); }); });
  }

  // web fonts used on the page (e.g. Google Fonts), put inside the picture; best effort
  var fontCssCache = null;
  function fontCss() {
    if (fontCssCache) return fontCssCache;
    var jobs = [];
    var links = document.querySelectorAll('link[rel~="stylesheet"][href]');
    for (var i = 0; i < links.length; i++) {
      if (!/fonts\.googleapis\.com/i.test(links[i].href)) continue;
      jobs.push(
        fetch(links[i].href, { mode: 'cors', credentials: 'omit' })
          .then(function (r) { return r.ok ? r.text() : ''; })
          .then(function (css) {
            var urls = css.match(/url\(([^)]+)\)/g) || [];
            return Promise.all(urls.map(function (u) {
              var clean = u.slice(4, -1).replace(/["']/g, '');
              return toDataUrl(clean).then(function (d) { css = css.split(clean).join(d); }, function () {});
            })).then(function () { return css; });
          })
          .catch(function () { return ''; })
      );
    }
    fontCssCache = Promise.all(jobs).then(function (list) { return list.join('\n'); });
    return fontCssCache;
  }

  function copyTree(src, rules, waits) {
    if (src.nodeType === 3) return document.createTextNode(src.nodeValue);
    if (src.nodeType !== 1) return null;
    var tag = src.tagName.toLowerCase();
    if (tag === 'script' || tag === 'noscript') return null;
    var cs = window.getComputedStyle(src);
    if (cs.display === 'none') return null;
    var node;
    if (tag === 'canvas') {
      node = document.createElement('img');
      try { node.src = src.toDataURL(); } catch (e) {}
    } else {
      node = src.cloneNode(false);
    }
    node.removeAttribute('id');
    node.setAttribute('style', styleText(cs));
    // what was typed in form fields
    if (tag === 'input') {
      if (src.type === 'checkbox' || src.type === 'radio') { if (src.checked) node.setAttribute('checked', ''); else node.removeAttribute('checked'); }
      else node.setAttribute('value', src.value);
    } else if (tag === 'textarea') {
      node.textContent = src.value;
    } else if (tag === 'select') {
      // shown as plain text (a select does not draw inside a picture)
      var txt = document.createElement('span');
      txt.setAttribute('style', styleText(cs));
      txt.textContent = src.options[src.selectedIndex] ? src.options[src.selectedIndex].text : '';
      return txt;
    }
    if (tag === 'img' && src.currentSrc && !/^data:/i.test(src.currentSrc)) {
      waits.push(toDataUrl(src.currentSrc).then(function (d) { node.setAttribute('src', d); }, function () {}));
    }
    // ::before / ::after
    ['::before', '::after'].forEach(function (pseudo) {
      var ps = window.getComputedStyle(src, pseudo);
      var content = ps.getPropertyValue('content');
      if (!content || content === 'none' || content === 'normal') return;
      var cls = 'cpx' + ++uid;
      node.setAttribute('class', ((node.getAttribute('class') || '') + ' ' + cls).trim());
      rules.push('.' + cls + pseudo + '{' + styleText(ps) + '}');
    });
    if (tag !== 'textarea' && tag !== 'canvas') {
      for (var c = src.firstChild; c; c = c.nextSibling) {
        var k = copyTree(c, rules, waits);
        if (k) node.appendChild(k);
      }
    }
    return node;
  }

  function render(el, opts) {
    opts = opts || {};
    var rect = el.getBoundingClientRect();
    var w = Math.ceil(Math.max(el.offsetWidth || 0, rect.width));
    var h = Math.ceil(Math.max(el.offsetHeight || 0, rect.height));
    var scale = Number(opts.scale) || window.devicePixelRatio || 1;
    var rules = [];
    var waits = [];
    var clone = copyTree(el, rules, waits);
    if (!clone) return Promise.reject(new Error('Nothing to draw'));
    // the element on its own, at the top-left of the picture
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = w + 'px';
    clone.style.height = h + 'px';
    return Promise.all(waits)
      .then(function () { return fontCss(); })
      .then(function (fonts) {
        var wrap = document.createElement('div');
        wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        var st = document.createElement('style');
        st.textContent = fonts + '\n' + rules.join('\n');
        wrap.appendChild(st);
        wrap.appendChild(clone);
        var xhtml = new XMLSerializer().serializeToString(wrap);
        var svg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
          '<foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error('Could not draw the picture')); };
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        });
      })
      .then(function (img) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        if (opts.backgroundColor) { ctx.fillStyle = opts.backgroundColor; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas;
      });
  }

  if (!locked && typeof original === 'function') return;
  window.html2canvas = function (el, opts) {
    return render(el, opts);
  };
})();` + '<\/script>';

export function buildCreatePrintDoc(files) {
  let html = String(files?.['index.html'] || '');
  const late = []; // defer / async scripts run after the page is built, like the browser would

  for (const [name, body] of Object.entries(files || {})) {
    if (name === 'index.html') continue;
    const n = reEsc(name);
    if (/\.js$/i.test(name)) {
      const safe = String(body).replace(/<\/script/gi, '<\\/script');
      const re = new RegExp(`<script([^>]*?)\\ssrc\\s*=\\s*["'](?:\\./)?${n}(?:\\?[^"']*)?["']([^>]*)>\\s*</script\\s*>`, 'gi');
      html = html.replace(re, (_m, a, b) => {
        const attrs = `${a}${b}`;
        const isModule = /type\s*=\s*["']?module/i.test(attrs);
        const clean = attrs.replace(/\s(defer|async)(\s*=\s*["'][^"']*["'])?/gi, '');
        const tag = `<script${clean}>${safe}</script>`;
        if (!isModule && /\s(defer|async)\b/i.test(attrs)) {
          late.push(tag);
          return '';
        }
        return tag;
      });
    } else if (/\.css$/i.test(name)) {
      const safe = String(body).replace(/<\/style/gi, '<\\/style');
      const re = new RegExp(`<link([^>]*?)\\shref\\s*=\\s*["'](?:\\./)?${n}(?:\\?[^"']*)?["']([^>]*)>`, 'gi');
      html = html.replace(re, () => `<style>${safe}</style>`);
    }
  }

  if (late.length) {
    const tail = late.join('\n');
    html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i, (m) => `${tail}\n${m}`) : html + tail;
  }
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + STORAGE_SHIM) : STORAGE_SHIM + html;
  // after all of the tool's scripts (so it replaces html2canvas only once that is loaded)
  html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i, (m) => `${PICTURE_SHIM}\n${m}`) : html + PICTURE_SHIM;
  return html;
}

// what the locked frame may do: run its scripts, print, download, open popups / new tabs, forms.
// NOT allow-same-origin → the tool can never read the admin login token or cookies.
export const CREATE_PRINT_SANDBOX =
  'allow-scripts allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-forms';
