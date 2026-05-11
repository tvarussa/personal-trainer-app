import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import criar_tabelas, engine
from routers import auth, usuarios, alunos, agendamentos, slots, financeiro, notificacoes, recorrencias, configuracoes, backup, bloqueios, dashboard, academias
from services.scheduler import iniciar_scheduler, parar_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    criar_tabelas()
    _migrar_db()
    _criar_personal_padrao()
    iniciar_scheduler()
    yield
    parar_scheduler()


def _coluna_existe(conn, tabela: str, coluna: str) -> bool:
    from sqlalchemy import text
    is_sqlite = "sqlite" in str(engine.url)
    if is_sqlite:
        rows = conn.execute(text(f"PRAGMA table_info({tabela})")).fetchall()
        return any(r[1] == coluna for r in rows)
    rows = conn.execute(
        text("SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"),
        {"t": tabela, "c": coluna},
    ).fetchall()
    return len(rows) > 0


def _migrar_db():
    from sqlalchemy import text

    migrações = [
        ("alunos", "academia_id", "ALTER TABLE alunos ADD COLUMN academia_id INTEGER REFERENCES academias(id)"),
        ("agendamentos", "nao_cobrar", "ALTER TABLE agendamentos ADD COLUMN nao_cobrar BOOLEAN DEFAULT FALSE"),
    ]

    for tabela, coluna, sql in migrações:
        try:
            with engine.connect() as conn:
                if not _coluna_existe(conn, tabela, coluna):
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"[migração] {tabela}.{coluna} adicionada")
                else:
                    print(f"[migração] {tabela}.{coluna} já existe")
        except Exception as e:
            print(f"[migração] {tabela}.{coluna} erro: {e}")


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
app.include_router(academias.router, prefix="/api")


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
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            nao_cobrar_ok = _coluna_existe(conn, "agendamentos", "nao_cobrar")
            ocg_ok = _coluna_existe(conn, "ocorrencias_gratuitas", "id") if not "sqlite" in str(engine.url) else True
        return {"status": "ok", "nao_cobrar": nao_cobrar_ok, "ocorrencias_gratuitas": ocg_ok}
    except Exception as e:
        return {"status": "ok", "db_check_error": str(e)}
