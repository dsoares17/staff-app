import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { createJobFromPayload } from '../lib/jobsApi.js'
import JobForm from '../components/JobForm.jsx'

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

export default function AddJob() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  async function handleSubmit(payload) {
    if (!user?.id) return

    setError('')
    setBusy(true)

    try {
      const result = await createJobFromPayload(user.id, payload)
      if (result.recurring) {
        if (result.successCount === 0) {
          throw new Error(
            result.failures.length > 0
              ? result.failures.join(' · ')
              : 'Não foi possível guardar os trabalhos.'
          )
        }
        if (result.failures.length > 0) {
          window.alert(
            `${result.successCount} de ${result.total} trabalhos criados. Falhas: ${result.failures.join(' · ')}`
          )
        }
      }
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o trabalho.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-app">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Adicionar trabalho</h1>
      </header>

      <JobForm
        submitLabel="Guardar trabalho"
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
