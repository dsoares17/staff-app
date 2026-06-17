import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

function SkeletonBlock() {
  return <div className="mx-4 mt-4 h-64 animate-pulse rounded-xl bg-surface" />
}

export default function EditJob() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    let active = true

    async function fetchJob() {
      setLoading(true)
      setNotFound(false)

      const { data, error: fetchError } = await supabase
        .from('staff_app_jobs')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (!active) return

      if (fetchError || !data) {
        setJob(null)
        setNotFound(true)
      } else {
        setJob(data)
      }

      setLoading(false)
    }

    fetchJob()

    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit({ jobData, expectedAmount }) {
    if (!user?.id || !id) return

    setError('')
    setBusy(true)

    try {
      const { error: jobError } = await supabase
        .from('staff_app_jobs')
        .update(jobData)
        .eq('id', id)

      if (jobError) throw jobError

      const { error: paymentError } = await supabase
        .from('staff_app_payments')
        .update({ expected_amount: expectedAmount })
        .eq('job_id', id)

      if (paymentError) throw paymentError

      navigate(`/jobs/${id}`, { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível guardar as alterações.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app">
        <header className="flex items-center gap-3 px-4 pb-2 pt-4">
          <button
            type="button"
            onClick={() => navigate(`/jobs/${id}`)}
            aria-label="Cancelar"
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
          >
            <BackIcon />
          </button>
          <h1 className="text-xl font-semibold">Editar trabalho</h1>
        </header>
        <SkeletonBlock />
      </div>
    )
  }

  if (notFound || !job) {
    return (
      <div className="min-h-screen bg-app px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          aria-label="Voltar"
          className="mb-6 flex h-10 w-10 items-center justify-center rounded-full text-fg active:bg-surface"
        >
          <BackIcon />
        </button>
        <p className="text-sm text-muted">Trabalho não encontrado</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-app">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate(`/jobs/${id}`)}
          aria-label="Cancelar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Editar trabalho</h1>
      </header>

      <JobForm
        key={job.id}
        initialJob={job}
        submitLabel="Guardar alterações"
        busy={busy}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
