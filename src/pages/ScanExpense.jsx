import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import heic2any from 'heic2any'
import { useAuth } from '../context/AuthContext.jsx'
import { callAnthropic } from '../lib/anthropicClient.js'
import { supabase } from '../lib/supabaseClient.js'

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-3 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

const captureButtonClass =
  'w-full rounded-xl border py-5 text-base font-medium text-fg transition-opacity active:opacity-80 disabled:opacity-60'

const CATEGORIES = [
  { value: 'alimentação', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alojamento', label: 'Alojamento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]

const RECEIPT_PROMPT =
  'Analisa este recibo e extrai a seguinte informação em JSON: description (string — um resumo muito curto do TIPO de despesa, em poucas palavras, sem incluir o nome do estabelecimento, valores, ou datas — essa informação já é guardada separadamente. Exemplos de bom formato: \'Refeição\', \'Combustível\', \'Material de evento\', \'Estacionamento\', \'Bilhetes de transporte\'. NÃO listes os itens individuais do recibo, NÃO incluas o nome do restaurante/loja, NÃO incluas valores ou datas no texto.), amount (number, total amount paid), date (string, YYYY-MM-DD format), category (one of: alimentação, transporte, alojamento, equipamento, outro).\nResponde APENAS com JSON válido, sem texto adicional.'

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

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseJsonFromAiText(text) {
  const trimmed = String(text ?? '').trim()
  const jsonMatch = trimmed.match(/(\{[\s\S]*\})/)
  if (!jsonMatch) throw new Error('Resposta inválida da IA.')
  return JSON.parse(jsonMatch[1])
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = String(result).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function isHeicFile(file) {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  )
}

async function convertHeicToJpeg(file) {
  const convertedBlob = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.8,
  })

  const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob
  const fileName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg')

  return new File([blob], fileName.endsWith('.jpg') ? fileName : `${fileName}.jpg`, {
    type: 'image/jpeg',
  })
}

function escapeIlike(value) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function formatJobDate(startDate) {
  if (!startDate) return ''
  const date = new Date(`${startDate}T00:00:00`)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function JobComboField({
  userId,
  selectedJob,
  skipAssignment,
  onSelectJob,
  onClearJob,
  onSkipAssignment,
}) {
  const containerRef = useRef(null)
  const [inputValue, setInputValue] = useState('')
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
    if (!dropdownOpen || selectedJob || skipAssignment || !userId) {
      setSearchResults([])
      setSearching(false)
      return undefined
    }

    let active = true
    setSearching(true)

    async function fetchJobs() {
      let query = supabase
        .from('staff_app_jobs')
        .select('id, event_name, start_date')
        .eq('staff_app_user_id', userId)
        .order('start_date', { ascending: false })
        .limit(5)

      if (debouncedQuery) {
        query = query.ilike('event_name', `%${escapeIlike(debouncedQuery)}%`)
      }

      const { data, error } = await query

      if (!active) return

      setSearchResults(error ? [] : data ?? [])
      setSearching(false)
    }

    fetchJobs()

    return () => {
      active = false
    }
  }, [debouncedQuery, dropdownOpen, selectedJob, skipAssignment, userId])

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

  const showDropdown =
    dropdownOpen &&
    !selectedJob &&
    !skipAssignment &&
    (searching || searchResults.length > 0 || debouncedQuery.length > 0)

  function handleSelect(job) {
    onSelectJob(job)
    setInputValue(job.event_name)
    setDropdownOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={fieldClass}
        style={fieldStyle}
        type="text"
        placeholder="Pesquisar trabalho..."
        value={selectedJob ? selectedJob.event_name : inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          setDropdownOpen(true)
        }}
        onFocus={() => {
          if (!selectedJob && !skipAssignment) setDropdownOpen(true)
        }}
        disabled={Boolean(selectedJob) || skipAssignment}
        autoComplete="off"
      />

      {selectedJob ? (
        <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-xs text-accent">
          <span className="truncate">
            {selectedJob.event_name}
            {selectedJob.start_date ? ` · ${formatJobDate(selectedJob.start_date)}` : ''}
          </span>
          <button
            type="button"
            onClick={onClearJob}
            aria-label="Remover trabalho"
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

          {!searching && searchResults.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#888888]">Nenhum trabalho encontrado.</p>
          ) : (
            searchResults.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => handleSelect(job)}
                className="block w-full border-b px-3 py-2.5 text-left last:border-b-0 active:bg-[#1A1A1A]"
                style={{ borderColor: '#222222' }}
              >
                <p className="text-sm text-fg">{job.event_name}</p>
                {job.start_date ? (
                  <p className="mt-0.5 text-xs text-[#888888]">{formatJobDate(job.start_date)}</p>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onSkipAssignment}
        className="mt-2 text-sm text-[#888888] underline"
      >
        Selecionar trabalho depois
      </button>
    </div>
  )
}

export default function ScanExpense() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  const [phase, setPhase] = useState('capture')
  const [receiptFile, setReceiptFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [converting, setConverting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('alimentação')
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [selectedJob, setSelectedJob] = useState(null)
  const [skipJobAssignment, setSkipJobAssignment] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function navigateAway() {
    if (location.state?.from) {
      navigate(location.state.from, { replace: true })
      return
    }
    navigate('/financeiro', { replace: true, state: { tab: 'despesas' } })
  }

  async function handleImageSelected(file) {
    setScanError('')
    setConverting(true)

    try {
      let imageFile = file
      if (isHeicFile(file)) {
        imageFile = await convertHeicToJpeg(file)
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl)

      setReceiptFile(imageFile)
      setPreviewUrl(URL.createObjectURL(imageFile))
      setPhase('preview')
    } catch {
      setScanError('Não foi possível processar esta imagem. Tenta outra foto.')
    } finally {
      setConverting(false)
    }
  }

  function handleCameraChange(e) {
    const file = e.target.files?.[0]
    if (file) handleImageSelected(file)
    e.target.value = ''
  }

  async function handleAnalyzeReceipt() {
    if (!receiptFile) return

    setScanning(true)
    setScanError('')

    try {
      const wasHeic = isHeicFile(receiptFile)
      const base64 = await fileToBase64(receiptFile)
      const mediaType =
        receiptFile.type === 'image/png'
          ? 'image/png'
          : wasHeic || receiptFile.type === 'image/jpeg'
            ? 'image/jpeg'
            : 'image/jpeg'

      const responseText = await callAnthropic({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              { type: 'text', text: RECEIPT_PROMPT },
            ],
          },
        ],
      })

      const parsed = parseJsonFromAiText(responseText)

      if (parsed.description) setDescription(String(parsed.description))
      if (parsed.amount != null) setAmount(String(parsed.amount))
      if (parsed.date) setExpenseDate(parsed.date)
      if (parsed.category && CATEGORIES.some((c) => c.value === parsed.category)) {
        setCategory(parsed.category)
      }

      setPhase('review')
    } catch {
      setScanError('Não foi possível analisar o recibo.')
    } finally {
      setScanning(false)
    }
  }

  async function uploadReceipt(expenseId, file) {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${expenseId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('staff-receipts')
      .upload(path, file, { upsert: false })

    if (uploadError) throw uploadError

    return path
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!user?.id) return

    setError('')
    setBusy(true)

    try {
      const jobId = skipJobAssignment || !selectedJob ? null : selectedJob.id

      const { data: expense, error: insertError } = await supabase
        .from('staff_app_expenses')
        .insert({
          staff_app_user_id: user.id,
          job_id: jobId,
          description: description.trim(),
          amount: parseFloat(amount),
          category,
          expense_date: expenseDate,
          receipt_url: null,
          reimbursed: false,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      if (receiptFile) {
        try {
          const receiptUrl = await uploadReceipt(expense.id, receiptFile)
          await supabase
            .from('staff_app_expenses')
            .update({ receipt_url: receiptUrl })
            .eq('id', expense.id)
        } catch {
          // Expense saved; receipt upload failed silently
        }
      }

      navigateAway()
    } catch (err) {
      setError(err.message || 'Não foi possível guardar a despesa.')
    } finally {
      setBusy(false)
    }
  }

  function handleSelectJob(job) {
    setSelectedJob(job)
    setSkipJobAssignment(false)
  }

  function handleClearJob() {
    setSelectedJob(null)
  }

  function handleSkipAssignment() {
    setSelectedJob(null)
    setSkipJobAssignment(true)
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-app">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={navigateAway}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Digitalizar recibo</h1>
      </header>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCameraChange}
      />

      {phase === 'capture' ? (
        <div className="flex flex-col px-4 pb-12 pt-8">
          <div className="mx-auto w-full max-w-md space-y-3">
            <button
              type="button"
              disabled={converting}
              onClick={() => cameraInputRef.current?.click()}
              className={captureButtonClass}
              style={{ backgroundColor: '#1A1A1A', borderColor: '#333333' }}
            >
              {converting ? 'A processar imagem…' : '📷 Tirar foto'}
            </button>

            <button
              type="button"
              disabled={converting}
              onClick={() => galleryInputRef.current?.click()}
              className={`${captureButtonClass} py-3 text-sm`}
              style={{ backgroundColor: '#1A1A1A', borderColor: '#333333' }}
            >
              🖼 Escolher da galeria
            </button>
          </div>

          {scanError ? <p className="mt-4 text-center text-sm text-danger">{scanError}</p> : null}
        </div>
      ) : null}

      {phase === 'preview' ? (
        <div className="flex flex-col px-4 pb-12">
          {previewUrl ? (
            <div className="mb-4 overflow-hidden rounded-xl border" style={{ borderColor: '#333333' }}>
              <img src={previewUrl} alt="Pré-visualização do recibo" className="max-h-64 w-full object-contain bg-[#141414]" />
            </div>
          ) : null}

          <button
            type="button"
            disabled={scanning || converting || !receiptFile}
            onClick={handleAnalyzeReceipt}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#A855F7' }}
          >
            {scanning ? 'A analisar recibo…' : '✨ Analisar recibo'}
          </button>

          {scanning ? (
            <p className="mt-2 text-center text-xs text-[#888888]">A analisar recibo…</p>
          ) : null}
          {scanError ? <p className="mt-2 text-center text-sm text-danger">{scanError}</p> : null}

          <button
            type="button"
            onClick={() => {
              setPhase('capture')
              setReceiptFile(null)
              if (previewUrl) URL.revokeObjectURL(previewUrl)
              setPreviewUrl(null)
              setScanError('')
            }}
            className="mt-4 text-center text-sm text-[#888888] underline"
          >
            Escolher outra imagem
          </button>
        </div>
      ) : null}

      {phase === 'review' ? (
        <form onSubmit={handleSubmit} className="flex flex-col px-4 pb-12">
          {previewUrl ? (
            <div className="mb-4 overflow-hidden rounded-xl border" style={{ borderColor: '#333333' }}>
              <img src={previewUrl} alt="Recibo" className="max-h-32 w-full object-contain bg-[#141414]" />
            </div>
          ) : null}

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Descrição</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                  className={`${fieldClass} pl-7`}
                  style={fieldStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </label>

            <div>
              <span className="mb-1.5 block text-sm text-muted">Categoria</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      category === option.value
                        ? 'bg-accent text-[#000000]'
                        : 'bg-[#222222] text-[#888888]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Data</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </label>

            <div>
              <span className="mb-1.5 block text-sm text-muted">Trabalho</span>
              <JobComboField
                userId={user?.id}
                selectedJob={selectedJob}
                skipAssignment={skipJobAssignment}
                onSelectJob={handleSelectJob}
                onClearJob={handleClearJob}
                onSkipAssignment={handleSkipAssignment}
              />
              {skipJobAssignment ? (
                <p className="mt-1 text-xs text-[#888888]">A despesa ficará por atribuir a um trabalho.</p>
              ) : null}
            </div>

            {error ? <div className="ds-alert-danger">{error}</div> : null}
          </div>

          <button type="submit" disabled={busy} className="ds-btn-primary mt-6 w-full">
            {busy ? 'A guardar…' : 'Guardar despesa'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
