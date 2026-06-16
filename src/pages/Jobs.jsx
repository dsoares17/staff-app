import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmado', dot: 'bg-accent' },
  pending: { label: 'Pendente', dot: 'bg-amber-400' },
  completed: { label: 'Concluído', dot: 'bg-neutral-500' },
  cancelled: { label: 'Cancelado', dot: 'bg-danger' },
}

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(255, 184, 0, 0.2)', text: '#FFB800' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return null

  const start = new Date(`${startDate}T00:00:00`)
  const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`

  if (!endDate || endDate === startDate) {
    return `${fmt(start)} ${start.getFullYear()}`
  }

  const end = new Date(`${endDate}T00:00:00`)

  if (start.getFullYear() === end.getFullYear()) {
    return `${fmt(start)} — ${fmt(end)} ${end.getFullYear()}`
  }

  return `${fmt(start)} ${start.getFullYear()} — ${fmt(end)} ${end.getFullYear()}`
}

function formatEuro(amount) {
  if (amount == null || amount <= 0) return null

  const fixed = amount.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  if (decPart === '00') return `€${withDots}`
  return `€${withDots},${decPart}`
}

function getJobTotal(job) {
  if (job.flat_total != null && Number(job.flat_total) > 0) {
    return Number(job.flat_total)
  }

  const work = (job.work_days ?? 0) * (job.work_rate ?? 0)
  const travel = (job.travel_days ?? 0) * (job.travel_rate ?? 0)
  const total = work + travel

  return total > 0 ? total : null
}

function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
}

function SkeletonCard() {
  return <div className="h-[120px] animate-pulse rounded-xl bg-surface" />
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </div>
  )
}

function PaymentStatusBadge({ status }) {
  const config = PAYMENT_STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

function JobCard({ job, onClick }) {
  const dateRange = formatDateRange(job.start_date, job.end_date)
  const total = getJobTotal(job)
  const totalLabel = total != null ? formatEuro(total) : null
  const payment = getJobPayment(job)

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full rounded-xl bg-surface p-4 text-left transition-opacity active:opacity-80"
    >
      <div className="absolute right-4 top-4">
        <StatusBadge status={job.status} />
      </div>

      <div className="pr-24">
        <h3 className="text-base font-semibold text-fg">{job.event_name}</h3>
        {job.organiser_name ? (
          <p className="mt-1 text-sm text-muted">{job.organiser_name}</p>
        ) : null}
        {dateRange ? <p className="mt-1 text-sm text-muted">{dateRange}</p> : null}
        {job.role ? (
          <span className="mt-3 inline-block rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent">
            {job.role}
          </span>
        ) : null}
        {payment?.status ? (
          <div className="mt-2">
            <PaymentStatusBadge status={payment.status} />
          </div>
        ) : null}
      </div>

      {totalLabel ? (
        <p className="mt-3 text-right text-sm font-semibold text-accent">{totalLabel}</p>
      ) : null}
    </button>
  )
}

export default function Jobs() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return undefined
    if (!user) {
      setLoading(false)
      setJobs([])
      return undefined
    }

    let active = true

    async function fetchJobs() {
      setLoading(true)

      const { data, error } = await supabase
        .from('staff_app_jobs')
        .select('*, staff_app_payments(status, expected_amount)')
        .eq('staff_app_user_id', user.id)
        .order('start_date', { ascending: false })

      if (!active) return

      if (error) {
        console.error('Erro ao carregar trabalhos:', error.message)
        setJobs([])
      } else {
        setJobs(data ?? [])
      }

      setLoading(false)
    }

    fetchJobs()

    return () => {
      active = false
    }
  }, [user])

  function handleAddJob() {
    navigate('/jobs/new')
  }

  function handleJobClick(jobId) {
    navigate(`/jobs/${jobId}`)
  }

  return (
    <div className="relative px-4">
      <header className="flex items-center justify-between pb-2 pt-4">
        <h1 className="text-xl font-semibold">Os meus trabalhos</h1>
        <button
          type="button"
          onClick={handleAddJob}
          aria-label="Adicionar trabalho"
          className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-accent transition-colors active:bg-surface"
        >
          +
        </button>
      </header>

      {authLoading || loading ? (
        <div className="mt-4 space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-sm text-muted">
            Ainda não tens trabalhos. Adiciona o teu primeiro trabalho.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onClick={() => handleJobClick(job.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
