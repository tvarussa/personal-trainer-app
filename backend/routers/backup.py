import io
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, BackupLog, Base, engine
from routers.auth import require_personal

router = APIRouter(prefix="/backup", tags=["backup"])

_SKIP = {"backup_log"}


def _serializar(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Tipo não serializável: {type(obj)}")


@router.get("/download")
def download_backup(db: Session = Depends(get_db), _=Depends(require_personal)):
    dados = {}
    for table in Base.metadata.sorted_tables:
        rows = db.execute(table.select()).mappings().all()
        dados[table.name] = [dict(row) for row in rows]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nome = f"backup_{timestamp}.json"

    conteudo = json.dumps(dados, default=_serializar, ensure_ascii=False, indent=2)

    log = BackupLog(arquivo=nome)
    db.add(log)
    db.commit()

    return StreamingResponse(
        io.BytesIO(conteudo.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
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
    if not arquivo.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Apenas arquivos .json são aceitos")

    conteudo = await arquivo.read()
    try:
        dados = json.loads(conteudo)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Arquivo JSON inválido")

    tabelas = list(Base.metadata.sorted_tables)

    try:
        for table in reversed(tabelas):
            if table.name in _SKIP:
                continue
            db.execute(table.delete())
        db.flush()

        for table in tabelas:
            if table.name in _SKIP:
                continue
            rows = dados.get(table.name, [])
            if rows:
                db.execute(table.insert(), rows)

        log = BackupLog(arquivo=arquivo.filename, restaurado_em=datetime.now())
        db.add(log)
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Falha na restauração: {str(e)}")

    # Reseta sequences do PostgreSQL para evitar conflito de IDs futuros
    try:
        with engine.connect() as conn:
            for table in tabelas:
                if table.name in _SKIP:
                    continue
                for col in table.primary_key.columns:
                    conn.execute(text(
                        f"SELECT setval(pg_get_serial_sequence('{table.name}', '{col.name}'), "
                        f"COALESCE((SELECT MAX({col.name}) FROM {table.name}), 1))"
                    ))
            conn.commit()
    except Exception:
        pass

    return {"ok": True, "mensagem": "Backup restaurado com sucesso"}
