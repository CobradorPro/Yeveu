"""
╔══════════════════════════════════════════════════════════════╗
║  SYS//CONSULTA — Backend                                     ║
║  Flask + Telethon com StringSession                          ║
╚══════════════════════════════════════════════════════════════╝

PRIMEIRO USO:
  1. pip install -r requirements.txt
  2. python backend.py
  3. Abra http://localhost:5000  — o chat pede o código SMS
  4. Digite o código → sessão salva em session_string.txt

QUALQUER OUTRA MÁQUINA:
  - Copie session_string.txt junto com os arquivos
  - python backend.py  →  entra direto, sem pedir nada
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

# ── Logging ──────────────────────────────────────────────────
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
PORT     = 5000

SESSION_FILE = "session_string.txt"

# ── Flask ─────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ── Estado global ─────────────────────────────────────────────
loop           = None
client         = None
pending        = {}
telegram_ready = threading.Event()

auth = {
    "step":            None,   # None | "code" | "2fa" | "done"
    "phone_code_hash": None,
    "code_future":     None,
    "twofa_future":    None,
    "error":           None,
}

# ══════════════════════════════════════════════════════════════
# SESSION STRING
# ══════════════════════════════════════════════════════════════

def carregar_session() -> StringSession:
    if os.path.exists(SESSION_FILE):
        with open(SESSION_FILE, "r") as f:
            s = f.read().strip()
        if s:
            log.info("Sessao existente encontrada — login automatico")
            return StringSession(s)
    log.info("Nenhuma sessao salva — iniciando autenticacao pelo chat")
    return StringSession()


def salvar_session():
    session_str = client.session.save()
    with open(SESSION_FILE, "w") as f:
        f.write(session_str)
    log.info(f"Sessao salva em {SESSION_FILE}")


# ══════════════════════════════════════════════════════════════
# UTILITÁRIOS
# ══════════════════════════════════════════════════════════════

def limpar_texto(texto: str) -> str:
    for r in ["@QueryBuscasBot", "https://t.me/querybuscas", "ID \u23af", "ID \u2014"]:
        texto = texto.replace(r, "")
    texto = re.sub(r"\((\d+)\)", r"\1", texto)
    texto = "\n".join(l.strip() for l in texto.splitlines() if l.strip())
    return texto.strip()


def parse_campos(texto: str) -> dict:
    linhas = [l for l in texto.splitlines() if l.strip()]
    if len(linhas) < 2:
        return {"RESULTADO": texto}
    campos = {}
    i = 0
    while i < len(linhas) - 1:
        rotulo = linhas[i].strip().upper()
        valor  = linhas[i + 1].strip()
        if len(rotulo) <= 40 and not rotulo[0].isdigit():
            campos[rotulo] = valor
            i += 2
        else:
            campos[f"INFO {i+1}"] = linhas[i]
            i += 1
    if i < len(linhas):
        campos[f"INFO {i+1}"] = linhas[i]
    return campos if campos else {"RESULTADO": texto}


# ══════════════════════════════════════════════════════════════
# ROTAS
# ══════════════════════════════════════════════════════════════

@app.route("/")
def serve_index():
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
    step  = body.get("step")
    value = body.get("value", "").strip()

    if not value:
        return jsonify({"error": "Campo vazio."}), 400

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
        return jsonify({"error": "Nenhuma autenticacao aguardando senha 2FA."}), 400

    return jsonify({"error": f"Step invalido: {step}"}), 400


@app.route("/api/query", methods=["POST"])
def api_query():
    if not telegram_ready.is_set():
        if auth["step"] in ("code", "2fa"):
            return jsonify({"error": "Conclua o login primeiro."}), 503
        return jsonify({"error": "Telegram nao conectado. Aguarde."}), 503

    body    = request.get_json(force=True, silent=True) or {}
    comando = body.get("command", "").strip()
    sess_id = body.get("session_id", "default")

    if not comando:
        return jsonify({"error": "Nenhum comando enviado."}), 400
    if not comando.startswith("/"):
        return jsonify({"error": "Comandos devem comecar com /"}), 400

    log.info(f"Comando -> {comando}  [{sess_id}]")

    try:
        dados = asyncio.run_coroutine_threadsafe(
            enviar_e_aguardar(comando, sess_id, timeout=45), loop
        ).result(timeout=50)
        return jsonify({"message": "Consulta concluida.", "data": dados})

    except TimeoutError:
        pending.pop(sess_id, None)
        return jsonify({"error": "Bot nao respondeu em 45s."}), 504

    except Exception as e:
        log.error(f"Erro: {e}")
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════
# ASYNC — envio e recebimento
# ══════════════════════════════════════════════════════════════

async def enviar_e_aguardar(comando: str, sess_id: str, timeout: int = 45) -> dict:
    future = loop.create_future()
    pending[sess_id] = future
    try:
        await client.send_message(GRUPO, comando)
        return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
    except asyncio.TimeoutError:
        raise TimeoutError()
    finally:
        pending.pop(sess_id, None)


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

            texto = limpar_texto(texto)
            dados = parse_campos(texto)
            log.info(f"Campos: {list(dados.keys())}")

            for sid, future in list(pending.items()):
                if not future.done():
                    future.set_result(dados)
                    log.info(f"Resultado -> sessao {sid}")
                    break
            else:
                log.warning("Arquivo sem consulta pendente.")

        except Exception as e:
            log.error(f"Erro ao processar arquivo: {e}")
            for sid, future in list(pending.items()):
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
# AUTENTICAÇÃO — fluxo via frontend
# ══════════════════════════════════════════════════════════════

async def autenticar() -> bool:
    global auth

    log.info("Iniciando autenticacao pelo chat...")

    try:
        result = await client.send_code_request(PHONE)
        auth["phone_code_hash"] = result.phone_code_hash
        log.info(f"Codigo SMS enviado para {PHONE}")

        # Sinaliza ao frontend: aguarda código
        auth["code_future"] = loop.create_future()
        auth["step"]        = "code"
        auth["error"]       = None

        codigo = await asyncio.wait_for(auth["code_future"], timeout=300)
        auth["step"] = None

        try:
            await client.sign_in(
                phone=PHONE,
                code=codigo,
                phone_code_hash=auth["phone_code_hash"]
            )

        except SessionPasswordNeededError:
            log.info("2FA ativado — aguardando senha pelo chat...")
            auth["twofa_future"] = loop.create_future()
            auth["step"]         = "2fa"
            auth["error"]        = None

            senha = await asyncio.wait_for(auth["twofa_future"], timeout=300)
            auth["step"] = None
            await client.sign_in(password=senha)

        except PhoneCodeInvalidError:
            auth["error"] = "Codigo incorreto. Tente novamente."
            auth["step"]  = "code"
            log.warning("Codigo invalido — pedindo novamente")

            auth["code_future"] = loop.create_future()
            codigo = await asyncio.wait_for(auth["code_future"], timeout=300)
            auth["step"] = None

            await client.sign_in(
                phone=PHONE, code=codigo,
                phone_code_hash=auth["phone_code_hash"]
            )

        except PhoneCodeExpiredError:
            auth["error"] = "Codigo expirado. Reinicie o servidor para receber um novo."
            auth["step"]  = None
            log.error("Codigo expirado")
            return False

        # Sucesso
        salvar_session()
        auth["step"]  = "done"
        auth["error"] = None
        log.info("Autenticacao concluida!")
        return True

    except asyncio.TimeoutError:
        auth["error"] = "Tempo esgotado. Reinicie o servidor."
        auth["step"]  = None
        log.error("Timeout na autenticacao")
        return False

    except Exception as e:
        auth["error"] = str(e)
        auth["step"]  = None
        log.error(f"Erro na autenticacao: {e}")
        return False


# ══════════════════════════════════════════════════════════════
# THREAD TELEGRAM
# ══════════════════════════════════════════════════════════════

def run_telegram():
    global loop, client

    os.makedirs("downloads", exist_ok=True)

    loop   = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client = TelegramClient(carregar_session(), API_ID, API_HASH, loop=loop)

    async def start():
        await client.connect()

        if not await client.is_user_authorized():
            ok = await autenticar()
            if not ok:
                log.error("Falha na autenticacao — servidor continua mas Telegram indisponivel")
                return
        else:
            log.info("Sessao valida — login automatico")
            salvar_session()

        me = await client.get_me()
        log.info(f"Conectado como: {me.first_name} ({me.phone})")
        setup_handlers()
        telegram_ready.set()
        await client.run_until_disconnected()

    try:
        loop.run_until_complete(start())
    except Exception as e:
        log.error(f"Erro critico: {e}")


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════╗
║   SYS//CONSULTA  —  iniciando...         ║
╚══════════════════════════════════════════╝
    """)

    threading.Thread(target=run_telegram, daemon=True).start()

    log.info(f"Servidor em http://0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
  
