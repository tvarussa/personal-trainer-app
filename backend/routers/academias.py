from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Academia
from routers.auth import require_personal

router = APIRouter(prefix="/academias", tags=["academias"])


class CriarAcademia(BaseModel):
    nome: str
    endereco: str | None = None


@router.get("/")
def listar_academias(db: Session = Depends(get_db), _=Depends(require_personal)):
    return [
        {"id": a.id, "nome": a.nome, "endereco": a.endereco}
        for a in db.query(Academia).filter(Academia.ativo == True).order_by(Academia.nome).all()  # noqa: E712
    ]


@router.post("/", status_code=201)
def criar_academia(dados: CriarAcademia, db: Session = Depends(get_db), _=Depends(require_personal)):
    if not dados.nome.strip():
        raise HTTPException(status_code=400, detail="Nome é obrigatório")
    existente = db.query(Academia).filter(Academia.nome == dados.nome.strip(), Academia.ativo == True).first()  # noqa: E712
    if existente:
        raise HTTPException(status_code=400, detail="Academia já cadastrada com este nome")
    a = Academia(nome=dados.nome.strip(), endereco=dados.endereco)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "nome": a.nome, "endereco": a.endereco}


@router.delete("/{academia_id}")
def remover_academia(academia_id: int, db: Session = Depends(get_db), _=Depends(require_personal)):
    a = db.query(Academia).filter(Academia.id == academia_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Academia não encontrada")
    a.ativo = False
    db.commit()
    return {"ok": True}
