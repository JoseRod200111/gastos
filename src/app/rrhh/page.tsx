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
            <button
              type="button"
              disabled
              className="block bg-slate-300 text-slate-700 text-center py-3 rounded cursor-not-allowed"
            >
              Planilla quincenal pendiente
            </button>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Anticipos y préstamos</h2>
          <div className="grid gap-2">
            <button
              type="button"
              disabled
              className="block bg-slate-300 text-slate-700 text-center py-3 rounded cursor-not-allowed"
            >
              Sección pendiente
            </button>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Reportes</h2>
          <div className="grid gap-2">
            <button
              type="button"
              disabled
              className="block bg-slate-300 text-slate-700 text-center py-3 rounded cursor-not-allowed"
            >
              Reportes pendientes
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
