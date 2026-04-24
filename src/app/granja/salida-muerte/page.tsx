'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  activo: boolean
}

type Lote = {
  id: number
  codigo: string
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
  granja_ubicaciones?: { codigo: string; nombre: string | null } | null
  granja_lotes?: { codigo: string } | null
}

function todayISODate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function asIntOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

export default function GranjaSalidaMuertePage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [bajas, setBajas] = useState<Baja[]>([])

  const [fecha, setFecha] = useState<string>(todayISODate())
  const [ubicacionId, setUbicacionId] = useState<string>('')
  const [loteId, setLoteId] = useState<string>('')

  const [cantidad, setCantidad] = useState<string>('1')
  const [hembras, setHembras] = useState<string>('')
  const [machos, setMachos] = useState<string>('')

  const [motivo, setMotivo] = useState<string>('')
  const [fotoUrl, setFotoUrl] = useState<string>('')
  const [observaciones, setObservaciones] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [guardando, setGuardando] = useState<boolean>(false)

  const ubicacionSeleccionada = useMemo(() => {
    const idNum = Number(ubicacionId || 0)
    return ubicaciones.find(u => u.id === idNum) || null
  }, [ubicacionId, ubicaciones])

  const cargar = async () => {
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
          .select('id, codigo')
          .order('codigo', { ascending: false }),
        supabase
          .from('granja_bajas_muerte')
          .select(
            `
            id, fecha, ubicacion_id, lote_id, cantidad, hembras, machos, motivo, foto_url, observaciones, created_at,
            granja_ubicaciones ( codigo, nombre ),
            granja_lotes ( codigo )
          `
          )
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (uRes.error) console.error('Error cargando ubicaciones', uRes.error)
      if (lRes.error) console.error('Error cargando lotes', lRes.error)
      if (bRes.error) console.error('Error cargando bajas', bRes.error)

      setUbicaciones((uRes.data as Ubicacion[]) || [])
      setLotes((lRes.data as Lote[]) || [])
      setBajas((bRes.data as Baja[]) || [])

      // set default ubicacion si está vacío
      if (!ubicacionId && (uRes.data || []).length > 0) {
        setUbicacionId(String((uRes.data as any[])[0].id))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const limpiar = () => {
    setFecha(todayISODate())
    setLoteId('')
    setCantidad('1')
    setHembras('')
    setMachos('')
    setMotivo('')
    setFotoUrl('')
    setObservaciones('')
  }

  const guardarBaja = async () => {
    if (guardando) return

    const cantN = asIntOrNull(cantidad)
    if (!ubicacionId) return alert('Selecciona una ubicación.')
    if (!fecha) return alert('Selecciona una fecha.')
    if (!cantN || cantN <= 0) return alert('Cantidad debe ser un número mayor a 0.')

    const hemN = asIntOrNull(hembras)
    const machN = asIntOrNull(machos)
    const loteN = asIntOrNull(loteId)

    setGuardando(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth?.user?.id ?? null

      // 1) Insertar baja
      const bajaPayload = {
        fecha,
        ubicacion_id: Number(ubicacionId),
        lote_id: loteN,
        cantidad: cantN,
        hembras: hemN,
        machos: machN,
        motivo: motivo.trim() ? motivo.trim() : null,
        foto_url: fotoUrl.trim() ? fotoUrl.trim() : null,
        observaciones: observaciones.trim() ? observaciones.trim() : null,
        reportado_por: userId,
      }

      const { data: bajaIns, error: bajaErr } = await supabase
        .from('granja_bajas_muerte')
        .insert(bajaPayload)
        .select('id')
        .single()

      if (bajaErr || !bajaIns?.id) {
        console.error('Error insertando granja_bajas_muerte', bajaErr)
        alert('Error guardando baja (granja_bajas_muerte). Revisa consola.')
        return
      }

      const bajaId = Number(bajaIns.id)

      // 2) Insertar movimiento (NEGATIVO para descontar)
      //    Importante: el inventario teórico suma cantidad tal cual, por eso salida debe ser negativa
      const movPayload = {
        fecha: new Date(`${fecha}T12:00:00`).toISOString(), // evita líos de zona horaria
        ubicacion_id: Number(ubicacionId),
        tipo: 'SALIDA_MUERTE',
        lote_id: loteN,
        cantidad: -Math.abs(cantN),
        hembras: hemN != null ? -Math.abs(hemN) : null,
        machos: machN != null ? -Math.abs(machN) : null,
        peso_total_kg: null,
        referencia_tabla: 'granja_bajas_muerte',
        referencia_id: bajaId,
        user_id: userId,
        observaciones:
          (motivo.trim() ? `Motivo: ${motivo.trim()}. ` : '') +
          (observaciones.trim() ? observaciones.trim() : ''),
      }

      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .insert(movPayload)

      if (movErr) {
        console.error('Error insertando granja_movimientos (SALIDA_MUERTE)', movErr)
        // rollback: si no se pudo insertar movimiento, borro la baja para no dejar inconsistencia
        await supabase.from('granja_bajas_muerte').delete().eq('id', bajaId)
        alert(
          'No se pudo afectar el inventario (granja_movimientos). Se revirtió la baja. Revisa consola (posible RLS 403).'
        )
        return
      }

      alert('Baja registrada y descontada del inventario.')
      limpiar()
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  const eliminarBaja = async (baja: Baja) => {
    if (!confirm(`¿Eliminar la baja #${baja.id}? Esto revertirá el inventario.`)) return

    try {
      // 1) borrar movimientos ligados a esta baja
      const { error: delMovErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_bajas_muerte')
        .eq('referencia_id', baja.id)
        .eq('tipo', 'SALIDA_MUERTE')

      if (delMovErr) {
        console.error('Error eliminando movimientos de la baja', delMovErr)
        alert('No se pudo eliminar el movimiento que afecta inventario (posible RLS). Revisa consola.')
        return
      }

      // 2) borrar baja
      const { error: delBajaErr } = await supabase
        .from('granja_bajas_muerte')
        .delete()
        .eq('id', baja.id)

      if (delBajaErr) {
        console.error('Error eliminando baja', delBajaErr)
        alert('No se pudo eliminar la baja. Revisa consola.')
        return
      }

      alert('Baja eliminada y movimiento revertido.')
      await cargar()
    } catch (e) {
      console.error(e)
      alert('Error inesperado eliminando la baja.')
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
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

          <div className="grid gap-3 text-sm">
            <div>
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded w-full px-3 py-2"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo o jaula)
              </label>
              <select
                className="border rounded w-full px-3 py-2"
                value={ubicacionId}
                onChange={e => setUbicacionId(e.target.value)}
                disabled={loading}
              >
                <option value="">Seleccione una ubicación</option>
                {ubicaciones.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre ?? u.codigo}
                  </option>
                ))}
              </select>
              {ubicacionSeleccionada ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  Seleccionado: {ubicacionSeleccionada.codigo}
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Lote (opcional)
              </label>
              <select
                className="border rounded w-full px-3 py-2"
                value={loteId}
                onChange={e => setLoteId(e.target.value)}
                disabled={loading}
              >
                <option value="">Sin lote específico</option>
                {lotes.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Cantidad de cerdos</label>
                <input
                  type="number"
                  className="border rounded w-full px-3 py-2"
                  value={cantidad}
                  onChange={e => setCantidad(e.target.value)}
                  min={1}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Hembras (opcional)</label>
                <input
                  type="number"
                  className="border rounded w-full px-3 py-2"
                  value={hembras}
                  onChange={e => setHembras(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos (opcional)</label>
              <input
                type="number"
                className="border rounded w-full px-3 py-2"
                value={machos}
                onChange={e => setMachos(e.target.value)}
                min={0}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Motivo</label>
              <input
                className="border rounded w-full px-3 py-2"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ejemplo: aplastado, enfermedad, accidente"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">URL de foto (opcional)</label>
              <input
                className="border rounded w-full px-3 py-2"
                value={fotoUrl}
                onChange={e => setFotoUrl(e.target.value)}
                placeholder="Pegue aquí la URL de la foto si existe"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Observaciones</label>
              <textarea
                className="border rounded w-full px-3 py-2 min-h-[90px]"
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={guardarBaja}
                disabled={guardando}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded"
              >
                {guardando ? 'Guardando…' : 'Guardar baja'}
              </button>
              <button
                onClick={limpiar}
                type="button"
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Bajas recientes</h2>

          {loading ? (
            <p className="text-xs text-gray-500">Cargando…</p>
          ) : bajas.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay bajas registradas.</p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-auto pr-2">
              {bajas.map(b => (
                <div key={b.id} className="border rounded p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        #{b.id} · {b.fecha}
                      </div>
                      <div className="text-xs text-gray-600">
                        Ubicación:{' '}
                        <span className="font-medium">
                          {b.granja_ubicaciones?.codigo ?? `ID ${b.ubicacion_id}`}
                        </span>
                        {b.granja_lotes?.codigo ? (
                          <>
                            {' '}
                            · Lote: <span className="font-medium">{b.granja_lotes.codigo}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        Cant.: <span className="font-semibold">{b.cantidad}</span>
                        {b.hembras != null ? (
                          <span className="ml-3">H: {b.hembras}</span>
                        ) : null}
                        {b.machos != null ? (
                          <span className="ml-3">M: {b.machos}</span>
                        ) : null}
                      </div>
                      {b.motivo ? (
                        <div className="text-xs mt-1">
                          <span className="font-semibold">Motivo:</span> {b.motivo}
                        </div>
                      ) : null}
                      {b.observaciones ? (
                        <div className="text-xs mt-1 text-gray-700">
                          {b.observaciones}
                        </div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => eliminarBaja(b)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-xs whitespace-nowrap"
                    >
                      Eliminar
                    </button>
                  </div>

                  {b.foto_url ? (
                    <div className="mt-2 text-xs">
                      Foto:{" "}
                      <a
                        className="text-blue-600 underline break-all"
                        href={b.foto_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {b.foto_url}
                      </a>
                    </div>
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
