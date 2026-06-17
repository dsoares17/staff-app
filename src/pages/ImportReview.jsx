import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

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

export default function ImportReview() {
  const navigate = useNavigate()
  const location = useLocation()
  const jobs = location.state?.jobs

  useEffect(() => {
    const nav = document.querySelector('nav.fixed.bottom-0')
    if (nav) nav.style.display = 'none'
    return () => {
      if (nav) nav.style.display = ''
    }
  }, [])

  useEffect(() => {
    if (!jobs || !Array.isArray(jobs)) {
      navigate('/jobs/import', { replace: true })
    }
  }, [jobs, navigate])

  if (!jobs || !Array.isArray(jobs)) {
    return null
  }

  return (
    <div className="min-h-screen bg-app pb-12">
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

      <div className="px-4 pt-2">
        <h2 className="text-base font-medium text-fg">Trabalhos encontrados: {jobs.length}</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-surface p-4 text-xs text-fg">
          {JSON.stringify(jobs, null, 2)}
        </pre>
      </div>
    </div>
  )
}
