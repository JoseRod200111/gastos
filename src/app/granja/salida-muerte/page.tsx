'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  activo?: boolean
}

type Lote = {
  id: number
  codigo: string
  activo?: boolean
}

type Baja = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cantidad: number
  hembras: number | null
  machos: number | null
  motivo: string | null
  foto_url: string | null
  observaciones: string | null
  created_at: string | null

  // para mostrar en UI
  ubicacion?: { codigo: string; nombre: string | null } | null
  lote?: { codigo: string } | null
}

type FormState = {
  fecha: string
  ubicacion_id: string
  lote_id: string
  cantidad: string
  hembras: string
  machos: string
  motivo: string
  foto_url: string
  observaciones: string
}

const hoyISO = () => {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function GranjaSalidaMuertePage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [bajasRecientes, setBajasRecientes] = useState<Baja[]>([])

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  const [form, setForm] = useState<FormState>({
    fecha: hoyISO(),
    ubicacion_id: '',
    lote_id: '',
    cantidad: '1',
    hembras: '',
    machos: '',
    motivo: '',
    foto_url: '',
    observaciones: '',
  })

  const resetForm = () => {
    setForm({
      fecha: hoyISO(),
      ubicacion_id: '',
      lote_id: '',
      cantidad: '1',
      hembras: '',
      machos: '',
      motivo: '',
      foto_url: '',
      observaciones: '',
    })
  }

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, lRes, bRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre, activo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        supabase
          .from('granja_lotes')
          .select('id, codigo, activo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        // 👇 traemos relaciones para mostrar en UI
        supabase
          .from('granja_bajas_muerte')
          .select(
            `
            id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos,
            motivo, foto_url, observaciones, created_at,
            granja_ubicaciones ( codigo, nombre ),
            granja_lotes ( codigo )
          `
          )
          .order('fecha', { ascending: false })
          .limit(30),
      ])

      if (uRes.error) console.error('Error cargando ubicaciones', uRes.error)
      if (lRes.error) console.error('Error cargando lotes', lRes.error)
      if (bRes.error) console.error('Error cargando bajas', bRes.error)

      setUbicaciones((uRes.data as Ubicacion[]) || [])
      setLotes((lRes.data as Lote[]) || [])

      // ✅ Mapeo seguro (evita el error de TS por arrays en relaciones)
      const mapped: Baja[] = ((bRes.data as any[]) || []).map((r: any) => ({
        id: r.id,
        fecha: r.fecha,
        ubicacion_id: r.ubicacion_id,
        lote_id: r.lote_id ?? null,
        cantidad: toNum(r.cantidad),
        hembras: r.hembras == null ? null : toNum(r.hembras),
        machos: r.machos == null ? null : toNum(r.machos),
        motivo: r.motivo ?? null,
        foto_url: r.foto_url ?? null,
        observaciones: r.observaciones ?? null,
        created_at: r.created_at ?? null,
        ubicacion: Array.isArray(r.granja_ubicaciones)
          ? r.granja_ubicaciones[0] ?? null
          : r.granja_ubicaciones ?? null,
        lote: Array.isArray(r.granja_lotes) ? r.granja_lotes[0] ?? null : r.granja_lotes ?? null,
      }))

      setBajasRecientes(mapped)

      // set default ubicacion si vacío
      if (!form.ubicacion_id && ((uRes.data as any[]) || []).length > 0) {
        setForm((prev) => ({ ...prev, ubicacion_id: String((uRes.data as any[])[0].id) }))
      }
    } finally {
      setLoading(false)
    }
  }, [form.ubicacion_id])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const ubicacionSeleccionada = useMemo(() => {
    const id = Number(form.ubicacion_id || 0)
    return ubicaciones.find((u) => u.id === id) || null
  }, [form.ubicacion_id, ubicaciones])

  const onChange = (name: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // --------- guardar baja por muerte ---------
  const guardarBaja = async () => {
    if (!form.fecha || !form.ubicacion_id || !form.cantidad) {
      alert('Fecha, ubicación y cantidad son obligatorios.')
      return
    }

    const cantidad = Number(form.cantidad)
    const hembrasNum = form.hembras.trim() !== '' ? Number(form.hembras) : null
    const machosNum = form.machos.trim() !== '' ? Number(form.machos) : null

    if (Number.isNaN(cantidad) || cantidad <= 0) {
      alert('La cantidad debe ser un número mayor que cero.')
      return
    }
    if (hembrasNum != null && (Number.isNaN(hembrasNum) || hembrasNum < 0)) {
      alert('Hembras no es válido.')
      return
    }
    if (machosNum != null && (Number.isNaN(machosNum) || machosNum < 0)) {
      alert('Machos no es válido.')
      return
    }

    setGuardando(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      // 1) insertar baja
      const { data: bajaInsertada, error: bajaErr } = await supabase
        .from('granja_bajas_muerte')
        .insert({
          fecha: form.fecha,
          ubicacion_id: Number(form.ubicacion_id),
          lote_id: form.lote_id ? Number(form.lote_id) : null,
          cantidad,
          hembras: hembrasNum,
          machos: machosNum,
          motivo: form.motivo?.trim() ? form.motivo.trim() : null,
          foto_url: form.foto_url?.trim() ? form.foto_url.trim() : null,
          observaciones: form.observaciones?.trim() ? form.observaciones.trim() : null,
          reportado_por: userId, // si tu RLS lo usa
        })
        .select('id')
        .single()

      if (bajaErr || !bajaInsertada) {
        console.error('Error guardando baja', bajaErr)
        alert('No se pudo guardar la baja por muerte.')
        return
      }

      // 2) movimiento en inventario (SALIDA_MUERTE)
      // ✅ IMPORTANTE: cantidad debe ir POSITIVA (inventario resta por tipo)
      const { error: movErr } = await supabase.from('granja_movimientos').insert({
        ubicacion_id: Number(form.ubicacion_id),
        tipo: 'SALIDA_MUERTE',
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        cantidad: cantidad, // <-- POSITIVA (NO negativa)
        hembras: hembrasNum,
        machos: machosNum,
        referencia_tabla: 'granja_bajas_muerte',
        referencia_id: bajaInsertada.id,
        user_id: userId, // si tu RLS lo usa
        observaciones: form.motivo?.trim()
          ? `Salida por muerte: ${form.motivo.trim()}`
          : 'Salida de cerdos por muerte',
      })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert('Baja guardada, pero NO se pudo registrar el movimiento de inventario.')
        return
      }

      alert('Baja por muerte registrada correctamente.')
      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // --------- eliminar baja (y revertir inventario) ---------
  const eliminarBaja = async (baja: Baja) => {
    if (!confirm(`¿Eliminar esta baja (#${baja.id}) y revertir inventario?`)) return
    setEliminandoId(baja.id)
    try {
      // 1) borrar movimiento asociado
      const { error: movDelErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_bajas_muerte')
        .eq('referencia_id', baja.id)
        .eq('tipo', 'SALIDA_MUERTE')

      if (movDelErr) {
        console.error('Error eliminando movimiento asociado', movDelErr)
        alert('No se pudo eliminar el movimiento asociado (no se puede revertir inventario).')
        return
      }

      // 2) borrar baja
      const { error: bajaDelErr } = await supabase.from('granja_bajas_muerte').delete().eq('id', baja.id)

      if (bajaDelErr) {
        console.error('Error eliminando baja', bajaDelErr)
        alert('Se eliminó el movimiento, pero no se pudo eliminar la baja. Revisa permisos/RLS.')
        return
      }

      alert('Baja eliminada y el inventario quedó revertido.')
      await cargarDatos()
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Salida por muerte</h1>
          <p className="text-xs text-gray-600">
            Registrar bajas por muerte y debitar el inventario por ubicación.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva baja por muerte</h2>

          {loading ? (
            <p className="text-xs text-gray-500 mb-2">Cargando catálogos…</p>
          ) : null}

          <div className="grid gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={form.fecha}
                onChange={(e) => onChange('fecha', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Ubicación (tramo o jaula)</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={form.ubicacion_id}
                onChange={(e) => onChange('ubicacion_id', e.target.value)}
              >
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre ?? ''}
                  </option>
                ))}
              </select>
              {ubicacionSeleccionada ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  Seleccionado: <span className="font-semibold">{ubicacionSeleccionada.codigo}</span>
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Lote (opcional)</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={form.lote_id}
                onChange={(e) => onChange('lote_id', e.target.value)}
              >
                <option value="">Sin lote específico</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Cantidad de cerdos</label>
                <input
                  type="number"
                  className="border rounded px-2 py-1 w-full"
                  value={form.cantidad}
                  onChange={(e) => onChange('cantidad', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Hembras (opcional)</label>
                <input
                  type="number"
                  className="border rounded px-2 py-1 w-full"
                  value={form.hembras}
                  onChange={(e) => onChange('hembras', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos (opcional)</label>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={form.machos}
                onChange={(e) => onChange('machos', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Motivo</label>
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder="Ejemplo: aplastado, enfermedad, accidente"
                value={form.motivo}
                onChange={(e) => onChange('motivo', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">URL de foto (opcional)</label>
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder="Pegue aquí la URL de la foto si existe"
                value={form.foto_url}
                onChange={(e) => onChange('foto_url', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Observaciones</label>
              <textarea
                className="border rounded px-2 py-2 w-full min-h-[90px]"
                value={form.observaciones}
                onChange={(e) => onChange('observaciones', e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={guardarBaja}
                disabled={guardando || loading}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded"
              >
                {guardando ? 'Guardando…' : 'Guardar baja'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Listado */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Bajas recientes</h2>

          {bajasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay bajas registradas.</p>
          ) : (
            <div className="grid gap-3">
              {bajasRecientes.map((b) => (
                <div key={b.id} className="border rounded p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        #{b.id} · {b.fecha} · Cant: {b.cantidad}
                      </div>
                      <div className="text-xs text-gray-600">
                        Ubicación:{' '}
                        <span className="font-semibold">
                          {b.ubicacion?.codigo ?? `#${b.ubicacion_id}`}
                        </span>
                        {b.lote ? ` · Lote: ${b.lote.codigo}` : ''}
                      </div>
                      {b.motivo ? <div className="text-xs mt-1">Motivo: {b.motivo}</div> : null}
                      {b.observaciones ? (
                        <div className="text-xs text-gray-700 mt-1">{b.observaciones}</div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => eliminarBaja(b)}
                      disabled={eliminandoId === b.id}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1.5 rounded text-xs"
                    >
                      {eliminandoId === b.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>

                  {b.foto_url ? (
                    <a
                      href={b.foto_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline mt-2 inline-block"
                    >
                      Ver foto
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
