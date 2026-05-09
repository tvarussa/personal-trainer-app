import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

export default function AlunoMeusDados() {
  const { user, login } = useAuth()
  const [nome, setNome] = useState(user?.nome || '')
  const [telefone, setTelefone] = useState(user?.telefone || '')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')

    try {
      const payload = { nome, telefone }
      if (novaSenha) {
        payload.senha_atual = senhaAtual
        payload.nova_senha = novaSenha
      }
      const { data } = await api.put('/usuarios/me', payload)
      login(localStorage.getItem('token'), data)
      setMensagem('Dados atualizados com sucesso!')
      setSenhaAtual('')
      setNovaSenha('')
    } catch (err) {
      setMensagem(err.response?.data?.detail || 'Erro ao atualizar dados.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Meus Dados</h1>

      <form onSubmit={handleSalvar} className="flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-600">Informações pessoais</h2>
          <div>
            <label className="text-xs text-gray-500">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Telefone</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-600">Alterar senha</h2>
          <div>
            <label className="text-xs text-gray-500">Senha atual</label>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {mensagem && (
          <p className={`text-sm text-center ${mensagem.includes('sucesso') ? 'text-green-600' : 'text-red-500'}`}>
            {mensagem}
          </p>
        )}

        <button
          type="submit"
          disabled={salvando}
          className="bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
    </div>
  )
}
