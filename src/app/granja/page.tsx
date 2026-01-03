'use client'

import Link from 'next/link'

export default function GranjaMenuPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold text-center mb-2">
        Módulo de Granja
      </h1>
      <p className="text-center text-sm text-gray-600 mb-6">
        Control de entradas, salidas e inventarios de cerdos por ubicación.
      </p>

      {/* Botón volver al menú principal */}
      <div className="flex justify-end mb-4">
        <Link
          href="/menu"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Volver al Menú
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ENTRADAS */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Entradas de cerdos</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/entrada-compra"
              className="block bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded"
            >
              🐖 Compra de cerdos
            </Link>
            <Link
              href="/granja/entrada-parto"
              className="block bg-emerald-500 hover:bg-emerald-600 text-white text-center py-3 rounded"
            >
              🍼 Partos (camadas)
            </Link>
          </div>
        </section>

        {/* SALIDAS */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Salidas de cerdos</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/salida-venta"
              className="block bg-indigo-600 hover:bg-indigo-700 text-white text-center py-3 rounded"
            >
              💰 Venta de cerdos
            </Link>
            <Link
              href="/granja/salida-muerte"
              className="block bg-red-600 hover:bg-red-700 text-white text-center py-3 rounded"
            >
              ☠ Bajas por muerte
            </Link>
          </div>
        </section>

        {/* INVENTARIO */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Inventario</h2>
         
          <div className="grid gap-2">
            <Link
              href="/granja/inventario"
              className="block bg-amber-600 hover:bg-amber-700 text-white text-center py-3 rounded"
            >
              📋 Inventario por ubicación
            </Link>
            <Link
              href="/granja/inventario-diario"
              className="block bg-amber-500 hover:bg-amber-600 text-white text-center py-3 rounded"
            >
              🗓 Inventario diario (conteo físico)
            </Link>
          </div>
        </section>

        {/* REPORTES */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Reportes</h2>
         
          <div className="grid gap-2">
            <Link
              href="/granja/reportes"
              className="block bg-sky-600 hover:bg-sky-700 text-white text-center py-3 rounded"
            >
              📊 Reportes del módulo de granja
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

