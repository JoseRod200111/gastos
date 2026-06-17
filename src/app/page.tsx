'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        router.replace('/menu')
      } else {
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  return (
    <div className="p-6 text-center">
      <img src="/logo.png" alt="Logo" className="mx-auto mb-4 w-32 h-auto" />
      <p>Redireccionando...</p>
    </div>
  )
}
