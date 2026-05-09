import { useState, useEffect, useCallback } from 'react'
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

export default function AlunoExtrato() {
  const [mes, setMes] = useState(mesAtual)
  const [historico, setHistorico] = useState([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/financeiro/aluno')
      setHistorico(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const registroMes = historico.find((r) => r.mes_referencia === mes)

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Extrato Financeiro</h1>

      <SeletorMes valor={mes} onChange={setMes} />

      {carregando ? (
        <div className="text-center text-gray-400 text-sm py-8">Carregando...</div>
      ) : registroMes ? (
        /* Card do mês selecionado */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className={`px-4 py-3 flex items-center justify-between ${registroMes.pago ? 'bg-green-50' : 'bg-orange-50'}`}>
            <span className="font-semibold text-gray-700">{formatMes(mes)}</span>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${registroMes.pago ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
              {registroMes.pago ? '✓ Pago' : 'Pendente'}
            </span>
          </div>

          <div className="p-4 flex flex-col gap-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Aulas realizadas</span>
              <span className="font-medium text-gray-800">{registroMes.quantidade_aulas}</span>
            </div>
            {registroMes.valor_aulas > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Valor das aulas</span>
                <span className="font-medium text-gray-800">{moeda(registroMes.valor_aulas)}</span>
              </div>
            )}
            {registroMes.taxa_mensal > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Taxa mensal</span>
                <span className="font-medium text-gray-800">{moeda(registroMes.taxa_mensal)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900 text-lg">{moeda(registroMes.total)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 text-sm py-8 bg-white rounded-2xl border border-gray-100">
          Sem registro para {formatMes(mes)}
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">Histórico</h2>
          <div className="flex flex-col gap-2">
            {historico.map((r) => (
              <button
                key={r.id}
                onClick={() => setMes(r.mes_referencia)}
                className={`bg-white rounded-xl border p-3 flex items-center justify-between text-left transition-colors hover:bg-gray-50 ${r.mes_referencia === mes ? 'border-blue-300' : 'border-gray-100'}`}
              >
                <div>
                  <p className="font-medium text-gray-700 text-sm">{formatMes(r.mes_referencia)}</p>
                  <p className="text-xs text-gray-400">{r.quantidade_aulas} aula{r.quantidade_aulas !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800 text-sm">{moeda(r.total)}</p>
                  <span className={`text-xs ${r.pago ? 'text-green-600' : 'text-orange-500'}`}>
                    {r.pago ? 'Pago' : 'Pendente'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
