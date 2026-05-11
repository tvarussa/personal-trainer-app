import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'

import Login from './pages/Login'
import AlunoDashboard from './pages/aluno/Dashboard'
import AlunoAgendamentos from './pages/aluno/Agendamentos'
import AlunoExtrato from './pages/aluno/Extrato'
import AlunoMeusDados from './pages/aluno/MeusDados'
import PersonalDashboard from './pages/personal/Dashboard'
import PersonalCalendario from './pages/personal/Calendario'
import PersonalAlunos from './pages/personal/Alunos'
import PersonalFinanceiro from './pages/personal/Financeiro'
import PersonalConfiguracoes from './pages/personal/Configuracoes'
import PersonalAcademias from './pages/personal/Academias'

function AlunoLayout({ children }) {
  return (
    <PrivateRoute perfil="aluno">
      <Layout>{children}</Layout>
    </PrivateRoute>
  )
}

function PersonalLayout({ children }) {
  return (
    <PrivateRoute perfil="personal">
      <Layout>{children}</Layout>
    </PrivateRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/aluno" element={<AlunoLayout><AlunoDashboard /></AlunoLayout>} />
          <Route path="/aluno/agendamentos" element={<AlunoLayout><AlunoAgendamentos /></AlunoLayout>} />
          <Route path="/aluno/extrato" element={<AlunoLayout><AlunoExtrato /></AlunoLayout>} />
          <Route path="/aluno/meus-dados" element={<AlunoLayout><AlunoMeusDados /></AlunoLayout>} />

          <Route path="/personal" element={<PersonalLayout><PersonalDashboard /></PersonalLayout>} />
          <Route path="/personal/calendario" element={<PersonalLayout><PersonalCalendario /></PersonalLayout>} />
          <Route path="/personal/alunos" element={<PersonalLayout><PersonalAlunos /></PersonalLayout>} />
          <Route path="/personal/financeiro" element={<PersonalLayout><PersonalFinanceiro /></PersonalLayout>} />
          <Route path="/personal/configuracoes" element={<PersonalLayout><PersonalConfiguracoes /></PersonalLayout>} />
          <Route path="/personal/academias" element={<PersonalLayout><PersonalAcademias /></PersonalLayout>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
