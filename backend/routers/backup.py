import os
import shutil
import tempfile
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db, BackupLog, DATABASE_URL, engine, Base
from routers.auth import require_personal

router = APIRouter(prefix="/backup", tags=["backup"])

DB_PATH = DATABASE_URL.replace("sqlite:///", "").replace("./", "")
DB_PATH = os.path.join(os.path.dirname(__file__), "..", DB_PATH.lstrip("./"))
DB_PATH = os.path.normpath(DB_PATH)


@router.get("/download")
def download_backup(db: Session = Depends(get_db), _=Depends(require_personal)):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Arquivo do banco não encontrado")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome_arquivo = f"personal_trainer_backup_{timestamp}.db"

    log = BackupLog(arquivo=nome_arquivo)
    db.add(log)
    db.commit()

    return FileResponse(
        path=DB_PATH,
        media_type="application/octet-stream",
        filename=nome_arquivo,
    )


@router.get("/logs")
def listar_logs(db: Session = Depends(get_db), _=Depends(require_personal)):
    logs = db.query(BackupLog).order_by(BackupLog.criado_em.desc()).limit(20).all()
    return [
        {
            "id": l.id,
            "arquivo": l.arquivo,
            "criado_em": l.criado_em,
            "restaurado_em": l.restaurado_em,
        }
        for l in logs
    ]


@router.post("/restaurar")
async def restaurar_backup(
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_personal),
):
    if not arquivo.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Apenas arquivos .db são aceitos")

    conteudo = await arquivo.read()

    # Valida tamanho mínimo (SQLite magic header tem 100 bytes)
    if len(conteudo) < 100 or conteudo[:6] != b"SQLite":
        raise HTTPException(status_code=400, detail="Arquivo não é um banco SQLite válido")

    # Salva backup do banco atual antes de substituir
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_atual = DB_PATH + f".pre_restore_{timestamp}"
    shutil.copy2(DB_PATH, backup_atual)

    try:
        # Fecha todas as conexões SQLAlchemy antes de substituir o arquivo
        engine.dispose()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp.write(conteudo)
            tmp_path = tmp.name

        shutil.move(tmp_path, DB_PATH)

        # Recria tabelas caso o backup seja de versão anterior
        Base.metadata.create_all(bind=engine)

        log = BackupLog(arquivo=arquivo.filename, restaurado_em=datetime.now())
        new_db = next(get_db())
        new_db.add(log)
        new_db.commit()

        return {"ok": True, "mensagem": "Banco restaurado com sucesso. Reinicie o servidor."}

    except Exception as e:
        # Reverte para o banco anterior em caso de falha
        shutil.copy2(backup_atual, DB_PATH)
        raise HTTPException(status_code=500, detail=f"Falha na restauração: {str(e)}")
    finally:
        if os.path.exists(backup_atual):
            os.remove(backup_atual)
