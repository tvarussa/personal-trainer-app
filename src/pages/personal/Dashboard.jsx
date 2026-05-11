import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

function fmt(valor) {
  return valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'R$ 0'
}

function fmtHora(dt) {
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDataLabel(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function ListaAulas({ aulas, onToggleCobrar, toggling }) {
  if (aulas.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-3">Nenhuma aula</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {aulas.map((a, i) => {
        const key = a.agendamento_id ?? `rec-${a.recorrencia_id}`
        return (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-gray-800 w-12 shrink-0">{fmtHora(a.data_hora)}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-700 truncate">{a.aluno}</span>
                  {a.recorrente && (
                    <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-1.5 py-0.5 rounded-full shrink-0">Rec</span>
                  )}
                </div>
                {a.academia && (
                  <p className="text-xs text-blue-500 truncate">{a.academia}</p>
                )}
              </div>
            </div>
            {onToggleCobrar && (
              <button
                onClick={() => onToggleCobrar(a, key)}
                disabled={toggling === key}
                className={`text-xs px-2 py-1 rounded-lg border shrink-0 transition-colors disabled:opacity-40 ${
                  a.cobrar !== false
                    ? 'border-green-200 text-green-700 bg-green-50'
                    : 'border-red-200 text-red-600 bg-red-50'
                }`}
              >
                {a.cobrar !== false ? 'Cobrada' : 'Não cobrada'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function PersonalDashboard() {
  const { user } = useAuth()
  const [dados, setDados] = useState(null)
  const [toggling, setToggling] = useState(null)

  const carregar = useCallback(() => {
    api.get('/dashboard/personal').then(r => setDados(r.data)).catch(() => {})
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function toggleCobrar(aula, key) {
    setToggling(key)
    try {
      await api.patch('/dashboard/marcar-cobranca', {
        agendamento_id: aula.agendamento_id ?? null,
        recorrencia_id: aula.recorrencia_id ?? null,
        data: aula.agendamento_id ? null : aula.data_hora.slice(0, 10),
        cobrar: !aula.cobrar,
      })
      carregar()
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">
          Olá, {user?.nome?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500">Painel do Personal Trainer</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">Aulas hoje</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{dados?.aulas_hoje ?? '—'}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Alunos ativos</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{dados?.alunos_ativos ?? '—'}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-600 font-medium">Receita do mês</p>
          <p className="text-lg font-bold text-purple-800 mt-1">{dados ? fmt(dados.receita_mes) : '—'}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs text-orange-600 font-medium">Pendente cobrar</p>
          <p className="text-lg font-bold text-orange-800 mt-1">{dados ? fmt(dados.pendente_cobrar) : '—'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Aulas de hoje</h2>
        <ListaAulas
          aulas={dados?.lista_hoje ?? []}
          onToggleCobrar={toggleCobrar}
          toggling={toggling}
        />
      </div>

      {dados?.proximo_dia && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">
            Próximo dia com aulas
          </h2>
          <p className="text-xs text-gray-400 mb-3 capitalize">{fmtDataLabel(dados.proximo_dia.data)}</p>
          <ListaAulas aulas={dados.proximo_dia.aulas} />
        </div>
      )}
    </div>
  )
}
