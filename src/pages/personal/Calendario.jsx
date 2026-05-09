import { useState, useEffect, useCallback } from 'react'
import CalendarioBase, { dataStr } from '../../components/CalendarioBase'
import api from '../../services/api'

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

// Backend dia_semana: 0=Segunda … 6=Domingo
// JS getDay():        0=Domingo … 6=Sábado
function backendParaJsWeekday(backend) {
  return (backend + 1) % 7
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
      const jsWeekday = backendParaJsWeekday(b.dia_semana)
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

function formatHora(dataHoraStr) {
  const d = new Date(dataHoraStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function BloqueioItem({ b }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-red-700">
          {b.dia_todo ? 'Dia todo bloqueado' : `Bloqueado: ${b.hora_inicio} – ${b.hora_fim}`}
          {b.tipo === 'recorrente' && (
            <span className="ml-1.5 text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-normal">recorrente</span>
          )}
        </p>
        {b.motivo && <p className="text-xs text-red-400 mt-0.5">{b.motivo}</p>}
      </div>
    </div>
  )
}

function SlotItem({ slot, onBloquear, onDesbloquear, onRemover }) {
  const bloqueado = slot.bloqueado_pelo_personal
  const ocupado = !slot.disponivel && !bloqueado
  const virtual = !!slot.recorrencia

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${
      bloqueado ? 'bg-red-50 border-red-100' :
      ocupado   ? 'bg-blue-50 border-blue-100' :
                  'bg-green-50 border-green-100'
    }`}>
      <div>
        <p className="font-semibold text-gray-800 text-sm">{formatHora(slot.data_hora)}</p>
        {ocupado && slot.nome_aluno && (
          <p className="text-xs text-blue-600 mt-0.5">{slot.nome_aluno}</p>
        )}
        {ocupado && virtual && (
          <p className="text-xs text-blue-400 mt-0.5">Recorrente</p>
        )}
        {bloqueado && <p className="text-xs text-red-500 mt-0.5">Bloqueado</p>}
        {!bloqueado && !ocupado && <p className="text-xs text-green-600 mt-0.5">Disponível</p>}
      </div>
      <div className="flex gap-2">
        {!ocupado && !virtual && (
          bloqueado ? (
            <button onClick={() => onDesbloquear(slot.id)} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Desbloquear
            </button>
          ) : (
            <button onClick={() => onBloquear(slot.id)} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg text-red-500 hover:bg-red-50">
              Bloquear
            </button>
          )
        )}
        {!ocupado && !virtual && (
          <button onClick={() => onRemover(slot.id)} className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function SecaoBloqueios({ bloqueios, onAtualizar }) {
  const [aberta, setAberta] = useState(false)
  const [tipo, setTipo] = useState('pontual')
  const [data, setData] = useState('')
  const [diaSemana, setDiaSemana] = useState(0)
  const [diaTodo, setDiaTodo] = useState(true)
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFim, setHoraFim] = useState('12:00')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  function trocarTipo(t) { setTipo(t); setErro(null) }
  function trocarDiaTodo(val) { setDiaTodo(val); setErro(null) }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const payload = {
        motivo: motivo || null,
        hora_inicio: diaTodo ? null : horaInicio,
        hora_fim: diaTodo ? null : horaFim,
        ...(tipo === 'pontual' ? { data } : { dia_semana: diaSemana }),
      }
      await api.post('/bloqueios/', payload)
      setData('')
      setMotivo('')
      onAtualizar()
    } catch (err) {
      setErro(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id) {
    await api.delete(`/bloqueios/${id}`)
    onAtualizar()
  }

  const podeSalvar = !salvando && (tipo !== 'pontual' || !!data) && (diaTodo || horaInicio < horaFim)

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setAberta(a => !a)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700"
      >
        <span>Bloqueio de horários</span>
        <span className="text-gray-400">{aberta ? '▲' : '▼'}</span>
      </button>

      {aberta && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mt-3">
            {['pontual', 'recorrente'].map(t => (
              <button
                key={t}
                onClick={() => trocarTipo(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tipo === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
              >
                {t === 'pontual' ? 'Data específica' : 'Dia da semana'}
              </button>
            ))}
          </div>

          {tipo === 'pontual' ? (
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <select
              value={diaSemana}
              onChange={e => setDiaSemana(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}

          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[[true, 'Dia todo'], [false, 'Janela de horário']].map(([val, label]) => (
              <button
                key={String(val)}
                onClick={() => trocarDiaTodo(val)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${diaTodo === val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {!diaTodo && (
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">De</label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={e => setHoraInicio(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <span className="text-gray-400 mt-5">–</span>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Até</label>
                <input
                  type="time"
                  value={horaFim}
                  onChange={e => setHoraFim(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <input
            type="text"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {erro && <p className="text-xs text-red-500">{erro}</p>}

          <button
            onClick={salvar}
            disabled={!podeSalvar}
            className="w-full py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Bloquear'}
          </button>

          {bloqueios.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">Nenhum bloqueio ativo</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {bloqueios.map(b => (
                <div key={b.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      {b.tipo === 'recorrente' ? b.dia_semana_nome : b.data}
                      {b.tipo === 'recorrente' && (
                        <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">recorrente</span>
                      )}
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      {b.dia_todo ? 'Dia todo' : `${b.hora_inicio} – ${b.hora_fim}`}
                    </p>
                    {b.motivo && <p className="text-xs text-red-400">{b.motivo}</p>}
                  </div>
                  <button onClick={() => remover(b.id)} className="text-xs text-red-400 hover:text-red-600 px-2">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PersonalCalendario() {
  const [slots, setSlots] = useState([])
  const [bloqueios, setBloqueios] = useState([])
  const [marcadores, setMarcadores] = useState({})
  const [marcadoresBloqueios, setMarcadoresBloqueios] = useState({})
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const [novaHora, setNovaHora] = useState('08:00')
  const [recorrente, setRecorrente] = useState(false)
  const [semanas, setSemanas] = useState(8)
  const [adicionando, setAdicionando] = useState(false)
  const [feedbackSlot, setFeedbackSlot] = useState(null)
  const [carregando, setCarregando] = useState(false)

  const carregarSlots = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/slots/')
      setSlots(data)
      const m = {}
      data.forEach((s) => {
        const d = new Date(s.data_hora)
        const chave = dataStr(d.getFullYear(), d.getMonth(), d.getDate())
        if (!m[chave]) m[chave] = {}
        if (s.bloqueado_pelo_personal) m[chave].bloqueado = true
        else if (!s.disponivel) m[chave].ocupado = true
        else m[chave].disponivel = true
      })
      setMarcadores(m)
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarBloqueios = useCallback(async () => {
    try {
      const { data: lista } = await api.get('/bloqueios/')
      setBloqueios(lista)
      setMarcadoresBloqueios(gerarMarcadoresBloqueios(lista))
    } catch {}
  }, [])

  useEffect(() => {
    carregarSlots()
    carregarBloqueios()
  }, [carregarSlots, carregarBloqueios])

  const marcadoresCombinados = { ...marcadoresBloqueios }
  Object.entries(marcadores).forEach(([k, v]) => {
    marcadoresCombinados[k] = { ...(marcadoresCombinados[k] || {}), ...v }
  })

  const slotsDoDia = diaSelecionado
    ? slots.filter((s) => {
        const d = new Date(s.data_hora)
        return dataStr(d.getFullYear(), d.getMonth(), d.getDate()) === diaSelecionado
      }).sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
    : []

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

  async function adicionarSlot() {
    if (!diaSelecionado || !novaHora) return
    setAdicionando(true)
    setFeedbackSlot(null)
    try {
      const dataHora = `${diaSelecionado}T${novaHora}:00`
      const { data } = await api.post('/slots/', {
        data_hora: dataHora,
        recorrente,
        semanas: recorrente ? semanas : 1,
      })
      if (recorrente) {
        setFeedbackSlot(`${data.criados} slot(s) criado(s)${data.pulados ? `, ${data.pulados} pulado(s)` : ''}`)
      }
      await carregarSlots()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao adicionar slot')
    } finally {
      setAdicionando(false)
    }
  }

  async function bloquearSlot(id) {
    await api.patch(`/slots/${id}/bloquear`, { bloqueado: true })
    carregarSlots()
  }

  async function desbloquearSlot(id) {
    await api.patch(`/slots/${id}/bloquear`, { bloqueado: false })
    carregarSlots()
  }

  async function removerSlot(id) {
    await api.delete(`/slots/${id}`)
    carregarSlots()
  }

  function atualizarBloqueios() {
    carregarBloqueios()
    carregarSlots()
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Calendário</h1>

      <CalendarioBase
        marcadores={marcadoresCombinados}
        diaSelecionado={diaSelecionado}
        onDiaSelecionado={setDiaSelecionado}
      />

      {diaSelecionado && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm">
              {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <span className="text-xs text-gray-400">{slotsDoDia.length} slot(s)</span>
          </div>

          {/* Bloqueios ativos neste dia */}
          {bloqueiosDoDia.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {bloqueiosDoDia.map(b => <BloqueioItem key={b.id} b={b} />)}
            </div>
          )}

          {/* Adicionar novo slot */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                type="time"
                value={novaHora}
                onChange={(e) => setNovaHora(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <button
                onClick={adicionarSlot}
                disabled={adicionando}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {adicionando ? '...' : '+ Slot'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setRecorrente(r => !r); setFeedbackSlot(null) }}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  recorrente
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${recorrente ? 'bg-blue-600 border-blue-600' : 'border-gray-400'}`} />
                Recorrente (semanal)
              </button>

              {recorrente && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-gray-500">Semanas:</span>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={semanas}
                    onChange={e => setSemanas(Number(e.target.value))}
                    className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              )}
            </div>

            {feedbackSlot && (
              <p className="text-xs text-green-600">{feedbackSlot}</p>
            )}
          </div>

          {/* Slots do dia */}
          {carregando ? (
            <div className="text-center text-gray-400 text-sm py-4">Carregando...</div>
          ) : slotsDoDia.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4 bg-white rounded-xl border border-gray-100">
              Nenhum slot neste dia
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {slotsDoDia.map((s) => (
                <SlotItem
                  key={s.id}
                  slot={s}
                  onBloquear={bloquearSlot}
                  onDesbloquear={desbloquearSlot}
                  onRemover={removerSlot}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!diaSelecionado && (
        <p className="text-center text-gray-400 text-sm">Toque em um dia para gerenciar os slots</p>
      )}

      <SecaoBloqueios bloqueios={bloqueios} onAtualizar={atualizarBloqueios} />
    </div>
  )
}
