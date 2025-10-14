'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function VentasMenuPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (data?.user) {
        setUserEmail(data.user.email ?? null)
      } else {
        router.push('/login') // sin sesión -> login
      }
    }
    getUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="p-6 max-w-xl mx-auto text-center">
      {/* LOGO (next/image para evitar warnings) */}
      <div className="mx-auto mb-4 w-32">
        <Image src="/logo.png" alt="Logo" width={128} height={64} className="mx-auto h-auto w-auto" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Ventas</h1>
      <p className="mb-6 text-gray-700">Sesión iniciada como: {userEmail}</p>

      <div className="space-y-3">
        {/* Nueva venta */}
        <button
          onClick={() => router.push('/ventas/nueva')}
          className="w-full p-3 bg-orange-600 hover:bg-orange-700 text-white rounded"
        >
          🧾 Nueva Venta
        </button>

        {/* Ver ventas */}
        <button
          onClick={() => router.push('/ventas/ver')}
          className="w-full p-3 bg-amber-600 hover:bg-amber-700 text-white rounded"
        >
          📑 Ver Ventas
        </button>

        {/* Saldos de clientes */}
        <button
          onClick={() => router.push('/ventas/saldos')}
          className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
        >
          💰 Saldos de Clientes
        </button>

        {/* Reportes de ventas (PDF) */}
        <button
          onClick={() => router.push('/ventas/reportes')}
          className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white rounded"
        >
          📊 Reportes de Ventas (PDF)
        </button>

        {/* Administración de catálogos */}
        <button
          onClick={() => router.push('/empresas')}
          className="w-full p-3 bg-slate-700 hover:bg-slate-800 text-white rounded"
        >
          🏢 Agregar/Eliminar Empresa, Categoría, División, Cliente, Proveedor y Pago
        </button>

        {/* Volver al menú principal */}
        <button
          onClick={() => router.push('/menu')}
          className="w-full p-3 bg-gray-600 hover:bg-gray-700 text-white rounded"
        >
          ⬅ Volver al Menú Principal
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full p-3 bg-red-600 hover:bg-red-700 text-white rounded mt-4"
        >
          🔒 Cerrar sesión
        </button>
      </div>
    </div>
  )
}
