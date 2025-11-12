'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Catalogo   = { id: number; nombre: string }
type MetodoPago = { id: number; metodo: string }
type Proveedor  = {
  id: number; nombre: string
  nit?: string|null; direccion?: string|null
  contacto_nombre?: string|null; telefono?: string|null
}
type Producto   = {
  id: number; nombre: string; sku: string|null; unidad: string|null; control_inventario: boolean
}

type DetalleForm = {
  producto_id?: string
  concepto: string
  cantidad: number
  precio_unitario: number
  forma_pago_id: string
  documento: string
}

const DETALLE_INICIAL: DetalleForm = {
  producto_id: '',
  concepto: '',
  cantidad: 0,
  precio_unitario: 0,
  forma_pago_id: '',
  documento: ''
}

export default function NuevaErogacion() {
  const router = useRouter()

  /* catálogos */
  const [empresas, setEmpresas]       = useState<Catalogo[]>([])
  const [divisiones, setDivisiones]   = useState<Catalogo[]>([])
  const [categorias, setCategorias]   = useState<Catalogo[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos]     = useState<Producto[]>([])

  /* cabecera */
  const [form, setForm] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    proveedor_id: '',
    fecha: '',
    cantidad: 0,            // total calculado
    observaciones: ''
  })

  /* detalles */
  const [detalles, setDetalles] = useState<DetalleForm[]>([ { ...DETALLE_INICIAL } ])

  /* nuevo proveedor (alta rápida) */
  const [showNuevoProv, setShowNuevoProv] = useState(false)
  const [nuevoProv, setNuevoProv] = useState({
    nombre:'', nit:'', direccion:'', contacto_nombre:'', telefono:''
  })

  /* feedback al guardar */
  const [ultimoId, setUltimoId] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  /* carga inicial de catálogos */
  useEffect(() => {
    (async () => {
      const [emp, div, cat, met, prov, prods] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('categorias').select('*'),
        supabase.from('forma_pago').select('*'),
        supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
        supabase.from('productos').select('id,nombre,sku,unidad,control_inventario').order('nombre', { ascending: true }),
      ])

      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
      setCategorias(cat.data || [])
      setMetodosPago(met.data || [])
      setProveedores(prov.data || [])
      setProductos((prods.data as Producto[]) || [])
    })()
  }, [])

  /* total calculado */
  const total = useMemo(() =>
    detalles.reduce((s, d) => s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0)
  , [detalles])

  useEffect(() => {
    setForm(f => ({ ...f, cantidad: total }))
  }, [total])

  /* helpers detalle */
  const handleDetalleChange = (i: number, field: keyof DetalleForm, val: any) => {
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

  const addDetalle = () => setDetalles(d => [...d, { ...DETALLE_INICIAL }])

  const copiar = async (txt: string) => {
    try { await navigator.clipboard.writeText(txt) } catch {}
  }

  /* alta rápida de proveedor */
  const guardarNuevoProveedor = async () => {
    if (!nuevoProv.nombre.trim()) return alert('El nombre del proveedor es obligatorio')
    const { data, error } = await supabase
      .from('proveedores')
      .insert({
        nombre: nuevoProv.nombre.trim().toUpperCase(),
        nit: nuevoProv.nit || null,
        direccion: nuevoProv.direccion || null,
        contacto_nombre: nuevoProv.contacto_nombre || null,
        telefono: nuevoProv.telefono || null,
      })
      .select()
      .single()

    if (error) return alert(`Error al guardar proveedor: ${error.message}`)
    setProveedores(p => [...p, data as Proveedor])
    setForm(f => ({ ...f, proveedor_id: String((data as any).id) }))
    setShowNuevoProv(false)
    setNuevoProv({ nombre:'', nit:'', direccion:'', contacto_nombre:'', telefono:'' })
  }

  /* guardar erogación */
  const guardarErogacion = async () => {
    try {
      if (!form.proveedor_id) return alert('Selecciona (o crea) un proveedor')
      if (!form.fecha)        return alert('Selecciona la fecha')
      if (detalles.length === 0) return alert('Agrega al menos un artículo')

      setGuardando(true)
      setUltimoId(null)

      // 1) Insert cabecera
      const { data: erog, error: errCab } = await supabase
        .from('erogaciones')
        .insert([{
          empresa_id   : form.empresa_id ? Number(form.empresa_id) : null,
          division_id  : form.division_id ? Number(form.division_id) : null,
          categoria_id : form.categoria_id ? Number(form.categoria_id) : null,
          proveedor_id : form.proveedor_id ? Number(form.proveedor_id) : null,
          fecha        : form.fecha,
          observaciones: form.observaciones || null,
          cantidad     : Number(total || 0),
        }])
        .select('id')
        .single()

      if (errCab) throw new Error(`cabecera: ${errCab.message}`)

      const erogacionId = (erog as any).id as number

      // 2) Insert detalle (sin 'importe', lo calcula el trigger)
      const payload = detalles.map(d => ({
        erogacion_id   : erogacionId,
        producto_id    : d.producto_id ? Number(d.producto_id) : null,
        concepto       : d.concepto,
        cantidad       : Number(d.cantidad || 0),
        precio_unitario: Number(d.precio_unitario || 0),
        forma_pago_id  : d.forma_pago_id ? Number(d.forma_pago_id) : null,
        documento      : d.documento || null
      }))

      const { error: errDet } = await supabase.from('detalle_compra').insert(payload)
      if (errDet) throw new Error(`detalle: ${errDet.message}`)

      // 3) Éxito: mostramos ID, limpiamos formulario si quieres seguir cargando
      setUltimoId(erogacionId)
      // limpiar líneas pero mantener cabeceras por si deseas registrar varias seguidas
      setDetalles([{ ...DETALLE_INICIAL }])
      setForm(f => ({ ...f, cantidad: 0 }))
    } catch (e: any) {
      alert(`Error al guardar: ${e?.message ?? e}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo" width={160} height={64} priority />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      {/* Panel de éxito con ID */}
      {ultimoId !== null && (
        <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">¡Erogación creada!</span>
            <span> ID: <span className="font-mono font-semibold">#{ultimoId}</span></span>
            <button
              onClick={() => copiar(String(ultimoId))}
              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
            >
              Copiar ID
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => router.push('/erogacion/ver')}
              className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-700"
            >
              Ver erogaciones
            </button>
            <button
              onClick={() => setUltimoId(null)}
              className="rounded bg-gray-700 px-3 py-1 text-white hover:bg-gray-800"
            >
              Seguir cargando
            </button>
            <button
              onClick={() => router.push('/menu')}
              className="rounded bg-slate-600 px-3 py-1 text-white hover:bg-slate-700"
            >
              Volver al menú
            </button>
          </div>
        </div>
      )}

      {/* cabecera */}
      <div className="grid grid-cols-1 gap-4">
        <select className="border p-2" value={form.empresa_id}
                onChange={e=>setForm({...form,empresa_id:e.target.value})}>
          <option value="">Selecciona Empresa</option>
          {empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        <select className="border p-2" value={form.division_id}
                onChange={e=>setForm({...form,division_id:e.target.value})}>
          <option value="">Selecciona División</option>
          {divisiones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        <select className="border p-2" value={form.categoria_id}
                onChange={e=>setForm({...form,categoria_id:e.target.value})}>
          <option value="">Selecciona Categoría</option>
          {categorias.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* Proveedor + Alta rápida */}
        <div className="flex gap-2">
          <select className="border p-2 flex-grow" value={form.proveedor_id}
                  onChange={e=>setForm({...form,proveedor_id:e.target.value})}>
            <option value="">Selecciona Proveedor</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button
            onClick={()=>setShowNuevoProv(!showNuevoProv)}
            className="whitespace-nowrap rounded bg-green-600 px-3 text-sm text-white"
          >
            {showNuevoProv ? 'Cancelar' : '➕ Nuevo'}
          </button>
        </div>

        {showNuevoProv && (
          <div className="space-y-2 rounded border bg-gray-50 p-3">
            <h3 className="text-sm font-semibold">Nuevo Proveedor</h3>
            <input className="w-full border p-2" placeholder="Nombre"
                   value={nuevoProv.nombre} onChange={e=>setNuevoProv({...nuevoProv,nombre:e.target.value})}/>
            <input className="w-full border p-2" placeholder="NIT"
                   value={nuevoProv.nit} onChange={e=>setNuevoProv({...nuevoProv,nit:e.target.value})}/>
            <input className="w-full border p-2" placeholder="Dirección"
                   value={nuevoProv.direccion} onChange={e=>setNuevoProv({...nuevoProv,direccion:e.target.value})}/>
            <input className="w-full border p-2" placeholder="Contacto"
                   value={nuevoProv.contacto_nombre} onChange={e=>setNuevoProv({...nuevoProv,contacto_nombre:e.target.value})}/>
            <input className="w-full border p-2" placeholder="Teléfono"
                   value={nuevoProv.telefono} onChange={e=>setNuevoProv({...nuevoProv,telefono:e.target.value})}/>
            <button onClick={guardarNuevoProveedor} className="w-full rounded bg-blue-600 py-2 text-white">
              Guardar Proveedor
            </button>
          </div>
        )}

        <input type="date" className="border p-2"
               value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})}/>
        <textarea className="border p-2" placeholder="Observaciones generales"
                  value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})}/>
      </div>

      {/* Detalles */}
      <h2 className="mt-6 mb-2 text-xl font-semibold">Artículos de Compra</h2>
      <p className="mb-2 text-xs text-gray-600">
        Puedes crear productos desde{' '}
        <a className="text-blue-600 underline" href="/inventario" target="_blank" rel="noreferrer">Inventario</a>.
      </p>

      {/* Encabezado para distinguir Cantidad y Precio */}
      <div className="mb-1 hidden grid-cols-6 gap-2 text-xs font-semibold text-gray-600 md:grid">
        <div>Producto</div>
        <div>Concepto</div>
        <div className="text-right">Cant.</div>
        <div className="text-right">Precio unitario (Q)</div>
        <div>Método de pago</div>
        <div>Documento</div>
      </div>

      {detalles.map((d,i)=>(
        <div key={i} className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-6">
          <select className="border p-2" value={d.producto_id || ''}
                  onChange={e=>handleDetalleChange(i,'producto_id',e.target.value)}>
            <option value="">— Sin producto (no inventario) —</option>
            {productos.map(p=>(
              <option key={p.id} value={p.id}>
                {(p.sku ? `${p.sku} — ` : '') + p.nombre}
              </option>
            ))}
          </select>

          <input className="border p-2" placeholder="Concepto"
                 value={d.concepto} onChange={e=>handleDetalleChange(i,'concepto',e.target.value)}/>

          <input className="border p-2 text-right" type="number" min="0" placeholder="0"
                 value={d.cantidad}
                 onChange={e=>handleDetalleChange(i,'cantidad',e.target.value)}
                 aria-label="Cantidad" />

          <input className="border p-2 text-right" type="number" min="0" step="0.01" placeholder="0.00"
                 value={d.precio_unitario}
                 onChange={e=>handleDetalleChange(i,'precio_unitario',e.target.value)}
                 aria-label="Precio unitario (Q)" />

          <select className="border p-2" value={d.forma_pago_id}
                  onChange={e=>handleDetalleChange(i,'forma_pago_id',e.target.value)}>
            <option value="">Método de pago</option>
            {metodosPago.map(m => <option key={m.id} value={m.id}>{m.metodo}</option>)}
          </select>

          <input className="border p-2" placeholder="Documento"
                 value={d.documento} onChange={e=>handleDetalleChange(i,'documento',e.target.value)}/>
        </div>
      ))}

      <button onClick={addDetalle} className="mb-4 rounded bg-green-600 px-4 py-2 text-white">
        + Agregar otro artículo
      </button>

      <div className="mb-4 text-lg font-semibold">
        Total Calculado: Q{(total || 0).toFixed(2)}
      </div>

      <div className="flex justify-between gap-2">
        <button
          onClick={guardarErogacion}
          disabled={guardando}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar Erogación'}
        </button>
        <button
          onClick={()=>router.push('/menu')}
          className="rounded bg-gray-700 px-4 py-2 text-white"
        >
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
