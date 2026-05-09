import { useState, useEffect, useCallback } from 'react'
import CalendarioBase, { dataStr } from '../../components/CalendarioBase'
import api from '../../services/api'

const ANTECEDENCIA_HORAS = 24

function horasAte(dataHoraStr) {
  return (new Date(dataHoraStr) - new Date()) / 3600000
}

function formatHora(dataHoraStr) {
  const d = new Date(dataHoraStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDataCurta(dataHoraStr) {
  return new Date(dataHoraStr).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function jsParaBackendWeekday(js) {
  return js === 0 ? 6 : js - 1
}

function gerarMarcadoresBloqueios(lista) {
  const m = {}
  const hoje = new Date()
  lista.forEach(b => {
    if (b.tipo === 'pontual' && b.data) {
      if (!m[b.data]) m[b.data] = {}
      m[b.data].bloqueado = true
    } else if (b.tipo === 'recorrente' && b.dia_semana != null) {
      const jsWeekday = (b.dia_semana + 1) % 7
      for (let i = 0; i < 400; i++) {
        const d = new Date(hoje)
        d.setDate(hoje.getDate() + i)
        if (d.getDay() === jsWeekday) {
          const chave = dataStr(d.getFullYear(), d.getMonth(), d.getDate())
          if (!m[chave]) m[chave] = {}
          m[chave].bloqueado = true
        }
      }
    }
  })
  return m
}

export default function AlunoAgendamentos() {
  const [slots, setSlots] = useState([])
  const [agendamentos, setAgendamentos] = useState([])   // agendamentos reais confirmados
  const [bloqueios, setBloqueios] = useState([])
  const [marcadores, setMarcadores] = useState({})
  const [marcadoresBloqueios, setMarcadoresBloqueios] = useState({})
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [agendando, setAgendando] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [cancelandoRec, setCancelandoRec] = useState(null)
  const [aviso, setAviso] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [{ data: slotsData }, { data: agData }, { data: bloqueiosData }] = await Promise.all([
        api.get('/slots/'),
        api.get('/agendamentos/'),
        api.get('/bloqueios/'),
      ])

      const confirmados = agData.filter(a => a.status === 'confirmado')
      setSlots(slotsData)
      setAgendamentos(confirmados)
      setBloqueios(bloqueiosData)
      setMarcadoresBloqueios(gerarMarcadoresBloqueios(bloqueiosData))

      // Marcadores por dia
      const m = {}

      slotsData.forEach(s => {
        const d = new Date(s.data_hora)
        const chave = dataStr(d.getFullYear(), d.getMonth(), d.getDate())
        if (!m[chave]) m[chave] = {}

        if (s.bloqueado_pelo_personal) {
          m[chave].bloqueado = true
        } else if (s.disponivel) {
          m[chave].disponivel = true
        } else {
          // Ocupado: agendamento real ou recorrência de qualquer aluno
          m[chave].ocupado = true
        }
      })

      // Agendamentos confirmados reais (podem já estar cobertos pelos slots, mas garante)
      confirmados.forEach(a => {
        const d = new Date(a.data_hora)
        const chave = dataStr(d.getFullYear(), d.getMonth(), d.getDate())
        if (!m[chave]) m[chave] = {}
        m[chave].ocupado = true
      })

      setMarcadores(m)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const marcadoresCombinados = { ...marcadoresBloqueios }
  Object.entries(marcadores).forEach(([k, v]) => {
    marcadoresCombinados[k] = { ...(marcadoresCombinados[k] || {}), ...v }
  })

  // Slots disponíveis no dia selecionado (para agendar)
  const slotsDisponiveisDoDia = diaSelecionado
    ? slots
        .filter(s => {
          if (!s.disponivel || s.bloqueado_pelo_personal) return false
          const d = new Date(s.data_hora)
          return dataStr(d.getFullYear(), d.getMonth(), d.getDate()) === diaSelecionado
        })
        .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    : []

  // Minhas recorrências neste dia (virtual, pre-confirmadas)
  const minhasRecDoDia = diaSelecionado
    ? slots
        .filter(s => {
          if (!s.minha_recorrencia) return false
          const d = new Date(s.data_hora)
          return dataStr(d.getFullYear(), d.getMonth(), d.getDate()) === diaSelecionado
        })
        .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    : []

  // Agendamentos reais confirmados no dia selecionado
  const agDoDia = diaSelecionado
    ? agendamentos.filter(a => {
        const d = new Date(a.data_hora)
        return dataStr(d.getFullYear(), d.getMonth(), d.getDate()) === diaSelecionado
      })
    : []

  // Bloqueios ativos no dia selecionado
  const bloqueiosDoDia = diaSelecionado
    ? (() => {
        const d = new Date(diaSelecionado + 'T12:00:00')
        const backendDay = jsParaBackendWeekday(d.getDay())
        return bloqueios.filter(b =>
          (b.tipo === 'pontual' && b.data === diaSelecionado) ||
          (b.tipo === 'recorrente' && b.dia_semana === backendDay)
        )
      })()
    : []

  const diaTodoBloqueado = bloqueiosDoDia.some(b => b.dia_todo)

  // "Próximas aulas": agendamentos reais + minhas recorrências futuras
  const agora = new Date()
  const proximasReais = agendamentos
    .filter(a => new Date(a.data_hora) > agora)
    .map(a => ({ ...a, _virtual: false }))

  const proximasVirtuais = slots
    .filter(s => s.minha_recorrencia && new Date(s.data_hora) > agora)
    .map(s => ({ id: s.id, data_hora: s.data_hora, _virtual: true, recorrencia_id: s.recorrencia_id }))

  const proximasAulas = [...proximasReais, ...proximasVirtuais]
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    .slice(0, 5)

  async function agendar(slotId) {
    setAgendando(slotId)
    try {
      await api.post('/agendamentos/', { slot_id: slotId, aluno_id: 0, tipo: 'avulso' })
      await carregar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao agendar')
    } finally {
      setAgendando(null)
    }
  }

  async function cancelar(agendamentoId, dataHora) {
    const horas = horasAte(dataHora)
    if (horas < ANTECEDENCIA_HORAS) {
      if (!window.confirm('Cancelamento com menos de 24h. A aula será cobrada mesmo assim. Deseja cancelar?')) return
    }
    setCancelando(agendamentoId)
    try {
      const { data } = await api.post(`/agendamentos/${agendamentoId}/cancelar`)
      if (data.aviso) setAviso(data.aviso)
      await carregar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao cancelar')
    } finally {
      setCancelando(null)
    }
  }

  async function cancelarOcorrencia(recorrenciaId, dataHora) {
    const horas = horasAte(dataHora)
    if (horas < ANTECEDENCIA_HORAS) {
      if (!window.confirm('Cancelamento com menos de 24h. A aula será cobrada mesmo assim. Deseja cancelar?')) return
    }
    const d = new Date(dataHora)
    const data = dataStr(d.getFullYear(), d.getMonth(), d.getDate())
    setCancelandoRec(recorrenciaId + data)
    try {
      await api.post(`/recorrencias/${recorrenciaId}/cancelar-ocorrencia`, { data })
      await carregar()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao cancelar')
    } finally {
      setCancelandoRec(null)
    }
  }

  const nenhumDoDia = !diaTodoBloqueado && slotsDisponiveisDoDia.length === 0 && minhasRecDoDia.length === 0 && agDoDia.length === 0

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Minha Agenda</h1>

      {aviso && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700 flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p className="font-medium">Atenção</p>
            <p>{aviso}</p>
          </div>
          <button onClick={() => setAviso(null)} className="ml-auto text-orange-400">✕</button>
        </div>
      )}

      {/* Próximas aulas */}
      {proximasAulas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-2">Próximas aulas</h2>
          <div className="flex flex-col gap-2">
            {proximasAulas.map(a => {
              const horas = horasAte(a.data_hora)
              const d = new Date(a.data_hora)
              const cancelKey = a._virtual ? `${a.recorrencia_id}${dataStr(d.getFullYear(), d.getMonth(), d.getDate())}` : null
              return (
                <div key={a.id} className="bg-blue-50 rounded-xl border border-blue-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-blue-800 text-sm">{formatDataCurta(a.data_hora)}</p>
                    <p className="text-xs text-blue-600">{formatHora(a.data_hora)}</p>
                    {a._virtual && (
                      <p className="text-xs text-blue-400 mt-0.5">Recorrente</p>
                    )}
                    {!a._virtual && horas < ANTECEDENCIA_HORAS && horas > 0 && (
                      <p className="text-xs text-orange-500 mt-0.5">⚠️ Cancelamento tardio — será cobrado</p>
                    )}
                  </div>
                  {!a._virtual && horas > 0 && (
                    <button
                      onClick={() => cancelar(a.id, a.data_hora)}
                      disabled={cancelando === a.id}
                      className="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancelando === a.id ? '...' : 'Cancelar'}
                    </button>
                  )}
                  {a._virtual && horas > 0 && (
                    <button
                      onClick={() => cancelarOcorrencia(a.recorrencia_id, a.data_hora)}
                      disabled={cancelandoRec === cancelKey}
                      className="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancelandoRec === cancelKey ? '...' : 'Cancelar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Calendário */}
      <CalendarioBase
        marcadores={marcadoresCombinados}
        diaSelecionado={diaSelecionado}
        onDiaSelecionado={setDiaSelecionado}
      />

      {/* Detalhe do dia */}
      {diaSelecionado && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-gray-700 text-sm">
            {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>

          {/* Bloqueios */}
          {bloqueiosDoDia.map(b => (
            <div key={b.id} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
              <p className="text-sm font-medium text-red-700">
                {b.dia_todo ? 'Dia indisponível' : `Indisponível: ${b.hora_inicio} – ${b.hora_fim}`}
              </p>
            </div>
          ))}

          {/* Agendamentos reais já confirmados no dia */}
          {agDoDia.length > 0 && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 text-sm text-blue-700">
              Você já tem {agDoDia.length} aula(s) agendada(s) neste dia.
            </div>
          )}

          {carregando ? (
            <div className="text-center text-gray-400 text-sm py-4">Carregando...</div>
          ) : (
            <>
              {/* Minhas recorrências do dia */}
              {minhasRecDoDia.map(s => {
                const horas = horasAte(s.data_hora)
                const d = new Date(s.data_hora)
                const cancelKey = `${s.recorrencia_id}${dataStr(d.getFullYear(), d.getMonth(), d.getDate())}`
                return (
                  <div key={s.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <div>
                      <p className="font-semibold text-blue-800 text-sm">{formatHora(s.data_hora)}</p>
                      <p className="text-xs text-blue-500 mt-0.5">Aula recorrente confirmada</p>
                    </div>
                    {horas > 0 && (
                      <button
                        onClick={() => cancelarOcorrencia(s.recorrencia_id, s.data_hora)}
                        disabled={cancelandoRec === cancelKey}
                        className="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        {cancelandoRec === cancelKey ? '...' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Slots disponíveis para agendar */}
              {slotsDisponiveisDoDia.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="font-semibold text-gray-800 text-sm">{formatHora(s.data_hora)}</p>
                  <button
                    onClick={() => agendar(s.id)}
                    disabled={agendando === s.id}
                    className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {agendando === s.id ? '...' : 'Agendar'}
                  </button>
                </div>
              ))}

              {nenhumDoDia && (
                <div className="text-center text-gray-400 text-sm py-6 bg-white rounded-xl border border-gray-100">
                  Nenhum horário disponível neste dia
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!diaSelecionado && proximasAulas.length === 0 && (
        <p className="text-center text-gray-400 text-sm">Toque em um dia com horário disponível para agendar</p>
      )}
    </div>
  )
}
