import { roundMoney } from './money.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const WEEK_DAY_ABBREV = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

export const STATUS_DOT_COLORS = {
  pending: '#FFB800',
  confirmed: '#00FF87',
  completed: '#444444',
  cancelled: '#FF4444',
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return toISODate(new Date())
}

export function formatDateRange(startDate, endDate) {
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

export function formatTimeRange(startTime, endTime) {
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

export function getJobTotal(job) {
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

export function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
}

export function getWeekdayAbbrev(dateISO) {
  if (!dateISO) return '—'
  const date = new Date(`${dateISO}T00:00:00`)
  return WEEK_DAY_ABBREV[date.getDay()]
}

export function applyPaymentPatchToJobs(jobs, paymentId, patch) {
  return jobs.map((job) => {
    const payment = getJobPayment(job)
    if (!payment?.id || payment.id !== paymentId) return job

    const updatedPayment = { ...payment, ...patch }

    if (Array.isArray(job.staff_app_payments)) {
      return {
        ...job,
        staff_app_payments: job.staff_app_payments.map((p) =>
          p.id === paymentId ? updatedPayment : p
        ),
      }
    }

    return { ...job, staff_app_payments: updatedPayment }
  })
}
