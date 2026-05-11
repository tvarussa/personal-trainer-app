from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from database import get_db, Agendamento, Aluno, Usuario, Financeiro, SlotDisponivel, StatusAgendamento, OcorrenciaCancelada, Recorrencia
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
            Agendamento.status == StatusAgendamento.confirmado,
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
            "recorrente": False,
        })

    canceladas_ids = {
        oc.recorrencia_id
        for oc in db.query(OcorrenciaCancelada).filter(OcorrenciaCancelada.data == dia_str).all()
    }

    for r in db.query(Recorrencia).filter(Recorrencia.dia_semana == dia.weekday(), Recorrencia.ativo == True).all():  # noqa: E712
        if r.id in canceladas_ids or r.horario in horarios_reais:
            continue
        hora, minuto = map(int, r.horario.split(":"))
        aulas.append({
            "data_hora": datetime(dia.year, dia.month, dia.day, hora, minuto),
            "aluno": r.aluno.usuario.nome if r.aluno and r.aluno.usuario else "—",
            "recorrente": True,
        })

    return sorted(aulas, key=lambda x: x["data_hora"])


@router.get("/personal")
def dashboard_personal(db: Session = Depends(get_db), _=Depends(require_personal)):
    hoje = date.today()
    mes_ref = hoje.strftime("%Y-%m")
    agora = datetime.utcnow()

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
