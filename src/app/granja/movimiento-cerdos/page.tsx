'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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

type MovimientoRow = {
  id: number
  fecha: string
  ubicacion_id: number
  cantidad: number
  observaciones: string | null
  granja_ubicaciones?: { codigo: string | null; nombre: string | null } | null
}

const toInt = (v: any) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

function todayYYYYMMDD() {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MovimientoCerdosPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [fecha, setFecha] = useState<string>(todayYYYYMMDD())
  const [origenId, setOrigenId] = useState<string>('')
  const [destinoId, setDestinoId] = useState<string>('')
  const [loteId, setLoteId] = useState<string>('') // opcional
  const [cantidad, setCantidad] = useState<string>('')

  const [hembras, setHembras] = useState<string>('') // opcional
  const [machos, setMachos] = useState<string>('') // opcional
  const [pesoTotalKg, setPesoTotalKg] = useState<string>('') // opcional

  const [observaciones, setObservaciones] = useState<string>('')

  // Lista reciente de traslados (solo para ver)
  const [recientes, setRecientes] = useState<MovimientoRow[]>([])

  const cargarCatalogos = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, lRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre, activo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo')
          .order('codigo', { ascending: true }),
      ])

      if (uRes.error) {
        console.error(uRes.error)
        alert('Error cargando ubicaciones.')
        return
      }
      if (lRes.error) {
        console.error(lRes.error)
        // lotes es opcional, si falla no bloquea todo
      }

      setUbicaciones((uRes.data || []) as Ubicacion[])
      setLotes((lRes.data || []) as Lote[])
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarRecientes = useCallback(async () => {
    // Nota: como guardamos traslados como AJUSTE, filtramos por observaciones que contengan "TRASLADO"
    const { data, error } = await supabase
      .from('granja_movimientos')
      .select('id, fecha, ubicacion_id, cantidad, observaciones, granja_ubicaciones ( codigo, nombre )')
      .ilike('observaciones', '%TRASLADO%')
      .order('fecha', { ascending: false })
      .limit(20)

    if (!error) setRecientes((data || []) as any)
  }, [])

  useEffect(() => {
    cargarCatalogos()
    cargarRecientes()
  }, [cargarCatalogos, cargarRecientes])

  const ubicacionLabel = useMemo(() => {
    const m = new Map<number, string>()
    for (const u of ubicaciones) {
      const label = `${u.codigo}${u.nombre ? ` — ${u.nombre}` : ''}`
      m.set(u.id, label)
    }
    return m
  }, [ubicaciones])

  const validar = () => {
    const o = Number(origenId || 0)
    const d = Number(destinoId || 0)
    const c = toInt(cantidad)

    if (!fecha) return 'Selecciona fecha.'
    if (!o) return 'Selecciona ubicación de origen.'
    if (!d) return 'Selecciona ubicación de destino.'
    if (o === d) return 'Origen y destino no pueden ser la misma ubicación.'
    if (c <= 0) return 'Cantidad debe ser mayor a 0.'

    const h = hembras.trim() === '' ? null : toInt(hembras)
    const m = machos.trim() === '' ? null : toInt(machos)

    if (h !== null && h < 0) return 'Hembras no puede ser negativo.'
    if (m !== null && m < 0) return 'Machos no puede ser negativo.'
    if (h !== null && m !== null && h + m > c) return 'Hembras + machos no puede ser mayor que la cantidad.'

    return null
  }

  const guardarTraslado = async () => {
    const err = validar()
    if (err) {
      alert(err)
      return
    }

    setGuardando(true)
    try {
      const o = Number(origenId)
      const d = Number(destinoId)
      const c = toInt(cantidad)

      const h = hembras.trim() === '' ? null : toInt(hembras)
      const m = machos.trim() === '' ? null : toInt(machos)
      const p = pesoTotalKg.trim() === '' ? null : Number(pesoTotalKg)

      const lote = loteId ? Number(loteId) : null

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      // Guardamos como 2 movimientos AJUSTE:
      // - origen: cantidad negativa
      // - destino: cantidad positiva
      // Así el stock teórico queda correcto con tu lógica actual.
      const obsBase = `TRASLADO ${ubicacionLabel.get(o) || o} -> ${ubicacionLabel.get(d) || d}`
      const obs = observaciones.trim() ? `${obsBase}. ${observaciones.trim()}` : obsBase

      const rows = [
        {
          fecha: `${fecha}T12:00:00.000Z`, // fijo al mediodía UTC para evitar problemas de TZ
          ubicacion_id: o,
          tipo: 'AJUSTE',
          lote_id: lote,
          cantidad: -Math.abs(c),
          hembras: h !== null ? -Math.abs(h) : null,
          machos: m !== null ? -Math.abs(m) : null,
          peso_total_kg: p !== null ? -Math.abs(p) : null,
          referencia_tabla: 'TRASLADO',
          referencia_id: null,
          user_id: userId,
          observaciones: obs,
        },
        {
          fecha: `${fecha}T12:00:00.000Z`,
          ubicacion_id: d,
          tipo: 'AJUSTE',
          lote_id: lote,
          cantidad: Math.abs(c),
          hembras: h !== null ? Math.abs(h) : null,
          machos: m !== null ? Math.abs(m) : null,
          peso_total_kg: p !== null ? Math.abs(p) : null,
          referencia_tabla: 'TRASLADO',
          referencia_id: null,
          user_id: userId,
          observaciones: obs,
        },
      ]

      const { error } = await supabase.from('granja_movimientos').insert(rows)

      if (error) {
        console.error(error)
        alert('No se pudo registrar el movimiento (revisa permisos/RLS).')
        return
      }

      alert('Movimiento registrado.')
      setCantidad('')
      setHembras('')
      setMachos('')
      setPesoTotalKg('')
      setObservaciones('')
      setLoteId('')
      await cargarRecientes()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">🔁 Movimiento de cerdos (traslado)</h1>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Mueve cerdos de una ubicación a otra. Se registra como dos movimientos tipo <b>AJUSTE</b> (origen negativo, destino positivo).
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Form */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo movimiento</h2>

          <div className="grid gap-3 text-sm">
            <div>
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded p-2 w-full"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Origen</label>
              <select
                className="border rounded p-2 w-full"
                value={origenId}
                onChange={(e) => setOrigenId(e.target.value)}
              >
                <option value="">— Selecciona origen —</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Destino</label>
              <select
                className="border rounded p-2 w-full"
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
              >
                <option value="">— Selecciona destino —</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Lote (opcional)</label>
              <select
                className="border rounded p-2 w-full"
                value={loteId}
                onChange={(e) => setLoteId(e.target.value)}
              >
                <option value="">— Sin lote —</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Cantidad</label>
                <input
                  type="number"
                  className="border rounded p-2 w-full"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Peso total (kg) (opcional)</label>
                <input
                  type="number"
                  className="border rounded p-2 w-full"
                  value={pesoTotalKg}
                  onChange={(e) => setPesoTotalKg(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Hembras (opcional)</label>
                <input
                  type="number"
                  className="border rounded p-2 w-full"
                  value={hembras}
                  onChange={(e) => setHembras(e.target.value)}
                  min={0}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Machos (opcional)</label>
                <input
                  type="number"
                  className="border rounded p-2 w-full"
                  value={machos}
                  onChange={(e) => setMachos(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Observaciones (opcional)</label>
              <input
                className="border rounded p-2 w-full"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>

            <button
              onClick={guardarTraslado}
              disabled={guardando || loading}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {guardando ? 'Guardando…' : 'Guardar movimiento'}
            </button>

            {loading ? <div className="text-xs text-gray-500">Cargando catálogos…</div> : null}
          </div>
        </div>

        {/* Recientes */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Movimientos recientes (traslados)</h2>
          <p className="text-xs text-gray-500 mb-3">
            Se muestran los movimientos con observaciones que contienen “TRASLADO”.
          </p>

          <div className="border rounded overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-200">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Ubicación</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2 text-left">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {recientes.length === 0 ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={4}>
                      No hay traslados recientes.
                    </td>
                  </tr>
                ) : (
                  recientes.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{String(r.fecha).slice(0, 10)}</td>
                      <td className="p-2">
                        {r.granja_ubicaciones?.codigo || r.ubicacion_id}
                      </td>
                      <td className="p-2 text-right">{r.cantidad}</td>
                      <td className="p-2">{r.observaciones || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <button
            onClick={cargarRecientes}
            className="mt-3 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
          >
            Recargar
          </button>
        </div>
      </div>
    </div>
  )
}