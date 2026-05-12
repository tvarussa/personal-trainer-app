import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

function fmt(valor) {
  return valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'R$ 0'
}

function fmtDia(dt) {
  const d = new Date(dt)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function fmtHora(dt) {
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function ListaAulas({ aulas, vazia }) {
  if (!aulas || aulas.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-3">{vazia}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {aulas.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-gray-500 w-28 shrink-0">{fmtDia(a.data_hora)}</span>
          <span className="text-sm font-semibold text-gray-800">{fmtHora(a.data_hora)}</span>
          {a.recorrente && (
            <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-1.5 py-0.5 rounded-full shrink-0">Rec</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AlunoDashboard() {
  const { user } = useAuth()
  const [dados, setDados] = useState(null)

  useEffect(() => {
    api.get('/dashboard/aluno')
      .then(r => setDados(r.data))
      .catch(err => setDados({ _erro: String(err), _status: err?.response?.status }))
  }, [])

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">
          Olá, {user?.nome?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500">Bem-vindo ao seu painel</p>
      </div>

      {/* DEBUG TEMPORÁRIO — remover depois */}
      <pre className="bg-gray-100 rounded p-2 text-xs overflow-auto max-h-40">
        {JSON.stringify(dados, null, 2)}
      </pre>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">Aulas esta semana</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{dados?.aulas_semana ?? '—'}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium">Aulas este mês</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{dados?.aulas_mes ?? '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-purple-50 rounded-xl p-3">
          <p className="text-xs text-purple-600 font-medium leading-tight">Valor projetado</p>
          <p className="text-sm font-bold text-purple-800 mt-1">{dados ? fmt(dados.valor_projetado) : '—'}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3">
          <p className="text-xs text-orange-600 font-medium leading-tight">Valor devido</p>
          <p className="text-sm font-bold text-orange-800 mt-1">{dados ? fmt(dados.valor_devido) : '—'}</p>
        </div>
        <div className="bg-teal-50 rounded-xl p-3">
          <p className="text-xs text-teal-600 font-medium leading-tight">Valor pago</p>
          <p className="text-sm font-bold text-teal-800 mt-1">{dados ? fmt(dados.valor_pago) : '—'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Aulas desta semana</h2>
        <ListaAulas aulas={dados?.lista_semana} vazia="Nenhuma aula esta semana" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Aulas da próxima semana</h2>
        <ListaAulas aulas={dados?.lista_proxima_semana} vazia="Nenhuma aula na próxima semana" />
      </div>
    </div>
  )
}
