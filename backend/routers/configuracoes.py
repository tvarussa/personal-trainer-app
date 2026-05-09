from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from routers.auth import require_personal
from services.whatsapp import carregar_config, salvar_config, enviar_mensagem
from services.scheduler import proxima_execucao, fechar_mes_e_cobrar

router = APIRouter(prefix="/configuracoes", tags=["configuracoes"])

PROVEDORES_VALIDOS = {"zapi", "evolution"}


class WhatsAppConfig(BaseModel):
    provedor: str         # "zapi" | "evolution"
    url: str              # Base URL da API
    instance_id: str
    token: str            # Token ou API Key
    numero_personal: str  # Número do personal para teste


class TestarWhatsApp(BaseModel):
    numero: str
    mensagem: str = "Teste de conexão do app Personal Trainer ✅"


@router.get("/whatsapp")
def get_whatsapp_config(_=Depends(require_personal)):
    config = carregar_config()
    # Não retorna o token completo por segurança
    if config.get("token"):
        config["token"] = config["token"][:6] + "..." + config["token"][-4:]
    return config


@router.put("/whatsapp")
def salvar_whatsapp_config(dados: WhatsAppConfig, _=Depends(require_personal)):
    if dados.provedor not in PROVEDORES_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Provedor inválido. Use: {', '.join(PROVEDORES_VALIDOS)}")

    salvar_config({
        "provedor": dados.provedor,
        "url": dados.url.rstrip("/"),
        "instance_id": dados.instance_id,
        "token": dados.token,
        "numero_personal": dados.numero_personal,
    })
    return {"ok": True}


@router.delete("/whatsapp")
def remover_whatsapp_config(_=Depends(require_personal)):
    salvar_config({})
    return {"ok": True}


@router.post("/whatsapp/testar")
async def testar_whatsapp(dados: TestarWhatsApp, _=Depends(require_personal)):
    result = await enviar_mensagem(dados.numero, dados.mensagem)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("erro", "Falha no envio"))
    return {"ok": True, "detalhe": "Mensagem enviada com sucesso"}


@router.get("/scheduler")
def get_scheduler_status(_=Depends(require_personal)):
    return {"proxima_execucao": proxima_execucao()}


@router.post("/scheduler/executar-agora")
async def executar_agora(background_tasks: BackgroundTasks, _=Depends(require_personal)):
    background_tasks.add_task(fechar_mes_e_cobrar)
    return {"ok": True, "mensagem": "Fechamento iniciado em background"}
