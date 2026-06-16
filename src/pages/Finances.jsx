import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(91, 141, 239, 0.2)', text: '#5B8DEF' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'por_faturar', label: 'Por faturar' },
  { value: 'faturado', label: 'Faturado' },
  { value: 'pago', label: 'Pago' },
  { value: 'em_atraso', label: 'Em atraso' },
]

const CURRENT_YEAR = new Date().getFullYear()

function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
}

function calcJobTotal(job) {
  if (job.flat_total != null && Number(job.flat_total) > 0) {
    return Number(job.flat_total)
  }

  const work = (job.work_days ?? 0) * (job.work_rate ?? 0)
  const travel = (job.transport_travel_days ?? 0) * (job.transport_travel_rate ?? 0)
  const total = work + travel

  if (total > 0) return total

  const payment = getJobPayment(job)
  if (payment?.expected_amount != null && Number(payment.expected_amount) > 0) {
    return Number(payment.expected_amount)
  }

  return null
}

function formatEuroSummary(amount) {
  if (amount == null || Number(amount) <= 0) return '€0'
  const rounded = Math.round(Number(amount))
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots}`
}

function formatEuroRow(amount) {
  if (amount == null || Number(amount) <= 0) return '€0'
  const rounded = Math.round(Number(amount))
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots}`
}

function formatMonthYear(startDate) {
  if (!startDate) return null
  const date = new Date(`${startDate}T00:00:00`)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
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

function SummarySkeleton() {
  return <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
}

function RowSkeleton() {
  return <div className="mb-2 h-16 animate-pulse rounded-xl bg-surface" />
}

export default function Finances() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return undefined
    if (!user) {
      setJobs([])
      setLoading(false)
      return undefined
    }

    let active = true

    async function fetchJobs() {
      setLoading(true)

      const { data, error } = await supabase
        .from('staff_app_jobs')
        .select(
          `id, event_name, start_date, work_days, work_rate, flat_total,
          transport_travel_days, transport_travel_rate,
          staff_app_payments(status, expected_amount, paid_amount)`
        )
        .eq('staff_app_user_id', user.id)
        .gte('start_date', `${selectedYear}-01-01`)
        .lte('start_date', `${selectedYear}-12-31`)
        .order('start_date', { ascending: false })

      if (!active) return

      if (error) {
        console.error('Erro ao carregar finanças:', error.message)
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
  }, [user, selectedYear])

  const summary = useMemo(() => {
    let received = 0
    let pending = 0
    let overdue = 0

    for (const job of jobs) {
      const payment = getJobPayment(job)
      if (!payment) continue

      const expected = Number(payment.expected_amount) || 0
      const paid = Number(payment.paid_amount) || 0

      if (payment.status === 'pago') {
        received += paid > 0 ? paid : expected
      } else if (payment.status === 'por_faturar' || payment.status === 'faturado') {
        pending += expected
      } else if (payment.status === 'em_atraso') {
        overdue += expected
      }
    }

    return { received, pending, overdue }
  }, [jobs])

  const filteredJobs = useMemo(() => {
    if (selectedFilter === 'all') return jobs

    return jobs.filter((job) => {
      const payment = getJobPayment(job)
      return payment?.status === selectedFilter
    })
  }, [jobs, selectedFilter])

  function handlePrevYear() {
    setSelectedYear((year) => year - 1)
  }

  function handleNextYear() {
    setSelectedYear((year) => (year < CURRENT_YEAR ? year + 1 : year))
  }

  return (
    <div className="min-h-full bg-app">
      <header className="px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold">Finanças</h1>
      </header>

      <div className="mb-4 flex items-center justify-center gap-6 px-4">
        <button
          type="button"
          onClick={handlePrevYear}
          aria-label="Ano anterior"
          className="flex h-10 w-10 items-center justify-center text-[#888888]"
        >
          <ChevronIcon direction="left" />
        </button>
        <span className="text-base font-semibold text-fg">{selectedYear}</span>
        <button
          type="button"
          onClick={handleNextYear}
          disabled={selectedYear >= CURRENT_YEAR}
          aria-label="Ano seguinte"
          className="flex h-10 w-10 items-center justify-center text-[#888888] disabled:opacity-30"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      {authLoading || loading ? (
        <div className="px-4">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto">
            <div className="h-8 w-16 animate-pulse rounded-full bg-surface" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-surface" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-surface" />
          </div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 px-4">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Recebido</p>
              <p className="mt-1 text-base font-semibold text-[#00FF87]">
                {formatEuroSummary(summary.received)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">A receber</p>
              <p className="mt-1 text-base font-semibold text-fg">
                {formatEuroSummary(summary.pending)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Em atraso</p>
              <p className="mt-1 text-base font-semibold text-danger">
                {formatEuroSummary(summary.overdue)}
              </p>
            </div>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-hide px-4">
            {FILTER_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedFilter(option.value)}
                className={`shrink-0 rounded-full py-1.5 pl-3 text-sm font-medium transition-colors ${
                  index === FILTER_OPTIONS.length - 1 ? 'pr-4' : 'pr-3'
                } ${
                  selectedFilter === option.value
                    ? 'bg-accent text-[#000000]'
                    : 'bg-[#222222] text-[#888888]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="px-4 pb-4">
            {filteredJobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#888888]">
                Sem trabalhos para este período
              </p>
            ) : (
              filteredJobs.map((job) => {
                const payment = getJobPayment(job)
                const amount = calcJobTotal(job) ?? payment?.expected_amount ?? 0
                const dateLabel = formatMonthYear(job.start_date)

                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-left transition-opacity active:opacity-80"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate text-sm font-medium text-fg">{job.event_name}</p>
                      {dateLabel ? (
                        <p className="mt-0.5 text-xs text-[#888888]">{dateLabel}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <p className="text-sm font-medium text-fg">{formatEuroRow(amount)}</p>
                      {payment?.status ? (
                        <PaymentStatusBadge status={payment.status} />
                      ) : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ChevronIcon({ direction }) {
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
      {direction === 'left' ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  )
}
