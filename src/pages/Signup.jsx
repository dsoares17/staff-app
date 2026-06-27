import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

export default function Signup() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!loading && user) {
    return <Navigate to="/jobs" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Não foi possível criar a conta.')
      // Set session explicitly so auth.uid() is available for RLS
      if (data.session) {
        await supabase.auth.setSession(data.session)
      }
      const { error: insertError } = await supabase.from('staff_app_users').insert({
        id: data.user.id,
        full_name: fullName.trim(),
        email: email.trim(),
      })
      if (insertError) throw insertError
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-fg flex items-center justify-center p-4">
      <div className="w-full max-w-md ds-card">
        <h1 className="text-xl font-semibold">Criar conta</h1>
        <p className="mt-1 text-sm text-muted">Regista-te como freelancer de eventos</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm text-muted">Nome completo</span>
            <input
              className="mt-1 ds-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="text-sm text-muted">Email</span>
            <input
              className="mt-1 ds-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-sm text-muted">Palavra-passe</span>
            <input
              className="mt-1 ds-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error ? <div className="ds-alert-danger">{error}</div> : null}

          <button type="submit" disabled={busy} className="w-full ds-btn-primary">
            {busy ? 'A criar conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Já tens conta?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Iniciar sessão
          </Link>
        </p>
      </div>
    </div>
  )
}
