'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Reportes() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [key: number]: any[] }>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: ''
  })

  const containerRef = useRef<HTMLDivElement>(null)

  const cargarDatos = async () => {
    let query = supabase
      .from('erogaciones')
      .select(`
        id, fecha, cantidad, observaciones, editado_en, editado_por,
        empresas(nombre), divisiones(nombre), categorias(nombre)
      `)

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    const { data, error } = await query.order('fecha', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      setErogaciones(data || [])
      if (data) {
        for (const erog of data) {
          const { data: det } = await supabase
            .from('detalle_compra')
            .select('concepto, cantidad, precio_unitario, importe, forma_pago(metodo), documento')
            .eq('erogacion_id', erog.id)
          setDetalles(prev => ({ ...prev, [erog.id]: det || [] }))
        }
      }
    }
  }

  const cargarOpciones = async () => {
    const [empresas, divisiones, categorias] = await Promise.all([
      supabase.from('empresas').select('*'),
      supabase.from('divisiones').select('*'),
      supabase.from('categorias').select('*')
    ])
    setEmpresas(empresas.data || [])
    setDivisiones(divisiones.data || [])
    setCategorias(categorias.data || [])
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  const descargarPDF = () => {
    const elemento = containerRef.current
    if (!elemento) return

    const ventana = document.createElement('iframe')
    ventana.style.display = 'none'
    document.body.appendChild(ventana)

    const doc = ventana.contentDocument || ventana.contentWindow?.document
    if (!doc) return

    // Construir HTML manualmente
    const html = `
      <html>
        <head>
          <title>Comprobante</title>
          <style>
            table { width: 100%; border-collapse: collapse }
            th, td { border: 1px solid black; padding: 4px; text-align: center }
            .box { border: 1px solid black; padding: 16px; margin: 10px 0; font-size: 14px; }
            .header { font-weight: bold; }
            body { font-family: Arial, sans-serif }
          </style>
        </head>
        <body>
          ${erogaciones.map(e => `
            <div class="box">
              <div class="mb-2">
                <div><span class="header">ID:</span> ${e.id}</div>
                <div><span class="header">Fecha:</span> ${e.fecha}</div>
                <div><span class="header">Empresa:</span> ${e.empresas?.nombre || '-'}</div>
                <div><span class="header">División:</span> ${e.divisiones?.nombre || '-'}</div>
                <div><span class="header">Categoría:</span> ${e.categorias?.nombre || '-'}</div>
                <div><span class="header">Total:</span> Q${e.cantidad?.toFixed(2)}</div>
                <div><span class="header">Observaciones:</span> ${e.observaciones || 'N/A'}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Cantidad</th>
                    <th>Precio Unitario</th>
                    <th>Importe</th>
                    <th>Forma de Pago</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  ${(detalles[e.id] || []).map(d => `
                    <tr>
                      <td>${d.concepto}</td>
                      <td>${d.cantidad}</td>
                      <td>Q${d.precio_unitario?.toFixed(2)}</td>
                      <td>Q${d.importe?.toFixed(2)}</td>
                      <td>${d.forma_pago?.metodo || '-'}</td>
                      <td>${d.documento || 'N/A'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${e.editado_por && e.editado_en
                ? `<div style="text-align:right; font-size:11px; margin-top:6px;">editado ${new Date(e.editado_en).toLocaleString()} por ${e.editado_por}</div>`
                : ''
              }
            </div>
          `).join('')}
        </body>
      </html>
    `
    doc.open()
    doc.write(html)
    doc.close()

    ventana.contentWindow?.focus()
    ventana.contentWindow?.print()

    setTimeout(() => document.body.removeChild(ventana), 2000)
  }

  useEffect(() => {
    cargarOpciones()
    cargarDatos()
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📄 Reporte de Erogaciones</h1>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
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
        <input type="text" name="id" placeholder="ID de Erogación" value={filtros.id || ''} onChange={handleChange} className="border p-2" />
      </div>

      <div className="mb-6">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">🔍 Aplicar Filtros</button>
        <button onClick={descargarPDF} className="ml-4 bg-green-600 text-white px-4 py-2 rounded">📄 Generar PDF</button>
        <button onClick={() => window.location.href = '/dashboard'} className="ml-4 bg-gray-700 text-white px-4 py-2 rounded">⬅ Volver al Menú Principal</button>
      </div>

      {/* Vista previa en pantalla */}
      <div ref={containerRef}>
        {erogaciones.length === 0 ? (
          <p className="text-center text-gray-500">No se encontraron erogaciones.</p>
        ) : (
          erogaciones.map((e) => (
            <div key={e.id} className="box border p-4 my-4 text-sm">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div><span className="font-semibold">ID:</span> {e.id}</div>
                <div><span className="font-semibold">Fecha:</span> {e.fecha}</div>
                <div><span className="font-semibold">Empresa:</span> {e.empresas?.nombre}</div>
                <div><span className="font-semibold">División:</span> {e.divisiones?.nombre}</div>
                <div><span className="font-semibold">Categoría:</span> {e.categorias?.nombre}</div>
                <div><span className="font-semibold">Total:</span> Q{e.cantidad?.toFixed(2)}</div>
                <div className="col-span-2"><span className="font-semibold">Observaciones:</span> {e.observaciones}</div>
              </div>
              <table className="w-full border text-sm">
                <thead>
                  <tr className="bg-gray-200">
                    <th>Concepto</th>
                    <th>Cantidad</th>
                    <th>Precio Unitario</th>
                    <th>Importe</th>
                    <th>Forma de Pago</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalles[e.id] || []).map((d, i) => (
                    <tr key={i} className="border-t">
                      <td>{d.concepto}</td>
                      <td>{d.cantidad}</td>
                      <td>Q{d.precio_unitario?.toFixed(2)}</td>
                      <td>Q{d.importe?.toFixed(2)}</td>
                      <td>{d.forma_pago?.metodo || '-'}</td>
                      <td>{d.documento || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.editado_por && e.editado_en && (
                <div className="text-right text-xs mt-1 text-gray-600 italic">
                  editado {new Date(e.editado_en).toLocaleString()} por {e.editado_por}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
