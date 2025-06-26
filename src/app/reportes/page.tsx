'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/* ──────────────────────── tipos ──────────────────────── */
type DetalleRaw = {
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  /** Supabase devuelve un ARRAY de objetos { metodo } */
  forma_pago: { metodo: string }[] | null
  documento: string | null
}

type Detalle = {
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  /** Ya normalizado a un solo objeto o null */
  forma_pago: { metodo: string } | null
  documento: string | null
}

const normalizarDetalle = (d: DetalleRaw): Detalle => ({
  concepto: d.concepto,
  cantidad: d.cantidad,
  precio_unitario: d.precio_unitario,
  importe: d.importe,
  forma_pago: Array.isArray(d.forma_pago) ? d.forma_pago[0] ?? null : null,
  documento: d.documento
})

/* ──────────────────────── componente ──────────────────────── */
export default function Reportes() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: '',
    proveedor_nombre: '',
    proveedor_nit: ''
  })

  const containerRef = useRef<HTMLDivElement>(null)

  /* ───────── carga de catálogos ───────── */
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

  /* ───────── carga principal ───────── */
  const cargarDatos = async () => {
    let query = supabase
      .from('erogaciones')
      .select(`
        id, fecha, cantidad, observaciones, editado_en, editado_por,
        empresa_id, division_id, categoria_id, proveedor_id,
        empresas(nombre),
        divisiones(nombre),
        categorias(nombre),
        proveedores(nombre,nit)
      `)
      .order('fecha', { ascending: false })

    /* filtros básicos */
    if (filtros.id)               query = query.eq('id', filtros.id)
    if (filtros.empresa_id)       query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id)      query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id)     query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde)            query = query.gte('fecha', filtros.desde)
    if (filtros.hasta)            query = query.lte('fecha', filtros.hasta)
    if (filtros.proveedor_nombre) query = query.ilike('proveedores.nombre', `%${filtros.proveedor_nombre.trim()}%`)
    if (filtros.proveedor_nit)    query = query.ilike('proveedores.nit', `%${filtros.proveedor_nit.trim()}%`)

    const { data, error } = await query
    if (error) { console.error(error); return }

    setErogaciones(data || [])

    /* detalles por erogación */
    for (const e of data ?? []) {
      const { data: detRaw } = await supabase
        .from('detalle_compra')
        .select('concepto,cantidad,precio_unitario,importe,forma_pago(metodo),documento')
        .eq('erogacion_id', e.id)

      const detNorm: Detalle[] = (detRaw ?? []).map(normalizarDetalle)
      setDetalles(prev => ({ ...prev, [e.id]: detNorm }))
    }
  }

  /* ───────── impresión PDF ───────── */
  const descargarPDF = () => {
    const nodo = containerRef.current
    if (!nodo) return

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    doc.open()
    doc.write(`
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Comprobante</title>
          <style>
            body{font-family:Arial, sans-serif}
            .logo{height:60px;display:block;margin:0 auto 12px}
            .box{border:1px solid #000;padding:14px;margin:10px 0;font-size:14px}
            table{width:100%;border-collapse:collapse;margin-top:6px}
            th,td{border:1px solid #000;padding:4px;text-align:center;font-size:12px}
            .header{font-weight:bold}
          </style>
        </head>
        <body>
          <img src="/logo.png" class="logo"/>
          ${erogaciones.map(e => `
            <div class="box">
              <div><span class="header">ID:</span> ${e.id}
              &nbsp;&nbsp;<span class="header">Fecha:</span> ${e.fecha}</div>

              <div><span class="header">Empresa:</span> ${e.empresas?.nombre || '-'}
              &nbsp;&nbsp;<span class="header">División:</span> ${e.divisiones?.nombre || '-'}</div>

              <div><span class="header">Categoría:</span> ${e.categorias?.nombre || '-'}</div>

              <div><span class="header">Proveedor:</span> ${e.proveedores?.nombre || '-'}
              &nbsp;&nbsp;<span class="header">NIT:</span> ${e.proveedores?.nit || '-'}</div>

              <div><span class="header">Total:</span> Q${e.cantidad?.toFixed(2)}</div>
              <div><span class="header">Observaciones:</span> ${e.observaciones || 'N/A'}</div>

              <table>
                <thead>
                  <tr><th>Concepto</th><th>Cant.</th><th>P.Unit</th><th>Importe</th><th>Pago</th><th>Doc.</th></tr>
                </thead>
                <tbody>
                  ${(detalles[e.id] || []).map(d => `
                    <tr>
                      <td>${d.concepto}</td>
                      <td>${d.cantidad}</td>
                      <td>Q${d.precio_unitario.toFixed(2)}</td>
                      <td>Q${d.importe.toFixed(2)}</td>
                      <td>${d.forma_pago?.metodo || '-'}</td>
                      <td>${d.documento || 'N/A'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              ${e.editado_por && e.editado_en ? `
                <div style="text-align:right;font-size:11px;margin-top:4px">
                  editado ${new Date(e.editado_en).toLocaleString()} por ${e.editado_por}
                </div>` : ''}
            </div>
          `).join('')}
        </body>
      </html>
    `)
    doc.close()

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }

  /* ───────── useEffect inicial ───────── */
  useEffect(() => { cargarOpciones(); cargarDatos() }, [])

  /* ───────── handlers auxiliares ───────── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  /* ───────── render ───────── */
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">📄 Reporte de Erogaciones</h1>

      {/* filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-6">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>

        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>

        <select name="categoria_id" value={filtros.categoria_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />

        <input type="text" name="proveedor_nombre" placeholder="Proveedor" value={filtros.proveedor_nombre} onChange={handleChange} className="border p-2" />
        <input type="text" name="proveedor_nit" placeholder="NIT" value={filtros.proveedor_nit} onChange={handleChange} className="border p-2" />

        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      {/* botones */}
      <div className="mb-6">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">🔍 Aplicar Filtros</button>
        <button onClick={descargarPDF} className="ml-4 bg-green-600 text-white px-4 py-2 rounded">📄 Generar PDF</button>
        <button onClick={() => window.location.href = '/dashboard'} className="ml-4 bg-gray-700 text-white px-4 py-2 rounded">⬅ Volver</button>
      </div>

      {/* vista previa */}
      <div ref={containerRef}>
        {erogaciones.length === 0
          ? <p className="text-center text-gray-500">No se encontraron erogaciones.</p>
          : erogaciones.map(e => (
              <div key={e.id} className="border p-4 my-4 text-sm">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div><span className="font-semibold">ID:</span> {e.id}</div>
                  <div><span className="font-semibold">Fecha:</span> {e.fecha}</div>
                  <div><span className="font-semibold">Empresa:</span> {e.empresas?.nombre}</div>
                  <div><span className="font-semibold">División:</span> {e.divisiones?.nombre}</div>
                  <div><span className="font-semibold">Categoría:</span> {e.categorias?.nombre}</div>
                  <div><span className="font-semibold">Total:</span> Q{e.cantidad?.toFixed(2)}</div>
                  <div className="col-span-2">
                    <span className="font-semibold">Proveedor:</span> {e.proveedores?.nombre || '-'} &nbsp;
                    <span className="font-semibold">NIT:</span> {e.proveedores?.nit || '-'}
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold">Observaciones:</span> {e.observaciones}
                  </div>
                </div>

                <table className="w-full border text-sm">
                  <thead className="bg-gray-200">
                    <tr><th>Concepto</th><th>Cant.</th><th>P.Unit</th><th>Importe</th><th>Pago</th><th>Doc.</th></tr>
                  </thead>
                  <tbody>
                    {(detalles[e.id] || []).map((d, i) => (
                      <tr key={i} className="border-t">
                        <td>{d.concepto}</td>
                        <td>{d.cantidad}</td>
                        <td>Q{d.precio_unitario.toFixed(2)}</td>
                        <td>Q{d.importe.toFixed(2)}</td>
                        <td>{d.forma_pago?.metodo || '-'}</td>
                        <td>{d.documento || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {e.editado_en && e.editado_por && (
                  <div className="text-right text-xs mt-1 text-gray-600 italic">
                    editado {new Date(e.editado_en).toLocaleString()} por {e.editado_por}
                  </div>
                )}
              </div>
            ))
        }
      </div>
    </div>
  )
}
