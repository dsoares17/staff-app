import { Link, useLocation } from 'react-router-dom'

const navTabs = [
  {
    label: 'Trabalhos',
    path: '/jobs',
    match: (pathname) => pathname === '/jobs' || pathname.startsWith('/jobs/'),
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
  {
    label: 'Financeiro',
    path: '/financeiro',
    match: (pathname) => pathname.startsWith('/financeiro'),
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 4 4 5-6" />
      </svg>
    ),
  },
  {
    label: 'Organizadores',
    path: '/organizadores',
    match: (pathname) => pathname.startsWith('/organizadores'),
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9v0" />
        <path d="M9 12v0" />
        <path d="M9 15v0" />
        <path d="M9 18v0" />
      </svg>
    ),
  },
]

export default function BottomNav({ onImportPress }) {
  const { pathname } = useLocation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-surface pb-safe"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="mx-auto flex w-full max-w-[480px]">
        {navTabs.map((tab) => {
          const active = tab.match(pathname)
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                active ? 'text-accent' : 'text-[#888888]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          )
        })}

        <button
          type="button"
          onClick={onImportPress}
          className="-mt-2 flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs text-accent"
          aria-label="Importar"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[#000000]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Importar</span>
        </button>
      </div>
    </nav>
  )
}
