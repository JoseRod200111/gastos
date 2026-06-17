'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const SESSION_STARTED_KEY = 'agro_session_started_at'
const LAST_ACTIVITY_KEY = 'agro_last_activity_at'

export default function Dashboard() {
  const router = useRouter()

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_STARTED_KEY)
    localStorage.removeItem(LAST_ACTIVITY_KEY)

    await supabase.auth.signOut()

    router.replace('/login')
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-20" />
      </div>

      <h1 className="text-2xl font-bold text-center mb-8">Menú Principal</h1>

      <div className="grid gap-4">
        <Link
          href="/inventario"
          className="block bg-emerald-600 hover:bg-emerald-700 text-white text-center py-4 rounded shadow"
        >
          📦 Inventario
        </Link>

        <Link
          href="/dashboard"
          className="block bg-blue-600 hover:bg-blue-700 text-white text-center py-4 rounded shadow"
        >
          💸 Erogaciones
        </Link>

        <Link
          href="/ventas"
          className="block bg-indigo-600 hover:bg-indigo-700 text-white text-center py-4 rounded shadow"
        >
          🛒 Ventas
        </Link>

        <Link
          href="/vehiculos"
          className="block bg-amber-600 hover:bg-amber-700 text-white text-center py-4 rounded shadow"
        >
          🚚 Vehículos
        </Link>

        <Link
          href="/granja"
          className="block bg-pink-600 hover:bg-pink-700 text-white text-center py-4 rounded shadow"
        >
          🐷 Granja
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 text-white text-center py-4 rounded shadow mt-4"
        >
          🔒 Cerrar sesión
        </button>
      </div>
    </div>
  )
}
