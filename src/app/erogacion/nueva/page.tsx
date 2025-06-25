'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NuevaErogacion() {
  const router = useRouter()

  /* ──────────────────────────── catálogos ──────────────────────────── */
  const [empresas,   setEmpresas]   = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [metodosPago,setMetodosPago]= useState<any[]>([])
  const [proveedores,setProveedores]= useState<any[]>([])

  /* ──────────────────────────── formulario ──────────────────────────── */
  const [form, setForm] = useState({
    empresa_id:   '',
    division_id:  '',
    categoria_id: '',
    proveedor_id: '',
    fecha:        '',
    cantidad:     0,
    observaciones:''
  })

  /* ───────────── detalles (artículos) ───────────── */
  const [detalles,setDetalles]=useState<Array<{
    concepto:string, cantidad:number, precio_unitario:number,
    forma_pago_id:string, documento:string
  }>>([{ concepto:'',cantidad:0,precio_unitario:0,forma_pago_id:'',documento:'' }])

  /* ───────────── formulario “nuevo proveedor” ───────────── */
  const [showNuevoProv,setShowNuevoProv]=useState(false)
  const [nuevoProv,setNuevoProv]=useState({
    nombre:'', nit:'', direccion:'', contacto_nombre:'', telefono:''
  })

  /* ─────────────────────────── carga inicial ─────────────────────────── */
  useEffect(()=>{
    (async ()=>{
      const [emp,div,cat,met,prov]=await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
        supabase.from('categorias').select('*'),
        supabase.from('forma_pago').select('*'),
        supabase.from('proveedores').select('*').order('nombre',{ascending:true})
      ])
      setEmpresas(emp.data||[])
      setDivisiones(div.data||[])
      setCategorias(cat.data||[])
      setMetodosPago(met.data||[])
      setProveedores(prov.data||[])
    })()
  },[])

  /* ───────────── recalcula total ───────────── */
  useEffect(()=>{
    const total = detalles.reduce((sum,d)=>sum+Number(d.cantidad)*Number(d.precio_unitario),0)
    setForm(f=>({...f,cantidad:total}))
  },[detalles])

  /* ───────────── helpers de detalle ───────────── */
  const handleDetalleChange=(i:number,field:string,val:any)=>{
    setDetalles(prev=>{
      const copy=[...prev]
      copy[i]={...copy[i],[field]:
        field==='cantidad'||field==='precio_unitario'?parseFloat(val):val}
      return copy
    })
  }
  const addDetalle=()=>setDetalles([...detalles,{concepto:'',cantidad:0,precio_unitario:0,forma_pago_id:'',documento:''}])

  /* ───────────── alta de proveedor “al vuelo” ───────────── */
  const guardarNuevoProveedor=async ()=>{
    if(!nuevoProv.nombre.trim()) return alert('El nombre del proveedor es obligatorio')
    const {data,error}=await supabase.from('proveedores').insert({
      nombre:nuevoProv.nombre.trim().toUpperCase(),
      nit:nuevoProv.nit,direccion:nuevoProv.direccion,
      contacto_nombre:nuevoProv.contacto_nombre,telefono:nuevoProv.telefono
    }).select().single()
    if(error){ alert('Error al guardar proveedor'); return }
    setProveedores(p=>[...p,data])
    setForm(f=>({...f,proveedor_id:data.id}))
    setShowNuevoProv(false)
    setNuevoProv({nombre:'',nit:'',direccion:'',contacto_nombre:'',telefono:''})
  }

  /* ───────────── guardar erogación ───────────── */
  const guardarErogacion=async ()=>{
    if(!form.proveedor_id) return alert('Selecciona (o crea) un proveedor')
    const {data:erog,error}=await supabase.from('erogaciones')
      .insert([form]).select().single()
    if(error){ alert('Error al guardar la erogación');return }

    const det = detalles.map(d=>({...d,erogacion_id:erog.id}))
    const {error:detErr}=await supabase.from('detalle_compra').insert(det)
    if(detErr){ alert('Error al guardar detalle');return }
    alert('Erogación guardada correctamente')
    router.push('/dashboard')
  }

  /* ──────────────────────────── UI ──────────────────────────── */
  return(
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      {/* ───── cabecera de selección ───── */}
      <div className="grid grid-cols-1 gap-4">
        {/* Empresa */}
        <select className="border p-2" value={form.empresa_id}
          onChange={e=>setForm({...form,empresa_id:e.target.value})}>
          <option value="">Selecciona Empresa</option>
          {empresas.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* División */}
        <select className="border p-2" value={form.division_id}
          onChange={e=>setForm({...form,division_id:e.target.value})}>
          <option value="">Selecciona División</option>
          {divisiones.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* Categoría */}
        <select className="border p-2" value={form.categoria_id}
          onChange={e=>setForm({...form,categoria_id:e.target.value})}>
          <option value="">Selecciona Categoría</option>
          {categorias.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>

        {/* Proveedor (nuevo campo) */}
        <div className="flex gap-2">
          <select className="border p-2 flex-grow" value={form.proveedor_id}
            onChange={e=>setForm({...form,proveedor_id:e.target.value})}>
            <option value="">Selecciona Proveedor</option>
            {proveedores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={()=>setShowNuevoProv(!showNuevoProv)}
            className="px-3 bg-green-600 text-white rounded text-sm whitespace-nowrap">
            {showNuevoProv? 'Cancelar':'➕ Nuevo'}
          </button>
        </div>

        {/* formulario nuevo proveedor (toggle) */}
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
              className="w-full bg-blue-600 text-white py-2 rounded">Guardar Proveedor</button>
          </div>
        )}

        {/* otros campos */}
        <input type="date" className="border p-2"
          value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})}/>
        <textarea className="border p-2"
          placeholder="Observaciones generales"
          value={form.observaciones}
          onChange={e=>setForm({...form,observaciones:e.target.value})}/>
      </div>

      {/* ───── Detalles ───── */}
      <h2 className="text-xl font-semibold mt-6 mb-2">Artículos de Compra</h2>
      {detalles.map((d,i)=>(
        <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
          <input className="border p-2" placeholder="Concepto" value={d.concepto}
            onChange={e=>handleDetalleChange(i,'concepto',e.target.value)}/>
          <input className="border p-2" type="number" min="0" placeholder="Cantidad"
            value={d.cantidad} onChange={e=>handleDetalleChange(i,'cantidad',e.target.value)}/>
          <input className="border p-2" type="number" min="0" step="0.01" placeholder="Precio unitario (Q)"
            value={d.precio_unitario} onChange={e=>handleDetalleChange(i,'precio_unitario',e.target.value)}/>
          <select className="border p-2" value={d.forma_pago_id}
            onChange={e=>handleDetalleChange(i,'forma_pago_id',e.target.value)}>
            <option value="">Método de pago</option>
            {metodosPago.map(m=><option key={m.id} value={m.id}>{m.metodo}</option>)}
          </select>
          <input className="border p-2" placeholder="Documento"
            value={d.documento} onChange={e=>handleDetalleChange(i,'documento',e.target.value)}/>
        </div>
      ))}
      <button onClick={addDetalle} className="bg-green-500 text-white px-4 py-2 rounded mb-4">
        + Agregar otro artículo
      </button>

      <div className="text-lg font-semibold mb-4">Total Calculado: Q{form.cantidad.toFixed(2)}</div>

      <div className="flex justify-between">
        <button onClick={guardarErogacion} className="bg-blue-600 text-white px-4 py-2 rounded">
          Guardar Erogación
        </button>
        <button onClick={()=>router.push('/dashboard')}
          className="bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
