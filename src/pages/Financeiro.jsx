import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatEuroWhole, roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const CURRENT_YEAR = new Date().getFullYear()

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(91, 141, 239, 0.2)', text: '#5B8DEF' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

const PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'por_faturar', label: 'Por faturar' },
  { value: 'faturado', label: 'Faturado' },
  { value: 'pago', label: 'Pago' },
  { value: 'em_atraso', label: 'Em atraso' },
]

const EXPENSE_CATEGORIES = [
  { value: 'alimentação', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alojamento', label: 'Alojamento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]

function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isInvoiceOverdue(invoiceDate, today) {
  const invoice = new Date(`${invoiceDate}T00:00:00`)
  const todayDate = new Date(`${today}T00:00:00`)
  const diffDays = Math.floor((todayDate - invoice) / (1000 * 60 * 60 * 24))
  return diffDays > 30
}

function applyPaymentStatusToJobs(jobs, paymentIds, status) {
  const ids = new Set(paymentIds)

  return jobs.map((job) => {
    const payment = getJobPayment(job)
    if (!payment?.id || !ids.has(payment.id)) return job

    if (Array.isArray(job.staff_app_payments)) {
      return {
        ...job,
        staff_app_payments: job.staff_app_payments.map((p) =>
          ids.has(p.id) ? { ...p, status } : p
        ),
      }
    }

    return {
      ...job,
      staff_app_payments: { ...payment, status },
    }
  })
}

async function autoMarkOverduePayments(jobs) {
  const today = todayISO()
  const paymentIds = []

  for (const job of jobs) {
    const payment = getJobPayment(job)
    if (!payment?.id) continue
    if (payment.status !== 'faturado') continue
    if (!payment.invoice_date) continue
    if (!isInvoiceOverdue(payment.invoice_date, today)) continue
    paymentIds.push(payment.id)
  }

  if (paymentIds.length === 0) return jobs

  const { error } = await supabase
    .from('staff_app_payments')
    .update({ status: 'em_atraso' })
    .in('id', paymentIds)

  if (error) {
    console.error('Erro ao atualizar estados dos pagamentos:', error.message)
    return jobs
  }

  return applyPaymentStatusToJobs(jobs, paymentIds, 'em_atraso')
}

function calcJobTotal(job) {
  if (job.flat_total != null && Number(job.flat_total) > 0) {
    return roundMoney(job.flat_total)
  }

  const work = roundMoney((job.work_days ?? 0) * (job.work_rate ?? 0)) ?? 0
  const travel =
    roundMoney((job.transport_travel_days ?? 0) * (job.transport_travel_rate ?? 0)) ?? 0
  const total = roundMoney(work + travel)

  if (total != null && total > 0) return total

  const payment = getJobPayment(job)
  if (payment?.expected_amount != null && Number(payment.expected_amount) > 0) {
    return roundMoney(payment.expected_amount)
  }

  return null
}

function formatMonthYear(startDate) {
  if (!startDate) return null
  const date = new Date(`${startDate}T00:00:00`)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function formatExpenseDate(date) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function toISODate(value) {
  if (!value) return ''
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function getJobName(expense) {
  const job = expense.staff_app_jobs
  if (!job) return 'Sem trabalho'
  if (Array.isArray(job)) return job[0]?.event_name ?? 'Sem trabalho'
  return job.event_name ?? 'Sem trabalho'
}

function formatEuro(amount) {
  return formatEuroWhole(amount)
}

function SummarySkeleton() {
  return <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
}

function RowSkeleton() {
  return <div className="mb-2 h-16 animate-pulse rounded-xl bg-surface" />
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

function ReimbursedPill({ reimbursed, onToggle }) {
  const common = {
    className: 'rounded-full px-2 py-0.5 text-xs font-medium',
    role: 'button',
    tabIndex: 0,
  }

  if (reimbursed) {
    return (
      <span
        {...common}
        onClick={onToggle}
        style={{ backgroundColor: 'rgba(0, 255, 135, 0.2)', color: '#00FF87' }}
      >
        Reembolsado
      </span>
    )
  }

  return (
    <span
      {...common}
      onClick={onToggle}
      style={{ backgroundColor: 'rgba(255, 68, 68, 0.2)', color: '#FF4444' }}
    >
      Pendente
    </span>
  )
}

function PagamentosPanel({ user, authLoading }) {
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
          staff_app_payments(id, status, expected_amount, paid_amount, invoice_date)`
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
        const updatedJobs = await autoMarkOverduePayments(data ?? [])
        setJobs(updatedJobs)
      }

      setLoading(false)
    }

    fetchJobs()

    return () => {
      active = false
    }
  }, [user, selectedYear, authLoading])

  const summary = useMemo(() => {
    let received = 0
    let pending = 0
    let overdue = 0

    for (const job of jobs) {
      const payment = getJobPayment(job)
      if (!payment) continue

      const expected = roundMoney(payment.expected_amount) ?? 0
      const paid = roundMoney(payment.paid_amount) ?? 0

      if (payment.status === 'pago') {
        received += paid > 0 ? paid : expected
      } else if (payment.status === 'por_faturar' || payment.status === 'faturado') {
        pending += expected
      } else if (payment.status === 'em_atraso') {
        overdue += expected
      }
    }

    return {
      received: roundMoney(received) ?? 0,
      pending: roundMoney(pending) ?? 0,
      overdue: roundMoney(overdue) ?? 0,
    }
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
    <>
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
                {formatEuro(summary.received)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">A receber</p>
              <p className="mt-1 text-base font-semibold text-fg">
                {formatEuro(summary.pending)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Em atraso</p>
              <p className="mt-1 text-base font-semibold text-danger">
                {formatEuro(summary.overdue)}
              </p>
            </div>
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-hide px-4">
            {PAYMENT_FILTER_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedFilter(option.value)}
                className={`shrink-0 rounded-full py-1.5 pl-3 text-sm font-medium transition-colors ${
                  index === PAYMENT_FILTER_OPTIONS.length - 1 ? 'pr-4' : 'pr-3'
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
                const amount = calcJobTotal(job) ?? roundMoney(payment?.expected_amount) ?? 0
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
                      <p className="text-sm font-medium text-fg">{formatEuro(amount)}</p>
                      {payment?.status ? <PaymentStatusBadge status={payment.status} /> : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </>
  )
}

function DespesasPanel({ user, authLoading }) {
  const [expenses, setExpenses] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [assignExpense, setAssignExpense] = useState(null)
  const [modalStep, setModalStep] = useState('menu')
  const [sheetVisible, setSheetVisible] = useState(false)
  const [assignSheetVisible, setAssignSheetVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    category: 'alimentação',
    expenseDate: '',
  })

  const fetchExpenses = useCallback(async () => {
    if (!user?.id) return

    setLoading(true)
    const { data, error } = await supabase
      .from('staff_app_expenses')
      .select('*, staff_app_jobs(id, event_name)')
      .eq('staff_app_user_id', user.id)
      .order('expense_date', { ascending: false })

    if (error) {
      console.error('Erro ao carregar despesas:', error.message)
      setExpenses([])
    } else {
      setExpenses(data ?? [])
    }

    setLoading(false)
  }, [user?.id])

  const fetchJobs = useCallback(async () => {
    if (!user?.id) return

    const { data } = await supabase
      .from('staff_app_jobs')
      .select('id, event_name')
      .eq('staff_app_user_id', user.id)
      .order('start_date', { ascending: false })

    setJobs(data ?? [])
  }, [user?.id])

  useEffect(() => {
    if (authLoading) return undefined
    if (!user) {
      setExpenses([])
      setLoading(false)
      return undefined
    }

    fetchExpenses()
    fetchJobs()
  }, [user, authLoading, fetchExpenses, fetchJobs])

  const summary = useMemo(() => {
    let total = 0
    let reimbursed = 0
    let pending = 0

    for (const expense of expenses) {
      const amount = roundMoney(expense.amount) ?? 0
      total += amount
      if (expense.reimbursed) {
        reimbursed += amount
      } else {
        pending += amount
      }
    }

    return {
      total: roundMoney(total) ?? 0,
      reimbursed: roundMoney(reimbursed) ?? 0,
      pending: roundMoney(pending) ?? 0,
    }
  }, [expenses])

  const unassignedExpenses = useMemo(
    () => expenses.filter((expense) => expense.job_id == null),
    [expenses]
  )

  const groupedExpenses = useMemo(() => {
    const groups = new Map()

    for (const expense of expenses) {
      if (expense.job_id == null) continue

      const jobId = expense.job_id
      const jobName = getJobName(expense)

      if (!groups.has(jobId)) {
        groups.set(jobId, { jobId, jobName, items: [] })
      }
      groups.get(jobId).items.push(expense)
    }

    return Array.from(groups.values())
  }, [expenses])

  async function handleToggleReimbursed(expense, e) {
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

  async function handleAssignToJob(jobId) {
    if (!assignExpense) return

    setAssignBusy(true)
    const { error } = await supabase
      .from('staff_app_expenses')
      .update({ job_id: jobId })
      .eq('id', assignExpense.id)

    setAssignBusy(false)

    if (!error) {
      setAssignExpense(null)
      setAssignSheetVisible(false)
      await fetchExpenses()
    }
  }

  useEffect(() => {
    if (!selectedExpense) {
      setSheetVisible(false)
      return
    }

    setModalStep('menu')
    setEditError('')
    setEditBusy(false)

    const id = setTimeout(() => setSheetVisible(true), 0)
    return () => clearTimeout(id)
  }, [selectedExpense])

  useEffect(() => {
    if (!assignExpense) {
      setAssignSheetVisible(false)
      return undefined
    }

    const id = setTimeout(() => setAssignSheetVisible(true), 0)
    return () => clearTimeout(id)
  }, [assignExpense])

  function closeModal() {
    setSheetVisible(false)
    setTimeout(() => {
      setSelectedExpense(null)
      setModalStep('menu')
    }, 150)
  }

  function closeAssignModal() {
    setAssignSheetVisible(false)
    setTimeout(() => setAssignExpense(null), 150)
  }

  function openEditForm(expense) {
    setEditError('')
    setEditBusy(false)

    setEditForm({
      description: expense.description ?? '',
      amount: expense.amount != null ? String(expense.amount) : '',
      category: expense.category ?? 'alimentação',
      expenseDate: toISODate(expense.expense_date),
    })

    setModalStep('edit')
    setSheetVisible(true)
  }

  async function handleSaveEdit() {
    if (!selectedExpense) return

    setEditError('')
    setEditBusy(true)

    try {
      const nextAmount = editForm.amount ? roundMoney(parseFloat(editForm.amount)) : null
      if (!editForm.description.trim()) throw new Error('A descrição é obrigatória.')
      if (nextAmount == null || Number.isNaN(nextAmount)) throw new Error('O valor é obrigatório.')
      if (!editForm.expenseDate) throw new Error('A data é obrigatória.')

      const { error } = await supabase
        .from('staff_app_expenses')
        .update({
          description: editForm.description.trim(),
          amount: nextAmount,
          category: editForm.category,
          expense_date: editForm.expenseDate,
        })
        .eq('id', selectedExpense.id)

      if (error) throw error

      await fetchExpenses()
      closeModal()
    } catch (err) {
      setEditError(err.message || 'Não foi possível guardar a despesa.')
    } finally {
      setEditBusy(false)
    }
  }

  function renderExpenseRow(expense) {
    const dateLabel = formatExpenseDate(expense.expense_date)

    return (
      <div
        key={expense.id}
        onClick={() => setSelectedExpense(expense)}
        role="button"
        tabIndex={0}
        className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl bg-surface px-4 py-3 text-left transition-opacity active:opacity-80"
      >
        <div className="min-w-0 pr-3">
          <p className="truncate text-sm font-medium text-fg">{expense.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {expense.category ? (
              <span className="rounded-full bg-[#222222] px-2 py-0.5 text-xs text-[#888888]">
                {expense.category}
              </span>
            ) : null}
            {dateLabel ? <span className="text-xs text-[#888888]">{dateLabel}</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="text-sm font-medium text-fg">{formatEuro(expense.amount)}</p>
          <ReimbursedPill
            reimbursed={expense.reimbursed}
            onToggle={(e) => handleToggleReimbursed(expense, e)}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      {authLoading || loading ? (
        <div className="px-4">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
          </div>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 px-4">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Total</p>
              <p className="mt-1 text-base font-semibold text-fg">{formatEuro(summary.total)}</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Reembolsado</p>
              <p className="mt-1 text-base font-semibold text-[#00FF87]">
                {formatEuro(summary.reimbursed)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Pendente</p>
              <p className="mt-1 text-base font-semibold text-[#FF4444]">
                {formatEuro(summary.pending)}
              </p>
            </div>
          </div>

          {unassignedExpenses.length > 0 ? (
            <section className="mb-4 px-4">
              <h2 className="mb-2 text-sm font-medium text-[#FFB800]">
                {unassignedExpenses.length} despesa
                {unassignedExpenses.length === 1 ? '' : 's'} por atribuir
              </h2>

              {unassignedExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="mb-2 flex items-center justify-between rounded-xl bg-surface px-4 py-3"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-sm font-medium text-fg">{expense.description}</p>
                    <p className="mt-0.5 text-xs text-[#888888]">{formatEuro(expense.amount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssignExpense(expense)}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-[#000000]"
                  >
                    Atribuir
                  </button>
                </div>
              ))}
            </section>
          ) : null}

          {expenses.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#888888]">
              Ainda não tens despesas registadas.
            </p>
          ) : groupedExpenses.length === 0 ? (
            unassignedExpenses.length === 0 ? null : (
              <p className="px-4 pb-4 text-center text-sm text-[#888888]">
                Atribui as despesas acima a um trabalho.
              </p>
            )
          ) : (
            groupedExpenses.map((group) => (
              <section key={group.jobId}>
                <h2 className="px-4 py-2 text-sm font-medium uppercase tracking-wide text-[#888888]">
                  {group.jobName}
                </h2>
                {group.items.map((expense) => renderExpenseRow(expense))}
              </section>
            ))
          )}
        </>
      )}

      {assignExpense ? (
        <div
          className="fixed inset-0 z-[100] bg-black/70"
          onClick={closeAssignModal}
          aria-modal="true"
          role="dialog"
        >
          <div
            className={`absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4 transition-transform duration-200 ${
              assignSheetVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-semibold text-fg">Atribuir a trabalho</p>
            <p className="mb-4 text-xs text-[#888888]">{assignExpense.description}</p>

            {jobs.length === 0 ? (
              <p className="py-4 text-sm text-[#888888]">Sem trabalhos disponíveis.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    disabled={assignBusy}
                    onClick={() => handleAssignToJob(job.id)}
                    className="w-full rounded-lg bg-[#222222] px-4 py-3 text-left text-sm text-fg disabled:opacity-60"
                  >
                    {job.event_name}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={closeAssignModal}
              className="mt-4 w-full py-2 text-sm font-medium text-[#888888]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {selectedExpense ? (
        <div
          className="fixed inset-0 z-[100] bg-black/70"
          onClick={closeModal}
          aria-modal="true"
          role="dialog"
        >
          <div
            className={`absolute bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] rounded-t-2xl bg-surface p-4 transition-transform duration-200 ${
              sheetVisible ? 'translate-y-0' : 'translate-y-full'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {modalStep === 'menu' ? (
              <>
                <div className="mb-3">
                  <p className="text-sm font-medium text-fg">{selectedExpense.description}</p>
                  <p className="mt-1 text-xs text-[#888888]">
                    {formatEuro(selectedExpense.amount)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openEditForm(selectedExpense)}
                  className="mb-3 w-full rounded-lg bg-[#222222] px-4 py-3 text-sm font-medium text-fg"
                >
                  Editar
                </button>

                <button
                  type="button"
                  onClick={() => setModalStep('confirmDelete')}
                  className="mb-3 w-full rounded-lg border border-danger bg-transparent px-4 py-3 text-sm font-medium text-danger"
                  disabled={deleting}
                >
                  Eliminar
                </button>

                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full py-2 text-sm font-medium text-[#888888]"
                >
                  Cancelar
                </button>
              </>
            ) : null}

            {modalStep === 'edit' ? (
              <>
                <p className="mb-3 text-sm font-semibold text-fg">Editar despesa</p>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Descrição</span>
                    <input
                      className="w-full rounded-lg border border-[#222222] bg-app px-3 py-2 text-sm text-fg outline-none"
                      type="text"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((cur) => ({ ...cur, description: e.target.value }))
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
                        value={editForm.amount}
                        onChange={(e) =>
                          setEditForm((cur) => ({ ...cur, amount: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </label>

                  <div>
                    <span className="mb-1.5 block text-sm text-muted">Categoria</span>
                    <div className="flex flex-wrap gap-2">
                      {EXPENSE_CATEGORIES.map((c) => {
                        const active = editForm.category === c.value
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setEditForm((cur) => ({ ...cur, category: c.value }))}
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
                      value={editForm.expenseDate}
                      onChange={(e) =>
                        setEditForm((cur) => ({ ...cur, expenseDate: e.target.value }))
                      }
                      required
                    />
                  </label>
                </div>

                {editError ? <p className="mt-3 text-sm text-danger">{editError}</p> : null}

                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={editBusy}
                    className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-[#000000] disabled:opacity-60"
                  >
                    {editBusy ? 'A guardar…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full py-2 text-sm font-medium text-[#888888]"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : null}

            {modalStep === 'confirmDelete' ? (
              <>
                <p className="mb-4 text-sm font-medium text-fg">
                  Tens a certeza que queres eliminar esta despesa?
                </p>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setModalStep('menu')}
                    disabled={deleting}
                    className="w-full rounded-lg bg-[#222222] px-4 py-3 text-sm font-medium text-fg disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setDeleting(true)
                      try {
                        const { error } = await supabase
                          .from('staff_app_expenses')
                          .delete()
                          .eq('id', selectedExpense.id)

                        if (error) throw error

                        closeModal()
                        await fetchExpenses()
                      } catch {
                        // Keep modal open on error.
                      } finally {
                        setDeleting(false)
                      }
                    }}
                    disabled={deleting}
                    className="w-full rounded-lg border border-danger bg-transparent px-4 py-3 text-sm font-medium text-danger disabled:opacity-60"
                  >
                    {deleting ? 'A eliminar…' : 'Confirmar'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function Financeiro() {
  const { user, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState('pagamentos')

  return (
    <div className="min-h-full bg-app">
      <header className="px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold">Financeiro</h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 px-4">
        <button
          type="button"
          onClick={() => setActiveTab('pagamentos')}
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'pagamentos'
              ? 'bg-accent text-[#000000]'
              : 'bg-[#222222] text-[#888888]'
          }`}
        >
          Pagamentos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('despesas')}
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'despesas'
              ? 'bg-accent text-[#000000]'
              : 'bg-[#222222] text-[#888888]'
          }`}
        >
          Despesas
        </button>
      </div>

      {activeTab === 'pagamentos' ? (
        <PagamentosPanel user={user} authLoading={authLoading} />
      ) : (
        <DespesasPanel user={user} authLoading={authLoading} />
      )}
    </div>
  )
}
