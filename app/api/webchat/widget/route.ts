export const runtime = "nodejs";

// Serves the embeddable webchat widget as vanilla JS. Embed:
//   <script src="https://<app>/api/webchat/widget?k=xyra_wc_..." async></script>
// The script reads its own src for the API origin + public key, isolates itself
// in a shadow root, posts inbound to /api/webchat/message, and polls
// /api/webchat/poll for agent/bot replies.
const WIDGET = String.raw`(function(){
  if (window.__xyraWebchatLoaded) return;
  window.__xyraWebchatLoaded = true;
  var script = document.currentScript;
  if (!script) { var ss = document.getElementsByTagName('script'); script = ss[ss.length-1]; }
  var src; try { src = new URL(script.src); } catch(e){ return; }
  var API = src.origin;
  var KEY = src.searchParams.get('k');
  if (!KEY) return;

  var LS = 'xyra_wc_' + KEY;
  var visitorId = '';
  try { visitorId = localStorage.getItem(LS) || ''; } catch(e){}
  if (!visitorId) {
    var raw = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('v'+Date.now()+Math.random().toString(36).slice(2));
    visitorId = raw.replace(/[^A-Za-z0-9_-]/g,'');
    try { localStorage.setItem(LS, visitorId); } catch(e){}
  }

  var cfg = { title:'Chat with us', greeting:'Hi! How can we help?', color:'#9333EA', launcher_text:'Chat' };
  var since = new Date().toISOString();
  var isOpen = false, pollTimer = null, greeted = false, seen = {};

  var host = document.createElement('div');
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({mode:'open'}) : host;

  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }
  // cfg.color is injected into a <style> block — must be a strict hex or it can
  // break out of the CSS context and inject HTML on the visitor's page.
  function safeColor(c){ return (typeof c==='string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : '#9333EA'; }

  function render(){
    var style = '' +
      ':host,*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
      '.wrap{position:fixed;bottom:20px;right:20px;z-index:2147483000;}' +
      '.launch{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;color:#fff;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);background:'+cfg.color+';}' +
      '.panel{display:none;flex-direction:column;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.3);}' +
      '.panel.open{display:flex;}' +
      '.hd{background:'+cfg.color+';color:#fff;padding:16px;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center;}' +
      '.hd button{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;}' +
      '.msgs{flex:1;overflow-y:auto;padding:14px;background:#f7f7f9;display:flex;flex-direction:column;gap:8px;}' +
      '.b{max-width:80%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}' +
      '.b.in{align-self:flex-start;background:#fff;color:#111;border:1px solid #ececf0;border-bottom-left-radius:4px;}' +
      '.b.out{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;background:'+cfg.color+';}' +
      '.ft{display:flex;gap:8px;padding:10px;border-top:1px solid #ececf0;background:#fff;}' +
      '.ft input{flex:1;border:1px solid #d9d9e0;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;}' +
      '.ft input:focus{border-color:'+cfg.color+';}' +
      '.ft button{border:0;cursor:pointer;color:#fff;border-radius:10px;padding:0 14px;font-size:14px;font-weight:600;background:'+cfg.color+';}' +
      '.cr{text-align:center;font-size:10px;color:#aaa;padding:6px;background:#fff;}';
    root.innerHTML =
      '<style>'+style+'</style>' +
      '<div class="wrap">' +
        '<div class="panel" id="xpanel">' +
          '<div class="hd"><span>'+esc(cfg.title)+'</span><button id="xclose" aria-label="Close">×</button></div>' +
          '<div class="msgs" id="xmsgs"></div>' +
          '<form class="ft" id="xform"><input id="xinput" placeholder="Type a message…" autocomplete="off" maxlength="4000"/><button type="submit">Send</button></form>' +
          '<div class="cr">Powered by Xyra Chat</div>' +
        '</div>' +
        '<button class="launch" id="xlaunch">💬 '+esc(cfg.launcher_text)+'</button>' +
      '</div>';
    root.getElementById('xlaunch').onclick = toggle;
    root.getElementById('xclose').onclick = toggle;
    root.getElementById('xform').onsubmit = onSend;
  }

  function addMsg(text, dir, id){
    if (id){ if (seen[id]) return; seen[id]=1; }
    var m = root.getElementById('xmsgs');
    if (!m) return;
    var b = document.createElement('div');
    b.className = 'b ' + (dir==='out'?'in':'out'); // visitor's own = 'out' visual; agent = 'in'
    b.textContent = text;
    m.appendChild(b);
    m.scrollTop = m.scrollHeight;
  }

  function toggle(){
    isOpen = !isOpen;
    var p = root.getElementById('xpanel');
    var l = root.getElementById('xlaunch');
    p.classList.toggle('open', isOpen);
    l.style.display = isOpen ? 'none' : 'flex';
    if (isOpen){
      if (!greeted){ greeted = true; addMsg(cfg.greeting, 'agent'); }
      root.getElementById('xinput').focus();
      startPoll();
    }
  }

  function onSend(e){
    e.preventDefault();
    var inp = root.getElementById('xinput');
    var text = (inp.value||'').trim();
    if (!text) return;
    inp.value='';
    addMsg(text, 'visitor');
    fetch(API+'/api/webchat/message', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ k:KEY, visitorId:visitorId, content:text })
    }).then(function(){ poll(); }).catch(function(){});
  }

  function poll(){
    fetch(API+'/api/webchat/poll?k='+encodeURIComponent(KEY)+'&visitorId='+encodeURIComponent(visitorId)+'&since='+encodeURIComponent(since))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || !j.messages) return;
        for (var i=0;i<j.messages.length;i++){
          var msg = j.messages[i];
          addMsg(msg.content, 'agent', msg.id);
          if (msg.created_at > since) since = msg.created_at;
        }
      }).catch(function(){});
  }
  function startPoll(){ if (pollTimer) return; poll(); pollTimer = setInterval(poll, 4000); }

  // Boot: fetch appearance, then render.
  fetch(API+'/api/webchat/config?k='+encodeURIComponent(KEY))
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ if (j){ cfg.title=j.title; cfg.greeting=j.greeting; cfg.color=safeColor(j.color); cfg.launcher_text=j.launcher_text; } })
    .catch(function(){})
    .then(function(){ render(); });
})();`;

export async function GET() {
  return new Response(WIDGET, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
