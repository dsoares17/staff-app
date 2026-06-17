import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AppShell from './components/AppShell.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Jobs from './pages/Jobs.jsx'
import JobDetail from './pages/JobDetail.jsx'
import AddJob from './pages/AddJob.jsx'
import EditJob from './pages/EditJob.jsx'
import Finances from './pages/Finances.jsx'
import Expenses from './pages/Expenses.jsx'
import AddExpense from './pages/AddExpense.jsx'
import Profile from './pages/Profile.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/new" element={<AddJob />} />
            <Route path="/jobs/:id/edit" element={<EditJob />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/finances" element={<Finances />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<AddExpense />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
