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
  cantidad: number | null      // ≈ total $ de la venta (tu UI lo llama "Total")
  observaciones: string | null
  empresa_id: number | null
  division_id: number | null
  cliente_id: number | null
  empresas?: EmpresaRel | null
  divisiones?: DivisionRel | null
  clientes?: ClienteRel | null
}

type ProductoLite = {
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
  productos?: ProductoLite | null
}

/* ─────────────────────── Página ─────────────────────── */
export default function VerVentas() {
  const [ventas, setVentas] = useState<VentaCab[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])
  const [productos, setProductos] = useState<ProductoLite[]>([])
  const [userEmail, setUserEmail] = useState('')

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
      setProductos((prods.data || []) as ProductoLite[])

      const { data } = await supabase.auth.getUser()
      setUserEmail(data?.user?.email || '')
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
      setDetalles({ })
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
      .order('id', { ascending: true })

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

  /* edición cabecera */
  const handleInputChangeCab = (id: number, field: keyof VentaCab, val: any) => {
    setVentas(prev =>
      prev.map(v => (v.id === id ? { ...v, [field]: field === 'cantidad' ? parseFloat(val) : val } : v))
    )
  }

  const guardarCambiosCab = async (venta: VentaCab) => {
    const { error } = await supabase
      .from('ventas')
      .update({
        fecha: venta.fecha,
        cantidad: venta.cantidad, // en tu UI esto es "Total"
        observaciones: venta.observaciones,
        empresa_id: venta.empresa_id,
        division_id: venta.division_id,
        cliente_id: venta.cliente_id,
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', venta.id)

    if (error) {
      alert('Error al guardar')
      console.error(error)
    } else {
      alert('Guardado')
      cargarDatos()
    }
  }

  /* ───────────────────── Detalle: edición in place ───────────────────── */
  const setDetalleLocal = (ventaId: number, idx: number, field: keyof Detalle, value: any) => {
    setDetalles(prev => {
      const list = [...(prev[ventaId] || [])]
      const row = { ...list[idx] }
      ;(row as any)[field] = value

      // Si cambia cantidad o precio, recalculamos importe local para mostrarlo
      if (field === 'cantidad' || field === 'precio_unitario') {
        const q = parseFloat(String(row.cantidad ?? 0)) || 0
        const p = parseFloat(String(row.precio_unitario ?? 0)) || 0
        row.importe = Number((q * p).toFixed(2))
      }

      list[idx] = row
      return { ...prev, [ventaId]: list }
    })
  }

  const recalcYActualizaTotalVenta = async (ventaId: number) => {
    // suma de importes en detalle_venta
    const { data: sumRows, error: sumErr } = await supabase
      .from('detalle_venta')
      .select('importe')
      .eq('venta_id', ventaId)

    if (sumErr) {
      console.error('No se pudo recalcular total de venta', sumErr)
      return
    }

    const total = (sumRows ?? []).reduce((acc, r: any) => acc + Number(r.importe || 0), 0)
    const { error: upErr } = await supabase
      .from('ventas')
      .update({
        cantidad: Number(total.toFixed(2)),  // usamos "cantidad" como TOTAL $
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      })
      .eq('id', ventaId)

    if (upErr) {
      console.error('No se pudo actualizar el total de la venta', upErr)
    }
  }

  const guardarDetalle = async (ventaId: number, idx: number) => {
    const det = (detalles[ventaId] || [])[idx]
    if (!det) return

    // normalización
    const cantidad = Number(det.cantidad || 0)
    const precio = Number(det.precio_unitario || 0)
    const importe = Number((cantidad * precio).toFixed(2))

    const payload = {
      producto_id: det.producto_id,
      concepto: det.concepto || null,
      cantidad,
      precio_unitario: precio,
      importe,
      forma_pago_id: det.forma_pago_id,
      documento: det.documento || null,
    }

    const { error } = await supabase
      .from('detalle_venta')
      .update(payload)
      .eq('id', det.id)

    if (error) {
      alert('No se pudo guardar el detalle')
      console.error(error)
      return
    }

    // Recalcula y actualiza TOTAL en ventas
    await recalcYActualizaTotalVenta(ventaId)

    // refresco local
    await cargarDatos()
  }

  const eliminarDetalle = async (ventaId: number, idx: number) => {
    const det = (detalles[ventaId] || [])[idx]
    if (!det) return
    if (!confirm('¿Eliminar la línea de detalle seleccionada?')) return

    // eliminar movimientos de inventario asociados a este detalle (si los hubiera)
    const { error: invErr } = await supabase
      .from('inventario_movimientos')
      .delete()
      .eq('venta_detalle_id', det.id)

    if (invErr) {
      alert('No se pudo eliminar el movimiento de inventario ligado a este detalle')
      console.error(invErr)
      return
    }

    const { error } = await supabase
      .from('detalle_venta')
      .delete()
      .eq('id', det.id)

    if (error) {
      alert('No se pudo eliminar el detalle')
      console.error(error)
      return
    }

    // Recalcular total
    await recalcYActualizaTotalVenta(ventaId)
    await cargarDatos()
  }

  const agregarDetalle = async (ventaId: number) => {
    // una fila libre con concepto
    const { error } = await supabase
      .from('detalle_venta')
      .insert({
        venta_id: ventaId,
        producto_id: null,
        concepto: '',
        cantidad: 0,
        precio_unitario: 0,
        importe: 0,
        forma_pago_id: null,
        documento: null,
      })

    if (error) {
      alert('No se pudo agregar una línea de detalle')
      console.error(error)
      return
    }

    // No recalculamos aún, está en 0. Sólo recargar para editarla
    await cargarDatos()
  }

  /* utils */
  const handleChangeFiltros = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  /* UI */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">🧾 Ventas Registradas</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-4">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChangeFiltros} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChangeFiltros} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChangeFiltros} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChangeFiltros} className="border p-2" />

        <input type="text" name="cliente_nombre" placeholder="Cliente" value={filtros.cliente_nombre} onChange={handleChangeFiltros} className="border p-2" />
        <input type="text" name="cliente_nit" placeholder="NIT" value={filtros.cliente_nit} onChange={handleChangeFiltros} className="border p-2" />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChangeFiltros} className="border p-2" />
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mostrarIncompletas} onChange={e => setMostrarIncompletas(e.target.checked)} />
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
                <input
                  type="date"
                  className="border p-1"
                  value={v.fecha}
                  onChange={ev => handleInputChangeCab(v.id, 'fecha', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.empresa_id ?? ''}
                  onChange={ev => handleInputChangeCab(v.id, 'empresa_id', Number(ev.target.value))}
                >
                  {empresas.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.division_id ?? ''}
                  onChange={ev => handleInputChangeCab(v.id, 'division_id', Number(ev.target.value))}
                >
                  {divisiones.map(opt => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                </select>
              </td>

              <td className="p-2">{v.clientes?.nombre ?? '—'}</td>
              <td className="p-2">{v.clientes?.nit ?? '—'}</td>

              <td className="p-2">
                <input
                  type="number"
                  step="0.01"
                  className="border p-1 w-28 text-right"
                  value={Number(v.cantidad ?? 0)}
                  onChange={ev => handleInputChangeCab(v.id, 'cantidad', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <input
                  className="border p-1 w-56"
                  value={v.observaciones ?? ''}
                  onChange={ev => handleInputChangeCab(v.id, 'observaciones', ev.target.value)}
                />
              </td>

              <td className="p-2 space-x-1">
                <button
                  onClick={() => guardarCambiosCab(v)}
                  className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                >
                  Guardar
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('¿Eliminar la venta y sus detalles?')) return

                    // borrar inventario de todos los detalles
                    const { data: det, error: detSelErr } = await supabase
                      .from('detalle_venta')
                      .select('id')
                      .eq('venta_id', v.id)

                    if (detSelErr) {
                      alert('No se pudo preparar la eliminación (detalle)')
                      console.error(detSelErr)
                      return
                    }

                    const detalleIds = (det || []).map(d => d.id)
                    if (detalleIds.length > 0) {
                      const { error: invErr } = await supabase
                        .from('inventario_movimientos')
                        .delete()
                        .in('venta_detalle_id', detalleIds)
                      if (invErr) {
                        alert('No se pudieron borrar movimientos de inventario')
                        console.error(invErr)
                        return
                      }
                    }

                    const { error: delDetErr } = await supabase.from('detalle_venta').delete().eq('venta_id', v.id)
                    if (delDetErr) {
                      alert('No se pudieron borrar los detalles')
                      console.error(delDetErr)
                      return
                    }

                    const { error: delVenErr } = await supabase.from('ventas').delete().eq('id', v.id)
                    if (delVenErr) {
                      alert('No se pudo borrar la venta')
                      console.error(delVenErr)
                      return
                    }

                    alert('Venta eliminada')
                    cargarDatos()
                  }}
                  className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                >
                  Eliminar
                </button>
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
            <button
              onClick={() => agregarDetalle(v.id)}
              className="bg-emerald-700 text-white px-3 py-1 rounded text-xs"
            >
              + Agregar detalle
            </button>
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
              {(detalles[v.id] || []).map((d, i) => {
                const prod = d.productos || productos.find(p => p.id === d.producto_id) || null
                const invBadge =
                  d.producto_id && prod?.control_inventario
                    ? <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">inv</span>
                    : null

                return (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      <select
                        className="border p-1 w-full"
                        value={d.producto_id ?? ''}
                        onChange={ev => setDetalleLocal(v.id, i, 'producto_id', ev.target.value ? Number(ev.target.value) : null)}
                      >
                        <option value="">— Sin producto —</option>
                        {productos.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nombre ?? '(sin nombre)'}
                          </option>
                        ))}
                      </select>
                      {prod ? (
                        <div className="text-xs text-gray-600 mt-1">
                          {(prod?.sku ? `SKU: ${prod.sku}` : '') +
                            (prod?.sku && prod?.unidad ? ' · ' : '') +
                            (prod?.unidad ? `Unidad: ${prod.unidad}` : '')}
                          {invBadge}
                        </div>
                      ) : null}
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-full"
                        value={d.concepto ?? ''}
                        onChange={ev => setDetalleLocal(v.id, i, 'concepto', ev.target.value)}
                        placeholder="Concepto / descripción"
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        className="border p-1 w-24 text-right"
                        value={Number(d.cantidad ?? 0)}
                        onChange={ev => setDetalleLocal(v.id, i, 'cantidad', Number(ev.target.value))}
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        className="border p-1 w-24 text-right"
                        value={Number(d.precio_unitario ?? 0)}
                        onChange={ev => setDetalleLocal(v.id, i, 'precio_unitario', Number(ev.target.value))}
                      />
                    </td>

                    <td className="p-2">Q{Number(d.importe || 0).toFixed(2)}</td>

                    <td className="p-2">
                      <select
                        className="border p-1"
                        value={d.forma_pago_id ?? ''}
                        onChange={ev => setDetalleLocal(v.id, i, 'forma_pago_id', ev.target.value ? Number(ev.target.value) : null)}
                      >
                        <option value="">—</option>
                        {formasPago.map((fp: any) => (
                          <option key={fp.id} value={fp.id}>{fp.metodo}</option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-40"
                        value={d.documento ?? ''}
                        onChange={ev => setDetalleLocal(v.id, i, 'documento', ev.target.value)}
                        placeholder="Documento"
                      />
                    </td>

                    <td className="p-2 space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => guardarDetalle(v.id, i)}
                        className="bg-emerald-600 text-white px-2 py-1 rounded text-xs"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => eliminarDetalle(v.id, i)}
                        className="bg-rose-600 text-white px-2 py-1 rounded text-xs"
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
