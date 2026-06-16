import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const JOB_STATUS = {
  confirmed: { label: 'Confirmado', bg: '#00FF87', text: '#000000' },
  pending: { label: 'Pendente', bg: '#FFB800', text: '#000000' },
  completed: { label: 'Concluído', bg: '#444444', text: '#888888' },
  cancelled: { label: 'Cancelado', bg: '#FF4444', text: '#ffffff' },
}

const PAYMENT_STATUS_OPTIONS = [
  { value: 'por_faturar', label: 'Por faturar' },
  { value: 'faturado', label: 'Faturado' },
  { value: 'pago', label: 'Pago' },
  { value: 'em_atraso', label: 'Em atraso' },
]

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

function formatEuro(amount) {
  if (amount == null || Number(amount) <= 0) return null
  const fixed = Number(amount).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (decPart === '00') return `€${withDots}`
  return `€${withDots},${decPart}`
}

function calcReceivableTotal(job) {
  if (job.flat_total != null && Number(job.flat_total) > 0) {
    return Number(job.flat_total)
  }

  const work = (job.work_days ?? 0) * (job.work_rate ?? 0)
  const travel = (job.transport_travel_days ?? 0) * (job.transport_travel_rate ?? 0)
  const total = work + travel

  return total > 0 ? total : null
}

function hasPayData(job) {
  return (
    (job.flat_total != null && Number(job.flat_total) > 0) ||
    (job.work_days != null && job.work_rate != null) ||
    (job.transport_travel_days != null && job.transport_travel_rate != null)
  )
}

function DetailCard({ children }) {
  return (
    <div className="mb-3 rounded-xl bg-surface p-4">{children}</div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-[#888888]">{label}</p>
      <p className="mt-0.5 text-sm text-fg">{value}</p>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="mb-2 text-sm font-medium text-muted">{children}</h2>
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

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

    const { data: paymentData } = await supabase
      .from('staff_app_payments')
      .select('*')
      .eq('job_id', id)
      .maybeSingle()

    setJob(jobData)
    setPayment(paymentData ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleStatusChange(status) {
    if (!payment?.id || payment.status === status) return

    setUpdatingStatus(true)
    const { error } = await supabase
      .from('staff_app_payments')
      .update({ status })
      .eq('id', payment.id)

    setUpdatingStatus(false)
    if (!error) await fetchData()
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
  const reimbursementTotal =
    job.transport_type === 'reimbursement' &&
    job.transport_km_rate != null &&
    job.transport_kms != null
      ? Number(job.transport_km_rate) * Number(job.transport_kms) +
        (Number(job.transport_tolls) || 0)
      : null
  const mealsTotal =
    job.meals_type === 'allowance' && job.meals_rate != null && job.meals_count != null
      ? Number(job.meals_rate) * Number(job.meals_count)
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
            <StatusPill bg={jobStatus.bg} text={jobStatus.text}>
              {jobStatus.label}
            </StatusPill>
          </div>
        </div>
      </header>

      <div className="space-y-1 px-4">
        <SectionTitle>Detalhes</SectionTitle>
        <DetailCard>
          {job.organiser_name ? (
            <DetailRow label="Organizador" value={job.organiser_name} />
          ) : null}
          {job.role ? <DetailRow label="Função" value={job.role} /> : null}
          {job.location ? <DetailRow label="Localização" value={job.location} /> : null}
          {dateRange ? <DetailRow label="Datas" value={dateRange} /> : null}
        </DetailCard>

        {hasPayData(job) ? (
          <>
            <SectionTitle>Remuneração</SectionTitle>
            <DetailCard>
              {job.flat_total != null && Number(job.flat_total) > 0 ? (
                <DetailRow label="Valor total" value={formatEuro(job.flat_total)} />
              ) : null}

              {job.work_days != null && job.work_rate != null ? (
                <DetailRow
                  label="Dias de trabalho"
                  value={`${formatEuro(job.work_rate)}/dia × ${job.work_days} dias`}
                />
              ) : null}

              {job.transport_travel_days != null && job.transport_travel_rate != null ? (
                <DetailRow
                  label="Dias de viagem"
                  value={`${formatEuro(job.transport_travel_rate)}/dia × ${job.transport_travel_days} dias`}
                />
              ) : null}

              {receivableTotal != null ? (
                <>
                  <div className="my-3 border-t" style={{ borderColor: '#222222' }} />
                  <div>
                    <p className="text-xs text-[#888888]">Total a receber</p>
                    <p className="mt-0.5 text-base font-semibold text-accent">
                      {formatEuro(receivableTotal)}
                    </p>
                  </div>
                </>
              ) : null}
            </DetailCard>
          </>
        ) : null}

        {job.transport_type && job.transport_type !== 'none' ? (
          <>
            <SectionTitle>Transporte</SectionTitle>
            <DetailCard>
              {job.transport_type === 'provided' ? (
                <p className="text-sm text-fg">Fornecido pelo organizador</p>
              ) : null}

              {job.transport_type === 'reimbursement' ? (
                <div className="space-y-3">
                  {job.transport_km_rate != null ? (
                    <DetailRow label="€ por km" value={formatEuro(job.transport_km_rate)} />
                  ) : null}
                  {job.transport_kms != null ? (
                    <DetailRow label="Kms estimados" value={String(job.transport_kms)} />
                  ) : null}
                  {job.transport_tolls != null && Number(job.transport_tolls) > 0 ? (
                    <DetailRow label="Portagens estimadas" value={formatEuro(job.transport_tolls)} />
                  ) : null}
                  {reimbursementTotal != null && reimbursementTotal > 0 ? (
                    <p className="text-xs text-[#888888]">
                      Total reembolso: {formatEuro(reimbursementTotal)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </DetailCard>
          </>
        ) : null}

        {job.meals_type && job.meals_type !== 'none' ? (
          <>
            <SectionTitle>Refeições</SectionTitle>
            <DetailCard>
              {job.meals_type === 'included' ? (
                <p className="text-sm text-fg">Incluído pelo organizador</p>
              ) : null}

              {job.meals_type === 'allowance' ? (
                <div className="space-y-2">
                  {job.meals_rate != null && job.meals_count != null ? (
                    <DetailRow
                      label="Subsídio"
                      value={`${formatEuro(job.meals_rate)} × ${job.meals_count} refeições`}
                    />
                  ) : null}
                  {mealsTotal != null && mealsTotal > 0 ? (
                    <p className="text-xs text-[#888888]">
                      Total subsídio: {formatEuro(mealsTotal)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </DetailCard>
          </>
        ) : null}

        {job.accommodation_type && job.accommodation_type !== 'none' ? (
          <>
            <SectionTitle>Alojamento</SectionTitle>
            <DetailCard>
              <p className="text-sm text-fg">Incluído pelo organizador</p>
            </DetailCard>
          </>
        ) : null}

        <SectionTitle>Pagamento</SectionTitle>
        <DetailCard>
          {!payment ? (
            <p className="mb-4 text-sm text-muted">Sem registo de pagamento</p>
          ) : null}

          {payment?.invoice_reference ? (
            <DetailRow label="Referência da fatura" value={payment.invoice_reference} />
          ) : null}
          {payment?.invoice_date ? (
            <DetailRow label="Data da fatura" value={formatDate(payment.invoice_date)} />
          ) : null}
          {payment?.expected_amount != null ? (
            <DetailRow label="Valor esperado" value={formatEuro(payment.expected_amount)} />
          ) : null}
          {payment?.paid_amount != null ? (
            <DetailRow label="Valor recebido" value={formatEuro(payment.paid_amount)} />
          ) : null}
          {payment?.paid_at ? (
            <DetailRow label="Data de pagamento" value={formatDate(payment.paid_at)} />
          ) : null}
          {payment?.due_date ? (
            <DetailRow label="Data limite" value={formatDate(payment.due_date)} />
          ) : null}

          {payment ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {PAYMENT_STATUS_OPTIONS.map((option) => {
                const active = payment.status === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={updatingStatus}
                    onClick={() => handleStatusChange(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      active
                        ? 'bg-accent text-[#000000]'
                        : 'bg-[#222222] text-[#888888]'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </DetailCard>

        {job.notes?.trim() ? (
          <>
            <SectionTitle>Notas</SectionTitle>
            <DetailCard>
              <p className="whitespace-pre-wrap text-sm text-[#888888]">{job.notes}</p>
            </DetailCard>
          </>
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
