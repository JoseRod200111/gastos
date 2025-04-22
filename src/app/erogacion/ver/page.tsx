'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function VerErogaciones() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [key: number]: any[] }>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: ''
  })

  const cargarDatos = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const user_id = userData?.user?.id

    let query = supabase
      .from('erogaciones')
      .select(`
        id, fecha, cantidad, observaciones,
        empresas(nombre), divisiones(nombre), categorias(nombre)
      `)
      .eq('user_id', user_id)

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    const { data, error } = await query.order('fecha', { ascending: false })

    if (!error && data) {
      setErogaciones(data)
      for (const erog of data) {
        const { data: det } = await supabase
          .from('detalle_compra')
          .select('concepto, cantidad, precio_unitario, importe, forma_pago_id, documento')
          .eq('erogacion_id', erog.id)

        setDetalles(prev => ({ ...prev, [erog.id]: det || [] }))
      }
    } else {
      console.error(error)
    }
  }

  const cargarOpciones = async () => {
    const [empresas, divisiones, categorias, formasPago] = await Promise.all([
      supabase.from('empresas').select('*'),
      supabase.from('divisiones').select('*'),
      supabase.from('categorias').select('*'),
      supabase.from('forma_pago').select('*')
    ])
    setEmpresas(empresas.data || [])
    setDivisiones(divisiones.data || [])
    setCategorias(categorias.data || [])
    setFormasPago(formasPago.data || [])
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta erogación?')) return
    await supabase.from('erogaciones').delete().eq('id', id)
    cargarDatos()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  const getMetodoPago = (id: number) => {
    const metodo = formasPago.find(f => f.id === id)
    return metodo?.metodo || id
  }

  useEffect(() => {
    cargarOpciones()
    cargarDatos()
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📋 Erogaciones Registradas</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <select name="categoria_id" value={filtros.categoria_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />
        <input type="text" name="id" placeholder="ID de Erogación" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-4">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>
        <button onClick={() => window.location.href = '/dashboard'} className="ml-4 bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú Principal
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm text-left">
          <thead className="bg-gray-200 text-sm">
            <tr>
              <th className="p-2">ID</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Empresa</th>
              <th className="p-2">División</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Total</th>
              <th className="p-2">Observaciones</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {erogaciones.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-4 text-gray-500">No se encontraron erogaciones.</td></tr>
            ) : (
              erogaciones.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-mono">{e.id}</td>
                  <td className="p-2">{e.fecha}</td>
                  <td className="p-2">{e.empresas?.nombre}</td>
                  <td className="p-2">{e.divisiones?.nombre}</td>
                  <td className="p-2">{e.categorias?.nombre}</td>
                  <td className="p-2">Q{e.cantidad?.toFixed(2)}</td>
                  <td className="p-2">{e.observaciones}</td>
                  <td className="p-2">
                    <button onClick={() => handleDelete(e.id)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detalles */}
      {erogaciones.map((e) => (
        <div key={`detalle-${e.id}`} className="mt-2 mb-6 border p-3 rounded bg-gray-50">
          <h3 className="font-semibold mb-2">🧾 Detalles de Erogación #{e.id}</h3>
          <table className="w-full text-sm border">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 text-left">Concepto</th>
                <th className="p-2 text-left">Cantidad</th>
                <th className="p-2 text-left">Precio Unitario</th>
                <th className="p-2 text-left">Importe</th>
                <th className="p-2 text-left">Forma de Pago</th>
                <th className="p-2 text-left">Documento</th>
              </tr>
            </thead>
            <tbody>
              {(detalles[e.id] || []).map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{d.concepto}</td>
                  <td className="p-2">{d.cantidad}</td>
                  <td className="p-2">Q{d.precio_unitario?.toFixed(2)}</td>
                  <td className="p-2">Q{d.importe?.toFixed(2)}</td>
                  <td className="p-2">{getMetodoPago(d.forma_pago_id)}</td>
                  <td className="p-2">{d.documento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
