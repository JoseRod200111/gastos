'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const SESSION_STARTED_KEY = 'agro_session_started_at'
const LAST_ACTIVITY_KEY = 'agro_last_activity_at'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const nextUrl = useMemo(() => {
    const next = searchParams.get('next')
    if (!next) return '/menu'
    if (!next.startsWith('/')) return '/menu'
    if (next.startsWith('//')) return '/menu'
    if (next.startsWith('/login')) return '/menu'
    return next
  }, [searchParams])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        router.replace('/menu')
        return
      }

      setChecking(false)
    }

    checkExistingSession()
  }, [router])

  const setSessionMarkers = () => {
    const current = String(Date.now())
    localStorage.setItem(SESSION_STARTED_KEY, current)
    localStorage.setItem(LAST_ACTIVITY_KEY, current)
  }

  const handleLogin = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setSessionMarkers()
    router.replace(nextUrl)
  }

  const handleRegister = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Revisa tu correo para confirmar tu cuenta.')
    }

    setLoading(false)
  }

  if (checking) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <img src="/logo.png" alt="Logo" className="mx-auto mb-4 w-32 h-auto" />
        <p className="text-sm text-gray-600">Verificando sesión...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <img src="/logo.png" alt="Logo" className="mx-auto mb-4 w-32 h-auto" />

      <h1 className="text-2xl font-bold mb-2">Iniciar sesión</h1>

      <p className="text-sm text-gray-600 mb-4">
        Ingresa con tu usuario para acceder al sistema.
      </p>

      <input
        type="email"
        placeholder="Correo"
        className="border p-2 w-full mb-2"
        value={email}
        autoComplete="email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Contraseña"
        className="border p-2 w-full mb-4"
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !loading) {
            handleLogin()
          }
        }}
      />

      <div className="flex gap-4 justify-center">
        <button
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Entrando...' : 'Iniciar sesión'}
        </button>

        <button
          onClick={handleRegister}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60"
          disabled={loading}
        >
          Registrarse
        </button>
      </div>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 max-w-md mx-auto text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-4 w-32 h-auto" />
          <p className="text-sm text-gray-600">Cargando...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
