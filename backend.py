"""
SYS//CONSULTA - Backend
Baseado no script original que funciona.

PRIMEIRO USO:
  1. pip install -r requirements.txt
  2. python backend.py
  3. Abra http://localhost:5000
  4. O chat vai pedir o código SMS do Telegram
  5. Digite o código — sessão salva em jarvis_session.session

PRÓXIMOS USOS:
  - python backend.py → conecta direto, sem pedir nada
  - Para usar em outra máquina: copie jarvis_session.session junto
"""

import asyncio
import os
import re
import threading
import logging

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("jarvis")

# ── Credenciais (igual ao seu script original) ────────────────
api_id   = 34303434
api_hash = "5d521f53f9721a6376586a014b51173d"
phone    = "+5541974010817"
grupo    = -1002421438612
chave    = "Skibidi toilet gamer Sigma redz Pill 1234"
PORT     = int(os.environ.get("PORT", 5000))

# ── Flask ─────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ── Estado global ─────────────────────────────────────────────
_loop           = None
_client         = None
_pending        = {}           # { session_id: asyncio.Future }
_telegram_ready = threading.Event()

_auth = {
    "step":        None,       # None | "code" | "2fa" | "done"
    "code_hash":   None,
    "code_fut":    None,
    "twofa_fut":   None,
    "error":       None,
}

# ══════════════════════════════════════════════════════════════
# LIMPEZA DE TEXTO (igual ao script original)
# ══════════════════════════════════════════════════════════════

def limpar_texto(texto):
    texto = texto.replace("@QueryBuscasBot", "")
    texto = texto.replace("https://t.me/querybuscas", "")
    texto = texto.replace("ID ⎯", "")
    texto = texto.replace("ID —", "")
    texto = re.sub(r"\((\d+)\)", r"\1", texto)
    texto = "\n".join(l.strip() for l in texto.splitlines() if l.strip())
    return texto.strip()

def parse_campos(texto):
    linhas = [l for l in texto.splitlines() if l.strip()]
    if len(linhas) < 2:
        return {"RESULTADO": texto}
    campos = {}
    i = 0
    while i < len(linhas) - 1:
        rot = linhas[i].strip().upper()
        val = linhas[i+1].strip()
        if len(rot) <= 40 and not rot[0].isdigit():
            campos[rot] = val
            i += 2
        else:
            campos["INFO %d" % (i+1)] = linhas[i]
            i += 1
    if i < len(linhas):
        campos["INFO %d" % (i+1)] = linhas[i]
    return campos if campos else {"RESULTADO": texto}

# ══════════════════════════════════════════════════════════════
# ROTAS FLASK
# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/api/status")
def api_status():
    return jsonify({
        "ok":         True,
        "telegram":   _telegram_ready.is_set(),
        "needs_auth": _auth["step"] in ("code", "2fa"),
        "auth_step":  _auth["step"],
        "auth_error": _auth["error"],
    })

@app.route("/api/auth", methods=["POST"])
def api_auth():
    body  = request.get_json(force=True, silent=True) or {}
    step  = body.get("step", "")
    value = body.get("value", "").strip()

    if not value:
        return jsonify({"error": "Campo vazio."}), 400

    _auth["error"] = None

    if step == "code":
        if _auth["code_fut"] and not _auth["code_fut"].done():
            _loop.call_soon_threadsafe(_auth["code_fut"].set_result, value)
            return jsonify({"ok": True})
        return jsonify({"error": "Nenhuma autenticacao aguardando codigo."}), 400

    if step == "2fa":
        if _auth["twofa_fut"] and not _auth["twofa_fut"].done():
            _loop.call_soon_threadsafe(_auth["twofa_fut"].set_result, value)
            return jsonify({"ok": True})
        return jsonify({"error": "Nenhuma autenticacao aguardando senha."}), 400

    return jsonify({"error": "Step invalido."}), 400

@app.route("/api/query", methods=["POST"])
def api_query():
    if not _telegram_ready.is_set():
        if _auth["step"] in ("code", "2fa"):
            return jsonify({"error": "Conclua o login primeiro."}), 503
        return jsonify({"error": "Telegram nao conectado. Aguarde."}), 503

    body    = request.get_json(force=True, silent=True) or {}
    comando = body.get("command", "").strip()
    sess    = body.get("session_id", "default")

    if not comando:
        return jsonify({"error": "Nenhum comando enviado."}), 400
    if not comando.startswith("/"):
        return jsonify({"error": "Comandos devem comecar com /"}), 400

    log.info("Comando: %s [%s]", comando, sess)

    try:
        dados = asyncio.run_coroutine_threadsafe(
            _enviar_aguardar(comando, sess, timeout=45),
            _loop
        ).result(timeout=50)
        return jsonify({"message": "Consulta concluida.", "data": dados})

    except TimeoutError:
        _pending.pop(sess, None)
        return jsonify({"error": "Bot nao respondeu em 45s."}), 504

    except Exception as e:
        log.error("Erro: %s", e)
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════
# LÓGICA ASSÍNCRONA
# ══════════════════════════════════════════════════════════════

async def _enviar_aguardar(comando, sess, timeout):
    future = _loop.create_future()
    _pending[sess] = future
    try:
        await _client.send_message(grupo, comando)
        log.info("Mensagem enviada: %s", comando)
        return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError()
    finally:
        _pending.pop(sess, None)

def _setup_handlers():
    @_client.on(events.NewMessage(chats=grupo))
    async def handler(event):
        # Mesmo padrão do script original
        if not event.message.document:
            return

        log.info("Arquivo recebido — processando...")
        caminho = None

        try:
            caminho = await event.message.download_media(file="downloads/")

            with open(caminho, "r", encoding="utf-8", errors="ignore") as f:
                texto = f.read()

            if chave and chave in texto:
                texto = texto.split(chave, 1)[1]

            texto = limpar_texto(texto)
            dados = parse_campos(texto)

            log.info("Campos extraidos: %s", list(dados.keys()))

            # Entrega ao primeiro Future pendente (FIFO)
            for sid, future in list(_pending.items()):
                if not future.done():
                    future.set_result(dados)
                    log.info("Resultado -> sessao %s", sid)
                    break
            else:
                log.warning("Arquivo recebido mas sem consulta pendente.")

        except Exception as e:
            log.error("Erro ao processar arquivo: %s", e)
            for sid, future in list(_pending.items()):
                if not future.done():
                    future.set_exception(Exception(str(e)))
                    break

        finally:
            if caminho and os.path.exists(caminho):
                try:
                    os.remove(caminho)
                except Exception:
                    pass

# ══════════════════════════════════════════════════════════════
# AUTENTICAÇÃO PELO CHAT (primeiro uso)
# ══════════════════════════════════════════════════════════════

async def _autenticar():
    try:
        log.info("Enviando codigo SMS para %s...", phone)
        result = await _client.send_code_request(phone)
        _auth["code_hash"] = result.phone_code_hash

        # Sinaliza ao frontend
        _auth["code_fut"] = _loop.create_future()
        _auth["step"]     = "code"
        _auth["error"]    = None

        log.info("Aguardando codigo via chat...")
        codigo = await asyncio.wait_for(_auth["code_fut"], timeout=300)
        _auth["step"] = None

        try:
            await _client.sign_in(
                phone=phone,
                code=codigo,
                phone_code_hash=_auth["code_hash"]
            )

        except SessionPasswordNeededError:
            log.info("2FA ativado — aguardando senha via chat...")
            _auth["twofa_fut"] = _loop.create_future()
            _auth["step"]      = "2fa"
            _auth["error"]     = None

            senha = await asyncio.wait_for(_auth["twofa_fut"], timeout=300)
            _auth["step"] = None
            await _client.sign_in(password=senha)

        _auth["step"]  = "done"
        _auth["error"] = None
        log.info("Login concluido!")
        return True

    except asyncio.TimeoutError:
        _auth["error"] = "Tempo esgotado. Reinicie o servidor."
        _auth["step"]  = None
        log.error("Timeout na autenticacao")
        return False

    except Exception as e:
        _auth["error"] = str(e)
        _auth["step"]  = None
        log.error("Erro na autenticacao: %s", e)
        return False

# ══════════════════════════════════════════════════════════════
# THREAD DO TELEGRAM
# ══════════════════════════════════════════════════════════════

def _run_telegram():
    global _loop, _client

    os.makedirs("downloads", exist_ok=True)

    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)

    # Usa session file igual ao script original (jarvis_session.session)
    _client = TelegramClient("jarvis_session", api_id, api_hash, loop=_loop)

    async def _start():
        # client.start() com callback para pegar o código via chat
        # Se já tem sessão salva: conecta direto
        # Se não tem: chama _autenticar() que pede pelo chat
        await _client.connect()

        if await _client.is_user_authorized():
            log.info("Sessao valida — conectando automaticamente...")
        else:
            log.info("Sem sessao — iniciando autenticacao pelo chat...")
            ok = await _autenticar()
            if not ok:
                log.error("Autenticacao falhou — Telegram indisponivel")
                return

        me = await _client.get_me()
        log.info("Conectado como: %s (%s)", me.first_name, me.phone)

        _setup_handlers()
        _telegram_ready.set()

        await _client.run_until_disconnected()

    try:
        _loop.run_until_complete(_start())
    except Exception as e:
        log.error("Erro critico no Telegram: %s", e)

# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════╗
║   SYS//CONSULTA  —  iniciando...     ║
╚══════════════════════════════════════╝
""")
    t = threading.Thread(target=_run_telegram, daemon=True)
    t.start()

    log.info("Servidor em http://0.0.0.0:%d", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
      
