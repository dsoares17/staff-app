import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav.jsx'

export default function AppShell() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-app">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
