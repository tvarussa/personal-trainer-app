import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

function fmt(valor) {
  return valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'R$ 0'
}

function fmtDataHora(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const SITUACAO = {
  pago: { label: 'Pago', cls: 'text-green-700' },
  pendente: { label: 'Pendente', cls: 'text-orange-600' },
  em_dia: { label: 'Em dia', cls: 'text-blue-600' },
}

export default function AlunoDashboard() {
  const { user } = useAuth()
  const [dados, setDados] = useState(null)

  useEffect(() => {
    api.get('/dashboard/aluno').then(r => setDados(r.data)).catch(() => {})
  }, [])

  const sit = SITUACAO[dados?.situacao] ?? SITUACAO.em_dia

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">
          Olá, {user?.nome?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500">Bem-vindo ao seu painel</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4 col-span-2">
          <p className="text-xs text-blue-600 font-medium">Próxima aula</p>
          <p className="text-base font-bold text-blue-800 mt-1">{fmtDataHora(dados?.proxima_aula)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Aulas este mês</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{dados?.aulas_mes ?? '—'}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-600 font-medium">Total do mês</p>
          <p className="text-lg font-bold text-purple-800 mt-1">{dados ? fmt(dados.total_mes) : '—'}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium">Cancelamentos no mês</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{dados?.cancelamentos_mes ?? '—'}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs text-orange-600 font-medium">Situação</p>
          <p className={`text-base font-bold mt-1 ${sit.cls}`}>{sit.label}</p>
        </div>
      </div>
    </div>
  )
}
