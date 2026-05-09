from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from database import get_db, Usuario, Aluno, PerfilEnum
from routers.auth import require_personal, gerar_hash_senha

router = APIRouter(prefix="/alunos", tags=["alunos"])


class CriarAluno(BaseModel):
    nome: str
    email: EmailStr
    telefone: str | None = None
    senha: str
    preco_por_aula: float = 0.0
    taxa_mensal: float = 0.0
    observacoes: str | None = None


class AtualizarAluno(BaseModel):
    nome: str | None = None
    telefone: str | None = None
    preco_por_aula: float | None = None
    taxa_mensal: float | None = None
    observacoes: str | None = None
    ativo: bool | None = None


class AlunoResponse(BaseModel):
    id: int
    preco_por_aula: float
    taxa_mensal: float
    observacoes: str | None
    usuario: dict

    class Config:
        from_attributes = True


@router.get("/")
def listar_alunos(db: Session = Depends(get_db), _=Depends(require_personal)):
    alunos = db.query(Aluno).join(Usuario).filter(Usuario.ativo == True).all()
    return [
        {
            "id": a.id,
            "usuario_id": a.usuario_id,
            "nome": a.usuario.nome,
            "email": a.usuario.email,
            "telefone": a.usuario.telefone,
            "preco_por_aula": a.preco_por_aula,
            "taxa_mensal": a.taxa_mensal,
            "observacoes": a.observacoes,
            "ativo": a.usuario.ativo,
        }
        for a in alunos
    ]


@router.post("/", status_code=201)
def criar_aluno(dados: CriarAluno, db: Session = Depends(get_db), _=Depends(require_personal)):
    if db.query(Usuario).filter(Usuario.email == dados.email).first():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    total_alunos = db.query(Aluno).join(Usuario).filter(Usuario.ativo == True).count()
    if total_alunos >= 50:
        raise HTTPException(status_code=400, detail="Limite de 50 alunos atingido")

    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        telefone=dados.telefone,
        senha_hash=gerar_hash_senha(dados.senha),
        perfil=PerfilEnum.aluno,
    )
    db.add(usuario)
    db.flush()

    aluno = Aluno(
        usuario_id=usuario.id,
        preco_por_aula=dados.preco_por_aula,
        taxa_mensal=dados.taxa_mensal,
        observacoes=dados.observacoes,
    )
    db.add(aluno)
    db.commit()
    db.refresh(aluno)
    return {"id": aluno.id, "usuario_id": usuario.id, "nome": usuario.nome, "email": usuario.email}


@router.put("/{aluno_id}")
def atualizar_aluno(aluno_id: int, dados: AtualizarAluno, db: Session = Depends(get_db), _=Depends(require_personal)):
    aluno = db.query(Aluno).filter(Aluno.id == aluno_id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    if dados.nome:
        aluno.usuario.nome = dados.nome
    if dados.telefone is not None:
        aluno.usuario.telefone = dados.telefone
    if dados.preco_por_aula is not None:
        aluno.preco_por_aula = dados.preco_por_aula
    if dados.taxa_mensal is not None:
        aluno.taxa_mensal = dados.taxa_mensal
    if dados.observacoes is not None:
        aluno.observacoes = dados.observacoes
    if dados.ativo is not None:
        aluno.usuario.ativo = dados.ativo

    db.commit()
    return {"ok": True}
