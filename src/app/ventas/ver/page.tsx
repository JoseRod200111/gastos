'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

/* ─────────────────────── Tipos ─────────────────────── */
type Filtros = {
  empresa_id: string
  division_id: string
  desde: string
  hasta: string
  id: string
  cliente_nombre: string
  cliente_nit: string
}

type EmpresaRel = { nombre: string | null }
type DivisionRel = { nombre: string | null }
type ClienteRel = { nombre: string | null; nit: string | null }

type VentaCab = {
  id: number
  fecha: string
  cantidad: number | null
  observaciones: string | null
  empresa_id: number | null
  division_id: number | null
  cliente_id: number | null
  empresas?: EmpresaRel | null
  divisiones?: DivisionRel | null
  clientes?: ClienteRel | null
}

type Producto = {
  id: number
  nombre: string | null
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
}

type Detalle = {
  id: number
  venta_id: number
  producto_id: number | null
  concepto: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
  forma_pago_id: number | null
  documento: string | null
  productos?: Producto | null
}

/* ─────────────────────── Página ─────────────────────── */
export default function VerVentas() {
  const [ventas, setVentas] = useState<VentaCab[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  const [filtros, setFiltros] = useState<Filtros>({
    empresa_id: '',
    division_id: '',
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
  })

  const [mostrarIncompletas, setMostrarIncompletas] = useState(false)

  /* catálogos */
  useEffect(() => {
    ;(async () => {
      const [emp, div, fp, prods] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('forma_pago').select('*'),
        supabase
          .from('productos')
          .select('id, nombre, sku, unidad, control_inventario')
          .order('nombre', { ascending: true }),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setFormasPago(fp.data || [])
      setProductos((prods.data as Producto[]) || [])
    })()
  }, [])

  /* datos */
  const cargarDatos = useCallback(async () => {
    const usaFiltroCliente =
      Boolean(filtros.cliente_nombre?.trim()) || Boolean(filtros.cliente_nit?.trim())

    const selectCamposBasicos = `
      id, fecha, cantidad, observaciones,
      empresa_id, division_id, cliente_id,
      empresas ( nombre ),
      divisiones ( nombre )
    `.trim()

    const selectClientes = usaFiltroCliente
      ? `, clientes!inner ( nombre, nit )`
      : `, clientes ( nombre, nit )`

    const selectString = `${selectCamposBasicos}${selectClientes}`

    let query = supabase
      .from('ventas')
      .select(selectString)
      .order('fecha', { ascending: false })

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    if (filtros.cliente_nombre?.trim()) {
      query = query.ilike('clientes.nombre', `%${filtros.cliente_nombre.trim()}%`)
    }
    if (filtros.cliente_nit?.trim()) {
      query = query.ilike('clientes.nit', `%${filtros.cliente_nit.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error cargando ventas', error)
      setVentas([])
      setDetalles({})
      return
    }

    const cabList: VentaCab[] = ((data ?? []) as any[]).map((r: any) => ({
      id: r.id,
      fecha: r.fecha,
      cantidad: r.cantidad,
      observaciones: r.observaciones,
      empresa_id: r.empresa_id,
      division_id: r.division_id,
      cliente_id: r.cliente_id,
      empresas: r.empresas ?? null,
      divisiones: r.divisiones ?? null,
      clientes: r.clientes ?? null,
    }))

    const ids = cabList.map(v => v.id)
    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from('detalle_venta')
      .select(
        `
        id, venta_id, producto_id, concepto, cantidad,
        precio_unitario, importe, forma_pago_id, documento,
        productos ( id, nombre, sku, unidad, control_inventario )
      `
      )
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles', detErr)
      setDetalles({})
      setVentas(cabList)
      return
    }

    const grouped: Record<number, Detalle[]> = {}
    for (const row of (detAll ?? []) as any[]) {
      (grouped[row.venta_id] ||= []).push(row as Detalle)
    }
    setDetalles(grouped)

    const filtradas = cabList.filter(v =>
      mostrarIncompletas ? true : ((grouped[v.id] ?? []).length > 0)
    )
    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  /* utils */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  /* edición CABECERA */
  const handleInputChangeCab = (id: number, field: keyof VentaCab, val: any) => {
    setVentas(prev =>
      prev.map(v => (v.id === id ? { ...v, [field]: field === 'cantidad' ? Number(val) : val } : v))
    )
  }

  const guardarCabecera = async (venta: VentaCab) => {
    const { error } = await supabase
      .from('ventas')
      .update({
        fecha: venta.fecha,
        cantidad: venta.cantidad,
        observaciones: venta.observaciones,
        empresa_id: venta.empresa_id,
        division_id: venta.division_id,
        cliente_id: venta.cliente_id,
      })
      .eq('id', venta.id)

    if (error) {
      alert('Error al guardar la venta')
      console.error(error)
      return
    }

    await recalcularTotal(venta.id)
    await cargarDatos()
    alert('Venta guardada')
  }

  /* edición DETALLE */
  const handleInputChangeDet = (ventaId: number, detId: number, field: keyof Detalle, value: any) => {
    setDetalles(prev => {
      const copia = { ...prev }
      const arr = [...(copia[ventaId] || [])]
      const idx = arr.findIndex(d => d.id === detId)
      if (idx >= 0) {
        const d = { ...arr[idx] }

        if (field === 'cantidad' || field === 'precio_unitario') {
          if (field === 'cantidad') d.cantidad = Number(value)
          if (field === 'precio_unitario') d.precio_unitario = Number(value)
          const q = Number(d.cantidad || 0)
          const p = Number(d.precio_unitario || 0)
          d.importe = q * p
        } else if (field === 'producto_id') {
          d.producto_id = value ? Number(value) : null
          const prod = productos.find(p => p.id === Number(value)) || null
          d.productos = prod
        } else if (field === 'forma_pago_id') {
          d.forma_pago_id = value ? Number(value) : null
        } else {
          ;(d as any)[field] = value
        }

        arr[idx] = d
        copia[ventaId] = arr
      }
      return copia
    })
  }

  const guardarDetalle = async (ventaId: number, det: Detalle) => {
    const payload = {
      producto_id: det.producto_id,
      concepto: det.concepto,
      cantidad: det.cantidad,
      precio_unitario: det.precio_unitario,
      importe: det.importe,
      forma_pago_id: det.forma_pago_id,
      documento: det.documento,
    }

    const { error } = await supabase.from('detalle_venta').update(payload).eq('id', det.id)
    if (error) {
      alert('Error al guardar el detalle')
      console.error(error)
      return
    }

    await recalcularTotal(ventaId)
    await cargarDatos()
  }

  const eliminarDetalle = async (ventaId: number, detId: number) => {
    if (!confirm('¿Eliminar este detalle?')) return

    const { data: movs, error: errMovs } = await supabase
      .from('inventario_movimientos')
      .select('id')
      .eq('venta_detalle_id', detId)

    if (!errMovs && (movs || []).length > 0) {
      await supabase.from('inventario_movimientos').delete().eq('venta_detalle_id', detId)
    }

    const { error } = await supabase.from('detalle_venta').delete().eq('id', detId)
    if (error) {
      alert('Error al eliminar el detalle')
      console.error(error)
      return
    }

    await recalcularTotal(ventaId)
    await cargarDatos()
  }

  /* Recalcular total de la venta desde los detalles */
  const recalcularTotal = async (ventaId: number) => {
    const { data: sumRows, error: sumErr } = await supabase
      .from('detalle_venta')
      .select('importe')
      .eq('venta_id', ventaId)

    if (sumErr) {
      console.error('No se pudo obtener los importes para recalcular total', sumErr)
      return
    }

    const total = (sumRows || []).reduce((acc, r: any) => acc + Number(r.importe || 0), 0)

    const { error: updErr } = await supabase
      .from('ventas')
      .update({ cantidad: total })
      .eq('id', ventaId)

    if (updErr) {
      console.error('No se pudo actualizar el total de la venta', updErr)
      return
    }
  }

  /* UI */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">🧾 Ventas Registradas</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-4">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input type="text" name="cliente_nombre" placeholder="Cliente" value={filtros.cliente_nombre} onChange={handleChange} className="border p-2" />
        <input type="text" name="cliente_nit" placeholder="NIT" value={filtros.cliente_nit} onChange={handleChange} className="border p-2" />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mostrarIncompletas}
            onChange={e => setMostrarIncompletas(e.target.checked)}
          />
          Mostrar ventas sin detalle
        </label>

        <a href="/menu" className="ml-auto inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </a>
      </div>

      {/* Tabla principal */}
      <table className="w-full border text-sm text-left mb-8">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">Fecha</th>
            <th className="p-2">Empresa</th>
            <th className="p-2">División</th>
            <th className="p-2">Cliente</th>
            <th className="p-2">NIT</th>
            <th className="p-2">Total</th>
            <th className="p-2">Observaciones</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map(v => (
            <tr key={v.id} className="border-t">
              <td className="p-2">{v.id}</td>

              <td className="p-2">
                <input type="date" className="border p-1" value={v.fecha} onChange={ev => handleInputChangeCab(v.id, 'fecha', ev.target.value)} />
              </td>

              <td className="p-2">
                <select className="border p-1" value={v.empresa_id ?? ''} onChange={ev => handleInputChangeCab(v.id, 'empresa_id', Number(ev.target.value))}>
                  {empresas.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">
                <select className="border p-1" value={v.division_id ?? ''} onChange={ev => handleInputChangeCab(v.id, 'division_id', Number(ev.target.value))}>
                  {divisiones.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">{v.clientes?.nombre ?? '—'}</td>
              <td className="p-2">{v.clientes?.nit ?? '—'}</td>

              <td className="p-2">
                <input type="number" className="border p-1 w-24" value={Number(v.cantidad ?? 0)} onChange={ev => handleInputChangeCab(v.id, 'cantidad', Number(ev.target.value))} />
              </td>

              <td className="p-2">
                <input className="border p-1 w-56" value={v.observaciones ?? ''} onChange={ev => handleInputChangeCab(v.id, 'observaciones', ev.target.value)} />
              </td>

              <td className="p-2 space-x-1">
                <button onClick={() => guardarCabecera(v)} className="bg-green-600 text-white px-2 py-1 rounded text-xs">Guardar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalles */}
      {ventas.map(v => (
        <div key={`det-${v.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">📦 Detalles de Venta #{v.id}</h3>
          </div>
          <table className="w-full text-sm border">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-left">Concepto</th>
                <th className="p-2 text-left">Cantidad</th>
                <th className="p-2 text-left">Precio Unit.</th>
                <th className="p-2 text-left">Importe</th>
                <th className="p-2 text-left">Pago</th>
                <th className="p-2 text-left">Documento</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(detalles[v.id] || []).map((d) => {
                const prodSel = d.productos
                const invBadge =
                  d.producto_id && prodSel?.control_inventario
                    ? <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                    : null

                return (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      <select
                        className="border p-1 w-full"
                        value={d.producto_id ?? ''}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'producto_id', Number(ev.target.value))}
                      >
                        <option value="">— Sin producto —</option>
                        {productos.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nombre ?? `#${p.id}`}
                          </option>
                        ))}
                      </select>
                      {prodSel ? (
                        <div className="text-xs text-gray-600">
                          {(prodSel.sku ? `SKU: ${prodSel.sku}` : '') +
                            (prodSel.sku && prodSel.unidad ? ' · ' : '') +
                            (prodSel.unidad ? `Unidad: ${prodSel.unidad}` : '')}
                          {invBadge}
                        </div>
                      ) : null}
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-full"
                        value={d.concepto ?? ''}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'concepto', ev.target.value)}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-20"
                        value={Number(d.cantidad ?? 0)}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'cantidad', Number(ev.target.value))}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-24"
                        value={Number(d.precio_unitario ?? 0)}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'precio_unitario', Number(ev.target.value))}
                      />
                    </td>

                    <td className="p-2">
                      Q{Number(d.importe || 0).toFixed(2)}
                    </td>

                    <td className="p-2">
                      <select
                        className="border p-1"
                        value={d.forma_pago_id ?? ''}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'forma_pago_id', ev.target.value ? Number(ev.target.value) : null)}
                      >
                        <option value="">—</option>
                        {formasPago.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.metodo}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-40"
                        value={d.documento ?? ''}
                        onChange={ev => handleInputChangeDet(v.id, d.id, 'documento', ev.target.value)}
                      />
                    </td>

                    <td className="p-2 space-x-1">
                      <button
                        onClick={() => guardarDetalle(v.id, d)}
                        className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => eliminarDetalle(v.id, d.id)}
                        className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
