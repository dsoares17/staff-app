import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { formatEuro, roundMoney } from '../lib/money.js'
import { supabase } from '../lib/supabaseClient.js'

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-3 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

const pillActive = 'bg-accent text-[#000000]'
const pillInactive = 'bg-[#222222] text-[#888888]'

const JOB_STATUS_TOGGLE_OPTIONS = [
  { value: 'pending', label: 'Pendente', activeClass: 'bg-[#FFB800] text-[#000000]' },
  { value: 'confirmed', label: 'Confirmado', activeClass: 'bg-[#00FF87] text-[#000000]' },
]

function JobStatusToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {JOB_STATUS_TOGGLE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            value === option.value ? option.activeClass : pillInactive
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function normalizeFormStatus(status) {
  if (status === 'pending') return 'pending'
  return 'confirmed'
}

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

function escapeIlike(value) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function RoleComboField({ value, options, onChange }) {
  const containerRef = useRef(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const filteredOptions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return options
    return options.filter((option) => option.toLowerCase().includes(query))
  }, [options, value])

  const showDropdown = dropdownOpen && filteredOptions.length > 0

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        className={fieldClass}
        style={fieldStyle}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setDropdownOpen(true)
        }}
        onFocus={() => setDropdownOpen(true)}
        autoComplete="off"
      />

      {showDropdown ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{ backgroundColor: '#141414', borderColor: '#222222' }}
        >
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option)
                setDropdownOpen(false)
              }}
              className="block w-full border-b px-3 py-2.5 text-left text-sm text-fg last:border-b-0 active:bg-[#1A1A1A]"
              style={{ borderColor: '#222222' }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function OrganiserComboField({
  userId,
  inputValue,
  selectedOrganiser,
  createExpanded,
  createFields,
  onInputChange,
  onSelectOrganiser,
  onClearSelection,
  onStartCreate,
  onCreateFieldChange,
}) {
  const containerRef = useRef(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const trimmedInput = inputValue.trim()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(trimmedInput), 300)
    return () => window.clearTimeout(timer)
  }, [trimmedInput])

  useEffect(() => {
    if (!dropdownOpen || selectedOrganiser || !userId || debouncedQuery.length === 0) {
      setSearchResults([])
      setSearching(false)
      return undefined
    }

    let active = true
    setSearching(true)

    async function fetchOrganisers() {
      const { data, error } = await supabase
        .from('staff_app_organisers')
        .select('id, name, nif, email, phone')
        .eq('staff_app_user_id', userId)
        .ilike('name', `%${escapeIlike(debouncedQuery)}%`)
        .order('name', { ascending: true })
        .limit(5)

      if (!active) return

      setSearchResults(error ? [] : data ?? [])
      setSearching(false)
    }

    fetchOrganisers()

    return () => {
      active = false
    }
  }, [debouncedQuery, dropdownOpen, selectedOrganiser, userId])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [])

  const exactMatch = searchResults.some(
    (organiser) => organiser.name.toLowerCase() === trimmedInput.toLowerCase()
  )
  const showCreateOption = trimmedInput.length > 0 && !exactMatch && !selectedOrganiser
  const showDropdown =
    dropdownOpen && !selectedOrganiser && trimmedInput.length > 0 && (searching || showCreateOption || searchResults.length > 0)

  function handleSelect(organiser) {
    onSelectOrganiser(organiser)
    setDropdownOpen(false)
  }

  function handleStartCreate() {
    onStartCreate()
    setDropdownOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={fieldClass}
        style={fieldStyle}
        type="text"
        value={inputValue}
        onChange={(e) => {
          onInputChange(e.target.value)
          setDropdownOpen(true)
        }}
        onFocus={() => {
          if (!selectedOrganiser) setDropdownOpen(true)
        }}
        autoComplete="off"
      />

      {selectedOrganiser ? (
        <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent">
          <span className="truncate">
            {selectedOrganiser.name}
            {selectedOrganiser.nif ? ` · NIF: ${selectedOrganiser.nif}` : ''}
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            aria-label="Remover cliente"
            className="shrink-0 text-sm leading-none text-accent"
          >
            ×
          </button>
        </div>
      ) : null}

      {showDropdown ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{ backgroundColor: '#141414', borderColor: '#222222' }}
        >
          {searching && searchResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#888888]">A pesquisar…</p>
          ) : null}

          {!searching && searchResults.length === 0 && showCreateOption ? (
            <button
              type="button"
              onClick={handleStartCreate}
              className="block w-full px-3 py-2.5 text-left text-sm text-fg active:bg-[#1A1A1A]"
            >
              Nenhum cliente encontrado — Criar &apos;{trimmedInput}&apos;?
            </button>
          ) : (
            <>
              {searchResults.map((organiser) => (
                <button
                  key={organiser.id}
                  type="button"
                  onClick={() => handleSelect(organiser)}
                  className="block w-full border-b px-3 py-2.5 text-left last:border-b-0 active:bg-[#1A1A1A]"
                  style={{ borderColor: '#222222' }}
                >
                  <p className="text-sm text-fg">{organiser.name}</p>
                  {organiser.nif ? (
                    <p className="mt-0.5 text-xs text-[#888888]">NIF: {organiser.nif}</p>
                  ) : null}
                </button>
              ))}

              {showCreateOption ? (
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="block w-full px-3 py-2.5 text-left text-sm text-accent active:bg-[#1A1A1A]"
                >
                  ➕ Criar &apos;{trimmedInput}&apos;
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {createExpanded && !selectedOrganiser && trimmedInput ? (
        <div
          className="mt-3 space-y-3 rounded-lg border p-3"
          style={{ borderColor: '#222222', backgroundColor: '#1A1A1A' }}
        >
          <p className="text-xs text-[#888888]">Novo cliente: {trimmedInput}</p>

          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">NIF</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="text"
              inputMode="numeric"
              value={createFields.nif}
              onChange={(e) => onCreateFieldChange('nif', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Email</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="email"
              value={createFields.email}
              onChange={(e) => onCreateFieldChange('email', e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#888888]">Telefone</span>
            <input
              className={fieldClass}
              style={fieldStyle}
              type="tel"
              value={createFields.phone}
              onChange={(e) => onCreateFieldChange('phone', e.target.value)}
            />
          </label>
        </div>
      ) : null}
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

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-fg">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-[#FFC700]' : 'bg-[#333333]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function createRecurringDateEntry(startDate = '', endDate = '') {
  return {
    id: crypto.randomUUID(),
    startDate,
    endDate,
  }
}

const SCHEDULE_WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SCHEDULE_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function isMultiDayEvent(startDate, endDate) {
  return Boolean(startDate && endDate && endDate !== startDate)
}

function countWeekdays(startDateISO, endDateISO) {
  if (!startDateISO || !endDateISO) return 0
  const start = new Date(`${startDateISO}T00:00:00`)
  const end = new Date(`${endDateISO}T00:00:00`)
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

function rangeContainsWeekend(startDateISO, endDateISO) {
  if (!startDateISO || !endDateISO) return false
  const start = new Date(`${startDateISO}T00:00:00`)
  const end = new Date(`${endDateISO}T00:00:00`)
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day === 0 || day === 6) return true
    current.setDate(current.getDate() + 1)
  }
  return false
}

function enumerateDateRange(startDate, endDate) {
  const dates = []
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate || startDate}T00:00:00`)
  const cursor = new Date(start)

  while (cursor <= end) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function formatScheduleDayLabel(dateISO) {
  const date = new Date(`${dateISO}T00:00:00`)
  return `${SCHEDULE_WEEK_DAYS[date.getDay()]}, ${date.getDate()} ${SCHEDULE_MONTHS[date.getMonth()]}`
}

function buildDailyScheduleRows(startDate, endDate, existingRows = []) {
  const existingByDate = Object.fromEntries(
    existingRows.map((row) => [row.scheduleDate, row])
  )

  return enumerateDateRange(startDate, endDate).map((scheduleDate) => ({
    scheduleDate,
    startTime: existingByDate[scheduleDate]?.startTime ?? '',
    endTime: existingByDate[scheduleDate]?.endTime ?? '',
  }))
}

function calcTimeSpanHours(startTime, endTime) {
  if (!startTime || !endTime) return null

  const [sh, sm] = String(startTime).slice(0, 5).split(':').map(Number)
  const [eh, em] = String(endTime).slice(0, 5).split(':').map(Number)

  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return null
  }

  const startMinutes = sh * 60 + sm
  let endMinutes = eh * 60 + em
  // End earlier than start means the shift crosses midnight (ends the next day, e.g. 17:00 -> 00:00)
  if (endMinutes < startMinutes) endMinutes += 24 * 60

  const hours = (endMinutes - startMinutes) / 60
  return hours > 0 ? hours : null
}

export function calcScheduleTotalHours({
  startDate,
  endDate,
  startTime,
  endTime,
  scheduleMode,
  dailySchedules,
}) {
  const multiDay = isMultiDayEvent(startDate, endDate)

  if (!multiDay) {
    return calcTimeSpanHours(startTime, endTime)
  }

  if (scheduleMode === 'perDay' && dailySchedules?.length) {
    let totalHours = 0
    let hasAny = false

    for (const row of dailySchedules) {
      const dayHours = calcTimeSpanHours(row.startTime, row.endTime)
      if (dayHours != null) {
        totalHours += dayHours
        hasAny = true
      }
    }

    return hasAny && totalHours > 0 ? totalHours : null
  }

  const hoursPerDay = calcTimeSpanHours(startTime, endTime)
  if (hoursPerDay == null) return null

  const days = enumerateDateRange(startDate, endDate).length
  return hoursPerDay * days
}

export function calcHourlyPrimaryFromSchedule({
  hourlyRatePrimary,
  startDate,
  endDate,
  startTime,
  endTime,
  scheduleMode,
  dailySchedules,
}) {
  const rate = parseNumber(hourlyRatePrimary)
  if (rate == null || rate <= 0) return null

  const totalHours = calcScheduleTotalHours({
    startDate,
    endDate,
    startTime,
    endTime,
    scheduleMode,
    dailySchedules,
  })

  if (totalHours == null || totalHours <= 0) return null
  return roundMoney(rate * totalHours)
}

async function insertDailySchedulesForNewJob(userId, jobData, dailySchedules) {
  const since = new Date(Date.now() - 15000).toISOString()

  const { data: job, error: findError } = await supabase
    .from('staff_app_jobs')
    .select('id')
    .eq('staff_app_user_id', userId)
    .eq('event_name', jobData.event_name)
    .eq('start_date', jobData.start_date)
    .eq('end_date', jobData.end_date ?? null)
    .is('start_time', null)
    .is('end_time', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError || !job?.id) return

  await supabase.from('staff_app_job_schedules').insert(
    dailySchedules.map((row) => ({
      job_id: job.id,
      schedule_date: row.scheduleDate,
      start_time: row.startTime || null,
      end_time: row.endTime || null,
    }))
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

export function calcHourlyExtraTotal(hourlyRate, hours) {
  const rate = parseNumber(hourlyRate)
  const parsedHours = parseNumber(hours)
  if (rate == null || parsedHours == null || rate <= 0 || parsedHours <= 0) return 0
  return roundMoney(rate * parsedHours) ?? 0
}

export function calcReceivableFromFormState(formState) {
  const parsedWorkDays = parseInteger(formState.workDays)
  const parsedWorkRate = parseNumber(formState.workRate)
  const parsedFlatTotal = parseNumber(formState.flatTotal)
  const parsedTransportTravelDays = parseInteger(formState.transportTravelDays)
  const parsedTransportTravelRate = parseNumber(formState.transportTravelRate)

  const workTotal = roundMoney((parsedWorkDays ?? 0) * (parsedWorkRate ?? 0)) ?? 0
  const travelTotal =
    roundMoney((parsedTransportTravelDays ?? 0) * (parsedTransportTravelRate ?? 0)) ?? 0
  const hourlyExtra = calcHourlyExtraTotal(formState.hourlyRate, formState.hours)

  let baseTotal = 0
  if (formState.paymentMode === 'hourly') {
    const primaryTotal = calcHourlyPrimaryFromSchedule({
      hourlyRatePrimary: formState.hourlyRatePrimary,
      startDate: formState.startDate,
      endDate: formState.endDate,
      startTime: formState.startTime,
      endTime: formState.endTime,
      scheduleMode: formState.scheduleMode,
      dailySchedules: formState.dailySchedules,
    })
    if (primaryTotal == null) return null
    baseTotal = primaryTotal
  } else if (formState.paymentMode === 'daily') {
    baseTotal = workTotal + travelTotal
  } else {
    baseTotal = parsedFlatTotal ?? 0
  }

  return roundMoney(baseTotal + hourlyExtra)
}

function getSuggestionSpanDays(job) {
  if (!job.start_date) return 1
  const start = new Date(`${job.start_date}T00:00:00`)
  const end = new Date(`${job.end_date || job.start_date}T00:00:00`)
  const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1
  return diffDays > 0 ? diffDays : 1
}

function formatSuggestionRateSummary(job) {
  const paymentMode =
    job.flat_total != null && Number(job.flat_total) > 0 ? 'flat' : 'daily'
  let summary = ''

  if (paymentMode === 'daily') {
    const workRate = Number(job.work_rate)
    if (Number.isFinite(workRate) && workRate > 0) {
      summary = `${formatEuro(workRate)}/dia`
    }
  } else {
    const flatTotal = Number(job.flat_total)
    if (Number.isFinite(flatTotal) && flatTotal > 0) {
      const spanDays = getSuggestionSpanDays(job)
      const impliedDaily = roundMoney(flatTotal / spanDays)
      if (impliedDaily != null && impliedDaily > 0) {
        summary = `${formatEuro(impliedDaily)}/dia`
      }
    }
  }

  const hourlyRate = Number(job.hourly_rate)
  const hours = Number(job.hours)
  if (
    Number.isFinite(hourlyRate) &&
    Number.isFinite(hours) &&
    hourlyRate > 0 &&
    hours > 0
  ) {
    const hourlyPart = `${formatEuro(hourlyRate)}/hora extra`
    summary = summary ? `${summary} + ${hourlyPart}` : hourlyPart
  }

  return summary || null
}

function formatSuggestionMeta(job) {
  return [job.event_name, job.organiser_name, job.role].filter(Boolean).join(' · ')
}

export function jobToFormValues(job) {
  const paymentMode =
    job.hourly_rate_primary != null && Number(job.hourly_rate_primary) > 0
      ? 'hourly'
      : job.flat_total != null && Number(job.flat_total) > 0
        ? 'flat'
        : 'daily'
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
    status: normalizeFormStatus(job.status),
    paymentMode,
    workDays: numberToField(job.work_days),
    excludeWeekends: Boolean(job.exclude_weekends),
    workRate: numberToField(job.work_rate),
    flatTotal: numberToField(job.flat_total),
    hourlyRatePrimary: numberToField(job.hourly_rate_primary),
    hourlyExpanded:
      job.hourly_rate != null || (job.hours != null && Number(job.hours) > 0),
    hourlyRate: numberToField(job.hourly_rate),
    hours: numberToField(job.hours),
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
  const parsedHourlyRate = parseNumber(formState.hourlyRate)
  const parsedHours = parseNumber(formState.hours)
  const parsedHourlyRatePrimary = parseNumber(formState.hourlyRatePrimary)

  const expectedAmount = calcReceivableFromFormState(formState)

  const normalizedExpectedAmount =
    expectedAmount != null && expectedAmount > 0 ? expectedAmount : null

  return {
    jobData: {
      event_name: formState.eventName.trim(),
      organiser_id: formState.organiserId ?? null,
      organiser_name: formState.organiserName.trim() || null,
      role: formState.role.trim() || null,
      location: formState.location.trim() || null,
      start_date: formState.startDate,
      end_date: formState.endDate || null,
      start_time: formState.startTime || null,
      end_time: formState.endTime || null,
      notes: formState.notes.trim() || null,
      status: formState.status,
      work_days: formState.paymentMode === 'daily' ? parsedWorkDays : null,
      exclude_weekends: formState.excludeWeekends,
      work_rate: formState.paymentMode === 'daily' ? roundMoney(parsedWorkRate) : null,
      flat_total: formState.paymentMode === 'flat' ? parsedFlatTotal : null,
      hourly_rate_primary:
        formState.paymentMode === 'hourly' ? roundMoney(parsedHourlyRatePrimary) : null,
      hours: formState.hourlyExpanded ? parsedHours : null,
      hourly_rate: formState.hourlyExpanded ? roundMoney(parsedHourlyRate) : null,
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

export default function JobForm({ initialJob, submitLabel, busy, error, onSubmit, initialDate }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const isAddMode = !initialJob
  const [eventName, setEventName] = useState('')
  const [status, setStatus] = useState('confirmed')
  const [organiserInput, setOrganiserInput] = useState('')
  const [selectedOrganiser, setSelectedOrganiser] = useState(null)
  const [organiserCreateExpanded, setOrganiserCreateExpanded] = useState(false)
  const [newOrganiserFields, setNewOrganiserFields] = useState({
    nif: '',
    email: '',
    phone: '',
  })
  const [organiserSubmitError, setOrganiserSubmitError] = useState('')
  const [role, setRole] = useState('')
  const [roleOptions, setRoleOptions] = useState([])
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringDates, setRecurringDates] = useState(() => [createRecurringDateEntry()])
  const [recurringError, setRecurringError] = useState('')
  const [timeExpanded, setTimeExpanded] = useState(false)
  const [scheduleMode, setScheduleMode] = useState('single')
  const [dailySchedules, setDailySchedules] = useState([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMode, setPaymentMode] = useState('daily')
  const [workDays, setWorkDays] = useState('')
  const [excludeWeekends, setExcludeWeekends] = useState(false)
  const [workRate, setWorkRate] = useState('')
  const [flatTotal, setFlatTotal] = useState('')
  const [hourlyRatePrimary, setHourlyRatePrimary] = useState('')
  const [hourlyExpanded, setHourlyExpanded] = useState(false)
  const [hourlyRate, setHourlyRate] = useState('')
  const [hours, setHours] = useState('')
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
  const [debouncedEventName, setDebouncedEventName] = useState('')
  const [suggestedJob, setSuggestedJob] = useState(null)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  useEffect(() => {
    if (!isAddMode) return

    const dateParam = searchParams.get('date') ?? initialDate
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setStartDate(dateParam)
      if (isRecurring) {
        setRecurringDates((current) => {
          if (current.length === 0) return [createRecurringDateEntry(dateParam)]
          const [first, ...rest] = current
          return [{ ...first, startDate: dateParam }, ...rest]
        })
      }
    }
  }, [isAddMode, isRecurring, searchParams, initialDate])

  function handleRecurringToggle(enabled) {
    setIsRecurring(enabled)
    setRecurringError('')

    if (enabled) {
      setRecurringDates([createRecurringDateEntry(startDate, endDate)])
    }
  }

  function updateRecurringDate(id, field, value) {
    setRecurringDates((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    )
    setRecurringError('')
  }

  function removeRecurringDate(id) {
    setRecurringDates((current) => {
      if (current.length <= 1) return current
      return current.filter((entry) => entry.id !== id)
    })
  }

  function addRecurringDate() {
    setRecurringDates((current) => [...current, createRecurringDateEntry()])
  }

  const showMultiDaySchedule = !isRecurring && isMultiDayEvent(startDate, endDate)

  const showExcludeWeekendsToggle =
    Boolean(endDate && endDate > startDate && rangeContainsWeekend(startDate, endDate)) &&
    (!isAddMode || !isRecurring)

  useEffect(() => {
    if (
      !excludeWeekends ||
      !startDate ||
      !endDate ||
      !rangeContainsWeekend(startDate, endDate)
    ) {
      return
    }

    setWorkDays(String(countWeekdays(startDate, endDate)))
  }, [excludeWeekends, startDate, endDate])

  useEffect(() => {
    if (isRecurring || scheduleMode !== 'perDay') return undefined

    if (!isMultiDayEvent(startDate, endDate)) {
      setScheduleMode('single')
      return undefined
    }

    setDailySchedules((current) => buildDailyScheduleRows(startDate, endDate, current))
    return undefined
  }, [startDate, endDate, scheduleMode, isRecurring])

  function updateDailySchedule(scheduleDate, field, value) {
    setDailySchedules((current) =>
      current.map((row) =>
        row.scheduleDate === scheduleDate ? { ...row, [field]: value } : row
      )
    )
  }

  function handleScheduleModeChange(mode) {
    setScheduleMode(mode)

    if (mode === 'perDay' && isMultiDayEvent(startDate, endDate)) {
      setDailySchedules((current) => buildDailyScheduleRows(startDate, endDate, current))
      setStartTime('')
      setEndTime('')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedEventName(eventName.trim()), 400)
    return () => window.clearTimeout(timer)
  }, [eventName])

  useEffect(() => {
    setSuggestionDismissed(false)
  }, [debouncedEventName])

  useEffect(() => {
    if (!isAddMode || !user?.id) {
      setSuggestedJob(null)
      return undefined
    }

    if (debouncedEventName.length < 3) {
      setSuggestedJob(null)
      return undefined
    }

    let active = true

    async function fetchSuggestion() {
      const { data, error: fetchError } = await supabase
        .from('staff_app_jobs')
        .select('*')
        .eq('staff_app_user_id', user.id)
        .ilike('event_name', `%${debouncedEventName}%`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) return

      if (fetchError) {
        setSuggestedJob(null)
        return
      }

      setSuggestedJob(data)
    }

    fetchSuggestion()

    return () => {
      active = false
    }
  }, [isAddMode, user?.id, debouncedEventName])

  useEffect(() => {
    if (!user?.id) return undefined
    let active = true

    async function fetchRoleOptions() {
      const [jobsRes, profileRes] = await Promise.all([
        supabase
          .from('staff_app_jobs')
          .select('role')
          .eq('staff_app_user_id', user.id)
          .not('role', 'is', null),
        supabase
          .from('staff_app_users')
          .select('roles')
          .eq('id', user.id)
          .maybeSingle(),
      ])
      if (!active) return

      const fromJobs = (jobsRes.data ?? [])
        .map((row) => row.role)
        .filter((value) => typeof value === 'string' && value.trim())
      const rawProfile = profileRes.data?.roles
      const fromProfile = Array.isArray(rawProfile)
        ? rawProfile.filter((value) => typeof value === 'string' && value.trim())
        : []

      const seen = new Map()
      for (const value of [...fromProfile, ...fromJobs]) {
        const key = value.trim().toLowerCase()
        if (key && !seen.has(key)) seen.set(key, value.trim())
      }
      setRoleOptions([...seen.values()])
    }

    fetchRoleOptions()

    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    if (!initialJob) return

    const values = jobToFormValues(initialJob)
    setEventName(values.eventName)
    setStatus(values.status)
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
    setExcludeWeekends(values.excludeWeekends)
    setWorkRate(values.workRate)
    setFlatTotal(values.flatTotal)
    setHourlyRatePrimary(values.hourlyRatePrimary)
    setHourlyExpanded(values.hourlyExpanded)
    setHourlyRate(values.hourlyRate)
    setHours(values.hours)
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
    setOrganiserCreateExpanded(false)
    setNewOrganiserFields({ nif: '', email: '', phone: '' })
    setOrganiserSubmitError('')

    let active = true

    async function loadOrganiser() {
      if (initialJob.organiser_id && user?.id) {
        const { data } = await supabase
          .from('staff_app_organisers')
          .select('id, name, nif, email, phone')
          .eq('id', initialJob.organiser_id)
          .eq('staff_app_user_id', user.id)
          .maybeSingle()

        if (!active) return

        if (data) {
          setSelectedOrganiser(data)
          setOrganiserInput(data.name)
          return
        }
      }

      setSelectedOrganiser(null)
      setOrganiserInput(values.organiserName)
    }

    async function loadSchedules() {
      const { data } = await supabase
        .from('staff_app_job_schedules')
        .select('schedule_date, start_time, end_time')
        .eq('job_id', initialJob.id)
        .order('schedule_date', { ascending: true })

      if (!active) return

      if (data?.length) {
        setScheduleMode('perDay')
        setTimeExpanded(true)
        setDailySchedules(
          data.map((row) => ({
            scheduleDate: row.schedule_date,
            startTime: formatTime(row.start_time),
            endTime: formatTime(row.end_time),
          }))
        )
        setStartTime('')
        setEndTime('')
      } else {
        setScheduleMode('single')
        setDailySchedules([])
      }
    }

    loadOrganiser()
    loadSchedules()

    return () => {
      active = false
    }
  }, [initialJob, user?.id])

  function handleOrganiserInputChange(value) {
    setOrganiserInput(value)
    setOrganiserSubmitError('')
    if (selectedOrganiser && value !== selectedOrganiser.name) {
      setSelectedOrganiser(null)
    }
    setOrganiserCreateExpanded(false)
    setNewOrganiserFields({ nif: '', email: '', phone: '' })
  }

  function handleSelectOrganiser(organiser) {
    setSelectedOrganiser(organiser)
    setOrganiserInput(organiser.name)
    setOrganiserCreateExpanded(false)
    setNewOrganiserFields({ nif: '', email: '', phone: '' })
    setOrganiserSubmitError('')
  }

  function handleClearOrganiserSelection() {
    setSelectedOrganiser(null)
    setOrganiserInput('')
    setOrganiserCreateExpanded(false)
    setNewOrganiserFields({ nif: '', email: '', phone: '' })
  }

  function handleStartOrganiserCreate() {
    setSelectedOrganiser(null)
    setOrganiserCreateExpanded(true)
    setOrganiserSubmitError('')
  }

  function handleNewOrganiserFieldChange(field, value) {
    setNewOrganiserFields((current) => ({ ...current, [field]: value }))
  }

  async function resolveOrganiserForSubmit() {
    const trimmedName = organiserInput.trim()

    if (!trimmedName) {
      return { organiserId: null, organiserName: null }
    }

    if (selectedOrganiser) {
      return {
        organiserId: selectedOrganiser.id,
        organiserName: selectedOrganiser.name,
      }
    }

    if (organiserCreateExpanded) {
      if (!user?.id) {
        throw new Error('Sessão inválida.')
      }

      const { data, error: insertError } = await supabase
        .from('staff_app_organisers')
        .insert({
          staff_app_user_id: user.id,
          name: trimmedName,
          nif: newOrganiserFields.nif.trim() || null,
          email: newOrganiserFields.email.trim() || null,
          phone: newOrganiserFields.phone.trim() || null,
        })
        .select('id, name, nif')
        .single()

      if (insertError) throw insertError

      return {
        organiserId: data.id,
        organiserName: data.name,
      }
    }

    return {
      organiserId: null,
      organiserName: trimmedName,
    }
  }

  const workSubtotal = useMemo(() => {
    const days = parseInteger(workDays) ?? 0
    const rate = parseNumber(workRate) ?? 0
    return roundMoney(days * rate) ?? 0
  }, [workDays, workRate])

  const showWorkSubtotal = paymentMode === 'daily' && workSubtotal > 0

  const hourlyExtraTotal = useMemo(
    () => calcHourlyExtraTotal(hourlyRate, hours),
    [hourlyRate, hours]
  )

  const showHourlyExtraTotal = hourlyExtraTotal > 0

  const hourlyPrimaryTotal = useMemo(
    () =>
      paymentMode === 'hourly'
        ? calcHourlyPrimaryFromSchedule({
            hourlyRatePrimary,
            startDate,
            endDate,
            startTime,
            endTime,
            scheduleMode,
            dailySchedules: scheduleMode === 'perDay' ? dailySchedules : [],
          })
        : null,
    [
      paymentMode,
      hourlyRatePrimary,
      startDate,
      endDate,
      startTime,
      endTime,
      scheduleMode,
      dailySchedules,
    ]
  )

  const scheduleTotalHours = useMemo(
    () =>
      paymentMode === 'hourly'
        ? calcScheduleTotalHours({
            startDate,
            endDate,
            startTime,
            endTime,
            scheduleMode,
            dailySchedules: scheduleMode === 'perDay' ? dailySchedules : [],
          })
        : null,
    [paymentMode, startDate, endDate, startTime, endTime, scheduleMode, dailySchedules]
  )

  const hasScheduleForHourly = scheduleTotalHours != null && scheduleTotalHours > 0
  const hasHourlyPrimaryRate =
    parseNumber(hourlyRatePrimary) != null && parseNumber(hourlyRatePrimary) > 0

  const hourlyModeTotal = useMemo(() => {
    if (paymentMode !== 'hourly' || hourlyPrimaryTotal == null) return null
    const extra = calcHourlyExtraTotal(hourlyRate, hours)
    return roundMoney(hourlyPrimaryTotal + extra)
  }, [paymentMode, hourlyPrimaryTotal, hourlyRate, hours])

  const receivableTotal = useMemo(
    () =>
      calcReceivableFromFormState({
        paymentMode,
        workDays,
        workRate,
        flatTotal,
        hourlyRatePrimary,
        startDate,
        endDate,
        startTime,
        endTime,
        scheduleMode,
        dailySchedules: scheduleMode === 'perDay' ? dailySchedules : [],
        hourlyRate,
        hours,
        transportTravelDays,
        transportTravelRate,
      }),
    [
      paymentMode,
      workDays,
      workRate,
      flatTotal,
      hourlyRatePrimary,
      startDate,
      endDate,
      startTime,
      endTime,
      scheduleMode,
      dailySchedules,
      hourlyRate,
      hours,
      transportTravelDays,
      transportTravelRate,
    ]
  )

  const showReceivableTotal =
    paymentMode !== 'hourly' && receivableTotal != null && receivableTotal > 0

  const flatSubtotal = useMemo(() => parseNumber(flatTotal) ?? 0, [flatTotal])

  const showFlatSubtotal = paymentMode === 'flat' && flatSubtotal > 0

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

  async function handleUseSuggestion() {
    if (!suggestedJob) return

    const values = jobToFormValues(suggestedJob)

    if (suggestedJob.organiser_id && user?.id) {
      const { data } = await supabase
        .from('staff_app_organisers')
        .select('id, name, nif, email, phone')
        .eq('id', suggestedJob.organiser_id)
        .eq('staff_app_user_id', user.id)
        .maybeSingle()

      if (data) {
        setSelectedOrganiser(data)
        setOrganiserInput(data.name)
      } else {
        setSelectedOrganiser(null)
        setOrganiserInput(values.organiserName)
      }
    } else {
      setSelectedOrganiser(null)
      setOrganiserInput(values.organiserName)
    }

    setOrganiserCreateExpanded(false)
    setNewOrganiserFields({ nif: '', email: '', phone: '' })
    setRole(values.role)
    setLocation(values.location)
    setPaymentMode(values.paymentMode)
    setWorkDays(values.workDays)
    setExcludeWeekends(values.excludeWeekends)
    setWorkRate(values.workRate)
    setFlatTotal(values.flatTotal)
    setHourlyRatePrimary(values.hourlyRatePrimary)
    setHourlyExpanded(values.hourlyExpanded)
    setHourlyRate(values.hourlyRate)
    setHours(values.hours)
    setTransportExpanded(values.transportExpanded)
    setTransportType(values.transportType)
    setTransportKmRate(values.transportKmRate)
    setTransportKms(values.transportKms)
    setTransportTolls(values.transportTolls)
    setTransportTravelDays(values.transportTravelDays)
    setTransportTravelRate(values.transportTravelRate)
    setMealsExpanded(values.mealsExpanded)
    setMealsType(values.mealsType)
    setMealsRate(values.mealsRate)
    setMealsCount(values.mealsCount)
    setAccommodationExpanded(values.accommodationExpanded)
    setAccommodationType(values.accommodationType)
    setNotes(values.notes)
    setSuggestedJob(null)
    setSuggestionDismissed(true)
  }

  const suggestedJobRateSummary = useMemo(
    () => (suggestedJob ? formatSuggestionRateSummary(suggestedJob) : null),
    [suggestedJob]
  )

  const showSuggestion =
    isAddMode && suggestedJob && !suggestionDismissed

  async function handleSubmit(e) {
    e.preventDefault()
    setOrganiserSubmitError('')
    setRecurringError('')

    let organiserId = null
    let organiserName = null

    try {
      const resolved = await resolveOrganiserForSubmit()
      organiserId = resolved.organiserId
      organiserName = resolved.organiserName
    } catch (err) {
      setOrganiserSubmitError(err.message || 'Não foi possível criar o cliente.')
      return
    }

    const usePerDaySchedule =
      !isRecurring && scheduleMode === 'perDay' && isMultiDayEvent(startDate, endDate)

    const formState = {
      eventName,
      status,
      organiserId,
      organiserName: organiserName ?? '',
      role,
      location,
      startDate,
      endDate,
      startTime: usePerDaySchedule ? '' : startTime,
      endTime: usePerDaySchedule ? '' : endTime,
      notes,
      paymentMode,
      workDays,
      excludeWeekends,
      workRate,
      flatTotal,
      hourlyRatePrimary,
      scheduleMode: usePerDaySchedule ? 'perDay' : 'single',
      dailySchedules: usePerDaySchedule ? dailySchedules : [],
      hourlyExpanded,
      hourlyRate,
      hours,
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
    }

    if (isAddMode && isRecurring) {
      const validEntries = recurringDates
        .filter((entry) => entry.startDate)
        .map((entry) => ({
          startDate: entry.startDate,
          endDate: entry.endDate || null,
        }))

      if (validEntries.length === 0) {
        setRecurringError('Adiciona pelo menos uma data de início.')
        return
      }

      const { jobData, expectedAmount } = buildJobPayload(formState)
      const { start_date: _start, end_date: _end, ...sharedJobData } = jobData

      await onSubmit({
        recurring: true,
        dateEntries: validEntries,
        jobData: sharedJobData,
        expectedAmount,
      })
      return
    }

    const payload = buildJobPayload(formState)

    if (usePerDaySchedule) {
      payload.dailySchedules = dailySchedules.map((row) => ({
        scheduleDate: row.scheduleDate,
        startTime: row.startTime || null,
        endTime: row.endTime || null,
      }))
    }

    await onSubmit(payload)

    if (isAddMode && payload.dailySchedules?.length && user?.id) {
      await insertDailySchedulesForNewJob(user.id, payload.jobData, payload.dailySchedules)
    }
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

          {showSuggestion ? (
            <div
              className="relative mt-2 rounded-lg p-3"
              style={{ backgroundColor: '#1A1A1A', border: '1px solid #FFC70030' }}
            >
              <button
                type="button"
                onClick={() => setSuggestionDismissed(true)}
                aria-label="Dispensar sugestão"
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center text-sm text-[#888888]"
              >
                ×
              </button>

              <p className="text-xs text-[#888888]">Encontrámos um trabalho parecido</p>
              <p className="mt-1 pr-6 text-sm font-medium text-fg">
                {formatSuggestionMeta(suggestedJob)}
              </p>
              {suggestedJobRateSummary ? (
                <p className="mt-1 text-sm text-accent">{suggestedJobRateSummary}</p>
              ) : null}

              <button
                type="button"
                onClick={handleUseSuggestion}
                className="mt-3 w-full rounded-lg bg-accent py-2 text-sm font-medium text-[#000000]"
              >
                Usar estes dados
              </button>
            </div>
          ) : null}
        </label>

        <div>
          <span className="mb-1.5 block text-sm text-muted">Estado</span>
          <JobStatusToggle value={status} onChange={setStatus} />
        </div>

        <div className="block">
          <span className="mb-1.5 block text-sm text-muted">Cliente</span>
          <OrganiserComboField
            userId={user?.id}
            inputValue={organiserInput}
            selectedOrganiser={selectedOrganiser}
            createExpanded={organiserCreateExpanded}
            createFields={newOrganiserFields}
            onInputChange={handleOrganiserInputChange}
            onSelectOrganiser={handleSelectOrganiser}
            onClearSelection={handleClearOrganiserSelection}
            onStartCreate={handleStartOrganiserCreate}
            onCreateFieldChange={handleNewOrganiserFieldChange}
          />
          {organiserSubmitError ? (
            <p className="mt-1.5 text-xs text-danger">{organiserSubmitError}</p>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm text-muted">Função</span>
          <RoleComboField value={role} options={roleOptions} onChange={setRole} />
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

        {(!isAddMode || !isRecurring) ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Data de início</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required={!isRecurring}
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
        ) : null}

        {showExcludeWeekendsToggle ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Excluir fins de semana</span>
            <button
              type="button"
              onClick={() => setExcludeWeekends((current) => !current)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                excludeWeekends ? 'bg-accent' : 'bg-[#333333]'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  excludeWeekends ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ) : null}

        {isAddMode ? (
          <ToggleSwitch
            checked={isRecurring}
            onChange={handleRecurringToggle}
            label="Evento recorrente"
          />
        ) : null}

        {isAddMode && isRecurring ? (
          <div>
            <span className="mb-2 block text-sm text-muted">Datas</span>
            <div className="space-y-3">
              {recurringDates.map((entry) => (
                <div key={entry.id} className="flex items-end gap-2">
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-[#888888]">Data de início</span>
                      <input
                        className={fieldClass}
                        style={fieldStyle}
                        type="date"
                        value={entry.startDate}
                        onChange={(e) =>
                          updateRecurringDate(entry.id, 'startDate', e.target.value)
                        }
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-[#888888]">Data de fim</span>
                      <input
                        className={fieldClass}
                        style={fieldStyle}
                        type="date"
                        value={entry.endDate}
                        onChange={(e) => updateRecurringDate(entry.id, 'endDate', e.target.value)}
                        min={entry.startDate || undefined}
                      />
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRecurringDate(entry.id)}
                    disabled={recurringDates.length <= 1}
                    aria-label="Remover data"
                    className="mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-[#888888] disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addRecurringDate}
              className="mt-3 text-sm text-accent"
            >
              + Adicionar data
            </button>

            {recurringError ? (
              <p className="mt-2 text-xs text-danger">{recurringError}</p>
            ) : null}
          </div>
        ) : null}

        {!isRecurring ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (timeExpanded) {
                  setStartTime('')
                  setEndTime('')
                  setScheduleMode('single')
                  setDailySchedules([])
                }
                setTimeExpanded((open) => !open)
              }}
              className="text-sm text-accent"
            >
              {timeExpanded ? '− Remover horário' : '+ Adicionar horário'}
            </button>

            {timeExpanded ? (
              <div className="space-y-3">
                {showMultiDaySchedule ? (
                  <PillToggle
                    options={[
                      { value: 'single', label: 'Horário único' },
                      { value: 'perDay', label: 'Horário por dia' },
                    ]}
                    value={scheduleMode}
                    onChange={handleScheduleModeChange}
                  />
                ) : null}

                {scheduleMode === 'perDay' && showMultiDaySchedule ? (
                  <div className="space-y-3">
                    {dailySchedules.map((row) => (
                      <div key={row.scheduleDate} className="flex items-center gap-2">
                        <span className="w-[5.5rem] shrink-0 text-xs text-[#888888]">
                          {formatScheduleDayLabel(row.scheduleDate)}
                        </span>
                        <input
                          className={`${fieldClass} min-w-0 flex-1 px-2 py-2`}
                          style={fieldStyle}
                          type="time"
                          value={row.startTime}
                          onChange={(e) =>
                            updateDailySchedule(row.scheduleDate, 'startTime', e.target.value)
                          }
                        />
                        <input
                          className={`${fieldClass} min-w-0 flex-1 px-2 py-2`}
                          style={fieldStyle}
                          type="time"
                          value={row.endTime}
                          onChange={(e) =>
                            updateDailySchedule(row.scheduleDate, 'endTime', e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
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
                )}
              </div>
            ) : null}
          </>
        ) : null}

        <section className="space-y-3">
          <span className="block text-sm text-muted">Remuneração</span>

          <PillToggle
            columns={3}
            value={paymentMode}
            onChange={setPaymentMode}
            options={[
              { value: 'daily', label: 'Por dia' },
              { value: 'hourly', label: 'Por hora' },
              { value: 'flat', label: 'Valor total' },
            ]}
          />

          {paymentMode === 'daily' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Dias de trabalho</span>
                  <input
                    className={`${fieldClass} ${excludeWeekends ? 'cursor-not-allowed opacity-50' : ''}`}
                    style={fieldStyle}
                    type="number"
                    min="0"
                    step="1"
                    value={workDays}
                    onChange={(e) => setWorkDays(e.target.value)}
                    disabled={excludeWeekends}
                  />
                  {excludeWeekends ? (
                    <p className="mt-1 text-xs text-[#888888]">
                      Calculado automaticamente (dias úteis)
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Valor/dia</span>
                  <EuroInput value={workRate} onChange={(e) => setWorkRate(e.target.value)} />
                </label>
              </div>

              {showWorkSubtotal ? (
                <p className="text-right text-sm text-accent">
                  Total dias de trabalho: {formatEuro(workSubtotal)}
                </p>
              ) : null}
            </div>
          ) : null}

          {paymentMode === 'hourly' ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Valor/hora</span>
                <EuroInput
                  value={hourlyRatePrimary}
                  onChange={(e) => setHourlyRatePrimary(e.target.value)}
                />
              </label>

              <p className="text-right text-sm text-[#FFC700]">
                {!hasScheduleForHourly ? (
                  <span className="text-xs italic text-[#888888]">
                    Preenche o horário acima para calcular o total
                  </span>
                ) : !hasHourlyPrimaryRate ? (
                  'Total: €—'
                ) : (
                  <>Total: {hourlyModeTotal != null ? formatEuro(hourlyModeTotal) : '€—'}</>
                )}
              </p>
            </div>
          ) : null}

          {paymentMode === 'flat' ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted">Valor total do evento</span>
                <EuroInput value={flatTotal} onChange={(e) => setFlatTotal(e.target.value)} />
              </label>

              {showFlatSubtotal ? (
                <p className="text-right text-sm text-accent">
                  Valor total: {formatEuro(flatSubtotal)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              if (hourlyExpanded) {
                setHourlyRate('')
                setHours('')
              }
              setHourlyExpanded((open) => !open)
            }}
            className="text-sm text-accent"
          >
            {hourlyExpanded ? '− Remover horas extra' : '+ Adicionar horas extra'}
          </button>

          {hourlyExpanded ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Valor/hora</span>
                  <EuroInput value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm text-muted">Horas</span>
                  <input
                    className={fieldClass}
                    style={fieldStyle}
                    type="number"
                    min="0"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </label>
              </div>

              {showHourlyExtraTotal ? (
                <p className="text-xs text-accent">
                  Total horas extra: {formatEuro(hourlyExtraTotal)}
                </p>
              ) : null}
            </div>
          ) : null}

          {showReceivableTotal ? (
            <p className="text-right text-sm font-medium text-accent">
              Total estimado: {formatEuro(receivableTotal)}
            </p>
          ) : null}
        </div>

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
              { value: 'included', label: 'Incluído pelo cliente' },
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
