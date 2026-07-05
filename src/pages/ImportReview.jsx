import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

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

function parseNumber(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calcWorkDaysFromDates(startDate, endDate) {
  if (!startDate) return null
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate || startDate}T00:00:00`)
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : null
}

function calcExpectedAmount(card) {
  if (card.paymentMode === 'hourly') {
    return null
  }

  const parsedRate = parseNumber(card.rate)
  if (parsedRate == null || parsedRate <= 0) return null

  if (card.paymentMode === 'flat') {
    return roundMoney(parsedRate)
  }

  const workDays = calcWorkDaysFromDates(card.startDate, card.endDate || card.startDate)
  if (workDays == null) return roundMoney(parsedRate)
  return roundMoney(workDays * parsedRate)
}

function isMissingRate(rate) {
  const parsed = parseNumber(rate)
  return parsed == null || parsed <= 0
}

function isMissingText(value) {
  return !String(value ?? '').trim()
}

function parsedJobNeedsEnrichment(job) {
  return (
    isMissingRate(job.rate) ||
    isMissingText(job.organiser_name) ||
    isMissingText(job.role) ||
    isMissingText(job.location)
  )
}

async function fetchHistoricalMatch(userId, eventName) {
  const search = String(eventName ?? '').trim()
  if (search.length < 3) return null

  const { data, error } = await supabase
    .from('staff_app_jobs')
    .select('*')
    .eq('staff_app_user_id', userId)
    .ilike('event_name', `%${search}%`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data
}

function enrichParsedJob(job, historical) {
  if (!historical) return job

  const enriched = { ...job }

  if (isMissingRate(job.rate)) {
    if (historical.flat_total != null && Number(historical.flat_total) > 0) {
      enriched.rate = Number(historical.flat_total)
      enriched.payment_mode = 'flat'
    } else if (historical.work_rate != null && Number(historical.work_rate) > 0) {
      enriched.rate = Number(historical.work_rate)
      enriched.payment_mode = 'daily'
    }
  }

  if (isMissingText(job.organiser_name) && historical.organiser_name) {
    enriched.organiser_name = historical.organiser_name
  }
  if (isMissingText(job.role) && historical.role) {
    enriched.role = historical.role
  }
  if (isMissingText(job.location) && historical.location) {
    enriched.location = historical.location
  }

  return enriched
}

async function enrichParsedJobs(jobs, userId) {
  return Promise.all(
    jobs.map(async (job) => {
      if (!parsedJobNeedsEnrichment(job)) return job

      const historical = await fetchHistoricalMatch(userId, job.event_name)
      return enrichParsedJob(job, historical)
    })
  )
}

function parsedJobToCard(job) {
  const paymentStatus = ['pago', 'por_faturar', 'em_atraso'].includes(job.payment_status)
    ? job.payment_status
    : null

  return {
    id: crypto.randomUUID(),
    checked: true,
    eventName: job.event_name ?? '',
    organiserName: job.organiser_name ?? '',
    role: job.role ?? '',
    location: job.location ?? '',
    startDate: job.start_date ?? '',
    endDate: job.end_date ?? '',
    startTime: job.start_time ?? '',
    endTime: job.end_time ?? '',
    paymentMode: job.payment_mode === 'flat' ? 'flat' : job.payment_mode === 'hourly' ? 'hourly' : 'daily',
    rate: job.rate != null && Number(job.rate) > 0 ? String(job.rate) : '',
    hourlyRatePrimary:
      job.hourly_rate_primary != null ? String(job.hourly_rate_primary) : '',
    paymentStatus,
    notes: job.notes ?? '',
  }
}

function cardNeedsWarning(card) {
  return !card.eventName.trim() || !card.startDate
}

function EuroInput({ value, onChange }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        €
      </span>
      <input
        className={`${fieldClass} pl-7`}
        style={fieldStyle}
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

function ReviewCard({ card, onChange }) {
  const showWarning = cardNeedsWarning(card)

  return (
    <div className="mx-4 mb-3 rounded-xl p-4" style={{ backgroundColor: '#141414' }}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={card.checked}
          onChange={(e) => onChange({ checked: e.target.checked })}
          className="mt-2 h-4 w-4 shrink-0 accent-[#FFC700]"
        />
        <input
          className={`${fieldClass} min-w-0 flex-1 font-medium`}
          style={fieldStyle}
          type="text"
          value={card.eventName}
          onChange={(e) => onChange({ eventName: e.target.value })}
          placeholder="Nome do evento"
        />
      </div>

      {showWarning ? (
        <p className="mt-2 text-xs" style={{ color: '#FFB800' }}>
          ⚠ Verifica os dados
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[#888888]">Organizador</span>
          <input
            className={fieldClass}
            style={fieldStyle}
            type="text"
            value={card.organiserName}
            onChange={(e) => onChange({ organiserName: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-[#888888]">Função</span>
          <input
            className={fieldClass}
            style={fieldStyle}
            type="text"
            value={card.role}
            onChange={(e) => onChange({ role: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-[#888888]">Localização</span>
          <input
            className={fieldClass}
            style={fieldStyle}
            type="text"
            value={card.location}
            onChange={(e) => onChange({ location: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Data de início</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="date"
              value={card.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Data de fim</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="date"
              value={card.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              min={card.startDate || undefined}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Hora de início</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="time"
              value={card.startTime}
              onChange={(e) => onChange({ startTime: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Hora de fim</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="time"
              value={card.endTime}
              onChange={(e) => onChange({ endTime: e.target.value })}
            />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-[#888888]">Remuneração</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onChange({ paymentMode: 'daily' })}
              className={`rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
                card.paymentMode === 'daily'
                  ? 'bg-accent text-[#000000]'
                  : 'bg-[#222222] text-[#888888]'
              }`}
            >
              Por dia
            </button>
            <button
              type="button"
              onClick={() => onChange({ paymentMode: 'flat' })}
              className={`rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
                card.paymentMode === 'flat'
                  ? 'bg-accent text-[#000000]'
                  : 'bg-[#222222] text-[#888888]'
              }`}
            >
              Valor total
            </button>
            <button
              type="button"
              onClick={() => onChange({ paymentMode: 'hourly' })}
              className={`rounded-full px-2 py-1.5 text-xs font-medium transition-colors ${
                card.paymentMode === 'hourly'
                  ? 'bg-accent text-[#000000]'
                  : 'bg-[#222222] text-[#888888]'
              }`}
            >
              Por hora
            </button>
          </div>
        </div>

        {card.paymentMode === 'hourly' ? (
          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Valor/hora</span>
            <EuroInput
              value={card.hourlyRatePrimary}
              onChange={(e) => onChange({ hourlyRatePrimary: e.target.value })}
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">
              {card.paymentMode === 'daily' ? 'Valor/dia' : 'Valor total'}
            </span>
            <EuroInput value={card.rate} onChange={(e) => onChange({ rate: e.target.value })} />
          </label>
        )}
      </div>
    </div>
  )
}

function CardSkeleton() {
  return <div className="mx-4 mb-3 h-64 animate-pulse rounded-xl bg-surface" />
}

export default function ImportReview() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const parsedJobs = location.state?.jobs

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTone, setStatusTone] = useState('success')

  const selectedCount = useMemo(() => cards.filter((card) => card.checked).length, [cards])

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    if (!parsedJobs || !Array.isArray(parsedJobs)) {
      navigate('/jobs/import', { replace: true })
    }
  }, [parsedJobs, navigate])

  useEffect(() => {
    if (!parsedJobs || !Array.isArray(parsedJobs) || !user?.id) return undefined

    let active = true

    async function prepareCards() {
      setLoading(true)
      const enriched = await enrichParsedJobs(parsedJobs, user.id)
      if (!active) return
      setCards(enriched.map(parsedJobToCard))
      setLoading(false)
    }

    prepareCards()

    return () => {
      active = false
    }
  }, [parsedJobs, user?.id])

  function updateCard(id, patch) {
    setCards((current) => current.map((card) => (card.id === id ? { ...card, ...patch } : card)))
  }

  function buildJobInsert(card) {
    const parsedRate = parseNumber(card.rate)
    const workDays =
      card.paymentMode === 'daily' && card.startDate
        ? calcWorkDaysFromDates(card.startDate, card.endDate || card.startDate)
        : null

    return {
      staff_app_user_id: user.id,
      event_name: card.eventName.trim(),
      organiser_name: card.organiserName.trim() || null,
      role: card.role.trim() || null,
      location: card.location.trim() || null,
      start_date: card.startDate,
      end_date: card.endDate || null,
      start_time: card.startTime || null,
      end_time: card.endTime || null,
      status: 'confirmed',
      notes: card.notes.trim() || null,
      work_days: card.paymentMode === 'daily' ? workDays : null,
      work_rate: card.paymentMode === 'daily' ? roundMoney(parsedRate) : null,
      flat_total: card.paymentMode === 'flat' ? parsedRate : null,
      hourly_rate_primary:
        card.paymentMode === 'hourly' ? parseNumber(card.hourlyRatePrimary) : null,
      hourly_rate: null,
      hours: null,
      meals_type: 'none',
      transport_type: 'none',
      accommodation_type: 'none',
    }
  }

  async function handleImport() {
    if (!user?.id || importing || selectedCount === 0) return

    setImporting(true)
    setStatusMessage('')

    const selectedCards = cards.filter((card) => card.checked)
    let successCount = 0
    const failures = []

    for (const card of selectedCards) {
      try {
        if (!card.eventName.trim() || !card.startDate) {
          throw new Error('Dados incompletos')
        }

        const jobData = buildJobInsert(card)
        const expectedAmount = calcExpectedAmount(card)

        const { data: job, error: jobError } = await supabase
          .from('staff_app_jobs')
          .insert(jobData)
          .select('id')
          .single()

        if (jobError) throw jobError

        const paymentPayload = {
          staff_app_user_id: user.id,
          job_id: job.id,
          status: card.paymentStatus ?? 'por_faturar',
          expected_amount: expectedAmount,
        }

        if (card.paymentStatus === 'pago') {
          paymentPayload.paid_at = new Date().toISOString()
        }

        const { error: paymentError } = await supabase
          .from('staff_app_payments')
          .insert(paymentPayload)

        if (paymentError) throw paymentError

        successCount += 1
      } catch {
        failures.push(card.eventName.trim() || 'Trabalho sem nome')
      }
    }

    setImporting(false)

    if (successCount > 0) {
      const successText = `${successCount} trabalho${successCount === 1 ? '' : 's'} importado${successCount === 1 ? '' : 's'} com sucesso.`
      setStatusTone('success')
      setStatusMessage(
        failures.length > 0
          ? `${successText} Não foi possível importar: ${failures.join(', ')}.`
          : successText
      )

      window.setTimeout(() => {
        navigate('/jobs', {
          replace: true,
          state: { importSuccess: successText },
        })
      }, 1500)
      return
    }

    setStatusTone('error')
    setStatusMessage(
      failures.length > 0
        ? `Não foi possível importar: ${failures.join(', ')}.`
        : 'Não foi possível importar os trabalhos selecionados.'
    )
  }

  if (!parsedJobs || !Array.isArray(parsedJobs)) {
    return null
  }

  return (
    <div className="min-h-screen bg-app pb-32">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs/import')}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Rever importação</h1>
      </header>

      <p className="px-4 text-sm text-[#888888]">
        Encontrámos {cards.length || parsedJobs.length} trabalho
        {(cards.length || parsedJobs.length) === 1 ? '' : 's'}. Revê e confirma antes de importar.
      </p>

      {statusMessage ? (
        <p
          className={`mx-4 mt-3 text-sm ${statusTone === 'success' ? 'text-[#00FF87]' : 'text-[#FF4444]'}`}
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          cards.map((card) => (
            <ReviewCard
              key={card.id}
              card={card}
              onChange={(patch) => updateCard(card.id, patch)}
            />
          ))
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 mx-auto max-w-[480px] border-t p-4"
        style={{ backgroundColor: '#0A0A0A', borderColor: '#222222' }}
      >
        <button
          type="button"
          disabled={selectedCount === 0 || importing || loading}
          onClick={handleImport}
          className="w-full rounded-lg bg-accent py-3 text-sm font-medium text-[#000000] disabled:opacity-50"
        >
          {importing
            ? 'A importar…'
            : `Importar selecionados (${selectedCount})`}
        </button>
      </div>
    </div>
  )
}
