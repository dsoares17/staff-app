import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatEuroWhole, roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const CATEGORIES = [
  { value: 'alimentação', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alojamento', label: 'Alojamento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]

function formatEuro(amount) {
  return formatEuroWhole(amount)
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

function SummarySkeleton() {
  return <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
}

function RowSkeleton() {
  return <div className="mx-4 mb-2 h-16 animate-pulse rounded-xl bg-surface" />
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

export default function Expenses() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [modalStep, setModalStep] = useState('menu') // menu | edit | confirmDelete
  const [sheetVisible, setSheetVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  useEffect(() => {
    if (authLoading) return undefined
    if (!user) {
      setExpenses([])
      setLoading(false)
      return undefined
    }

    fetchExpenses()
  }, [user, authLoading, fetchExpenses])

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

  const groupedExpenses = useMemo(() => {
    const groups = new Map()

    for (const expense of expenses) {
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

  async function handleDelete() {
    if (!selectedExpense) return

    setDeleting(true)
    const { error } = await supabase
      .from('staff_app_expenses')
      .delete()
      .eq('id', selectedExpense.id)

    setDeleting(false)

    if (!error) {
      setSelectedExpense(null)
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

  function closeModal() {
    setSheetVisible(false)
    setTimeout(() => {
      setSelectedExpense(null)
      setModalStep('menu')
    }, 150)
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

  return (
    <div className="min-h-full bg-app">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold">Despesas</h1>
        <button
          type="button"
          onClick={() => navigate('/expenses/new')}
          aria-label="Adicionar despesa"
          className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-accent transition-colors active:bg-surface"
        >
          +
        </button>
      </header>

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
              <p className="mt-1 text-base font-semibold text-fg">
                {formatEuro(summary.total)}
              </p>
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

          {expenses.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#888888]">
              Ainda não tens despesas registadas.
            </p>
          ) : (
            groupedExpenses.map((group) => (
              <section key={group.jobId}>
                <h2 className="px-4 py-2 text-sm font-medium uppercase tracking-wide text-[#888888]">
                  {group.jobName}
                </h2>

                {group.items.map((expense) => {
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
                        <p className="truncate text-sm font-medium text-fg">
                          {expense.description}
                        </p>
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
                          {formatEuro(expense.amount)}
                        </p>
                        <ReimbursedPill
                          reimbursed={expense.reimbursed}
                          onToggle={(e) => handleToggleReimbursed(expense, e)}
                        />
                      </div>
                    </div>
                  )
                })}
              </section>
            ))
          )}
        </>
      )}

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
                  <p className="mt-1 text-xs text-[#888888]">{formatEuro(selectedExpense.amount)}</p>
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
                      {CATEGORIES.map((c) => {
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

                {editError ? (
                  <p className="mt-3 text-sm text-danger">{editError}</p>
                ) : null}

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
    </div>
  )
}
