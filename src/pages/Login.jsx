import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
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
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) throw signInError
      if (!data.user) throw new Error('Não foi possível iniciar sessão.')

      const { data: profile, error: profileError } = await supabase
        .from('staff_app_users')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError) throw profileError

      if (!profile) {
        const { error: upsertError } = await supabase.from('staff_app_users').upsert(
          {
            id: data.user.id,
            full_name:
              data.user.user_metadata?.full_name || data.user.email.split('@')[0],
            email: data.user.email,
          },
          { onConflict: 'id' }
        )

        if (upsertError) throw upsertError
      }

      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar sessão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-app text-fg flex items-center justify-center p-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="w-full max-w-md ds-card">
        <h1 className="text-xl font-semibold">Iniciar sessão</h1>
        <p className="mt-1 text-sm text-muted">Acede à tua conta de staff</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
              autoComplete="current-password"
            />
          </label>

          <p className="text-center">
            <Link
              to="/forgot-password"
              className="text-sm text-[#888888] underline"
            >
              Esqueceste a palavra-passe?
            </Link>
          </p>

          {error ? <div className="ds-alert-danger">{error}</div> : null}

          <button type="submit" disabled={busy} className="w-full ds-btn-primary">
            {busy ? 'A iniciar sessão…' : 'Iniciar sessão'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Não tens conta?{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  )
}
