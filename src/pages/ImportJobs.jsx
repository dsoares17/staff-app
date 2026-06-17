import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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

function parseJsonArrayFromAiText(text) {
  const trimmed = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const arrayMatch = trimmed.match(/(\[[\s\S]*\])/)
  if (!arrayMatch) throw new Error('Resposta inválida da IA.')

  const parsed = JSON.parse(arrayMatch[1])
  if (!Array.isArray(parsed)) throw new Error('Resposta inválida da IA.')
  return parsed
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

export default function ImportJobs() {
  const navigate = useNavigate()
  const [pastedText, setPastedText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [pendingResults, setPendingResults] = useState(null)
  const [yearGateOpen, setYearGateOpen] = useState(false)

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

  async function handleAnalyze() {
    const text = pastedText.trim()
    if (!text || analyzing) return

    setError('')
    setAnalyzing(true)

    try {
      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: buildImportPrompt(text) }],
            },
          ],
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body?.error?.message || 'Pedido à IA falhou.')
      }

      const textBlock = body?.content?.find((block) => block.type === 'text')
      const parsed = parseJsonArrayFromAiText(textBlock?.text)

      if (parsed.length === 0) {
        throw new Error('Nenhum trabalho encontrado.')
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
        <section className="space-y-3">
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
            onClick={handleAnalyze}
            className="w-full rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: AI_PURPLE }}
          >
            {analyzing ? 'A analisar texto…' : '✨ Analisar com IA'}
          </button>

          {error ? <p className="text-sm text-[#FF4444]">{error}</p> : null}
        </section>
      </div>

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
