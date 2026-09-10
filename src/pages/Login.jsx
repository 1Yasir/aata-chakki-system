import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Wheat } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Navbar from '../components/Navbar'

export default function Login() {
  const { user, login, configured, loading } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to="/admin" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      notify('Signed in. Welcome back to the mill books.')
      navigate('/admin', { replace: true })
    } catch (error) {
      notify(error.message || 'Could not sign in. Check email and password.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-wheat-50">
      <Navbar />
      <main className="mx-auto flex max-w-md flex-col px-4 py-16">
        <div className="rounded-[2rem] border border-wheat-200 bg-white p-8 shadow-xl shadow-wheat-200/40">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-mill-800 text-wheat-200">
            <Wheat className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl text-mill-900">Admin login</h1>
          <p className="mt-2 text-sm text-stone-600">
            Use the mill Firebase account. Daily entries stay private behind this gate.
          </p>

          {!configured ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Firebase env keys are missing. Copy <code>.env.example</code> to <code>.env</code> and
              restart the dev server.
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-stone-700" htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-wheat-200 px-3 py-2.5 outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
              />
            </label>
            <label className="block text-sm font-medium text-stone-700" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-wheat-200 px-3 py-2.5 outline-none focus:border-wheat-400 focus:ring-2 focus:ring-wheat-400"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-mill-800 py-3 text-sm font-semibold text-wheat-100 hover:bg-mill-700 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-wheat-500 hover:text-mill-800">
            Back to landing page
          </Link>
        </div>
      </main>
    </div>
  )
}
