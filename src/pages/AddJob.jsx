import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
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

  async function handleSubmit({ jobData, expectedAmount }) {
    if (!user?.id) return

    setError('')
    setBusy(true)

    try {
      const { data: job, error: jobError } = await supabase
        .from('staff_app_jobs')
        .insert({
          staff_app_user_id: user.id,
          status: 'confirmed',
          ...jobData,
        })
        .select('id')
        .single()

      if (jobError) throw jobError

      const { error: paymentError } = await supabase.from('staff_app_payments').insert({
        staff_app_user_id: user.id,
        job_id: job.id,
        status: 'por_faturar',
        expected_amount: expectedAmount,
      })

      if (paymentError) throw paymentError

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
