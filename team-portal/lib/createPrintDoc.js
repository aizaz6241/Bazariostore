// Turns the Create / Print tool's files (index.html + its .js / .css files) into ONE html page that
// runs inside a locked (sandboxed) frame. Nothing in the tool is changed: its own <script src> and
// <link href> tags are swapped for the same file's text, in the same order.
// Shared copy: client/src/admin/createPrintDoc.js — keep both the same.

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// In the locked frame the browser blocks localStorage / sessionStorage; give the tool a memory copy
// instead so it keeps working (it simply forgets when the page closes).
const STORAGE_SHIM =
  '<script>(function(){function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}' +
  "['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('_')}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}})})();<\/script>";

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
  return html;
}

// what the locked frame may do: run its scripts, print, download, open popups / new tabs, forms.
// NOT allow-same-origin → the tool can never read the admin login token or cookies.
export const CREATE_PRINT_SANDBOX =
  'allow-scripts allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-forms';
