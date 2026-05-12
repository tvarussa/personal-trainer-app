import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function mesAtualStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtMes(s) {
  const [a, m] = s.split('-')
  return `${MESES_ABREV[parseInt(m) - 1]} ${a}`
}
function moeda(v) { return `R$ ${Number(v).toFixed(2).replace('.', ',')}` }
function round2(n) { return Math.round(n * 100) / 100 }

function Modal({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onFechar}>
      <div
        className="bg-white w-full max-w-md mx-auto rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-800">{titulo}</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function FormAluno({ inicial, academias, onSalvar, onFechar }) {
  const [form, setForm] = useState(inicial || { nome: '', email: '', telefone: '', senha: '', preco_por_aula: '', taxa_mensal: '', observacoes: '', academia_id: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const editando = !!inicial?.id

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await onSalvar({
        ...form,
        preco_por_aula: parseFloat(form.preco_por_aula) || 0,
        taxa_mensal: parseFloat(form.taxa_mensal) || 0,
        academia_id: form.academia_id ? Number(form.academia_id) : null,
      })
    } catch (err) {
      setErro(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {[
        { label: 'Nome', campo: 'nome', type: 'text', required: true },
        ...(!editando ? [{ label: 'Email', campo: 'email', type: 'email', required: true }] : []),
        { label: 'Telefone', campo: 'telefone', type: 'tel' },
        ...(!editando ? [{ label: 'Senha inicial', campo: 'senha', type: 'password', required: true }] : []),
      ].map(({ label, campo, type, required }) => (
        <div key={campo}>
          <label className="text-xs text-gray-500">{label}</label>
          <input
            type={type}
            value={form[campo]}
            onChange={(e) => set(campo, e.target.value)}
            required={required}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Preço por aula (R$)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.preco_por_aula}
            onChange={(e) => set('preco_por_aula', e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Taxa mensal (R$)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.taxa_mensal}
            onChange={(e) => set('taxa_mensal', e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {academias?.length > 0 && (
        <div>
          <label className="text-xs text-gray-500">Academia</label>
          <select
            value={form.academia_id}
            onChange={e => set('academia_id', e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Sem academia</option>
            {academias.map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500">Observações</label>
        <textarea
          value={form.observacoes}
          onChange={(e) => set('observacoes', e.target.value)}
          rows={2}
          className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {editando && (
        <div className="flex items-center justify-between py-3 border-t border-gray-100 mt-1">
          <div>
            <p className="text-sm font-medium text-gray-700">Aluno ativo</p>
            <p className="text-xs text-gray-400">Ao inativar, recorrências são removidas e o login é bloqueado</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (form.ativo && !window.confirm('Ao inativar, todas as recorrências serão removidas e o aluno não poderá mais fazer login. Continuar?')) return
              set('ativo', !form.ativo)
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${form.ativo ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      )}

      {erro && <p className="text-sm text-red-500">{erro}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFechar} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
        </button>
      </div>
    </form>
  )
}

function AbaFinanceiroAluno({ alunoId }) {
  const [mes, setMes] = useState(mesAtualStr)
  const [detalhe, setDetalhe] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [toggling, setToggling] = useState(null)

  function navMes(delta) {
    const [a, m] = mes.split('-').map(Number)
    let nm = m + delta, na = a
    if (nm < 1) { nm = 12; na-- }
    if (nm > 12) { nm = 1; na++ }
    setMes(`${na}-${String(nm).padStart(2, '0')}`)
  }

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

  async function toggleCobrarAula(aula) {
    const key = `cobrar-${aula.agendamento_id ?? aula.recorrencia_id}-${aula.data_hora}`
    setToggling(key)
    try {
      await api.patch('/dashboard/marcar-cobranca', {
        agendamento_id: aula.agendamento_id ?? null,
        recorrencia_id: aula.recorrencia_id ?? null,
        data: aula.agendamento_id ? null : aula.data_hora.slice(0, 10),
        cobrar: !aula.cobrar,
      })
      await carregar()
    } finally {
      setToggling(null)
    }
  }

  async function excluirAula(aula) {
    if (!window.confirm('Excluir esta aula?')) return
    const key = `excluir-${aula.agendamento_id ?? aula.recorrencia_id}-${aula.data_hora}`
    setToggling(key)
    try {
      if (aula.agendamento_id) {
        await api.post(`/agendamentos/${aula.agendamento_id}/cancelar`)
      } else {
        await api.post(`/recorrencias/${aula.recorrencia_id}/cancelar-ocorrencia`, {
          data: aula.data_hora.slice(0, 10),
        })
      }
      await carregar()
    } catch (err) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Erro ao excluir aula')
    } finally {
      setToggling(null)
    }
  }

  async function togglePagoAula(aula) {
    const key = aula.agendamento_id ?? `rec-${aula.recorrencia_id}-${aula.data_hora}`
    setToggling(key)
    try {
      await api.patch('/financeiro/marcar-aula-pago', {
        agendamento_id: aula.agendamento_id ?? null,
        recorrencia_id: aula.recorrencia_id ?? null,
        data: aula.agendamento_id ? null : aula.data_hora.slice(0, 10),
        pago: !aula.pago,
      })
      await carregar()
    } finally {
      setToggling(null)
    }
  }

  async function toggleTaxaPago() {
    setToggling('taxa')
    try {
      await api.patch('/financeiro/marcar-taxa-pago', {
        aluno_id: alunoId,
        mes_referencia: mes,
        pago: !detalhe.taxa_paga,
      })
      await carregar()
    } finally {
      setToggling(null)
    }
  }

  const hoje = new Date()
  const executadoPago = detalhe ? round2(
    detalhe.aulas.filter(a => a.cobrar && a.pago && new Date(a.data_hora) <= hoje).length * detalhe.preco_por_aula +
    (detalhe.taxa_mensal > 0 && detalhe.taxa_paga ? detalhe.taxa_mensal : 0)
  ) : 0
  const executadoPendente = detalhe ? round2(
    detalhe.aulas.filter(a => a.cobrar && !a.pago && new Date(a.data_hora) <= hoje).length * detalhe.preco_por_aula +
    (detalhe.taxa_mensal > 0 && !detalhe.taxa_paga ? detalhe.taxa_mensal : 0)
  ) : 0
  const aVencer = detalhe ? round2(
    detalhe.aulas.filter(a => a.cobrar && new Date(a.data_hora) > hoje).length * detalhe.preco_por_aula
  ) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 justify-center">
        <button onClick={() => navMes(-1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">‹</button>
        <span className="font-semibold text-gray-800 text-sm">{fmtMes(mes)}</span>
        <button onClick={() => navMes(1)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">›</button>
      </div>

      {detalhe && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-green-50 rounded-xl p-2.5 text-center">
            <p className="text-xs text-green-600 font-medium leading-tight">Executado pago</p>
            <p className="text-sm font-bold text-green-800 mt-0.5">{moeda(executadoPago)}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-2.5 text-center">
            <p className="text-xs text-orange-500 font-medium leading-tight">Executado pendente</p>
            <p className="text-sm font-bold text-orange-800 mt-0.5">{moeda(executadoPendente)}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2.5 text-center">
            <p className="text-xs text-blue-500 font-medium leading-tight">A vencer</p>
            <p className="text-sm font-bold text-blue-800 mt-0.5">{moeda(aVencer)}</p>
          </div>
        </div>
      )}

      {carregando ? (
        <p className="text-center text-gray-400 text-sm py-6">Carregando...</p>
      ) : !detalhe || detalhe.aulas.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">Nenhuma aula neste mês</p>
      ) : (
        <div className="flex flex-col">
          {detalhe.aulas.map((a, i) => {
            const keyPago = a.agendamento_id ?? `rec-${a.recorrencia_id}-${a.data_hora}`
            const keyCobrar = `cobrar-${a.agendamento_id ?? a.recorrencia_id}-${a.data_hora}`
            const keyExcluir = `excluir-${a.agendamento_id ?? a.recorrencia_id}-${a.data_hora}`
            const d = new Date(a.data_hora)
            const passado = d <= hoje
            return (
              <div key={i} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-gray-500 capitalize">{d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
                    <span className="text-sm font-semibold text-gray-800">{d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {a.recorrente && <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 px-1 py-0.5 rounded-full">Rec</span>}
                    {!passado && <span className="text-xs bg-blue-50 text-blue-400 border border-blue-100 px-1 py-0.5 rounded-full">Futuro</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0 items-end">
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleCobrarAula(a)}
                      disabled={!!toggling}
                      className={`text-xs px-2 py-0.5 rounded-lg border transition-colors disabled:opacity-40 ${
                        a.cobrar ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-red-50 border-red-200 text-red-500'
                      }`}
                    >
                      {toggling === keyCobrar ? '...' : a.cobrar ? 'Cobrar' : 'Grátis'}
                    </button>
                    {!a.realizado && (
                      <button
                        onClick={() => excluirAula(a)}
                        disabled={!!toggling}
                        className="text-xs px-2 py-0.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-40"
                      >
                        {toggling === keyExcluir ? '...' : '✕'}
                      </button>
                    )}
                  </div>
                  {a.cobrar && (
                    <button
                      onClick={() => togglePagoAula(a)}
                      disabled={!!toggling}
                      className={`text-xs px-2 py-0.5 rounded-lg border transition-colors disabled:opacity-40 ${
                        a.pago ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-600'
                      }`}
                    >
                      {toggling === keyPago ? '...' : a.pago ? 'Pago' : 'Pendente'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {detalhe.taxa_mensal > 0 && (
            <div className="flex items-center justify-between py-2 mt-1 border-t border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-700">Taxa mensal</p>
                <p className="text-xs text-gray-400">{moeda(detalhe.taxa_mensal)}</p>
              </div>
              <button
                onClick={toggleTaxaPago}
                disabled={toggling === 'taxa'}
                className={`text-xs px-2 py-1 rounded-lg border shrink-0 transition-colors disabled:opacity-40 ${
                  detalhe.taxa_paga ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-600'
                }`}
              >
                {toggling === 'taxa' ? '...' : detalhe.taxa_paga ? 'Paga' : 'Pendente'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PainelAluno({ aluno, academias, onFechar }) {
  const [aba, setAba] = useState('dados')
  const [recorrencias, setRecorrencias] = useState([])
  const [novaRec, setNovaRec] = useState({ dia_semana: 0, horario: '07:00', frequencia: 'semanal' })
  const [adicionando, setAdicionando] = useState(false)

  const carregarRec = useCallback(async () => {
    const { data } = await api.get(`/recorrencias/?aluno_id=${aluno.id}`)
    setRecorrencias(data)
  }, [aluno.id])

  useEffect(() => { carregarRec() }, [carregarRec])

  async function salvarDados(dados) {
    await api.put(`/alunos/${aluno.id}`, dados)
    onFechar(true)
  }

  async function adicionarRec() {
    setAdicionando(true)
    try {
      await api.post('/recorrencias/', { aluno_id: aluno.id, ...novaRec })
      carregarRec()
    } catch (err) {
      alert(err.response?.data?.detail || 'Erro ao adicionar recorrência')
    } finally {
      setAdicionando(false)
    }
  }

  async function removerRec(id) {
    await api.delete(`/recorrencias/${id}`)
    carregarRec()
  }

  return (
    <Modal titulo={aluno.nome} onFechar={() => onFechar(false)}>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        {[['dados', 'Dados'], ['recorrências', 'Horários'], ['financeiro', 'Financeiro']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setAba(val)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${aba === val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'dados' && (
        <FormAluno
          inicial={{ id: aluno.id, nome: aluno.nome, telefone: aluno.telefone || '', preco_por_aula: aluno.preco_por_aula, taxa_mensal: aluno.taxa_mensal, observacoes: aluno.observacoes || '', academia_id: aluno.academia_id || '', ativo: aluno.ativo }}
          academias={academias}
          onSalvar={salvarDados}
          onFechar={() => onFechar(false)}
        />
      )}

      {aba === 'financeiro' && <AbaFinanceiroAluno alunoId={aluno.id} />}

      {aba === 'recorrências' && (
        <div className="flex flex-col gap-4">
          {/* Nova recorrência */}
          <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-3 border border-gray-100">
            <p className="text-xs font-medium text-gray-600">Adicionar horário recorrente</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Dia</label>
                <select
                  value={novaRec.dia_semana}
                  onChange={(e) => setNovaRec((r) => ({ ...r, dia_semana: parseInt(e.target.value) }))}
                  className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Horário</label>
                <input
                  type="time"
                  value={novaRec.horario}
                  onChange={(e) => setNovaRec((r) => ({ ...r, horario: e.target.value }))}
                  className="w-full mt-1 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <select
              value={novaRec.frequencia}
              onChange={(e) => setNovaRec((r) => ({ ...r, frequencia: e.target.value }))}
              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
            <button
              onClick={adicionarRec}
              disabled={adicionando}
              className="bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {adicionando ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>

          {/* Lista de recorrências */}
          {recorrencias.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-4">Nenhuma recorrência cadastrada</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recorrencias.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-xl p-3">
                  <div>
                    <p className="font-semibold text-purple-800 text-sm">{r.dia_semana_nome} às {r.horario}</p>
                    <p className="text-xs text-purple-500 capitalize">{r.frequencia}</p>
                  </div>
                  <button onClick={() => removerRec(r.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function PersonalAlunos() {
  const navigate = useNavigate()
  const [alunos, setAlunos] = useState([])
  const [academias, setAcademias] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)
  const [alunoSelecionado, setAlunoSelecionado] = useState(null)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [{ data: alunosData }, { data: academiasData }] = await Promise.all([
        api.get('/alunos/'),
        api.get('/academias/'),
      ])
      setAlunos(alunosData)
      setAcademias(academiasData)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function cadastrar(dados) {
    await api.post('/alunos/', dados)
    setModalNovo(false)
    carregar()
  }

  function fecharPainel(atualizar) {
    setAlunoSelecionado(null)
    if (atualizar) carregar()
  }

  const filtrados = alunos.filter((a) =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) ||
    a.email.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Alunos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/personal/academias')}
            className="text-sm px-3 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
          >
            Academias
          </button>
          <button
            onClick={() => setModalNovo(true)}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700"
          >
            + Novo
          </button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Buscar aluno..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {carregando ? (
        <div className="text-center text-gray-400 text-sm py-8">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8 bg-white rounded-xl border border-gray-100">
          {busca ? 'Nenhum aluno encontrado' : 'Nenhum aluno cadastrado'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.map((a) => (
            <button
              key={a.id}
              onClick={() => setAlunoSelecionado(a)}
              className={`bg-white rounded-xl border p-4 flex items-center justify-between text-left transition-colors ${a.ativo ? 'border-gray-100 hover:bg-gray-50 active:bg-gray-100' : 'border-gray-100 opacity-60'}`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">{a.nome}</p>
                  {!a.ativo && (
                    <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded-full">Inativo</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{a.email}</p>
                {a.academia_nome && (
                  <p className="text-xs text-blue-500 mt-0.5">{a.academia_nome}</p>
                )}
                {(a.preco_por_aula > 0 || a.taxa_mensal > 0) && (
                  <p className="text-xs text-green-600 mt-1">
                    R$ {a.preco_por_aula.toFixed(2)}/aula
                    {a.taxa_mensal > 0 && ` · R$ ${a.taxa_mensal.toFixed(2)}/mês`}
                  </p>
                )}
              </div>
              <span className="text-gray-300 text-xl">›</span>
            </button>
          ))}
        </div>
      )}

      {modalNovo && (
        <Modal titulo="Novo Aluno" onFechar={() => setModalNovo(false)}>
          <FormAluno academias={academias} onSalvar={cadastrar} onFechar={() => setModalNovo(false)} />
        </Modal>
      )}

      {alunoSelecionado && (
        <PainelAluno aluno={alunoSelecionado} academias={academias} onFechar={fecharPainel} />
      )}
    </div>
  )
}
