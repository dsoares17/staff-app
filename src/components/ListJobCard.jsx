import { useContext, useState } from 'react'
import { formatEuro, roundMoney } from '../lib/money.js'
import { ValuesHiddenContext, MONEY_MASK } from '../context/ValuesHiddenContext.js'
import {
  formatDateRange,
  formatTimeRange,
  getJobPayment,
  getJobTotal,
  getWeekdayAbbrev,
  STATUS_DOT_COLORS,
  todayISO,
} from '../lib/jobUtils.js'
import { supabase } from '../lib/supabaseClient.js'

const PAYMENT_STATUS_CONFIG = {
  por_faturar: { label: 'Por faturar', bg: '#222222', text: '#888888' },
  faturado: { label: 'Faturado', bg: 'rgba(91, 141, 239, 0.2)', text: '#5B8DEF' },
  pago: { label: 'Pago', bg: 'rgba(0, 255, 135, 0.2)', text: '#00FF87' },
  em_atraso: { label: 'Em atraso', bg: 'rgba(255, 68, 68, 0.2)', text: '#FF4444' },
}

export function PaymentStatusBadge({ status }) {
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

function ChevronDownIcon({ expanded }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 text-[#444444] transition-transform ${
        expanded ? 'rotate-180' : ''
      }`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function ListJobCard({
  job,
  isTodaySection,
  onNavigate,
  onPaymentUpdated,
  showPaymentBadge = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const [updatingPayment, setUpdatingPayment] = useState(false)

  const today = todayISO()
  const startDate = job.start_date
  const dayNumber = startDate ? new Date(`${startDate}T00:00:00`).getDate() : '—'
  const weekdayAbbrev = getWeekdayAbbrev(startDate)
  const highlightDateBlock = isTodaySection
  const total = getJobTotal(job)
  const valuesHidden = useContext(ValuesHiddenContext)
  const totalLabel =
    total != null ? (valuesHidden ? MONEY_MASK : formatEuro(total)) : null
  const payment = getJobPayment(job)
  const timeLabel = formatTimeRange(job.start_time, job.end_time)
  const compactTimeLabel = job.start_time ? timeLabel : null
  const dateRange = formatDateRange(job.start_date, job.end_date)
  const statusDotColor = STATUS_DOT_COLORS[job.status] ?? STATUS_DOT_COLORS.pending
  const isCancelled = job.status === 'cancelled'

  async function handlePaymentUpdate(patch) {
    if (!payment?.id || updatingPayment) return

    setUpdatingPayment(true)
    const { error } = await supabase
      .from('staff_app_payments')
      .update(patch)
      .eq('id', payment.id)

    setUpdatingPayment(false)

    if (!error) {
      onPaymentUpdated(payment.id, patch)
    }
  }

  function handleMarkAsFaturado(event) {
    event.stopPropagation()
    handlePaymentUpdate({ status: 'faturado', invoice_date: today })
  }

  function handleMarkAsPago(event) {
    event.stopPropagation()
    handlePaymentUpdate({
      status: 'pago',
      paid_at: new Date().toISOString(),
      paid_amount: roundMoney(payment?.expected_amount),
    })
  }

  function handleVerDetalhes(event) {
    event.stopPropagation()
    onNavigate(job.id)
  }

  return (
    <div
      className={`mx-4 mb-2 rounded-xl bg-[#141414] p-3 ${
        isTodaySection ? 'border-l-2 border-[#FFC700]' : ''
      } ${isCancelled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full min-h-[56px] items-center text-left active:opacity-80"
      >
        <div
          className={`flex w-12 shrink-0 flex-col items-center justify-center ${
            highlightDateBlock ? 'rounded-lg bg-[#FFC700] px-1 py-1' : ''
          }`}
        >
          <span
            className={`text-[10px] uppercase ${
              highlightDateBlock ? 'text-black' : 'text-[#888888]'
            }`}
          >
            {weekdayAbbrev}
          </span>
          <span
            className={`text-base font-bold ${
              highlightDateBlock ? 'text-black' : 'text-white'
            }`}
          >
            {dayNumber}
          </span>
        </div>

        <div className="min-w-0 flex-1 px-3">
          <p className="truncate text-sm font-semibold text-white">{job.event_name}</p>
          {job.organiser_name ? (
            <p className="truncate text-xs text-[#888888]">{job.organiser_name}</p>
          ) : null}
          {compactTimeLabel ? (
            <p className="truncate text-xs text-[#888888]">{compactTimeLabel}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusDotColor }}
          />
          {totalLabel ? (
            <span className="text-sm font-medium text-[#FFC700]">{totalLabel}</span>
          ) : null}
          {showPaymentBadge && payment?.status ? (
            <PaymentStatusBadge status={payment.status} />
          ) : null}
        </div>

        <div className="ml-2 flex shrink-0 items-center self-center">
          <ChevronDownIcon expanded={expanded} />
        </div>
      </button>

      {expanded ? (
        <div className="px-2">
          <div className="mb-3 mt-2 border-t border-[#222222]" />

          <div className="space-y-2">
            {job.role ? (
              <div>
                <p className="text-xs text-[#888888]">Função</p>
                <p className="text-sm text-white">{job.role}</p>
              </div>
            ) : null}

            {job.location ? (
              <div>
                <p className="text-xs text-[#888888]">Localização</p>
                <p className="text-sm text-white">{job.location}</p>
              </div>
            ) : null}

            {dateRange ? (
              <div>
                <p className="text-xs text-[#888888]">Datas completas</p>
                <p className="text-sm text-white">{dateRange}</p>
              </div>
            ) : null}

            {timeLabel ? (
              <div>
                <p className="text-xs text-[#888888]">Horário</p>
                <p className="text-sm text-white">{timeLabel}</p>
              </div>
            ) : null}
          </div>

          {payment?.status ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!showPaymentBadge ? (
                <PaymentStatusBadge status={payment.status} />
              ) : null}

              {payment.status === 'por_faturar' ? (
                <button
                  type="button"
                  onClick={handleMarkAsFaturado}
                  disabled={updatingPayment}
                  className="rounded-lg bg-[#FFC700] px-3 py-1 text-xs font-medium text-black disabled:opacity-60"
                >
                  Marcar como faturado
                </button>
              ) : null}

              {payment.status === 'faturado' ? (
                <button
                  type="button"
                  onClick={handleMarkAsPago}
                  disabled={updatingPayment}
                  className="rounded-lg bg-[#FFC700] px-3 py-1 text-xs font-medium text-black disabled:opacity-60"
                >
                  Marcar como pago
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleVerDetalhes}
            className="mt-3 block w-full text-right text-xs text-[#888888] active:opacity-80"
          >
            Ver detalhes →
          </button>
        </div>
      ) : null}
    </div>
  )
}
