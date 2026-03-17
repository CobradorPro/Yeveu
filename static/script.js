/* ============================================================
   SYS//CONSULTA — script.js
   Autenticação Telegram pelo chat + consultas + boot screen
   ============================================================ */

const API_BASE = '';

// ── DOM ───────────────────────────────────────────────────────
const bootScreen      = document.getElementById('boot-screen');
const bootBarFill     = document.getElementById('boot-bar-fill');
const bootLines       = document.getElementById('boot-lines');

const messagesArea    = document.getElementById('messages-area');
const chatInput       = document.getElementById('chat-input');
const sendBtn         = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const inputWrapper    = document.getElementById('input-wrapper');
const inputPrefix     = document.getElementById('input-prefix');
const inputHints      = document.getElementById('input-hints');
const inputModeLabel  = document.getElementById('input-mode-label');
const inputModeIcon   = document.getElementById('input-mode-icon');
const inputModeText   = document.getElementById('input-mode-text');

const resultEmpty     = document.getElementById('result-empty');
const resultData      = document.getElementById('result-data');
const resultFields    = document.getElementById('result-fields');
const resultTypeBadge = document.getElementById('result-type-badge');
const resultTimestamp = document.getElementById('result-timestamp');
const resultPulseRing = document.getElementById('result-pulse-ring');
const resultAuthState = document.getElementById('result-auth-state');
const rasDesc         = document.getElementById('ras-desc');
const rasStep1        = document.getElementById('ras-step-1');
const rasStep2        = document.getElementById('ras-step-2');
const rasStep3        = document.getElementById('ras-step-3');

const statusDot       = document.getElementById('status-dot');
const statusLabel     = document.getElementById('status-label');
const authBanner      = document.getElementById('auth-banner');
const authBannerText  = document.getElementById('auth-banner-text');
const themeToggle     = document.getElementById('theme-toggle');
const sessionIdEl     = document.getElementById('session-id');

// ── State ─────────────────────────────────────────────────────
let isProcessing    = false;
let authMode        = null;   // null | "code" | "2fa"
let authFlowStarted = false;
const sessionId     = Math.random().toString(36).slice(2, 8).toUpperCase();
sessionIdEl.textContent = sessionId;

// ── Utils ─────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scrollBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ══════════════════════════════════════════════════════════════
// BOOT SCREEN
// ══════════════════════════════════════════════════════════════

async function runBootSequence() {
  const lines = [
    'CARREGANDO MÓDULOS...',
    'INICIALIZANDO TELETHON...',
    'ABRINDO FLASK SERVER...',
    'VERIFICANDO SESSÃO...',
    'SISTEMA PRONTO',
  ];

  for (let i = 0; i < lines.length; i++) {
    await sleep(220);
    bootLines.innerHTML = `<span>${lines[i]}</span>`;
    bootBarFill.style.width = `${((i + 1) / lines.length) * 100}%`;
  }

  await sleep(300);
  bootScreen.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
// STATUS
// ══════════════════════════════════════════════════════════════

function setStatus(state, text) {
  statusDot.className    = `status-dot ${state}`;
  statusLabel.textContent = text;
}

function showAuthBanner(text) {
  authBannerText.textContent = text;
  authBanner.style.display   = 'flex';
}

function hideAuthBanner() {
  authBanner.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// INPUT MODE
// ══════════════════════════════════════════════════════════════

function setInputMode(mode) {
  authMode = mode;

  if (mode === 'code') {
    chatInput.placeholder    = 'Digite o código recebido no Telegram...';
    chatInput.type           = 'text';
    chatInput.maxLength      = 10;
    inputPrefix.textContent  = '🔐';
    inputModeIcon.textContent = '📲';
    inputModeText.textContent = 'MODO AUTENTICAÇÃO — CÓDIGO SMS';
    inputModeLabel.style.display = 'flex';
    inputHints.classList.add('hidden');
    inputWrapper.classList.add('auth-waiting');
    setInputDisabled(false);
    chatInput.focus();
  } else if (mode === '2fa') {
    chatInput.placeholder    = 'Digite sua senha de verificação em 2 etapas...';
    chatInput.type           = 'password';
    chatInput.maxLength      = 200;
    inputPrefix.textContent  = '🔑';
    inputModeIcon.textContent = '🔑';
    inputModeText.textContent = 'MODO AUTENTICAÇÃO — SENHA 2FA';
    inputModeLabel.style.display = 'flex';
    inputHints.classList.add('hidden');
    inputWrapper.classList.add('auth-waiting');
    setInputDisabled(false);
    chatInput.focus();
  } else {
    // Normal
    chatInput.placeholder    = 'Digite um comando:  /placa  /nome  /cpf';
    chatInput.type           = 'text';
    chatInput.maxLength      = 500;
    inputPrefix.textContent  = '›';
    inputModeLabel.style.display = 'none';
    inputHints.classList.remove('hidden');
    inputWrapper.classList.remove('auth-waiting');
    authMode = null;
    setInputDisabled(false);
  }
}

function setInputDisabled(disabled) {
  chatInput.disabled    = disabled;
  sendBtn.disabled      = disabled;
  sendBtn.style.opacity = disabled ? '0.35' : '1';
}

// ══════════════════════════════════════════════════════════════
// RESULT PANEL STATES
// ══════════════════════════════════════════════════════════════

function showResultAuth(step) {
  resultEmpty.style.display     = 'none';
  resultData.style.display      = 'none';
  resultAuthState.style.display = 'flex';
  resultPulseRing.classList.remove('visible');

  // Update step indicators
  [rasStep1, rasStep2, rasStep3].forEach(s => {
    s.classList.remove('active', 'done');
    s.querySelector('.ras-step-dot').style.background = '';
  });

  if (step === 'code') {
    rasDesc.textContent = 'Insira o código SMS enviado ao seu Telegram';
    rasStep1.classList.add('active');
  } else if (step === '2fa') {
    rasDesc.textContent = 'Verificação em dois fatores necessária';
    rasStep1.classList.add('done');
    rasStep2.classList.add('active');
  } else if (step === 'done') {
    rasDesc.textContent = 'Sessão salva — nunca mais precisará autenticar';
    rasStep1.classList.add('done');
    rasStep2.classList.add('done');
    rasStep3.classList.add('active');
  }
}

function hideResultAuth() {
  resultAuthState.style.display = 'none';
  resultEmpty.style.display     = 'flex';
}

function showResult(data, typeLabel = 'RESULTADO') {
  resultEmpty.style.display     = 'none';
  resultAuthState.style.display = 'none';
  resultData.style.display      = 'flex';
  resultData.classList.remove('alive');
  resultTypeBadge.textContent   = typeLabel;
  resultFields.innerHTML        = '';

  const fields = normalizeData(data);
  fields.forEach((field, i) => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.style.animationDelay = `${i * 0.065}s`;
    const lbl = document.createElement('span');
    lbl.className   = 'field-label';
    lbl.textContent = field.label;
    const val = document.createElement('span');
    val.className   = 'field-value';
    val.textContent = field.value;
    row.appendChild(lbl);
    row.appendChild(val);
    resultFields.appendChild(row);
  });

  const now = new Date();
  resultTimestamp.textContent =
    `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
  resultPulseRing.classList.add('visible');
  setTimeout(() => resultData.classList.add('alive'), fields.length * 65 + 700);
}

function normalizeData(data) {
  if (Array.isArray(data)) {
    return data.map((item, i) => ({
      label: String(item.label || item.key || `CAMPO ${i+1}`).toUpperCase(),
      value: String(item.value ?? item.val ?? '')
    }));
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([k, v]) => ({
      label: k.replace(/_/g, ' ').toUpperCase(),
      value: String(v)
    }));
  }
  return [{ label: 'RESPOSTA', value: String(data) }];
}

function detectType(cmd) {
  if (/^\/placa/i.test(cmd))  return 'PLACA';
  if (/^\/cpf/i.test(cmd))    return 'CPF';
  if (/^\/nome/i.test(cmd))   return 'NOME';
  if (/^\/rg/i.test(cmd))     return 'RG';
  if (/^\/tel/i.test(cmd))    return 'TELEFONE';
  return 'CONSULTA';
}

// ══════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════

function addMessage(text, role = 'bot', isHTML = false) {
  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}`;
  const label  = document.createElement('span');
  label.className   = 'msg-label';
  label.textContent = role === 'user' ? 'VOCÊ' : 'SISTEMA';
  const bubble = document.createElement('div');
  bubble.className  = 'msg-bubble';

  if (isHTML) {
    bubble.innerHTML = text;
  } else if (role === 'user') {
    bubble.innerHTML = text.replace(/^(\/\S+)/, (_, c) =>
      `<span class="cmd-tag">${escapeHtml(c)}</span>`
    );
  } else {
    bubble.textContent = text;
  }

  wrap.appendChild(label);
  wrap.appendChild(bubble);
  messagesArea.appendChild(wrap);
  scrollBottom();
  return { wrap, bubble };
}

async function typeMessage(text, speed = 14) {
  const wrap   = document.createElement('div');
  wrap.className = 'msg bot';
  const label  = document.createElement('span');
  label.className   = 'msg-label';
  label.textContent = 'SISTEMA';
  const bubble = document.createElement('div');
  bubble.className  = 'msg-bubble';
  bubble.textContent = '';
  wrap.appendChild(label);
  wrap.appendChild(bubble);
  messagesArea.appendChild(wrap);
  scrollBottom();

  for (const char of text) {
    bubble.textContent += char;
    scrollBottom();
    await sleep(speed);
  }
  return wrap;
}

function addAuthPrompt(text, icon = '📲') {
  const wrap   = document.createElement('div');
  wrap.className = 'msg bot';
  const label  = document.createElement('span');
  label.className   = 'msg-label';
  label.textContent = 'SISTEMA';
  const bubble = document.createElement('div');
  bubble.className  = 'msg-bubble auth-bubble';
  bubble.innerHTML  = `
    <div class="auth-icon">${icon}</div>
    <div class="auth-text">${escapeHtml(text)}</div>
  `;
  wrap.appendChild(label);
  wrap.appendChild(bubble);
  messagesArea.appendChild(wrap);
  scrollBottom();
  return wrap;
}

function showTyping(text = 'consultando telegram...') {
  document.querySelector('.typing-text').textContent = text;
  typingIndicator.classList.add('visible');
  scrollBottom();
}
function hideTyping() {
  typingIndicator.classList.remove('visible');
}

// ══════════════════════════════════════════════════════════════
// AUTH FLOW
// ══════════════════════════════════════════════════════════════

async function startAuthFlow(authError) {
  authFlowStarted = true;
  setInputDisabled(true);

  setStatus('offline', 'AUTH PENDENTE');
  showAuthBanner('AGUARDANDO CÓDIGO SMS');
  showResultAuth('code');

  await sleep(400);

  addAuthPrompt(
    `Primeiro acesso detectado.\nUm código foi enviado para ${maskPhone('+5541974010817')}.\n\nDigite o código abaixo para continuar:`,
    '📲'
  );

  if (authError) {
    await typeMessage(`⚠ ${authError}`, 12);
  }

  setInputMode('code');
}

async function handleAuthCode(code) {
  setInputDisabled(true);
  showTyping('verificando código...');

  try {
    const res  = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'code', value: code })
    });
    const json = await res.json();
    hideTyping();

    if (!res.ok || json.error) {
      await typeMessage(`⚠ ${json.error || 'Erro ao verificar.'}`, 12);
      setInputMode('code');
      return;
    }

    await typeMessage('Código enviado. Verificando...', 14);
    await pollForAuthCompletion();

  } catch {
    hideTyping();
    await typeMessage('Erro de conexão.', 12);
    setInputMode('code');
  }
}

async function handleAuth2FA(password) {
  setInputDisabled(true);
  showTyping('verificando senha...');

  try {
    const res  = await fetch(`${API_BASE}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: '2fa', value: password })
    });
    const json = await res.json();
    hideTyping();

    if (!res.ok || json.error) {
      await typeMessage(`⚠ ${json.error || 'Senha incorreta.'}`, 12);
      setInputMode('2fa');
      return;
    }

    await typeMessage('Senha enviada. Verificando...', 14);
    await pollForAuthCompletion();

  } catch {
    hideTyping();
    await typeMessage('Erro de conexão.', 12);
    setInputMode('2fa');
  }
}

async function pollForAuthCompletion(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(1500);
    try {
      const r    = await fetch(`${API_BASE}/api/status`);
      const data = await r.json();

      if (data.telegram) {
        // ✅ Autenticado com sucesso
        authFlowStarted = false;
        hideAuthBanner();
        setStatus('online', 'TELEGRAM OK');
        showResultAuth('done');
        await sleep(1200);
        hideResultAuth();

        await typeMessage(
          '✅ Login realizado! Sessão salva em session_string.txt — em qualquer outro dispositivo basta copiar esse arquivo junto.',
          11
        );
        setInputMode('normal');
        return;
      }

      if (data.auth_error) {
        await typeMessage(`⚠ ${data.auth_error}`, 12);
        if (data.auth_step === 'code') {
          showResultAuth('code');
          setInputMode('code');
        } else {
          setInputMode(null);
        }
        return;
      }

      if (data.auth_step === '2fa') {
        showResultAuth('2fa');
        showAuthBanner('AGUARDANDO SENHA 2FA');
        addAuthPrompt(
          'Verificação em dois fatores ativa.\nDigite a senha de segurança da sua conta Telegram:',
          '🔑'
        );
        setInputMode('2fa');
        return;
      }

      if (data.auth_step === 'code') {
        await typeMessage('Código incorreto. Tente novamente:', 12);
        showResultAuth('code');
        setInputMode('code');
        return;
      }

    } catch { /* continua polling */ }
  }
  await typeMessage('Tempo esgotado. Reinicie o servidor.', 12);
}

function maskPhone(phone) {
  return phone.replace(/(\+\d{2})(\d{2})(\d{4})(\d{4})/, '$1 $2 ****$4');
}

// ══════════════════════════════════════════════════════════════
// STATUS CHECK
// ══════════════════════════════════════════════════════════════

async function checkStatus() {
  try {
    const r    = await fetch(`${API_BASE}/api/status`);
    const data = await r.json();

    if (data.telegram) {
      setStatus('online', 'TELEGRAM OK');
      hideAuthBanner();
      return;  // Tudo certo
    }

    if (data.needs_auth && !authFlowStarted) {
      await startAuthFlow(data.auth_error);
      return;
    }

    if (data.auth_step === '2fa' && !authFlowStarted) {
      authFlowStarted = true;
      showResultAuth('2fa');
      showAuthBanner('AGUARDANDO SENHA 2FA');
      addAuthPrompt(
        'Verificação em dois fatores necessária.\nDigite a senha da sua conta Telegram:',
        '🔑'
      );
      setInputMode('2fa');
      return;
    }

    setStatus('offline', 'CONECTANDO...');
    setTimeout(checkStatus, 2500);

  } catch {
    setStatus('error', 'OFFLINE');
    setTimeout(checkStatus, 5000);
  }
}

// ══════════════════════════════════════════════════════════════
// SEND (consultas ou auth)
// ══════════════════════════════════════════════════════════════

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Modo auth
  if (authMode === 'code') {
    chatInput.value = '';
    addMessage('••••••', 'user');
    await handleAuthCode(text);
    return;
  }
  if (authMode === '2fa') {
    chatInput.value = '';
    addMessage('••••••••••', 'user');
    await handleAuth2FA(text);
    return;
  }

  // Modo consulta
  if (isProcessing) return;
  isProcessing = true;
  chatInput.value = '';
  setInputDisabled(true);

  addMessage(text, 'user');
  await sleep(200);
  showTyping('consultando telegram...');

  try {
    const res  = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: text, session_id: sessionId })
    });
    const json = await res.json();

    await sleep(350);
    hideTyping();

    if (!res.ok || json.error) {
      await typeMessage(`⚠ ${json.error || `Erro HTTP ${res.status}`}`, 12);
    } else {
      await typeMessage(json.message || 'Consulta realizada.', 13);
      if (json.data) showResult(json.data, detectType(text));
    }

  } catch {
    hideTyping();
    await typeMessage('Falha de conexão com o servidor.', 11);
    setStatus('error', 'OFFLINE');
  }

  isProcessing = false;
  setInputMode('normal');
}

// ══════════════════════════════════════════════════════════════
// WELCOME
// ══════════════════════════════════════════════════════════════

function renderWelcome() {
  const el = document.createElement('div');
  el.className = 'welcome-msg';
  el.innerHTML = `
    <h3>◈ SYS//CONSULTA</h3>
    <p>Sistema integrado ao Telegram. Comandos disponíveis:</p>
    <div class="cmd-list">
      <div class="cmd-list-item"><strong>/placa</strong> FLR7671 — consulta veicular</div>
      <div class="cmd-list-item"><strong>/nome</strong> João Silva — busca por nome</div>
      <div class="cmd-list-item"><strong>/cpf</strong> 12345678900 — consulta CPF</div>
    </div>
  `;
  messagesArea.appendChild(el);
}

// ══════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.querySelectorAll('.input-hints span').forEach(hint => {
  hint.addEventListener('click', () => {
    if (authMode) return;
    chatInput.value = hint.dataset.cmd || '';
    chatInput.focus();
  });
});

themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  html.setAttribute('data-theme',
    html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  );
  if (window._update3DTheme) window._update3DTheme();
});

// ══════════════════════════════════════════════════════════════
// THREE.JS 3D BACKGROUND
// ══════════════════════════════════════════════════════════════

(function init3D() {
  const canvas   = document.getElementById('bg-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
  camera.position.z = 5;

  const icoGeo  = new THREE.IcosahedronGeometry(1.85, 1);
  const icoMat  = new THREE.MeshBasicMaterial({ color:0xffffff, wireframe:true, transparent:true, opacity:0.11 });
  const ico     = new THREE.Mesh(icoGeo, icoMat);
  scene.add(ico);

  const innerGeo = new THREE.IcosahedronGeometry(1.3, 1);
  const innerMat = new THREE.MeshBasicMaterial({ color:0x555555, wireframe:true, transparent:true, opacity:0.07 });
  const inner    = new 
