'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type VentaRow = {
  venta_id: number
  fecha: string
  credito: number
  abonado: number
  saldo: number
}

/** Relaciones normalizadas (objeto o null; nunca array) */
type ProductoObj = {
  nombre: string | null
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
} | null

type FormaPagoObj = {
  metodo: string | null
} | null

type Detalle = {
  id: number
  venta_id: number
  producto_id: number | null
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  documento: string | null
  productos?: ProductoObj
  forma_pago?: FormaPagoObj
}

type MetodoPago = { id: number; metodo: string }

export default function VistaDeudasCliente() {
  const router = useRouter()

  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState<string>('')

  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})

  // catálogo de métodos de pago (excluimos el método "pendiente de pago")
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [pendienteId, setPendienteId] = useState<number | null>(null)

  // formulario de abono
  const [pago, setPago] = useState({
    modo: 'auto' as 'auto' | 'venta',
    venta_id: '' as string | number,
    fecha: new Date().toISOString().slice(0, 10),
    metodo_pago_id: '' as string | number,
    monto: '' as string,
    documento: '',
    observaciones: ''
  })
  const [loadingPago, setLoadingPago] = useState(false)

  const formatoQ = (n: number | null | undefined) => `Q${Number(n || 0).toFixed(2)}`

  const totales = useMemo(() => {
    const tCred = ventas.reduce((s, v) => s + Number(v.credito || 0), 0)
    const tAbo = ventas.reduce((s, v) => s + Number(v.abonado || 0), 0)
    const tSal = ventas.reduce((s, v) => s + Number(v.saldo || 0), 0)
    return { tCred, tAbo, tSal }
  }, [ventas])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cid = params.get('cliente_id')
    if (cid) setClienteId(Number(cid))
  }, [])

  const cargarCliente = useCallback(async (id: number) => {
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre')
      .eq('id', id)
      .single()
    if (!error && data) setClienteNombre(data.nombre || '')
  }, [])

  const cargarMetodosPago = useCallback(async () => {
    const { data, error } = await supabase
      .from('forma_pago')
      .select('id, metodo')
      .order('metodo', { ascending: true })
    if (error) return

    const all = (data || []) as MetodoPago[]

    // detectar el método "pendiente de pago"
    const pend = all.find(m => m.metodo.toLowerCase().includes('pendiente de pago'))
    setPendienteId(pend?.id ?? null)

    // catálogo para abonos: excluir el método pendiente
    setMetodos(all.filter(m => m.id !== pend?.id))
  }, [])

  const cargarVentasCredito = useCallback(async (id: number) => {
    // detectar "pendiente de pago"
    const { data: mp } = await supabase
      .from('forma_pago')
      .select('id')
      .ilike('metodo', '%pendiente de pago%')
      .limit(1)
      .single()
    const metodoPendienteId = mp?.id as number | undefined
    setPendienteId(metodoPendienteId ?? null)

    const { data: rowsDV, error: dvErr } = await supabase
      .from('detalle_venta')
      .select('venta_id, importe, forma_pago_id, ventas!inner(id, cliente_id, fecha)')
      .eq('ventas.cliente_id', id)

    if (dvErr) {
      console.error(dvErr)
      setVentas([])
      return
    }

    type Tmp = { [k: number]: { fecha: string; credito: number; abonado: number } }
    const agg: Tmp = {}
    for (const r of (rowsDV || []) as any[]) {
      const vId = r.venta_id as number
      const fecha = r.ventas?.fecha as string
      const fpId = r.forma_pago_id as number | null
      const imp = Number(r.importe || 0)

      if (!agg[vId]) agg[vId] = { fecha, credito: 0, abonado: 0 }
      if (metodoPendienteId && fpId === metodoPendienteId) {
        agg[vId].credito += imp
      }
    }

    const vIds = Object.keys(agg).map(Number)
    if (vIds.length > 0) {
      const { data: pagosRows, error: pErr } = await supabase
        .from('pagos_venta')
        .select('venta_id, monto')
        .in('venta_id', vIds)
      if (!pErr) {
        for (const pr of pagosRows || []) {
          const m = Number(pr.monto || 0)
          if (agg[pr.venta_id]) agg[pr.venta_id].abonado += m
        }
      }
    }

    const final: VentaRow[] = Object.entries(agg).map(([venta_id, v]) => ({
      venta_id: Number(venta_id),
      fecha: v.fecha,
      credito: v.credito,
      abonado: v.abonado,
      saldo: v.credito - v.abonado,
    }))
    final.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()) // asc para aplicar pagos de más antiguo a nuevo
    setVentas(final)
  }, [])

  const cargarDetalles = useCallback(async (ids: number[]) => {
    if (ids.length === 0) {
      setDetalles({})
      return
    }

    const { data, error } = await supabase
      .from('detalle_venta')
      .select(`
        id, venta_id, producto_id, concepto, cantidad, precio_unitario, importe, documento,
        productos ( nombre, sku, unidad, control_inventario ),
        forma_pago ( metodo )
      `)
      .in('venta_id', ids)

    if (error) {
      console.error('Error cargando detalles:', error)
      setDetalles({})
      return
    }

    const normalizeRel = <T,>(r: T | T[] | null | undefined): T | null => {
      if (!r) return null
      return Array.isArray(r) ? (r[0] ?? null) : r
    }

    const byVenta: Record<number, Detalle[]> = {}
    for (const raw of (data || []) as any[]) {
      const d: Detalle = {
        id: raw.id,
        venta_id: raw.venta_id,
        producto_id: raw.producto_id,
        concepto: raw.concepto,
        cantidad: Number(raw.cantidad || 0),
        precio_unitario: Number(raw.precio_unitario || 0),
        importe: Number(raw.importe || 0),
        documento: raw.documento || null,
        productos: normalizeRel(raw.productos) as ProductoObj,
        forma_pago: normalizeRel(raw.forma_pago) as FormaPagoObj,
      }
      ;(byVenta[d.venta_id] ||= []).push(d)
    }
    Object.values(byVenta).forEach(arr => arr.sort((a, b) => a.id - b.id))
    setDetalles(byVenta)
  }, [])

  useEffect(() => {
    if (!clienteId) return
    cargarCliente(clienteId)
    cargarMetodosPago()
    cargarVentasCredito(clienteId)
  }, [clienteId, cargarCliente, cargarMetodosPago, cargarVentasCredito])

  useEffect(() => {
    const ids = ventas.map(v => v.venta_id)
    cargarDetalles(ids)
  }, [ventas, cargarDetalles])

  // -------------------- Registrar abono --------------------
  const registrarPago = async () => {
    if (!clienteId) return
    const monto = Number(pago.monto || 0)
    if (!monto || monto <= 0) {
      alert('Ingresa un monto válido.')
      return
    }
    if (!pago.metodo_pago_id) {
      alert('Selecciona un método de pago.')
      return
    }

    setLoadingPago(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const user_id = auth?.user?.id || null

      const fecha = pago.fecha
      const metodo_pago_id = Number(pago.metodo_pago_id)
      const documento = pago.documento || null
      const observaciones = pago.observaciones || null

      // ventas con saldo > 0
      const ventasConSaldo = ventas.filter(v => v.saldo > 0)

      if (ventasConSaldo.length === 0) {
        alert('No hay ventas con saldo para este cliente.')
        setLoadingPago(false)
        return
      }

      const inserts: any[] = []
      let restante = monto

      if (pago.modo === 'venta') {
        const vId = Number(pago.venta_id)
        if (!vId) {
          alert('Selecciona una venta para aplicar el abono.')
          setLoadingPago(false)
          return
        }
        const v = ventasConSaldo.find(x => x.venta_id === vId)
        if (!v) {
          alert('La venta seleccionada no tiene saldo.')
          setLoadingPago(false)
          return
        }
        const aplicar = Math.min(v.saldo, restante)
        inserts.push({
          cliente_id: clienteId,
          venta_id: v.venta_id,
          fecha,
          metodo_pago_id,
          monto: aplicar,
          documento,
          observaciones,
          user_id
        })
      } else {
        // modo automático: del más antiguo al más nuevo
        for (const v of ventasConSaldo) {
          if (restante <= 0) break
          const aplicar = Math.min(v.saldo, restante)
          inserts.push({
            cliente_id: clienteId,
            venta_id: v.venta_id,
            fecha,
            metodo_pago_id,
            monto: aplicar,
            documento,
            observaciones,
            user_id
          })
          restante -= aplicar
        }
      }

      if (inserts.length === 0) {
        alert('No fue posible aplicar el abono al saldo.')
        setLoadingPago(false)
        return
      }

      const { error: insErr } = await supabase.from('pagos_venta').insert(inserts)
      if (insErr) throw insErr

      alert('Pago registrado correctamente.')
      // reset parcial
      setPago(p => ({ ...p, monto: '', documento: '', observaciones: '' }))
      // recargar datos
      await cargarVentasCredito(clienteId)
    } catch (e: any) {
      console.error(e)
      alert(`Error al registrar el pago: ${e?.message ?? e}`)
    } finally {
      setLoadingPago(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-1">🧾 Deudas por Venta</h1>
      <p className="mb-4">
        Cliente: <span className="font-semibold">{clienteNombre || `(ID ${clienteId ?? '—'})`}</span>
      </p>

      <button
        onClick={() => router.push('/ventas/saldos')}
        className="mb-4 bg-slate-700 text-white px-4 py-2 rounded"
      >
        ⬅ Volver a Saldos
      </button>

      {/* -------- Formulario de abono -------- */}
      <div className="border rounded p-4 mb-6 bg-white">
        <h2 className="font-semibold mb-3">➕ Registrar abono</h2>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Modo</label>
            <div className="mt-1 flex gap-4">
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="modo"
                  value="auto"
                  checked={pago.modo === 'auto'}
                  onChange={() => setPago(p => ({ ...p, modo: 'auto' }))}
                />
                Automático (deuda más antigua primero)
              </label>
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="modo"
                  value="venta"
                  checked={pago.modo === 'venta'}
                  onChange={() => setPago(p => ({ ...p, modo: 'venta' }))}
                />
                Sólo una venta
              </label>
            </div>
          </div>

          {pago.modo === 'venta' && (
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Venta</label>
              <select
                className="border p-2 w-full"
                value={pago.venta_id}
                onChange={e => setPago(p => ({ ...p, venta_id: e.target.value }))}
              >
                <option value="">— Selecciona —</option>
                {ventas.filter(v => v.saldo > 0).map(v => (
                  <option key={v.venta_id} value={v.venta_id}>
                    #{v.venta_id} · {v.fecha} · Saldo {formatoQ(v.saldo)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Fecha</label>
            <input
              type="date"
              className="border p-2 w-full"
              value={pago.fecha}
              onChange={e => setPago(p => ({ ...p, fecha: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Método</label>
            <select
              className="border p-2 w-full"
              value={pago.metodo_pago_id}
              onChange={e => setPago(p => ({ ...p, metodo_pago_id: e.target.value }))}
            >
              <option value="">— Selecciona —</option>
              {metodos.map(m => (
                <option key={m.id} value={m.id}>{m.metodo}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Monto</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="border p-2 w-full"
              value={pago.monto}
              onChange={e => setPago(p => ({ ...p, monto: e.target.value }))}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-sm font-medium">Documento</label>
            <input
              className="border p-2 w-full"
              value={pago.documento}
              onChange={e => setPago(p => ({ ...p, documento: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Observaciones</label>
            <input
              className="border p-2 w-full"
              value={pago.observaciones}
              onChange={e => setPago(p => ({ ...p, observaciones: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            disabled={loadingPago}
            onClick={registrarPago}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {loadingPago ? 'Guardando…' : '💾 Registrar abono'}
          </button>
        </div>
      </div>

      {/* -------- Resumen de totales -------- */}
      <div className="border rounded p-3 mb-4 bg-gray-50">
        <div><span className="font-semibold">Total crédito:</span> {formatoQ(totales.tCred)}</div>
        <div><span className="font-semibold">Total abonado:</span> {formatoQ(totales.tAbo)}</div>
        <div><span className="font-semibold">Total saldo:</span> {formatoQ(totales.tSal)}</div>
      </div>

      {ventas.length === 0 ? (
        <p className="text-gray-600">Este cliente no tiene ventas a crédito.</p>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Venta</th>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-right">Abonado</th>
              <th className="p-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map(v => (
              <tr key={v.venta_id} className="border-t">
                <td className="p-2">#{v.venta_id}</td>
                <td className="p-2">{v.fecha}</td>
                <td className="p-2 text-right">{formatoQ(v.credito)}</td>
                <td className="p-2 text-right">{formatoQ(v.abonado)}</td>
                <td className="p-2 text-right font-semibold">{formatoQ(v.saldo)}</td>
              </tr>
            ))}

            {ventas.map(v => (
              <tr key={`det-${v.venta_id}`} className="border-b">
                <td colSpan={5} className="p-0">
                  <div className="bg-gray-50 p-3">
                    <h3 className="font-semibold mb-2">Detalles de la venta #{v.venta_id}</h3>
                    <table className="w-full text-xs border">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left">Producto</th>
                          <th className="p-2 text-left">Concepto</th>
                          <th className="p-2 text-right">Cant.</th>
                          <th className="p-2 text-right">P. Unit</th>
                          <th className="p-2 text-right">Importe</th>
                          <th className="p-2 text-left">Pago</th>
                          <th className="p-2 text-left">Doc.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detalles[v.venta_id] || []).map((d) => {
                          const prod = d.productos
                          const invBadge = prod?.control_inventario
                            ? <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                            : null
                          const fp = d.forma_pago

                          return (
                            <tr key={d.id} className="border-t">
                              <td className="p-2">
                                {prod?.nombre ? (
                                  <>
                                    <div className="font-medium inline-flex items-center">
                                      {prod.nombre}
                                      {invBadge}
                                    </div>
                                    <div className="text-[11px] text-gray-600">
                                      {(prod.sku ? `SKU: ${prod.sku}` : '') +
                                        (prod.sku && prod.unidad ? ' · ' : '') +
                                        (prod.unidad ? `Unidad: ${prod.unidad}` : '')}
                                    </div>
                                  </>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="p-2">{d.concepto || '—'}</td>
                              <td className="p-2 text-right">{Number(d.cantidad || 0)}</td>
                              <td className="p-2 text-right">{formatoQ(d.precio_unitario)}</td>
                              <td className="p-2 text-right">{formatoQ(d.importe)}</td>
                              <td className="p-2">{fp?.metodo || '—'}</td>
                              <td className="p-2">{d.documento || '—'}</td>
                            </tr>
                          )
                        })}
                        {(!detalles[v.venta_id] || detalles[v.venta_id].length === 0) && (
                          <tr>
                            <td className="p-2 text-center text-gray-500" colSpan={7}>
                              No hay renglones de detalle para esta venta.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
