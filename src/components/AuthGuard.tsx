'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const PUBLIC_PATHS = ['/login']

const SESSION_STARTED_KEY = 'agro_session_started_at'
const LAST_ACTIVITY_KEY = 'agro_last_activity_at'

const MAX_SESSION_MS = 8 * 60 * 60 * 1000
const INACTIVITY_LIMIT_MS = 45 * 60 * 1000
const CHECK_INTERVAL_MS = 30 * 1000

function now() {
  return Date.now()
}

function isPublicPath(pathname: string) {
  if (pathname === '/') return true
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function clearLocalSessionMarkers() {
  if (typeof window === 'undefined') return

  localStorage.removeItem(SESSION_STARTED_KEY)
  localStorage.removeItem(LAST_ACTIVITY_KEY)
}

function ensureLocalSessionMarkers() {
  if (typeof window === 'undefined') return

  const current = String(now())

  if (!localStorage.getItem(SESSION_STARTED_KEY)) {
    localStorage.setItem(SESSION_STARTED_KEY, current)
  }

  if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
    localStorage.setItem(LAST_ACTIVITY_KEY, current)
  }
}

function updateLastActivity() {
  if (typeof window === 'undefined') return
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now()))
}

function getStoredNumber(key: string) {
  if (typeof window === 'undefined') return 0

  const raw = localStorage.getItem(key)
  const parsed = Number(raw)

  return Number.isFinite(parsed) ? parsed : 0
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const publicPath = useMemo(() => isPublicPath(pathname), [pathname])

  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  const logoutAndRedirect = useCallback(async () => {
    clearLocalSessionMarkers()
    await supabase.auth.signOut()

    const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''

    router.replace(`/login${next}`)
  }, [pathname, router])

  const validateSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    const session = data?.session ?? null

    if (error || !session) {
      clearLocalSessionMarkers()
      setAuthorized(false)

      if (!publicPath) {
        const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''
        router.replace(`/login${next}`)
      }

      setChecking(false)
      return
    }

    ensureLocalSessionMarkers()

    const startedAt = getStoredNumber(SESSION_STARTED_KEY)
    const lastActivityAt = getStoredNumber(LAST_ACTIVITY_KEY)
    const current = now()

    const sessionTooOld = startedAt > 0 && current - startedAt > MAX_SESSION_MS
    const sessionInactive = lastActivityAt > 0 && current - lastActivityAt > INACTIVITY_LIMIT_MS

    if (sessionTooOld || sessionInactive) {
      await logoutAndRedirect()
      setChecking(false)
      return
    }

    setAuthorized(true)

    if (pathname === '/login') {
      router.replace('/menu')
    }

    setChecking(false)
  }, [logoutAndRedirect, pathname, publicPath, router])

  useEffect(() => {
    validateSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const current = String(now())
        localStorage.setItem(SESSION_STARTED_KEY, current)
        localStorage.setItem(LAST_ACTIVITY_KEY, current)
        setAuthorized(true)
      }

      if (event === 'SIGNED_OUT') {
        clearLocalSessionMarkers()
        setAuthorized(false)

        if (!isPublicPath(window.location.pathname)) {
          router.replace('/login')
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, validateSession])

  useEffect(() => {
    if (!authorized) return

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']

    events.forEach((event) => {
      window.addEventListener(event, updateLastActivity, { passive: true })
    })

    const interval = window.setInterval(() => {
      validateSession()
    }, CHECK_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        validateSession()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateLastActivity)
      })

      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [authorized, validateSession])

  if (publicPath) {
    return <>{children}</>
  }

  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="Logo" className="h-16 mx-auto mb-4" />
          <p className="text-sm text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}