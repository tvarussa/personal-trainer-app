import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../services/api'

const PROVEDORES = [
  { value: 'zapi', label: 'Z-API', url_exemplo: 'https://api.z-api.io' },
  { value: 'evolution', label: 'Evolution API', url_exemplo: 'https://api.seuservidor.com' },
]

function fmtDt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PersonalConfiguracoes() {
  const [aba, setAba] = useState('whatsapp')
  const [config, setConfig] = useState({ provedor: 'zapi', url: '', instance_id: '', token: '', numero_personal: '' })
  const [configurado, setConfigurado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [mensagem, setMensagem] = useState(null)
  const [scheduler, setScheduler] = useState(null)
  const [executando, setExecutando] = useState(false)
  const [logs, setLogs] = useState([])
  const [restaurando, setRestaurando] = useState(false)
  const inputArquivo = useRef(null)

  const carregar = useCallback(async () => {
    try {
      const [{ data: cfg }, { data: sched }] = await Promise.all([
        api.get('/configuracoes/whatsapp'),
        api.get('/configuracoes/scheduler'),
      ])
      if (cfg.provedor) {
        setConfig((c) => ({ ...c, ...cfg, token: '' }))
        setConfigurado(true)
      }
      setScheduler(sched)
    } catch {
      // ignora
    }
  }, [])

  const carregarLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/backup/logs')
      setLogs(data)
    } catch {}
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (aba === 'backup') carregarLogs() }, [aba, carregarLogs])

  async function baixarBackup() {
    const a = document.createElement('a')
    a.href = `${api.defaults.baseURL}/backup/download`
    a.setAttribute('Authorization', api.defaults.headers.common['Authorization'])
    // Faz o download via fetch para incluir o header de auth
    try {
      const resp = await fetch(`${api.defaults.baseURL}/backup/download`, {
        headers: { Authorization: api.defaults.headers.common['Authorization'] },
      })
      if (!resp.ok) throw new Error('Erro ao baixar')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nome = resp.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? 'backup.db'
      link.download = nome
      link.click()
      URL.revokeObjectURL(url)
      carregarLogs()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Falha ao baixar backup' })
    }
  }

  async function restaurarBackup(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    if (!confirm(`Restaurar backup "${arquivo.name}"? O banco atual será substituído.`)) return
    setRestaurando(true)
    setMensagem(null)
    try {
      const form = new FormData()
      form.append('arquivo', arquivo)
      await api.post('/backup/restaurar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMensagem({ tipo: 'ok', texto: 'Backup restaurado! Recarregue o servidor.' })
      carregarLogs()
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.response?.data?.detail || 'Falha na restauração' })
    } finally {
      setRestaurando(false)
      if (inputArquivo.current) inputArquivo.current.value = ''
    }
  }

  function set(campo, valor) {
    setConfig((c) => ({ ...c, [campo]: valor }))
  }

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem(null)
    try {
      await api.put('/configuracoes/whatsapp', config)
      setMensagem({ tipo: 'ok', texto: 'Configuração salva com sucesso!' })
      setConfigurado(true)
      carregar()
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.response?.data?.detail || 'Erro ao salvar' })
    } finally {
      setSalvando(false)
    }
  }

  async function remover() {
    if (!confirm('Remover configuração do WhatsApp?')) return
    await api.delete('/configuracoes/whatsapp')
    setConfigurado(false)
    setConfig({ provedor: 'zapi', url: '', instance_id: '', token: '', numero_personal: '' })
    setMensagem({ tipo: 'ok', texto: 'Configuração removida.' })
  }

  async function testar() {
    setTestando(true)
    setMensagem(null)
    try {
      await api.post('/configuracoes/whatsapp/testar', {
        numero: config.numero_personal,
        mensagem: 'Teste de conexão do app Personal Trainer ✅',
      })
      setMensagem({ tipo: 'ok', texto: 'Mensagem de teste enviada!' })
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.response?.data?.detail || 'Falha no envio' })
    } finally {
      setTestando(false)
    }
  }

  async function executarAgora() {
    if (!confirm('Executar fechamento mensal agora? Isso processará o mês anterior.')) return
    setExecutando(true)
    try {
      await api.post('/configuracoes/scheduler/executar-agora')
      setMensagem({ tipo: 'ok', texto: 'Fechamento iniciado em background.' })
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.response?.data?.detail || 'Erro ao executar' })
    } finally {
      setExecutando(false)
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-gray-800">Configurações</h1>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[['whatsapp', 'WhatsApp'], ['scheduler', 'Automações'], ['backup', 'Backup']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setAba(val)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${aba === val ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mensagem && (
        <div className={`rounded-xl px-4 py-3 text-sm ${mensagem.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {mensagem.texto}
        </div>
      )}

      {/* Aba WhatsApp */}
      {aba === 'whatsapp' && (
        <div className="flex flex-col gap-4">
          {configurado && (
            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">WhatsApp configurado</p>
                <p className="text-xs text-green-600 capitalize">{config.provedor || '—'}</p>
              </div>
              <button onClick={remover} className="text-xs text-red-400 hover:text-red-600">Remover</button>
            </div>
          )}

          <form onSubmit={salvar} className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-gray-500">Provedor</label>
              <div className="flex gap-2 mt-1">
                {PROVEDORES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { set('provedor', p.value); set('url', p.url_exemplo) }}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      config.provedor === p.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {[
              { label: 'URL da API', campo: 'url', placeholder: PROVEDORES.find(p => p.value === config.provedor)?.url_exemplo },
              { label: 'Instance ID', campo: 'instance_id', placeholder: 'ID da instância' },
              { label: 'Token / API Key', campo: 'token', placeholder: configurado ? '••••••• (deixe em branco para manter)' : 'Seu token' },
              { label: 'Seu número (com DDI)', campo: 'numero_personal', placeholder: '5511999999999' },
            ].map(({ label, campo, placeholder }) => (
              <div key={campo}>
                <label className="text-xs text-gray-500">{label}</label>
                <input
                  type={campo === 'token' ? 'password' : 'text'}
                  value={config[campo]}
                  onChange={(e) => set(campo, e.target.value)}
                  placeholder={placeholder}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              {configurado && (
                <button
                  type="button"
                  onClick={testar}
                  disabled={testando}
                  className="flex-1 py-2.5 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
                >
                  {testando ? 'Enviando...' : 'Testar envio'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Aba Backup */}
      {aba === 'backup' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-700 mb-1">Baixar backup</h2>
            <p className="text-sm text-gray-500 mb-3">Exporta o banco de dados completo para um arquivo .db</p>
            <button
              onClick={baixarBackup}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
            >
              Baixar banco de dados
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-700 mb-1">Restaurar backup</h2>
            <p className="text-sm text-gray-500 mb-3">Substitui o banco atual por um arquivo .db de backup</p>
            <input
              ref={inputArquivo}
              type="file"
              accept=".db"
              onChange={restaurarBackup}
              className="hidden"
            />
            <button
              onClick={() => inputArquivo.current?.click()}
              disabled={restaurando}
              className="w-full py-2.5 border border-orange-300 text-orange-600 rounded-xl text-sm font-medium hover:bg-orange-50 disabled:opacity-50"
            >
              {restaurando ? 'Restaurando...' : 'Selecionar arquivo .db'}
            </button>
          </div>

          {logs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="font-semibold text-gray-700 mb-3">Histórico</h2>
              <div className="flex flex-col gap-2">
                {logs.map(l => (
                  <div key={l.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate flex-1">{l.arquivo}</span>
                    <span className="text-gray-400 ml-2 whitespace-nowrap">
                      {l.restaurado_em ? `Restaurado ${fmtDt(l.restaurado_em)}` : fmtDt(l.criado_em)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aba Automações */}
      {aba === 'scheduler' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-700 mb-3">Fechamento Mensal Automático</h2>
            <p className="text-sm text-gray-500 mb-3">
              Todo dia <strong>1 de cada mês às 08:00</strong> o sistema fecha automaticamente o mês anterior e envia as cobranças via WhatsApp para os alunos.
            </p>
            {scheduler?.proxima_execucao ? (
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
                Próxima execução: <strong>{scheduler.proxima_execucao}</strong>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400">
                Scheduler não disponível
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-700 mb-1">Executar Agora</h2>
            <p className="text-sm text-gray-500 mb-3">
              Fecha o mês anterior manualmente e envia cobranças. Use se o fechamento automático não foi executado.
            </p>
            <button
              onClick={executarAgora}
              disabled={executando}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              {executando ? 'Executando...' : 'Fechar mês anterior agora'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
