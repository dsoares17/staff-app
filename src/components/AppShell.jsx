import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from './BottomNav.jsx'
import ImportBottomSheet from './ImportBottomSheet.jsx'

function shouldShowShellHeader(pathname) {
  return (
    pathname === '/jobs' ||
    pathname === '/financeiro' ||
    pathname === '/organizadores' ||
    pathname === '/finances' ||
    pathname === '/expenses' ||
    pathname === '/profile'
  )
}

function ProfileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [importOpen, setImportOpen] = useState(false)
  const showHeader = shouldShowShellHeader(pathname)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-app">
      {showHeader ? (
        <header className="flex items-center justify-end px-4 pb-1 pt-3">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label="Perfil"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#888888] transition-colors active:bg-surface"
          >
            <ProfileIcon />
          </button>
        </header>
      ) : null}

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <BottomNav onImportPress={() => setImportOpen(true)} />

      <ImportBottomSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
