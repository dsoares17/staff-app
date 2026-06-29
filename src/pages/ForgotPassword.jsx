import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

function BackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)

    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })

      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-app text-fg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/login')}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Recuperar palavra-passe</h1>
      </header>

      <div className="px-4 pb-12 pt-2">
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-[#00FF87]">✓ Email enviado</p>
            <p className="text-sm text-[#888888]">
              Se este email estiver registado, receberás um link em breve. Verifica também a pasta
              de spam.
            </p>
            <Link to="/login" className="inline-block text-sm font-medium text-accent underline">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-[#888888]">
              Introduz o teu email e enviamos-te um link para recuperares o acesso.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
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

              {error ? <div className="ds-alert-danger">{error}</div> : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#FFC700] py-3 text-sm font-medium text-[#000000] disabled:opacity-60"
              >
                {busy ? 'A enviar…' : 'Enviar link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
