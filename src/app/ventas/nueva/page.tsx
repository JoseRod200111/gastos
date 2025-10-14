'use client'

import { useEffect, useMemo, useState } from 'react'
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

  /* id del método “Pendiente de pago” */
  const [pendientePagoId, setPendientePagoId] = useState<number | null>(null)

  /* cabecera */
  const [form, setForm] = useState({
    empresa_id: '', division_id: '',
    cliente_id: '', fecha: '', total: 0, // ventas.cantidad
    observaciones: ''
  })

  /* líneas de venta */
  const [detalles, setDetalles] = useState<Array<{
    producto_id?: string
    concepto: string
    cantidad: number
    precio_unitario: number
    forma_pago_id: string
    documento: string
  }>>([
    { producto_id:'', concepto:'', cantidad:0, precio_unitario:0, forma_pago_id:'', documento:'' }
  ])

  /* alta rápida de cliente */
  const [showNuevoCli, setShowNuevoCli] = useState(false)
  const [nuevoCli, setNuevoCli] = useState({ nombre:'', nit:'', telefono:'' })

  /* abono inicial (opcional) */
  const [abono, setAbono] = useState({
    monto: 0,
    metodo_pago_id: '',
    documento: '',
    observaciones: ''
  })

  /* saldo actual del cliente y proyectado */
  const [saldoActual, setSaldoActual] = useState<number | null>(null)

  /* carga inicial */
  useEffect(() => {
    ;(async () => {
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

      // buscar el id del método "Pendiente de pago"
      const mp = (met.data as MetodoPago[] | null)?.find(m => m.metodo?.toLowerCase().startsWith('pendiente de pago'))
      setPendientePagoId(mp?.id ?? null)
    })()
  }, [])

  /* recálculo de total */
  useEffect(() => {
    const total = detalles.reduce((sum, d) =>
      sum + Number(d.cantidad || 0) * Number(d.precio_unitario || 0), 0)
    setForm(f => ({ ...f, total }))
  }, [detalles])

  /* saldo actual del cliente (desde vista v_saldos_clientes) */
  useEffect(() => {
    ;(async () => {
      if (!form.cliente_id) { setSaldoActual(null); return }
      const { data } = await supabase
        .from('v_saldos_clientes')
        .select('saldo')
        .eq('cliente_id', Number(form.cliente_id))
        .maybeSingle()
      setSaldoActual(data?.saldo ?? 0)
    })()
  }, [form.cliente_id])

  /* helpers detalle */
  const handleDetalleChange = (i: number, field: string, val: any) => {
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

  /* guardar cliente */
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

  /* totales auxiliares */
  const totalPendiente = useMemo(() => {
    if (!pendientePagoId) return 0
    return detalles.reduce((acc, d) => {
      const importe = Number(d.cantidad || 0) * Number(d.precio_unitario || 0)
      return acc + (String(d.forma_pago_id) === String(pendientePagoId) ? importe : 0)
    }, 0)
  }, [detalles, pendientePagoId])

  const saldoProyectado = useMemo(() => {
    const sActual = Number(saldoActual || 0)
    const ab = Number(abono.monto || 0)
    return sActual + totalPendiente - ab
  }, [saldoActual, totalPendiente, abono.monto])

  /* guardar venta */
  const guardarVenta = async () => {
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

      // aviso si el producto no controla inventario
      for (const it of lineas) {
        if (!it.producto_id) continue
        const p = productos.find(x => String(x.id) === String(it.producto_id))
        if (p && !p.control_inventario) {
          const ok = confirm(`El producto "${p.nombre}" no tiene control de inventario. ¿Deseas continuar igualmente?`)
          if (!ok) return
        }
      }

      // Validación del abono
      const pendiente = totalPendiente
      const ab = Number(abono.monto || 0)
      if (ab > 0 && ab > pendiente) {
        return alert(`El abono (Q${ab.toFixed(2)}) no puede ser mayor al total a crédito (Q${pendiente.toFixed(2)}).`)
      }
      if (ab > 0 && !abono.metodo_pago_id) {
        return alert('Selecciona el método de pago del abono inicial')
      }

      // 1) insertar cabecera (ventas)
      const cabecera: any = {
        empresa_id : form.empresa_id ? Number(form.empresa_id) : null,
        division_id: form.division_id ? Number(form.division_id) : null,
        cliente_id : form.cliente_id ? Number(form.cliente_id) : null,
        fecha      : form.fecha,
        observaciones: form.observaciones || null,
        cantidad   : Number(form.total || 0),
        user_id
      }

      const { data: venta, error: vErr } = await supabase
        .from('ventas')
        .insert([cabecera])
        .select()
        .single()
      if (vErr) throw new Error(`cabecera: ${vErr.message}`)

      // 2) insertar detalle (detalle_venta)
      const payload = lineas.map(d => {
        const importe = Number((d.cantidad * d.precio_unitario).toFixed(2))
        return {
          venta_id       : (venta as any).id,
          producto_id    : d.producto_id ? Number(d.producto_id) : null,
          concepto       : d.concepto.trim(),
          cantidad       : d.cantidad,
          precio_unitario: d.precio_unitario,
          importe, // NOT NULL
          forma_pago_id  : d.forma_pago_id ? Number(d.forma_pago_id) : null,
          documento      : d.documento || null
        }
      })

      const { error: detErr } = await supabase.from(DETALLE_VENTA_TABLE).insert(payload)
      if (detErr) throw new Error(`detalle: ${detErr.message || detErr.code || 'error'}`)

      // 3) si hay abono inicial, registrarlo en pagos_venta
      if (ab > 0) {
        const pago = {
          cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
          venta_id  : (venta as any).id,
          fecha     : form.fecha,
          monto     : ab,
          metodo_pago_id: Number(abono.metodo_pago_id),
          documento : abono.documento || null,
          observaciones: abono.observaciones || null,
          user_id
        }
        const { error: pErr } = await supabase.from('pagos_venta').insert(pago)
        if (pErr) throw new Error(`abono: ${pErr.message}`)
      }

      alert('Venta guardada correctamente')
      router.push('/menu')
    } catch (e: any) {
      console.error(e)
      alert(`Error al guardar venta: ${e?.message ?? e}`)
    }
  }

  /* UI */
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Venta</h1>

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

        {/* Cliente */}
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

      {detalles.map((d,i)=>(
        <div key={i} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-2">
          <select className="border p-2" value={d.producto_id || ''}
                  onChange={e=>handleDetalleChange(i,'producto_id',e.target.value)}>
            <option value="">— Sin producto —</option>
            {productos.map(p=>(
              <option key={p.id} value={p.id}>{(p.sku ? `${p.sku} — ` : '') + p.nombre}</option>
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
            {metodosPago.map(m=><option key={m.id} value={m.id}>{m.metodo}</option>)}
          </select>

          <input className="border p-2" placeholder="Documento"
                 value={d.documento} onChange={e=>handleDetalleChange(i,'documento',e.target.value)}/>
        </div>
      ))}

      <button onClick={addDetalle} className="bg-green-500 text-white px-4 py-2 rounded mb-4">
        + Agregar otra línea
      </button>

      {/* resumen / crédito / abono */}
      <div className="border rounded p-3 mb-4 bg-gray-50">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <div className="text-lg font-semibold">Total Calculado: Q{form.total.toFixed(2)}</div>
            <div className="text-sm">Total a crédito (pendiente): <b>Q{totalPendiente.toFixed(2)}</b></div>
            <div className="text-sm">Saldo actual del cliente: <b>{saldoActual === null ? '—' : `Q${Number(saldoActual).toFixed(2)}`}</b></div>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">Abono inicial (opcional)</label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input type="number" min="0" step="0.01" className="border p-2" placeholder="Q 0.00"
                     value={abono.monto}
                     onChange={e=>setAbono(a=>({...a, monto: parseFloat(e.target.value||'0')}))}/>
              <select className="border p-2" value={abono.metodo_pago_id}
                      onChange={e=>setAbono(a=>({...a,metodo_pago_id:e.target.value}))}>
                <option value="">Método de pago</option>
                {metodosPago.map(m=><option key={m.id} value={m.id}>{m.metodo}</option>)}
              </select>
              <input className="border p-2" placeholder="Documento"
                     value={abono.documento}
                     onChange={e=>setAbono(a=>({...a,documento:e.target.value}))}/>
              <input className="border p-2" placeholder="Observaciones del abono"
                     value={abono.observaciones}
                     onChange={e=>setAbono(a=>({...a,observaciones:e.target.value}))}/>
            </div>
            <div className="mt-2 text-sm">
              Saldo proyectado luego de guardar: <b>{saldoActual === null ? '—' : `Q${saldoProyectado.toFixed(2)}`}</b>
            </div>
          </div>
        </div>
      </div>

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
