'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type EmpresaRel = { nombre: string } | null
type DivisionRel = { nombre: string } | null
type ClienteRel = { nombre: string | null; nit: string | null } | null

type Venta = {
  id: number
  fecha: string
  cantidad: number
  observaciones: string | null
  empresa_id: number | null
  division_id: number | null
  cliente_id: number | null
  empresas?: EmpresaRel
  divisiones?: DivisionRel
  clientes?: ClienteRel
}

type Detalle = {
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  forma_pago?: { metodo: string } | null
  documento?: string | null
}

/** Normaliza relaciones que pueden venir como arrays desde Supabase */
function normalizeVenta(row: any): Venta {
  const asObj = (rel: any): any =>
    rel == null ? null : Array.isArray(rel) ? rel[0] ?? null : rel

  return {
    id: Number(row.id),
    fecha: row.fecha,
    cantidad: Number(row.cantidad ?? 0),
    observaciones: row.observaciones ?? null,
    empresa_id: row.empresa_id ?? null,
    division_id: row.division_id ?? null,
    cliente_id: row.cliente_id ?? null,
    empresas: asObj(row.empresas) as EmpresaRel,
    divisiones: asObj(row.divisiones) as DivisionRel,
    clientes: asObj(row.clientes) as ClienteRel,
  }
}

export default function ReportesVentas() {
  /* ───────────────────────── state ───────────────────────── */
  const [ventas, setVentas] = useState<Venta[]>([])
  const [detalles, setDetalles] = useState<Record<number, Detalle[]>>({})

  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])

  // Si quisieras ver ventas sin detalle, cambia a true
  const [mostrarIncompletas] = useState(false)

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    desde: '',
    hasta: '',
    id: '',
    cliente_nombre: '',
    cliente_nit: '',
  })

  const containerRef = useRef<HTMLDivElement>(null)

  /* ─────────────────────── catálogos ─────────────────────── */
  useEffect(() => {
    ;(async () => {
      const [emp, div] = await Promise.all([
        supabase.from('empresas').select('*'),
        supabase.from('divisiones').select('*'),
      ])
      setEmpresas(emp.data || [])
      setDivisiones(div.data || [])
    })()
  }, [])

  /* ─────────────────────── datos ─────────────────────── */
  const cargarDatos = useCallback(async () => {
    let query = supabase
      .from('ventas')
      .select(
        `
        id, fecha, cantidad, observaciones,
        empresa_id, division_id, cliente_id,
        empresas ( nombre ),
        divisiones ( nombre ),
        clientes ( nombre, nit )
      `
      )
      .order('fecha', { ascending: false })

    // Filtros con cast a número donde toca
    if (filtros.id.trim()) query = query.eq('id', Number(filtros.id))
    if (filtros.empresa_id.trim()) query = query.eq('empresa_id', Number(filtros.empresa_id))
    if (filtros.division_id.trim()) query = query.eq('division_id', Number(filtros.division_id))
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)
    if (filtros.cliente_nombre.trim()) query = query.ilike('clientes.nombre', `%${filtros.cliente_nombre.trim()}%`)
    if (filtros.cliente_nit.trim()) query = query.ilike('clientes.nit', `%${filtros.cliente_nit.trim()}%`)

    const { data: cabeceras, error } = await query
    if (error) {
      console.error('Error cargando ventas:', error)
      setVentas([])
      setDetalles({})
      return
    }

    // Normalizar relaciones a objeto
    const norm = (cabeceras || []).map(normalizeVenta)

    const ids = norm.map(v => v.id)
    if (ids.length === 0) {
      setVentas([])
      setDetalles({})
      return
    }

    // Detalles en lote
    const { data: detAll, error: detErr } = await supabase
      .from('detalle_venta')
      .select(
        `
        venta_id, concepto, cantidad, precio_unitario, importe,
        forma_pago ( metodo ), documento
      `
      )
      .in('venta_id', ids)

    if (detErr) {
      console.error('Error cargando detalles:', detErr)
      setVentas(norm)
      setDetalles({})
      return
    }

    const grouped: Record<number, Detalle[]> = {}
    for (const d of detAll || []) {
      const key = Number((d as any).venta_id)
      ;(grouped[key] ||= []).push({
        concepto: (d as any).concepto,
        cantidad: Number((d as any).cantidad ?? 0),
        precio_unitario: Number((d as any).precio_unitario ?? 0),
        importe: Number((d as any).importe ?? 0),
        forma_pago: (d as any).forma_pago ?? null,
        documento: (d as any).documento ?? null,
      })
    }
    setDetalles(grouped)

    // Excluir ventas sin detalle (intentos fallidos) salvo que se indique lo contrario
    const filtradas = norm.filter(v => (mostrarIncompletas ? true : (grouped[v.id]?.length ?? 0) > 0))
    setVentas(filtradas)
  }, [filtros, mostrarIncompletas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  /* ─────────────────────── handlers ─────────────────────── */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros({ ...filtros, [e.target.name]: e.target.value })

  const limpiarFiltros = () =>
    setFiltros({
      empresa_id: '',
      division_id: '',
      desde: '',
      hasta: '',
      id: '',
      cliente_nombre: '',
      cliente_nit: '',
    })

  /* ─────────────────────── PDF ─────────────────────── */
  const descargarPDF = () => {
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    doc.open()
    doc.write(`
      <html>
        <head>
          <title>Reporte de Ventas</title>
          <style>
            body { font-family: Arial, sans-serif }
            .logo { height: 60px; display:block; margin:0 auto 12px }
            .box { border:1px solid #000; padding:14px; margin:10px 0; font-size:14px }
            table{ width:100%; border-collapse:collapse }
            th,td{ border:1px solid #000; padding:4px; text-align:center }
            .header{ font-weight:bold }
          </style>
        </head>
        <body>
          <img src="/logo.png" class="logo"/>
          ${ventas
            .map(
              v => `
            <div class="box">
              <div>
                <span class="header">ID:</span> ${v.id} &nbsp;
                <span class="header">Fecha:</span> ${v.fecha}
              </div>
              <div>
                <span class="header">Empresa:</span> ${v.empresas?.nombre || '-'} &nbsp;
                <span class="header">División:</span> ${v.divisiones?.nombre || '-'}
              </div>
              <div>
                <span class="header">Cliente:</span> ${v.clientes?.nombre || '-'} &nbsp;
                <span class="header">NIT:</span> ${v.clientes?.nit || '-'}
              </div>
              <div>
                <span class="header">Total:</span> Q${Number(v.cantidad || 0).toFixed(2)}
              </div>
              <div>
                <span class="header">Observaciones:</span> ${v.observaciones || 'N/A'}
              </div>

              <table>
                <thead>
                  <tr><th>Concepto</th><th>Cant.</th><th>P.Unit</th><th>Importe</th><th>Pago</th><th>Doc.</th></tr>
                </thead>
                <tbody>
                  ${(detalles[v.id] || [])
                    .map(
                      d => `
                    <tr>
                      <td>${d.concepto}</td>
                      <td>${d.cantidad}</td>
                      <td>Q${Number(d.precio_unitario || 0).toFixed(2)}</td>
                      <td>Q${Number(d.importe || 0).toFixed(2)}</td>
                      <td>${d.forma_pago?.metodo || '-'}</td>
                      <td>${d.documento || 'N/A'}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
            )
            .join('')}
        </body>
      </html>
    `)
    doc.close()

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }

  /* ─────────────────────── UI ─────────────────────── */
  return (
    <div className="p-6 max-w-6xl mx-auto" ref={containerRef}>
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64} />
      </div>

      <h1 className="text-2xl font-bold mb-4">📄 Reporte de Ventas</h1>

      {/* filtros */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 mb-6">
        <select name="empresa_id" value={filtros.empresa_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Empresas</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select name="division_id" value={filtros.division_id} onChange={handleChange} className="border p-2">
          <option value="">Todas las Divisiones</option>
          {divisiones.map(d => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
        <input type="date" name="desde" value={filtros.desde} onChange={handleChange} className="border p-2" />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleChange} className="border p-2" />
        <input
          type="text"
          name="cliente_nombre"
          placeholder="Cliente"
          value={filtros.cliente_nombre}
          onChange={handleChange}
          className="border p-2"
        />
        <input
          type="text"
          name="cliente_nit"
          placeholder="NIT"
          value={filtros.cliente_nit}
          onChange={handleChange}
          className="border p-2"
        />
        <input type="text" name="id" placeholder="ID" value={filtros.id} onChange={handleChange} className="border p-2" />
      </div>

      {/* botones */}
      <div className="mb-6">
        <button onClick={cargarDatos} className="bg-blue-600 text-white px-4 py-2 rounded">
          🔍 Aplicar Filtros
        </button>
        <button onClick={limpiarFiltros} className="ml-2 bg-gray-500 text-white px-4 py-2 rounded">
          Limpiar filtros
        </button>
        <button onClick={descargarPDF} className="ml-4 bg-green-600 text-white px-4 py-2 rounded">
          📄 Imprimir / PDF
        </button>
        <a href="/menu" className="ml-4 inline-block bg-gray-700 text-white px-4 py-2 rounded">
          ⬅ Volver al Menú de Ventas
        </a>
      </div>

      {/* vista previa */}
      {ventas.length === 0 ? (
        <p className="text-center text-gray-500">No se encontraron ventas.</p>
      ) : (
        ventas.map(v => (
          <div key={v.id} className="box border p-4 my-4 text-sm">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><span className="font-semibold">ID:</span> {v.id}</div>
              <div><span className="font-semibold">Fecha:</span> {v.fecha}</div>
              <div><span className="font-semibold">Empresa:</span> {v.empresas?.nombre || '-'}</div>
              <div><span className="font-semibold">División:</span> {v.divisiones?.nombre || '-'}</div>
              <div className="col-span-2">
                <span className="font-semibold">Cliente:</span> {v.clientes?.nombre || '-'} &nbsp;
                <span className="font-semibold">NIT:</span> {v.clientes?.nit || '-'}
              </div>
              <div><span className="font-semibold">Total:</span> Q{Number(v.cantidad || 0).toFixed(2)}</div>
              <div className="col-span-2">
                <span className="font-semibold">Observaciones:</span> {v.observaciones || 'N/A'}
              </div>
            </div>

            <table className="w-full border text-sm">
              <thead>
                <tr className="bg-gray-200">
                  <th>Concepto</th><th>Cant.</th><th>P.Unit</th><th>Importe</th><th>Pago</th><th>Doc.</th>
                </tr>
              </thead>
              <tbody>
                {(detalles[v.id] || []).map((d, i) => (
                  <tr key={i} className="border-t">
                    <td>{d.concepto}</td>
                    <td>{d.cantidad}</td>
                    <td>Q{Number(d.precio_unitario || 0).toFixed(2)}</td>
                    <td>Q{Number(d.importe || 0).toFixed(2)}</td>
                    <td>{d.forma_pago?.metodo || '-'}</td>
                    <td>{d.documento || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
