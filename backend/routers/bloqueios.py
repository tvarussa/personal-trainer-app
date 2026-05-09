from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from database import get_db, Bloqueio, SlotDisponivel
from routers.auth import require_personal, get_usuario_atual

router = APIRouter(prefix="/bloqueios", tags=["bloqueios"])

DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


class CriarBloqueio(BaseModel):
    data: str | None = None
    dia_semana: int | None = None
    hora_inicio: str | None = None  # "HH:MM"; None = dia todo
    hora_fim: str | None = None     # "HH:MM"; None = dia todo
    motivo: str | None = None


def _validar(dados: CriarBloqueio):
    if dados.data is None and dados.dia_semana is None:
        raise HTTPException(status_code=400, detail="Informe 'data' ou 'dia_semana'")
    if dados.data and dados.dia_semana is not None:
        raise HTTPException(status_code=400, detail="Informe apenas 'data' OU 'dia_semana', não os dois")
    if dados.dia_semana is not None and not (0 <= dados.dia_semana <= 6):
        raise HTTPException(status_code=400, detail="dia_semana deve ser 0 (segunda) a 6 (domingo)")
    if (dados.hora_inicio is None) != (dados.hora_fim is None):
        raise HTTPException(status_code=400, detail="Informe 'hora_inicio' e 'hora_fim' juntos")
    if dados.hora_inicio and dados.hora_fim and dados.hora_inicio >= dados.hora_fim:
        raise HTTPException(status_code=400, detail="hora_inicio deve ser anterior a hora_fim")


def _cobre(bloqueio: Bloqueio, hora_str: str | None) -> bool:
    """Retorna True se o bloqueio cobre o horário dado.

    hora_str=None: apenas bloqueios de dia todo retornam True.
    hora_str="HH:MM": bloqueios de dia todo e janelas que englobam o horário retornam True.
    """
    if bloqueio.hora_inicio is None:
        return True  # dia todo → cobre qualquer hora
    if hora_str is None:
        return False  # janela parcial não conta como bloqueio de dia todo
    return bloqueio.hora_inicio <= hora_str <= bloqueio.hora_fim


def _bloqueios_para_data(data_str: str, db: Session):
    pontuais = db.query(Bloqueio).filter(
        Bloqueio.data == data_str,
        Bloqueio.ativo == True,
    ).all()
    recorrentes = []
    try:
        d = date.fromisoformat(data_str)
        recorrentes = db.query(Bloqueio).filter(
            Bloqueio.dia_semana == d.weekday(),
            Bloqueio.ativo == True,
        ).all()
    except ValueError:
        pass
    return pontuais + recorrentes


def horario_bloqueado(data_str: str, hora_str: str, db: Session) -> bool:
    """True se o horário específico (HH:MM) nessa data está bloqueado."""
    return any(_cobre(b, hora_str) for b in _bloqueios_para_data(data_str, db))


def dia_bloqueado(data_str: str, db: Session) -> bool:
    """True se o dia inteiro está bloqueado (bloqueio sem janela de horário)."""
    return any(_cobre(b, None) for b in _bloqueios_para_data(data_str, db))


@router.get("/")
def listar_bloqueios(db: Session = Depends(get_db), _=Depends(get_usuario_atual)):
    bloqueios = db.query(Bloqueio).filter(Bloqueio.ativo == True).order_by(Bloqueio.criado_em.desc()).all()
    return [
        {
            "id": b.id,
            "tipo": "recorrente" if b.dia_semana is not None else "pontual",
            "data": b.data,
            "dia_semana": b.dia_semana,
            "dia_semana_nome": DIAS_SEMANA[b.dia_semana] if b.dia_semana is not None else None,
            "hora_inicio": b.hora_inicio,
            "hora_fim": b.hora_fim,
            "dia_todo": b.hora_inicio is None,
            "motivo": b.motivo,
        }
        for b in bloqueios
    ]


@router.post("/", status_code=201)
def criar_bloqueio(dados: CriarBloqueio, db: Session = Depends(get_db), _=Depends(require_personal)):
    _validar(dados)

    query = db.query(Bloqueio).filter(Bloqueio.ativo == True)
    if dados.data:
        base = query.filter(Bloqueio.data == dados.data)
    else:
        base = query.filter(Bloqueio.dia_semana == dados.dia_semana)

    if dados.hora_inicio is None:
        # Dia todo: impede duplicata de dia-todo
        if base.filter(Bloqueio.hora_inicio == None).first():  # noqa: E711
            alvo = dados.data or DIAS_SEMANA[dados.dia_semana]
            raise HTTPException(status_code=400, detail=f"{alvo} já está completamente bloqueado")
    else:
        # Janela: impede janela idêntica
        if base.filter(
            Bloqueio.hora_inicio == dados.hora_inicio,
            Bloqueio.hora_fim == dados.hora_fim,
        ).first():
            raise HTTPException(status_code=400, detail="Esta janela de horário já está bloqueada")

    b = Bloqueio(
        data=dados.data,
        dia_semana=dados.dia_semana,
        hora_inicio=dados.hora_inicio,
        hora_fim=dados.hora_fim,
        motivo=dados.motivo,
    )
    db.add(b)

    # Auto-bloqueia slots existentes apenas para bloqueios pontuais
    if dados.data:
        slots = db.query(SlotDisponivel).filter(
            SlotDisponivel.data_hora.like(f"{dados.data}%")
        ).all()
        for s in slots:
            hora_str = s.data_hora.strftime("%H:%M")
            if dados.hora_inicio is None or dados.hora_inicio <= hora_str <= dados.hora_fim:
                s.bloqueado_pelo_personal = True
                s.disponivel = False

    db.commit()
    db.refresh(b)
    return {"id": b.id, "ok": True}


@router.delete("/{bloqueio_id}")
def remover_bloqueio(bloqueio_id: int, db: Session = Depends(get_db), _=Depends(require_personal)):
    b = db.query(Bloqueio).filter(Bloqueio.id == bloqueio_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bloqueio não encontrado")

    b.ativo = False

    # Restaura flags apenas para bloqueios pontuais de dia todo
    # (janelas são verificadas dinamicamente em listar_slots)
    if b.data and b.hora_inicio is None:
        slots = db.query(SlotDisponivel).filter(
            SlotDisponivel.data_hora.like(f"{b.data}%"),
            SlotDisponivel.bloqueado_pelo_personal == True,  # noqa: E712
        ).all()
        for s in slots:
            s.bloqueado_pelo_personal = False
            s.disponivel = True

    db.commit()
    return {"ok": True}


@router.get("/verificar")
def verificar_data(data: str, db: Session = Depends(get_db), _=Depends(require_personal)):
    return {"data": data, "bloqueada": dia_bloqueado(data, db)}
