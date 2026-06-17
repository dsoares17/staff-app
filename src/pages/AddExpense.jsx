import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import heic2any from 'heic2any'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

const fieldClass =
  'w-full rounded-lg border bg-surface px-3 py-3 text-sm text-fg outline-none transition focus:border-accent'
const fieldStyle = { borderColor: 'var(--color-border)' }

const CATEGORIES = [
  { value: 'alimentação', label: 'Alimentação' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'alojamento', label: 'Alojamento' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]

const RECEIPT_PROMPT =
  'Analisa este recibo e extrai a seguinte informação em JSON: description (string — um resumo muito curto do TIPO de despesa, em poucas palavras, sem incluir o nome do estabelecimento, valores, ou datas — essa informação já é guardada separadamente. Exemplos de bom formato: \'Refeição\', \'Combustível\', \'Material de evento\', \'Estacionamento\', \'Bilhetes de transporte\'. NÃO listes os itens individuais do recibo, NÃO incluas o nome do restaurante/loja, NÃO incluas valores ou datas no texto.), amount (number, total amount paid), date (string, YYYY-MM-DD format), category (one of: alimentação, transporte, alojamento, equipamento, outro).\nResponde APENAS com JSON válido, sem texto adicional.'

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

export default function AddExpense() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetJobId = searchParams.get('jobId')
  const scannerInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState(presetJobId ?? '')
  const [lockedJobName, setLockedJobName] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('alimentação')
  const [expenseDate, setExpenseDate] = useState(todayISO())
  const [receiptFile, setReceiptFile] = useState(null)
  const [converting, setConverting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanSuccess, setScanSuccess] = useState(false)
  const [scanError, setScanError] = useState('')
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
    if (!user?.id) return undefined

    async function fetchJobs() {
      const { data } = await supabase
        .from('staff_app_jobs')
        .select('id, event_name')
        .eq('staff_app_user_id', user.id)
        .order('start_date', { ascending: false })

      setJobs(data ?? [])

      if (presetJobId) {
        setJobId(presetJobId)
        const found = (data ?? []).find((job) => job.id === presetJobId)
        if (found) {
          setLockedJobName(found.event_name)
        } else {
          const { data: singleJob } = await supabase
            .from('staff_app_jobs')
            .select('event_name')
            .eq('id', presetJobId)
            .maybeSingle()

          setLockedJobName(singleJob?.event_name ?? '')
        }
      }
    }

    fetchJobs()
  }, [user?.id, presetJobId])

  async function handleScanReceipt(file) {
    setScanning(true)
    setConverting(false)
    setScanSuccess(false)
    setScanError('')

    try {
      let imageFile = file
      const wasHeic = isHeicFile(file)

      if (wasHeic) {
        setConverting(true)
        try {
          imageFile = await convertHeicToJpeg(file)
        } catch {
          setScanError('Não foi possível processar esta imagem. Tenta outra foto.')
          return
        } finally {
          setConverting(false)
        }
      }

      setReceiptFile(imageFile)

      const base64 = await fileToBase64(imageFile)
      const mediaType = wasHeic ? 'image/jpeg' : imageFile.type === 'image/png' ? 'image/png' : 'image/jpeg'

      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
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
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error?.message || 'Pedido à IA falhou.')
      }

      const textBlock = body?.content?.find((block) => block.type === 'text')
      const parsed = parseJsonFromAiText(textBlock?.text)

      if (parsed.description) setDescription(String(parsed.description))
      if (parsed.amount != null) setAmount(String(parsed.amount))
      if (parsed.date) setExpenseDate(parsed.date)
      if (parsed.category && CATEGORIES.some((c) => c.value === parsed.category)) {
        setCategory(parsed.category)
      }

      setScanSuccess(true)
    } catch {
      setScanError('Não foi possível analisar o recibo.')
    } finally {
      setScanning(false)
    }
  }

  function handleScannerChange(e) {
    const file = e.target.files?.[0]
    if (file) handleScanReceipt(file)
    e.target.value = ''
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
    if (!user?.id || !jobId) return

    setError('')
    setBusy(true)

    try {
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

      navigate('/expenses', { replace: true })
    } catch (err) {
      setError(err.message || 'Não foi possível guardar a despesa.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-app">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/expenses')}
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
        <h1 className="text-xl font-semibold">Adicionar despesa</h1>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col px-4 pb-12">
        <div className="space-y-4">
          {presetJobId ? (
            <p className="text-sm text-fg">
              Trabalho: {lockedJobName || '…'}
            </p>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">Trabalho</span>
              <select
                className={fieldClass}
                style={fieldStyle}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                required
              >
                <option value="">Selecionar trabalho</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.event_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <input
              ref={scannerInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScannerChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScannerChange}
            />
            <button
              type="button"
              disabled={scanning || converting}
              onClick={() => scannerInputRef.current?.click()}
              className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#A855F7' }}
            >
              {converting
                ? 'A converter imagem…'
                : scanning
                  ? 'A analisar recibo…'
                  : '✨ Digitalizar recibo'}
            </button>
            <button
              type="button"
              disabled={scanning || converting}
              onClick={() => galleryInputRef.current?.click()}
              className="mt-2 w-full text-center text-xs text-[#888888] underline disabled:opacity-60"
            >
              Escolher da galeria
            </button>
            {converting ? (
              <p className="mt-2 text-center text-xs text-[#888888]">A converter imagem…</p>
            ) : scanning ? (
              <p className="mt-2 text-center text-xs text-[#888888]">A analisar recibo…</p>
            ) : null}
            {scanSuccess ? (
              <p className="mt-2 text-center text-xs text-accent">
                Recibo analisado com sucesso ✓
              </p>
            ) : null}
            {scanError ? (
              <p className="mt-2 text-center text-xs text-danger">{scanError}</p>
            ) : null}
          </div>

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

          {error ? <div className="ds-alert-danger">{error}</div> : null}
        </div>

        <button type="submit" disabled={busy} className="ds-btn-primary mt-6 w-full">
          {busy ? 'A guardar…' : 'Guardar despesa'}
        </button>
      </form>
    </div>
  )
}
