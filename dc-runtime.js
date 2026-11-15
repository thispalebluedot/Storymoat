(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p, cb) {
      const n = typeof p === 'function' ? p(this.state) : p;
      if (n) Object.assign(this.state, n);
      if (this.__r) this.__r();
      if (cb) cb();
    }
    forceUpdate() { if (this.__r) this.__r(); }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([\w$.]+)\s*\}\}/g;
  const ONE = /^\s*\{\{\s*([\w$.]+)\s*\}\}\s*$/;
  const get = (scope, path) => {
    const parts = path.split('.');
    let v = scope[parts[0]];
    for (let i = 1; i < parts.length; i++) v = v == null ? undefined : v[parts[i]];
    return v;
  };
  const interp = (s, scope) => s.replace(HOLE, (m, p) => { const v = get(scope, p); return v == null ? '' : String(v); });

  function listen(el, type) {
    if (!el.__ls) el.__ls = {};
    if (el.__ls[type]) return;
    el.__ls[type] = true;
    el.addEventListener(type, (e) => { const f = el.__h && el.__h[type]; if (f) f(e); });
  }

  function build(node, scope) {
    if (node.nodeType === 3) return document.createTextNode(interp(node.data, scope));
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    if (tag === 'sc-if') {
      const el = document.createElement('sc-if');
      el.style.display = 'contents';
      const m = (node.getAttribute('value') || '').match(ONE);
      if (m && get(scope, m[1])) node.childNodes.forEach((c) => { const b = build(c, scope); if (b) el.appendChild(b); });
      el.__attrs = { style: el.getAttribute('style') };
      return el;
    }
    if (tag === 'sc-for') {
      const el = document.createElement('sc-for');
      el.style.display = 'contents';
      const m = (node.getAttribute('list') || '').match(ONE);
      const list = (m && get(scope, m[1])) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((item, i) => {
        const sc = Object.assign({}, scope, { [as]: item, index: i });
        node.childNodes.forEach((c) => { const b = build(c, sc); if (b) el.appendChild(b); });
      });
      el.__attrs = { style: el.getAttribute('style') };
      return el;
    }
    const el = document.createElementNS(node.namespaceURI, node.localName);
    const attrs = {};
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (name.indexOf('hint-') === 0) continue;
      const m = a.value.match(ONE);
      if (/^on[a-z]+$/.test(name) && m) {
        const fn = get(scope, m[1]);
        if (typeof fn === 'function') { (el.__h || (el.__h = {}))[name.slice(2)] = fn; listen(el, name.slice(2)); }
        continue;
      }
      if (name === 'ref' && m) { el.__ref = get(scope, m[1]); continue; }
      const v = interp(a.value, scope);
      el.setAttribute(name, v);
      attrs[name] = v;
    }
    el.__attrs = attrs;
    node.childNodes.forEach((c) => { const b = build(c, scope); if (b) el.appendChild(b); });
    return el;
  }

  function adopt(n) {
    if (n.nodeType !== 1) return;
    if (n.__ref) n.__ref(n);
    n.childNodes.forEach(adopt);
  }
  function release(n) {
    if (n.nodeType !== 1) return;
    if (n.__ref) n.__ref(null);
    n.childNodes.forEach(release);
  }

  function sync(live, fresh) {
    const prev = live.__attrs || {};
    const next = fresh.__attrs || {};
    for (const k in next) {
      if (prev[k] !== next[k] || !live.hasAttribute(k)) live.setAttribute(k, next[k]);
    }
    for (const k in prev) if (!(k in next)) live.removeAttribute(k);
    live.__attrs = next;
    live.__h = fresh.__h;
    live.__ref = fresh.__ref;
    if (fresh.__h) for (const t in fresh.__h) listen(live, t);
    const lc = Array.from(live.childNodes).filter((n) => !(n.nodeType === 1 && n.hasAttribute('data-keep')));
    const fc = Array.from(fresh.childNodes);
    for (let i = 0; i < fc.length; i++) {
      const b = fc[i];
      if (i >= lc.length) { live.appendChild(b); adopt(b); continue; }
      const a = lc[i];
      if (a.nodeType !== b.nodeType || (a.nodeType === 1 && (a.localName !== b.localName || a.namespaceURI !== b.namespaceURI))) {
        live.replaceChild(b, a); release(a); adopt(b);
      } else if (a.nodeType === 3) {
        if (a.data !== b.data) a.data = b.data;
      } else sync(a, b);
    }
    for (let i = fc.length; i < lc.length; i++) { release(lc[i]); live.removeChild(lc[i]); }
  }

  window.dcMount = function (Component) {
    const root = document.getElementById('root');
    const tpl = document.getElementById('tpl').content;
    const inst = new Component({});
    let busy = false, again = false;
    const render = () => {
      if (busy) { again = true; return; }
      busy = true;
      do {
        again = false;
        const scope = inst.renderVals();
        const fresh = document.createElement('div');
        tpl.childNodes.forEach((c) => { const b = build(c, scope); if (b) fresh.appendChild(b); });
        fresh.__attrs = {};
        sync(root, fresh);
      } while (again);
      busy = false;
    };
    inst.__r = render;
    render();
    if (inst.componentDidMount) inst.componentDidMount();
    window.addEventListener('pagehide', () => { if (inst.componentWillUnmount) inst.componentWillUnmount(); });
    window.__dc = inst;
  };
})();
