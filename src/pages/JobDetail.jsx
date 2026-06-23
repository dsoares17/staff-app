import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatEuro, formatEuroWhole, roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const JOB_STATUS = {
  confirmed: { label: 'Confirmado', bg: '#00FF87', text: '#000000' },
  pending: { label: 'Pendente', bg: '#FFB800', text: '#000000' },
  completed: { label: 'Concluído', bg: '#444444', text: '#888888' },
  cancelled: { label: 'Cancelado', bg: '#FF4444', text: '#ffffff' },
}

const STATUS_OPTIONS = [
  { value: 'pending', ...JOB_STATUS.pending },
  { value: 'confirmed', ...JOB_STATUS.confirmed },
  { value: 'completed', ...JOB_STATUS.completed },
  { value: 'cancelled', ...JOB_STATUS.cancelled },
]

const PAYMENT_STATUS_LABELS = {
  por_faturar: 'Por faturar',
  faturado: 'Faturado',
  pago: 'Pago',
  em_atraso: 'Em atraso',
}

const EXPENSE_CATEGORIES = [
  { value: 'alimentação', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alojamento', label: 'Alojamento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toISODate(value) {
  if (!value) return ''
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatExpenseAmount(amount) {
  return formatEuroWhole(amount)
}

function formatExpenseDate(date) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
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

function formatDate(value) {
  if (!value) return null
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function calcHourlyExtraTotal(job) {
  const rate = Number(job.hourly_rate)
  const parsedHours = Number(job.hours)
  if (!Number.isFinite(rate) || !Number.isFinite(parsedHours) || rate <= 0 || parsedHours <= 0) {
    return 0
  }
  return roundMoney(rate * parsedHours) ?? 0
}

function calcReceivableTotal(job) {
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

function hasPayData(job) {
  return (
    (job.flat_total != null && Number(job.flat_total) > 0) ||
    (job.work_days != null && job.work_rate != null) ||
    (job.transport_travel_days != null && job.transport_travel_rate != null) ||
    (job.hourly_rate != null && job.hours != null)
  )
}

function formatHoursLabel(hours) {
  const value = Number(hours)
  if (!Number.isFinite(value)) return String(hours)
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}

function buildPayBreakdownLines(job) {
  const lines = []

  if (job.flat_total != null && Number(job.flat_total) > 0) {
    lines.push(`${formatEuro(job.flat_total)} valor total`)
  }

  if (job.work_days != null && job.work_rate != null) {
    lines.push(`${formatEuro(job.work_rate)}/dia × ${job.work_days} dias`)
  }

  if (job.transport_travel_days != null && job.transport_travel_rate != null) {
    lines.push(
      `${formatEuro(job.transport_travel_rate)}/dia × ${job.transport_travel_days} dias`
    )
  }

  if (job.hourly_rate != null && job.hours != null) {
    const rate = Number(job.hourly_rate)
    const hours = Number(job.hours)
    if (Number.isFinite(rate) && Number.isFinite(hours) && rate > 0 && hours > 0) {
      lines.push(`${formatEuro(rate)}/hora × ${formatHoursLabel(hours)} horas`)
    }
  }

  return lines
}

function CompactDetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#888888]">{label}</span>
      <span className="text-right text-fg">{value}</span>
    </div>
  )
}

function sanitizeInvoiceFilename(name) {
  return String(name).replace(/[/\\]/g, '_').trim() || 'fatura'
}

function getInvoiceFilename(path) {
  if (!path) return 'Fatura'
  const parts = path.split('/')
  return parts[parts.length - 1] || 'Fatura'
}

function FileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-[#888888]"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function StatusPill({ bg, text, children }) {
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {children}
    </span>
  )
}

function SkeletonBlock({ className = 'h-24' }) {
  return <div className={`animate-pulse rounded-xl bg-surface ${className}`} />
}

function ReimbursedPill({ reimbursed, onToggle }) {
  if (reimbursed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: 'rgba(0, 255, 135, 0.2)', color: '#00FF87' }}
      >
        Reembolsado
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: 'rgba(255, 68, 68, 0.2)', color: '#FF4444' }}
    >
      Pendente
    </button>
  )
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [payment, setPayment] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingJobStatus, setUpdatingJobStatus] = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [statusSheetVisible, setStatusSheetVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [expenseModalStep, setExpenseModalStep] = useState('menu')
  const [expenseSheetVisible, setExpenseSheetVisible] = useState(false)
  const [expenseDeleting, setExpenseDeleting] = useState(false)
  const [expenseEditBusy, setExpenseEditBusy] = useState(false)
  const [expenseEditError, setExpenseEditError] = useState('')
  const [expenseEditForm, setExpenseEditForm] = useState({
    description: '',
    amount: '',
    category: 'alimentação',
    expenseDate: '',
  })
  const [invoiceUploadBusy, setInvoiceUploadBusy] = useState(false)
  const [invoiceBusyMessage, setInvoiceBusyMessage] = useState('A enviar ficheiro…')
  const [invoiceFileMessage, setInvoiceFileMessage] = useState('')
  const invoiceFileInputRef = useRef(null)

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setNotFound(false)

    const { data: jobData, error: jobError } = await supabase
      .from('staff_app_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (jobError || !jobData) {
      setJob(null)
      setPayment(null)
      setNotFound(true)
      setLoading(false)
      return
    }

    const [{ data: paymentData }, { data: expensesData }] = await Promise.all([
      supabase.from('staff_app_payments').select('*').eq('job_id', id).maybeSingle(),
      supabase
        .from('staff_app_expenses')
        .select('*')
        .eq('job_id', id)
        .order('expense_date', { ascending: false }),
    ])

    setJob(jobData)
    setPayment(paymentData ?? null)
    setExpenses(expensesData ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function updatePaymentStatus(patch) {
    if (!payment?.id) return

    setUpdatingStatus(true)
    const { error } = await supabase
      .from('staff_app_payments')
      .update(patch)
      .eq('id', payment.id)

    setUpdatingStatus(false)
    if (!error) await fetchData()
  }

  function handleMarkAsFaturado() {
    updatePaymentStatus({ status: 'faturado', invoice_date: todayISO() })
  }

  function handleMarkAsPago() {
    updatePaymentStatus({
      status: 'pago',
      paid_at: new Date().toISOString(),
      paid_amount: roundMoney(payment?.expected_amount),
    })
  }

  function handleMarkAsAtraso() {
    updatePaymentStatus({ status: 'em_atraso' })
  }

  async function uploadInvoiceFile(file) {
    if (!user?.id || !payment?.id || !id) return

    setInvoiceFileMessage('')
    setInvoiceBusyMessage('A enviar ficheiro…')
    setInvoiceUploadBusy(true)

    try {
      const path = `${user.id}/${id}/${sanitizeInvoiceFilename(file.name)}`

      const { error: uploadError } = await supabase.storage
        .from('staff-invoices')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('staff_app_payments')
        .update({ invoice_file_url: path })
        .eq('id', payment.id)

      if (updateError) throw updateError

      setPayment((current) => (current ? { ...current, invoice_file_url: path } : current))
      setInvoiceFileMessage('Fatura anexada com sucesso.')
    } catch (err) {
      setInvoiceFileMessage(err.message || 'Não foi possível enviar a fatura.')
    } finally {
      setInvoiceUploadBusy(false)
    }
  }

  function handleInvoiceFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) uploadInvoiceFile(file)
  }

  async function handleViewInvoice() {
    if (!payment?.invoice_file_url) return

    setInvoiceFileMessage('')

    try {
      const { data, error } = await supabase.storage
        .from('staff-invoices')
        .createSignedUrl(payment.invoice_file_url, 3600)

      if (error) throw error
      if (!data?.signedUrl) throw new Error('Não foi possível abrir a fatura.')

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setInvoiceFileMessage(err.message || 'Não foi possível abrir a fatura.')
    }
  }

  async function handleRemoveInvoice() {
    if (!payment?.invoice_file_url || !payment?.id) return

    const confirmed = window.confirm('Remover a fatura anexada?')
    if (!confirmed) return

    setInvoiceFileMessage('')
    setInvoiceBusyMessage('A remover ficheiro…')
    setInvoiceUploadBusy(true)

    try {
      const { error: deleteError } = await supabase.storage
        .from('staff-invoices')
        .remove([payment.invoice_file_url])

      if (deleteError) throw deleteError

      const { error: updateError } = await supabase
        .from('staff_app_payments')
        .update({ invoice_file_url: null })
        .eq('id', payment.id)

      if (updateError) throw updateError

      setPayment((current) => (current ? { ...current, invoice_file_url: null } : current))
      setInvoiceFileMessage('Fatura removida.')
    } catch (err) {
      setInvoiceFileMessage(err.message || 'Não foi possível remover a fatura.')
    } finally {
      setInvoiceUploadBusy(false)
    }
  }

  useEffect(() => {
    if (!showStatusPicker) {
      setStatusSheetVisible(false)
      return
    }

    const timer = setTimeout(() => setStatusSheetVisible(true), 0)
    return () => clearTimeout(timer)
  }, [showStatusPicker])

  function closeStatusPicker() {
    setStatusSheetVisible(false)
    setTimeout(() => setShowStatusPicker(false), 150)
  }

  async function handleJobStatusChange(newStatus) {
    if (!job?.id || job.status === newStatus) {
      closeStatusPicker()
      return
    }

    setUpdatingJobStatus(true)
    const { error } = await supabase
      .from('staff_app_jobs')
      .update({ status: newStatus })
      .eq('id', job.id)

    setUpdatingJobStatus(false)

    if (!error) {
      setJob((current) => (current ? { ...current, status: newStatus } : current))
      closeStatusPicker()
    }
  }

  async function handleToggleExpenseReimbursed(expense, e) {
    e.stopPropagation()
    const nextValue = !expense.reimbursed

    setExpenses((current) =>
      current.map((item) =>
        item.id === expense.id ? { ...item, reimbursed: nextValue } : item
      )
    )

    const { error } = await supabase
      .from('staff_app_expenses')
      .update({ reimbursed: nextValue })
      .eq('id', expense.id)

    if (error) {
      setExpenses((current) =>
        current.map((item) =>
          item.id === expense.id ? { ...item, reimbursed: expense.reimbursed } : item
        )
      )
    }
  }

  async function handleMarkAllExpensesReimbursed() {
    if (!id) return

    const pendingIds = expenses
      .filter((expense) => !expense.reimbursed)
      .map((expense) => expense.id)
    if (pendingIds.length === 0) return

    const { error } = await supabase
      .from('staff_app_expenses')
      .update({ reimbursed: true })
      .eq('job_id', id)
      .eq('reimbursed', false)

    if (!error) {
      setExpenses((current) =>
        current.map((expense) =>
          pendingIds.includes(expense.id) ? { ...expense, reimbursed: true } : expense
        )
      )
    }
  }

  useEffect(() => {
    if (!selectedExpense) {
      setExpenseSheetVisible(false)
      return
    }

    setExpenseModalStep('menu')
    setExpenseEditError('')
    setExpenseEditBusy(false)

    const timer = setTimeout(() => setExpenseSheetVisible(true), 0)
    return () => clearTimeout(timer)
  }, [selectedExpense])

  function closeExpenseModal() {
    setExpenseSheetVisible(false)
    setTimeout(() => {
      setSelectedExpense(null)
      setExpenseModalStep('menu')
    }, 150)
  }

  function openExpenseEditForm(expense) {
    setExpenseEditError('')
    setExpenseEditBusy(false)
    setExpenseEditForm({
      description: expense.description ?? '',
      amount: expense.amount != null ? String(expense.amount) : '',
      category: expense.category ?? 'alimentação',
      expenseDate: toISODate(expense.expense_date),
    })
    setExpenseModalStep('edit')
    setExpenseSheetVisible(true)
  }

  async function handleSaveExpenseEdit() {
    if (!selectedExpense) return

    setExpenseEditError('')
    setExpenseEditBusy(true)

    try {
      const nextAmount = expenseEditForm.amount ? roundMoney(parseFloat(expenseEditForm.amount)) : null
      if (!expenseEditForm.description.trim()) throw new Error('A descrição é obrigatória.')
      if (nextAmount == null || Number.isNaN(nextAmount)) throw new Error('O valor é obrigatório.')
      if (!expenseEditForm.expenseDate) throw new Error('A data é obrigatória.')

      const { error } = await supabase
        .from('staff_app_expenses')
        .update({
          description: expenseEditForm.description.trim(),
          amount: nextAmount,
          category: expenseEditForm.category,
          expense_date: expenseEditForm.expenseDate,
        })
        .eq('id', selectedExpense.id)

      if (error) throw error

      await fetchData()
      closeExpenseModal()
    } catch (err) {
      setExpenseEditError(err.message || 'Não foi possível guardar a despesa.')
    } finally {
      setExpenseEditBusy(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('staff_app_jobs').delete().eq('id', id)
    setDeleting(false)

    if (!error) {
      navigate('/jobs', { replace: true })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app px-4 pb-24 pt-4">
        <SkeletonBlock className="h-10 mb-6" />
        <SkeletonBlock className="h-32 mb-3" />
        <SkeletonBlock className="h-32 mb-3" />
        <SkeletonBlock className="h-24" />
      </div>
    )
  }

  if (notFound || !job) {
    return (
      <div className="flex min-h-screen flex-col bg-app px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          className="mb-6 flex h-10 w-10 items-center justify-center rounded-full text-fg active:bg-surface"
          aria-label="Voltar"
        >
          <BackIcon />
        </button>
        <p className="text-sm text-muted">Trabalho não encontrado</p>
      </div>
    )
  }

  const jobStatus = JOB_STATUS[job.status] ?? JOB_STATUS.pending
  const dateRange = formatDateRange(job.start_date, job.end_date)
  const receivableTotal = calcReceivableTotal(job)
  const payBreakdownLines = buildPayBreakdownLines(job)
  const metaParts = [job.organiser_name, job.role].filter(Boolean)
  const showMoneyZone = hasPayData(job) || payment
  const pendingExpensesCount = expenses.filter((expense) => !expense.reimbursed).length
  const showLogisticsZone =
    (job.transport_type && job.transport_type !== 'none') ||
    (job.meals_type && job.meals_type !== 'none') ||
    (job.accommodation_type && job.accommodation_type !== 'none')
  const hasPaymentDetails =
    payment &&
    (payment.invoice_reference ||
      payment.invoice_date ||
      payment.paid_amount != null ||
      payment.paid_at ||
      payment.due_date)
  const reimbursementTotal =
    job.transport_type === 'reimbursement' &&
    job.transport_km_rate != null &&
    job.transport_kms != null
      ? roundMoney(
          Number(job.transport_km_rate) * Number(job.transport_kms) +
            (Number(job.transport_tolls) || 0)
        )
      : null
  const mealsTotal =
    job.meals_type === 'allowance' && job.meals_rate != null && job.meals_count != null
      ? roundMoney(Number(job.meals_rate) * Number(job.meals_count))
      : null

  return (
    <div className="min-h-screen bg-app pb-24">
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          aria-label="Voltar"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg active:bg-surface"
        >
          <BackIcon />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-semibold leading-tight">{job.event_name}</h1>
            <button
              type="button"
              onClick={() => setShowStatusPicker(true)}
              disabled={updatingJobStatus}
              className="shrink-0 disabled:opacity-60"
              aria-label="Alterar estado do trabalho"
            >
              <StatusPill bg={jobStatus.bg} text={jobStatus.text}>
                {jobStatus.label}
              </StatusPill>
            </button>
          </div>
        </div>
      </header>

      {/* Zone 1 — Header info */}
      <div className="border-b border-[#1A1A1A] px-4 pb-4 pt-2">
        {job.series_id ? (
          <p className="mb-1 text-xs text-[#888888]">🔁 Parte de uma série</p>
        ) : null}
        {metaParts.length > 0 ? (
          <p className="text-sm text-[#888888]">{metaParts.join(' · ')}</p>
        ) : null}
        {job.location ? (
          <p className={`text-sm text-[#888888]${metaParts.length > 0 ? ' mt-1' : ''}`}>
            {job.location}
          </p>
        ) : null}
        {dateRange ? (
          <p
            className={`text-sm font-medium text-fg${
              metaParts.length > 0 || job.location ? ' mt-1' : ''
            }`}
          >
            {dateRange}
          </p>
        ) : null}
      </div>

      <div className="px-4 pt-4">
        {/* Zone 2 — Money */}
        {showMoneyZone ? (
          <div
            className="mb-4 rounded-xl p-5"
            style={{ backgroundColor: '#1A1A1A', border: '1px solid #FFC70030' }}
          >
            {hasPayData(job) ? (
              <>
                <p className="text-xs uppercase tracking-wide text-[#888888]">Total a receber</p>
                {receivableTotal != null ? (
                  <p className="mt-1 text-3xl font-bold text-accent">
                    {formatEuro(receivableTotal)}
                  </p>
                ) : null}

                {payBreakdownLines.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {payBreakdownLines.map((line) => (
                      <p key={line} className="text-xs text-[#888888]">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {payment ? (
              <>
                {hasPayData(job) ? (
                  <div className="my-4 border-t" style={{ borderColor: '#222222' }} />
                ) : null}

                <p className="text-sm text-[#888888]">
                  Estado: {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                </p>

                {hasPaymentDetails ? (
                  <div className="mt-4 space-y-1.5 text-xs">
                    {payment.invoice_reference ? (
                      <CompactDetailRow
                        label="Referência da fatura"
                        value={payment.invoice_reference}
                      />
                    ) : null}
                    {payment.invoice_date ? (
                      <CompactDetailRow
                        label="Data da fatura"
                        value={formatDate(payment.invoice_date)}
                      />
                    ) : null}
                    {payment.paid_amount != null ? (
                      <CompactDetailRow
                        label="Valor recebido"
                        value={formatEuro(payment.paid_amount)}
                      />
                    ) : null}
                    {payment.paid_at ? (
                      <CompactDetailRow
                        label="Data de pagamento"
                        value={formatDate(payment.paid_at)}
                      />
                    ) : null}
                    {payment.due_date ? (
                      <CompactDetailRow label="Data limite" value={formatDate(payment.due_date)} />
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4">
                  <input
                    ref={invoiceFileInputRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={handleInvoiceFileChange}
                  />

                  {invoiceUploadBusy ? (
                    <p className="text-xs text-[#888888]">{invoiceBusyMessage}</p>
                  ) : payment.invoice_file_url ? (
                    <div className="flex items-center gap-2 text-xs">
                      <FileIcon />
                      <span className="min-w-0 flex-1 truncate text-fg">
                        {getInvoiceFilename(payment.invoice_file_url)}
                      </span>
                      <button
                        type="button"
                        onClick={handleViewInvoice}
                        className="shrink-0 text-accent underline"
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveInvoice}
                        className="shrink-0 text-[#888888] underline"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => invoiceFileInputRef.current?.click()}
                      className="text-sm text-accent underline"
                    >
                      + Anexar fatura
                    </button>
                  )}

                  {invoiceFileMessage ? (
                    <p className="mt-2 text-xs text-[#888888]">{invoiceFileMessage}</p>
                  ) : null}
                </div>

                {payment.status === 'por_faturar' ? (
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={handleMarkAsFaturado}
                    className="mt-3 w-full rounded-lg bg-accent py-3 text-sm font-medium text-[#000000] disabled:opacity-60"
                  >
                    Marcar como faturado
                  </button>
                ) : null}

                {payment.status === 'faturado' || payment.status === 'em_atraso' ? (
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={handleMarkAsPago}
                    className="mt-3 w-full rounded-lg bg-accent py-3 text-sm font-medium text-[#000000] disabled:opacity-60"
                  >
                    Marcar como pago
                  </button>
                ) : null}

                {payment.status === 'pago' ? (
                  <p className="mt-3 text-center text-sm text-[#00FF87]">✓ Pagamento recebido</p>
                ) : null}

                {payment.status === 'por_faturar' || payment.status === 'faturado' ? (
                  <button
                    type="button"
                    disabled={updatingStatus}
                    onClick={handleMarkAsAtraso}
                    className="mx-auto mt-3 block text-xs text-[#888888] underline disabled:opacity-60"
                  >
                    Marcar como em atraso
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">Sem registo de pagamento</p>
            )}
          </div>
        ) : null}

        {/* Zone 3 — Logistics */}
        {showLogisticsZone ? (
          <div className="mb-4 rounded-xl bg-surface p-4">
            <p className="mb-3 text-xs uppercase tracking-wide text-[#888888]">Logística</p>

            <div className="space-y-2.5">
              {job.transport_type && job.transport_type !== 'none' ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <TransportIcon />
                  <p>
                    <span className="text-[#888888]">Transporte: </span>
                    <span className="text-fg">
                      {job.transport_type === 'provided'
                        ? 'Fornecido pelo organizador'
                        : reimbursementTotal != null && reimbursementTotal > 0
                          ? `Reembolso — ${formatEuro(reimbursementTotal)} estimado`
                          : 'Reembolso'}
                    </span>
                  </p>
                </div>
              ) : null}

              {job.meals_type && job.meals_type !== 'none' ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <MealsIcon />
                  <p>
                    <span className="text-[#888888]">Refeições: </span>
                    <span className="text-fg">
                      {job.meals_type === 'included'
                        ? 'Incluído pelo organizador'
                        : job.meals_rate != null && job.meals_count != null
                          ? `Subsídio — ${formatEuro(job.meals_rate)} × ${job.meals_count}${
                              mealsTotal != null && mealsTotal > 0
                                ? ` (${formatEuro(mealsTotal)} total)`
                                : ''
                            }`
                          : 'Subsídio'}
                    </span>
                  </p>
                </div>
              ) : null}

              {job.accommodation_type && job.accommodation_type !== 'none' ? (
                <div className="flex items-start gap-2.5 text-sm">
                  <AccommodationIcon />
                  <p>
                    <span className="text-[#888888]">Alojamento: </span>
                    <span className="text-fg">Incluído pelo organizador</span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Zone 4 — Despesas */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-fg">Despesas</h2>
            <button
              type="button"
              onClick={() => navigate(`/expenses/new?jobId=${job.id}`)}
              className="text-sm text-accent"
            >
              + Adicionar
            </button>
          </div>

          {expenses.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#888888]">
              Sem despesas registadas para este trabalho.
            </p>
          ) : (
            expenses.map((expense) => {
              const dateLabel = formatExpenseDate(expense.expense_date)

              return (
                <div
                  key={expense.id}
                  onClick={() => setSelectedExpense(expense)}
                  role="button"
                  tabIndex={0}
                  className="mb-2 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-left transition-opacity active:opacity-80"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-medium text-fg">{expense.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {expense.category ? (
                        <span className="rounded-full bg-[#222222] px-2 py-0.5 text-xs text-[#888888]">
                          {expense.category}
                        </span>
                      ) : null}
                      {dateLabel ? (
                        <span className="text-xs text-[#888888]">{dateLabel}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-sm font-medium text-fg">
                      {formatExpenseAmount(expense.amount)}
                    </p>
                    <ReimbursedPill
                      reimbursed={expense.reimbursed}
                      onToggle={(e) => handleToggleExpenseReimbursed(expense, e)}
                    />
                  </div>
                </div>
              )
            })
          )}

          {pendingExpensesCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllExpensesReimbursed}
              className="mt-2 w-full rounded-lg border border-accent bg-[#FFC70020] py-2.5 text-sm font-medium text-accent"
            >
              Marcar todas como reembolsadas ({pendingExpensesCount})
            </button>
          ) : null}
        </div>

        {/* Zone 5 — Notas */}
        {job.notes?.trim() ? (
          <div className="mb-4">
            <h2 className="mb-2 text-sm font-medium text-muted">Notas</h2>
            <div className="rounded-xl bg-surface p-4">
              <p className="whitespace-pre-wrap text-sm text-[#888888]">{job.notes}</p>
            </div>
          </div>
        ) : null}
      </div>

      <footer
        className="fixed bottom-0 left-0 right-0 border-t bg-app p-4"
        style={{ borderColor: '#222222' }}
      >
        <div className="mx-auto flex max-w-[480px] gap-3">
          <button
            type="button"
            onClick={() => navigate(`/jobs/${id}/edit`)}
            className="flex-1 rounded-lg bg-[#222222] px-4 py-3 text-sm font-medium text-fg"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 rounded-lg border border-danger bg-transparent px-4 py-3 text-sm font-medium text-danger"
          >
            Eliminar
          </button>
        </div>
      </footer>

      {showStatusPicker ? (
        <div
          className="fixed inset-0 z-[100] bg-black/70"
          onClick={closeStatusPicker}
          aria-modal="true"
          role="dialog"
        >
          <div
            className={`absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] rounded-t-2xl bg-surface p-4 transition-transform duration-200 ${
              statusSheetVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-fg">Estado do trabalho</p>

            <div className="space-y-2">
              {STATUS_OPTIONS.map((option) => {
                const active = job.status === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={updatingJobStatus}
                    onClick={() => handleJobStatusChange(option.value)}
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-60 ${
                      active ? 'bg-[#222222]' : 'bg-transparent'
                    }`}
                  >
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: option.bg, color: option.text }}
                    >
                      {option.label}
                    </span>
                    {active ? <span className="text-xs text-accent">Atual</span> : null}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={closeStatusPicker}
              className="mt-4 w-full py-2 text-sm font-medium text-[#888888]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5">
            <p className="text-sm text-fg">
              Tens a certeza que queres eliminar este trabalho?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg bg-[#222222] px-4 py-2.5 text-sm font-medium text-fg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg border border-danger bg-transparent px-4 py-2.5 text-sm font-medium text-danger disabled:opacity-60"
              >
                {deleting ? 'A eliminar…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedExpense ? (
        <div
          className="fixed inset-0 z-[100] bg-black/70"
          onClick={closeExpenseModal}
          aria-modal="true"
          role="dialog"
        >
          <div
            className={`absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] rounded-t-2xl bg-surface p-4 transition-transform duration-200 ${
              expenseSheetVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {expenseModalStep === 'menu' ? (
              <>
                <div className="mb-3">
                  <p className="text-sm font-medium text-fg">{selectedExpense.description}</p>
                  <p className="mt-1 text-xs text-[#888888]">
                    {formatExpenseAmount(selectedExpense.amount)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openExpenseEditForm(selectedExpense)}
                  className="mb-3 w-full rounded-lg bg-[#222222] px-4 py-3 text-sm font-medium text-fg"
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => setExpenseModalStep('confirmDelete')}
                  className="mb-3 w-full rounded-lg border border-danger bg-transparent px-4 py-3 text-sm font-medium text-danger"
                  disabled={expenseDeleting}
                >
                  Eliminar
                </button>

                <button
                  type="button"
                  onClick={closeExpenseModal}
                  className="w-full py-2 text-sm font-medium text-[#888888]"
                >
                  Cancelar
                </button>
              </>
            ) : null}

            {expenseModalStep === 'edit' ? (
              <>
                <p className="mb-3 text-sm font-semibold text-fg">Editar despesa</p>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Descrição</span>
                    <input
                      className="w-full rounded-lg border border-[#222222] bg-app px-3 py-2 text-sm text-fg outline-none"
                      type="text"
                      value={expenseEditForm.description}
                      onChange={(e) =>
                        setExpenseEditForm((cur) => ({ ...cur, description: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Valor</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                        €
                      </span>
                      <input
                        className="w-full rounded-lg border border-[#222222] bg-app px-3 py-2 pl-7 text-sm text-fg outline-none"
                        type="number"
                        min="0"
                        step="0.01"
                        value={expenseEditForm.amount}
                        onChange={(e) =>
                          setExpenseEditForm((cur) => ({ ...cur, amount: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </label>

                  <div>
                    <span className="mb-1.5 block text-sm text-muted">Categoria</span>
                    <div className="flex flex-wrap gap-2">
                      {EXPENSE_CATEGORIES.map((c) => {
                        const active = expenseEditForm.category === c.value
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() =>
                              setExpenseEditForm((cur) => ({ ...cur, category: c.value }))
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-accent text-[#000000]'
                                : 'bg-[#222222] text-[#888888]'
                            }`}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Data</span>
                    <input
                      className="w-full rounded-lg border border-[#222222] bg-app px-3 py-2 text-sm text-fg outline-none"
                      type="date"
                      value={expenseEditForm.expenseDate}
                      onChange={(e) =>
                        setExpenseEditForm((cur) => ({ ...cur, expenseDate: e.target.value }))
                      }
                      required
                    />
                  </label>
                </div>

                {expenseEditError ? (
                  <p className="mt-3 text-sm text-danger">{expenseEditError}</p>
                ) : null}

                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={handleSaveExpenseEdit}
                    disabled={expenseEditBusy}
                    className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-[#000000] disabled:opacity-60"
                  >
                    {expenseEditBusy ? 'A guardar…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={closeExpenseModal}
                    className="w-full py-2 text-sm font-medium text-[#888888]"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : null}

            {expenseModalStep === 'confirmDelete' ? (
              <>
                <p className="mb-4 text-sm font-medium text-fg">
                  Tens a certeza que queres eliminar esta despesa?
                </p>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setExpenseModalStep('menu')}
                    disabled={expenseDeleting}
                    className="w-full rounded-lg bg-[#222222] px-4 py-3 text-sm font-medium text-fg disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setExpenseDeleting(true)
                      try {
                        const { error } = await supabase
                          .from('staff_app_expenses')
                          .delete()
                          .eq('id', selectedExpense.id)

                        if (error) throw error

                        closeExpenseModal()
                        await fetchData()
                      } catch {
                        // Keep modal open on error.
                      } finally {
                        setExpenseDeleting(false)
                      }
                    }}
                    disabled={expenseDeleting}
                    className="w-full rounded-lg border border-danger bg-transparent px-4 py-3 text-sm font-medium text-danger disabled:opacity-60"
                  >
                    {expenseDeleting ? 'A eliminar…' : 'Confirmar'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

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

function TransportIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-[#888888]"
    >
      <path d="M7 17h10" />
      <path d="M5 11h14l-1.5-5H6.5L5 11z" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  )
}

function MealsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-[#888888]"
    >
      <path d="M4 11V5" />
      <path d="M7 11V3" />
      <path d="M10 11V5" />
      <path d="M4 11c0 2 1.5 3 3 3" />
      <path d="M14 3v8" />
      <path d="M18 3v8" />
      <path d="M14 11h4" />
      <path d="M14 15h4" />
    </svg>
  )
}

function AccommodationIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0 text-[#888888]"
    >
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  )
}
