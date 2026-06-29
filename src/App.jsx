import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AppShell from './components/AppShell.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Jobs from './pages/Jobs.jsx'
import JobDetail from './pages/JobDetail.jsx'
import AddJob from './pages/AddJob.jsx'
import EditJob from './pages/EditJob.jsx'
import ImportJobs from './pages/ImportJobs.jsx'
import ImportReview from './pages/ImportReview.jsx'
import Financeiro from './pages/Financeiro.jsx'
import Organizadores from './pages/Organizadores.jsx'
import OrganiserDetail from './pages/OrganiserDetail.jsx'
import Expenses from './pages/Expenses.jsx'
import AddExpense from './pages/AddExpense.jsx'
import ScanExpense from './pages/ScanExpense.jsx'
import Profile from './pages/Profile.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/import" element={<ImportJobs />} />
            <Route path="/jobs/import/review" element={<ImportReview />} />
            <Route path="/jobs/new" element={<AddJob />} />
            <Route path="/jobs/:id/edit" element={<EditJob />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/organizadores" element={<Organizadores />} />
            <Route path="/organizadores/new" element={<OrganiserDetail />} />
            <Route path="/organizadores/:id" element={<OrganiserDetail />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/scan" element={<ScanExpense />} />
            <Route path="/expenses/new" element={<AddExpense />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
