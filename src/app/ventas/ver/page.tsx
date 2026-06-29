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
  cantidad: number | null // lo usamos como TOTAL (suma de detalles)
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

/* ─────────────────────── Utils ─────────────────────── */
const DETALLE_VENTA_TABLE = 'detalle_venta'

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100

const calcImporte = (cant: unknown, precio: unknown) => round2(toNum(cant) * toNum(precio))

const cloneDetalles = (src: Record<number, Detalle[]>) => {
  const out: Record<number, Detalle[]> = {}
  for (const [k, arr] of Object.entries(src)) {
    out[Number(k)] = arr.map((d) => ({
      ...d,
      productos: d.productos ? { ...d.productos } : null,
    }))
  }
  return out
}

const detalleEqual = (a: Detalle, b: Detalle) => {
  return (
    (a.producto_id ?? null) === (b.producto_id ?? null) &&
    (a.concepto ?? '') === (b.concepto ?? '') &&
    toNum(a.cantidad) === toNum(b.cantidad) &&
    toNum(a.precio_unitario) === toNum(b.precio_unitario) &&
    toNum(a.importe) === toNum(b.importe) &&
    (a.forma_pago_id ?? null) === (b.forma_pago_id ?? null) &&
    (a.documento ?? '') === (b.documento ?? '')
  )
}

const esDetalleNuevo = (d: Detalle) => d.id < 0

const detalleVacio = (ventaId: number): Detalle => ({
  id: -Date.now() - Math.floor(Math.random() * 1000),
  venta_id: ventaId,
  producto_id: null,
  concepto: '',
  cantidad: 0,
  precio_unitario: 0,
  importe: 0,
  forma_pago_id: null,
  documento: '',
  productos: null,
})

/* ─────────────────────── Página ─────────────────────── */
export default function VerVentas() {
  const [ventas, setVentas] = useState<VentaCab[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [detallesOriginal, setDetallesOriginal] = useState<Record<number, Detalle[]>>({})

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
  const [ventasConPendientes, setVentasConPendientes] = useState<Record<number, boolean>>({})
  const [guardandoDetalleId, setGuardandoDetalleId] = useState<number | null>(null)

  const marcarPendiente = (ventaId: number, val: boolean) => {
    setVentasConPendientes((prev) => ({ ...prev, [ventaId]: val }))
  }

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
    const params = new URLSearchParams(window.location.search)
    const idUrl = params.get('id')

    const filtrosAplicados = {
      ...filtros,
      id: filtros.id || idUrl || '',
    }

    if (idUrl && !filtros.id) {
      setFiltros((prev) => ({ ...prev, id: idUrl }))
    }

    const usaFiltroCliente =
      Boolean(filtrosAplicados.cliente_nombre?.trim()) ||
      Boolean(filtrosAplicados.cliente_nit?.trim())

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
      .order('id', { ascending: false })

    if (filtrosAplicados.id) query = query.eq('id', filtrosAplicados.id)
    if (filtrosAplicados.empresa_id) query = query.eq('empresa_id', filtrosAplicados.empresa_id)
    if (filtrosAplicados.division_id) query = query.eq('division_id', filtrosAplicados.division_id)
    if (filtrosAplicados.desde) query = query.gte('fecha', filtrosAplicados.desde)
    if (filtrosAplicados.hasta) query = query.lte('fecha', filtrosAplicados.hasta)

    if (filtrosAplicados.cliente_nombre?.trim()) {
      query = query.ilike('clientes.nombre', `%${filtrosAplicados.cliente_nombre.trim()}%`)
    }

    if (filtrosAplicados.cliente_nit?.trim()) {
      query = query.ilike('clientes.nit', `%${filtrosAplicados.cliente_nit.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error cargando ventas', error)
      setVentas([])
      setDetalles({})
      setDetallesOriginal({})
      setVentasConPendientes({})
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

    const ids = cabList.map((v) => v.id)

    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      setDetallesOriginal({})
      setVentasConPendientes({})
      return
    }

    const { data: detAll, error: detErr } = await supabase
      .from(DETALLE_VENTA_TABLE)
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
      setDetallesOriginal({})
      setVentas(cabList)
      setVentasConPendientes({})
      return
    }

    const grouped: Record<number, Detalle[]> = {}

    for (const row of (detAll ?? []) as any[]) {
      const d = row as unknown as Detalle
      const imp = d.importe ?? calcImporte(d.cantidad, d.precio_unitario)

      ;(grouped[d.venta_id] ||= []).push({
        ...d,
        importe: imp,
        productos: d.productos ?? null,
      })
    }

    setDetalles(grouped)
    setDetallesOriginal(cloneDetalles(grouped))
    setVentasConPendientes({})

    const filtradas = cabList.filter((v) =>
      mostrarIncompletas ? true : (grouped[v.id] ?? []).length > 0
    )

    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  /* utils */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  const totalLocalVenta = (ventaId: number) => {
    const arr = detalles[ventaId] || []
    return round2(arr.reduce((acc, d) => acc + calcImporte(d.cantidad, d.precio_unitario), 0))
  }

  const recalcularTotal = async (ventaId: number) => {
    const { data: sumRows, error: sumErr } = await supabase
      .from(DETALLE_VENTA_TABLE)
      .select('importe')
      .eq('venta_id', ventaId)

    if (sumErr) {
      console.error('No se pudo obtener los importes para recalcular total', sumErr)
      return
    }

    const total = round2((sumRows || []).reduce((acc, r: any) => acc + Number(r.importe || 0), 0))

    const { error: updErr } = await supabase
      .from('ventas')
      .update({ cantidad: total })
      .eq('id', ventaId)

    if (updErr) {
      console.error('No se pudo actualizar el total de la venta', updErr)
    }
  }

  const productoControlaInventario = (productoId: number | null) => {
    if (!productoId) return false
    const prod = productos.find((p) => p.id === productoId)
    return Boolean(prod?.control_inventario)
  }

  const sincronizarMovimientoInventario = async (detalle: Detalle) => {
    const detId = detalle.id
    const productoId = detalle.producto_id ?? null
    const cantidad = toNum(detalle.cantidad)

    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id || null

    // Siempre eliminamos el movimiento anterior asociado a este detalle y recreamos si aplica.
    const { error: delMovErr } = await supabase
      .from('inventario_movimientos')
      .delete()
      .eq('venta_detalle_id', detId)

    if (delMovErr) {
      throw new Error(`No se pudo limpiar movimiento de inventario: ${delMovErr.message}`)
    }

    if (!productoId || cantidad <= 0 || !productoControlaInventario(productoId)) {
      return
    }

    const { error: movErr } = await supabase.from('inventario_movimientos').insert({
      producto_id: productoId,
      tipo: 'SALIDA',
      cantidad,
      venta_detalle_id: detId,
      observaciones: `Salida por edición/registro de venta #${detalle.venta_id}, detalle #${detId}`,
      user_id: userId,
    })

    if (movErr) {
      throw new Error(`No se pudo registrar movimiento de inventario: ${movErr.message}`)
    }
  }

  /* edición CABECERA */
  const handleInputChangeCab = (id: number, field: keyof VentaCab, val: any) => {
    setVentas((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v
        if (field === 'cantidad') return v // total no editable
        return { ...v, [field]: val }
      })
    )
  }

  const guardarCabecera = async (venta: VentaCab) => {
    try {
      if (ventasConPendientes[venta.id]) {
        await guardarDetallesPendientes(venta.id)
      }

      const { error } = await supabase
        .from('ventas')
        .update({
          fecha: venta.fecha,
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
    } catch (e) {
      alert('Error al guardar (cabecera o detalles). Revisa consola.')
      console.error(e)
    }
  }

  /* edición DETALLE */
  const handleInputChangeDet = (
    ventaId: number,
    detId: number,
    field: keyof Detalle,
    value: any
  ) => {
    setDetalles((prev) => {
      const copia = { ...prev }
      const arr = [...(copia[ventaId] || [])]
      const idx = arr.findIndex((d) => d.id === detId)

      if (idx >= 0) {
        const d = { ...arr[idx] }

        if (field === 'cantidad' || field === 'precio_unitario') {
          if (field === 'cantidad') d.cantidad = Number(value)
          if (field === 'precio_unitario') d.precio_unitario = Number(value)
          d.importe = calcImporte(d.cantidad, d.precio_unitario)
        } else if (field === 'producto_id') {
          d.producto_id = value ? Number(value) : null

          const prod = productos.find((p) => p.id === Number(value)) || null
          d.productos = prod

          if (prod?.nombre && !(d.concepto || '').trim()) {
            d.concepto = prod.nombre
          }
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

    marcarPendiente(ventaId, true)
  }

  const agregarDetalle = (ventaId: number) => {
    setDetalles((prev) => ({
      ...prev,
      [ventaId]: [...(prev[ventaId] || []), detalleVacio(ventaId)],
    }))

    marcarPendiente(ventaId, true)
  }

  const quitarDetalleLocal = (ventaId: number, detId: number) => {
    setDetalles((prev) => ({
      ...prev,
      [ventaId]: (prev[ventaId] || []).filter((d) => d.id !== detId),
    }))

    marcarPendiente(ventaId, true)
  }

  const validarDetalle = (det: Detalle) => {
    if (!(det.concepto || '').trim()) return 'El concepto es obligatorio.'
    if (toNum(det.cantidad) <= 0) return 'La cantidad debe ser mayor que 0.'
    if (toNum(det.precio_unitario) < 0) return 'El precio unitario no puede ser negativo.'
    return ''
  }

  const guardarDetalle = async (ventaId: number, det: Detalle) => {
    const msg = validarDetalle(det)

    if (msg) {
      alert(msg)
      return
    }

    setGuardandoDetalleId(det.id)

    try {
      const detFinal: Detalle = {
        ...det,
        venta_id: ventaId,
        concepto: (det.concepto || '').trim(),
        cantidad: toNum(det.cantidad),
        precio_unitario: toNum(det.precio_unitario),
        importe: calcImporte(det.cantidad, det.precio_unitario),
        documento: det.documento || null,
      }

      const payload = {
        venta_id: ventaId,
        producto_id: detFinal.producto_id,
        concepto: detFinal.concepto,
        cantidad: detFinal.cantidad,
        precio_unitario: detFinal.precio_unitario,
        importe: detFinal.importe,
        forma_pago_id: detFinal.forma_pago_id,
        documento: detFinal.documento,
      }

      let detalleGuardado: Detalle = detFinal

      if (esDetalleNuevo(detFinal)) {
        const { data, error } = await supabase
          .from(DETALLE_VENTA_TABLE)
          .insert(payload)
          .select(
            `
            id, venta_id, producto_id, concepto, cantidad,
            precio_unitario, importe, forma_pago_id, documento,
            productos ( id, nombre, sku, unidad, control_inventario )
          `
          )
          .single()

        if (error) {
          alert('Error al agregar el detalle')
          console.error(error)
          return
        }

        detalleGuardado = {
          ...(data as unknown as Detalle),
          importe: calcImporte((data as any).cantidad, (data as any).precio_unitario),
          productos: ((data as any).productos ?? null) as Producto | null,
        }
      } else {
        const { data, error } = await supabase
          .from(DETALLE_VENTA_TABLE)
          .update(payload)
          .eq('id', detFinal.id)
          .select(
            `
            id, venta_id, producto_id, concepto, cantidad,
            precio_unitario, importe, forma_pago_id, documento,
            productos ( id, nombre, sku, unidad, control_inventario )
          `
          )
          .single()

        if (error) {
          alert('Error al guardar el detalle')
          console.error(error)
          return
        }

        detalleGuardado = {
          ...(data as unknown as Detalle),
          importe: calcImporte((data as any).cantidad, (data as any).precio_unitario),
          productos: ((data as any).productos ?? null) as Producto | null,
        }
      }

      await sincronizarMovimientoInventario(detalleGuardado)

      setDetalles((prev) => {
        const copy = { ...prev }
        const arr = [...(copy[ventaId] || [])]
        const idx = arr.findIndex((x) => x.id === det.id)

        if (idx >= 0) arr[idx] = detalleGuardado
        else arr.push(detalleGuardado)

        copy[ventaId] = arr
        return copy
      })

      setDetallesOriginal((prev) => {
        const copy = { ...prev }
        const arr = [...(copy[ventaId] || [])]
        const idx = arr.findIndex((x) => x.id === detalleGuardado.id)

        if (idx >= 0) arr[idx] = detalleGuardado
        else arr.push(detalleGuardado)

        copy[ventaId] = arr.map((x) => ({
          ...x,
          productos: x.productos ? { ...x.productos } : null,
        }))

        return copy
      })

      await recalcularTotal(ventaId)
      await cargarDatos()
    } catch (e) {
      alert('Error al guardar el detalle. Revisa consola.')
      console.error(e)
    } finally {
      setGuardandoDetalleId(null)
    }
  }

  const guardarDetallesPendientes = async (ventaId: number) => {
    const actuales = detalles[ventaId] || []
    const orig = detallesOriginal[ventaId] || []

    const origById = new Map<number, Detalle>()
    orig.forEach((d) => origById.set(d.id, d))

    for (const d of actuales) {
      const dOrig = origById.get(d.id)
      const importeCalc = calcImporte(d.cantidad, d.precio_unitario)
      const detFinal: Detalle = { ...d, importe: importeCalc }

      if (!dOrig || !detalleEqual(detFinal, dOrig)) {
        await guardarDetalle(ventaId, detFinal)
      }
    }

    marcarPendiente(ventaId, false)

    setDetallesOriginal((prev) => {
      const copy = { ...prev }
      copy[ventaId] = (detalles[ventaId] || [])
        .filter((d) => !esDetalleNuevo(d))
        .map((d) => ({
          ...d,
          productos: d.productos ? { ...d.productos } : null,
        }))
      return copy
    })
  }

  const eliminarDetalle = async (ventaId: number, detId: number) => {
    if (detId < 0) {
      quitarDetalleLocal(ventaId, detId)
      return
    }

    if (!confirm('¿Eliminar este detalle de la venta?')) return

    try {
      const { error: delMovErr } = await supabase
        .from('inventario_movimientos')
        .delete()
        .eq('venta_detalle_id', detId)

      if (delMovErr) {
        alert('No se pudo eliminar el movimiento de inventario del detalle.')
        console.error(delMovErr)
        return
      }

      const { error } = await supabase.from(DETALLE_VENTA_TABLE).delete().eq('id', detId)

      if (error) {
        alert('Error al eliminar el detalle')
        console.error(error)
        return
      }

      await recalcularTotal(ventaId)
      await cargarDatos()
    } catch (e) {
      alert('Error al eliminar detalle. Revisa consola.')
      console.error(e)
    }
  }

  /* UI */
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">🧾 Ventas Registradas</h1>

      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-4">
        <select
          name="empresa_id"
          value={filtros.empresa_id}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="">Todas las Empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>

        <select
          name="division_id"
          value={filtros.division_id}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="">Todas las Divisiones</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="desde"
          value={filtros.desde}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="date"
          name="hasta"
          value={filtros.hasta}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="text"
          name="cliente_nombre"
          placeholder="Cliente"
          value={filtros.cliente_nombre}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="text"
          name="cliente_nit"
          placeholder="NIT"
          value={filtros.cliente_nit}
          onChange={handleChange}
          className="border p-2"
        />

        <input
          type="text"
          name="id"
          placeholder="ID"
          value={filtros.id}
          onChange={handleChange}
          className="border p-2"
        />
      </div>

      <div className="mb-6 flex items-center gap-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mostrarIncompletas}
            onChange={(e) => setMostrarIncompletas(e.target.checked)}
          />
          Mostrar ventas sin detalle
        </label>

        <a href="/menu" className="ml-auto inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </a>
      </div>

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
          {ventas.map((v) => (
            <tr key={v.id} className="border-t">
              <td className="p-2">{v.id}</td>

              <td className="p-2">
                <input
                  type="date"
                  className="border p-1"
                  value={v.fecha}
                  onChange={(ev) => handleInputChangeCab(v.id, 'fecha', ev.target.value)}
                />
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.empresa_id ?? ''}
                  onChange={(ev) =>
                    handleInputChangeCab(
                      v.id,
                      'empresa_id',
                      ev.target.value ? Number(ev.target.value) : null
                    )
                  }
                >
                  <option value="">—</option>
                  {empresas.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">
                <select
                  className="border p-1"
                  value={v.division_id ?? ''}
                  onChange={(ev) =>
                    handleInputChangeCab(
                      v.id,
                      'division_id',
                      ev.target.value ? Number(ev.target.value) : null
                    )
                  }
                >
                  <option value="">—</option>
                  {divisiones.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.nombre}
                    </option>
                  ))}
                </select>
              </td>

              <td className="p-2">{v.clientes?.nombre ?? '—'}</td>
              <td className="p-2">{v.clientes?.nit ?? '—'}</td>

              <td className="p-2">
                <input
                  type="number"
                  className="border p-1 w-24 bg-gray-100"
                  value={Number((detalles[v.id]?.length ? totalLocalVenta(v.id) : v.cantidad ?? 0).toFixed(2))}
                  readOnly
                />
              </td>

              <td className="p-2">
                <input
                  className="border p-1 w-56"
                  value={v.observaciones ?? ''}
                  onChange={(ev) => handleInputChangeCab(v.id, 'observaciones', ev.target.value)}
                />
              </td>

              <td className="p-2 space-x-2">
                {ventasConPendientes[v.id] ? (
                  <span className="text-[11px] text-amber-700">Detalles sin guardar</span>
                ) : null}

                <button
                  onClick={() => guardarCabecera(v)}
                  className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                >
                  Guardar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ventas.map((v) => (
        <div key={`det-${v.id}`} className="mb-6 border p-3 rounded bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">📦 Detalles de Venta #{v.id}</h3>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                Total detalles: Q{totalLocalVenta(v.id).toFixed(2)}
              </span>

              <button
                type="button"
                onClick={() => agregarDetalle(v.id)}
                className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
              >
                + Agregar detalle
              </button>
            </div>
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
                  d.producto_id && prodSel?.control_inventario ? (
                    <span className="ml-2 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                      inv
                    </span>
                  ) : null

                const importeUI = calcImporte(d.cantidad, d.precio_unitario)
                const guardandoEste = guardandoDetalleId === d.id

                return (
                  <tr key={d.id} className="border-t">
                    <td className="p-2">
                      <select
                        className="border p-1 w-full"
                        value={d.producto_id ?? ''}
                        onChange={(ev) =>
                          handleInputChangeDet(
                            v.id,
                            d.id,
                            'producto_id',
                            ev.target.value ? Number(ev.target.value) : null
                          )
                        }
                      >
                        <option value="">— Sin producto —</option>

                        {productos.map((p) => (
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
                        onChange={(ev) =>
                          handleInputChangeDet(v.id, d.id, 'concepto', ev.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-20"
                        value={toNum(d.cantidad)}
                        onChange={(ev) =>
                          handleInputChangeDet(v.id, d.id, 'cantidad', Number(ev.target.value))
                        }
                      />
                    </td>

                    <td className="p-2">
                      <input
                        type="number"
                        className="border p-1 w-24"
                        value={toNum(d.precio_unitario)}
                        onChange={(ev) =>
                          handleInputChangeDet(
                            v.id,
                            d.id,
                            'precio_unitario',
                            Number(ev.target.value)
                          )
                        }
                      />
                    </td>

                    <td className="p-2">Q{importeUI.toFixed(2)}</td>

                    <td className="p-2">
                      <select
                        className="border p-1"
                        value={d.forma_pago_id ?? ''}
                        onChange={(ev) =>
                          handleInputChangeDet(
                            v.id,
                            d.id,
                            'forma_pago_id',
                            ev.target.value ? Number(ev.target.value) : null
                          )
                        }
                      >
                        <option value="">—</option>

                        {formasPago.map((fp) => (
                          <option key={fp.id} value={fp.id}>
                            {fp.metodo}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-2">
                      <input
                        className="border p-1 w-40"
                        value={d.documento ?? ''}
                        onChange={(ev) =>
                          handleInputChangeDet(v.id, d.id, 'documento', ev.target.value)
                        }
                      />
                    </td>

                    <td className="p-2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => guardarDetalle(v.id, d)}
                          disabled={guardandoEste}
                          className="bg-green-600 disabled:bg-green-400 text-white px-2 py-1 rounded text-xs"
                        >
                          {guardandoEste ? 'Guardando...' : esDetalleNuevo(d) ? 'Agregar' : 'Guardar'}
                        </button>

                        <button
                          onClick={() => eliminarDetalle(v.id, d.id)}
                          className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                        >
                          {esDetalleNuevo(d) ? 'Quitar' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {(detalles[v.id] || []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-3 text-gray-500">
                    Esta venta no tiene detalles. Usa “Agregar detalle” para crear una línea.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
