'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = { id: number; codigo: string; nombre: string | null; activo: boolean | null }
type Cliente = { id: number; nombre: string }
type Lote = { id: number; codigo: string }

type LineaTramo = {
  ubicacion_id: string
  cantidad: string
}

type VentaReciente = {
  id: number
  fecha: string
  cantidad: number
  peso_total_lb: number
  total: number
  clientes?: { nombre?: string } | null
  granja_ubicaciones?: { codigo?: string; nombre?: string } | null
  granja_lotes?: { codigo?: string } | null
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

const genGrupoId = () => {
  // browser uuid
  // @ts-ignore
  return (globalThis.crypto?.randomUUID?.() ?? `g_${Date.now()}_${Math.random().toString(16).slice(2)}`)
}

export default function SalidaVentaPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ventas, setVentas] = useState<VentaReciente[]>([])

  const [fecha, setFecha] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [loteId, setLoteId] = useState('') // opcional

  // ✅ ahora es múltiple
  const [lineas, setLineas] = useState<LineaTramo[]>([{ ubicacion_id: '', cantidad: '' }])

  const [pesoTotalLb, setPesoTotalLb] = useState('')
  const [precioPorLibra, setPrecioPorLibra] = useState('')
  const [pagado, setPagado] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [saving, setSaving] = useState(false)

  const totalCantidad = useMemo(() => lineas.reduce((acc, l) => acc + toNum(l.cantidad), 0), [lineas])

  const totalVenta = useMemo(() => round2(toNum(pesoTotalLb) * toNum(precioPorLibra)), [pesoTotalLb, precioPorLibra])

  const deuda = useMemo(() => {
    const d = totalVenta - toNum(pagado)
    return round2(d < 0 ? 0 : d)
  }, [totalVenta, pagado])

  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    setFecha(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`)
  }, [])

  const cargarTodo = async () => {
    const [uRes, cRes, lRes] = await Promise.all([
      supabase.from('granja_ubicaciones').select('id,codigo,nombre,activo').eq('activo', true).order('codigo', { ascending: true }),
      supabase.from('clientes').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('granja_lotes').select('id,codigo').order('codigo', { ascending: true }),
    ])

    if (uRes.error) console.error(uRes.error)
    if (cRes.error) console.error(cRes.error)
    if (lRes.error) console.error(lRes.error)

    setUbicaciones((uRes.data || []) as any)
    setClientes((cRes.data || []) as any)
    setLotes((lRes.data || []) as any)

    await cargarVentasRecientes()
  }

  const cargarVentasRecientes = async () => {
    const { data, error } = await supabase
      .from('granja_ventas_cerdos')
      .select(
        `
        id, fecha, cantidad, peso_total_lb, total,
        clientes ( nombre ),
        granja_ubicaciones ( codigo, nombre ),
        granja_lotes ( codigo )
      `
      )
      .order('id', { ascending: false })
      .limit(30)

    if (error) {
      console.error(error)
      return
    }
    setVentas((data || []) as any)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addLinea = () => setLineas(prev => [...prev, { ubicacion_id: '', cantidad: '' }])

  const removeLinea = (idx: number) => {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  const updateLinea = (idx: number, key: keyof LineaTramo, val: string) => {
    setLineas(prev => prev.map((l, i) => (i === idx ? { ...l, [key]: val } : l)))
  }

  const limpiar = () => {
    setClienteId('')
    setLoteId('')
    setLineas([{ ubicacion_id: '', cantidad: '' }])
    setPesoTotalLb('')
    setPrecioPorLibra('')
    setPagado('')
    setObservaciones('')
  }

  const validar = () => {
    if (!fecha) return 'Falta fecha.'
    if (!clienteId) return 'Seleccione un cliente.'

    // lineas válidas: solo las que tienen ubicacion y cantidad>0
    const validas = lineas
      .map(l => ({ ubicacion_id: l.ubicacion_id, cantidad: toNum(l.cantidad) }))
      .filter(l => l.ubicacion_id && l.cantidad > 0)

    if (validas.length === 0) return 'Agregue al menos un tramo con cantidad > 0.'
    if (toNum(pesoTotalLb) <= 0) return 'Peso total (lb) debe ser > 0.'
    if (toNum(precioPorLibra) <= 0) return 'Precio por libra debe ser > 0.'
    if (toNum(pagado) < 0) return 'Pagado no puede ser negativo.'

    // no permitir ubicacion repetida (para evitar doble salida accidental)
    const setU = new Set(validas.map(v => v.ubicacion_id))
    if (setU.size !== validas.length) return 'No repitas la misma ubicación; usa una sola línea por tramo.'

    return ''
  }

  const guardarVenta = async () => {
    const msg = validar()
    if (msg) {
      alert(msg)
      return
    }

    const grupo = genGrupoId()

    // lineas válidas
    const validas = lineas
      .map(l => ({ ubicacion_id: Number(l.ubicacion_id), cantidad: toNum(l.cantidad) }))
      .filter(l => !!l.ubicacion_id && l.cantidad > 0)

    const cantidadTotal = validas.reduce((acc, x) => acc + x.cantidad, 0)

    const pesoLbTotal = toNum(pesoTotalLb)
    const precioLb = toNum(precioPorLibra)
    const total = round2(pesoLbTotal * precioLb)

    const pagadoTotal = round2(toNum(pagado))
    const deudaTotal = round2(Math.max(0, total - pagadoTotal))

    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      // repartir proporcionalmente por cantidad
      // para evitar problemas de redondeo, ajustamos la última línea con el “resto”
      let restoPeso = pesoLbTotal
      let restoTotal = total
      let restoPagado = pagadoTotal
      let restoDeuda = deudaTotal

      for (let i = 0; i < validas.length; i++) {
        const l = validas[i]
        const isLast = i === validas.length - 1
        const frac = cantidadTotal > 0 ? l.cantidad / cantidadTotal : 0

        const pesoPart = isLast ? round2(restoPeso) : round2(pesoLbTotal * frac)
        const totalPart = isLast ? round2(restoTotal) : round2(total * frac)
        const pagadoPart = isLast ? round2(restoPagado) : round2(pagadoTotal * frac)
        const deudaPart = isLast ? round2(restoDeuda) : round2(deudaTotal * frac)

        restoPeso = round2(restoPeso - pesoPart)
        restoTotal = round2(restoTotal - totalPart)
        restoPagado = round2(restoPagado - pagadoPart)
        restoDeuda = round2(restoDeuda - deudaPart)

        const obsFinal = `${observaciones || ''}${observaciones ? ' | ' : ''}MULTI:${grupo} (${i + 1}/${validas.length})`

        // 1) insertar venta “por tramo”
        const { data: ventaIns, error: ventaErr } = await supabase
          .from('granja_ventas_cerdos')
          .insert({
            fecha,
            cliente_id: Number(clienteId),
            ubicacion_id: l.ubicacion_id,
            lote_id: loteId ? Number(loteId) : null,
            cantidad: l.cantidad,
            peso_total_lb: pesoPart,
            precio_por_libra: precioLb,
            total: totalPart,
            pagado: pagadoPart,
            deuda: deudaPart,
            observaciones: obsFinal,
            user_id: userId,
          })
          .select('id')
          .single()

        if (ventaErr) {
          console.error(ventaErr)
          alert('Error guardando venta (por tramo). Revisa consola.')
          return
        }

        const ventaId = ventaIns?.id as number

        // 2) movimiento de inventario (salida por venta)
        const { error: movErr } = await supabase.from('granja_movimientos').insert({
          // fecha lo maneja default now(), pero lo ponemos alineado a la fecha del form
          fecha: new Date(fecha + 'T12:00:00').toISOString(),
          ubicacion_id: l.ubicacion_id,
          tipo: 'SALIDA_VENTA',
          lote_id: loteId ? Number(loteId) : null,
          cantidad: l.cantidad,
          // opcional: guardar peso en kg si quieres (columna es peso_total_kg)
          // 1 lb = 0.45359237 kg
          peso_total_kg: round2(pesoPart * 0.45359237),
          referencia_tabla: 'granja_ventas_cerdos',
          referencia_id: ventaId,
          user_id: userId,
          observaciones: obsFinal,
        })

        if (movErr) {
          console.error(movErr)
          alert('Venta guardada, pero falló registrar movimiento. Revisa consola.')
          return
        }
      }

      alert('Venta guardada (multi-tramo) y movimientos registrados.')
      limpiar()
      await cargarVentasRecientes()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Salida por venta</h1>
          <p className="text-xs text-gray-600">Registrar ventas de cerdos y debitar el inventario por ubicación.</p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva venta de cerdos</h2>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input type="date" className="w-full border rounded px-3 py-2" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Cliente</label>
            <select className="w-full border rounded px-3 py-2" value={clienteId} onChange={e => setClienteId(e.target.value)}>
              <option value="">Seleccione un cliente</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Lote (opcional)</label>
            <select className="w-full border rounded px-3 py-2" value={loteId} onChange={e => setLoteId(e.target.value)}>
              <option value="">Sin lote específico</option>
              {lotes.map(l => (
                <option key={l.id} value={l.id}>
                  {l.codigo}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Multi-tramo */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium mb-1">Tramos (puede ser más de uno)</label>
              <button type="button" onClick={addLinea} className="text-sm px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">
                + Agregar tramo
              </button>
            </div>

            <div className="space-y-2">
              {lineas.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={l.ubicacion_id}
                      onChange={e => updateLinea(idx, 'ubicacion_id', e.target.value)}
                    >
                      <option value="">Seleccione una ubicación</option>
                      {ubicaciones.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.codigo} — {u.nombre || ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      className="w-full border rounded px-3 py-2"
                      placeholder="Cantidad"
                      value={l.cantidad}
                      onChange={e => updateLinea(idx, 'cantidad', e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => removeLinea(idx)} className="text-red-600 text-sm">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs text-gray-600">
              Cantidad total (sumada): <span className="font-semibold">{totalCantidad}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium mb-1">Peso total (lb)</label>
              <input type="number" className="w-full border rounded px-3 py-2" value={pesoTotalLb} onChange={e => setPesoTotalLb(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Precio por libra (Q)</label>
              <input type="number" className="w-full border rounded px-3 py-2" value={precioPorLibra} onChange={e => setPrecioPorLibra(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium mb-1">Total venta (Q)</label>
              <input type="number" className="w-full border rounded px-3 py-2 bg-slate-100" value={totalVenta} readOnly />
              <div className="text-[11px] text-gray-500 mt-1">Se calcula con peso total por precio por libra.</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pagado (Q)</label>
              <input type="number" className="w-full border rounded px-3 py-2" value={pagado} onChange={e => setPagado(e.target.value)} />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Deuda (Q)</label>
            <input type="number" className="w-full border rounded px-3 py-2 bg-slate-100" value={deuda} readOnly />
            <div className="text-[11px] text-gray-500 mt-1">Total menos pagado. Se reparte proporcionalmente entre tramos.</div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Observaciones</label>
            <textarea className="w-full border rounded px-3 py-2" rows={4} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={guardarVenta}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {saving ? 'Guardando...' : 'Guardar venta'}
            </button>
            <button type="button" onClick={limpiar} className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded">
              Limpiar
            </button>
          </div>
        </div>

        {/* Ventas recientes */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Ventas recientes</h2>

          <div className="max-h-[520px] overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Ubicación</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Lote</th>
                  <th className="p-2 text-right">Cant.</th>
                  <th className="p-2 text-right">Peso lb</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={v.id} className="border-t">
                    <td className="p-2">{v.fecha}</td>
                    <td className="p-2">
                      <div className="font-medium">{v.granja_ubicaciones?.codigo || '—'}</div>
                      <div className="text-[11px] text-gray-500">{v.granja_ubicaciones?.nombre || ''}</div>
                    </td>
                    <td className="p-2">{v.clientes?.nombre || '—'}</td>
                    <td className="p-2">{v.granja_lotes?.codigo || '—'}</td>
                    <td className="p-2 text-right">{v.cantidad}</td>
                    <td className="p-2 text-right">{v.peso_total_lb}</td>
                    <td className="p-2 text-right">Q{toNum(v.total).toFixed(2)}</td>
                  </tr>
                ))}
                {ventas.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={7}>
                      Sin ventas aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-[11px] text-gray-500">
            Nota: ventas multi-tramo aparecen como varias filas (una por tramo) con <b>MULTI:</b> en observaciones.
          </div>
        </div>
      </div>
    </div>
  )
}
