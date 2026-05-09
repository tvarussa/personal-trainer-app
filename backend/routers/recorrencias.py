from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Recorrencia, Aluno, FrequenciaRecorrencia
from routers.auth import require_personal

router = APIRouter(prefix="/recorrencias", tags=["recorrencias"])

DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


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


@router.delete("/{recorrencia_id}")
def remover_recorrencia(recorrencia_id: int, db: Session = Depends(get_db), _=Depends(require_personal)):
    r = db.query(Recorrencia).filter(Recorrencia.id == recorrencia_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")
    r.ativo = False
    db.commit()
    return {"ok": True}
