from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from database import get_db, Agendamento, SlotDisponivel, Aluno, Usuario, StatusAgendamento, TipoAgendamento
from routers.auth import get_usuario_atual, require_personal
from services.notificacoes import notificar_personal

router = APIRouter(prefix="/agendamentos", tags=["agendamentos"])

ANTECEDENCIA_MINIMA_HORAS = 24


class CriarAgendamento(BaseModel):
    slot_id: int
    aluno_id: int | None = None  # personal pode especificar; aluno usa o próprio
    tipo: TipoAgendamento = TipoAgendamento.avulso


class AgendamentoResponse(BaseModel):
    id: int
    slot_id: int
    aluno_id: int
    tipo: str
    status: str
    cancelado_com_antecedencia: bool
    cobrado: bool

    class Config:
        from_attributes = True


def _slot_ou_404(slot_id: int, db: Session) -> SlotDisponivel:
    slot = db.query(SlotDisponivel).filter(SlotDisponivel.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")
    return slot


@router.get("/")
def listar_agendamentos(db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    if usuario.perfil == "personal":
        agendamentos = db.query(Agendamento).all()
    else:
        aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
        if not aluno:
            return []
        agendamentos = db.query(Agendamento).filter(Agendamento.aluno_id == aluno.id).all()

    return [
        {
            "id": a.id,
            "slot_id": a.slot_id,
            "data_hora": a.slot.data_hora,
            "aluno_id": a.aluno_id,
            "nome_aluno": a.aluno.usuario.nome,
            "tipo": a.tipo,
            "status": a.status,
            "cobrado": a.cobrado,
        }
        for a in agendamentos
    ]


@router.post("/", status_code=201)
def criar_agendamento(dados: CriarAgendamento, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    slot = _slot_ou_404(dados.slot_id, db)

    if not slot.disponivel or slot.bloqueado_pelo_personal:
        raise HTTPException(status_code=400, detail="Slot indisponível")

    if db.query(Agendamento).filter(
        Agendamento.slot_id == dados.slot_id,
        Agendamento.status == StatusAgendamento.confirmado
    ).first():
        raise HTTPException(status_code=400, detail="Slot já ocupado")

    # Aluno agenda por conta própria — usa o próprio id
    if usuario.perfil == "aluno":
        aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
        if not aluno:
            raise HTTPException(status_code=404, detail="Perfil de aluno não encontrado")
        aluno_id = aluno.id
    else:
        if not dados.aluno_id:
            raise HTTPException(status_code=400, detail="aluno_id obrigatório para o personal")
        aluno_id = dados.aluno_id

    agendamento = Agendamento(
        aluno_id=aluno_id,
        slot_id=dados.slot_id,
        tipo=dados.tipo,
        status=StatusAgendamento.confirmado,
    )
    slot.disponivel = False
    db.add(agendamento)
    db.flush()

    # Notifica personal apenas quando o próprio aluno agendou
    if usuario.perfil == "aluno":
        nome = usuario.nome
        data_hora = slot.data_hora.strftime("%d/%m às %H:%M")
        notificar_personal(db, f"📅 {nome} agendou uma aula para {data_hora}.")

    db.commit()
    db.refresh(agendamento)
    return agendamento


@router.post("/{agendamento_id}/cancelar")
def cancelar_agendamento(agendamento_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    agendamento = db.query(Agendamento).filter(Agendamento.id == agendamento_id).first()
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")

    if usuario.perfil == "aluno":
        aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
        if not aluno or agendamento.aluno_id != aluno.id:
            raise HTTPException(status_code=403, detail="Sem permissão para cancelar este agendamento")

    if agendamento.status != StatusAgendamento.confirmado:
        raise HTTPException(status_code=400, detail="Agendamento não pode ser cancelado")

    horas_restantes = (agendamento.slot.data_hora - datetime.utcnow()).total_seconds() / 3600
    agendamento.cancelado_com_antecedencia = horas_restantes >= ANTECEDENCIA_MINIMA_HORAS
    agendamento.status = StatusAgendamento.cancelado
    agendamento.slot.disponivel = True

    # Notifica personal apenas quando o aluno cancelou
    if usuario.perfil == "aluno":
        nome = usuario.nome
        data_hora = agendamento.slot.data_hora.strftime("%d/%m às %H:%M")
        aviso_cobrança = " (será cobrado)" if not agendamento.cancelado_com_antecedencia else ""
        notificar_personal(db, f"❌ {nome} cancelou a aula de {data_hora}{aviso_cobrança}.")

    db.commit()

    return {
        "ok": True,
        "cobrado": not agendamento.cancelado_com_antecedencia,
        "aviso": None if agendamento.cancelado_com_antecedencia else "Cancelamento com menos de 24h — aula será cobrada",
    }
