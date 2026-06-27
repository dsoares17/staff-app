import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

function CardSkeleton() {
  return <div className="mx-4 mb-2 h-[72px] animate-pulse rounded-xl bg-surface" />
}

export default function Organizadores() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [organisers, setOrganisers] = useState([])
  const [jobCounts, setJobCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (authLoading) return undefined
    if (!user?.id) {
      setOrganisers([])
      setJobCounts({})
      setLoading(false)
      return undefined
    }

    let active = true

    async function fetchData() {
      setLoading(true)

      const [{ data: organiserData, error: organiserError }, { data: jobData, error: jobError }] =
        await Promise.all([
          supabase
            .from('staff_app_organisers')
            .select('*')
            .eq('staff_app_user_id', user.id)
            .order('name', { ascending: true }),
          supabase
            .from('staff_app_jobs')
            .select('organiser_id')
            .eq('staff_app_user_id', user.id)
            .not('organiser_id', 'is', null),
        ])

      if (!active) return

      if (organiserError) {
        console.error('Erro ao carregar organizadores:', organiserError.message)
        setOrganisers([])
      } else {
        setOrganisers(organiserData ?? [])
      }

      if (jobError) {
        console.error('Erro ao contar trabalhos:', jobError.message)
        setJobCounts({})
      } else {
        const counts = {}
        for (const job of jobData ?? []) {
          if (!job.organiser_id) continue
          counts[job.organiser_id] = (counts[job.organiser_id] ?? 0) + 1
        }
        setJobCounts(counts)
      }

      setLoading(false)
    }

    fetchData()

    return () => {
      active = false
    }
  }, [user?.id, authLoading])

  const filteredOrganisers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return organisers
    return organisers.filter((organiser) =>
      String(organiser.name ?? '')
        .toLowerCase()
        .includes(query)
    )
  }, [organisers, search])

  return (
    <div className="min-h-full bg-app pb-4">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-xl font-semibold">Organizadores</h1>
        <button
          type="button"
          onClick={() => navigate('/organizadores/new')}
          aria-label="Adicionar organizador"
          className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-accent transition-colors active:bg-surface"
        >
          +
        </button>
      </header>

      <div className="mb-4 px-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar organizador..."
          className="w-full rounded-lg border px-3 py-2 text-sm text-fg outline-none transition focus:border-accent"
          style={{ backgroundColor: '#141414', borderColor: '#222222' }}
        />
      </div>

      {authLoading || loading ? (
        <div>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : filteredOrganisers.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-[#888888]">
          {organisers.length === 0
            ? 'Ainda não tens organizadores. Adiciona o teu primeiro cliente.'
            : 'Nenhum organizador encontrado.'}
        </p>
      ) : (
        filteredOrganisers.map((organiser) => {
          const count = jobCounts[organiser.id] ?? 0

          return (
            <button
              key={organiser.id}
              type="button"
              onClick={() => navigate(`/organizadores/${organiser.id}`)}
              className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl px-4 py-3 text-left transition-opacity active:opacity-80"
              style={{ backgroundColor: '#141414' }}
            >
              <div className="min-w-0 pr-3">
                <p className="truncate text-base font-semibold text-fg">{organiser.name}</p>
                {organiser.nif ? (
                  <p className="mt-0.5 text-xs text-[#888888]">NIF: {organiser.nif}</p>
                ) : null}
              </div>

              <p className="shrink-0 text-xs text-[#888888]">
                {count} trabalho{count === 1 ? '' : 's'}
              </p>
            </button>
          )
        })
      )}
    </div>
  )
}
