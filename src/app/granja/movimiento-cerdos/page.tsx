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

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string | null
  ubicacion_id: number | null
  activa: boolean
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
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
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [tipoTraslado, setTipoTraslado] = useState<'NORMAL' | 'CERDA'>('NORMAL')

  const [fecha, setFecha] = useState<string>(todayYYYYMMDD())
  const [origenId, setOrigenId] = useState<string>('')
  const [destinoId, setDestinoId] = useState<string>('')
  const [loteId, setLoteId] = useState<string>('')

  const [cerdaId, setCerdaId] = useState<string>('')

  const [cantidad, setCantidad] = useState<string>('')
  const [hembras, setHembras] = useState<string>('')
  const [machos, setMachos] = useState<string>('')
  const [pesoTotalKg, setPesoTotalKg] = useState<string>('')

  const [observaciones, setObservaciones] = useState<string>('')

  const [recientes, setRecientes] = useState<MovimientoRow[]>([])

  const cargarCatalogos = useCallback(async () => {
    setLoading(true)

    try {
      const [uRes, lRes, cRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre, activo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        supabase
          .from('granja_lotes')
          .select('id, codigo')
          .order('codigo', { ascending: true }),

        supabase
          .from('granja_cerdas')
          .select(
            'id, arete, nombre, estado, ubicacion_id, activa, granja_ubicaciones ( codigo, nombre )'
          )
          .eq('activa', true)
          .order('arete', { ascending: true }),
      ])

      if (uRes.error) {
        console.error(uRes.error)
        alert('Error cargando ubicaciones.')
        return
      }

      if (lRes.error) {
        console.error(lRes.error)
      }

      if (cRes.error) {
        console.error(cRes.error)
        alert('Error cargando cerdas.')
        return
      }

      const cerdasActivas = ((cRes.data || []) as any[]).filter((cerda) => {
        const estado = String(cerda.estado || '').toUpperCase()
        return estado !== 'MUERTA' && estado !== 'BAJA'
      }) as Cerda[]

      setUbicaciones((uRes.data || []) as Ubicacion[])
      setLotes((lRes.data || []) as Lote[])
      setCerdas(cerdasActivas)
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarRecientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('granja_movimientos')
      .select('id, fecha, ubicacion_id, cantidad, observaciones, granja_ubicaciones ( codigo, nombre )')
      .ilike('observaciones', '%TRASLADO%')
      .order('fecha', { ascending: false })
      .limit(30)

    if (!error) {
      setRecientes((data || []) as any)
    }
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

  const cerdasFiltradasPorOrigen = useMemo(() => {
    const origen = Number(origenId || 0)

    if (!origen) return cerdas

    return cerdas.filter((cerda) => Number(cerda.ubicacion_id || 0) === origen)
  }, [cerdas, origenId])

  const cerdaSeleccionada = useMemo(() => {
    const id = Number(cerdaId || 0)
    if (!id) return null

    return cerdas.find((cerda) => Number(cerda.id) === id) || null
  }, [cerdaId, cerdas])

  const limpiarFormularioDespuesGuardar = () => {
    setCantidad('')
    setHembras('')
    setMachos('')
    setPesoTotalKg('')
    setObservaciones('')
    setLoteId('')
    setCerdaId('')
  }

  const validar = () => {
    const o = Number(origenId || 0)
    const d = Number(destinoId || 0)

    if (!fecha) return 'Selecciona fecha.'
    if (!o) return 'Selecciona ubicación de origen.'
    if (!d) return 'Selecciona ubicación de destino.'
    if (o === d) return 'Origen y destino no pueden ser la misma ubicación.'

    if (tipoTraslado === 'CERDA') {
      if (!cerdaId) return 'Selecciona la cerda que se va a mover.'

      const cerda = cerdaSeleccionada

      if (!cerda) return 'No se encontró la cerda seleccionada.'
      if (Number(cerda.ubicacion_id || 0) !== o) {
        return 'La cerda seleccionada no pertenece a la ubicación de origen.'
      }

      return null
    }

    const c = toInt(cantidad)

    if (c <= 0) return 'Cantidad debe ser mayor a 0.'

    const h = hembras.trim() === '' ? null : toInt(hembras)
    const m = machos.trim() === '' ? null : toInt(machos)

    if (h !== null && h < 0) return 'Hembras no puede ser negativo.'
    if (m !== null && m < 0) return 'Machos no puede ser negativo.'
    if (h !== null && m !== null && h + m > c) {
      return 'Hembras + machos no puede ser mayor que la cantidad.'
    }

    return null
  }

  const guardarTrasladoNormal = async () => {
    const o = Number(origenId)
    const d = Number(destinoId)
    const c = toInt(cantidad)

    const h = hembras.trim() === '' ? null : toInt(hembras)
    const m = machos.trim() === '' ? null : toInt(machos)
    const p = pesoTotalKg.trim() === '' ? null : Number(pesoTotalKg)

    const lote = loteId ? Number(loteId) : null

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id ?? null

    const obsBase = `TRASLADO NORMAL ${ubicacionLabel.get(o) || o} -> ${
      ubicacionLabel.get(d) || d
    }`

    const detalleSexo =
      h !== null || m !== null
        ? ` Hembras: ${h ?? 0}. Machos: ${m ?? 0}.`
        : ''

    const obs = observaciones.trim()
      ? `${obsBase}.${detalleSexo} ${observaciones.trim()}`
      : `${obsBase}.${detalleSexo}`

    const rows = [
      {
        fecha: `${fecha}T12:00:00.000Z`,
        ubicacion_id: o,
        tipo: 'AJUSTE',
        lote_id: lote,
        cantidad: -Math.abs(c),
        hembras: h !== null ? -Math.abs(h) : null,
        machos: m !== null ? -Math.abs(m) : null,
        peso_total_kg: p !== null ? -Math.abs(p) : null,
        referencia_tabla: 'TRASLADO_NORMAL',
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
        referencia_tabla: 'TRASLADO_NORMAL',
        referencia_id: null,
        user_id: userId,
        observaciones: obs,
      },
    ]

    const { error } = await supabase.from('granja_movimientos').insert(rows)

    if (error) {
      console.error(error)
      alert('No se pudo registrar el movimiento normal.')
      return false
    }

    return true
  }

  const guardarTrasladoCerda = async () => {
    const o = Number(origenId)
    const d = Number(destinoId)
    const cerda = cerdaSeleccionada

    if (!cerda) {
      alert('No se encontró la cerda seleccionada.')
      return false
    }

    const lote = loteId ? Number(loteId) : null

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id ?? null

    const origenLabel = ubicacionLabel.get(o) || String(o)
    const destinoLabel = ubicacionLabel.get(d) || String(d)

    const obsBase = `TRASLADO CERDA ARETE ${cerda.arete} — ${origenLabel} -> ${destinoLabel}`

    const obs = observaciones.trim()
      ? `${obsBase}. ${observaciones.trim()}`
      : obsBase

    const rows = [
      {
        fecha: `${fecha}T12:00:00.000Z`,
        ubicacion_id: o,
        tipo: 'AJUSTE',
        lote_id: lote,
        cantidad: -1,
        hembras: -1,
        machos: 0,
        peso_total_kg: null,
        referencia_tabla: 'granja_cerdas',
        referencia_id: cerda.id,
        user_id: userId,
        observaciones: obs,
      },
      {
        fecha: `${fecha}T12:00:00.000Z`,
        ubicacion_id: d,
        tipo: 'AJUSTE',
        lote_id: lote,
        cantidad: 1,
        hembras: 1,
        machos: 0,
        peso_total_kg: null,
        referencia_tabla: 'granja_cerdas',
        referencia_id: cerda.id,
        user_id: userId,
        observaciones: obs,
      },
    ]

    const { error: movError } = await supabase.from('granja_movimientos').insert(rows)

    if (movError) {
      console.error(movError)
      alert('No se pudo registrar el movimiento de inventario de la cerda.')
      return false
    }

    const { error: updateError } = await supabase
      .from('granja_cerdas')
      .update({
        ubicacion_id: d,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cerda.id)

    if (updateError) {
      console.error(updateError)
      alert(
        'Se registró el movimiento, pero no se pudo actualizar la ubicación actual de la cerda. Revisa manualmente.'
      )
      return false
    }

    const { error: eventoError } = await supabase.from('granja_cerda_eventos').insert({
      cerda_id: cerda.id,
      fecha,
      tipo: 'TRASLADO',
      resultado: 'COMPLETADO',
      ubicacion_id: d,
      lote_id: lote,
      datos: {
        arete: cerda.arete,
        origen_id: o,
        destino_id: d,
        origen: origenLabel,
        destino: destinoLabel,
      },
      observaciones: obs,
      user_id: userId,
    })

    if (eventoError) {
      console.error(eventoError)
      alert(
        'La cerda fue trasladada, pero no se pudo guardar el evento en su historial.'
      )
      return true
    }

    return true
  }

  const guardarTraslado = async () => {
    const err = validar()

    if (err) {
      alert(err)
      return
    }

    const mensajeConfirmacion =
      tipoTraslado === 'CERDA'
        ? `Se trasladará la cerda ${cerdaSeleccionada?.arete || ''} de ${
            ubicacionLabel.get(Number(origenId)) || origenId
          } hacia ${ubicacionLabel.get(Number(destinoId)) || destinoId}. ¿Continuar?`
        : `Se trasladarán ${cantidad} cerdo(s) de ${
            ubicacionLabel.get(Number(origenId)) || origenId
          } hacia ${ubicacionLabel.get(Number(destinoId)) || destinoId}. ¿Continuar?`

    const confirmar = confirm(mensajeConfirmacion)
    if (!confirmar) return

    setGuardando(true)

    try {
      const ok =
        tipoTraslado === 'CERDA'
          ? await guardarTrasladoCerda()
          : await guardarTrasladoNormal()

      if (!ok) return

      alert('Movimiento registrado correctamente.')

      limpiarFormularioDespuesGuardar()
      await cargarCatalogos()
      await cargarRecientes()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">🔁 Movimiento de cerdos</h1>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo movimiento</h2>

          <div className="grid gap-3 text-sm">
            <div>
              <label className="block text-xs font-semibold mb-1">Tipo de traslado</label>
              <select
                className="border rounded p-2 w-full"
                value={tipoTraslado}
                onChange={(e) => {
                  const value = e.target.value as 'NORMAL' | 'CERDA'
                  setTipoTraslado(value)
                  setCerdaId('')
                  setCantidad('')
                  setHembras('')
                  setMachos('')
                  setPesoTotalKg('')

                  if (value === 'CERDA') {
                    setCantidad('1')
                    setHembras('1')
                    setMachos('0')
                  }
                }}
              >
                <option value="NORMAL">Traslado normal por cantidad</option>
                <option value="CERDA">Traslado de cerda específica por arete</option>
              </select>
            </div>

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
                onChange={(e) => {
                  setOrigenId(e.target.value)
                  setCerdaId('')
                }}
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

            {tipoTraslado === 'CERDA' ? (
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Cerda a trasladar
                </label>
                <select
                  className="border rounded p-2 w-full"
                  value={cerdaId}
                  onChange={(e) => setCerdaId(e.target.value)}
                  disabled={!origenId}
                >
                  <option value="">
                    {origenId
                      ? '— Selecciona cerda por arete —'
                      : 'Selecciona primero el origen'}
                  </option>

                  {cerdasFiltradasPorOrigen.map((cerda) => (
                    <option key={cerda.id} value={cerda.id}>
                      {cerda.arete}
                      {cerda.nombre ? ` — ${cerda.nombre}` : ''}
                      {cerda.estado ? ` — ${cerda.estado}` : ''}
                    </option>
                  ))}
                </select>

                {origenId && cerdasFiltradasPorOrigen.length === 0 ? (
                  <p className="text-xs text-red-600 mt-1">
                    No hay cerdas activas registradas en esta ubicación.
                  </p>
                ) : null}
              </div>
            ) : null}

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

            {tipoTraslado === 'NORMAL' ? (
              <>
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
                    <label className="block text-xs font-semibold mb-1">
                      Peso total (kg) (opcional)
                    </label>
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
                    <label className="block text-xs font-semibold mb-1">
                      Hembras (opcional)
                    </label>
                    <input
                      type="number"
                      className="border rounded p-2 w-full"
                      value={hembras}
                      onChange={(e) => setHembras(e.target.value)}
                      min={0}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Machos (opcional)
                    </label>
                    <input
                      type="number"
                      className="border rounded p-2 w-full"
                      value={machos}
                      onChange={(e) => setMachos(e.target.value)}
                      min={0}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="border rounded bg-amber-50 p-3 text-xs text-amber-900">
                {cerdaSeleccionada ? (
                  <>
                    <div>
                      <b>Arete:</b> {cerdaSeleccionada.arete}
                    </div>
                    <div>
                      <b>Estado:</b> {cerdaSeleccionada.estado || '—'}
                    </div>
                    <div>
                      <b>Ubicación actual:</b>{' '}
                      {ubicacionLabel.get(Number(cerdaSeleccionada.ubicacion_id || 0)) ||
                        '—'}
                    </div>
                  </>
                ) : (
                  <div>
                    Selecciona una cerda para ver el detalle del traslado.
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">
                Observaciones (opcional)
              </label>
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

            {loading ? (
              <div className="text-xs text-gray-500">Cargando catálogos…</div>
            ) : null}
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Movimientos recientes</h2>
          <p className="text-xs text-gray-500 mb-3">
            Se muestran los movimientos con observaciones que contienen “TRASLADO”.
          </p>

          <div className="border rounded overflow-auto max-h-[650px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-200 sticky top-0">
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
                      <td className="p-2 text-xs">{r.observaciones || '—'}</td>
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
