import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(91, 141, 239, 0.2)', text: '#5B8DEF' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

const inputClass =
  'w-full rounded-lg border bg-app px-3 py-2 text-sm text-fg outline-none focus:border-accent'
const inputStyle = { borderColor: '#222222' }

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

function organiserToForm(organiser) {
  return {
    name: organiser?.name ?? '',
    nif: organiser?.nif ?? '',
    email: organiser?.email ?? '',
    phone: organiser?.phone ?? '',
    notes: organiser?.notes ?? '',
  }
}

function formatMonthYear(startDate) {
  if (!startDate) return null
  const date = new Date(`${startDate}T00:00:00`)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function getJobPayment(job) {
  const payments = job.staff_app_payments
  if (!payments) return null
  if (Array.isArray(payments)) return payments[0] ?? null
  return payments
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

function ViewRow({ label, value }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs text-[#888888]">{label}</p>
      <p className="mt-0.5 text-sm text-fg">{value || '—'}</p>
    </div>
  )
}

export default function OrganiserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const isNew = location.pathname === '/organizadores/new'

  const [organiser, setOrganiser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(organiserToForm(null))

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    if (authLoading) return undefined
    if (isNew || !user?.id || !id) return undefined

    let active = true

    async function fetchOrganiser() {
      setLoading(true)
      setNotFound(false)

      const [{ data: organiserData, error: organiserError }, { data: jobsData, error: jobsError }] =
        await Promise.all([
          supabase
            .from('staff_app_organisers')
            .select('*')
            .eq('id', id)
            .eq('staff_app_user_id', user.id)
            .maybeSingle(),
          supabase
            .from('staff_app_jobs')
            .select('id, event_name, start_date, staff_app_payments(status)')
            .eq('organiser_id', id)
            .eq('staff_app_user_id', user.id)
            .order('start_date', { ascending: false }),
        ])

      if (!active) return

      if (organiserError || !organiserData) {
        setOrganiser(null)
        setJobs([])
        setNotFound(true)
      } else {
        setOrganiser(organiserData)
        setForm(organiserToForm(organiserData))
        setJobs(jobsError ? [] : jobsData ?? [])
      }

      setLoading(false)
    }

    fetchOrganiser()

    return () => {
      active = false
    }
  }, [authLoading, id, isNew, user?.id])

  function startEditing() {
    setForm(organiserToForm(organiser))
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setForm(organiserToForm(organiser))
    setError('')
    setEditing(false)
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave() {
    if (!user?.id) return

    if (!form.name.trim()) {
      setError('O nome é obrigatório.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      nif: form.nif.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (isNew) {
        const { error: insertError } = await supabase.from('staff_app_organisers').insert({
          staff_app_user_id: user.id,
          ...payload,
        })

        if (insertError) throw insertError
      } else {
        const { error: updateError } = await supabase
          .from('staff_app_organisers')
          .update(payload)
          .eq('id', id)
          .eq('staff_app_user_id', user.id)

        if (updateError) throw updateError
      }

      navigate('/organizadores', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o organizador.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (isNew || !id) return

    const confirmed = window.confirm('Eliminar este organizador? Esta ação não pode ser desfeita.')
    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('staff_app_organisers')
      .delete()
      .eq('id', id)
      .eq('staff_app_user_id', user?.id)

    setDeleting(false)

    if (deleteError) {
      setError(deleteError.message || 'Não foi possível eliminar o organizador.')
      return
    }

    navigate('/organizadores', { replace: true })
  }

  if (!isNew && (authLoading || loading)) {
    return (
      <div className="min-h-screen bg-app px-4 pt-4">
        <div className="mb-6 h-8 w-40 animate-pulse rounded bg-surface" />
        <div className="mb-3 h-24 animate-pulse rounded-xl bg-surface" />
        <div className="h-16 animate-pulse rounded-xl bg-surface" />
      </div>
    )
  }

  if (!isNew && notFound) {
    return (
      <div className="min-h-screen bg-app px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate('/organizadores')}
          aria-label="Voltar"
          className="mb-6 flex h-10 w-10 items-center justify-center rounded-full text-fg active:bg-surface"
        >
          <BackIcon />
        </button>
        <p className="text-sm text-[#888888]">Organizador não encontrado.</p>
      </div>
    )
  }

  const headerTitle = isNew ? 'Novo organizador' : organiser?.name ?? 'Organizador'

  return (
    <div className="min-h-screen bg-app pb-8">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/organizadores')}
          aria-label="Voltar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg active:bg-surface"
        >
          <BackIcon />
        </button>

        <div className="min-w-0 flex-1">
          {editing && !isNew ? (
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={cancelEditing} className="text-sm text-[#888888]">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-sm font-semibold text-accent disabled:opacity-60"
              >
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-xl font-semibold">{headerTitle}</h1>
              {isNew ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="shrink-0 text-sm font-semibold text-accent disabled:opacity-60"
                >
                  {saving ? 'A guardar…' : 'Guardar'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className="shrink-0 text-sm font-semibold text-accent"
                >
                  Editar
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {error ? <p className="px-4 pb-2 text-sm text-danger">{error}</p> : null}

      <div className="px-4">
        <div className="mb-4 rounded-xl bg-surface px-4 py-3">
          {editing || isNew ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Nome</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">NIF</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="text"
                  inputMode="numeric"
                  value={form.nif}
                  onChange={(e) => updateForm('nif', e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Email</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Telefone</span>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[#888888]">Notas</span>
                <textarea
                  className={`${inputClass} min-h-[100px] resize-y`}
                  style={inputStyle}
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                />
              </label>

              {!isNew ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="mt-2 text-sm text-[#FF4444] disabled:opacity-60"
                >
                  {deleting ? 'A eliminar…' : 'Eliminar organizador'}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <ViewRow label="Nome" value={organiser?.name} />
              <ViewRow label="NIF" value={organiser?.nif} />
              <ViewRow label="Email" value={organiser?.email} />
              <ViewRow label="Telefone" value={organiser?.phone} />
              <ViewRow label="Notas" value={organiser?.notes} />
            </>
          )}
        </div>

        {!isNew && !editing ? (
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-[#888888]">Trabalhos</h2>

            {jobs.length === 0 ? (
              <p className="py-4 text-sm text-[#888888]">Sem trabalhos associados.</p>
            ) : (
              jobs.map((job) => {
                const payment = getJobPayment(job)
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

                    {payment?.status ? (
                      <PaymentStatusBadge status={payment.status} />
                    ) : null}
                  </button>
                )
              })
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
