from sqlalchemy.orm import Session
from database import Notificacao, Usuario, PerfilEnum


def criar_notificacao(db: Session, destinatario_id: int, mensagem: str):
    n = Notificacao(destinatario_id=destinatario_id, mensagem=mensagem)
    db.add(n)
    # Não faz commit — quem chama é responsável pelo commit


def notificar_personal(db: Session, mensagem: str):
    """Envia notificação para todos os personals ativos."""
    personals = db.query(Usuario).filter(
        Usuario.perfil == PerfilEnum.personal,
        Usuario.ativo == True,
    ).all()
    for p in personals:
        criar_notificacao(db, p.id, mensagem)
