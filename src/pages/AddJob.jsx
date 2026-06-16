import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-3 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

function EuroInput({ value, onChange, min = 0, step = '0.01' }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        €
      </span>
      <input
        className={`${fieldClass} pl-7`}
        style={fieldStyle}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

function parseNumber(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseInteger(value) {
  if (value === '' || value == null) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

const pillActive = 'bg-accent text-[#000000]'
const pillInactive = 'bg-[#222222] text-[#888888]'

function PillToggle({ options, value, onChange, columns = 2 }) {
  return (
    <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
            value === option.value ? pillActive : pillInactive
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function CollapsibleSection({ title, expanded, onToggle, children }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg bg-[#1A1A1A] p-3 text-sm font-medium text-fg"
      >
        <span>{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  )
}

export default function AddJob() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [eventName, setEventName] = useState('')
  const [organiserName, setOrganiserName] = useState('')
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMode, setPaymentMode] = useState('daily')
  const [workDays, setWorkDays] = useState('')
  const [workRate, setWorkRate] = useState('')
  const [flatTotal, setFlatTotal] = useState('')
  const [mealsExpanded, setMealsExpanded] = useState(false)
  const [mealsType, setMealsType] = useState('none')
  const [mealsRate, setMealsRate] = useState('')
  const [mealsCount, setMealsCount] = useState('')
  const [transportExpanded, setTransportExpanded] = useState(false)
  const [transportType, setTransportType] = useState('none')
  const [transportKmRate, setTransportKmRate] = useState('')
  const [transportKms, setTransportKms] = useState('')
  const [transportTolls, setTransportTolls] = useState('')
  const [transportTravelDays, setTransportTravelDays] = useState('')
  const [transportTravelRate, setTransportTravelRate] = useState('')
  const [accommodationExpanded, setAccommodationExpanded] = useState(false)
  const [accommodationType, setAccommodationType] = useState('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  const estimatedTotal = useMemo(() => {
    const days = parseInteger(workDays) ?? 0
    const rate = parseNumber(workRate) ?? 0
    return days * rate
  }, [workDays, workRate])

  const showEstimatedTotal = estimatedTotal > 0

  const mealsAllowanceTotal = useMemo(() => {
    const rate = parseNumber(mealsRate) ?? 0
    const count = parseInteger(mealsCount) ?? 0
    return rate * count
  }, [mealsRate, mealsCount])

  const showMealsAllowanceTotal =
    mealsType === 'allowance' && mealsAllowanceTotal > 0

  const transportReimbursementTotal = useMemo(() => {
    const kmRate = parseNumber(transportKmRate)
    const kms = parseNumber(transportKms)
    const tolls = parseNumber(transportTolls) ?? 0
    if (kmRate == null || kms == null) return null
    const total = kmRate * kms + tolls
    return total > 0 ? total : null
  }, [transportKmRate, transportKms, transportTolls])

  const transportTravelTotal = useMemo(() => {
    const days = parseInteger(transportTravelDays)
    const rate = parseNumber(transportTravelRate)
    if (days == null || rate == null) return null
    const total = days * rate
    return total > 0 ? total : null
  }, [transportTravelDays, transportTravelRate])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!user?.id) return

    setError('')
    setBusy(true)

    const parsedWorkDays = parseInteger(workDays)
    const parsedWorkRate = parseNumber(workRate)
    const parsedFlatTotal = parseNumber(flatTotal)
    const parsedMealsRate = parseNumber(mealsRate)
    const parsedMealsCount = parseInteger(mealsCount)
    const parsedTransportKmRate = parseNumber(transportKmRate)
    const parsedTransportKms = parseNumber(transportKms)
    const parsedTransportTolls = parseNumber(transportTolls)
    const parsedTransportTravelDays = parseInteger(transportTravelDays)
    const parsedTransportTravelRate = parseNumber(transportTravelRate)

    const expectedAmount =
      paymentMode === 'daily'
        ? (parsedWorkDays ?? 0) * (parsedWorkRate ?? 0) +
          (parsedTransportTravelDays ?? 0) * (parsedTransportTravelRate ?? 0)
        : parsedFlatTotal

    const normalizedExpectedAmount =
      expectedAmount != null && expectedAmount > 0 ? expectedAmount : null

    try {
      const { data: job, error: jobError } = await supabase
        .from('staff_app_jobs')
        .insert({
          staff_app_user_id: user.id,
          event_name: eventName.trim(),
          organiser_name: organiserName.trim() || null,
          role: role.trim() || null,
          location: location.trim() || null,
          start_date: startDate,
          end_date: endDate || null,
          notes: notes.trim() || null,
          status: 'confirmed',
          work_days: paymentMode === 'daily' ? parsedWorkDays : null,
          work_rate: paymentMode === 'daily' ? parsedWorkRate : null,
          flat_total: paymentMode === 'flat' ? parsedFlatTotal : null,
          meals_type: mealsType,
          meals_rate: mealsType === 'allowance' ? parsedMealsRate : null,
          meals_count: mealsType === 'allowance' ? parsedMealsCount : null,
          transport_type: transportType,
          transport_travel_days: parsedTransportTravelDays,
          transport_travel_rate: parsedTransportTravelRate,
          transport_km_rate: transportType === 'reimbursement' ? parsedTransportKmRate : null,
          transport_kms: transportType === 'reimbursement' ? parsedTransportKms : null,
          transport_tolls: transportType === 'reimbursement' ? parsedTransportTolls : null,
          accommodation_type: accommodationType,
        })
        .select('id')
        .single()

      if (jobError) throw jobError

      const { error: paymentError } = await supabase.from('staff_app_payments').insert({
        staff_app_user_id: user.id,
        job_id: job.id,
        status: 'por_faturar',
        expected_amount: normalizedExpectedAmount,
      })

      if (paymentError) throw paymentError

      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o trabalho.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-app">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
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
        <h1 className="text-xl font-semibold">Adicionar trabalho</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col px-4 pb-12">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Nome do evento</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Organizador</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="text"
              value={organiserName}
              onChange={(e) => setOrganiserName(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Função</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Localização</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Data de início</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Data de fim</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </label>
          </div>

          <section className="space-y-3">
            <span className="block text-sm text-muted">Remuneração</span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode('daily')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  paymentMode === 'daily'
                    ? 'bg-accent text-[#000000]'
                    : 'bg-[#222222] text-[#888888]'
                }`}
              >
                Por dia
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('flat')}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  paymentMode === 'flat'
                    ? 'bg-accent text-[#000000]'
                    : 'bg-[#222222] text-[#888888]'
                }`}
              >
                Valor total
              </button>
            </div>

            {paymentMode === 'daily' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Dias de trabalho</span>
                    <input
                      className={fieldClass}
                      style={fieldStyle}
                      type="number"
                      min="0"
                      step="1"
                      value={workDays}
                      onChange={(e) => setWorkDays(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Valor/dia</span>
                    <EuroInput value={workRate} onChange={(e) => setWorkRate(e.target.value)} />
                  </label>
                </div>

                {showEstimatedTotal ? (
                  <p className="text-right text-sm text-accent">
                    Total estimado: €{estimatedTotal.toFixed(2)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Valor total do evento</span>
                  <EuroInput value={flatTotal} onChange={(e) => setFlatTotal(e.target.value)} />
                </label>
              </div>
            )}
          </section>

          <CollapsibleSection
            title="Refeições"
            expanded={mealsExpanded}
            onToggle={() => setMealsExpanded((open) => !open)}
          >
            <PillToggle
              columns={3}
              value={mealsType}
              onChange={setMealsType}
              options={[
                { value: 'none', label: 'Não incluído' },
                { value: 'included', label: 'Incluído' },
                { value: 'allowance', label: 'Subsídio' },
              ]}
            />

            {mealsType === 'allowance' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Valor por refeição</span>
                    <EuroInput value={mealsRate} onChange={(e) => setMealsRate(e.target.value)} />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Nº de refeições</span>
                    <input
                      className={fieldClass}
                      style={fieldStyle}
                      type="number"
                      min="0"
                      step="1"
                      value={mealsCount}
                      onChange={(e) => setMealsCount(e.target.value)}
                    />
                  </label>
                </div>

                {showMealsAllowanceTotal ? (
                  <p className="text-xs text-[#888888]">
                    Total subsídio: €{mealsAllowanceTotal.toFixed(2)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Transporte"
            expanded={transportExpanded}
            onToggle={() => setTransportExpanded((open) => !open)}
          >
            <PillToggle
              columns={3}
              value={transportType}
              onChange={setTransportType}
              options={[
                { value: 'none', label: 'Não incluído' },
                { value: 'provided', label: 'Fornecido' },
                { value: 'reimbursement', label: 'Reembolso' },
              ]}
            />

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Dias de viagem pagos</span>
                  <input
                    className={fieldClass}
                    style={fieldStyle}
                    type="number"
                    min="0"
                    step="1"
                    value={transportTravelDays}
                    onChange={(e) => setTransportTravelDays(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Valor/dia viagem</span>
                  <EuroInput
                    value={transportTravelRate}
                    onChange={(e) => setTransportTravelRate(e.target.value)}
                  />
                </label>
              </div>

              {transportTravelTotal != null ? (
                <p className="text-xs text-accent">
                  Total viagem: €{transportTravelTotal.toFixed(2)}
                </p>
              ) : null}
            </div>

            {transportType === 'reimbursement' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">€ por km</span>
                    <EuroInput
                      value={transportKmRate}
                      onChange={(e) => setTransportKmRate(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted">Kms estimados</span>
                    <input
                      className={fieldClass}
                      style={fieldStyle}
                      type="number"
                      min="0"
                      step="0.1"
                      value={transportKms}
                      onChange={(e) => setTransportKms(e.target.value)}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Portagens estimadas</span>
                  <EuroInput
                    value={transportTolls}
                    onChange={(e) => setTransportTolls(e.target.value)}
                  />
                </label>

                {transportReimbursementTotal != null ? (
                  <p className="text-xs text-[#888888]">
                    Total reembolso: €{transportReimbursementTotal.toFixed(2)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Alojamento"
            expanded={accommodationExpanded}
            onToggle={() => setAccommodationExpanded((open) => !open)}
          >
            <PillToggle
              value={accommodationType}
              onChange={setAccommodationType}
              options={[
                { value: 'none', label: 'Não necessário' },
                { value: 'included', label: 'Incluído pelo organizador' },
              ]}
            />
          </CollapsibleSection>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">Notas</span>
            <textarea
              className={`${fieldClass} min-h-[100px] resize-y`}
              style={fieldStyle}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </label>

          {error ? <div className="ds-alert-danger">{error}</div> : null}
        </div>

        <button type="submit" disabled={busy} className="ds-btn-primary mt-6 w-full">
          {busy ? 'A guardar…' : 'Guardar trabalho'}
        </button>
      </form>
    </div>
  )
}
