from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from calendar import monthrange
from database import get_db, Agendamento, Aluno, Usuario, Financeiro, SlotDisponivel, StatusAgendamento, TipoAgendamento, OcorrenciaCancelada, OcorrenciaGratuita, Recorrencia
from routers.auth import require_personal, get_usuario_atual
from utils import agora_brasil, hoje_brasil

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _aulas_do_dia(dia: date, db: Session) -> list[dict]:
    """Retorna todas as aulas (reais confirmadas + recorrentes ativas) de um dia."""
    dia_str = dia.strftime("%Y-%m-%d")
    dia_inicio = datetime(dia.year, dia.month, dia.day)
    dia_fim = datetime(dia.year, dia.month, dia.day, 23, 59, 59)

    reais = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            SlotDisponivel.data_hora >= dia_inicio,
            SlotDisponivel.data_hora <= dia_fim,
        )
        .all()
    )

    horarios_reais: set[str] = set()
    aulas: list[dict] = []
    for ag, slot in reais:
        horarios_reais.add(slot.data_hora.strftime("%H:%M"))
        aulas.append({
            "data_hora": slot.data_hora,
            "aluno": ag.aluno.usuario.nome if ag.aluno and ag.aluno.usuario else "—",
            "academia": ag.aluno.academia.nome if ag.aluno and ag.aluno.academia else None,
            "recorrente": False,
            "agendamento_id": ag.id,
            "recorrencia_id": None,
            "cobrar": not getattr(ag, "nao_cobrar", False),
            "realizado": ag.status == StatusAgendamento.realizado,
        })

    canceladas_ids = {
        oc.recorrencia_id
        for oc in db.query(OcorrenciaCancelada).filter(OcorrenciaCancelada.data == dia_str).all()
    }
    gratuitas_ids = {
        og.recorrencia_id
        for og in db.query(OcorrenciaGratuita).filter(OcorrenciaGratuita.data == dia_str).all()
    }

    for r in db.query(Recorrencia).filter(Recorrencia.dia_semana == dia.weekday(), Recorrencia.ativo == True).all():  # noqa: E712
        if r.id in canceladas_ids or r.horario in horarios_reais:
            continue
        hora, minuto = map(int, r.horario.split(":"))
        aulas.append({
            "data_hora": datetime(dia.year, dia.month, dia.day, hora, minuto),
            "aluno": r.aluno.usuario.nome if r.aluno and r.aluno.usuario else "—",
            "academia": r.aluno.academia.nome if r.aluno and r.aluno.academia else None,
            "recorrente": True,
            "agendamento_id": None,
            "recorrencia_id": r.id,
            "cobrar": r.id not in gratuitas_ids,
            "realizado": False,
        })

    return sorted(aulas, key=lambda x: x["data_hora"])


@router.get("/personal")
def dashboard_personal(db: Session = Depends(get_db), _=Depends(require_personal)):
    hoje = hoje_brasil()
    mes_ref = hoje.strftime("%Y-%m")
    agora = agora_brasil()
    mes_inicio = datetime(hoje.year, hoje.month, 1)
    mes_fim = datetime(hoje.year, hoje.month, monthrange(hoje.year, hoje.month)[1], 23, 59, 59)

    lista_hoje = _aulas_do_dia(hoje, db)
    aulas_hoje = len(lista_hoje)

    # Aulas na semana (segunda a domingo da semana atual)
    semana_inicio = hoje - timedelta(days=hoje.weekday())
    aulas_semana = sum(len(_aulas_do_dia(semana_inicio + timedelta(days=i), db)) for i in range(7))

    # Aulas no mês (todos os dias do mês corrente)
    dias_no_mes = monthrange(hoje.year, hoje.month)[1]
    aulas_mes = sum(len(_aulas_do_dia(date(hoje.year, hoje.month, d), db)) for d in range(1, dias_no_mes + 1))

    proximo_dia: dict | None = None
    for i in range(1, 31):
        d = hoje + timedelta(days=i)
        aulas_d = _aulas_do_dia(d, db)
        if aulas_d:
            proximo_dia = {"data": d.strftime("%Y-%m-%d"), "aulas": aulas_d}
            break

    alunos_ativos = db.query(Aluno).join(Aluno.usuario).filter(Usuario.ativo == True).count()

    # Receita realizada: aulas com status=realizado no mês, excluindo nao_cobrar
    realizados = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.status == StatusAgendamento.realizado,
            SlotDisponivel.data_hora >= mes_inicio,
            SlotDisponivel.data_hora <= mes_fim,
        )
        .all()
    )
    receita_realizada = round(sum(
        ag.aluno.preco_por_aula
        for ag, _ in realizados
        if ag.aluno and not getattr(ag, "nao_cobrar", False)
    ), 2)

    # Receita projetada: agendamentos reais + recorrências virtuais do mês + taxa_mensal
    agendados_mes = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            SlotDisponivel.data_hora >= mes_inicio,
            SlotDisponivel.data_hora <= mes_fim,
        )
        .all()
    )

    # Agrupa agendamentos reais por aluno e mapeia horários ocupados por dia
    horarios_reais_por_dia: dict[str, set] = {}
    aulas_reais_por_aluno: dict[int, int] = {}
    aluno_por_id: dict[int, Aluno] = {}
    for ag, slot in agendados_mes:
        if not ag.aluno or getattr(ag, "nao_cobrar", False):
            continue
        dia_str = slot.data_hora.strftime("%Y-%m-%d")
        hora_str = slot.data_hora.strftime("%H:%M")
        horarios_reais_por_dia.setdefault(dia_str, set()).add(hora_str)
        aulas_reais_por_aluno[ag.aluno_id] = aulas_reais_por_aluno.get(ag.aluno_id, 0) + 1
        aluno_por_id[ag.aluno_id] = ag.aluno

    # Carrega ocorrências canceladas e gratuitas do mês
    mes_str_inicio = mes_inicio.strftime("%Y-%m-%d")
    mes_str_fim = mes_fim.strftime("%Y-%m-%d")
    canceladas_mes = {
        (oc.recorrencia_id, oc.data)
        for oc in db.query(OcorrenciaCancelada).filter(
            OcorrenciaCancelada.data >= mes_str_inicio,
            OcorrenciaCancelada.data <= mes_str_fim,
        ).all()
    }
    gratuitas_mes = {
        (og.recorrencia_id, og.data)
        for og in db.query(OcorrenciaGratuita).filter(
            OcorrenciaGratuita.data >= mes_str_inicio,
            OcorrenciaGratuita.data <= mes_str_fim,
        ).all()
    }

    # Conta aulas virtuais (recorrências não cobertas por agendamento real)
    virtual_por_aluno: dict[int, int] = {}
    for r in db.query(Recorrencia).filter(Recorrencia.ativo == True).all():  # noqa: E712
        if not r.aluno:
            continue
        aluno_por_id[r.aluno_id] = r.aluno
        for d in range(1, dias_no_mes + 1):
            dia = date(hoje.year, hoje.month, d)
            if dia.weekday() != r.dia_semana:
                continue
            dia_str = dia.strftime("%Y-%m-%d")
            if (r.id, dia_str) in canceladas_mes or (r.id, dia_str) in gratuitas_mes:
                continue
            if r.horario in horarios_reais_por_dia.get(dia_str, set()):
                continue
            virtual_por_aluno[r.aluno_id] = virtual_por_aluno.get(r.aluno_id, 0) + 1

    # Calcula receita projetada
    alunos_proj: dict[int, Aluno] = {}
    receita_aulas_proj = 0.0
    for aluno_id, count in aulas_reais_por_aluno.items():
        aluno = aluno_por_id.get(aluno_id)
        if aluno:
            receita_aulas_proj += count * aluno.preco_por_aula
            alunos_proj[aluno_id] = aluno
    for aluno_id, count in virtual_por_aluno.items():
        aluno = aluno_por_id.get(aluno_id)
        if aluno:
            receita_aulas_proj += count * aluno.preco_por_aula
            alunos_proj[aluno_id] = aluno
    receita_projetada = round(
        receita_aulas_proj + sum(a.taxa_mensal for a in alunos_proj.values()), 2
    )

    # Pendente pagamento: registros financeiros do mês não pagos
    financeiros_mes = db.query(Financeiro).filter(Financeiro.mes_referencia == mes_ref).all()
    pendente_pagamento = round(sum(f.total for f in financeiros_mes if not f.pago), 2)

    proximas_rows = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .join(Aluno, Agendamento.aluno_id == Aluno.id)
        .join(Usuario, Aluno.usuario_id == Usuario.id)
        .filter(
            Agendamento.status == StatusAgendamento.confirmado,
            SlotDisponivel.data_hora >= agora,
        )
        .order_by(SlotDisponivel.data_hora)
        .limit(5)
        .all()
    )

    proximas_aulas = [
        {
            "id": ag.id,
            "aluno": ag.aluno.usuario.nome if ag.aluno and ag.aluno.usuario else "—",
            "data_hora": slot.data_hora,
        }
        for ag, slot in proximas_rows
    ]

    return {
        "aulas_hoje": aulas_hoje,
        "aulas_semana": aulas_semana,
        "aulas_mes": aulas_mes,
        "alunos_ativos": alunos_ativos,
        "receita_realizada": receita_realizada,
        "receita_projetada": receita_projetada,
        "pendente_pagamento": pendente_pagamento,
        "proximas_aulas": proximas_aulas,
        "lista_hoje": lista_hoje,
        "proximo_dia": proximo_dia,
    }


@router.get("/aluno")
def dashboard_aluno(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    import traceback as _tb
    try:
        return _dashboard_aluno_impl(db, usuario)
    except Exception as exc:
        print("ERRO dashboard_aluno:", _tb.format_exc())
        return {
            "_erro": str(exc),
            "aulas_semana": 0,
            "aulas_mes": 0,
            "lista_semana": [],
            "lista_proxima_semana": [],
            "valor_projetado": 0.0,
            "valor_devido": 0.0,
            "valor_pago": 0.0,
        }


def _dashboard_aluno_impl(db: Session, usuario):
    aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
    if not aluno:
        return {
            "_debug": "aluno_nao_encontrado",
            "aulas_semana": 0,
            "aulas_mes": 0,
            "lista_semana": [],
            "lista_proxima_semana": [],
            "valor_projetado": 0.0,
            "valor_devido": 0.0,
            "valor_pago": 0.0,
        }

    hoje = hoje_brasil()
    mes_ref = hoje.strftime("%Y-%m")
    dias_no_mes = monthrange(hoje.year, hoje.month)[1]
    semana_inicio = hoje - timedelta(days=hoje.weekday())

    # Janela de busca: cobre o mês atual + próxima semana
    proxima_semana_fim = semana_inicio + timedelta(days=14)
    window_inicio = datetime(hoje.year, hoje.month, 1)
    window_fim_dt = datetime(
        proxima_semana_fim.year, proxima_semana_fim.month, proxima_semana_fim.day, 23, 59, 59
    )
    mes_fim_dt = datetime(hoje.year, hoje.month, dias_no_mes, 23, 59, 59)
    mes_str_inicio = window_inicio.strftime("%Y-%m-%d")
    mes_str_fim = mes_fim_dt.strftime("%Y-%m-%d")
    window_str_fim = window_fim_dt.strftime("%Y-%m-%d")

    # 5 queries bulk — sem loops ao banco
    ags = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.aluno_id == aluno.id,
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            SlotDisponivel.data_hora >= window_inicio,
            SlotDisponivel.data_hora <= window_fim_dt,
        )
        .all()
    )

    recorrencias = db.query(Recorrencia).filter(
        Recorrencia.aluno_id == aluno.id,
        Recorrencia.ativo == True,  # noqa: E712
    ).all()

    canceladas = {
        (oc.recorrencia_id, oc.data)
        for oc in db.query(OcorrenciaCancelada)
        .join(Recorrencia, OcorrenciaCancelada.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno.id,
            OcorrenciaCancelada.data >= mes_str_inicio,
            OcorrenciaCancelada.data <= window_str_fim,
        ).all()
    }

    gratuitas = {
        (og.recorrencia_id, og.data)
        for og in db.query(OcorrenciaGratuita)
        .join(Recorrencia, OcorrenciaGratuita.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno.id,
            OcorrenciaGratuita.data >= mes_str_inicio,
            OcorrenciaGratuita.data <= mes_str_fim,
        ).all()
    }

    fin = db.query(Financeiro).filter(
        Financeiro.aluno_id == aluno.id,
        Financeiro.mes_referencia == mes_ref,
    ).first()

    # Indexa agendamentos reais em memória por dia
    horarios_reais_por_dia: dict[str, set] = {}
    ags_por_dia: dict[str, list] = {}
    for ag, slot in ags:
        dia_str = slot.data_hora.strftime("%Y-%m-%d")
        hora_str = slot.data_hora.strftime("%H:%M")
        horarios_reais_por_dia.setdefault(dia_str, set()).add(hora_str)
        ags_por_dia.setdefault(dia_str, []).append({
            "data_hora": slot.data_hora,
            "recorrente": False,
        })

    def aulas_do_dia(dia: date) -> list[dict]:
        dia_str = dia.strftime("%Y-%m-%d")
        aulas = list(ags_por_dia.get(dia_str, []))
        hrs = horarios_reais_por_dia.get(dia_str, set())
        for r in recorrencias:
            if r.dia_semana != dia.weekday():
                continue
            if (r.id, dia_str) in canceladas:
                continue
            if r.horario in hrs:
                continue
            hora, minuto = map(int, r.horario.split(":"))
            aulas.append({
                "data_hora": datetime(dia.year, dia.month, dia.day, hora, minuto),
                "recorrente": True,
            })
        return sorted(aulas, key=lambda x: x["data_hora"])

    semana_dias = [semana_inicio + timedelta(days=i) for i in range(7)]
    proxima_semana_dias = [semana_inicio + timedelta(days=7 + i) for i in range(7)]

    lista_semana: list[dict] = []
    for d in semana_dias:
        lista_semana.extend(aulas_do_dia(d))

    lista_proxima_semana: list[dict] = []
    for d in proxima_semana_dias:
        lista_proxima_semana.extend(aulas_do_dia(d))

    aulas_semana = len(lista_semana)
    aulas_mes = sum(
        len(aulas_do_dia(date(hoje.year, hoje.month, d)))
        for d in range(1, dias_no_mes + 1)
    )

    # Valor projetado: aulas cobradas no mês × preço + taxa_mensal
    aulas_cobradas = 0
    for ag, slot in ags:
        dia_str = slot.data_hora.strftime("%Y-%m-%d")
        if mes_str_inicio <= dia_str <= mes_str_fim and not getattr(ag, "nao_cobrar", False):
            aulas_cobradas += 1
    for r in recorrencias:
        for d in range(1, dias_no_mes + 1):
            dia = date(hoje.year, hoje.month, d)
            if dia.weekday() != r.dia_semana:
                continue
            dia_str = dia.strftime("%Y-%m-%d")
            if (r.id, dia_str) in canceladas or (r.id, dia_str) in gratuitas:
                continue
            if r.horario in horarios_reais_por_dia.get(dia_str, set()):
                continue
            aulas_cobradas += 1

    valor_projetado = round(aulas_cobradas * aluno.preco_por_aula + aluno.taxa_mensal, 2)
    valor_devido = round(fin.total if (fin and not fin.pago) else 0.0, 2)
    valor_pago = round(fin.total if (fin and fin.pago) else 0.0, 2)

    print(f"DEBUG dashboard_aluno: aluno_id={aluno.id} n_rec={len(recorrencias)} n_ags={len(ags)} aulas_semana={aulas_semana} aulas_mes={aulas_mes} semana_inicio={semana_inicio}")

    return {
        "_debug": {
            "aluno_id": aluno.id,
            "n_recorrencias": len(recorrencias),
            "n_ags_window": len(ags),
            "semana_inicio": str(semana_inicio),
            "aulas_semana": aulas_semana,
        },
        "aulas_semana": aulas_semana,
        "aulas_mes": aulas_mes,
        "lista_semana": lista_semana,
        "lista_proxima_semana": lista_proxima_semana,
        "valor_projetado": valor_projetado,
        "valor_devido": valor_devido,
        "valor_pago": valor_pago,
    }


class MarcarCobranca(BaseModel):
    agendamento_id: int | None = None
    recorrencia_id: int | None = None
    data: str | None = None  # "YYYY-MM-DD" — obrigatório quando recorrencia_id
    cobrar: bool


@router.patch("/marcar-cobranca")
def marcar_cobranca(dados: MarcarCobranca, db: Session = Depends(get_db), _=Depends(require_personal)):
    if dados.agendamento_id:
        ag = db.query(Agendamento).filter(Agendamento.id == dados.agendamento_id).first()
        if not ag:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        ag.nao_cobrar = not dados.cobrar
        db.commit()
        return {"ok": True}

    if dados.recorrencia_id and dados.data:
        existente = db.query(OcorrenciaGratuita).filter(
            OcorrenciaGratuita.recorrencia_id == dados.recorrencia_id,
            OcorrenciaGratuita.data == dados.data,
        ).first()
        if dados.cobrar and existente:
            db.delete(existente)
            db.commit()
        elif not dados.cobrar and not existente:
            db.add(OcorrenciaGratuita(recorrencia_id=dados.recorrencia_id, data=dados.data))
            db.commit()
        return {"ok": True}

    raise HTTPException(status_code=400, detail="Informe agendamento_id ou recorrencia_id + data")


class ConfirmarAula(BaseModel):
    agendamento_id: int | None = None
    recorrencia_id: int | None = None
    data: str | None = None  # "YYYY-MM-DD" — obrigatório quando recorrencia_id


@router.patch("/confirmar-aula")
def confirmar_aula(dados: ConfirmarAula, db: Session = Depends(get_db), _=Depends(require_personal)):
    if dados.agendamento_id:
        ag = db.query(Agendamento).filter(Agendamento.id == dados.agendamento_id).first()
        if not ag:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        ag.status = StatusAgendamento.realizado
        db.commit()
        return {"ok": True, "agendamento_id": ag.id}

    if dados.recorrencia_id and dados.data:
        rec = db.query(Recorrencia).filter(Recorrencia.id == dados.recorrencia_id, Recorrencia.ativo == True).first()  # noqa: E712
        if not rec:
            raise HTTPException(status_code=404, detail="Recorrência não encontrada")
        try:
            hora, minuto = map(int, rec.horario.split(":"))
            data_hora = datetime.strptime(dados.data, "%Y-%m-%d").replace(hour=hora, minute=minuto)
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida")

        slot = SlotDisponivel(data_hora=data_hora, disponivel=False)
        db.add(slot)
        db.flush()
        ag = Agendamento(
            aluno_id=rec.aluno_id,
            slot_id=slot.id,
            tipo=TipoAgendamento.recorrente,
            status=StatusAgendamento.realizado,
        )
        db.add(ag)
        db.commit()
        db.refresh(ag)
        return {"ok": True, "agendamento_id": ag.id}

    raise HTTPException(status_code=400, detail="Informe agendamento_id ou recorrencia_id + data")
