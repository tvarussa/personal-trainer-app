import { useState } from 'react'

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function diasDoMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1)
  const ultimo = new Date(ano, mes + 1, 0)
  const dias = []

  // Padding do início (domingo = 0)
  for (let i = 0; i < primeiro.getDay(); i++) {
    dias.push(null)
  }
  for (let d = 1; d <= ultimo.getDate(); d++) {
    dias.push(d)
  }
  return dias
}

export function dataStr(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export default function CalendarioBase({ marcadores = {}, contadorAulas = {}, modeAluno = false, onDiaSelecionado, diaSelecionado }) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())

  const dias = diasDoMes(ano, mes)

  function navMes(delta) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 0) { novoMes = 11; novoAno-- }
    if (novoMes > 11) { novoMes = 0; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
    // Limpa seleção ao trocar de mês para evitar adicionar slot no mês errado
    onDiaSelecionado?.(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={() => navMes(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-600">
          ‹
        </button>
        <span className="font-semibold text-gray-800 text-sm">
          {MESES[mes]} {ano}
        </span>
        <button onClick={() => navMes(1)} className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-600">
          ›
        </button>
      </div>

      {/* Dias da semana */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="py-2 text-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {dias.map((dia, i) => {
          if (!dia) return <div key={i} />

          const chave = dataStr(ano, mes, dia)
          const marcador = marcadores[chave] || {}
          const ehHoje = chave === dataStr(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
          const selecionado = diaSelecionado === chave
          const aulaCount = contadorAulas[chave] || 0

          return (
            <button
              key={i}
              onClick={() => onDiaSelecionado?.(chave)}
              className={`relative flex flex-col items-center justify-center aspect-square rounded-xl text-sm transition-colors
                ${selecionado ? 'bg-blue-600 text-white' : ehHoje ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'}
              `}
            >
              {dia}
              {(aulaCount > 0 || marcador.minha_aula || marcador.disponivel || marcador.bloqueado) && (
                <div className="absolute bottom-0.5 flex items-center gap-0.5">
                  {aulaCount > 0 && (
                    <span className={`text-[9px] leading-none font-bold ${selecionado ? 'text-blue-100' : 'text-blue-500'}`}>
                      {aulaCount}
                    </span>
                  )}
                  {marcador.minha_aula && (
                    <span className={`w-1 h-1 rounded-full ${selecionado ? 'bg-white' : 'bg-indigo-500'}`} />
                  )}
                  {marcador.disponivel && (
                    <span className={`w-1 h-1 rounded-full ${selecionado ? 'bg-white' : 'bg-green-500'}`} />
                  )}
                  {marcador.bloqueado && (
                    <span className={`w-1 h-1 rounded-full ${selecionado ? 'bg-white' : 'bg-red-400'}`} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legenda */}
      <div className="flex gap-4 px-4 pb-3 justify-center text-xs text-gray-400">
        {modeAluno ? (
          <>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/>Minha aula</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Disponível</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Indisponível</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="text-[10px] font-bold text-blue-500">3</span>Aulas</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Disponível</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Bloqueado</span>
          </>
        )}
      </div>
    </div>
  )
}
