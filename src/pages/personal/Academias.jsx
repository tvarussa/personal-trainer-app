import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'

export default function PersonalAcademias() {
  const navigate = useNavigate()
  const [academias, setAcademias] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/academias/')
      setAcademias(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await api.post('/academias/', { nome: nome.trim(), endereco: endereco.trim() || null })
      setNome('')
      setEndereco('')
      carregar()
    } catch (err) {
      setErro(err.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id) {
    if (!window.confirm('Remover esta academia?')) return
    await api.delete(`/academias/${id}`)
    carregar()
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">‹</button>
        <h1 className="text-xl font-bold text-gray-800">Academias</h1>
      </div>

      {/* Formulário de cadastro */}
      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-700">Nova academia</p>
        <div>
          <label className="text-xs text-gray-500">Nome *</label>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            required
            placeholder="Ex: Academia FitLife"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Endereço (opcional)</label>
          <input
            type="text"
            value={endereco}
            onChange={e => setEndereco(e.target.value)}
            placeholder="Rua, número, bairro"
            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {erro && <p className="text-xs text-red-500">{erro}</p>}
        <button
          type="submit"
          disabled={salvando || !nome.trim()}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Cadastrar'}
        </button>
      </form>

      {/* Lista */}
      {carregando ? (
        <div className="text-center text-gray-400 text-sm py-8">Carregando...</div>
      ) : academias.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8 bg-white rounded-xl border border-gray-100">
          Nenhuma academia cadastrada
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {academias.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{a.nome}</p>
                {a.endereco && <p className="text-xs text-gray-400 mt-0.5">{a.endereco}</p>}
              </div>
              <button
                onClick={() => remover(a.id)}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
