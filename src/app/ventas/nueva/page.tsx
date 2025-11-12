'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Catalogo   = { id: number; nombre: string }
type MetodoPago = { id: number; metodo: string }
type Cliente    = { id: number; nombre: string; nit?: string|null; telefono?: string|null }
type Producto   = { id: number; nombre: string; sku: string|null; unidad: string|null; control_inventario: boolean }

const DETALLE_VENTA_TABLE = 'detalle_venta'

export default function NuevaVenta() {
  const router = useRouter()

  /* catálogos */
  const [empresas, setEmpresas]       = useState<Catalogo[]>([])
  const [divisiones, setDivisiones]   = useState<Catalogo[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [clientes, setClientes]       = useState<Cliente[]>([])
  const [productos, setProductos]     = useState<Producto[]>([])

  /* cabecera */
  const [form, setForm] = useState({
    empresa_id: '', division_id: '',
    cliente_id: '', fecha: '', total: 0,
    observaciones: ''
  })

  /* líneas */
  type Linea = {
    producto_id?: string
    concepto: string
    cantidad: number
    precio_unitario: number
    forma_pago_id: string
    documento: string
  }

  const [detalles, setDetalles] = useState<Linea[]>([
    { producto_id:'', concepto:'', cantidad:0, precio_unitario:0, forma_pago_id:'', documento:'' }
  ])

  /* nuevo cliente */
  const [showNuevoCli, setShowNuevoCli] = useState(false)
  const [nuevoCli, setNuevoCli] = useState({ nombre:'', nit:'', telefono:'' })

  /* feedback de guardado (ID de la venta recién creada) */
  const [lastVentaId, setLastVentaId] = useState<number | null>(null)
  const [copiado, setCopiado] = useState(false)

  /* carga inicial */
  useEffect(() => {
    (async () => {
      const [emp, div, met, cli, prods] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('forma_pago').select('*'),
        supabase.from('clientes').select('*').order('nombre', { ascending: true }),
        supabase.from('productos').select('id,nombre,sku,unidad,control_inventario').order('nombre', { ascending: true }),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setMetodosPago(met.data || [])
      setClientes(cli.data || [])
      setProductos((prods.data as Producto[]) || [])
    })()
  }, [])

  /* recálculo total */
  useEffect(() => {
    const total = detalles.reduce((s, d) =>
      s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0)
    setForm(f => ({ ...f, total }))
  }, [detalles])

  /* helpers detalle */
  const handleDetalleChange = (i: number, field: keyof Linea, val: any) => {
    setDetalles(prev => {
      const copy = [...prev]
      let v: any = val
      if (field === 'cantidad' || field === 'precio_unitario') v = parseFloat(val || '0')
      if (field === 'producto_id') {
        const prod = productos.find(p => String(p.id) === String(val))
        if (prod && !copy[i].concepto.trim()) copy[i].concepto = prod.nombre
      }
      copy[i] = { ...copy[i], [field]: v }
      return copy
    })
  }

  const addDetalle = () => setDetalles(d => [...d, {
    producto_id:'', concepto:'', cantidad:0, precio_unitario:0, forma_pago_id:'', documento:''
  }])

  const limpiarFormulario = () => {
    setForm({ empresa_id:'', division_id:'', cliente_id:'', fecha:'', total:0, observaciones:'' })
    setDetalles([{ producto_id:'', concepto:'', cantidad:0, precio_unitario:0, forma_pago_id:'', documento:'' }])
    setLastVentaId(null)
  }

  /* guardar cliente rápido */
  const guardarNuevoCliente = async () => {
    if (!nuevoCli.nombre.trim()) return alert('El nombre del cliente es obligatorio')
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        nombre: nuevoCli.nombre.trim().toUpperCase(),
        nit: nuevoCli.nit || null,
        telefono: nuevoCli.telefono || null
      })
      .select()
      .single()
    if (error) return alert(`Error al guardar cliente: ${error.message}`)
    setClientes(p => [...p, data as Cliente])
    setForm(f => ({ ...f, cliente_id: String((data as any).id) }))
    setShowNuevoCli(false)
    setNuevoCli({ nombre:'', nit:'', telefono:'' })
  }

  /* guardar venta */
  const guardarVenta = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      const user_id = auth?.user?.id || null

      if (!form.fecha) return alert('Selecciona la fecha')

      const lineas = detalles
        .map(d => ({
          ...d,
          cantidad: Number(d.cantidad || 0),
          precio_unitario: Number(d.precio_unitario || 0),
        }))
        .filter(d => d.concepto.trim() && d.cantidad > 0)

      if (lineas.length === 0) return alert('Agrega al menos una línea válida')

      // aviso si algún producto no controla inventario
      for (const it of lineas) {
        if (!it.producto_id) continue
        const p = productos.find(x => String(x.id) === String(it.producto_id))
        if (p && !p.control_inventario) {
          const ok = confirm(`El producto "${p.nombre}" no tiene control de inventario. ¿Deseas continuar igualmente?`)
          if (!ok) return
        }
      }

      // 1) insertar cabecera (ventas)
      const cabecera: any = {
        empresa_id : form.empresa_id ? Number(form.empresa_id) : null,
        division_id: form.division_id ? Number(form.division_id) : null,
        cliente_id : form.cliente_id ? Number(form.cliente_id) : null,
        fecha      : form.fecha,
        observaciones: form.observaciones || null,
        cantidad   : Number(form.total || 0), // “Total” de la venta se guarda en `ventas.cantidad`
        user_id
      }

      const { data: venta, error: vErr } = await supabase
        .from('ventas')
        .insert([cabecera])
        .select('id')
        .single()

      if (vErr) throw new Error(`cabecera: ${vErr.message}`)

      const ventaId = (venta as any).id as number

      // 2) insertar detalle (detalle_venta)
      const payload = lineas.map(d => {
        const importe = Number((d.cantidad * d.precio_unitario).toFixed(2))
        return {
          venta_id       : ventaId,
          producto_id    : d.producto_id ? Number(d.producto_id) : null,
          concepto       : d.concepto.trim(),
          cantidad       : d.cantidad,
          precio_unitario: d.precio_unitario,
          importe,
          forma_pago_id  : d.forma_pago_id ? Number(d.forma_pago_id) : null,
          documento      : d.documento || null
        }
      })

      const { error: detErr } = await supabase.from(DETALLE_VENTA_TABLE).insert(payload)
      if (detErr) throw new Error(`detalle: ${detErr.message || detErr.code || 'error'}`)

      // listo
      setLastVentaId(ventaId)
      setCopiado(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      console.error(e)
      alert(`Error al guardar venta: ${e?.message ?? e}`)
    }
  }, [form, detalles, productos])

  /* totales derivados */
  const totalCalculado = useMemo(() => Number(form.total || 0), [form.total])

  /* UI */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Venta</h1>

      {/* --- Banner de éxito con ID de venta --- */}
      {lastVentaId !== null && (
        <div className="mb-4 rounded border border-emerald-600 bg-emerald-50 p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-emerald-800 font-semibold">
              ✅ Venta guardada correctamente — <span className="underline"># {lastVentaId}</span>
            </div>
            <div className="flex gap-2">
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

      {/* cabecera */}
      <div className="grid grid-cols-1 gap-4">
        <select className="border p-2" value={form.empresa_id}
                onChange={e=>setForm(f=>({...f,empresa_id:e.target.value}))}>
          <option value="">Selecciona Empresa</option>
          {empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        <select className="border p-2" value={form.division_id}
                onChange={e=>setForm(f=>({...f,division_id:e.target.value}))}>
          <option value="">Selecciona División</option>
          {divisiones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* Cliente + Alta rápida */}
        <div className="flex gap-2">
          <select className="border p-2 flex-grow" value={form.cliente_id}
                  onChange={e=>setForm(f=>({...f,cliente_id:e.target.value}))}>
            <option value="">Selecciona Cliente</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button
            onClick={()=>setShowNuevoCli(!showNuevoCli)}
            className="px-3 bg-green-600 text-white rounded text-sm whitespace-nowrap"
          >
            {showNuevoCli ? 'Cancelar' : '➕ Nuevo'}
          </button>
        </div>

        {showNuevoCli && (
          <div className="border p-3 rounded bg-gray-50 space-y-2">
            <h3 className="font-semibold text-sm">Nuevo Cliente</h3>
            <input className="border p-2 w-full" placeholder="Nombre"
                   value={nuevoCli.nombre} onChange={e=>setNuevoCli({...nuevoCli,nombre:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="NIT"
                   value={nuevoCli.nit} onChange={e=>setNuevoCli({...nuevoCli,nit:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="Teléfono"
                   value={nuevoCli.telefono} onChange={e=>setNuevoCli({...nuevoCli,telefono:e.target.value})}/>
            <button onClick={guardarNuevoCliente} className="w-full bg-blue-600 text-white py-2 rounded">
              Guardar Cliente
            </button>
          </div>
        )}

        <input type="date" className="border p-2"
               value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
        <textarea className="border p-2" placeholder="Observaciones"
                  value={form.observaciones} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/>
      </div>

      {/* líneas */}
      <h2 className="text-xl font-semibold mt-6 mb-2">Artículos / Conceptos de Venta</h2>

      <p className="text-xs text-gray-600 mb-2">
        Puedes administrar productos en{' '}
        <a className="underline text-blue-600" href="/inventario" target="_blank" rel="noreferrer">Inventario</a>.
      </p>

      {/* encabezado de columnas */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs font-semibold text-gray-700 mb-1">
        <div>Producto</div>
        <div>Concepto</div>
        <div>Cant.</div>
        <div>P. Unit</div>
        <div>Método de pago</div>
        <div>Documento</div>
      </div>

      {detalles.map((d,i)=>(
        <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
          <select className="border p-2" value={d.producto_id || ''}
                  onChange={e=>handleDetalleChange(i,'producto_id',e.target.value)}
                  aria-label="Producto">
            <option value="">— Sin producto —</option>
            {productos.map(p=>(
              <option key={p.id} value={p.id}>
                {(p.sku ? `${p.sku} — ` : '') + p.nombre}
              </option>
            ))}
          </select>

          <input className="border p-2" placeholder="Concepto"
                 value={d.concepto} onChange={e=>handleDetalleChange(i,'concepto',e.target.value)} aria-label="Concepto"/>

          <input className="border p-2" type="number" min="0" step="1" placeholder="Cantidad"
                 title="Cantidad" aria-label="Cantidad"
                 value={d.cantidad} onChange={e=>handleDetalleChange(i,'cantidad',e.target.value)}/>

          <input className="border p-2" type="number" min="0" step="0.01" placeholder="Precio unitario (Q)"
                 title="Precio unitario (Q)" aria-label="Precio unitario"
                 value={d.precio_unitario} onChange={e=>handleDetalleChange(i,'precio_unitario',e.target.value)}/>

          <select className="border p-2" value={d.forma_pago_id}
                  onChange={e=>handleDetalleChange(i,'forma_pago_id',e.target.value)} aria-label="Método de pago">
            <option value="">Método de pago</option>
            {metodosPago.map(m=><option key={m.id} value={m.id}>{m.metodo}</option>)}
          </select>

          <input className="border p-2" placeholder="Documento"
                 value={d.documento} onChange={e=>handleDetalleChange(i,'documento',e.target.value)} aria-label="Documento"/>
        </div>
      ))}

      <button onClick={addDetalle} className="bg-green-500 text-white px-4 py-2 rounded mb-4">
        + Agregar otra línea
      </button>

      <div className="text-lg font-semibold mb-4">Total Calculado: Q{totalCalculado.toFixed(2)}</div>

      {/* Abono inicial (opcional) – tu bloque puede permanecer aquí si manejas abonos al crear */}
      <div className="flex justify-between">
        <button onClick={guardarVenta} className="bg-orange-600 text-white px-4 py-2 rounded">
          Guardar Venta
        </button>
        <button onClick={()=>router.push('/menu')} className="bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
