import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import criar_tabelas
from routers import auth, usuarios, alunos, agendamentos, slots, financeiro, notificacoes, recorrencias, configuracoes, backup, bloqueios, dashboard
from services.scheduler import iniciar_scheduler, parar_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    criar_tabelas()
    _criar_personal_padrao()
    iniciar_scheduler()
    yield
    parar_scheduler()


app = FastAPI(title="Personal Trainer API", version="1.0.0", lifespan=lifespan)

_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(usuarios.router, prefix="/api")
app.include_router(alunos.router, prefix="/api")
app.include_router(agendamentos.router, prefix="/api")
app.include_router(slots.router, prefix="/api")
app.include_router(financeiro.router, prefix="/api")
app.include_router(notificacoes.router, prefix="/api")
app.include_router(recorrencias.router, prefix="/api")
app.include_router(configuracoes.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(bloqueios.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


def _criar_personal_padrao():
    from database import SessionLocal, Usuario, PerfilEnum
    from routers.auth import gerar_hash_senha

    db = SessionLocal()
    try:
        if not db.query(Usuario).filter(Usuario.perfil == PerfilEnum.personal).first():
            personal = Usuario(
                nome="Personal Trainer",
                email="personal@app.com",
                senha_hash=gerar_hash_senha("123456"),
                perfil=PerfilEnum.personal,
            )
            db.add(personal)
            db.commit()
            print("Usuário personal criado: personal@app.com / 123456")
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}
