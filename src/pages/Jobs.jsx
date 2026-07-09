import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ListJobCard, PaymentStatusBadge } from '../components/ListJobCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import JobForm from '../components/JobForm.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  applyPaymentPatchToJobs,
  formatDateRange,
  formatTimeRange,
  getJobPayment,
  getJobTotal,
  STATUS_DOT_COLORS,
  toISODate,
  todayISO,
} from '../lib/jobUtils.js'
import { formatEuro, roundMoney } from '../lib/money.js'
import { createJobFromPayload } from '../lib/jobsApi.js'
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

const PROXIMOS_SECTIONS = [
  { id: 'hoje', label: 'Hoje', highlight: true },
  { id: 'proximos7Dias', label: 'Próximos 7 dias' },
]

const LIST_TABS = [
  { id: 'proximos', label: 'Próximos' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'concluidos', label: 'Concluídos' },
]

const JOBS_TAB_STORAGE_KEY = 'erario:jobsActiveTab'

function readStoredJobsTab() {
  try {
    const stored = sessionStorage.getItem(JOBS_TAB_STORAGE_KEY)
    return LIST_TABS.some((tab) => tab.id === stored) ? stored : null
  } catch {
    return null
  }
}

const CALENDAR_MONTH_STORAGE_KEY = 'erario:calendarMonth'
const CALENDAR_DAY_STORAGE_KEY = 'erario:calendarSelectedDay'

function readStoredCalendarMonth() {
  try {
    const stored = sessionStorage.getItem(CALENDAR_MONTH_STORAGE_KEY)
    if (stored && /^\d{4}-\d{2}$/.test(stored)) {
      const [year, month] = stored.split('-').map(Number)
      return new Date(year, month - 1, 1)
    }
  } catch {
    /* ignore */
  }
  return null
}

function readStoredCalendarDay() {
  try {
    const stored = sessionStorage.getItem(CALENDAR_DAY_STORAGE_KEY)
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored
  } catch {
    /* ignore */
  }
  return null
}

function clearStoredCalendarPosition() {
  try {
    sessionStorage.removeItem(CALENDAR_MONTH_STORAGE_KEY)
    sessionStorage.removeItem(CALENDAR_DAY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const JOB_STATUS = {
  pending: { label: 'Pendente', bg: '#FFB800', text: '#000000' },
  confirmed: { label: 'Confirmado', bg: '#00FF87', text: '#000000' },
  completed: { label: 'Concluído', bg: '#444444', text: '#888888' },
  cancelled: { label: 'Cancelado', bg: '#FF4444', text: '#ffffff' },
}

function formatIcsDate(dateISO) {
  return dateISO.replace(/-/g, '')
}

function addDaysToIsoDate(dateISO, days) {
  const date = new Date(`${dateISO}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function formatIcsDateTime(dateISO, timeStr) {
  const raw = String(timeStr).slice(0, 8)
  const [hours = '00', minutes = '00', seconds = '00'] = raw.split(':')
  return `${formatIcsDate(dateISO)}T${hours.padStart(2, '0')}${minutes.padStart(2, '0')}${seconds.padStart(2, '0')}`
}

function formatIcsUtcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldIcsLine(line) {
  const maxLen = 75
  if (line.length <= maxLen) return line

  const parts = [line.slice(0, maxLen)]
  let remaining = line.slice(maxLen)

  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, maxLen - 1)}`)
    remaining = remaining.slice(maxLen - 1)
  }

  return parts.join('\r\n')
}

function buildJobIcsDescription(job) {
  const lines = []

  if (job.role) lines.push(`Função: ${job.role}`)

  const total = getJobTotal(job)
  if (total != null) lines.push(`Valor: ${formatEuro(total)}`)

  if (job.organiser_name) lines.push(`Organizador: ${job.organiser_name}`)

  return lines.join('\n')
}

function buildJobVEvent(job) {
  if (!job.start_date) return []

  const endDate = job.end_date || job.start_date
  const eventLines = [
    'BEGIN:VEVENT',
    foldIcsLine(`UID:${job.id}@erario.app`),
    foldIcsLine(`DTSTAMP:${formatIcsUtcStamp()}`),
    foldIcsLine(`SUMMARY:${escapeIcsText(job.event_name || 'Trabalho')}`),
  ]

  if (job.start_time) {
    eventLines.push(
      foldIcsLine(`DTSTART:${formatIcsDateTime(job.start_date, job.start_time)}`)
    )
  } else {
    eventLines.push(`DTSTART;VALUE=DATE:${formatIcsDate(job.start_date)}`)
  }

  if (job.end_time) {
    eventLines.push(foldIcsLine(`DTEND:${formatIcsDateTime(endDate, job.end_time)}`))
  } else {
    eventLines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDaysToIsoDate(endDate, 1))}`)
  }

  if (job.location) {
    eventLines.push(foldIcsLine(`LOCATION:${escapeIcsText(job.location)}`))
  }

  const description = buildJobIcsDescription(job)
  if (description) {
    eventLines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`))
  }

  eventLines.push('END:VEVENT')
  return eventLines
}

function buildIcsCalendar(jobs) {
  const eventBlocks = jobs.flatMap((job) => buildJobVEvent(job))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Erario//Trabalhos//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventBlocks,
    'END:VCALENDAR',
  ]

  return `${lines.join('\r\n')}\r\n`
}

function downloadIcsFile(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function getJobSpanDays(job) {
  if (!job.start_date) return 0
  const start = new Date(`${job.start_date}T00:00:00`)
  const end = new Date(`${job.end_date || job.start_date}T00:00:00`)
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : 1
}

function isWeekendISO(dayISO) {
  const day = new Date(`${dayISO}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function getJobEarningDays(job) {
  if (!job.start_date) return 0
  const start = new Date(`${job.start_date}T00:00:00`)
  const end = new Date(`${job.end_date || job.start_date}T00:00:00`)
  let count = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay()
    if (job.exclude_weekends && (day === 0 || day === 6)) continue
    count += 1
  }
  return count > 0 ? count : 1
}

function isFlatPaymentJob(job) {
  return job.flat_total != null && Number(job.flat_total) > 0
}

function getJobDayContribution(job, dayISO) {
  if (!jobOverlapsDay(job, dayISO)) return 0
  if (job.exclude_weekends && isWeekendISO(dayISO)) return 0

  if (isFlatPaymentJob(job)) {
    const earningDays = getJobEarningDays(job)
    if (earningDays <= 0) return 0
    return roundMoney(Number(job.flat_total) / earningDays) ?? 0
  }

  if (job.hourly_rate_primary != null && Number(job.hourly_rate_primary) > 0) {
    const payment = getJobPayment(job)
    const expected = Number(payment?.expected_amount)
    if (!Number.isFinite(expected) || expected <= 0) return 0
    const earningDays = getJobEarningDays(job)
    if (earningDays <= 0) return 0
    return roundMoney(expected / earningDays) ?? 0
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

function addDaysToDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function isJobInConcluidos(job, today) {
  const endDate = getJobEndDate(job)
  if (!endDate) {
    return job.start_date ? job.start_date < today : false
  }

  return endDate < today
}

function isJobToday(job, today) {
  if (!job.start_date) return false
  const end = job.end_date || job.start_date
  return job.start_date <= today && today <= end
}

function compareJobsByStartDate(a, b, ascending = true) {
  const aDate = a.start_date || ''
  const bDate = b.start_date || ''
  const dateCmp = aDate.localeCompare(bDate)
  if (dateCmp !== 0) return ascending ? dateCmp : -dateCmp

  const aTime = a.start_time ? String(a.start_time).slice(0, 5) : '99:99'
  const bTime = b.start_time ? String(b.start_time).slice(0, 5) : '99:99'
  return ascending ? aTime.localeCompare(bTime) : bTime.localeCompare(aTime)
}

function getProximosGroups(jobs, today) {
  const groups = { hoje: [], proximos7Dias: [] }
  const weekEnd = addDaysToDate(today, 7)

  for (const job of jobs) {
    if (job.status === 'cancelled') continue
    if (isJobInConcluidos(job, today)) continue
    if (isJobToday(job, today)) {
      groups.hoje.push(job)
      continue
    }

    const start = job.start_date
    if (!start) continue
    if (start > today && start <= weekEnd) {
      groups.proximos7Dias.push(job)
    }
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => compareJobsByStartDate(a, b, true))
  }

  return groups
}

function getConcluidosTabJobs(jobs, today) {
  return jobs.filter(
    (job) => job.status !== 'cancelled' && isJobInConcluidos(job, today)
  )
}

function groupJobsByMonth(jobs, ascending = true) {
  const buckets = new Map()

  for (const job of jobs) {
    const start = job.start_date
    let year
    let month

    if (!start) {
      year = 9999
      month = 11
    } else {
      const date = new Date(`${start}T00:00:00`)
      year = date.getFullYear()
      month = date.getMonth()
    }

    const key = `${year}-${String(month).padStart(2, '0')}`
    if (!buckets.has(key)) {
      buckets.set(key, { year, month, jobs: [] })
    }
    buckets.get(key).jobs.push(job)
  }

  const groups = Array.from(buckets.values())
  groups.sort((a, b) => {
    const cmp = a.year !== b.year ? a.year - b.year : a.month - b.month
    return ascending ? cmp : -cmp
  })

  for (const group of groups) {
    group.jobs.sort((a, b) => compareJobsByStartDate(a, b, ascending))
    group.label = `${MONTH_NAMES[group.month].toUpperCase()} ${group.year}`
  }

  return groups
}

function SkeletonCard() {
  return <div className="mx-4 mb-2 h-14 animate-pulse rounded-xl bg-surface" />
}

function SectionHeader({ label, highlight = false }) {
  return (
    <p
      className={`px-4 pb-3 pt-2 text-xs uppercase tracking-wide ${
        highlight ? 'border-l-2 border-[#FFC700] pl-3 text-white' : 'text-[#888888]'
      }`}
    >
      {label}
    </p>
  )
}

const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function formatTodayHeroDate(job) {
  if (!job.start_date) return 'Hoje'
  const date = new Date(`${job.start_date}T00:00:00`)
  return `Hoje · ${WEEKDAYS_FULL[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function TodayHeroCard({ job, onNavigate }) {
  const total = getJobTotal(job)
  const totalLabel = total != null ? formatEuro(total) : null
  const statusDotColor = STATUS_DOT_COLORS[job.status] ?? STATUS_DOT_COLORS.pending
  const isCancelled = job.status === 'cancelled'

  return (
    <div className="mx-4 mb-2">
      <button
        type="button"
        onClick={() => onNavigate(job.id)}
        className={`block w-full rounded-xl bg-[#141414] p-3.5 text-left transition-opacity active:opacity-80 ${
          isCancelled ? 'opacity-50' : ''
        }`}
        style={{ border: '1px solid rgba(255,199,0,0.35)' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide text-[#FFC700]">
            {formatTodayHeroDate(job)}
          </span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusDotColor }}
          />
        </div>
        <p className="truncate text-[17px] font-medium text-white">{job.event_name}</p>
        <div className="mt-1.5 flex items-center justify-between">
          {job.organiser_name ? (
            <span className="truncate text-sm text-[#888888]">{job.organiser_name}</span>
          ) : (
            <span />
          )}
          {totalLabel ? (
            <span className="text-[17px] font-medium text-[#FFC700]">{totalLabel}</span>
          ) : null}
        </div>
      </button>
    </div>
  )
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

function MonthGroupedJobList({
  monthGroups,
  onJobClick,
  onPaymentUpdated,
  showPaymentBadge = false,
}) {
  return monthGroups.map((group) => (
    <div key={group.label}>
      <SectionHeader label={group.label} />
      {group.jobs.map((job) => (
        <ListJobCard
          key={job.id}
          job={job}
          isTodaySection={false}
          onNavigate={onJobClick}
          onPaymentUpdated={onPaymentUpdated}
          showPaymentBadge={showPaymentBadge}
        />
      ))}
    </div>
  ))
}

function JobsListView({ jobs, onJobClick, onPaymentUpdated, onJobCreated }) {
  const today = todayISO()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const activeTab =
    searchParams.get('tab') ?? location.state?.tab ?? readStoredJobsTab() ?? 'proximos'

  useEffect(() => {
    try {
      sessionStorage.setItem(JOBS_TAB_STORAGE_KEY, activeTab)
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, [activeTab])

  function handleJobClick(jobId) {
    navigate(`/jobs/${jobId}`, { state: { tab: activeTab } })
  }

  function handleTabChange(tabId) {
    if (tabId !== 'calendario') clearStoredCalendarPosition()
    setSearchParams({ tab: tabId }, { replace: true })
  }

  const proximosGroups = useMemo(() => getProximosGroups(jobs, today), [jobs, today])
  const concluidosJobs = useMemo(() => getConcluidosTabJobs(jobs, today), [jobs, today])
  const concluidosByMonth = useMemo(
    () => groupJobsByMonth(concluidosJobs, false),
    [concluidosJobs]
  )

  const hasProximosJobs =
    proximosGroups.hoje.length > 0 || proximosGroups.proximos7Dias.length > 0

  return (
    <div>
      <div className="-mx-4">
        <div className="flex">
          {LIST_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 py-2 text-sm ${
                activeTab === tab.id
                  ? 'border-b-2 border-[#FFC700] font-medium text-[#FFC700]'
                  : 'text-[#888888]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="border-b border-[#222222]" />
      </div>

      <div className="mt-4 -mx-4">
        {activeTab === 'proximos' ? (
          !hasProximosJobs ? (
            <p className="py-8 text-center text-sm text-[#888888]">
              Sem trabalhos nos próximos 7 dias
            </p>
          ) : (
            PROXIMOS_SECTIONS.map((section) => {
              const sectionJobs = proximosGroups[section.id] ?? []

              if (section.id === 'hoje' && sectionJobs.length === 0) return null

              if (section.id === 'proximos7Dias') {
                if (sectionJobs.length === 0) return null
                return (
                  <div key={section.id}>
                    <SectionHeader label={section.label} />
                    {sectionJobs.map((job) => (
                      <ListJobCard
                        key={job.id}
                        job={job}
                        isTodaySection={false}
                        onNavigate={handleJobClick}
                        onPaymentUpdated={onPaymentUpdated}
                      />
                    ))}
                  </div>
                )
              }

              return (
                <div key={section.id}>
                  {sectionJobs.map((job) => (
                    <TodayHeroCard key={job.id} job={job} onNavigate={handleJobClick} />
                  ))}
                </div>
              )
            })
          )
        ) : null}

        {activeTab === 'calendario' ? (
          <JobsCalendar jobs={jobs} onJobClick={handleJobClick} onJobCreated={onJobCreated} />
        ) : null}

        {activeTab === 'concluidos' ? (
          concluidosJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#888888]">Sem trabalhos concluídos</p>
          ) : (
            <MonthGroupedJobList
              monthGroups={concluidosByMonth}
              onJobClick={handleJobClick}
              onPaymentUpdated={onPaymentUpdated}
              showPaymentBadge
            />
          )
        ) : null}
      </div>
    </div>
  )
}

function ExportIcon({ loading }) {
  if (loading) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 animate-spin text-[#888888]"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-[#888888]"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function JobsCalendar({ jobs, onJobClick, onJobCreated }) {
  const today = todayISO()
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const stored = readStoredCalendarMonth()
    if (stored) return stored
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(() => readStoredCalendarDay() ?? today)

  const monthCells = useMemo(
    () => buildMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth]
  )

  const selectedDayJobs = useMemo(
    () => getJobsForDay(jobs, selectedDay),
    [jobs, selectedDay]
  )

  const { user } = useAuth()
  const [isAdding, setIsAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const weekCells = useMemo(() => {
    const base = new Date(`${selectedDay}T00:00:00`)
    const start = new Date(base)
    start.setDate(base.getDate() - base.getDay())
    const cells = []
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      cells.push({ date, isCurrentMonth: true })
    }
    return cells
  }, [selectedDay])

  const cellsToRender = isAdding ? weekCells : monthCells

  async function handleInlineSubmit(payload) {
    if (!user?.id) return
    setSaveError('')
    setSaving(true)
    try {
      const result = await createJobFromPayload(user.id, payload)
      if (result.recurring && result.successCount === 0) {
        throw new Error(
          result.failures.length > 0
            ? result.failures.join(' · ')
            : 'Não foi possível guardar os trabalhos.'
        )
      }
      if (result.recurring && result.failures.length > 0) {
        window.alert(
          `${result.successCount} de ${result.total} trabalhos criados. Falhas: ${result.failures.join(' · ')}`
        )
      }
      setIsAdding(false)
      if (onJobCreated) await onJobCreated()
    } catch (err) {
      setSaveError(err.message || 'Não foi possível guardar o trabalho.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    try {
      const year = calendarMonth.getFullYear()
      const month = String(calendarMonth.getMonth() + 1).padStart(2, '0')
      sessionStorage.setItem(CALENDAR_MONTH_STORAGE_KEY, `${year}-${month}`)
    } catch {
      /* ignore */
    }
  }, [calendarMonth])

  useEffect(() => {
    try {
      sessionStorage.setItem(CALENDAR_DAY_STORAGE_KEY, selectedDay)
    } catch {
      /* ignore */
    }
  }, [selectedDay])

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
        {!isAdding ? (
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
        ) : (
          <span className="h-9 w-9" />
        )}

        <h2 className="text-base font-medium text-fg">
          {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
        </h2>

        {!isAdding ? (
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
        ) : (
          <span className="h-9 w-9" />
        )}
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
        {cellsToRender.map((cell) => {
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
        {isAdding ? (
          <div className="pb-24">
            <div className="mb-2 flex items-center justify-between px-4">
              <h3 className="text-base font-semibold text-fg">Adicionar trabalho</h3>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false)
                  setSaveError('')
                }}
                className="text-sm text-[#888888] underline"
              >
                Cancelar
              </button>
            </div>
            <JobForm
              key={selectedDay}
              initialDate={selectedDay}
              submitLabel="Guardar trabalho"
              busy={saving}
              error={saveError}
              onSubmit={handleInlineSubmit}
            />
          </div>
        ) : selectedDayJobs.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-[#888888]">Sem trabalhos neste dia</p>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="mt-3 text-sm font-medium text-accent underline"
            >
              + Adicionar trabalho
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="text-sm text-accent underline"
              >
                + Adicionar
              </button>
            </div>
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
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? readStoredJobsTab() ?? 'proximos'
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    if (!exportMessage) return undefined

    const timer = window.setTimeout(() => setExportMessage(''), 3000)
    return () => window.clearTimeout(timer)
  }, [exportMessage])

  const fetchJobs = useCallback(async () => {
    if (!user) {
      setJobs([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('staff_app_jobs')
      .select('*, staff_app_payments(id, status, expected_amount, invoice_date)')
      .eq('staff_app_user_id', user.id)
      .order('start_date', { ascending: false })

    if (error) {
      console.error('Erro ao carregar trabalhos:', error.message)
      setJobs([])
    } else {
      const updatedJobs = await autoCompletePastJobs(data ?? [])
      setJobs(updatedJobs)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    fetchJobs()
  }, [authLoading, fetchJobs])

  function handleJobClick(jobId) {
    navigate(`/jobs/${jobId}`)
  }

  function handlePaymentUpdated(paymentId, patch) {
    setJobs((current) => applyPaymentPatchToJobs(current, paymentId, patch))
  }

  async function handleExportCalendar() {
    if (!user?.id || exporting) return

    setExportMessage('')
    setExporting(true)

    try {
      const { data, error } = await supabase
        .from('staff_app_jobs')
        .select('*')
        .eq('staff_app_user_id', user.id)
        .neq('status', 'cancelled')

      if (error) throw error

      const exportJobs = (data ?? []).filter((job) => job.start_date)

      if (exportJobs.length === 0) {
        setExportMessage('Sem trabalhos para exportar')
        return
      }

      const icsContent = buildIcsCalendar(exportJobs)
      downloadIcsFile(icsContent, 'erario-trabalhos.ics')
    } catch (err) {
      console.error('Erro ao exportar calendário:', err.message)
      setExportMessage('Não foi possível exportar o calendário')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative px-4">
      <header className="flex items-center justify-between pb-2 pt-4">
        <h1 className="text-xl font-semibold">Os meus trabalhos</h1>
        <div className="flex items-center gap-1">
          {activeTab === 'calendario' ? (
            <button
              type="button"
              onClick={handleExportCalendar}
              disabled={exporting || authLoading}
              aria-label="Exportar calendário"
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:bg-surface disabled:opacity-60"
            >
              <ExportIcon loading={exporting} />
            </button>
          ) : null}
        </div>
      </header>

      {exportMessage ? (
        <p className="pb-1 text-center text-sm text-[#888888]">{exportMessage}</p>
      ) : null}

      {authLoading || loading ? (
        <div className="mt-4 space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          }
          headline="Os teus trabalhos num só sítio"
          subtext="Regista trabalhos, acompanha datas e gere os teus pagamentos. Podes adicionar manualmente, importar um ficheiro Excel ou CSV, ou tirar uma foto a uma lista."
          actions={
            <>
              <button
                type="button"
                onClick={() => navigate('/jobs/new')}
                className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-[#000000]"
              >
                Adicionar trabalho
              </button>
              <button
                type="button"
                onClick={() => navigate('/jobs/import')}
                className="w-full rounded-xl bg-[#1A1A1A] py-3 text-sm font-medium text-[#888888]"
              >
                Importar ficheiro
              </button>
            </>
          }
        />
      ) : (
        <JobsListView
          jobs={jobs}
          onJobClick={handleJobClick}
          onPaymentUpdated={handlePaymentUpdated}
          onJobCreated={fetchJobs}
        />
      )}
    </div>
  )
}
