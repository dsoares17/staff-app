import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import heic2any from 'heic2any'
import * as XLSX from 'xlsx'
import { callAnthropic } from '../lib/anthropicClient.js'

const CURRENT_YEAR = new Date().getFullYear()
const AI_PURPLE = '#A855F7'

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

function buildImportPrompt(text) {
  return `Analisa o seguinte texto que contém informação sobre trabalhos/eventos de um freelancer de eventos. Extrai cada trabalho mencionado e devolve um array JSON com esta estrutura para cada trabalho:
{
  event_name: string,
  organiser_name: string ou null,
  role: string ou null,
  location: string ou null,
  start_date: string formato YYYY-MM-DD,
  end_date: string formato YYYY-MM-DD ou null se for o mesmo dia,
  payment_mode: 'daily' ou 'flat',
  rate: number (valor por dia se payment_mode for 'daily', ou valor total se for 'flat'),
  notes: string ou null
}

REGRAS IMPORTANTES:
- Se o valor mencionado tiver indicação explícita de ser por dia (ex: '140/dia', '140 por dia', '140€ diários'), usa payment_mode 'daily'.
- Se não houver indicação explícita de ser por dia, assume payment_mode 'flat' (valor total do trabalho).
- Se não conseguires determinar uma data específica, usa null nesse campo e não inventes datas.
- O ano atual é ${CURRENT_YEAR}. Se não houver ano mencionado no texto, assume o ano atual.
- Não inventes informação que não esteja no texto.

Texto a analisar:
${text}

Responde APENAS com o array JSON, sem texto adicional, sem markdown.`
}

function buildFileImportPrompt(text) {
  return `Analisa o seguinte texto exportado de um ficheiro Excel ou CSV com informação sobre trabalhos/eventos de um freelancer de eventos. Extrai cada trabalho mencionado e devolve um array JSON com esta estrutura para cada trabalho:
{
  event_name: string,
  organiser_name: string ou null,
  role: string ou null,
  location: string ou null,
  start_date: string formato YYYY-MM-DD,
  end_date: string formato YYYY-MM-DD ou null se for o mesmo dia,
  payment_mode: 'daily' ou 'flat',
  rate: number ou null,
  payment_status: 'pago' | 'por_faturar' | 'em_atraso' | null,
  notes: string ou null
}

REGRAS IMPORTANTES:
- Se o valor mencionado tiver indicação explícita de ser por dia (ex: '140/dia', '140 por dia', '140€ diários'), usa payment_mode 'daily'.
- Se não houver indicação explícita de ser por dia, assume payment_mode 'flat' (valor total do trabalho).
- Se não conseguires determinar uma data específica, usa null nesse campo e não inventes datas.
- O ano atual é ${CURRENT_YEAR}. Se não houver ano mencionado no texto, assume o ano atual.
- Não inventes informação que não esteja no texto.
- Extrai payment_status quando o ficheiro indicar estado de pagamento:
  - "pago" → 'pago'
  - "por pagar" → 'em_atraso'
  - "por faturar" → 'por_faturar'
  - "por confirmar" → null (trabalho ainda por confirmar)
  - Se não houver informação de estado → null

Texto a analisar:
${text}

Responde APENAS com o array JSON, sem texto adicional, sem markdown.`
}

function buildPhotoImportPrompt() {
  return `Esta imagem mostra uma agenda, calendário, notas ou horário de trabalhos de um freelancer de eventos (pode ser um print de uma app de notas, calendário do telemóvel, ou papel escrito à mão). Analisa a imagem e extrai cada trabalho/evento mencionado. Devolve um array JSON com esta estrutura para cada trabalho:
{
  event_name: string,
  organiser_name: string ou null,
  role: string ou null,
  location: string ou null,
  start_date: string formato YYYY-MM-DD,
  end_date: string formato YYYY-MM-DD ou null,
  payment_mode: 'daily' ou 'flat',
  rate: number ou null,
  notes: string ou null
}

REGRAS IMPORTANTES:
- Se o valor mencionado tiver indicação explícita de ser por dia, usa payment_mode 'daily'. Caso contrário, assume 'flat'.
- Se não conseguires ler uma data ou valor com confiança, usa null nesse campo — não inventes informação.
- O ano atual é ${CURRENT_YEAR}. Se não houver ano visível na imagem, assume o ano atual.
- Se a imagem não contiver informação relevante sobre trabalhos/eventos, devolve um array vazio [].

Responde APENAS com o array JSON, sem texto adicional, sem markdown.`
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

function parseJsonArrayFromAiText(text, { debug = false } = {}) {
  let cleaned = String(text ?? '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '')
    .trim()

  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')

  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    throw new Error('Resposta inválida da IA.')
  }

  cleaned = cleaned.slice(firstBracket, lastBracket + 1).trim()

  if (debug) {
    console.log('=== CLEANED TEXT START ===')
    console.log(cleaned)
    console.log('=== CLEANED TEXT END ===')
    console.log('Cleaned JSON (first 200 chars):', cleaned.slice(0, 200))
    console.log('Cleaned JSON (last 200 chars):', cleaned.slice(-200))
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) throw new Error('Resposta inválida da IA.')
    return parsed
  } catch (err) {
    if (debug) {
      console.error('JSON.parse failed. Full cleaned string:', cleaned)
    }
    throw err
  }
}

function getDateYear(dateStr) {
  if (!dateStr) return null
  const year = Number(String(dateStr).slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function getOtherYearJobs(jobs) {
  return jobs.filter((job) => {
    const year = getDateYear(job.start_date)
    return year != null && year !== CURRENT_YEAR
  })
}

function formatOtherYearLabel(jobs) {
  const years = [
    ...new Set(
      getOtherYearJobs(jobs)
        .map((job) => getDateYear(job.start_date))
        .filter((year) => year != null)
    ),
  ]

  if (years.length === 1) return `de ${years[0]}`
  return 'de outros anos'
}

function formatCellValue(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    return value.toLocaleDateString('pt-PT')
  }
  return String(value).trim()
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function formatPastYearsList(years) {
  if (years.length === 0) return ''
  if (years.length === 1) return String(years[0])
  if (years.length === 2) return `${years[0]} e ${years[1]}`
  return `${years.slice(0, -1).join(', ')} e ${years[years.length - 1]}`
}

function findDateColumnIndexes(headers) {
  const keywords = ['data', 'date', 'início', 'inicio', 'fim', 'end', 'dia']

  return headers
    .map((header, index) => {
      const lower = String(header).toLowerCase()
      return keywords.some((keyword) => lower.includes(keyword)) ? index : -1
    })
    .filter((index) => index >= 0)
}

function extractYearsFromCellValue(value) {
  const text = formatCellValue(value)
  const matches = text.match(/\b(20\d{2})\b/g)
  if (!matches) return []
  return matches.map(Number)
}

function normalizeSpreadsheetRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('empty')
  }

  const normalizedRows = rows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [row]
      return cells.map(formatCellValue)
    })
    .filter((cells) => cells.some((cell) => cell.length > 0))

  if (normalizedRows.length === 0) {
    throw new Error('empty')
  }

  return normalizedRows
}

function formatRowsToText(normalizedRows) {
  const [headerRow, ...dataRows] = normalizedRows
  const headers = headerRow.map((header, index) => header || `Coluna ${index + 1}`)
  const hasStructuredHeaders = dataRows.length > 0 && headers.some((header) => header.length > 0)

  if (hasStructuredHeaders) {
    const lines = dataRows
      .map((cells) =>
        headers
          .map((header, index) => {
            const value = cells[index] ?? ''
            if (!value) return null
            return `${header}: ${value}`
          })
          .filter(Boolean)
          .join(' | ')
      )
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      throw new Error('empty')
    }

    return lines.join('\n')
  }

  const lines = normalizedRows
    .map((cells) => cells.filter(Boolean).join(' | '))
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    throw new Error('empty')
  }

  return lines.join('\n')
}

function getPastYearsFromRows(normalizedRows) {
  if (normalizedRows.length < 2) return []

  const [headerRow, ...dataRows] = normalizedRows
  const headers = headerRow.map((header, index) => header || `Coluna ${index + 1}`)
  const dateIndexes = findDateColumnIndexes(headers)
  const columnsToScan =
    dateIndexes.length > 0 ? dateIndexes : headers.map((_, index) => index)

  const years = new Set()

  for (const row of dataRows) {
    for (const index of columnsToScan) {
      for (const year of extractYearsFromCellValue(row[index])) {
        years.add(year)
      }
    }
  }

  return [...years].filter((year) => year !== CURRENT_YEAR).sort((a, b) => a - b)
}

function filterRowsToCurrentYear(normalizedRows) {
  const [headerRow, ...dataRows] = normalizedRows
  const headers = headerRow.map((header, index) => header || `Coluna ${index + 1}`)
  const dateIndexes = findDateColumnIndexes(headers)
  const columnsToCheck =
    dateIndexes.length > 0 ? dateIndexes : headers.map((_, index) => index)

  const filteredData = dataRows.filter((row) =>
    columnsToCheck.some((index) =>
      new RegExp(`\\b${CURRENT_YEAR}\\b`).test(formatCellValue(row[index]))
    )
  )

  if (filteredData.length === 0) {
    throw new Error('no-current-year-rows')
  }

  return [headerRow, ...filteredData]
}

function formatStructuredSpreadsheetRows(rows) {
  return formatRowsToText(normalizeSpreadsheetRows(rows))
}

async function readSpreadsheetRows(file) {
  let workbook

  if (file.name.toLowerCase().endsWith('.csv')) {
    const csvText = await readFileAsText(file)
    console.log('File read successfully, size:', csvText.length)
    workbook = XLSX.read(csvText, { type: 'string' })
  } else {
    const buffer = await file.arrayBuffer()
    console.log('File read successfully, size:', buffer.byteLength)
    workbook = XLSX.read(buffer, { type: 'array' })
  }

  console.log('XLSX parsed, sheets:', workbook.SheetNames)

  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('empty')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  return normalizeSpreadsheetRows(rows)
}

export default function ImportJobs() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const [inputMode, setInputMode] = useState('text')
  const [pastedText, setPastedText] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageWasHeic, setImageWasHeic] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null)
  const [convertingImage, setConvertingImage] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [pendingResults, setPendingResults] = useState(null)
  const [yearGateOpen, setYearGateOpen] = useState(false)
  const [fileYearGateOpen, setFileYearGateOpen] = useState(false)
  const [pendingFileRows, setPendingFileRows] = useState(null)
  const [detectedPastYears, setDetectedPastYears] = useState([])

  const otherYearJobs = useMemo(
    () => (pendingResults ? getOtherYearJobs(pendingResults) : []),
    [pendingResults]
  )

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  function setImagePreview(file) {
    setImagePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
  }

  function proceedToReview(results) {
    navigate('/jobs/import/review', { state: { jobs: results } })
    setPendingResults(null)
    setYearGateOpen(false)
  }

  function handleYearGateChoice(includeOtherYears) {
    if (!pendingResults) return

    const finalResults = includeOtherYears
      ? pendingResults
      : pendingResults.filter((job) => {
          const year = getDateYear(job.start_date)
          return year == null || year === CURRENT_YEAR
        })

    proceedToReview(finalResults)
  }

  function openYearGateOrProceed(results) {
    if (getOtherYearJobs(results).length > 0) {
      setPendingResults(results)
      setYearGateOpen(true)
      return
    }

    proceedToReview(results)
  }

  async function analyzeImportedText(text) {
    const responseText = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: buildImportPrompt(text) }],
        },
      ],
    })

    const parsed = parseJsonArrayFromAiText(responseText)

    if (parsed.length === 0) {
      throw new Error('Nenhum trabalho encontrado.')
    }

    return parsed
  }

  async function analyzeImportedFile(text, { maxTokens = 4096 } = {}) {
    console.log('Filtered text representation length:', text.length)

    const responseText = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: buildFileImportPrompt(text) }],
        },
      ],
    })

    console.log('AI response received, length:', responseText.length)
    console.log('=== RAW AI RESPONSE START ===')
    console.log(responseText)
    console.log('=== RAW AI RESPONSE END ===')

    const parsed = parseJsonArrayFromAiText(responseText, { debug: true })

    console.log('JSON parsed, items:', parsed.length)

    if (parsed.length === 0) {
      throw new Error('Nenhum trabalho encontrado.')
    }

    return parsed
  }

  async function runFileImportWithRows(rows, { includeAllYears, filterToCurrentYear = false }) {
    const rowsToSend = filterToCurrentYear ? filterRowsToCurrentYear(rows) : rows
    const flattenedText = formatRowsToText(rowsToSend)
    console.log('Text representation (first 500 chars):', flattenedText.slice(0, 500))

    const maxTokens = includeAllYears ? 8192 : 4096
    const parsed = await analyzeImportedFile(flattenedText, { maxTokens })
    proceedToReview(parsed)
  }

  async function handleFileYearGateChoice(includeAllYears) {
    if (!pendingFileRows) return

    setFileYearGateOpen(false)
    setError('')
    setAnalyzing(true)

    try {
      await runFileImportWithRows(pendingFileRows, {
        includeAllYears,
        filterToCurrentYear: !includeAllYears,
      })
    } catch (err) {
      console.error('Import error:', err)
      if (err?.message === 'no-current-year-rows') {
        setError(`Não foram encontrados trabalhos de ${CURRENT_YEAR} no ficheiro.`)
      } else {
        setError(
          'Não foi possível processar o texto. Tenta reformular ou adiciona os trabalhos manualmente.'
        )
      }
    } finally {
      setAnalyzing(false)
      setPendingFileRows(null)
      setDetectedPastYears([])
    }
  }

  async function analyzeImportedImage(imageFile, wasHeic) {
    const base64 = await fileToBase64(imageFile)
    const mediaType = wasHeic
      ? 'image/jpeg'
      : imageFile.type === 'image/png'
        ? 'image/png'
        : 'image/jpeg'

    const responseText = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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
            { type: 'text', text: buildPhotoImportPrompt() },
          ],
        },
      ],
    })

    return parseJsonArrayFromAiText(responseText)
  }

  async function handleAnalyzeText() {
    const text = pastedText.trim()
    if (!text || analyzing) return

    setError('')
    setAnalyzing(true)

    try {
      const parsed = await analyzeImportedText(text)
      openYearGateOrProceed(parsed)
    } catch {
      setError(
        'Não foi possível processar o texto. Tenta reformular ou adiciona os trabalhos manualmente.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setError('')
    e.target.value = ''
  }

  async function handleAnalyzeFile() {
    if (!selectedFile || analyzing) return

    setError('')
    setAnalyzing(true)

    try {
      let rows

      try {
        rows = await readSpreadsheetRows(selectedFile)
      } catch {
        setError('Não foi possível ler o ficheiro. Verifica o formato e tenta novamente.')
        return
      }

      const pastYears = getPastYearsFromRows(rows)

      if (pastYears.length > 0) {
        setPendingFileRows(rows)
        setDetectedPastYears(pastYears)
        setFileYearGateOpen(true)
        return
      }

      await runFileImportWithRows(rows, { includeAllYears: false, filterToCurrentYear: false })
    } catch (err) {
      console.error('Import error:', err)
      setError(
        'Não foi possível processar o texto. Tenta reformular ou adiciona os trabalhos manualmente.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleImageSelect(file) {
    setError('')

    try {
      let imageFile = file
      const wasHeic = isHeicFile(file)

      if (wasHeic) {
        setConvertingImage(true)
        try {
          imageFile = await convertHeicToJpeg(file)
        } catch {
          setError('Não foi possível processar esta imagem. Tenta outra foto.')
          return
        } finally {
          setConvertingImage(false)
        }
      }

      setSelectedImage(imageFile)
      setImageWasHeic(wasHeic)
      setImagePreview(imageFile)
    } catch {
      setError('Não foi possível processar esta imagem. Tenta outra foto.')
    }
  }

  function handleCameraChange(e) {
    const file = e.target.files?.[0]
    if (file) handleImageSelect(file)
    e.target.value = ''
  }

  function handleGalleryChange(e) {
    const file = e.target.files?.[0]
    if (file) handleImageSelect(file)
    e.target.value = ''
  }

  async function handleAnalyzePhoto() {
    if (!selectedImage || analyzing || convertingImage) return

    setError('')
    setAnalyzing(true)

    try {
      const parsed = await analyzeImportedImage(selectedImage, imageWasHeic)

      if (parsed.length === 0) {
        setError(
          'Não foi possível identificar trabalhos nesta imagem. Tenta outra foto ou usa o método de texto.'
        )
        return
      }

      openYearGateOrProceed(parsed)
    } catch {
      setError(
        'Não foi possível processar o texto. Tenta reformular ou adiciona os trabalhos manualmente.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="min-h-screen bg-app pb-12">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate('/jobs')}
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-fg transition-colors active:bg-surface"
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-semibold">Importar trabalhos</h1>
      </header>

      <div className="space-y-6 px-4 pt-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setInputMode('text')
              setError('')
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              inputMode === 'text'
                ? 'bg-accent text-[#000000]'
                : 'bg-[#222222] text-[#888888]'
            }`}
          >
            Texto
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMode('file')
              setError('')
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              inputMode === 'file'
                ? 'bg-accent text-[#000000]'
                : 'bg-[#222222] text-[#888888]'
            }`}
          >
            Ficheiro
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMode('photo')
              setError('')
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              inputMode === 'photo'
                ? 'bg-accent text-[#000000]'
                : 'bg-[#222222] text-[#888888]'
            }`}
          >
            Foto
          </button>
        </div>

        <section className="space-y-3">
          {inputMode === 'text' ? (
            <>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Cola aqui o teu calendário ou notas"
                className="min-h-[200px] w-full resize-y rounded-lg border p-3 text-sm text-fg outline-none transition focus:border-[#A855F7]"
                style={{ backgroundColor: '#141414', borderColor: '#222222' }}
              />

              <button
                type="button"
                disabled={!pastedText.trim() || analyzing}
                onClick={handleAnalyzeText}
                className="w-full rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: AI_PURPLE }}
              >
                {analyzing ? 'A analisar texto…' : '✨ Analisar com IA'}
              </button>
            </>
          ) : inputMode === 'file' ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />

              <div
                className="rounded-lg border p-4"
                style={{ backgroundColor: '#141414', borderColor: '#222222' }}
              >
                <p className="text-sm text-fg">Carrega o teu ficheiro Excel ou CSV</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 rounded-lg bg-[#222222] px-4 py-2 text-sm font-medium text-fg"
                >
                  Selecionar ficheiro
                </button>
              </div>

              {selectedFile ? (
                <div className="space-y-3">
                  <p className="text-sm text-[#888888]">{selectedFile.name}</p>
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={handleAnalyzeFile}
                    className="w-full rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: AI_PURPLE }}
                  >
                    {analyzing ? 'A analisar texto…' : '✨ Analisar com IA'}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
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
                onChange={handleGalleryChange}
              />

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={convertingImage}
                className="w-full rounded-lg bg-[#222222] py-3 text-sm font-medium text-fg disabled:opacity-50"
              >
                📷 Tirar foto
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={convertingImage}
                className="text-sm text-[#888888] underline disabled:opacity-50"
              >
                Escolher da galeria
              </button>

              {convertingImage ? (
                <p className="text-sm text-[#888888]">A converter imagem…</p>
              ) : null}

              {selectedImage && imagePreviewUrl ? (
                <div className="space-y-3">
                  <img
                    src={imagePreviewUrl}
                    alt="Pré-visualização"
                    className="h-32 w-auto max-w-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    disabled={analyzing || convertingImage}
                    onClick={handleAnalyzePhoto}
                    className="w-full rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: AI_PURPLE }}
                  >
                    {analyzing ? 'A analisar texto…' : '✨ Analisar com IA'}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {error ? <p className="text-sm text-[#FF4444]">{error}</p> : null}
        </section>
      </div>

      {fileYearGateOpen && pendingFileRows ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div
            className="w-full max-w-sm rounded-xl p-5"
            style={{ backgroundColor: '#141414', border: '1px solid #222222' }}
          >
            <p className="text-sm text-fg">
              Encontrámos trabalhos de {formatPastYearsList(detectedPastYears)}. Queres
              importá-los também?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleFileYearGateChoice(true)}
                className="w-full rounded-lg py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: AI_PURPLE }}
              >
                Sim, incluir tudo
              </button>
              <button
                type="button"
                onClick={() => handleFileYearGateChoice(false)}
                className="w-full rounded-lg bg-[#222222] py-2.5 text-sm font-medium text-fg"
              >
                Não, só {CURRENT_YEAR}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {yearGateOpen && pendingResults ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div
            className="w-full max-w-sm rounded-xl p-5"
            style={{ backgroundColor: '#141414', border: '1px solid #222222' }}
          >
            <p className="text-sm text-fg">
              Encontrámos {otherYearJobs.length} trabalho(s){' '}
              {formatOtherYearLabel(pendingResults)}. Queres importá-los também?
            </p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleYearGateChoice(true)}
                className="w-full rounded-lg py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: AI_PURPLE }}
              >
                Sim, incluir
              </button>
              <button
                type="button"
                onClick={() => handleYearGateChoice(false)}
                className="w-full rounded-lg bg-[#222222] py-2.5 text-sm font-medium text-fg"
              >
                Não, só {CURRENT_YEAR}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
