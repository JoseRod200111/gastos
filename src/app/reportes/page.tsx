'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function ReportesPage() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  const cargarOpciones = async () => {
    const [emp, div, cat] = await Promise.all([
      supabase.from('empresas').select('*'),
      supabase.from('divisiones').select('*'),
      supabase.from('categorias').select('*')
    ])
    setEmpresas(emp.data || [])
    setDivisiones(div.data || [])
    setCategorias(cat.data || [])
  }

  const buscarErogaciones = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const user_id = userData?.user?.id

    let query = supabase
      .from('erogaciones')
      .select(`
        fecha, cantidad, observaciones,
        empresas(nombre), divisiones(nombre), categorias(nombre)
      `)
      .eq('user_id', user_id)

    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    const { data, error } = await query.order('fecha', { ascending: false })

    if (error) {
      alert('Error al buscar datos')
      console.error(error)
    } else {
      setErogaciones(data || [])
    }
  }

  const generarPDF = () => {
    const doc = new jsPDF()
    doc.text('Reporte de Erogaciones', 14, 15)
    doc.setFontSize(10)
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22)

    const body = erogaciones.map((e) => [
      e.fecha,
      e.empresas?.nombre,
      e.divisiones?.nombre,
      e.categorias?.nombre,
      `Q${e.cantidad?.toFixed(2)}`,
      e.observaciones
    ])

    autoTable(doc, {
      startY: 28,
      head: [['Fecha', 'Empresa', 'División', 'Categoría', 'Cantidad', 'Observaciones']],
      body,
      styles: { fontSize: 8 }
    })

    doc.save('reporte_erogaciones.pdf')
  }

  useEffect(() => {
    cargarOpciones()
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 Reporte de Erogaciones</h1>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>

        <select name="categoria_id" value={filtros.categoria_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-4 space-x-2">
        <button onClick={buscarErogaciones} className="bg-blue-600 text-white px-4 py-2 rounded">🔍 Buscar</button>
        <button onClick={generarPDF} className="bg-purple-700 text-white px-4 py-2 rounded">📄 Generar PDF</button>
        <button onClick={() => window.location.href = '/dashboard'} className="bg-gray-700 text-white px-4 py-2 rounded">⬅ Volver al Menú</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm text-left">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2">Fecha</th>
              <th className="p-2">Empresa</th>
              <th className="p-2">División</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Cantidad</th>
              <th className="p-2">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {erogaciones.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-4 text-gray-500">No hay resultados</td></tr>
            ) : (
              erogaciones.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{e.fecha}</td>
                  <td className="p-2">{e.empresas?.nombre}</td>
                  <td className="p-2">{e.divisiones?.nombre}</td>
                  <td className="p-2">{e.categorias?.nombre}</td>
                  <td className="p-2">Q{e.cantidad?.toFixed(2)}</td>
                  <td className="p-2">{e.observaciones}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
