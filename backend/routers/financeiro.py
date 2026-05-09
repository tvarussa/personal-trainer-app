from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import datetime, date
from calendar import monthrange
from database import get_db, Financeiro, Aluno, Agendamento, Recorrencia, Usuario, StatusAgendamento
from routers.auth import require_personal, get_usuario_atual

router = APIRouter(prefix="/financeiro", tags=["financeiro"])


def _mes_para_datas(mes_referencia: str):
    """'YYYY-MM' → (date_inicio, date_fim)"""
    ano, mes = int(mes_referencia[:4]), int(mes_referencia[5:7])
    inicio = date(ano, mes, 1)
    fim = date(ano, mes, monthrange(ano, mes)[1])
    return inicio, fim


@router.get("/")
def listar_financeiro(mes: str | None = None, db: Session = Depends(get_db), _=Depends(require_personal)):
    query = db.query(Financeiro)
    if mes:
        query = query.filter(Financeiro.mes_referencia == mes)
    registros = query.order_by(Financeiro.mes_referencia.desc(), Financeiro.aluno_id).all()
    return [
        {
            "id": r.id,
            "aluno_id": r.aluno_id,
            "nome_aluno": r.aluno.usuario.nome,
            "mes_referencia": r.mes_referencia,
            "quantidade_aulas": r.quantidade_aulas,
            "valor_aulas": r.valor_aulas,
            "taxa_mensal": r.taxa_mensal,
            "total": r.total,
            "pago": r.pago,
        }
        for r in registros
    ]


@router.get("/resumo")
def resumo_financeiro(mes: str | None = None, db: Session = Depends(get_db), _=Depends(require_personal)):
    if not mes:
        mes = datetime.now().strftime("%Y-%m")
    registros = db.query(Financeiro).filter(Financeiro.mes_referencia == mes).all()
    total_geral = sum(r.total for r in registros)
    total_pago = sum(r.total for r in registros if r.pago)
    total_pendente = total_geral - total_pago
    return {
        "mes_referencia": mes,
        "total_alunos": len(registros),
        "total_geral": round(total_geral, 2),
        "total_pago": round(total_pago, 2),
        "total_pendente": round(total_pendente, 2),
    }


@router.post("/fechar-mes")
def fechar_mes(mes: str, db: Session = Depends(get_db), _=Depends(require_personal)):
    """Calcula aulas realizadas/confirmadas do mês e cria/atualiza registros financeiros por aluno."""
    try:
        inicio, fim = _mes_para_datas(mes)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Formato de mês inválido. Use YYYY-MM")

    inicio_dt = datetime(inicio.year, inicio.month, inicio.day)
    fim_dt = datetime(fim.year, fim.month, fim.day, 23, 59, 59)

    agendamentos = (
        db.query(Agendamento)
        .join(Agendamento.slot)
        .filter(
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            Agendamento.slot.has(data_hora=None) == False,
        )
        .all()
    )

    # Filtra pelo mês manualmente (evita joins complexos)
    agendamentos_mes = [
        a for a in agendamentos
        if inicio_dt <= a.slot.data_hora <= fim_dt
    ]

    # Agrupa por aluno
    por_aluno: dict[int, list] = {}
    for a in agendamentos_mes:
        por_aluno.setdefault(a.aluno_id, []).append(a)

    criados = 0
    atualizados = 0

    for aluno_id, aulas in por_aluno.items():
        aluno = db.query(Aluno).filter(Aluno.id == aluno_id).first()
        if not aluno:
            continue

        # Apenas aulas não canceladas com cobrança
        aulas_cobradas = [
            a for a in aulas
            if not (a.status == StatusAgendamento.cancelado and a.cancelado_com_antecedencia)
        ]

        qtd = len(aulas_cobradas)
        valor_aulas = round(qtd * aluno.preco_por_aula, 2)
        taxa = aluno.taxa_mensal
        total = round(valor_aulas + taxa, 2)

        registro = db.query(Financeiro).filter(
            Financeiro.aluno_id == aluno_id,
            Financeiro.mes_referencia == mes,
        ).first()

        if registro:
            registro.quantidade_aulas = qtd
            registro.valor_aulas = valor_aulas
            registro.taxa_mensal = taxa
            registro.total = total
            atualizados += 1
        else:
            db.add(Financeiro(
                aluno_id=aluno_id,
                mes_referencia=mes,
                quantidade_aulas=qtd,
                valor_aulas=valor_aulas,
                taxa_mensal=taxa,
                total=total,
                pago=False,
            ))
            criados += 1

        # Marca agendamentos como cobrados
        for a in aulas_cobradas:
            a.cobrado = True

    db.commit()
    return {"ok": True, "mes": mes, "criados": criados, "atualizados": atualizados, "total_alunos": len(por_aluno)}


@router.get("/projecao")
def projecao(meses: int = 3, db: Session = Depends(get_db), _=Depends(require_personal)):
    """Estima receita futura com base nas recorrências ativas e preços atuais."""
    hoje = datetime.now()
    alunos = db.query(Aluno).join(Aluno.usuario).filter(Aluno.usuario.has(ativo=True)).all()
    recorrencias = db.query(Recorrencia).filter(Recorrencia.ativo == True).all()

    # Agrupa recorrências por aluno
    rec_por_aluno: dict[int, list] = {}
    for r in recorrencias:
        rec_por_aluno.setdefault(r.aluno_id, []).append(r)

    resultado = []
    for offset in range(meses):
        mes_dt = date(hoje.year, hoje.month, 1)
        # Avança `offset` meses
        m = mes_dt.month + offset
        a = mes_dt.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        dias_no_mes = monthrange(a, m)[1]
        mes_str = f"{a:04d}-{m:02d}"

        receita_aulas = 0.0
        receita_taxas = 0.0
        detalhes = []

        for aluno in alunos:
            recs = rec_por_aluno.get(aluno.id, [])
            aulas_estimadas = 0

            for r in recs:
                if r.frequencia == "semanal":
                    # Conta quantas vezes o dia da semana aparece no mês
                    # dia_semana: 0=segunda...6=domingo (nosso padrão)
                    # Python weekday: 0=segunda...6=domingo — igual
                    contagem = sum(
                        1 for d in range(1, dias_no_mes + 1)
                        if date(a, m, d).weekday() == r.dia_semana
                    )
                    aulas_estimadas += contagem
                else:  # mensal
                    aulas_estimadas += 1

            valor = round(aulas_estimadas * aluno.preco_por_aula, 2)
            taxa = aluno.taxa_mensal
            receita_aulas += valor
            receita_taxas += taxa
            if aulas_estimadas > 0 or taxa > 0:
                detalhes.append({
                    "aluno_id": aluno.id,
                    "nome": aluno.usuario.nome,
                    "aulas_estimadas": aulas_estimadas,
                    "valor_aulas": valor,
                    "taxa_mensal": taxa,
                    "total": round(valor + taxa, 2),
                })

        resultado.append({
            "mes": mes_str,
            "receita_aulas": round(receita_aulas, 2),
            "receita_taxas": round(receita_taxas, 2),
            "total_estimado": round(receita_aulas + receita_taxas, 2),
            "detalhes": detalhes,
        })

    return resultado


@router.get("/aluno")
def extrato_aluno(mes: str | None = None, db: Session = Depends(get_db), usuario: Usuario = Depends(get_usuario_atual)):
    aluno = db.query(Aluno).filter(Aluno.usuario_id == usuario.id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    query = db.query(Financeiro).filter(Financeiro.aluno_id == aluno.id)
    if mes:
        query = query.filter(Financeiro.mes_referencia == mes)
    registros = query.order_by(Financeiro.mes_referencia.desc()).all()
    return [
        {
            "id": r.id,
            "mes_referencia": r.mes_referencia,
            "quantidade_aulas": r.quantidade_aulas,
            "valor_aulas": r.valor_aulas,
            "taxa_mensal": r.taxa_mensal,
            "total": r.total,
            "pago": r.pago,
        }
        for r in registros
    ]


@router.patch("/{financeiro_id}/pago")
def marcar_pago(financeiro_id: int, pago: bool = True, db: Session = Depends(get_db), _=Depends(require_personal)):
    registro = db.query(Financeiro).filter(Financeiro.id == financeiro_id).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    registro.pago = pago
    db.commit()
    return {"ok": True}
