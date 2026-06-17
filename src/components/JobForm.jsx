import { useEffect, useMemo, useState } from 'react'
import { roundMoney } from '../lib/money.js'

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-3 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

const pillActive = 'bg-accent text-[#000000]'
const pillInactive = 'bg-[#222222] text-[#888888]'

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

export function parseNumber(value) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseInteger(value) {
  if (value === '' || value == null) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function formatTime(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function numberToField(value) {
  return value != null ? String(value) : ''
}

export function jobToFormValues(job) {
  const paymentMode =
    job.flat_total != null && Number(job.flat_total) > 0 ? 'flat' : 'daily'
  const startTime = formatTime(job.start_time)
  const endTime = formatTime(job.end_time)

  return {
    eventName: job.event_name ?? '',
    organiserName: job.organiser_name ?? '',
    role: job.role ?? '',
    location: job.location ?? '',
    startDate: job.start_date ?? '',
    endDate: job.end_date ?? '',
    timeExpanded: Boolean(startTime || endTime),
    startTime,
    endTime,
    notes: job.notes ?? '',
    paymentMode,
    workDays: numberToField(job.work_days),
    workRate: numberToField(job.work_rate),
    flatTotal: numberToField(job.flat_total),
    mealsExpanded: Boolean(job.meals_type && job.meals_type !== 'none'),
    mealsType: job.meals_type ?? 'none',
    mealsRate: numberToField(job.meals_rate),
    mealsCount: numberToField(job.meals_count),
    transportExpanded:
      Boolean(job.transport_type && job.transport_type !== 'none') ||
      job.transport_travel_days != null ||
      job.transport_travel_rate != null,
    transportType: job.transport_type ?? 'none',
    transportKmRate: numberToField(job.transport_km_rate),
    transportKms: numberToField(job.transport_kms),
    transportTolls: numberToField(job.transport_tolls),
    transportTravelDays: numberToField(job.transport_travel_days),
    transportTravelRate: numberToField(job.transport_travel_rate),
    accommodationExpanded: Boolean(job.accommodation_type && job.accommodation_type !== 'none'),
    accommodationType: job.accommodation_type ?? 'none',
  }
}

export function buildJobPayload(formState) {
  const parsedWorkDays = parseInteger(formState.workDays)
  const parsedWorkRate = parseNumber(formState.workRate)
  const parsedFlatTotal = parseNumber(formState.flatTotal)
  const parsedMealsRate = parseNumber(formState.mealsRate)
  const parsedMealsCount = parseInteger(formState.mealsCount)
  const parsedTransportKmRate = parseNumber(formState.transportKmRate)
  const parsedTransportKms = parseNumber(formState.transportKms)
  const parsedTransportTolls = parseNumber(formState.transportTolls)
  const parsedTransportTravelDays = parseInteger(formState.transportTravelDays)
  const parsedTransportTravelRate = parseNumber(formState.transportTravelRate)

  const workTotal = roundMoney((parsedWorkDays ?? 0) * (parsedWorkRate ?? 0)) ?? 0
  const travelTotal =
    roundMoney((parsedTransportTravelDays ?? 0) * (parsedTransportTravelRate ?? 0)) ?? 0
  const expectedAmount =
    formState.paymentMode === 'daily'
      ? roundMoney(workTotal + travelTotal)
      : roundMoney(parsedFlatTotal)

  const normalizedExpectedAmount =
    expectedAmount != null && expectedAmount > 0 ? expectedAmount : null

  return {
    jobData: {
      event_name: formState.eventName.trim(),
      organiser_name: formState.organiserName.trim() || null,
      role: formState.role.trim() || null,
      location: formState.location.trim() || null,
      start_date: formState.startDate,
      end_date: formState.endDate || null,
      start_time: formState.startTime || null,
      end_time: formState.endTime || null,
      notes: formState.notes.trim() || null,
      work_days: formState.paymentMode === 'daily' ? parsedWorkDays : null,
      work_rate: formState.paymentMode === 'daily' ? roundMoney(parsedWorkRate) : null,
      flat_total: formState.paymentMode === 'flat' ? roundMoney(parsedFlatTotal) : null,
      meals_type: formState.mealsType,
      meals_rate: formState.mealsType === 'allowance' ? roundMoney(parsedMealsRate) : null,
      meals_count: formState.mealsType === 'allowance' ? parsedMealsCount : null,
      transport_type: formState.transportType,
      transport_travel_days: parsedTransportTravelDays,
      transport_travel_rate: roundMoney(parsedTransportTravelRate),
      transport_km_rate:
        formState.transportType === 'reimbursement' ? roundMoney(parsedTransportKmRate) : null,
      transport_kms: formState.transportType === 'reimbursement' ? parsedTransportKms : null,
      transport_tolls:
        formState.transportType === 'reimbursement' ? roundMoney(parsedTransportTolls) : null,
      accommodation_type: formState.accommodationType,
    },
    expectedAmount: normalizedExpectedAmount,
  }
}

export default function JobForm({ initialJob, submitLabel, busy, error, onSubmit }) {
  const [eventName, setEventName] = useState('')
  const [organiserName, setOrganiserName] = useState('')
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [timeExpanded, setTimeExpanded] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
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

  useEffect(() => {
    if (!initialJob) return

    const values = jobToFormValues(initialJob)
    setEventName(values.eventName)
    setOrganiserName(values.organiserName)
    setRole(values.role)
    setLocation(values.location)
    setStartDate(values.startDate)
    setEndDate(values.endDate)
    setTimeExpanded(values.timeExpanded)
    setStartTime(values.startTime)
    setEndTime(values.endTime)
    setNotes(values.notes)
    setPaymentMode(values.paymentMode)
    setWorkDays(values.workDays)
    setWorkRate(values.workRate)
    setFlatTotal(values.flatTotal)
    setMealsExpanded(values.mealsExpanded)
    setMealsType(values.mealsType)
    setMealsRate(values.mealsRate)
    setMealsCount(values.mealsCount)
    setTransportExpanded(values.transportExpanded)
    setTransportType(values.transportType)
    setTransportKmRate(values.transportKmRate)
    setTransportKms(values.transportKms)
    setTransportTolls(values.transportTolls)
    setTransportTravelDays(values.transportTravelDays)
    setTransportTravelRate(values.transportTravelRate)
    setAccommodationExpanded(values.accommodationExpanded)
    setAccommodationType(values.accommodationType)
  }, [initialJob])

  const estimatedTotal = useMemo(() => {
    const days = parseInteger(workDays) ?? 0
    const rate = parseNumber(workRate) ?? 0
    return roundMoney(days * rate) ?? 0
  }, [workDays, workRate])

  const showEstimatedTotal = estimatedTotal > 0

  const mealsAllowanceTotal = useMemo(() => {
    const rate = parseNumber(mealsRate) ?? 0
    const count = parseInteger(mealsCount) ?? 0
    return roundMoney(rate * count) ?? 0
  }, [mealsRate, mealsCount])

  const showMealsAllowanceTotal =
    mealsType === 'allowance' && mealsAllowanceTotal > 0

  const transportReimbursementTotal = useMemo(() => {
    const kmRate = parseNumber(transportKmRate)
    const kms = parseNumber(transportKms)
    const tolls = parseNumber(transportTolls) ?? 0
    if (kmRate == null || kms == null) return null
    const total = roundMoney(kmRate * kms + tolls)
    return total != null && total > 0 ? total : null
  }, [transportKmRate, transportKms, transportTolls])

  const transportTravelTotal = useMemo(() => {
    const days = parseInteger(transportTravelDays)
    const rate = parseNumber(transportTravelRate)
    if (days == null || rate == null) return null
    const total = roundMoney(days * rate)
    return total != null && total > 0 ? total : null
  }, [transportTravelDays, transportTravelRate])

  function handleSubmit(e) {
    e.preventDefault()

    const payload = buildJobPayload({
      eventName,
      organiserName,
      role,
      location,
      startDate,
      endDate,
      startTime,
      endTime,
      notes,
      paymentMode,
      workDays,
      workRate,
      flatTotal,
      mealsType,
      mealsRate,
      mealsCount,
      transportType,
      transportKmRate,
      transportKms,
      transportTolls,
      transportTravelDays,
      transportTravelRate,
      accommodationType,
    })

    onSubmit(payload)
  }

  return (
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

        <button
          type="button"
          onClick={() => {
            if (timeExpanded) {
              setStartTime('')
              setEndTime('')
            }
            setTimeExpanded((open) => !open)
          }}
          className="text-sm text-accent"
        >
          {timeExpanded ? '− Remover horário' : '+ Adicionar horário'}
        </button>

        {timeExpanded ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Hora de início</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Hora de fim</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
        ) : null}

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
        {busy ? 'A guardar…' : submitLabel}
      </button>
    </form>
  )
}
