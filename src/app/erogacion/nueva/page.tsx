'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NuevaErogacion() {
  const router = useRouter()
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [metodosPago, setMetodosPago] = useState<any[]>([])

  const [form, setForm] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    fecha: '',
    cantidad: 0,
    observaciones: ''
  })

  const [detalles, setDetalles] = useState<Array<{
    concepto: string
    cantidad: number
    precio_unitario: number
    forma_pago_id: string
    documento: string
  }>>([{
    concepto: '', cantidad: 0, precio_unitario: 0, forma_pago_id: '', documento: ''
  }])

  useEffect(() => {
    const fetchData = async () => {
      const { data: emp } = await supabase.from('empresas').select('*')
      setEmpresas(emp || [])

      const { data: div } = await supabase.from('divisiones').select('*')
      setDivisiones(div || [])

      const { data: cat } = await supabase.from('categorias').select('*')
      setCategorias(cat || [])

      const { data: met } = await supabase.from('forma_pago').select('*')
      setMetodosPago(met || [])
    }

    fetchData()
  }, [])

  useEffect(() => {
    const total = detalles.reduce(
      (sum, item) => sum + (Number(item.precio_unitario) * Number(item.cantidad)),
      0
    )
    setForm((prev) => ({ ...prev, cantidad: total }))
  }, [detalles])

  const handleDetalleChange = (index: number, field: string, value: any) => {
    const newDetalles = [...detalles]
    newDetalles[index][field] =
      field === 'cantidad' || field === 'precio_unitario' ? parseFloat(value) : value
    setDetalles(newDetalles)
  }

  const addDetalle = () => {
    setDetalles([
      ...detalles,
      { concepto: '', cantidad: 0, precio_unitario: 0, forma_pago_id: '', documento: '' }
    ])
  }

  const guardarErogacion = async () => {
    const { data: erogacion, error } = await supabase
      .from('erogaciones')
      .insert([form])
      .select()
      .single()

    if (error) return alert('Error al guardar la erogación.')

    const detallesConErogacion = detalles.map((detalle) => ({
      ...detalle,
      erogacion_id: erogacion.id
    }))

    const { error: detalleError } = await supabase
      .from('detalle_compra')
      .insert(detallesConErogacion)

    if (detalleError) {
      alert('Error al guardar detalle de compra')
    } else {
      alert('Erogación guardada correctamente')
      router.push('/dashboard')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      <div className="grid grid-cols-1 gap-4">
        <select name="empresa_id" value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} className="border p-2">
          <option value="">Selecciona Empresa</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={form.division_id} onChange={(e) => setForm({ ...form, division_id: e.target.value })} className="border p-2">
          <option value="">Selecciona División</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <select name="categoria_id" value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} className="border p-2">
          <option value="">Selecciona Categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <input type="date" name="fecha" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="border p-2" />
        <textarea name="observaciones" placeholder="Observaciones generales" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="border p-2" />
      </div>

      <h2 className="text-xl font-semibold mt-6 mb-2">Artículos de Compra</h2>
      {detalles.map((detalle, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
          <input className="border p-2" placeholder="Concepto del artículo" value={detalle.concepto} onChange={(e) => handleDetalleChange(i, 'concepto', e.target.value)} />
          <input className="border p-2" type="number" min="0" placeholder="Cantidad (unidades)" value={detalle.cantidad} onChange={(e) => handleDetalleChange(i, 'cantidad', e.target.value)} />
          <input className="border p-2" type="number" min="0" step="0.01" placeholder="Precio unitario (Q)" value={detalle.precio_unitario} onChange={(e) => handleDetalleChange(i, 'precio_unitario', e.target.value)} />
          <select className="border p-2" value={detalle.forma_pago_id} onChange={(e) => handleDetalleChange(i, 'forma_pago_id', e.target.value)}>
            <option value="">Método de pago</option>
            {metodosPago.map((m) => (
              <option key={m.id} value={m.id}>{m.metodo}</option>
            ))}
          </select>
          <input className="border p-2" placeholder="Documento (factura, ticket...)" value={detalle.documento} onChange={(e) => handleDetalleChange(i, 'documento', e.target.value)} />
        </div>
      ))}

      <button onClick={addDetalle} className="bg-green-500 text-white px-4 py-2 rounded mb-4">
        + Agregar otro artículo
      </button>

      <div className="text-lg font-semibold mb-4">
        Total Calculado: Q{form.cantidad.toFixed(2)}
      </div>

      <div className="flex justify-between">
        <button onClick={guardarErogacion} className="bg-blue-600 text-white px-4 py-2 rounded">
          Guardar Erogación
        </button>
        <button onClick={() => router.push('/dashboard')} className="bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
