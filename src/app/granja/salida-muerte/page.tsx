'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
  fecha: string
  tipo_origen: string
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
  created_at: string | null
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

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
      const [uRes, lRes, bRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('fecha', { ascending: false })
          .limit(200),
        supabase
          .from('granja_bajas_muerte')
          .select(
            'id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos, motivo, foto_url, observaciones, reportado_por, created_at'
          )
          .order('fecha', { ascending: false })
          .limit(40),
      ])

      if (uRes.error) console.error('Error cargando ubicaciones', uRes.error)
      if (lRes.error) console.error('Error cargando lotes', lRes.error)
      if (bRes.error) console.error('Error cargando bajas', bRes.error)

      setUbicaciones(((uRes.data ?? []) as any[]).map((r) => ({
        id: Number(r.id),
        codigo: String(r.codigo),
        nombre: r.nombre ?? null,
      })))

      setLotes(((lRes.data ?? []) as any[]).map((r) => ({
        id: Number(r.id),
        codigo: String(r.codigo),
        fecha: String(r.fecha),
        tipo_origen: String(r.tipo_origen),
      })))

      setBajasRecientes(((bRes.data ?? []) as any[]).map((r) => ({
        id: Number(r.id),
        fecha: String(r.fecha),
        ubicacion_id: Number(r.ubicacion_id),
        lote_id: r.lote_id != null ? Number(r.lote_id) : null,
        cantidad: Number(r.cantidad ?? 0),
        hembras: r.hembras != null ? Number(r.hembras) : null,
        machos: r.machos != null ? Number(r.machos) : null,
        motivo: r.motivo ?? null,
        foto_url: r.foto_url ?? null,
        observaciones: r.observaciones ?? null,
        reportado_por: r.reportado_por ?? null,
        created_at: r.created_at ?? null,
      })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

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
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) console.error('Error obteniendo usuario', userErr)
      const userId = userData?.user?.id ?? null

      // 1) Insertar baja
      const { data: bajaIns, error: bajaErr } = await supabase
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
          reportado_por: userId,
        })
        .select('id')
        .single()

      if (bajaErr || !bajaIns) {
        console.error('Error guardando baja', bajaErr)
        alert('No se pudo guardar la baja por muerte.')
        return
      }

      // 2) Insertar movimiento que afecta inventario (NEGATIVO)
      const { error: movErr } = await supabase.from('granja_movimientos').insert({
        ubicacion_id: Number(form.ubicacion_id),
        tipo: 'SALIDA_MUERTE',
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        cantidad: -Math.abs(cantidad), // SIEMPRE negativo para debitar
        hembras: hembrasNum,
        machos: machosNum,
        referencia_tabla: 'granja_bajas_muerte',
        referencia_id: bajaIns.id,
        user_id: userId,
        observaciones: form.motivo?.trim()
          ? `Salida por muerte: ${form.motivo.trim()}`
          : 'Salida de cerdos por muerte',
      })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert(
          'Baja guardada, pero NO se pudo registrar el movimiento de inventario (revisa RLS/políticas en granja_movimientos).'
        )
      } else {
        alert('Baja por muerte registrada correctamente (inventario debitado).')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const eliminarBaja = async (bajaId: number) => {
    if (!confirm(`¿Eliminar la baja #${bajaId}? Esto restaurará el inventario.`))
      return

    setEliminandoId(bajaId)
    try {
      // 1) borrar movimientos asociados (esto "revierte" el inventario porque el inventario es suma de movimientos)
      const { error: delMovErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('tipo', 'SALIDA_MUERTE')
        .eq('referencia_tabla', 'granja_bajas_muerte')
        .eq('referencia_id', bajaId)

      if (delMovErr) {
        console.error('Error eliminando movimientos asociados', delMovErr)
        alert(
          'No se pudo eliminar el/los movimientos asociados. No se eliminó la baja.'
        )
        return
      }

      // 2) borrar la baja
      const { error: delBajaErr } = await supabase
        .from('granja_bajas_muerte')
        .delete()
        .eq('id', bajaId)

      if (delBajaErr) {
        console.error('Error eliminando baja', delBajaErr)
        alert(
          'Se eliminaron los movimientos, pero no se pudo eliminar la baja (revisa RLS/políticas).'
        )
        return
      }

      alert('Baja eliminada. Inventario restaurado.')
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
                className="border rounded w-full p-2 text-sm"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo o jaula)
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.ubicacion_id}
                onChange={(e) =>
                  setForm({ ...form, ubicacion_id: e.target.value })
                }
              >
                <option value="">Seleccione una ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Lote (opcional)
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.lote_id}
                onChange={(e) => setForm({ ...form, lote_id: e.target.value })}
              >
                <option value="">Sin lote específico</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.fecha})
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
                className="border rounded w-full p-2 text-sm"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Hembras (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.hembras}
                onChange={(e) => setForm({ ...form, hembras: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Machos (opcional)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.machos}
                onChange={(e) => setForm({ ...form, machos: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Motivo</label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Ejemplo: aplastado, enfermedad, accidente"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                URL de foto (opcional)
              </label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Pegue aquí la URL de la foto si existe"
                value={form.foto_url}
                onChange={(e) => setForm({ ...form, foto_url: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Observaciones
              </label>
              <textarea
                className="border rounded w-full p-2 text-sm"
                rows={3}
                value={form.observaciones}
                onChange={(e) =>
                  setForm({ ...form, observaciones: e.target.value })
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
              className="bg-gray-200 px-4 py-2 rounded text-sm"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Bajas recientes */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Bajas recientes</h2>
          {bajasRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay bajas registradas.</p>
          ) : (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">H</th>
                    <th className="p-2 text-right">M</th>
                    <th className="p-2 text-left">Motivo</th>
                    <th className="p-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {bajasRecientes.map((b) => {
                    const u = ubicMap.get(b.ubicacion_id)
                    const l = b.lote_id ? loteMap.get(b.lote_id) : undefined

                    return (
                      <tr key={b.id} className="border-t">
                        <td className="p-2">{b.fecha}</td>
                        <td className="p-2">
                          {u
                            ? `${u.codigo}${u.nombre ? ` — ${u.nombre}` : ''}`
                            : `#${b.ubicacion_id}`}
                        </td>
                        <td className="p-2">{l ? l.codigo : '—'}</td>
                        <td className="p-2 text-right">{b.cantidad}</td>
                        <td className="p-2 text-right">
                          {b.hembras != null ? b.hembras : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {b.machos != null ? b.machos : '—'}
                        </td>
                        <td className="p-2">{b.motivo || '—'}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => eliminarBaja(b.id)}
                            disabled={eliminandoId === b.id}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-2 py-1 rounded text-[11px]"
                          >
                            {eliminandoId === b.id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
