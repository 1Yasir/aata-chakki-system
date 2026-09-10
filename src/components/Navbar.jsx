import { Wheat } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

const publicLinks = [
  { href: '/#services', label: 'Services' },
  { href: '/#rates', label: 'Rates' },
  { href: '/#hours', label: 'Hours' },
  { href: '/#contact', label: 'Contact' },
]

export default function Navbar({ variant = 'public' }) {
  return (
    <header className="sticky top-0 z-40 border-b border-wheat-200/80 bg-wheat-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-xl text-mill-900">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mill-800 text-wheat-200">
            <Wheat className="h-5 w-5" />
          </span>
          <span>
            Aata Chakki
            <span className="block text-xs font-sans font-medium tracking-wide text-stone-500">
              Mill & Daily Management
            </span>
          </span>
        </Link>

        {variant === 'public' ? (
          <nav className="flex items-center gap-2 text-sm font-medium text-stone-700 sm:gap-5">
            {publicLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="hidden hover:text-mill-900 sm:inline"
              >
                {link.label}
              </a>
            ))}
            <NavLink
              to="/login"
              className="rounded-full bg-mill-800 px-4 py-2 text-wheat-100 shadow-sm transition hover:bg-mill-700"
            >
              Admin Portal
            </NavLink>
          </nav>
        ) : (
          <p className="text-sm font-medium text-stone-500">Staff dashboard</p>
        )}
      </div>
    </header>
  )
}
