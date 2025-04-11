'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user) {
        setUserEmail(data.user.email)
      } else {
        router.push('/login') // si no hay sesión, redirige al login
      }
    }

    getUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Menú Principal</h1>
      <p className="mb-6 text-gray-700">Sesión iniciada como: {userEmail}</p>

      <div className="space-y-3">
        <button onClick={() => router.push('/erogacion/nueva')} className="w-full p-3 bg-blue-600 text-white rounded">
          ➕ Nueva Erogación
        </button>

        <button onClick={() => router.push('/erogacion/ver')} className="w-full p-3 bg-green-600 text-white rounded">
          📋 Ver Erogaciones
        </button>

        <button onClick={() => router.push('/reportes')} className="w-full p-3 bg-purple-600 text-white rounded">
          📊 Reportes
        </button>

        <button onClick={() => router.push('/empresas')} className="w-full p-3 bg-gray-600 text-white rounded">
          🏢 Agregar/Eliminar Empresa, Categoría, División
        </button>

        <button onClick={handleLogout} className="w-full p-3 bg-red-600 text-white rounded mt-4">
          🔒 Cerrar sesión
        </button>
      </div>
    </div>
  )
}
