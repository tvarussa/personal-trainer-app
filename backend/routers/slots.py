from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from database import get_db, SlotDisponivel, Recorrencia, FrequenciaRecorrencia, StatusAgendamento, Aluno, OcorrenciaCancelada
from utils import agora_brasil
from routers.auth import require_personal, get_usuario_atual
from routers.bloqueios import horario_bloqueado

router = APIRouter(prefix="/slots", tags=["slots"])


class CriarSlot(BaseModel):
    data_hora: datetime
    recorrente: bool = False
    semanas: int = Field(default=8, ge=1, le=52)


class BloquearSlot(BaseModel):
    bloqueado: bool


@router.get("/")
def listar_slots(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    agora = agora_brasil()
    SEMANAS_FRENTE = 26

    # Identifica o aluno_id do usuário atual (se for aluno) para marcar suas próprias recorrências
    aluno_id_atual = None
    if usuario.perfil == "aluno":
        al = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
        if al:
            aluno_id_atual = al.id

    slots_db = (
        db.query(SlotDisponivel)
        .filter(SlotDisponivel.data_hora >= agora)
        .order_by(SlotDisponivel.data_hora)
        .all()
    )

    resultado = []
    dt_reais: set[datetime] = set()

    for s in slots_db:
        hora_str = s.data_hora.strftime("%H:%M")
        data_str_s = s.data_hora.strftime("%Y-%m-%d")
        bloqueado = s.bloqueado_pelo_personal or horario_bloqueado(data_str_s, hora_str, db)
        ag = s.agendamento
        nome_aluno = None
        agendamento_id = None
        realizado = False
        if ag and ag.status in (StatusAgendamento.confirmado, StatusAgendamento.realizado) and ag.aluno and ag.aluno.usuario:
            nome_aluno = ag.aluno.usuario.nome
            agendamento_id = ag.id
            realizado = ag.status == StatusAgendamento.realizado
        resultado.append({
            "id": s.id,
            "data_hora": s.data_hora,
            "disponivel": s.disponivel and not bloqueado,
            "bloqueado_pelo_personal": bloqueado,
            "nome_aluno": nome_aluno,
            "agendamento_id": agendamento_id,
            "realizado": realizado,
        })
        dt_reais.add(s.data_hora.replace(second=0, microsecond=0))

    recorrencias = db.query(Recorrencia).filter(Recorrencia.ativo == True).all()  # noqa: E712

    cancelamentos: dict[int, set[str]] = {}
    for oc in db.query(OcorrenciaCancelada).all():
        cancelamentos.setdefault(oc.recorrencia_id, set()).add(oc.data)

    for r in recorrencias:
        try:
            hora, minuto = map(int, r.horario.split(':'))
        except Exception:
            continue
        nome_aluno = r.aluno.usuario.nome if r.aluno and r.aluno.usuario else None
        minha = aluno_id_atual is not None and r.aluno_id == aluno_id_atual
        intervalo = timedelta(weeks=1) if r.frequencia == FrequenciaRecorrencia.semanal else timedelta(days=28)
        n = SEMANAS_FRENTE if r.frequencia == FrequenciaRecorrencia.semanal else 12

        dias_ate = (r.dia_semana - agora.weekday()) % 7
        dt = (agora + timedelta(days=dias_ate)).replace(hour=hora, minute=minuto, second=0, microsecond=0)
        if dt <= agora:
            dt += intervalo

        canceladas = cancelamentos.get(r.id, set())
        for _ in range(n):
            data_str_rec = dt.strftime("%Y-%m-%d")
            if dt not in dt_reais and data_str_rec not in canceladas:
                resultado.append({
                    "id": f"rec-{r.id}-{dt.strftime('%Y%m%d%H%M')}",
                    "data_hora": dt,
                    "disponivel": False,
                    "bloqueado_pelo_personal": False,
                    "nome_aluno": nome_aluno,
                    "recorrencia": True,
                    "minha_recorrencia": minha,
                    "recorrencia_id": r.id,
                })
            dt += intervalo

    resultado.sort(key=lambda x: x["data_hora"])
    return resultado


@router.post("/", status_code=201)
def criar_slot(dados: CriarSlot, db: Session = Depends(get_db), _=Depends(require_personal)):
    if not dados.recorrente:
        data_str = dados.data_hora.strftime("%Y-%m-%d")
        hora_str = dados.data_hora.strftime("%H:%M")
        if horario_bloqueado(data_str, hora_str, db):
            raise HTTPException(status_code=400, detail="Este horário está bloqueado")
        if db.query(SlotDisponivel).filter(SlotDisponivel.data_hora == dados.data_hora).first():
            raise HTTPException(status_code=400, detail="Slot já existe neste horário")
        slot = SlotDisponivel(data_hora=dados.data_hora)
        db.add(slot)
        db.commit()
        db.refresh(slot)
        return {"criados": 1, "pulados": 0, "id": slot.id}

    criados = 0
    pulados = 0
    for semana in range(dados.semanas):
        dt = dados.data_hora + timedelta(weeks=semana)
        data_str = dt.strftime("%Y-%m-%d")
        hora_str = dt.strftime("%H:%M")
        if horario_bloqueado(data_str, hora_str, db):
            pulados += 1
            continue
        if db.query(SlotDisponivel).filter(SlotDisponivel.data_hora == dt).first():
            pulados += 1
            continue
        db.add(SlotDisponivel(data_hora=dt))
        criados += 1

    db.commit()
    return {"criados": criados, "pulados": pulados}


@router.patch("/{slot_id}/bloquear")
def bloquear_slot(slot_id: int, dados: BloquearSlot, db: Session = Depends(get_db), _=Depends(require_personal)):
    slot = db.query(SlotDisponivel).filter(SlotDisponivel.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")

    slot.bloqueado_pelo_personal = dados.bloqueado
    if dados.bloqueado:
        slot.disponivel = False
    db.commit()
    return {"ok": True}


@router.delete("/{slot_id}")
def remover_slot(slot_id: int, db: Session = Depends(get_db), _=Depends(require_personal)):
    slot = db.query(SlotDisponivel).filter(SlotDisponivel.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot não encontrado")
    db.delete(slot)
    db.commit()
    return {"ok": True}
