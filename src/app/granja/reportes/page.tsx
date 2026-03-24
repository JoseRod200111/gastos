'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function GranjaReportesMenuPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo Empresa" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold text-center mb-2">Reportes — Granja</h1>
      <p className="text-center text-sm text-gray-600 mb-6">
        Reportes del módulo de granja: ventas, compras, inventario diario, muertes y movimientos.
      </p>

      {/* Botón volver al menú de granja */}
      <div className="flex justify-end mb-4">
        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Ventas */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Ventas</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/reportes/ventas"
              className="block bg-indigo-600 hover:bg-indigo-700 text-white text-center py-3 rounded"
            >
              💰 Reporte de ventas de cerdos
            </Link>
          </div>
        </section>

        {/* Compras */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Compras</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/reportes/compras"
              className="block bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded"
            >
              🐖 Reporte de compras de cerdos
            </Link>
          </div>
        </section>

        {/* Inventario diario */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Inventario diario</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/reportes/inventario-diario"
              className="block bg-amber-600 hover:bg-amber-700 text-white text-center py-3 rounded"
            >
              🗓 Reporte de inventario diario (conteos)
            </Link>
          </div>
        </section>

        {/* Muertes */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Muertes</h2>
          <div className="grid gap-2">
            <Link
              href="/granja/reportes/muertes"
              className="block bg-red-600 hover:bg-red-700 text-white text-center py-3 rounded"
            >
              ☠ Reporte de bajas por muerte
            </Link>
          </div>
        </section>

        {/* Movimientos */}
        <section className="border rounded-lg p-4 shadow-sm bg-white md:col-span-2">
          <h2 className="font-semibold mb-3">Movimientos</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Link
              href="/granja/reportes/movimientos"
              className="block bg-sky-600 hover:bg-sky-700 text-white text-center py-3 rounded"
            >
              📒 Reporte de movimientos
            </Link>

            <Link
              href="/granja/inventario"
              className="block bg-slate-600 hover:bg-slate-700 text-white text-center py-3 rounded"
            >
              📋 Ir a Inventario por ubicación
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}