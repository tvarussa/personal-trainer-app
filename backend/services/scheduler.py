"""
Scheduler para fechamento mensal automático e envio de cobranças via WhatsApp.
Roda no dia 1 de cada mês às 08:00.
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, date
import asyncio

scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")


def _mes_anterior() -> str:
    hoje = date.today()
    if hoje.month == 1:
        return f"{hoje.year - 1}-12"
    return f"{hoje.year}-{str(hoje.month - 1).padStart(2, '0')}"


def _mes_anterior_str() -> str:
    hoje = date.today()
    ano = hoje.year
    mes = hoje.month - 1
    if mes == 0:
        mes = 12
        ano -= 1
    return f"{ano}-{str(mes).zfill(2)}"


async def fechar_mes_e_cobrar():
    from database import SessionLocal, Financeiro, Aluno
    from routers.financeiro import fechar_mes
    from services.whatsapp import enviar_mensagem, montar_mensagem_cobranca, carregar_config

    mes = _mes_anterior_str()
    print(f"[Scheduler] Iniciando fechamento automático de {mes}...")

    db = SessionLocal()
    try:
        # Importa a lógica de fechamento diretamente
        from routers.financeiro import _mes_para_datas
        from database import Agendamento, StatusAgendamento
        from calendar import monthrange

        inicio, fim = _mes_para_datas(mes)
        inicio_dt = datetime(inicio.year, inicio.month, inicio.day)
        fim_dt = datetime(fim.year, fim.month, fim.day, 23, 59, 59)

        agendamentos = db.query(Agendamento).join(Agendamento.slot).all()
        agendamentos_mes = [a for a in agendamentos if inicio_dt <= a.slot.data_hora <= fim_dt]

        por_aluno: dict[int, list] = {}
        for a in agendamentos_mes:
            por_aluno.setdefault(a.aluno_id, []).append(a)

        config_zap = carregar_config()
        zap_ativo = bool(config_zap.get("provedor"))

        for aluno_id, aulas in por_aluno.items():
            aluno = db.query(Aluno).filter(Aluno.id == aluno_id).first()
            if not aluno:
                continue

            aulas_cobradas = [
                a for a in aulas
                if not (a.status == StatusAgendamento.cancelado and a.cancelado_com_antecedencia)
            ]
            qtd = len(aulas_cobradas)
            valor_aulas = round(qtd * aluno.preco_por_aula, 2)
            taxa = aluno.taxa_mensal
            total = round(valor_aulas + taxa, 2)

            from database import Financeiro
            registro = db.query(Financeiro).filter(
                Financeiro.aluno_id == aluno_id,
                Financeiro.mes_referencia == mes,
            ).first()

            if not registro:
                registro = Financeiro(
                    aluno_id=aluno_id, mes_referencia=mes,
                    quantidade_aulas=qtd, valor_aulas=valor_aulas,
                    taxa_mensal=taxa, total=total, pago=False,
                )
                db.add(registro)
            else:
                registro.quantidade_aulas = qtd
                registro.valor_aulas = valor_aulas
                registro.taxa_mensal = taxa
                registro.total = total

            for a in aulas_cobradas:
                a.cobrado = True

            db.commit()
            print(f"[Scheduler] Fechado {mes} para aluno {aluno_id}: R$ {total:.2f}")

            # Envia WhatsApp se configurado e aluno tem telefone
            if zap_ativo and aluno.usuario.telefone and total > 0:
                msg = montar_mensagem_cobranca(
                    aluno.usuario.nome, mes, qtd, valor_aulas, taxa, total
                )
                result = await enviar_mensagem(aluno.usuario.telefone, msg)
                status = "✓" if result.get("ok") else f"✗ {result.get('erro')}"
                print(f"[Scheduler] WhatsApp para {aluno.usuario.nome}: {status}")

    except Exception as e:
        print(f"[Scheduler] Erro no fechamento automático: {e}")
    finally:
        db.close()


def iniciar_scheduler():
    scheduler.add_job(
        fechar_mes_e_cobrar,
        CronTrigger(day=1, hour=8, minute=0, timezone="America/Sao_Paulo"),
        id="fechamento_mensal",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    print("[Scheduler] Iniciado — fechamento automático todo dia 1 às 08:00")


def parar_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)


def proxima_execucao() -> str | None:
    job = scheduler.get_job("fechamento_mensal")
    if job and job.next_run_time:
        return job.next_run_time.strftime("%d/%m/%Y %H:%M")
    return None
