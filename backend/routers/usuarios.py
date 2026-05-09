from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Usuario
from routers.auth import get_usuario_atual, gerar_hash_senha, verificar_senha
from services.notificacoes import notificar_personal

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


class AtualizarUsuario(BaseModel):
    nome: str | None = None
    telefone: str | None = None
    senha_atual: str | None = None
    nova_senha: str | None = None


class UsuarioResponse(BaseModel):
    id: int
    nome: str
    email: str
    telefone: str | None
    perfil: str

    class Config:
        from_attributes = True


@router.get("/me", response_model=UsuarioResponse)
def get_me(usuario: Usuario = Depends(get_usuario_atual)):
    return usuario


@router.put("/me", response_model=UsuarioResponse)
def atualizar_me(dados: AtualizarUsuario, usuario: Usuario = Depends(get_usuario_atual), db: Session = Depends(get_db)):
    alteracoes = []
    if dados.nome and dados.nome != usuario.nome:
        alteracoes.append("nome")
        usuario.nome = dados.nome
    if dados.telefone and dados.telefone != usuario.telefone:
        alteracoes.append("telefone")
        usuario.telefone = dados.telefone

    if dados.nova_senha:
        if not dados.senha_atual:
            raise HTTPException(status_code=400, detail="Informe a senha atual para alterar a senha")
        if not verificar_senha(dados.senha_atual, usuario.senha_hash):
            raise HTTPException(status_code=400, detail="Senha atual incorreta")
        usuario.senha_hash = gerar_hash_senha(dados.nova_senha)
        alteracoes.append("senha")

    if alteracoes and usuario.perfil == "aluno":
        campos = ", ".join(alteracoes)
        notificar_personal(db, f"✏️ {usuario.nome} atualizou os dados pessoais ({campos}).")

    db.commit()
    db.refresh(usuario)
    return usuario
