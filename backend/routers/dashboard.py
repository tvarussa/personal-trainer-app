from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from calendar import monthrange
from database import get_db, Agendamento, Aluno, Usuario, Financeiro, SlotDisponivel, StatusAgendamento, TipoAgendamento, OcorrenciaCancelada, OcorrenciaGratuita, Recorrencia
from routers.auth import require_personal, get_usuario_atual

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
    hoje = date.today()
    mes_ref = hoje.strftime("%Y-%m")
    agora = datetime.utcnow()
    mes_inicio = datetime(hoje.year, hoje.month, 1)
    mes_fim = datetime(hoje.year, hoje.month, monthrange(hoje.year, hoje.month)[1], 23, 59, 59)

    lista_hoje = _aulas_do_dia(hoje, db)
    aulas_hoje = len(lista_hoje)

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

    # Receita projetada: aulas confirmadas+realizadas no mês + taxa_mensal por aluno com ≥1 aula
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
    alunos_proj: dict[int, Aluno] = {}
    receita_aulas_proj = 0.0
    for ag, _ in agendados_mes:
        if ag.aluno and not getattr(ag, "nao_cobrar", False):
            receita_aulas_proj += ag.aluno.preco_por_aula
            alunos_proj[ag.aluno_id] = ag.aluno
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
    aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
    if not aluno:
        return {
            "proxima_aula": None,
            "aulas_mes": 0,
            "total_mes": 0.0,
            "situacao": "em_dia",
        }

    mes_ref = date.today().strftime("%Y-%m")
    agora = datetime.utcnow()

    proxima_row = (
        db.query(SlotDisponivel)
        .join(Agendamento, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.aluno_id == aluno.id,
            Agendamento.status == StatusAgendamento.confirmado,
            SlotDisponivel.data_hora >= agora,
        )
        .order_by(SlotDisponivel.data_hora)
        .first()
    )

    aulas_mes_rows = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.aluno_id == aluno.id,
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
        )
        .all()
    )
    aulas_mes_count = sum(
        1 for _, slot in aulas_mes_rows
        if slot.data_hora.strftime("%Y-%m") == mes_ref
    )

    fin = db.query(Financeiro).filter(
        Financeiro.aluno_id == aluno.id,
        Financeiro.mes_referencia == mes_ref,
    ).first()

    cancelamentos_mes = (
        db.query(OcorrenciaCancelada)
        .join(Recorrencia, OcorrenciaCancelada.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno.id,
            OcorrenciaCancelada.data.like(f"{mes_ref}%"),
        )
        .count()
    )

    return {
        "proxima_aula": proxima_row.data_hora if proxima_row else None,
        "aulas_mes": aulas_mes_count,
        "total_mes": fin.total if fin else 0.0,
        "situacao": "pago" if (fin and fin.pago) else "pendente" if fin else "em_dia",
        "cancelamentos_mes": cancelamentos_mes,
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
