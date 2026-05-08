'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Catalogo = { id: number; nombre: string }
type MetodoPago = { id: number; metodo: string }
type Cliente = { id: number; nombre: string; nit?: string | null; telefono?: string | null }
type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
  control_inventario: boolean
}

const DETALLE_VENTA_TABLE = 'detalle_venta'

type Linea = {
  producto_id?: string
  concepto: string
  cantidad: number
  precio_unitario: number
  forma_pago_id: string
  documento: string
}

const lineaVacia = (): Linea => ({
  producto_id: '',
  concepto: '',
  cantidad: 0,
  precio_unitario: 0,
  forma_pago_id: '',
  documento: '',
})

function toNum(v: any) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
}

export default function NuevaVenta() {
  const router = useRouter()

  const [empresas, setEmpresas] = useState<Catalogo[]>([])
  const [divisiones, setDivisiones] = useState<Catalogo[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  const [form, setForm] = useState({
    empresa_id: '',
    division_id: '',
    cliente_id: '',
    fecha: '',
    total: 0,
    observaciones: '',
  })

  const [detalles, setDetalles] = useState<Linea[]>([lineaVacia()])

  const [pagadoInicial, setPagadoInicial] = useState('')
  const [metodoPagoInicialId, setMetodoPagoInicialId] = useState('')
  const [documentoPagoInicial, setDocumentoPagoInicial] = useState('')
  const [observacionesPagoInicial, setObservacionesPagoInicial] = useState('')

  const [showNuevoCli, setShowNuevoCli] = useState(false)
  const [nuevoCli, setNuevoCli] = useState({ nombre: '', nit: '', telefono: '' })

  const [lastVentaId, setLastVentaId] = useState<number | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [emp, div, met, cli, prods] = await Promise.all([
        supabase.from('empresas').select('*').order('nombre', { ascending: true }),
        supabase.from('divisiones').select('*').order('nombre', { ascending: true }),
        supabase.from('forma_pago').select('*').order('metodo', { ascending: true }),
        supabase.from('clientes').select('*').order('nombre', { ascending: true }),
        supabase
          .from('productos')
          .select('id,nombre,sku,unidad,control_inventario')
          .order('nombre', { ascending: true }),
      ])

      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setMetodosPago(met.data || [])
      setClientes(cli.data || [])
      setProductos((prods.data as Producto[]) || [])
    })()
  }, [])

  useEffect(() => {
    const total = detalles.reduce(
      (s, d) => s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0),
      0
    )

    setForm((f) => ({ ...f, total: round2(total) }))
  }, [detalles])

  const totalCalculado = useMemo(() => round2(Number(form.total || 0)), [form.total])
  const pagadoNum = useMemo(() => round2(toNum(pagadoInicial)), [pagadoInicial])
  const deudaCalculada = useMemo(
    () => round2(Math.max(0, totalCalculado - pagadoNum)),
    [totalCalculado, pagadoNum]
  )

  const metodoPendiente = useMemo(() => {
    return (
      metodosPago.find((m) => m.metodo.toLowerCase().includes('pendiente de pago')) ||
      null
    )
  }, [metodosPago])

  const metodosPagoSinPendiente = useMemo(() => {
    return metodosPago.filter((m) => !m.metodo.toLowerCase().includes('pendiente de pago'))
  }, [metodosPago])

  const handleDetalleChange = (i: number, field: keyof Linea, val: any) => {
    setDetalles((prev) => {
      const copy = [...prev]
      let v: any = val

      if (field === 'cantidad' || field === 'precio_unitario') {
        v = parseFloat(val || '0')
      }

      if (field === 'producto_id') {
        const prod = productos.find((p) => String(p.id) === String(val))
        if (prod && !copy[i].concepto.trim()) copy[i].concepto = prod.nombre
      }

      copy[i] = { ...copy[i], [field]: v }
      return copy
    })
  }

  const addDetalle = () => setDetalles((d) => [...d, lineaVacia()])

  const removeDetalle = (index: number) => {
    setDetalles((prev) => {
      if (prev.length === 1) return [lineaVacia()]
      return prev.filter((_, i) => i !== index)
    })
  }

  const limpiarFormulario = () => {
    setForm({
      empresa_id: '',
      division_id: '',
      cliente_id: '',
      fecha: '',
      total: 0,
      observaciones: '',
    })

    setDetalles([lineaVacia()])
    setPagadoInicial('')
    setMetodoPagoInicialId('')
    setDocumentoPagoInicial('')
    setObservacionesPagoInicial('')
    setLastVentaId(null)
    setCopiado(false)
  }

  const guardarNuevoCliente = async () => {
    if (!nuevoCli.nombre.trim()) return alert('El nombre del cliente es obligatorio')

    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: nuevoCli.nombre.trim().toUpperCase(),
        nit: nuevoCli.nit || null,
        telefono: nuevoCli.telefono || null,
      })
      .select()
      .single()

    if (error) return alert(`Error al guardar cliente: ${error.message}`)

    setClientes((p) => [...p, data as Cliente])
    setForm((f) => ({ ...f, cliente_id: String((data as any).id) }))
    setShowNuevoCli(false)
    setNuevoCli({ nombre: '', nit: '', telefono: '' })
  }

  const guardarVenta = useCallback(async () => {
    if (saving) return

    try {
      setSaving(true)

      const { data: auth } = await supabase.auth.getUser()
      const user_id = auth?.user?.id || null

      if (!form.fecha) return alert('Selecciona la fecha')

      const lineas = detalles
        .map((d) => ({
          ...d,
          cantidad: Number(d.cantidad || 0),
          precio_unitario: Number(d.precio_unitario || 0),
        }))
        .filter((d) => d.concepto.trim() && d.cantidad > 0)

      if (lineas.length === 0) return alert('Agrega al menos una línea válida')

      const totalVenta = round2(
        lineas.reduce((s, d) => s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0)
      )

      const pagoInicial = round2(toNum(pagadoInicial))
      const deuda = round2(Math.max(0, totalVenta - pagoInicial))

      if (pagoInicial < 0) {
        return alert('El pago inicial no puede ser negativo.')
      }

      if (pagoInicial > totalVenta) {
        return alert('El pago inicial no puede ser mayor que el total de la venta.')
      }

      if ((pagoInicial > 0 || deuda > 0) && !form.cliente_id) {
        return alert('Selecciona un cliente para registrar pago o deuda.')
      }

      if (pagoInicial > 0 && !metodoPagoInicialId) {
        return alert('Selecciona el método del pago inicial.')
      }

      if (deuda > 0 && !metodoPendiente?.id) {
        return alert(
          'No se encontró el método de pago "Pendiente de Pago". Créalo en forma_pago antes de guardar ventas con deuda.'
        )
      }

      for (const it of lineas) {
        if (!it.producto_id) continue

        const p = productos.find((x) => String(x.id) === String(it.producto_id))

        if (p && !p.control_inventario) {
          const ok = confirm(
            `El producto "${p.nombre}" no tiene control de inventario. ¿Deseas continuar igualmente?`
          )
          if (!ok) return
        }
      }

      const cabecera: any = {
        empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
        division_id: form.division_id ? Number(form.division_id) : null,
        cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
        fecha: form.fecha,
        observaciones: form.observaciones || null,
        cantidad: totalVenta,
        user_id,
      }

      const { data: venta, error: vErr } = await supabase
        .from('ventas')
        .insert([cabecera])
        .select('id')
        .single()

      if (vErr) throw new Error(`cabecera: ${vErr.message}`)

      const ventaId = (venta as any).id as number

      const payload = lineas.map((d) => {
        const importe = round2(d.cantidad * d.precio_unitario)

        return {
          venta_id: ventaId,
          producto_id: d.producto_id ? Number(d.producto_id) : null,
          concepto: d.concepto.trim(),
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
          importe,
          forma_pago_id:
            deuda > 0
              ? Number(metodoPendiente?.id)
              : d.forma_pago_id
                ? Number(d.forma_pago_id)
                : metodoPagoInicialId
                  ? Number(metodoPagoInicialId)
                  : null,
          documento: d.documento || documentoPagoInicial || null,
        }
      })

      const { error: detErr } = await supabase.from(DETALLE_VENTA_TABLE).insert(payload)

      if (detErr) throw new Error(`detalle: ${detErr.message || detErr.code || 'error'}`)

      if (pagoInicial > 0) {
        const { error: pagoErr } = await supabase.from('pagos_venta').insert({
          cliente_id: Number(form.cliente_id),
          venta_id: ventaId,
          fecha: form.fecha,
          monto: pagoInicial,
          metodo_pago_id: Number(metodoPagoInicialId),
          documento: documentoPagoInicial || null,
          observaciones:
            observacionesPagoInicial ||
            `Pago inicial registrado al crear la venta #${ventaId}`,
          user_id,
        })

        if (pagoErr) {
          throw new Error(
            `La venta fue creada, pero falló el pago inicial: ${pagoErr.message}`
          )
        }
      }

      setLastVentaId(ventaId)
      setCopiado(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      console.error(e)
      alert(`Error al guardar venta: ${e?.message ?? e}`)
    } finally {
      setSaving(false)
    }
  }, [
    saving,
    form,
    detalles,
    productos,
    pagadoInicial,
    metodoPagoInicialId,
    documentoPagoInicial,
    observacionesPagoInicial,
    metodoPendiente,
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Venta</h1>

      {lastVentaId !== null && (
        <div className="mb-4 rounded border border-emerald-600 bg-emerald-50 p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-emerald-800 font-semibold">
              ✅ Venta guardada correctamente —{' '}
              <span className="underline">#{lastVentaId}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-1 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={async () => {
                  await navigator.clipboard.writeText(String(lastVentaId))
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
              >
                {copiado ? '¡Copiado!' : 'Copiar ID'}
              </button>

              <button
                className="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => router.push(`/ventas/ver?id=${lastVentaId}`)}
              >
                Ver en “Ver Ventas”
              </button>

              <button
                className="px-3 py-1 text-sm rounded bg-slate-700 text-white hover:bg-slate-800"
                onClick={limpiarFormulario}
              >
                Seguir cargando
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <select
          className="border p-2"
          value={form.empresa_id}
          onChange={(e) => setForm((f) => ({ ...f, empresa_id: e.target.value }))}
        >
          <option value="">Selecciona Empresa</option>
          {empresas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>

        <select
          className="border p-2"
          value={form.division_id}
          onChange={(e) => setForm((f) => ({ ...f, division_id: e.target.value }))}
        >
          <option value="">Selecciona División</option>
          {divisiones.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <select
            className="border p-2 flex-grow"
            value={form.cliente_id}
            onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}
          >
            <option value="">Selecciona Cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.nit ? ` — ${c.nit}` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNuevoCli(!showNuevoCli)}
            className="px-3 bg-green-600 text-white rounded text-sm whitespace-nowrap"
          >
            {showNuevoCli ? 'Cancelar' : '➕ Nuevo'}
          </button>
        </div>

        {showNuevoCli && (
          <div className="border p-3 rounded bg-gray-50 space-y-2">
            <h3 className="font-semibold text-sm">Nuevo Cliente</h3>

            <input
              className="border p-2 w-full"
              placeholder="Nombre"
              value={nuevoCli.nombre}
              onChange={(e) => setNuevoCli({ ...nuevoCli, nombre: e.target.value })}
            />

            <input
              className="border p-2 w-full"
              placeholder="NIT"
              value={nuevoCli.nit}
              onChange={(e) => setNuevoCli({ ...nuevoCli, nit: e.target.value })}
            />

            <input
              className="border p-2 w-full"
              placeholder="Teléfono"
              value={nuevoCli.telefono}
              onChange={(e) => setNuevoCli({ ...nuevoCli, telefono: e.target.value })}
            />

            <button
              onClick={guardarNuevoCliente}
              className="w-full bg-blue-600 text-white py-2 rounded"
            >
              Guardar Cliente
            </button>
          </div>
        )}

        <input
          type="date"
          className="border p-2"
          value={form.fecha}
          onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
        />

        <textarea
          className="border p-2"
          placeholder="Observaciones"
          value={form.observaciones}
          onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
        />
      </div>

      <h2 className="text-xl font-semibold mt-6 mb-2">
        Artículos / Conceptos de Venta
      </h2>

      <p className="text-xs text-gray-600 mb-2">
        Puedes administrar productos en{' '}
        <a
          className="underline text-blue-600"
          href="/inventario"
          target="_blank"
          rel="noreferrer"
        >
          Inventario
        </a>
        .
      </p>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-xs font-semibold text-gray-700 mb-1">
        <div>Producto</div>
        <div>Concepto</div>
        <div>Cant.</div>
        <div>P. Unit</div>
        <div>Método de pago</div>
        <div>Documento</div>
        <div>Acción</div>
      </div>

      {detalles.map((d, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-2">
          <select
            className="border p-2"
            value={d.producto_id || ''}
            onChange={(e) => handleDetalleChange(i, 'producto_id', e.target.value)}
            aria-label="Producto"
          >
            <option value="">— Sin producto —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.sku ? `${p.sku} — ` : '') + p.nombre}
              </option>
            ))}
          </select>

          <input
            className="border p-2"
            placeholder="Concepto"
            value={d.concepto}
            onChange={(e) => handleDetalleChange(i, 'concepto', e.target.value)}
            aria-label="Concepto"
          />

          <input
            className="border p-2"
            type="number"
            min="0"
            step="1"
            placeholder="Cantidad"
            value={d.cantidad}
            onChange={(e) => handleDetalleChange(i, 'cantidad', e.target.value)}
            aria-label="Cantidad"
          />

          <input
            className="border p-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Precio unitario (Q)"
            value={d.precio_unitario}
            onChange={(e) => handleDetalleChange(i, 'precio_unitario', e.target.value)}
            aria-label="Precio unitario"
          />

          <select
            className="border p-2"
            value={d.forma_pago_id}
            onChange={(e) => handleDetalleChange(i, 'forma_pago_id', e.target.value)}
            aria-label="Método de pago"
            disabled={deudaCalculada > 0}
          >
            <option value="">Método de pago</option>
            {metodosPago.map((m) => (
              <option key={m.id} value={m.id}>
                {m.metodo}
              </option>
            ))}
          </select>

          <input
            className="border p-2"
            placeholder="Documento"
            value={d.documento}
            onChange={(e) => handleDetalleChange(i, 'documento', e.target.value)}
            aria-label="Documento"
          />

          <button
            onClick={() => removeDetalle(i)}
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm"
          >
            X
          </button>
        </div>
      ))}

      <button
        onClick={addDetalle}
        className="bg-green-500 text-white px-4 py-2 rounded mb-4"
      >
        + Agregar otra línea
      </button>

      <section className="border rounded p-4 bg-gray-50 mb-5">
        <h2 className="font-semibold mb-3">💵 Pago inicial / deuda</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium mb-1">Total venta (Q)</label>
            <input
              className="border p-2 w-full bg-white"
              value={totalCalculado.toFixed(2)}
              readOnly
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Se calcula automáticamente desde los artículos.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pagado inicial (Q)</label>
            <input
              className="border p-2 w-full"
              type="number"
              min="0"
              step="0.01"
              value={pagadoInicial}
              onChange={(e) => setPagadoInicial(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Si queda deuda, se registrará como pendiente de pago.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Deuda (Q)</label>
            <input
              className="border p-2 w-full bg-white"
              value={deudaCalculada.toFixed(2)}
              readOnly
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Total venta menos pagado inicial.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Método del pago inicial
            </label>
            <select
              className="border p-2 w-full"
              value={metodoPagoInicialId}
              onChange={(e) => setMetodoPagoInicialId(e.target.value)}
            >
              <option value="">— Selecciona —</option>
              {metodosPagoSinPendiente.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.metodo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Documento del pago
            </label>
            <input
              className="border p-2 w-full"
              value={documentoPagoInicial}
              onChange={(e) => setDocumentoPagoInicial(e.target.value)}
              placeholder="Boleta, recibo, transferencia..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Observaciones del pago
            </label>
            <input
              className="border p-2 w-full"
              value={observacionesPagoInicial}
              onChange={(e) => setObservacionesPagoInicial(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        {deudaCalculada > 0 && (
          <div className="mt-3 text-sm bg-yellow-100 border border-yellow-300 text-yellow-800 rounded p-2">
            Esta venta quedará con saldo pendiente de Q{deudaCalculada.toFixed(2)}.
            Las líneas se guardarán con el método{' '}
            <b>{metodoPendiente?.metodo || 'Pendiente de Pago'}</b> y el pago inicial
            se registrará como abono.
          </div>
        )}

        {deudaCalculada <= 0 && pagadoNum > 0 && (
          <div className="mt-3 text-sm bg-emerald-100 border border-emerald-300 text-emerald-800 rounded p-2">
            Esta venta quedará pagada completamente.
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <button
          onClick={guardarVenta}
          disabled={saving}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-4 py-2 rounded"
        >
          {saving ? 'Guardando...' : 'Guardar Venta'}
        </button>

        <button
          onClick={() => router.push('/menu')}
          className="bg-gray-700 text-white px-4 py-2 rounded"
        >
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
