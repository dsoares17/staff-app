import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatEuro(amount) {
  if (amount == null || Number(amount) <= 0) return '€0'
  const rounded = Math.round(Number(amount))
  const withDots = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `€${withDots}`
}

function formatExpenseDate(date) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
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
      className="rounded-full bg-[#222222] px-2 py-0.5 text-xs font-medium text-[#888888]"
    >
      Pendente
    </button>
  )
}

export default function Expenses() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [deleting, setDeleting] = useState(false)

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
      const amount = Number(expense.amount) || 0
      total += amount
      if (expense.reimbursed) {
        reimbursed += amount
      } else {
        pending += amount
      }
    }

    return { total, reimbursed, pending }
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
              <p className="mt-1 text-base font-semibold text-accent">
                {formatEuro(summary.reimbursed)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-[#888888]">Pendente</p>
              <p className="mt-1 text-base font-semibold text-[#FFB800]">
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
                    <button
                      key={expense.id}
                      type="button"
                      onClick={() => setSelectedExpense(expense)}
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
                    </button>
                  )
                })}
              </section>
            ))
          )}
        </>
      )}

      {selectedExpense ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-xl bg-surface p-5">
            <p className="text-sm font-medium text-fg">{selectedExpense.description}</p>
            <p className="mt-1 text-xs text-[#888888]">{formatEuro(selectedExpense.amount)}</p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedExpense(null)
                  window.alert('Editar despesa — em breve')
                }}
                className="flex-1 rounded-lg bg-[#222222] px-4 py-2.5 text-sm font-medium text-fg"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg border border-danger bg-transparent px-4 py-2.5 text-sm font-medium text-danger disabled:opacity-60"
              >
                {deleting ? 'A eliminar…' : 'Eliminar'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedExpense(null)}
              className="mt-3 w-full py-2 text-sm text-[#888888]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
