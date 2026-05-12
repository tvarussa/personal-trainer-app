import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../services/api'

const MESES_NOME = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMes(mesStr) {
  const [ano, mes] = mesStr.split('-')
  return `${MESES_NOME[parseInt(mes) - 1]} ${ano}`
}

function moeda(valor) {
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`
}

function Badge({ pago }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pago ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
      {pago ? 'Pago' : 'Pendente'}
    </span>
  )
}

function SeletorMes({ valor, onChange }) {
  function navegar(delta) {
    const [ano, mes] = valor.split('-').map(Number)
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    onChange(`${novoAno}-${String(novoMes).padStart(2, '0')}`)
  }
  return (
    <div className="flex items-center gap-3 justify-center">
      <button onClick={() => navegar(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">‹</button>
      <span className="font-semibold text-gray-800 min-w-28 text-center">{formatMes(valor)}</span>
      <button onClick={() => navegar(1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">›</button>
    </div>
  )
}

function CardAluno({ nome, aulas, aulasLabel, taxaMensal, valorTotal, pago, onToggle, toggling, onClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer active:bg-gray-50" onClick={onClick}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-semibold text-gray-800">{nome}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {aulasLabel}
            {taxaMensal > 0 && ` · taxa mensal`}
          </p>
        </div>
        <Badge pago={pago} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 space-y-0.5">
          {aulas > 0 && <p>Aulas: {moeda(aulas)}</p>}
          {taxaMensal > 0 && <p>Taxa: {moeda(taxaMensal)}</p>}
          <p className="font-semibold text-gray-800">Total: {moeda(valorTotal)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          disabled={toggling}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
            pago
              ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
              : 'border-green-200 text-green-600 hover:bg-green-50'
          }`}
        >
          {pago ? 'Desfazer' : 'Marcar pago'}
        </button>
      </div>
    </div>
  )
}

function DetalheAluno({ alunoId, nome, mes, onClose, onAtualizar }) {
  const [detalhe, setDetalhe] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [toggling, setToggling] = useState(null)
  const [togglingPago, setTogglingPago] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get(`/financeiro/detalhe-aluno?aluno_id=${alunoId}&mes=${mes}`)
      setDetalhe(data)
    } finally {
      setCarregando(false)
    }
  }, [alunoId, mes])

  useEffect(() => { carregar() }, [carregar])

  async function toggleCobrar(aula) {
    const key = aula.agendamento_id ?? `rec-${aula.recorrencia_id}`
    setToggling(key)
    try {
      await api.patch('/dashboard/marcar-cobranca', {
        agendamento_id: aula.agendamento_id ?? null,
        recorrencia_id: aula.recorrencia_id ?? null,
        data: aula.agendamento_id ? null : aula.data_hora.slice(0, 10),
        cobrar: !aula.cobrar,
      })
      await carregar()
      onAtualizar?.()
    } finally {
      setToggling(null)
    }
  }

  async function togglePago() {
    if (!detalhe) return
    setTogglingPago(true)
    try {
      if (detalhe.financeiro_id) {
        await api.patch(`/financeiro/${detalhe.financeiro_id}/pago?pago=${!detalhe.pago}`)
      } else {
        await api.post('/financeiro/marcar-pagamento-aluno', {
          aluno_id: alunoId,
          mes_referencia: mes,
          pago: !detalhe.pago,
        })
      }
      await carregar()
      onAtualizar?.()
    } finally {
      setTogglingPago(false)
    }
  }

  const aulasCount = detalhe?.aulas.filter(a => a.cobrar).length ?? 0
  const totalCobrado = detalhe ? round2(aulasCount * detalhe.preco_por_aula + detalhe.taxa_mensal) : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-800">{nome}</p>
            <p className="text-xs text-gray-400">{formatMes(mes)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">
          {carregando ? (
            <p className="text-center text-gray-400 text-sm py-6">Carregando...</p>
          ) : !detalhe || detalhe.aulas.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">Nenhuma aula neste mês</p>
          ) : (
            <>
              {detalhe.aulas.map((a, i) => {
                const key = a.agendamento_id ?? `rec-${a.recorrencia_id}`
                const d = new Date(a.data_hora)
                const dataLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
                const horaLabel = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={i} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-gray-600 capitalize">{dataLabel}</span>
                        <span className="text-sm font-semibold text-gray-800">{horaLabel}</span>
                        {a.recorrente && (
                          <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-1.5 py-0.5 rounded-full">Rec</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.cobrar ? moeda(detalhe.preco_por_aula) : 'Não cobrada'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleCobrar(a)}
                      disabled={toggling === key}
                      className={`text-xs px-2 py-1 rounded-lg border shrink-0 transition-colors disabled:opacity-40 ${
                        a.cobrar
                          ? 'border-green-200 text-green-700 bg-green-50'
                          : 'border-red-200 text-red-600 bg-red-50'
                      }`}
                    >
                      {a.cobrar ? 'Cobrada' : 'Não cobrada'}
                    </button>
                  </div>
                )
              })}

              {detalhe.taxa_mensal > 0 && (
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                  <span className="text-sm text-gray-600">Taxa mensal</span>
                  <span className="text-sm font-medium text-gray-700">{moeda(detalhe.taxa_mensal)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {detalhe && (
          <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">Total a cobrar</p>
              <p className="font-bold text-gray-800">{moeda(totalCobrado)}</p>
            </div>
            <button
              onClick={togglePago}
              disabled={togglingPago}
              className={`text-sm px-4 py-2 rounded-xl border font-medium transition-colors disabled:opacity-50 ${
                detalhe.pago
                  ? 'border-orange-200 text-orange-600 bg-orange-50'
                  : 'border-green-200 text-green-600 bg-green-50'
              }`}
            >
              {detalhe.pago ? 'Desfazer pagamento' : 'Marcar como pago'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function round2(n) { return Math.round(n * 100) / 100 }

function AbaFinanceiro({ mes }) {
  const [resumo, setResumo] = useState(null)
  const [registros, setRegistros] = useState([])
  const [mesAberto, setMesAberto] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [detalheAberto, setDetalheAberto] = useState(null) // {alunoId, nome}

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [{ data: r }, { data: regs }, { data: aberto }] = await Promise.all([
        api.get(`/financeiro/resumo?mes=${mes}`),
        api.get(`/financeiro/?mes=${mes}`),
        api.get(`/financeiro/mes-aberto?mes=${mes}`),
      ])
      setResumo(r)
      setRegistros(regs)
      setMesAberto(aberto)
    } finally {
      setCarregando(false)
    }
  }, [mes])

  useEffect(() => { carregar() }, [carregar])

  async function fecharMes() {
    if (!confirm(`Fechar mês ${formatMes(mes)}? Isso irá calcular os valores de todos os alunos.`)) return
    setFechando(true)
    try {
      const { data } = await api.post(`/financeiro/fechar-mes?mes=${mes}`)
      alert(`Mês fechado: ${data.total_alunos} aluno(s) processado(s).`)
      carregar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao fechar mês')
    } finally {
      setFechando(false)
    }
  }

  async function togglePagoFechado(id, pagoAtual) {
    setToggling(id)
    try {
      await api.patch(`/financeiro/${id}/pago?pago=${!pagoAtual}`)
      carregar()
    } finally {
      setToggling(null)
    }
  }

  async function togglePagoAberto(item) {
    const key = `aberto-${item.aluno_id}`
    setToggling(key)
    try {
      await api.post('/financeiro/marcar-pagamento-aluno', {
        aluno_id: item.aluno_id,
        mes_referencia: mes,
        pago: !item.pago,
      })
      carregar()
    } finally {
      setToggling(null)
    }
  }

  if (carregando) return <div className="text-center text-gray-400 text-sm py-8">Carregando...</div>

  const fechado = registros.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo */}
      {resumo && resumo.total_geral > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-500 font-medium">Total</p>
            <p className="font-bold text-blue-800 text-sm mt-1">{moeda(resumo.total_geral)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xs text-green-500 font-medium">Recebido</p>
            <p className="font-bold text-green-800 text-sm mt-1">{moeda(resumo.total_pago)}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-xs text-orange-500 font-medium">Pendente</p>
            <p className="font-bold text-orange-800 text-sm mt-1">{moeda(resumo.total_pendente)}</p>
          </div>
        </div>
      )}

      {/* Botão fechar mês */}
      <button
        onClick={fecharMes}
        disabled={fechando}
        className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {fechando ? 'Calculando...' : `Fechar ${formatMes(mes)}`}
      </button>

      {/* Mês fechado: registros oficiais */}
      {fechado ? (
        <div className="flex flex-col gap-2">
          {registros.map((r) => (
            <CardAluno
              key={r.id}
              nome={r.nome_aluno}
              aulas={r.valor_aulas}
              aulasLabel={`${r.quantidade_aulas} aula${r.quantidade_aulas !== 1 ? 's' : ''}`}
              taxaMensal={r.taxa_mensal}
              valorTotal={r.total}
              pago={r.pago}
              onToggle={() => togglePagoFechado(r.id, r.pago)}
              toggling={toggling === r.id}
              onClick={() => setDetalheAberto({ alunoId: r.aluno_id, nome: r.nome_aluno })}
            />
          ))}
        </div>
      ) : mesAberto.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border border-gray-100">
          Nenhum aluno com atividade neste mês.
        </div>
      ) : (
        /* Mês aberto: lista estimada */
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 text-center">Valores estimados · mês não fechado</p>
          {mesAberto.map((item) => {
            const qtdAulas = Math.max(item.aulas_agendadas, item.aulas_recorrentes)
            const valorAulas = item.valor_estimado - item.taxa_mensal
            return (
              <CardAluno
                key={item.aluno_id}
                nome={item.nome_aluno}
                aulas={valorAulas}
                aulasLabel={`~${qtdAulas} aula${qtdAulas !== 1 ? 's' : ''}`}
                taxaMensal={item.taxa_mensal}
                valorTotal={item.valor_estimado}
                pago={item.pago}
                onToggle={() => togglePagoAberto(item)}
                toggling={toggling === `aberto-${item.aluno_id}`}
                onClick={() => setDetalheAberto({ alunoId: item.aluno_id, nome: item.nome_aluno })}
              />
            )
          })}
        </div>
      )}

      {detalheAberto && (
        <DetalheAluno
          alunoId={detalheAberto.alunoId}
          nome={detalheAberto.nome}
          mes={mes}
          onClose={() => setDetalheAberto(null)}
          onAtualizar={carregar}
        />
      )}
    </div>
  )
}

function AbaProjecao() {
  const [projecao, setProjecao] = useState([])
  const [meses, setMeses] = useState(3)
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get(`/financeiro/projecao?meses=${meses}`)
      setProjecao(data)
    } finally {
      setCarregando(false)
    }
  }, [meses])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="flex flex-col gap-4">
      {/* Seletor de horizonte */}
      <div className="flex gap-2">
        {[1, 3, 6].map((m) => (
          <button
            key={m}
            onClick={() => setMeses(m)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              meses === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m} {m === 1 ? 'mês' : 'meses'}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="text-center text-gray-400 text-sm py-8">Calculando...</div>
      ) : projecao.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border border-gray-100">
          Cadastre recorrências nos alunos para ver a projeção
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projecao.map((p) => (
            <div key={p.mes} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button
                onClick={() => setAberto(aberto === p.mes ? null : p.mes)}
                className="w-full p-4 flex items-center justify-between"
              >
                <div className="text-left">
                  <p className="font-semibold text-gray-800">{formatMes(p.mes)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.detalhes.length} aluno(s)</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-700">{moeda(p.total_estimado)}</p>
                  <p className="text-xs text-gray-400">{aberto === p.mes ? '▲' : '▼'}</p>
                </div>
              </button>

              {aberto === p.mes && (
                <div className="border-t border-gray-100 px-4 pb-3 flex flex-col gap-2">
                  {p.detalhes.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center">Sem recorrências neste mês</p>
                  ) : (
                    p.detalhes.map((d) => (
                      <div key={d.aluno_id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm text-gray-700">{d.nome}</p>
                          <p className="text-xs text-gray-400">{d.aulas_estimadas} aula(s) estimada(s)</p>
                        </div>
                        <p className="text-sm font-medium text-gray-700">{moeda(d.total)}</p>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between pt-1 text-xs text-gray-500">
                    <span>Aulas: {moeda(p.receita_aulas)}</span>
                    <span>Taxas: {moeda(p.receita_taxas)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PersonalFinanceiro() {
  const [aba, setAba] = useState('mensal')
  const [mes, setMes] = useState(mesAtual)

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Financeiro</h1>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[['mensal', 'Mensal'], ['projecao', 'Projeção']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setAba(val)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${aba === val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'mensal' && (
        <>
          <SeletorMes valor={mes} onChange={setMes} />
          <AbaFinanceiro mes={mes} />
        </>
      )}

      {aba === 'projecao' && <AbaProjecao />}
    </div>
  )
}
