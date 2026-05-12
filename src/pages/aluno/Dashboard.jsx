import { useState, useEffect, useCallback } from 'react'
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

function ListaAulas({ aulas, vazia, onToggle }) {
  const [carregando, setCarregando] = useState(null)

  if (!aulas || aulas.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-3">{vazia}</p>
  }

  async function handleToggle(a) {
    if (!a.cancelado && !window.confirm('Confirma o cancelamento desta aula?')) return
    const chave = a.data_hora + (a.agendamento_id ?? a.recorrencia_id)
    setCarregando(chave)
    try {
      await onToggle(a)
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : 'Erro ao processar solicitação. Tente novamente.'
      alert(msg)
    } finally {
      setCarregando(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {aulas.map((a, i) => {
        const chave = a.data_hora + (a.agendamento_id ?? a.recorrencia_id)
        const ocupado = carregando === chave
        return (
          <div key={i} className={`flex items-center gap-2 ${a.cancelado ? 'opacity-50' : ''}`}>
            <span className="text-sm text-gray-500 w-28 shrink-0">{fmtDia(a.data_hora)}</span>
            <span className={`text-sm font-semibold ${a.cancelado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{fmtHora(a.data_hora)}</span>
            <div className="flex gap-1 flex-wrap flex-1">
              {a.recorrente && (
                <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-1.5 py-0.5 rounded-full">Rec</span>
              )}
              {a.cancelado ? (
                <span className="text-xs bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">Cancelada</span>
              ) : a.realizado ? (
                <span className="text-xs bg-green-50 text-green-600 border border-green-100 px-1.5 py-0.5 rounded-full">Realizada</span>
              ) : null}
              {!a.cancelado && (
                a.cobrar
                  ? <span className="text-xs bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded-full">Cobrada</span>
                  : <span className="text-xs bg-orange-50 text-orange-500 border border-orange-100 px-1.5 py-0.5 rounded-full">Não cobrada</span>
              )}
            </div>
            {!a.realizado && (a.cancelado || new Date(a.data_hora) > new Date()) && (
              <button
                onClick={() => handleToggle(a)}
                disabled={ocupado}
                className={`text-xs shrink-0 px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                  a.cancelado
                    ? 'text-blue-600 border-blue-100 bg-blue-50 hover:bg-blue-100'
                    : 'text-red-500 border-red-100 bg-red-50 hover:bg-red-100'
                }`}
              >
                {ocupado ? '...' : a.cancelado ? 'Desfazer' : 'Cancelar'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AlunoDashboard() {
  const { user } = useAuth()
  const [dados, setDados] = useState(null)

  const carregar = useCallback(() => {
    api.get('/dashboard/aluno')
      .then(r => setDados(r.data))
      .catch(err => setDados({ _erro: String(err), _status: err?.response?.status }))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function toggleCancelamento(aula) {
    if (aula.cancelado) {
      if (aula.agendamento_id) {
        await api.post(`/agendamentos/${aula.agendamento_id}/restaurar`)
      } else {
        await api.delete(`/recorrencias/${aula.recorrencia_id}/cancelar-ocorrencia`, { params: { data: aula.data } })
      }
    } else {
      if (aula.agendamento_id) {
        await api.post(`/agendamentos/${aula.agendamento_id}/cancelar`)
      } else {
        await api.post(`/recorrencias/${aula.recorrencia_id}/cancelar-ocorrencia`, { data: aula.data })
      }
    }
    carregar()
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 mb-1">
          Olá, {user?.nome?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500">Bem-vindo ao seu painel</p>
      </div>

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
        <ListaAulas aulas={dados?.lista_semana} vazia="Nenhuma aula esta semana" onToggle={toggleCancelamento} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Aulas da próxima semana</h2>
        <ListaAulas aulas={dados?.lista_proxima_semana} vazia="Nenhuma aula na próxima semana" onToggle={toggleCancelamento} />
      </div>
    </div>
  )
}
