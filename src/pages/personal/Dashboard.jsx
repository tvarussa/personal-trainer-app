import { useState, useEffect } from 'react'
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

function ListaAulas({ aulas }) {
  if (aulas.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-3">Nenhuma aula</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {aulas.map((a, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 w-12">{fmtHora(a.data_hora)}</span>
            <span className="text-sm text-gray-700">{a.aluno}</span>
          </div>
          {a.recorrente && (
            <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-2 py-0.5 rounded-full">Recorrente</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function PersonalDashboard() {
  const { user } = useAuth()
  const [dados, setDados] = useState(null)

  useEffect(() => {
    api.get('/dashboard/personal').then(r => setDados(r.data)).catch(() => {})
  }, [])

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
        <ListaAulas aulas={dados?.lista_hoje ?? []} />
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
