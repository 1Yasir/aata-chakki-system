import { LogOut, Wheat } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const adminLinks = [
  { to: '/admin', label: 'Daily books' },
  { to: '/customers', label: 'Wheat ledger' },
]

export default function AdminHeader({ actions }) {
  const { user, logout } = useAuth()
  const { notify } = useToast()

  async function handleLogout() {
    try {
      await logout()
      notify('Signed out.')
    } catch (error) {
      notify(error.message || 'Could not sign out.', 'error')
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-wheat-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-display text-xl text-mill-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mill-800 text-wheat-200">
              <Wheat className="h-5 w-5" />
            </span>
            Admin dashboard
          </Link>
          <nav className="flex items-center gap-1 rounded-full bg-wheat-50 p-1 text-sm font-semibold">
            {adminLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-1.5 ${
                    isActive ? 'bg-mill-800 text-wheat-100' : 'text-stone-600 hover:bg-white hover:text-mill-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <p className="hidden text-sm text-stone-500 sm:block">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-full bg-mill-800 px-4 py-2 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
