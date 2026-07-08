'use client'

import Link from 'next/link'

export default function RrhhMenuPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold text-center mb-2">Recursos Humanos</h1>
      <p className="text-center text-sm text-gray-600 mb-6">
        Control de empleados, planilla, anticipos, préstamos, descuentos y finiquitos.
      </p>

      <div className="flex justify-end mb-4">
        <Link
          href="/menu"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          Volver al menú principal
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Empleados</h2>
          <div className="grid gap-2">
            <Link
              href="/rrhh/empleados"
              className="block bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded"
            >
              Registro y control de empleados
            </Link>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Planilla</h2>
          <div className="grid gap-2">
            <Link
              href="/rrhh/planilla"
              className="block bg-blue-600 hover:bg-blue-700 text-white text-center py-3 rounded"
            >
              Planilla quincenal
            </Link>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Anticipos</h2>
          <div className="grid gap-2">
            <Link
              href="/rrhh/anticipos"
              className="block bg-orange-600 hover:bg-orange-700 text-white text-center py-3 rounded"
            >
              Registrar anticipos
            </Link>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Préstamos</h2>
          <div className="grid gap-2">
            <Link
              href="/rrhh/prestamos"
              className="block bg-purple-600 hover:bg-purple-700 text-white text-center py-3 rounded"
            >
              Registrar préstamos y cuotas
            </Link>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white md:col-span-2">
          <h2 className="font-semibold mb-3">Reportes, descuentos y finiquitos</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Link
              href="/rrhh/descuentos-ventas"
              className="block bg-red-600 hover:bg-red-700 text-white text-center py-3 rounded"
            >
              Descuentos por ventas
            </Link>
            <Link
              href="/rrhh/finiquitos"
              className="block bg-slate-700 hover:bg-slate-800 text-white text-center py-3 rounded"
            >
              Finiquitos y bajas
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
