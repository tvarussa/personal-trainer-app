"""
Serviço de envio de mensagens via WhatsApp.
Suporta Z-API e Evolution API — configurável via /api/configuracoes.
"""
import httpx
import json
import os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "whatsapp_config.json")


def carregar_config() -> dict:
    try:
        with open(CONFIG_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def salvar_config(config: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def _numero_limpo(numero: str) -> str:
    return "".join(c for c in numero if c.isdigit())


async def enviar_mensagem(numero: str, mensagem: str) -> dict:
    config = carregar_config()
    provedor = config.get("provedor", "")
    if not provedor:
        return {"ok": False, "erro": "WhatsApp não configurado"}

    numero = _numero_limpo(numero)
    if not numero:
        return {"ok": False, "erro": "Número inválido"}

    try:
        if provedor == "zapi":
            return await _enviar_zapi(config, numero, mensagem)
        elif provedor == "evolution":
            return await _enviar_evolution(config, numero, mensagem)
        else:
            return {"ok": False, "erro": f"Provedor desconhecido: {provedor}"}
    except Exception as e:
        return {"ok": False, "erro": str(e)}


async def _enviar_zapi(config: dict, numero: str, mensagem: str) -> dict:
    url = f"{config['url']}/instances/{config['instance_id']}/token/{config['token']}/send-text"
    payload = {"phone": numero, "message": mensagem}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return {"ok": True, "response": resp.json()}


async def _enviar_evolution(config: dict, numero: str, mensagem: str) -> dict:
    url = f"{config['url']}/message/sendText/{config['instance_id']}"
    headers = {"apikey": config["token"]}
    payload = {"number": f"{numero}@s.whatsapp.net", "text": mensagem}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return {"ok": True, "response": resp.json()}


def montar_mensagem_cobranca(nome: str, mes: str, quantidade_aulas: int,
                              valor_aulas: float, taxa_mensal: float, total: float) -> str:
    meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
             "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"]
    ano, m = mes.split("-")
    nome_mes = f"{meses[int(m)-1]}/{ano}"

    linhas = [f"Olá {nome}! 💪", f"", f"Segue o resumo de *{nome_mes}*:"]
    if quantidade_aulas > 0:
        linhas.append(f"• {quantidade_aulas} aula(s): R$ {valor_aulas:.2f}")
    if taxa_mensal > 0:
        linhas.append(f"• Taxa mensal: R$ {taxa_mensal:.2f}")
    linhas += [f"", f"*Total: R$ {total:.2f}*", f"", "Qualquer dúvida estou à disposição! 🙏"]
    return "\n".join(linhas)
