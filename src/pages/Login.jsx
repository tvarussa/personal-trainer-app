import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setCarregando(true)

    try {
      const params = new URLSearchParams()
      params.append('username', email)
      params.append('password', senha)

      const { data } = await api.post('/auth/token', params)
      login(data.access_token, data.user)

      if (data.user.perfil === 'personal') {
        navigate('/personal')
      } else {
        navigate('/aluno')
      }
    } catch (err) {
      if (!err.response) {
        setErro('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
      } else {
        setErro('Email ou senha incorretos. Verifique seus dados e tente novamente.')
      }
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💪</div>
          <h1 className="text-2xl font-bold text-gray-800">Personal Trainer</h1>
          <p className="text-gray-500 text-sm mt-1">Faça login para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>

          {erro && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <span className="text-red-400 text-base leading-5 shrink-0">!</span>
              <p className="text-sm text-red-600">{erro}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
