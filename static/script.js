/* SYS//CONSULTA - script.js */

// ── DOM ───────────────────────────────────────────────────────
var msgsEl      = document.getElementById('msgs');
var inp         = document.getElementById('inp');
var sbtn        = document.getElementById('sbtn');
var typingEl    = document.getElementById('typing');
var typingTxt   = document.getElementById('typing-txt');
var inpRow      = document.getElementById('inp-row');
var inpPre      = document.getElementById('inp-pre');
var inpMode     = document.getElementById('inp-mode');
var inpModeIcon = document.getElementById('inp-mode-icon');
var inpModeTxt  = document.getElementById('inp-mode-txt');
var hintsEl     = document.getElementById('hints');

var outEmpty    = document.getElementById('out-empty');
var outAuth     = document.getElementById('out-auth');
var outData     = document.getElementById('out-data');
var dataFields  = document.getElementById('data-fields');
var dataBadge   = document.getElementById('data-badge');
var dataTs      = document.getElementById('data-ts');
var pulseEl     = document.getElementById('pulse');
var authDescEl  = document.getElementById('auth-desc');
var s1          = document.getElementById('s1');
var s2          = document.getElementById('s2');
var s3          = document.getElementById('s3');

var sdot        = document.getElementById('sdot');
var slabel      = document.getElementById('slabel');
var authBanner  = document.getElementById('auth-banner');
var abText      = document.getElementById('ab-text');
var tbtn        = document.getElementById('tbtn');
var sessId      = document.getElementById('sess-id');

// ── State ─────────────────────────────────────────────────────
var authMode        = null;
var authStarted     = false;
var busy            = false;
var SESSION         = Math.random().toString(36).slice(2,8).toUpperCase();
sessId.textContent  = SESSION;

// ── Helpers ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function scrollEnd() {
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

// ── Status ────────────────────────────────────────────────────
function setStatus(state, text) {
  sdot.className     = 'sdot ' + state;
  slabel.textContent = text;
}

function showBanner(text) {
  abText.textContent = text;
  authBanner.style.display = 'flex';
  document.querySelector('.main').style.paddingTop = '84px';
}

function hideBanner() {
  authBanner.style.display = 'none';
  document.querySelector('.main').style.paddingTop = '';
}

// ── Input mode ────────────────────────────────────────────────
function setMode(mode) {
  authMode = mode;

  if (mode === 'code') {
    inp.placeholder    = 'Digite o código recebido no Telegram...';
    inp.type           = 'text';
    inpPre.textContent = '🔐';
    inpModeIcon.textContent = '📲';
    inpModeTxt.textContent  = 'MODO AUTENTICAÇÃO — CÓDIGO SMS';
    inpMode.classList.add('show');
    hintsEl.classList.add('hide');
    inpRow.classList.add('auth-glow');
    setDis(false);
    inp.focus();

  } else if (mode === '2fa') {
    inp.placeholder    = 'Digite sua senha de verificação em dois fatores...';
    inp.type           = 'password';
    inpPre.textContent = '🔑';
    inpModeIcon.textContent = '🔑';
    inpModeTxt.textContent  = 'MODO AUTENTICAÇÃO — SENHA 2FA';
    inpMode.classList.add('show');
    hintsEl.classList.add('hide');
    inpRow.classList.add('auth-glow');
    setDis(false);
    inp.focus();

  } else {
    inp.placeholder    = 'Digite um comando:  /placa  /nome  /cpf';
    inp.type           = 'text';
    inpPre.textContent = '›';
    inpMode.classList.remove('show');
    hintsEl.classList.remove('hide');
    inpRow.classList.remove('auth-glow');
    authMode = null;
    setDis(false);
  }
}

function setDis(v) {
  inp.disabled      = v;
  sbtn.disabled     = v;
  sbtn.style.opacity = v ? '0.3' : '1';
}

// ── Output panel ──────────────────────────────────────────────
function showOutEmpty() {
  outEmpty.style.display = 'flex';
  outAuth.classList.remove('show');
  outData.classList.remove('show');
  pulseEl.classList.remove('show');
}

function showOutAuth(step) {
  outEmpty.style.display = 'none';
  outData.classList.remove('show');
  outAuth.classList.add('show');
  pulseEl.classList.remove('show');

  [s1,s2,s3].forEach(function(s){ s.classList.remove('active','done'); });

  if (step === 'code') {
    authDescEl.textContent = 'Insira o código SMS enviado ao seu Telegram';
    s1.classList.add('active');
  } else if (step === '2fa') {
    authDescEl.textContent = 'Verificação em dois fatores necessária';
    s1.classList.add('done'); s2.classList.add('active');
  } else if (step === 'done') {
    authDescEl.textContent = 'Sessão salva com sucesso!';
    s1.classList.add('done'); s2.classList.add('done'); s3.classList.add('active');
  }
}

function showOutData(data, label) {
  outEmpty.style.display = 'none';
  outAuth.classList.remove('show');
  outData.classList.add('show');
  outData.classList.remove('alive');
  dataBadge.textContent = label || 'RESULTADO';
  dataFields.innerHTML  = '';

  var fields = toFields(data);
  fields.forEach(function(f, i) {
    var row = document.createElement('div');
    row.className = 'fr';
    row.style.animationDelay = (i * 0.07) + 's';
    row.innerHTML = '<span class="fl">' + esc(f.label) + '</span><span class="fv">' + esc(f.value) + '</span>';
    dataFields.appendChild(row);
  });

  var now = new Date();
  dataTs.textContent = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
  pulseEl.classList.add('show');

  setTimeout(function(){ outData.classList.add('alive'); }, fields.length * 70 + 700);
}

function toFields(data) {
  if (Array.isArray(data)) {
    return data.map(function(x, i) {
      return { label: String(x.label || x.key || 'CAMPO ' + (i+1)).toUpperCase(), value: String(x.value != null ? x.value : '') };
    });
  }
  if (data && typeof data === 'object') {
    return Object.keys(data).map(function(k) {
      return { label: k.replace(/_/g,' ').toUpperCase(), value: String(data[k]) };
    });
  }
  return [{ label: 'RESPOSTA', value: String(data) }];
}

function cmdType(cmd) {
  if (/^\/placa/i.test(cmd)) return 'PLACA';
  if (/^\/cpf/i.test(cmd))   return 'CPF';
  if (/^\/nome/i.test(cmd))  return 'NOME';
  return 'CONSULTA';
}

// ── Messages ──────────────────────────────────────────────────
function addMsg(text, role, isHTML) {
  var wrap   = document.createElement('div');
  wrap.className = 'msg ' + role;
  var lbl    = document.createElement('span');
  lbl.className   = 'ml';
  lbl.textContent = role === 'user' ? 'VOCÊ' : 'SISTEMA';
  var bubble = document.createElement('div');
  bubble.className = 'mb';
  if (isHTML) {
    bubble.innerHTML = text;
  } else if (role === 'user') {
    bubble.innerHTML = esc(text).replace(/^(\/\S+)/, function(m){ return '<span class="ctag">' + m + '</span>'; });
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(lbl);
  wrap.appendChild(bubble);
  msgsEl.appendChild(wrap);
  scrollEnd();
  return bubble;
}

async function typeMsg(text, speed) {
  speed = speed || 14;
  var bubble = addMsg('', 'bot');
  for (var i = 0; i < text.length; i++) {
    bubble.textContent += text[i];
    scrollEnd();
    await sleep(speed);
  }
}

function addAuthPrompt(text, icon) {
  var wrap   = document.createElement('div');
  wrap.className = 'msg bot';
  var lbl    = document.createElement('span');
  lbl.className = 'ml'; lbl.textContent = 'SISTEMA';
  var bubble = document.createElement('div');
  bubble.className = 'mb auth-bub';
  bubble.innerHTML = '<div class="auth-bub-ico">' + (icon||'📲') + '</div><div class="auth-bub-txt">' + esc(text) + '</div>';
  wrap.appendChild(lbl); wrap.appendChild(bubble);
  msgsEl.appendChild(wrap); scrollEnd();
}

function showTyping(text) {
  typingTxt.textContent = text || 'aguardando...';
  typingEl.classList.add('show');
  scrollEnd();
}
function hideTyping() { typingEl.classList.remove('show'); }

// ── Auth ──────────────────────────────────────────────────────
async function startAuth(errMsg) {
  authStarted = true;
  setDis(true);
  setStatus('offline', 'AUTH PENDENTE');
  showBanner('AGUARDANDO CÓDIGO SMS');
  showOutAuth('code');
  await sleep(300);
  addAuthPrompt('Primeiro acesso detectado.\nUm código foi enviado para o seu Telegram.\n\nDigite o código abaixo:', '📲');
  if (errMsg) await typeMsg('⚠ ' + errMsg, 12);
  setMode('code');
}

async function sendCode(code) {
  setDis(true);
  showTyping('verificando código...');
  try {
    var r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'code', value: code })
    });
    var j = await r.json();
    hideTyping();
    if (!r.ok || j.error) { await typeMsg('⚠ ' + (j.error || 'Erro.'), 12); setMode('code'); return; }
    await typeMsg('Código enviado. Verificando...', 14);
    await pollAuth();
  } catch(e) {
    hideTyping(); await typeMsg('Erro de conexão.', 12); setMode('code');
  }
}

async function send2FA(pw) {
  setDis(true);
  showTyping('verificando senha...');
  try {
    var r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: '2fa', value: pw })
    });
    var j = await r.json();
    hideTyping();
    if (!r.ok || j.error) { await typeMsg('⚠ ' + (j.error || 'Senha incorreta.'), 12); setMode('2fa'); return; }
    await typeMsg('Senha enviada. Verificando...', 14);
    await pollAuth();
  } catch(e) {
    hideTyping(); await typeMsg('Erro de conexão.', 12); setMode('2fa');
  }
}

async function pollAuth() {
  for (var i = 0; i < 40; i++) {
    await sleep(1500);
    try {
      var r = await fetch('/api/status');
      var d = await r.json();
      if (d.telegram) {
        authStarted = false;
        hideBanner();
        setStatus('online', 'TELEGRAM OK');
        showOutAuth('done');
        await sleep(1500);
        showOutEmpty();
        await typeMsg('✅ Login realizado! Sessão salva — próximos acessos são automáticos.', 11);
        setMode('normal');
        return;
      }
      if (d.auth_error) { await typeMsg('⚠ ' + d.auth_error, 12); setMode(null); return; }
      if (d.auth_step === '2fa') {
        showOutAuth('2fa'); showBanner('AGUARDANDO SENHA 2FA');
        addAuthPrompt('Conta com verificação em dois fatores.\nDigite sua senha do Telegram:', '🔑');
        setMode('2fa'); return;
      }
      if (d.auth_step === 'code') {
        await typeMsg('Código incorreto. Tente novamente:', 12);
        showOutAuth('code'); setMode('code'); return;
      }
    } catch(e) { /* continua */ }
  }
  await typeMsg('Tempo esgotado. Reinicie o servidor.', 12);
}

// ── Check status ──────────────────────────────────────────────
async function checkStatus() {
  try {
    var r = await fetch('/api/status');
    var d = await r.json();
    if (d.telegram) { setStatus('online', 'TELEGRAM OK'); hideBanner(); return; }
    if (d.needs_auth && !authStarted) { await startAuth(d.auth_error); return; }
    if (d.auth_step === '2fa' && !authStarted) {
      authStarted = true;
      showOutAuth('2fa'); showBanner('AGUARDANDO SENHA 2FA');
      addAuthPrompt('Verificação em dois fatores necessária.\nDigite sua senha do Telegram:', '🔑');
      setMode('2fa'); return;
    }
    setStatus('offline', 'CONECTANDO...');
    setTimeout(checkStatus, 3000);
  } catch(e) {
    setStatus('error', 'OFFLINE');
    setTimeout(checkStatus, 5000);
  }
}

// ── Send ──────────────────────────────────────────────────────
async function doSend() {
  var text = inp.value.trim();
  if (!text) return;

  if (authMode === 'code') {
    inp.value = '';
    addMsg('••••••', 'user');
    await sendCode(text);
    return;
  }
  if (authMode === '2fa') {
    inp.value = '';
    addMsg('••••••••', 'user');
    await send2FA(text);
    return;
  }

  if (busy) return;
  busy = true;
  inp.value = '';
  setDis(true);
  addMsg(text, 'user');
  await sleep(200);
  showTyping('consultando telegram...');

  try {
    var r = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: text, session_id: SESSION })
    });
    var j = await r.json();
    await sleep(300);
    hideTyping();
    if (!r.ok || j.error) {
      await typeMsg('⚠ ' + (j.error || 'Erro HTTP ' + r.status), 12);
    } else {
      await typeMsg(j.message || 'Consulta realizada.', 13);
      if (j.data) showOutData(j.data, cmdType(text));
    }
  } catch(e) {
    hideTyping();
    await typeMsg('Falha de conexão com o servidor.', 11);
    setStatus('error', 'OFFLINE');
  }

  busy = false;
  setMode('normal');
}

// ── Events ────────────────────────────────────────────────────
sbtn.addEventListener('click', doSend);

inp.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    doSend();
  }
});

document.querySelectorAll('.hints span').forEach(function(h) {
  h.addEventListener('click', function() {
    if (authMode) return;
    inp.value = h.getAttribute('data-v') || '';
    inp.focus();
  });
});

tbtn.addEventListener('click', function() {
  var html = document.documentElement;
  var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  tbtn.textContent = next === 'dark' ? '◐' : '◑';
  if (window._3d) window._3d();
});

// ── Welcome ───────────────────────────────────────────────────
function renderWelcome() {
  var el = document.createElement('div');
  el.className = 'welcome';
  el.innerHTML = [
    '<h3>◈ SYS//CONSULTA</h3>',
    '<p>Sistema integrado ao Telegram. Comandos disponíveis:</p>',
    '<div class="wcmds">',
    '<div class="wcmd"><strong>/placa</strong> FLR7671 — consulta veicular</div>',
    '<div class="wcmd"><strong>/nome</strong> João Silva — busca por nome</div>',
    '<div class="wcmd"><strong>/cpf</strong> 12345678900 — consulta CPF</div>',
    '</div>'
  ].join('');
  msgsEl.appendChild(el);
}

// ── Three.js ──────────────────────────────────────────────────
function init3D() {
  try {
    if (typeof THREE === 'undefined') return;
    var canvas   = document.getElementById('bg-canvas');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    var scene  = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 0.1, 100);
    camera.position.z = 5;

    var icoM = new THREE.MeshBasicMaterial({ color:0xffffff, wireframe:true, transparent:true, opacity:0.10 });
    var ico  = new THREE.Mesh(new THREE.IcosahedronGeometry(1.85, 1), icoM);
    scene.add(ico);

    var inM = new THREE.MeshBasicMaterial({ color:0x555555, wireframe:true, transparent:true, opacity:0.06 });
    var inr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), inM);
    scene.add(inr);

    var t1M = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.06 });
    var t1  = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.005, 4, 120), t1M);
    t1.rotation.x = Math.PI/4;
    scene.add(t1);

    var n = 100, pos = new Float32Array(n*3);
    for (var i=0; i<n; i++) {
      var th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1), rr=2.6+Math.random()*2;
      pos[i*3]=rr*Math.sin(ph)*Math.cos(th);
      pos[i*3+1]=rr*Math.sin(ph)*Math.sin(th);
      pos[i*3+2]=rr*Math.cos(ph);
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var pM  = new THREE.PointsMaterial({ color:0xffffff, size:0.022, transparent:true, opacity:0.25 });
    var pts = new THREE.Points(pg, pM);
    scene.add(pts);

    window._3d = function() {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      var fg = dark ? 0xffffff : 0x111111;
      icoM.color.setHex(fg); inM.color.setHex(dark?0x555555:0xaaaaaa);
      t1M.color.setHex(fg); pM.color.setHex(dark?0xffffff:0x444444);
    };

    var t = 0;
    function frame() {
      requestAnimationFrame(frame);
      t += 0.004;
      ico.rotation.x = t*0.26; ico.rotation.y = t*0.36;
      inr.rotation.x =-t*0.20; inr.rotation.z = t*0.17;
      t1.rotation.z  = t*0.14;
      pts.rotation.y = t*0.06; pts.rotation.x = t*0.025;
      ico.scale.setScalar(1 + Math.sin(t*0.75)*0.017);
      renderer.render(scene, camera);
    }
    frame();

    window.addEventListener('resize', function() {
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  } catch(e) {
    console.warn('3D desativado:', e);
  }
}

// ── Init ──────────────────────────────────────────────────────
renderWelcome();
init3D();
checkStatus();
inp.focus();
                
