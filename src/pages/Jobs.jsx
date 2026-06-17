import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatEuro, roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const JOB_STATUS = {
  pending: { label: 'Pendente', bg: '#FFB800', text: '#000000' },
  confirmed: { label: 'Confirmado', bg: '#00FF87', text: '#000000' },
  completed: { label: 'Concluído', bg: '#444444', text: '#888888' },
  cancelled: { label: 'Cancelado', bg: '#FF4444', text: '#ffffff' },
}

const STATUS_DOT_COLORS = {
  pending: '#FFB800',
  confirmed: '#00FF87',
  completed: '#444444',
  cancelled: '#FF4444',
}

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(91, 141, 239, 0.2)', text: '#5B8DEF' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayISO() {
  return toISODate(new Date())
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

function formatTimeRange(startTime, endTime) {
  const fmt = (value) => (value ? String(value).slice(0, 5) : null)
  const start = fmt(startTime)
  const end = fmt(endTime)

  if (start && end) return `${start} — ${end}`
  return start || end
}

function calcHourlyExtraTotal(job) {
  const rate = Number(job.hourly_rate)
  const parsedHours = Number(job.hours)
  if (!Number.isFinite(rate) || !Number.isFinite(parsedHours) || rate <= 0 || parsedHours <= 0) {
    return 0
  }
  return roundMoney(rate * parsedHours) ?? 0
}

function getJobTotal(job) {
  const hourlyExtra = calcHourlyExtraTotal(job)

  if (job.flat_total != null && Number(job.flat_total) > 0) {
    return roundMoney(Number(job.flat_total) + hourlyExtra)
  }

  const work = roundMoney((job.work_days ?? 0) * (job.work_rate ?? 0)) ?? 0
  const travel =
    roundMoney((job.transport_travel_days ?? 0) * (job.transport_travel_rate ?? 0)) ?? 0
  const total = roundMoney(work + travel + hourlyExtra)

  return total != null && total > 0 ? total : null
}

function getJobSpanDays(job) {
  if (!job.start_date) return 0
  const start = new Date(`${job.start_date}T00:00:00`)
  const end = new Date(`${job.end_date || job.start_date}T00:00:00`)
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : 1
}

function isFlatPaymentJob(job) {
  return job.flat_total != null && Number(job.flat_total) > 0
}

function getJobDayContribution(job, dayISO) {
  if (!jobOverlapsDay(job, dayISO)) return 0

  if (isFlatPaymentJob(job)) {
    const spanDays = getJobSpanDays(job)
    if (spanDays <= 0) return 0
    return roundMoney(Number(job.flat_total) / spanDays) ?? 0
  }

  const workRate = Number(job.work_rate)
  if (!Number.isFinite(workRate) || workRate <= 0) return 0
  return roundMoney(workRate) ?? 0
}

function formatCompactEuro(amount) {
  const rounded = roundMoney(amount) ?? 0
  if (rounded <= 0) return null

  if (rounded > 1000) {
    const thousands = Math.round((rounded / 1000) * 10) / 10
    const formatted = Number.isInteger(thousands)
      ? String(thousands)
      : String(thousands).replace('.', ',')
    return `€${formatted}k`
  }

  const intValue = Math.round(rounded)
  const withDots = String(intValue).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots}`
}

function getDayEarningsTotal(jobs, dayISO) {
  let sum = 0

  for (const job of jobs) {
    if (job.status === 'cancelled') continue
    sum += getJobDayContribution(job, dayISO)
  }

  return roundMoney(sum) ?? 0
}

function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
}

function jobOverlapsDay(job, dayISO) {
  if (!job.start_date) return false
  const end = job.end_date || job.start_date
  return dayISO >= job.start_date && dayISO <= end
}

function getJobEndDate(job) {
  return job.end_date || job.start_date
}

function isConfirmedJobPast(job, todayISO) {
  if (job.status !== 'confirmed') return false
  const endDate = getJobEndDate(job)
  if (!endDate) return false
  return endDate < todayISO
}

async function autoCompletePastJobs(jobs) {
  const today = todayISO()
  const toComplete = jobs.filter((job) => isConfirmedJobPast(job, today))
  if (toComplete.length === 0) return jobs

  const ids = toComplete.map((job) => job.id)
  const { error } = await supabase
    .from('staff_app_jobs')
    .update({ status: 'completed' })
    .in('id', ids)

  if (error) {
    console.error('Erro ao atualizar estados dos trabalhos:', error.message)
    return jobs
  }

  const completedIds = new Set(ids)
  return jobs.map((job) =>
    completedIds.has(job.id) ? { ...job, status: 'completed' } : job
  )
}

function getJobsForDay(jobs, dayISO) {
  return jobs.filter((job) => jobOverlapsDay(job, dayISO))
}

function getDayDots(jobs, dayISO) {
  const dayJobs = getJobsForDay(jobs, dayISO)
  const dots = dayJobs.slice(0, 3).map(
    (job) => STATUS_DOT_COLORS[job.status] ?? STATUS_DOT_COLORS.pending
  )
  const overflow = dayJobs.length > 3 ? dayJobs.length - 3 : 0

  return { dots, overflow, total: dayJobs.length }
}

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPadding = firstDay.getDay()
  const cells = []

  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startPadding - 1; i >= 0; i -= 1) {
    const day = prevMonthLastDay - i
    cells.push({
      date: new Date(year, month - 1, day),
      isCurrentMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: new Date(year, month, day),
      isCurrentMonth: true,
    })
  }

  const trailing = (7 - (cells.length % 7)) % 7
  for (let day = 1; day <= trailing; day += 1) {
    cells.push({
      date: new Date(year, month + 1, day),
      isCurrentMonth: false,
    })
  }

  return cells
}

function SkeletonCard() {
  return <div className="h-[120px] animate-pulse rounded-xl bg-surface" />
}

function StatusBadge({ status }) {
  const config = JOB_STATUS[status] ?? JOB_STATUS.pending

  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
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

function JobCard({ job, onClick, timeLabel }) {
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
        {timeLabel ? <p className="mt-1 text-xs text-[#888888]">{timeLabel}</p> : null}
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

function ListIcon({ active }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${active ? 'text-accent' : 'text-[#888888]'}`}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function CalendarIcon({ active }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${active ? 'text-accent' : 'text-[#888888]'}`}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function JobsCalendar({ jobs, onJobClick }) {
  const today = todayISO()
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(today)

  const monthCells = useMemo(
    () => buildMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth]
  )

  const selectedDayJobs = useMemo(
    () => getJobsForDay(jobs, selectedDay),
    [jobs, selectedDay]
  )

  function goToPreviousMonth() {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
    )
  }

  function goToNextMonth() {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
    )
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPreviousMonth}
          aria-label="Mês anterior"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#888888] active:bg-surface"
        >
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
        </button>

        <h2 className="text-base font-medium text-fg">
          {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
        </h2>

        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Mês seguinte"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#888888] active:bg-surface"
        >
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
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-xs uppercase tracking-wide text-[#888888]"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((cell) => {
          const dayISO = toISODate(cell.date)
          const isToday = dayISO === today
          const isSelected = dayISO === selectedDay
          const { dots, overflow } = getDayDots(jobs, dayISO)
          const dayEarnings = getDayEarningsTotal(jobs, dayISO)
          const dayEarningsLabel = dayEarnings > 0 ? formatCompactEuro(dayEarnings) : null

          return (
            <button
              key={dayISO}
              type="button"
              onClick={() => setSelectedDay(dayISO)}
              className={`flex min-h-[68px] flex-col items-center justify-start rounded-lg px-0.5 py-1.5 transition-colors ${
                isSelected ? 'bg-[#1A1A1A]' : 'active:bg-surface'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm leading-none ${
                  cell.isCurrentMonth ? 'text-fg' : 'text-[#444444]'
                } ${isToday ? 'border border-accent' : ''}`}
              >
                {cell.date.getDate()}
              </span>

              <div className="mt-0.5 flex min-h-[8px] shrink-0 items-center justify-center gap-0.5">
                {dots.map((color, index) => (
                  <span
                    key={`${dayISO}-${index}`}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
                {overflow > 0 ? (
                  <span className="text-[10px] leading-none text-[#888888]">+{overflow}</span>
                ) : null}
              </div>

              {dayEarningsLabel ? (
                <span className="mt-0.5 max-w-full truncate px-0.5 text-[10px] font-medium leading-tight text-accent">
                  {dayEarningsLabel}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {selectedDayJobs.length === 0 ? (
          <p className="py-4 text-center text-sm text-[#888888]">Sem trabalhos neste dia</p>
        ) : (
          <div className="space-y-3">
            {selectedDayJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                timeLabel={formatTimeRange(job.start_time, job.end_time)}
                onClick={() => onJobClick(job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Jobs() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('list')

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
        const updatedJobs = await autoCompletePastJobs(data ?? [])
        setJobs(updatedJobs)
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label="Vista em lista"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ListIcon active={viewMode === 'list'} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            aria-label="Vista em calendário"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <CalendarIcon active={viewMode === 'calendar'} />
          </button>
          <button
            type="button"
            onClick={handleAddJob}
            aria-label="Adicionar trabalho"
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-accent transition-colors active:bg-surface"
          >
            +
          </button>
        </div>
      </header>

      {authLoading || loading ? (
        <div className="mt-4 space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : viewMode === 'calendar' ? (
        <JobsCalendar jobs={jobs} onJobClick={handleJobClick} />
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
