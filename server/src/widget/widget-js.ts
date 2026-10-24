/**
 * Source of /widget.js, served by the API. Plain ES2019, no dependency, isolated in a shadow root.
 * Configuration comes from its own <script> tag: data-agent, data-project, data-key (publishable key).
 * Requests use text/plain bodies so browsers send them without a CORS preflight; the server checks
 * the key, the agent/project pairing and the page origin against the project's allowed domains.
 */
export const WIDGET_JS = String.raw`(function () {
  var script = document.currentScript;
  if (!script) return;
  var cfg = {
    agent: script.getAttribute('data-agent'),
    project: script.getAttribute('data-project'),
    key: script.getAttribute('data-key'),
    api: (script.getAttribute('data-api') || new URL(script.src).origin).replace(/\/$/, ''),
    title: script.getAttribute('data-title') || 'Assistant',
  };
  if (!cfg.agent || !cfg.key) { console.warn('[ForgeAgent] data-agent et data-key sont requis'); return; }

  var host = document.createElement('div');
  host.setAttribute('data-forgeagent', cfg.agent);
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
    '.btn{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;cursor:pointer;background:#1f2de6;color:#fff;font-weight:800;font-size:20px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);z-index:2147483646}' +
    '.panel{position:fixed;right:20px;bottom:88px;width:min(360px,calc(100vw - 40px));height:min(480px,calc(100vh - 120px));background:#0b0c0e;color:#eef0f3;border-radius:10px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.35);z-index:2147483647}' +
    '.panel.open{display:flex}.head{padding:12px 14px;font-weight:700;background:#131519;display:flex;justify-content:space-between}' +
    '.log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45}' +
    '.m{max-width:85%;padding:8px 11px;border-radius:8px;white-space:pre-wrap}.u{align-self:flex-end;background:#eef0f3;color:#0b0c0e}.a{background:#1f2228}.s{color:#959dab;font-size:12px}' +
    'form{display:flex;gap:6px;padding:10px;background:#131519}input{flex:1;padding:9px 10px;border-radius:6px;border:1px solid #2c3038;background:#0b0c0e;color:#eef0f3;font-size:14px}' +
    'button.send{border:0;border-radius:6px;padding:0 12px;background:#eef0f3;color:#0b0c0e;font-weight:700;cursor:pointer}' +
    '.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2de6;color:#fff;padding:10px 14px;border-radius:8px;font-size:14px;z-index:2147483647}' +
    '</style>' +
    '<button class="btn" aria-label="Ouvrir l’assistant">F</button>' +
    '<div class="panel" role="dialog" aria-label="' + cfg.title + '"><div class="head"><span>' + cfg.title + '</span><span class="s">ForgeAgent</span></div>' +
    '<div class="log" aria-live="polite"></div><form><input placeholder="Votre message…" aria-label="Message" maxlength="2000"><button class="send">Envoyer</button></form></div>';

  var btn = root.querySelector('.btn'), panel = root.querySelector('.panel'), log = root.querySelector('.log');
  var form = root.querySelector('form'), input = root.querySelector('input');
  var history = [];
  btn.addEventListener('click', function () { panel.classList.toggle('open'); if (panel.classList.contains('open')) input.focus(); });

  function add(cls, text) { var d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function post(path, body) {
    return fetch(cfg.api + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ key: cfg.key, agent: cfg.agent }, body)) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || r.status); return j; }); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text) return;
    input.value = ''; add('u', text); history.push({ role: 'user', content: text });
    var wait = add('a s', '…');
    post('/v1/widget/message', { input: text, history: history.slice(-8) })
      .then(function (r) { wait.className = 'm a'; wait.textContent = r.content; history.push({ role: 'agent', content: r.content }); })
      .catch(function (err) { wait.className = 'm a s'; wait.textContent = 'Erreur : ' + err.message; });
  });

  function toast(text) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = text; root.appendChild(t); setTimeout(function () { t.remove(); }, 3500); }

  // Live channel: the console can ping this page or ask it to act (if the agent is allowed to).
  var handlers = {
    'ping': function () { return 'pong depuis ' + location.host; },
    'page.context': function () { return 'page « ' + document.title + ' » (' + location.pathname + ')'; },
    'ui.highlight': function () { var el = document.querySelector('main, h1, body'); var old = el.style.outline; el.style.outline = '3px solid #1f2de6'; setTimeout(function () { el.style.outline = old; }, 2500); return 'élément <' + el.tagName.toLowerCase() + '> surligné'; },
    'api.call': function () { return fetch(location.origin + location.pathname, { method: 'HEAD' }).then(function (r) { return 'HEAD ' + location.pathname + ' → ' + r.status; }); },
    'notify.admin': function () { toast('ForgeAgent : notification envoyée par la console'); return 'notification affichée'; },
  };
  try {
    var es = new EventSource(cfg.api + '/v1/widget/events?agent=' + encodeURIComponent(cfg.agent) + '&key=' + encodeURIComponent(cfg.key));
    es.onmessage = function (m) {
      var ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
      var h = handlers[ev.event]; if (!h) return;
      Promise.resolve(h()).then(function (response) { return post('/v1/widget/events/' + encodeURIComponent(ev.id) + '/ack', { response: String(response) }); }).catch(function () {});
    };
  } catch (e) { /* EventSource unavailable: chat still works */ }
})();`
