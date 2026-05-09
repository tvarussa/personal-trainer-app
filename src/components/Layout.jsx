import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import PainelNotificacoes from './PainelNotificacoes'

const navAluno = [
  { path: '/aluno', label: 'Início', icon: '🏠' },
  { path: '/aluno/agendamentos', label: 'Agenda', icon: '📅' },
  { path: '/aluno/extrato', label: 'Extrato', icon: '💰' },
  { path: '/aluno/meus-dados', label: 'Meus Dados', icon: '👤' },
]

const navPersonal = [
  { path: '/personal', label: 'Início', icon: '🏠' },
  { path: '/personal/calendario', label: 'Calendário', icon: '📅' },
  { path: '/personal/alunos', label: 'Alunos', icon: '👥' },
  { path: '/personal/financeiro', label: 'Financeiro', icon: '💰' },
  { path: '/personal/configuracoes', label: 'Config', icon: '⚙️' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const nav = user?.perfil === 'personal' ? navPersonal : navAluno
  const [naoLidas, setNaoLidas] = useState(0)
  const [painelAberto, setPainelAberto] = useState(false)

  const buscarNaoLidas = useCallback(async () => {
    try {
      const { data } = await api.get('/notificacoes/nao-lidas')
      setNaoLidas(data.total)
    } catch {
      // silencia erros de polling
    }
  }, [])

  useEffect(() => {
    buscarNaoLidas()
    const intervalo = setInterval(buscarNaoLidas, 30000)
    return () => clearInterval(intervalo)
  }, [buscarNaoLidas])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function abrirPainel() {
    setPainelAberto(true)
  }

  function fecharPainel() {
    setPainelAberto(false)
    buscarNaoLidas()
  }

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <span className="font-semibold text-gray-800 text-sm">{user?.nome}</span>

        <div className="flex items-center gap-3">
          {/* Sino de notificações */}
          <button
            onClick={abrirPainel}
            className="relative p-1 text-gray-500 hover:text-blue-600 transition-colors"
          >
            <span className="text-lg leading-none">🔔</span>
            {naoLidas > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                {naoLidas > 9 ? '9+' : naoLidas}
              </span>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 flex justify-around py-2 z-10">
        {nav.map((item) => {
          const active = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors ${
                active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {painelAberto && (
        <PainelNotificacoes onFechar={fecharPainel} />
      )}
    </div>
  )
}
