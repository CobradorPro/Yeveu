/* ============================================================
   CONSULTA PRO — script.js
   Chat engine + API integration + Data rendering
   ============================================================ */

'use strict';

// ── Config ──────────────────────────────────────────────────
const CONFIG = {
  apiUrl: 'http://localhost:5000/chat',     // ← Altere para o endpoint do seu backend
  requestTimeout: 15000,                    // ms
  commands: ['/placa', '/nome', '/cpf'],
};

// ── State ────────────────────────────────────────────────────
let queryCount = 0;
let isLoading  = false;

// ── DOM ──────────────────────────────────────────────────────
const chatMessages  = document.getElementById('chatMessages');
const chatInput     = document.getElementById('chatInput');
const sendBtn       = document.getElementById('sendBtn');
const btnClear      = document.getElementById('btnClear');
const queryCountEl  = document.getElementById('queryCount');
const welcomeState  = document.getElementById('welcomeState');
const apiEndpointEl = document.getElementById('apiEndpoint');
const navCmds       = document.querySelectorAll('.nav-cmd');
const chips         = document.querySelectorAll('.chip');

// ── Init ─────────────────────────────────────────────────────
apiEndpointEl.textContent = CONFIG.apiUrl;

// ── Helpers ──────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const win = document.getElementById('chatWindow');
    win.scrollTo({ top: win.scrollHeight, behavior: 'smooth' });
  });
}

function hideWelcome() {
  if (welcomeState && welcomeState.parentNode) {
    welcomeState.style.animation = 'none';
    welcomeState.style.opacity   = '0';
    welcomeState.style.transform = 'translateY(-6px)';
    welcomeState.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => welcomeState.remove(), 220);
  }
}

function incrementCounter() {
  queryCount++;
  queryCountEl.textContent = queryCount;
  queryCountEl.style.animation = 'none';
  queryCountEl.offsetHeight; // reflow
  queryCountEl.style.animation = 'fadeSlideUp 0.3s ease forwards';
}

// ── Sidebar active state ──────────────────────────────────────
navCmds.forEach(btn => {
  btn.addEventListener('click', () => {
    navCmds.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cmd = btn.dataset.cmd;
    chatInput.value = cmd;
    chatInput.focus();
    updateSendBtn();
  });
});

// ── Chip shortcuts ────────────────────────────────────────────
chips.forEach(chip => {
  chip.addEventListener('click', () => {
    chatInput.value = chip.dataset.cmd;
    chatInput.focus();
    updateSendBtn();
  });
});

// ── Input logic ───────────────────────────────────────────────
function updateSendBtn() {
  const val = chatInput.value.trim();
  sendBtn.disabled = !val || isLoading;
}

chatInput.addEventListener('input', updateSendBtn);

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
    e.preventDefault();
    handleSend();
  }
});

sendBtn.addEventListener('click', () => {
  if (!isLoading) handleSend();
});

btnClear.addEventListener('click', () => {
  clearChat();
});

// ── Message builders ──────────────────────────────────────────
function buildUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message user';
  wrap.innerHTML = `
    <div class="message-meta">
      <span style="font-size:11px;color:var(--text-muted)">${now()}</span>
      <div class="meta-avatar">U</div>
    </div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  return wrap;
}

function buildLoadingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.id = 'loadingMsg';
  wrap.innerHTML = `
    <div class="message-meta">
      <div class="meta-avatar">AI</div>
      <span style="font-size:11px;color:var(--text-muted)">Processando…</span>
    </div>
    <div class="loading-bubble">
      <div class="loading-dots">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
      <span class="loading-text">consultando base de dados</span>
    </div>
  `;
  return wrap;
}

function buildErrorBubble(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.innerHTML = `
    <div class="message-meta">
      <div class="meta-avatar">AI</div>
      <span style="font-size:11px;color:var(--text-muted)">${now()}</span>
    </div>
    <div class="message-bubble error-bubble">⚠ ${escapeHtml(msg)}</div>
  `;
  return wrap;
}

function buildTextBubble(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.innerHTML = `
    <div class="message-meta">
      <div class="meta-avatar">AI</div>
      <span style="font-size:11px;color:var(--text-muted)">${now()}</span>
    </div>
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  return wrap;
}

// ── Data card builder ─────────────────────────────────────────
function buildDataCard(data, command) {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';

  const cardEl = document.createElement('div');
  cardEl.className = 'data-card';

  const cmd   = (command || '').toLowerCase();
  let icon    = '📋';
  let title   = 'Resultado';
  if (cmd.includes('placa')) { icon = '🚗'; title = 'Consulta Veicular'; }
  else if (cmd.includes('nome')) { icon = '👤'; title = 'Consulta Cadastral'; }
  else if (cmd.includes('cpf'))  { icon = '🪪'; title = 'Consulta de Documento'; }

  // Header
  cardEl.innerHTML = `
    <div class="card-header">
      <div class="card-header-left">
        <span class="card-icon">${icon}</span>
        <span class="card-title">${title}</span>
      </div>
      <span class="card-badge">✓ Encontrado</span>
    </div>
    <div class="card-body" id="cardBodyInner"></div>
    <div class="card-footer">
      <div class="card-footer-ts">${now()} — resposta em tempo real</div>
      <span style="font-family:'DM Mono',monospace">ID:${Math.random().toString(36).slice(2,8).toUpperCase()}</span>
    </div>
  `;

  const body = cardEl.querySelector('#cardBodyInner');

  // Render fields from object
  const entries = Object.entries(data);
  entries.forEach(([key, value], idx) => {
    const field = document.createElement('div');
    const isHighlight = idx === 0;
    const isFullWidth = String(value).length > 30;
    field.className = `card-field${isFullWidth ? ' full-width' : ''}`;
    field.innerHTML = `
      <span class="field-label">${formatLabel(key)}</span>
      <span class="field-value${isHighlight ? ' highlight' : ''}">${escapeHtml(String(value))}</span>
    `;
    body.appendChild(field);
  });

  wrap.innerHTML = `
    <div class="message-meta">
      <div class="meta-avatar">AI</div>
      <span style="font-size:11px;color:var(--text-muted)">${now()}</span>
    </div>
  `;
  wrap.appendChild(cardEl);
  return wrap;
}

// ── Raw response builder ──────────────────────────────────────
function buildRawResponse(text) {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  const raw = document.createElement('div');
  raw.className = 'raw-response';
  raw.innerHTML = `
    <div class="raw-header">
      <div class="raw-dot"></div>
      <span>resposta do servidor · ${now()}</span>
    </div>
    <pre class="raw-body">${escapeHtml(text)}</pre>
  `;
  wrap.innerHTML = `
    <div class="message-meta">
      <div class="meta-avatar">AI</div>
      <span style="font-size:11px;color:var(--text-muted)">${now()}</span>
    </div>
  `;
  wrap.appendChild(raw);
  return wrap;
}

// ── Core send flow ────────────────────────────────────────────
async function handleSend() {
  const text = chatInput.value.trim();
  if (!text || isLoading) return;

  hideWelcome();
  setLoading(true);

  // User message
  chatMessages.appendChild(buildUserMessage(text));
  chatInput.value = '';
  updateSendBtn();
  scrollToBottom();

  // Loading indicator
  const loadingEl = buildLoadingBubble();
  chatMessages.appendChild(loadingEl);
  scrollToBottom();

  try {
    const response = await fetchWithTimeout(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    }, CONFIG.requestTimeout);

    loadingEl.remove();

    if (!response.ok) {
      chatMessages.appendChild(buildErrorBubble(`Erro HTTP ${response.status}: ${response.statusText}`));
    } else {
      const contentType = response.headers.get('content-type') || '';
      let resultEl;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        // If it's a { response: "..." } wrapper, unwrap and try JSON
        const payload = json?.response ?? json?.data ?? json?.result ?? json;
        if (typeof payload === 'string') {
          resultEl = tryParseAndRender(payload, text);
        } else if (typeof payload === 'object' && payload !== null) {
          resultEl = buildDataCard(flattenObject(payload), text);
        } else {
          resultEl = buildTextBubble(String(payload));
        }
      } else {
        const raw = await response.text();
        resultEl = tryParseAndRender(raw, text);
      }

      chatMessages.appendChild(resultEl);
      incrementCounter();
    }
  } catch (err) {
    loadingEl.remove();
    const msg = err.name === 'AbortError'
      ? 'Tempo esgotado. Verifique se o backend está rodando.'
      : `Não foi possível conectar ao backend.\n${err.message}`;
    chatMessages.appendChild(buildErrorBubble(msg));
  }

  setLoading(false);
  scrollToBottom();
}

// Attempt to parse raw text as JSON; if so build card, else raw display
function tryParseAndRender(text, command) {
  try {
    const obj = JSON.parse(text);
    if (typeof obj === 'object' && obj !== null) {
      return buildDataCard(flattenObject(obj), command);
    }
  } catch (_) { /* not json */ }

  // Try to detect key:value lines (structured text)
  const structured = parseStructuredText(text);
  if (structured && Object.keys(structured).length >= 2) {
    return buildDataCard(structured, command);
  }

  return buildRawResponse(text);
}

// Parse "KEY\nVALUE\n..." style text
function parseStructuredText(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const result = {};
  for (let i = 0; i < lines.length - 1; i += 2) {
    const key = lines[i];
    const val = lines[i + 1];
    // Skip if value looks like another key (all-caps, short)
    if (key && val) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Flatten nested objects for card display
function flattenObject(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v, key));
    } else {
      out[key] = Array.isArray(v) ? v.join(', ') : v;
    }
  }
  return out;
}

// ── Utilities ─────────────────────────────────────────────────
function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLabel(key) {
  return key
    .replace(/[_\-.]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toUpperCase();
}

function setLoading(val) {
  isLoading = val;
  sendBtn.disabled = val;
  if (val) {
    sendBtn.classList.add('loading');
    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  } else {
    sendBtn.classList.remove('loading');
    sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    updateSendBtn();
  }
}

function clearChat() {
  chatMessages.innerHTML = '';
  queryCount = 0;
  queryCountEl.textContent = '0';

  // Restore welcome state
  const ws = document.createElement('div');
  ws.id = 'welcomeState';
  ws.className = 'welcome-state';
  ws.innerHTML = `
    <div class="welcome-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h2 class="welcome-title">Pronto para consultar</h2>
    <p class="welcome-desc">Digite um comando ou selecione um atalho no painel lateral para iniciar uma consulta.</p>
    <div class="welcome-chips">
      <button class="chip" data-cmd="/placa FLR7671">/placa FLR7671</button>
      <button class="chip" data-cmd="/nome João Silva">/nome João Silva</button>
      <button class="chip" data-cmd="/cpf 12345678900">/cpf 12345678900</button>
    </div>
  `;
  chatMessages.appendChild(ws);

  // Rebind chip events
  ws.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.dataset.cmd;
      chatInput.focus();
      updateSendBtn();
    });
  });
}

// ── Demo mode (no backend) ─────────────────────────────────────
// Intercepts calls when backend is unreachable and shows sample data.
// Remove this block in production.
const _originalFetch = window.fetch;
window.fetch = async function(url, options) {
  if (String(url).includes('localhost')) {
    // Try real fetch first; if it fails, return demo data
    try {
      return await _originalFetch(url, options);
    } catch (_) {
      return buildDemoResponse(options);
    }
  }
  return _originalFetch(url, options);
};

function buildDemoResponse(options) {
  const body = JSON.parse(options?.body || '{}');
  const msg  = (body.message || '').toLowerCase();
  let demo;

  if (msg.includes('/placa')) {
    const placa = body.message.split(' ').slice(1).join(' ').toUpperCase() || 'FLR7671';
    demo = {
      placa,
      marca_modelo: 'VW TIGUAN 2.0 TSI',
      ano_fabricacao: '2014',
      ano_modelo: '2015',
      cor: 'BRANCA',
      proprietario: '60437944000152',
      municipio: 'SÃO PAULO - SP',
      renavam: '01234567890',
      situacao: 'REGULAR',
    };
  } else if (msg.includes('/nome')) {
    const nome = body.message.split(' ').slice(1).join(' ') || 'João Silva';
    demo = {
      nome: nome.toUpperCase(),
      cpf: '123.456.789-00',
      data_nascimento: '15/03/1985',
      sexo: 'MASCULINO',
      mae: 'MARIA DA SILVA',
      municipio: 'CAMPINAS - SP',
      situacao_cpf: 'REGULAR',
    };
  } else if (msg.includes('/cpf')) {
    const cpf = body.message.split(' ').slice(1).join(' ') || '12345678900';
    demo = {
      cpf,
      nome: 'JOÃO DA SILVA SANTOS',
      data_nascimento: '22/07/1990',
      sexo: 'MASCULINO',
      mae: 'ANA SANTOS',
      municipio: 'RIO DE JANEIRO - RJ',
      situacao: 'REGULAR',
    };
  } else {
    demo = { mensagem: `Comando não reconhecido: ${body.message}`, dica: 'Use /placa, /nome ou /cpf' };
  }

  const json = JSON.stringify(demo);
  return new Response(json, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
     }
      
