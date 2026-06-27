import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [recoveryState, setRecoveryState] = useState('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let resolved = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        resolved = true
        setRecoveryState('ready')
      }
    })

    const timer = window.setTimeout(() => {
      if (!resolved) {
        setRecoveryState('invalid')
      }
    }, 2500)

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!success) return undefined

    const timer = window.setTimeout(() => {
      navigate('/jobs', { replace: true })
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [success, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setValidationError('')

    if (password.length < 8) {
      setValidationError('A palavra-passe deve ter pelo menos 8 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setValidationError('As palavras-passe não coincidem')
      return
    }

    setBusy(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar a palavra-passe.')
    } finally {
      setBusy(false)
    }
  }

  if (recoveryState === 'checking') {
    return (
      <div className="min-h-screen bg-app px-4 pt-4 text-fg">
        <p className="text-sm text-[#888888]">A verificar link…</p>
      </div>
    )
  }

  if (recoveryState === 'invalid') {
    return (
      <div className="min-h-screen bg-app px-4 pb-12 pt-4 text-fg">
        <h1 className="text-xl font-semibold">Nova palavra-passe</h1>
        <p className="mt-4 text-sm text-[#888888]">
          Este link expirou ou já foi utilizado. Pede um novo link.
        </p>
        <Link
          to="/forgot-password"
          className="mt-4 inline-block text-sm font-medium text-accent underline"
        >
          Pedir novo link
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app px-4 pb-12 pt-4 text-fg">
      <h1 className="text-xl font-semibold">Nova palavra-passe</h1>

      {success ? (
        <p className="mt-4 text-sm font-medium text-[#00FF87]">
          ✓ Palavra-passe atualizada com sucesso
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-[#888888]">Introduz a tua nova palavra-passe.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm text-muted">Nova palavra-passe</span>
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

            {validationError ? <div className="ds-alert-danger">{validationError}</div> : null}
            {error ? <div className="ds-alert-danger">{error}</div> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#FFC700] py-3 text-sm font-medium text-[#000000] disabled:opacity-60"
            >
              {busy ? 'A guardar…' : 'Guardar palavra-passe'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
