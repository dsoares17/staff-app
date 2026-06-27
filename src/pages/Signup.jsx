import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

export default function Signup() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)

  const passwordChecks = useMemo(
    () => ({
      minLength: password.length >= 8,
      hasNumber: /\d/.test(password),
      hasUppercase: /[A-Z]/.test(password),
    }),
    [password]
  )

  const passwordStrengthMet =
    passwordChecks.minLength && passwordChecks.hasNumber && passwordChecks.hasUppercase

  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const showPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword

  const canSubmit = passwordStrengthMet && passwordsMatch && !busy

  const passwordStrengthRules = [
    { key: 'minLength', label: 'Mínimo 8 caracteres' },
    { key: 'hasNumber', label: 'Pelo menos um número' },
    { key: 'hasUppercase', label: 'Pelo menos uma letra maiúscula' },
  ]

  if (!loading && user) {
    return <Navigate to="/jobs" replace />
  }

  useEffect(() => {
    if (!resendSent) return undefined

    const timer = window.setTimeout(() => setResendSent(false), 3000)
    return () => window.clearTimeout(timer)
  }, [resendSent])

  async function handleResendEmail() {
    setError('')
    setResendBusy(true)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })

      if (resendError) throw resendError
      setResendSent(true)
    } catch (err) {
      setError(err.message || 'Não foi possível reenviar o email.')
    } finally {
      setResendBusy(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Não foi possível criar a conta.')

      if (!data.session) {
        setAwaitingConfirmation(true)
        return
      }

      await supabase.auth.setSession(data.session)
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
        {awaitingConfirmation ? (
          <div className="text-center">
            <h1 className="mt-8 text-lg font-semibold text-white">✉️ Verifica o teu email</h1>
            <p className="mt-2 px-4 text-sm text-[#888888]">
              Enviámos um email de confirmação para {email.trim()}. Clica no link para ativares a
              tua conta.
            </p>

            <p className="mt-8 text-sm text-[#888888]">Não recebeste o email?</p>
            <button
              type="button"
              onClick={handleResendEmail}
              disabled={resendBusy || resendSent}
              className={`mt-1 block w-full text-center text-sm disabled:opacity-60 ${
                resendSent
                  ? 'text-[#00FF87] no-underline'
                  : 'text-[#FFC700] underline'
              }`}
            >
              {resendSent ? 'Email reenviado ✓' : 'Reenviar email'}
            </button>

            {error ? <div className="ds-alert-danger mt-4 text-left">{error}</div> : null}

            <Link
              to="/login"
              className="mt-3 block text-center text-sm text-[#888888]"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <>
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
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          {password.length > 0 ? (
            <div className="space-y-1">
              {passwordStrengthRules.map((rule) => {
                const met = passwordChecks[rule.key]

                return (
                  <p
                    key={rule.key}
                    className={`text-xs ${met ? 'text-[#00FF87]' : 'text-[#888888]'}`}
                  >
                    {met ? '✓' : '·'} {rule.label}
                  </p>
                )
              })}
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm text-muted">Confirmar palavra-passe</span>
            <input
              className="mt-1 ds-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>

          {showPasswordMismatch ? (
            <p className="text-xs text-[#FF4444]">As palavras-passe não coincidem</p>
          ) : null}

          {error ? <div className="ds-alert-danger">{error}</div> : null}

          <button type="submit" disabled={!canSubmit} className="w-full ds-btn-primary">
            {busy ? 'A criar conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Já tens conta?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Iniciar sessão
          </Link>
        </p>
          </>
        )}
      </div>
    </div>
  )
}
