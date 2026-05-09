from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from database import get_db, Recorrencia, Aluno, FrequenciaRecorrencia, OcorrenciaCancelada
from routers.auth import require_personal, get_usuario_atual

router = APIRouter(prefix="/recorrencias", tags=["recorrencias"])

DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


class CancelarOcorrencia(BaseModel):
    data: str  # "YYYY-MM-DD"


class CriarRecorrencia(BaseModel):
    aluno_id: int
    dia_semana: int  # 0=segunda ... 6=domingo
    horario: str    # "HH:MM"
    frequencia: FrequenciaRecorrencia = FrequenciaRecorrencia.semanal


@router.get("/")
def listar_recorrencias(aluno_id: int | None = None, db: Session = Depends(get_db), _=Depends(require_personal)):
    query = db.query(Recorrencia).filter(Recorrencia.ativo == True)
    if aluno_id:
        query = query.filter(Recorrencia.aluno_id == aluno_id)
    recorrencias = query.all()
    return [
        {
            "id": r.id,
            "aluno_id": r.aluno_id,
            "nome_aluno": r.aluno.usuario.nome,
            "dia_semana": r.dia_semana,
            "dia_semana_nome": DIAS_SEMANA[r.dia_semana],
            "horario": r.horario,
            "frequencia": r.frequencia,
        }
        for r in recorrencias
    ]


@router.post("/", status_code=201)
def criar_recorrencia(dados: CriarRecorrencia, db: Session = Depends(get_db), _=Depends(require_personal)):
    aluno = db.query(Aluno).filter(Aluno.id == dados.aluno_id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    duplicada = db.query(Recorrencia).filter(
        Recorrencia.aluno_id == dados.aluno_id,
        Recorrencia.dia_semana == dados.dia_semana,
        Recorrencia.horario == dados.horario,
        Recorrencia.ativo == True,
    ).first()
    if duplicada:
        raise HTTPException(status_code=400, detail="Recorrência já existe para este aluno neste horário")

    r = Recorrencia(
        aluno_id=dados.aluno_id,
        dia_semana=dados.dia_semana,
        horario=dados.horario,
        frequencia=dados.frequencia,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "dia_semana_nome": DIAS_SEMANA[r.dia_semana], "horario": r.horario}


@router.get("/cancelamentos")
def listar_cancelamentos(
    mes: str | None = None,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_atual),
):
    aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
    if not aluno:
        return []

    query = (
        db.query(OcorrenciaCancelada)
        .join(Recorrencia, OcorrenciaCancelada.recorrencia_id == Recorrencia.id)
        .filter(Recorrencia.aluno_id == aluno.id)
        .order_by(OcorrenciaCancelada.data.desc())
    )
    if mes:
        query = query.filter(OcorrenciaCancelada.data.like(f"{mes}%"))

    return [
        {
            "id": c.id,
            "recorrencia_id": c.recorrencia_id,
            "data": c.data,
            "horario": c.recorrencia.horario,
            "dia_semana_nome": DIAS_SEMANA[c.recorrencia.dia_semana],
            "cancelado_em": c.cancelado_em,
        }
        for c in query.all()
    ]


@router.post("/{recorrencia_id}/cancelar-ocorrencia")
def cancelar_ocorrencia(
    recorrencia_id: int,
    dados: CancelarOcorrencia,
    db: Session = Depends(get_db),
    usuario=Depends(get_usuario_atual),
):
    rec = db.query(Recorrencia).filter(Recorrencia.id == recorrencia_id, Recorrencia.ativo == True).first()  # noqa: E712
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")

    if usuario.perfil == "aluno":
        al = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
        if not al or rec.aluno_id != al.id:
            raise HTTPException(status_code=403, detail="Sem permissão")

    try:
        hora, minuto = map(int, rec.horario.split(":"))
        dt_ocorrencia = datetime.strptime(dados.data, "%Y-%m-%d").replace(hour=hora, minute=minuto)
        if dt_ocorrencia < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Não é possível cancelar uma aula já passada")
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida")

    existente = db.query(OcorrenciaCancelada).filter(
        OcorrenciaCancelada.recorrencia_id == recorrencia_id,
        OcorrenciaCancelada.data == dados.data,
    ).first()
    if existente:
        raise HTTPException(status_code=400, detail="Esta ocorrência já foi cancelada")

    db.add(OcorrenciaCancelada(recorrencia_id=recorrencia_id, data=dados.data))
    db.commit()
    return {"ok": True}


@router.delete("/{recorrencia_id}")
def remover_recorrencia(recorrencia_id: int, db: Session = Depends(get_db), _=Depends(require_personal)):
    r = db.query(Recorrencia).filter(Recorrencia.id == recorrencia_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")
    r.ativo = False
    db.commit()
    return {"ok": True}
