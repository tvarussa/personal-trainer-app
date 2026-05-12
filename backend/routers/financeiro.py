from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, date
from calendar import monthrange
from database import get_db, Financeiro, Aluno, Agendamento, Recorrencia, SlotDisponivel, Usuario, StatusAgendamento, OcorrenciaCancelada, OcorrenciaGratuita, OcorrenciaPaga
from routers.auth import require_personal, get_usuario_atual
from utils import agora_brasil

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
        mes = agora_brasil().strftime("%Y-%m")
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

        # Apenas aulas não canceladas e não marcadas como gratuitas pelo personal
        aulas_cobradas = [
            a for a in aulas
            if not (a.status == StatusAgendamento.cancelado and a.cancelado_com_antecedencia)
            and not a.nao_cobrar
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
    hoje = agora_brasil()
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


@router.get("/mes-aberto")
def mes_aberto(mes: str, db: Session = Depends(get_db), _=Depends(require_personal)):
    """Lista todos os alunos ativos com atividade no mês, mesmo antes do fechamento."""
    try:
        inicio, fim = _mes_para_datas(mes)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Formato inválido. Use YYYY-MM")

    inicio_dt = datetime(inicio.year, inicio.month, inicio.day)
    fim_dt = datetime(fim.year, fim.month, fim.day, 23, 59, 59)
    ano, mes_num = inicio.year, inicio.month
    dias_no_mes = monthrange(ano, mes_num)[1]

    alunos = db.query(Aluno).join(Aluno.usuario).filter(Usuario.ativo == True).all()  # noqa: E712

    ags_mes = [
        a for a in db.query(Agendamento).join(Agendamento.slot).filter(
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
        ).all()
        if inicio_dt <= a.slot.data_hora <= fim_dt
    ]
    por_aluno_ags: dict[int, int] = {}
    for a in ags_mes:
        por_aluno_ags[a.aluno_id] = por_aluno_ags.get(a.aluno_id, 0) + 1

    por_aluno_rec: dict[int, int] = {}
    for r in db.query(Recorrencia).filter(Recorrencia.ativo == True).all():  # noqa: E712
        if r.frequencia == "mensal":
            count = 1
        else:
            count = sum(1 for d in range(1, dias_no_mes + 1) if date(ano, mes_num, d).weekday() == r.dia_semana)
        por_aluno_rec[r.aluno_id] = por_aluno_rec.get(r.aluno_id, 0) + count

    fins: dict[int, Financeiro] = {
        f.aluno_id: f
        for f in db.query(Financeiro).filter(Financeiro.mes_referencia == mes).all()
    }

    resultado = []
    for aluno in alunos:
        qtd_ags = por_aluno_ags.get(aluno.id, 0)
        qtd_rec = por_aluno_rec.get(aluno.id, 0)
        if qtd_ags == 0 and qtd_rec == 0 and aluno.taxa_mensal == 0:
            continue
        valor_estimado = round(max(qtd_ags, qtd_rec) * aluno.preco_por_aula + aluno.taxa_mensal, 2)
        fin = fins.get(aluno.id)
        resultado.append({
            "aluno_id": aluno.id,
            "nome_aluno": aluno.usuario.nome,
            "aulas_agendadas": qtd_ags,
            "aulas_recorrentes": qtd_rec,
            "taxa_mensal": aluno.taxa_mensal,
            "valor_estimado": valor_estimado,
            "financeiro_id": fin.id if fin else None,
            "pago": fin.pago if fin else False,
        })

    return sorted(resultado, key=lambda x: x["nome_aluno"])


class MarcarPagamentoAluno(BaseModel):
    aluno_id: int
    mes_referencia: str
    pago: bool


@router.post("/marcar-pagamento-aluno")
def marcar_pagamento_aluno(dados: MarcarPagamentoAluno, db: Session = Depends(get_db), _=Depends(require_personal)):
    aluno = db.query(Aluno).filter(Aluno.id == dados.aluno_id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    fin = db.query(Financeiro).filter(
        Financeiro.aluno_id == dados.aluno_id,
        Financeiro.mes_referencia == dados.mes_referencia,
    ).first()

    if fin:
        fin.pago = dados.pago
    else:
        try:
            inicio, fim = _mes_para_datas(dados.mes_referencia)
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="Formato de mês inválido")
        inicio_dt = datetime(inicio.year, inicio.month, inicio.day)
        fim_dt = datetime(fim.year, fim.month, fim.day, 23, 59, 59)

        ags = [
            a for a in db.query(Agendamento).join(Agendamento.slot).filter(
                Agendamento.aluno_id == dados.aluno_id,
                Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            ).all()
            if inicio_dt <= a.slot.data_hora <= fim_dt
        ]
        qtd = len(ags)
        valor_aulas = round(qtd * aluno.preco_por_aula, 2)
        total = round(valor_aulas + aluno.taxa_mensal, 2)

        fin = Financeiro(
            aluno_id=dados.aluno_id,
            mes_referencia=dados.mes_referencia,
            quantidade_aulas=qtd,
            valor_aulas=valor_aulas,
            taxa_mensal=aluno.taxa_mensal,
            total=total,
            pago=dados.pago,
        )
        db.add(fin)

    db.commit()
    db.refresh(fin)
    return {"ok": True, "financeiro_id": fin.id}


@router.patch("/{financeiro_id}/pago")
def marcar_pago(financeiro_id: int, pago: bool = True, db: Session = Depends(get_db), _=Depends(require_personal)):
    registro = db.query(Financeiro).filter(Financeiro.id == financeiro_id).first()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    registro.pago = pago
    db.commit()
    return {"ok": True}


@router.get("/detalhe-aluno")
def detalhe_aluno(aluno_id: int, mes: str, db: Session = Depends(get_db), _=Depends(require_personal)):
    aluno = db.query(Aluno).filter(Aluno.id == aluno_id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    try:
        inicio, fim = _mes_para_datas(mes)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Formato inválido. Use YYYY-MM")

    inicio_dt = datetime(inicio.year, inicio.month, inicio.day)
    fim_dt = datetime(fim.year, fim.month, fim.day, 23, 59, 59)
    mes_str_inicio = inicio.strftime("%Y-%m-%d")
    mes_str_fim = fim.strftime("%Y-%m-%d")

    ags = (
        db.query(Agendamento, SlotDisponivel)
        .join(SlotDisponivel, Agendamento.slot_id == SlotDisponivel.id)
        .filter(
            Agendamento.aluno_id == aluno_id,
            Agendamento.status.in_([StatusAgendamento.confirmado, StatusAgendamento.realizado]),
            SlotDisponivel.data_hora >= inicio_dt,
            SlotDisponivel.data_hora <= fim_dt,
        )
        .all()
    )

    horarios_reais: dict[str, set] = {}
    aulas = []
    for ag, slot in ags:
        dia_str = slot.data_hora.strftime("%Y-%m-%d")
        hora_str = slot.data_hora.strftime("%H:%M")
        horarios_reais.setdefault(dia_str, set()).add(hora_str)
        aulas.append({
            "data_hora": slot.data_hora,
            "cobrar": not getattr(ag, "nao_cobrar", False),
            "pago": getattr(ag, "pago", False),
            "agendamento_id": ag.id,
            "recorrencia_id": None,
            "recorrente": False,
        })

    canceladas = {
        (oc.recorrencia_id, oc.data)
        for oc in db.query(OcorrenciaCancelada)
        .join(Recorrencia, OcorrenciaCancelada.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno_id,
            OcorrenciaCancelada.data >= mes_str_inicio,
            OcorrenciaCancelada.data <= mes_str_fim,
        ).all()
    }
    gratuitas = {
        (og.recorrencia_id, og.data)
        for og in db.query(OcorrenciaGratuita)
        .join(Recorrencia, OcorrenciaGratuita.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno_id,
            OcorrenciaGratuita.data >= mes_str_inicio,
            OcorrenciaGratuita.data <= mes_str_fim,
        ).all()
    }
    pagas_rec = {
        (op.recorrencia_id, op.data)
        for op in db.query(OcorrenciaPaga)
        .join(Recorrencia, OcorrenciaPaga.recorrencia_id == Recorrencia.id)
        .filter(
            Recorrencia.aluno_id == aluno_id,
            OcorrenciaPaga.data >= mes_str_inicio,
            OcorrenciaPaga.data <= mes_str_fim,
        ).all()
    }

    dias_no_mes = monthrange(inicio.year, inicio.month)[1]
    for r in db.query(Recorrencia).filter(Recorrencia.aluno_id == aluno_id, Recorrencia.ativo == True).all():  # noqa: E712
        for d in range(1, dias_no_mes + 1):
            dia = date(inicio.year, inicio.month, d)
            if dia.weekday() != r.dia_semana:
                continue
            dia_str = dia.strftime("%Y-%m-%d")
            if (r.id, dia_str) in canceladas:
                continue
            hora_str = r.horario
            if hora_str in horarios_reais.get(dia_str, set()):
                continue
            hora, minuto = map(int, hora_str.split(":"))
            aulas.append({
                "data_hora": datetime(dia.year, dia.month, dia.day, hora, minuto),
                "cobrar": (r.id, dia_str) not in gratuitas,
                "pago": (r.id, dia_str) in pagas_rec,
                "agendamento_id": None,
                "recorrencia_id": r.id,
                "recorrente": True,
                "data": dia_str,
            })

    aulas.sort(key=lambda x: x["data_hora"])

    fin = db.query(Financeiro).filter(
        Financeiro.aluno_id == aluno_id,
        Financeiro.mes_referencia == mes,
    ).first()

    return {
        "aluno_id": aluno_id,
        "nome_aluno": aluno.usuario.nome if aluno.usuario else "—",
        "mes_referencia": mes,
        "taxa_mensal": aluno.taxa_mensal,
        "taxa_paga": fin.taxa_paga if fin else False,
        "preco_por_aula": aluno.preco_por_aula,
        "aulas": aulas,
        "financeiro_id": fin.id if fin else None,
        "pago": fin.pago if fin else False,
    }


class MarcarAulaPago(BaseModel):
    agendamento_id: int | None = None
    recorrencia_id: int | None = None
    data: str | None = None  # "YYYY-MM-DD" — obrigatório quando recorrencia_id
    pago: bool


@router.patch("/marcar-aula-pago")
def marcar_aula_pago(dados: MarcarAulaPago, db: Session = Depends(get_db), _=Depends(require_personal)):
    if dados.agendamento_id:
        ag = db.query(Agendamento).filter(Agendamento.id == dados.agendamento_id).first()
        if not ag:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        ag.pago = dados.pago
        db.commit()
        return {"ok": True}

    if dados.recorrencia_id and dados.data:
        existente = db.query(OcorrenciaPaga).filter(
            OcorrenciaPaga.recorrencia_id == dados.recorrencia_id,
            OcorrenciaPaga.data == dados.data,
        ).first()
        if dados.pago and not existente:
            db.add(OcorrenciaPaga(recorrencia_id=dados.recorrencia_id, data=dados.data))
            db.commit()
        elif not dados.pago and existente:
            db.delete(existente)
            db.commit()
        return {"ok": True}

    raise HTTPException(status_code=400, detail="Informe agendamento_id ou recorrencia_id + data")


class MarcarTaxaPago(BaseModel):
    aluno_id: int
    mes_referencia: str
    pago: bool


@router.patch("/marcar-taxa-pago")
def marcar_taxa_pago(dados: MarcarTaxaPago, db: Session = Depends(get_db), _=Depends(require_personal)):
    aluno = db.query(Aluno).filter(Aluno.id == dados.aluno_id).first()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    fin = db.query(Financeiro).filter(
        Financeiro.aluno_id == dados.aluno_id,
        Financeiro.mes_referencia == dados.mes_referencia,
    ).first()
    if fin:
        fin.taxa_paga = dados.pago
    else:
        fin = Financeiro(
            aluno_id=dados.aluno_id,
            mes_referencia=dados.mes_referencia,
            taxa_mensal=aluno.taxa_mensal,
            taxa_paga=dados.pago,
        )
        db.add(fin)
    db.commit()
    return {"ok": True}
