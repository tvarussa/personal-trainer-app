from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date
from database import get_db, Agendamento, Aluno, Usuario, Financeiro, SlotDisponivel, StatusAgendamento, OcorrenciaCancelada, Recorrencia
from routers.auth import require_personal, get_usuario_atual

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/personal")
def dashboard_personal(db: Session = Depends(get_db), _=Depends(require_personal)):
    hoje = date.today()
    mes_ref = hoje.strftime("%Y-%m")
    agora = datetime.utcnow()

    aulas_hoje = (
        db.query(Agendamento)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.status == StatusAgendamento.confirmado,
            SlotDisponivel.data_hora >= datetime(hoje.year, hoje.month, hoje.day),
            SlotDisponivel.data_hora < datetime(hoje.year, hoje.month, hoje.day, 23, 59, 59),
        )
        .count()
    )

    alunos_ativos = db.query(Aluno).join(Aluno.usuario).filter(Usuario.ativo == True).count()

    financeiros_mes = db.query(Financeiro).filter(Financeiro.mes_referencia == mes_ref).all()
    receita_mes = sum(f.total for f in financeiros_mes if f.pago)
    pendente = sum(f.total for f in financeiros_mes if not f.pago)

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
        "receita_mes": receita_mes,
        "pendente_cobrar": pendente,
        "proximas_aulas": proximas_aulas,
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
