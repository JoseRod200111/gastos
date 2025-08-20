'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Catalogo  = { id: number; nombre: string }
type MetodoPago = { id: number; metodo: string }
type Proveedor = {
  id: number
  nombre: string
  nit?: string | null
  direccion?: string | null
  contacto_nombre?: string | null
  telefono?: string | null
}
type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
  control_inventario: boolean
}

export default function NuevaErogacion() {
  const router = useRouter()

  /* ───────── catálogos ───────── */
  const [empresas,    setEmpresas]    = useState<Catalogo[]>([])
  const [divisiones,  setDivisiones]  = useState<Catalogo[]>([])
  const [categorias,  setCategorias]  = useState<Catalogo[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos,   setProductos]   = useState<Producto[]>([])

  /* ───────── cabecera ───────── */
  const [form, setForm] = useState({
    empresa_id:    '',
    division_id:   '',
    categoria_id:  '',
    proveedor_id:  '',
    fecha:         '',
    cantidad:      0,   // total de la erogación (se recalcula)
    observaciones: '',
  })

  /* ───────── detalles ─────────
     Si producto_id tiene valor → afecta inventario.
     Si va vacío → sólo concepto libre (sin inventario).
  */
  const [detalles, setDetalles] = useState<Array<{
    producto_id?: string
    concepto: string
    cantidad: number
    precio_unitario: number
    forma_pago_id: string
    documento: string
  }>>([{
    producto_id: '',
    concepto: '',
    cantidad: 0,
    precio_unitario: 0,
    forma_pago_id: '',
    documento: ''
  }])

  /* ───────── proveedor en línea ───────── */
  const [showNuevoProv, setShowNuevoProv] = useState(false)
  const [nuevoProv, setNuevoProv] = useState({
    nombre: '',
    nit: '',
    direccion: '',
    contacto_nombre: '',
    telefono: ''
  })

  /* ───────── carga inicial ───────── */
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
      setEmpresas   (emp.data   || [])
      setDivisiones (div.data   || [])
      setCategorias (cat.data   || [])
      setMetodosPago(met.data   || [])
      setProveedores(prov.data  || [])
      setProductos  ((prods.data as Producto[]) || [])
    })()
  }, [])

  /* ───────── total erogación ───────── */
  useEffect(() => {
    const total = detalles.reduce((acc, d) =>
      acc + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0
    )
    setForm(f => ({ ...f, cantidad: total }))
  }, [detalles])

  /* ───────── helpers detalle ───────── */
  const handleDetalleChange = (i: number, field: string, val: any) => {
    setDetalles(prev => {
      const copy = [...prev]
      let v: any = val

      if (field === 'cantidad' || field === 'precio_unitario') {
        v = parseFloat(val || '0')
        if (Number.isNaN(v)) v = 0
      }

      // Si eligen producto y el concepto está vacío, auto-llenar
      if (field === 'producto_id') {
        const prod = productos.find(p => String(p.id) === String(val))
        if (prod && !copy[i].concepto.trim()) copy[i].concepto = prod.nombre
      }

      copy[i] = { ...copy[i], [field]: v }
      return copy
    })
  }

  const addDetalle = () =>
    setDetalles(prev => [
      ...prev,
      { producto_id: '', concepto: '', cantidad: 0, precio_unitario: 0, forma_pago_id: '', documento: '' },
    ])

  /* ───────── crear proveedor ───────── */
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

    if (error) { alert('Error al guardar proveedor'); return }
    setProveedores(p => [...p, data as Proveedor])
    setForm(f => ({ ...f, proveedor_id: String((data as any).id) }))
    setShowNuevoProv(false)
    setNuevoProv({ nombre:'', nit:'', direccion:'', contacto_nombre:'', telefono:'' })
  }

  /* ───────── guardar ───────── */
  const guardarErogacion = async () => {
    try {
      if (!form.proveedor_id) return alert('Selecciona (o crea) un proveedor')
      if (!form.fecha)       return alert('Selecciona la fecha')
      if (detalles.length === 0) return alert('Agrega al menos un artículo')

      // 1) Cabecera: casteamos IDs a número donde corresponda
      const cabecera = {
        empresa_id:    form.empresa_id   ? Number(form.empresa_id)   : null,
        division_id:   form.division_id  ? Number(form.division_id)  : null,
        categoria_id:  form.categoria_id ? Number(form.categoria_id) : null,
        proveedor_id:  Number(form.proveedor_id),
        fecha:         form.fecha,
        cantidad:      Number(form.cantidad || 0),
        observaciones: form.observaciones || null,
      }

      const { data: erog, error: erogErr } =
        await supabase.from('erogaciones').insert([cabecera]).select().single()

      if (erogErr) {
        console.error('Error erogaciones:', erogErr)
        alert('Error al guardar la erogación')
        return
      }

      // 2) Detalles: tipado estricto y NULLs correctos
      const det = detalles.map(d => ({
        erogacion_id: (erog as any).id,
        producto_id:  d.producto_id ? Number(d.producto_id) : null,
        concepto:     (d.concepto || '').trim(),
        cantidad:     Number(d.cantidad || 0),
        precio_unitario: Number(d.precio_unitario || 0),
        importe:      Number(d.cantidad || 0) * Number(d.precio_unitario || 0),
        forma_pago_id: d.forma_pago_id ? Number(d.forma_pago_id) : null,
        documento:    d.documento?.trim() ? d.documento.trim() : null,
      }))

      // Validación rápida: al menos una línea con cantidad>0
      if (!det.some(d => d.cantidad > 0)) {
        alert('Cada artículo debe tener una cantidad mayor a 0.')
        return
      }

      const { error: detErr } = await supabase.from('detalle_compra').insert(det)
      if (detErr) {
        console.error('Error detalle_compra:', detErr)
        alert(`Error al guardar detalle`)
        return
      }

      /* Si el trigger AFTER INSERT en detalle_compra está activo,
         las líneas con producto_id NO nulo generan el movimiento de inventario. */

      alert('Erogación guardada correctamente')
      router.push('/menu')
    } catch (e:any) {
      console.error(e)
      alert('Ocurrió un error inesperado')
    }
  }

  /* ───────── UI ───────── */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      {/* Cabecera */}
      <div className="grid grid-cols-1 gap-4">
        <select className="border p-2" value={form.empresa_id}
          onChange={e=>setForm({ ...form, empresa_id: e.target.value })}>
          <option value="">Selecciona Empresa</option>
          {empresas.map(x=> <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        <select className="border p-2" value={form.division_id}
          onChange={e=>setForm({ ...form, division_id: e.target.value })}>
          <option value="">Selecciona División</option>
          {divisiones.map(x=> <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        <select className="border p-2" value={form.categoria_id}
          onChange={e=>setForm({ ...form, categoria_id: e.target.value })}>
          <option value="">Selecciona Categoría</option>
          {categorias.map(x=> <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* Proveedor */}
        <div className="flex gap-2">
          <select className="border p-2 flex-grow" value={form.proveedor_id}
            onChange={e=>setForm({ ...form, proveedor_id: e.target.value })}>
            <option value="">Selecciona Proveedor</option>
            {proveedores.map(p=> <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button
            onClick={()=>setShowNuevoProv(!showNuevoProv)}
            className="px-3 bg-green-600 text-white rounded text-sm whitespace-nowrap">
            {showNuevoProv ? 'Cancelar' : '➕ Nuevo'}
          </button>
        </div>

        {showNuevoProv && (
          <div className="border p-3 rounded bg-gray-50 space-y-2">
            <h3 className="font-semibold text-sm">Nuevo Proveedor</h3>
            <input className="border p-2 w-full" placeholder="Nombre"
              value={nuevoProv.nombre} onChange={e=>setNuevoProv({...nuevoProv,nombre:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="NIT"
              value={nuevoProv.nit} onChange={e=>setNuevoProv({...nuevoProv,nit:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="Dirección"
              value={nuevoProv.direccion} onChange={e=>setNuevoProv({...nuevoProv,direccion:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="Contacto"
              value={nuevoProv.contacto_nombre} onChange={e=>setNuevoProv({...nuevoProv,contacto_nombre:e.target.value})}/>
            <input className="border p-2 w-full" placeholder="Teléfono"
              value={nuevoProv.telefono} onChange={e=>setNuevoProv({...nuevoProv,telefono:e.target.value})}/>
            <button onClick={guardarNuevoProveedor}
              className="w-full bg-blue-600 text-white py-2 rounded">
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
      <h2 className="text-xl font-semibold mt-6 mb-2">Artículos de Compra</h2>

      <p className="text-xs text-gray-600 mb-2">
        Puedes crear productos desde{' '}
        <a className="underline text-blue-600" href="/inventario" target="_blank" rel="noreferrer">Inventario</a>.
      </p>

      {detalles.map((d,i)=>(
        <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
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

          <input className="border p-2" type="number" min="0" placeholder="Cantidad"
            value={d.cantidad} onChange={e=>handleDetalleChange(i,'cantidad',e.target.value)}/>

          <input className="border p-2" type="number" min="0" step="0.01" placeholder="Precio unitario (Q)"
            value={d.precio_unitario} onChange={e=>handleDetalleChange(i,'precio_unitario',e.target.value)}/>

          <select className="border p-2" value={d.forma_pago_id}
            onChange={e=>handleDetalleChange(i,'forma_pago_id',e.target.value)}>
            <option value="">Método de pago</option>
            {metodosPago.map(m=> <option key={m.id} value={m.id}>{m.metodo}</option>)}
          </select>

          <input className="border p-2" placeholder="Documento"
            value={d.documento} onChange={e=>handleDetalleChange(i,'documento',e.target.value)}/>
        </div>
      ))}

      <button onClick={addDetalle} className="bg-green-500 text-white px-4 py-2 rounded mb-4">
        + Agregar otro artículo
      </button>

      <div className="text-lg font-semibold mb-4">
        Total Calculado: Q{form.cantidad.toFixed(2)}
      </div>

      <div className="flex justify-between">
        <button onClick={guardarErogacion}
          className="bg-blue-600 text-white px-4 py-2 rounded">
          Guardar Erogación
        </button>
        <button onClick={()=>router.push('/menu')}
          className="bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
