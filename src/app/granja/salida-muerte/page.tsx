'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
  fecha: string | null
  tipo_origen: string | null
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
  reportado_por: string | null
}

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Para el corte del inventario: guardamos el movimiento con timestamp del mismo día (mediodía UTC)
const fechaISOaTimestampMediodia = (iso: string) => {
  // iso: YYYY-MM-DD
  return new Date(`${iso}T12:00:00.000Z`).toISOString()
}

export default function GranjaSalidaMuertePage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [bajasRecientes, setBajasRecientes] = useState<Baja[]>([])

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  const [form, setForm] = useState({
    fecha: hoyISO(),
    ubicacion_id: '',
    lote_id: '',
    cantidad: '',
    hembras: '',
    machos: '',
    motivo: '',
    foto_url: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: hoyISO(),
      ubicacion_id: '',
      lote_id: '',
      cantidad: '',
      hembras: '',
      machos: '',
      motivo: '',
      foto_url: '',
      observaciones: '',
    })

  const ubicMap = useMemo(() => {
    const m = new Map<number, Ubicacion>()
    for (const u of ubicaciones) m.set(u.id, u)
    return m
  }, [ubicaciones])

  const loteMap = useMemo(() => {
    const m = new Map<number, Lote>()
    for (const l of lotes) m.set(l.id, l)
    return m
  }, [lotes])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: ubicData, error: ubicError },
        { data: loteData, error: loteError },
        { data: bajasData, error: bajasError },
      ] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        // ⚠️ granja_lotes NO tiene "activo"
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('fecha', { ascending: false })
          .limit(200),

        supabase
          .from('granja_bajas_muerte')
          .select(
            'id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos, motivo, foto_url, observaciones, reportado_por'
          )
          .order('id', { ascending: false })
          .limit(30),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (loteError) console.error('Error cargando lotes', loteError)
      if (bajasError) console.error('Error cargando bajas', bajasError)

      setUbicaciones((ubicData as Ubicacion[]) || [])
      setLotes((loteData as Lote[]) || [])
      setBajasRecientes((bajasData as Baja[]) || [])

      // set default ubicacion si está vacío
      const u0 = (ubicData as Ubicacion[])?.[0]
      if (!form.ubicacion_id && u0?.id) {
        setForm((prev) => ({ ...prev, ubicacion_id: String(u0.id) }))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const guardarBaja = async () => {
    if (guardando) return

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
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) console.error('Error obteniendo usuario', userErr)
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
          observaciones: form.observaciones?.trim()
            ? form.observaciones.trim()
            : null,
          reportado_por: userId, // por si RLS lo exige
        })
        .select('id')
        .single()

      if (bajaErr || !bajaInsertada) {
        console.error('Error guardando baja', bajaErr)
        alert('No se pudo guardar la baja por muerte.')
        return
      }

      // 2) movimiento de inventario
      // ✅ IMPORTANTE: guardar cantidad POSITIVA y dejar que el inventario reste por tipo.
      const { error: movErr } = await supabase.from('granja_movimientos').insert({
        fecha: fechaISOaTimestampMediodia(form.fecha),
        ubicacion_id: Number(form.ubicacion_id),
        tipo: 'SALIDA_MUERTE',
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        cantidad: cantidad, // <-- POSITIVO (inventario lo resta por tipo)
        hembras: hembrasNum,
        machos: machosNum,
        referencia_tabla: 'granja_bajas_muerte',
        referencia_id: bajaInsertada.id,
        user_id: userId, // por si RLS lo exige
        observaciones: form.motivo?.trim()
          ? `Salida por muerte: ${form.motivo.trim()}`
          : 'Salida de cerdos por muerte',
      })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert(
          'Baja guardada, pero hubo un problema al registrar el movimiento de inventario.'
        )
      } else {
        alert('Baja por muerte registrada correctamente.')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const eliminarBaja = async (baja: Baja) => {
    if (eliminandoId) return
    if (!confirm(`¿Eliminar la baja #${baja.id}? Esto revertirá el inventario.`))
      return

    setEliminandoId(baja.id)
    try {
      // 1) borrar movimientos ligados a esta baja (revierte inventario)
      const { error: delMovErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_bajas_muerte')
        .eq('referencia_id', baja.id)
        .eq('tipo', 'SALIDA_MUERTE')

      if (delMovErr) {
        console.error('Error eliminando movimientos de la baja', delMovErr)
        alert(
          'No se pudo eliminar el movimiento de inventario. No se eliminó la baja.'
        )
        return
      }

      // 2) borrar la baja
      const { error: delBajaErr } = await supabase
        .from('granja_bajas_muerte')
        .delete()
        .eq('id', baja.id)

      if (delBajaErr) {
        console.error('Error eliminando baja', delBajaErr)
        alert(
          'Se eliminó el movimiento de inventario, pero no se pudo eliminar la baja.'
        )
        return
      }

      alert('Baja eliminada y inventario revertido.')
      await cargarDatos()
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
        {/* Formulario */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva baja por muerte</h2>

          {loading && (
            <p className="text-xs text-gray-500 mb-2">Cargando catálogos…</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.fecha}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fecha: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo o jaula)
              </label>
              <select
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.ubicacion_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, ubicacion_id: e.target.value }))
                }
              >
                <option value="">— Selecciona —</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
              {form.ubicacion_id ? (
                <div className="text-[11px] text-gray-500 mt-1">
                  Seleccionado: {ubicMap.get(Number(form.ubicacion_id))?.codigo}
                </div>
              ) : null}
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Lote (opcional)
              </label>
              <select
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.lote_id}
                onChange={(e) =>
                  setForm((p) => ({ ...p, lote_id: e.target.value }))
                }
              >
                <option value="">Sin lote específico</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Cantidad de cerdos
              </label>
              <input
                type="number"
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.cantidad}
                onChange={(e) =>
                  setForm((p) => ({ ...p, cantidad: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Hembras (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.hembras}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hembras: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Machos (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full px-2 py-2 text-sm"
                value={form.machos}
                onChange={(e) =>
                  setForm((p) => ({ ...p, machos: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Motivo</label>
              <input
                className="border rounded w-full px-2 py-2 text-sm"
                placeholder="Ejemplo: aplastado, enfermedad, accidente"
                value={form.motivo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, motivo: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                URL de foto (opcional)
              </label>
              <input
                className="border rounded w-full px-2 py-2 text-sm"
                placeholder="Pegue aquí la URL de la foto si existe"
                value={form.foto_url}
                onChange={(e) =>
                  setForm((p) => ({ ...p, foto_url: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Observaciones
              </label>
              <textarea
                className="border rounded w-full px-2 py-2 text-sm min-h-[90px]"
                value={form.observaciones}
                onChange={(e) =>
                  setForm((p) => ({ ...p, observaciones: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarBaja}
              disabled={guardando}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar baja'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Bajas recientes</h2>

          {bajasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay bajas registradas.</p>
          ) : (
            <div className="space-y-3">
              {bajasRecientes.map((b) => {
                const u = ubicMap.get(b.ubicacion_id)
                const l = b.lote_id ? loteMap.get(b.lote_id) : null
                return (
                  <div
                    key={b.id}
                    className="border rounded p-3 flex items-start justify-between gap-3"
                  >
                    <div className="text-sm">
                      <div className="font-semibold">
                        #{b.id} · {b.fecha} · Cant: {b.cantidad}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Ubicación: {u ? u.codigo : `#${b.ubicacion_id}`}
                        {l ? ` · Lote: ${l.codigo}` : ''}
                      </div>
                      {b.motivo ? (
                        <div className="text-xs text-gray-600 mt-1">
                          Motivo: {b.motivo}
                        </div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => eliminarBaja(b)}
                      disabled={eliminandoId === b.id}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1 rounded text-xs"
                    >
                      {eliminandoId === b.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
