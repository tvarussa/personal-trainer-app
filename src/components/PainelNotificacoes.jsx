import { useState, useEffect } from 'react'
import api from '../services/api'

function tempoRelativo(dataStr) {
  const diff = (Date.now() - new Date(dataStr).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

export default function PainelNotificacoes({ onFechar }) {
  const [notificacoes, setNotificacoes] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      try {
        const { data } = await api.get('/notificacoes/')
        setNotificacoes(data)
        // Marca todas como lidas ao abrir
        await api.post('/notificacoes/marcar-todas-lidas')
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onFechar}>
      {/* Overlay */}
      <div className="flex-1 bg-black/40" />

      {/* Painel deslizante de baixo */}
      <div
        className="bg-white rounded-t-2xl max-h-[70vh] flex flex-col max-w-md w-full mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-gray-800">Notificações</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {carregando ? (
            <div className="text-center text-gray-400 text-sm py-10">Carregando...</div>
          ) : notificacoes.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              <p className="text-3xl mb-2">🔔</p>
              <p>Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notificacoes.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 flex items-start gap-3 ${!n.lida ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-snug">{n.mensagem}</p>
                    <p className="text-xs text-gray-400 mt-1">{tempoRelativo(n.criada_em)}</p>
                  </div>
                  {!n.lida && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
