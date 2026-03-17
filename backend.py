"""
SYS//CONSULTA - Backend
Flask + Telethon com StringSession

DEPLOY:
  1. pip install -r requirements.txt
  2. python backend.py
  3. Abra http://localhost:5000
  4. Na primeira vez: o chat vai pedir o código SMS do Telegram
  5. Sessão salva em jarvis.session para sempre
"""

import asyncio
import os
import re
import threading
import logging

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
)

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("jarvis")

# ── Credenciais ───────────────────────────────────────────────
API_ID   = 34303434
API_HASH = "5d521f53f9721a6376586a014b51173d"
PHONE    = "+5541974010817"
GRUPO    = -1002421438612
CHAVE    = "Skibidi toilet gamer Sigma redz Pill 1234"
PORT     = int(os.environ.get("PORT", 5000))

SESSION_FILE = "jarvis.session"

# ── Flask ─────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ── Estado global ─────────────────────────────────────────────
loop           = None
client         = None
pending        = {}
telegram_ready = threading.Event()

auth = {
    "step":            None,
    "phone_code_hash": None,
    "code_future":     None,
    "twofa_future":    None,
    "error":           None,
}

# ══════════════════════════════════════════════════════════════
# SESSION
# ══════════════════════════════════════════════════════════════

def load_session():
    if os.path.exists(SESSION_FILE):
        with open(SESSION_FILE, "r") as f:
            s = f.read().strip()
        if s:
            log.info("Sessao encontrada — login automatico")
            return StringSession(s)
    log.info("Nenhuma sessao — iniciando autenticacao pelo chat")
    return StringSession()

def save_session():
    s = client.session.save()
    with open(SESSION_FILE, "w") as f:
        f.write(s)
    log.info("Sessao salva em %s", SESSION_FILE)

# ══════════════════════════════════════════════════════════════
# TEXTO
# ══════════════════════════════════════════════════════════════

def limpar(texto):
    for r in ["@QueryBuscasBot", "https://t.me/querybuscas", "ID \u23af", "ID \u2014"]:
        texto = texto.replace(r, "")
    texto = re.sub(r"\((\d+)\)", r"\1", texto)
    texto = "\n".join(l.strip() for l in texto.splitlines() if l.strip())
    return texto.strip()

def parse(texto):
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
# ROTAS
# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/api/status")
def api_status():
    return jsonify({
        "ok":         True,
        "telegram":   telegram_ready.is_set(),
        "needs_auth": auth["step"] in ("code", "2fa"),
        "auth_step":  auth["step"],
        "auth_error": auth["error"],
    })

@app.route("/api/auth", methods=["POST"])
def api_auth():
    body  = request.get_json(force=True, silent=True) or {}
    step  = body.get("step", "")
    value = body.get("value", "").strip()

    if not value:
        return jsonify({"error": "Valor vazio."}), 400

    auth["error"] = None

    if step == "code":
        if auth["code_future"] and not auth["code_future"].done():
            loop.call_soon_threadsafe(auth["code_future"].set_result, value)
            return jsonify({"ok": True})
        return jsonify({"error": "Nenhuma autenticacao aguardando codigo."}), 400

    if step == "2fa":
        if auth["twofa_future"] and not auth["twofa_future"].done():
            loop.call_soon_threadsafe(auth["twofa_future"].set_result, value)
            return jsonify({"ok": True})
        return jsonify({"error": "Nenhuma autenticacao aguardando senha."}), 400

    return jsonify({"error": "Step invalido."}), 400

@app.route("/api/query", methods=["POST"])
def api_query():
    if not telegram_ready.is_set():
        msg = "Conclua o login primeiro." if auth["step"] in ("code","2fa") else "Telegram nao conectado."
        return jsonify({"error": msg}), 503

    body    = request.get_json(force=True, silent=True) or {}
    comando = body.get("command", "").strip()
    sess    = body.get("session_id", "default")

    if not comando:
        return jsonify({"error": "Nenhum comando."}), 400
    if not comando.startswith("/"):
        return jsonify({"error": "Comandos devem comecar com /"}), 400

    log.info("Comando: %s [%s]", comando, sess)

    try:
        dados = asyncio.run_coroutine_threadsafe(
            enviar_aguardar(comando, sess, 45), loop
        ).result(timeout=50)
        return jsonify({"message": "Consulta concluida.", "data": dados})

    except TimeoutError:
        pending.pop(sess, None)
        return jsonify({"error": "Bot nao respondeu em 45s."}), 504

    except Exception as e:
        log.error("Erro: %s", e)
        return jsonify({"error": str(e)}), 500

# ══════════════════════════════════════════════════════════════
# ASYNC
# ══════════════════════════════════════════════════════════════

async def enviar_aguardar(comando, sess, timeout):
    future = loop.create_future()
    pending[sess] = future
    try:
        await client.send_message(GRUPO, comando)
        return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError()
    finally:
        pending.pop(sess, None)

def setup_handlers():
    @client.on(events.NewMessage(chats=GRUPO))
    async def receber(event):
        if not event.message.document:
            return
        log.info("Arquivo recebido — processando...")
        caminho = None
        try:
            caminho = await event.message.download_media(file="downloads/")
            with open(caminho, "r", encoding="utf-8", errors="ignore") as f:
                texto = f.read()
            if CHAVE and CHAVE in texto:
                texto = texto.split(CHAVE, 1)[1]
            texto = limpar(texto)
            dados = parse(texto)
            log.info("Campos: %s", list(dados.keys()))
            for sid, future in list(pending.items()):
                if not future.done():
                    future.set_result(dados)
                    log.info("Resultado -> sessao %s", sid)
                    break
            else:
                log.warning("Arquivo sem consulta pendente.")
        except Exception as e:
            log.error("Erro ao processar: %s", e)
            for sid, future in list(pending.items()):
                if not future.done():
                    future.set_exception(Exception(str(e)))
                    break
        finally:
            if caminho and os.path.exists(caminho):
                try: os.remove(caminho)
                except: pass

# ══════════════════════════════════════════════════════════════
# AUTH FLOW
# ══════════════════════════════════════════════════════════════

async def autenticar():
    global auth
    try:
        result = await client.send_code_request(PHONE)
        auth["phone_code_hash"] = result.phone_code_hash
        log.info("Codigo SMS enviado para %s", PHONE)

        auth["code_future"] = loop.create_future()
        auth["step"]        = "code"
        auth["error"]       = None

        codigo = await asyncio.wait_for(auth["code_future"], timeout=300)
        auth["step"] = None

        try:
            await client.sign_in(
                phone=PHONE, code=codigo,
                phone_code_hash=auth["phone_code_hash"]
            )

        except SessionPasswordNeededError:
            log.info("2FA necessario")
            auth["twofa_future"] = loop.create_future()
            auth["step"]         = "2fa"
            auth["error"]        = None
            senha = await asyncio.wait_for(auth["twofa_future"], timeout=300)
            auth["step"] = None
            await client.sign_in(password=senha)

        except PhoneCodeInvalidError:
            auth["error"] = "Codigo incorreto. Tente novamente."
            auth["step"]  = "code"
            auth["code_future"] = loop.create_future()
            codigo = await asyncio.wait_for(auth["code_future"], timeout=300)
            auth["step"] = None
            await client.sign_in(
                phone=PHONE, code=codigo,
                phone_code_hash=auth["phone_code_hash"]
            )

        except PhoneCodeExpiredError:
            auth["error"] = "Codigo expirado. Reinicie o servidor."
            auth["step"]  = None
            return False

        save_session()
        auth["step"]  = "done"
        auth["error"] = None
        log.info("Autenticacao concluida!")
        return True

    except asyncio.TimeoutError:
        auth["error"] = "Tempo esgotado. Reinicie o servidor."
        auth["step"]  = None
        return False
    except Exception as e:
        auth["error"] = str(e)
        auth["step"]  = None
        log.error("Erro na autenticacao: %s", e)
        return False

# ══════════════════════════════════════════════════════════════
# THREAD TELEGRAM
# ══════════════════════════════════════════════════════════════

def run_telegram():
    global loop, client
    os.makedirs("downloads", exist_ok=True)

    loop   = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client = TelegramClient(load_session(), API_ID, API_HASH, loop=loop)

    async def start():
        await client.connect()
        if not await client.is_user_authorized():
            ok = await autenticar()
            if not ok:
                log.error("Falha na autenticacao")
                return
        else:
            log.info("Sessao valida — login automatico")
            save_session()

        me = await client.get_me()
        log.info("Conectado como: %s (%s)", me.first_name, me.phone)
        setup_handlers()
        telegram_ready.set()
        await client.run_until_disconnected()

    try:
        loop.run_until_complete(start())
    except Exception as e:
        log.error("Erro critico: %s", e)

# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════╗
║   SYS//CONSULTA  —  iniciando...     ║
╚══════════════════════════════════════╝
""")
    threading.Thread(target=run_telegram, daemon=True).start()
    log.info("Servidor em http://0.0.0.0:%d", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
