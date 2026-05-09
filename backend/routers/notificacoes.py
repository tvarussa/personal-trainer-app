from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db, Notificacao, Usuario
from routers.auth import get_usuario_atual

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


@router.get("/")
def listar_notificacoes(db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    return db.query(Notificacao).filter(
        Notificacao.destinatario_id == usuario.id
    ).order_by(Notificacao.criada_em.desc()).limit(50).all()


@router.get("/nao-lidas")
def contar_nao_lidas(db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    total = db.query(Notificacao).filter(
        Notificacao.destinatario_id == usuario.id,
        Notificacao.lida == False,
    ).count()
    return {"total": total}


@router.post("/marcar-todas-lidas")
def marcar_todas_lidas(db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    db.query(Notificacao).filter(
        Notificacao.destinatario_id == usuario.id,
        Notificacao.lida == False,
    ).update({"lida": True})
    db.commit()
    return {"ok": True}


@router.patch("/{notificacao_id}/lida")
def marcar_lida(notificacao_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    n = db.query(Notificacao).filter(
        Notificacao.id == notificacao_id,
        Notificacao.destinatario_id == usuario.id,
    ).first()
    if n:
        n.lida = True
        db.commit()
    return {"ok": True}
