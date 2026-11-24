'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  agruparVentasDeuda, aCentavos, aQuetzales, formatoQuetzales,
  normalizarVentaDeuda, type VentaGranjaDeuda,
} from '@/lib/granjaDeudasMt'

type Cliente = { id: number; nombre: string; nit: string | null }
type Row = {
  cliente_id: number
  credito: number
  abonado: number
  saldo: number
  operaciones_pendientes: number
  mt_pendientes: number
  clientes: { nombre: string | null; nit: string | null } | null
}
const TAMANIO_PAGINA = 800

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

export default function GranjaDeudasClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const lista: Cliente[] = []
        for (let inicio = 0; ; inicio += TAMANIO_PAGINA) {
          const { data, error } = await supabase.from('clientes')
            .select('id, nombre, nit').order('id', { ascending: true })
            .range(inicio, inicio + TAMANIO_PAGINA - 1)
          if (error) throw error
          const pagina = (data || []) as Cliente[]
          lista.push(...pagina)
          if (pagina.length < TAMANIO_PAGINA) break
        }
        setClientes(lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
      } catch (e) { console.error('No se pudo cargar catálogo de clientes', e) }
    })()
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setErrorCarga('')
    try {
      const ventas: VentaGranjaDeuda[] = []
      // No truncar en 1000 filas: un cliente con muchos tramos puede aparecer
      // con saldos incorrectos si se consulta solo la primera página.
      for (let inicio = 0; ; inicio += TAMANIO_PAGINA) {
        let consulta = supabase.from('granja_ventas_cerdos')
          .select(`id, fecha, cliente_id, total, pagado, deuda,
            observaciones, multi_id, multi_folio, clientes ( nombre, nit )`)
          .order('id', { ascending: true })
          .range(inicio, inicio + TAMANIO_PAGINA - 1)
        if (clienteId) consulta = consulta.eq('cliente_id', Number(clienteId))
        const { data, error } = await consulta
        if (error) throw error
        const pagina = ((data || []) as unknown as Record<string, unknown>[]).map(normalizarVentaDeuda)
        ventas.push(...pagina)
        if (pagina.length < TAMANIO_PAGINA) break
      }

      type Parcial = {
        cliente_id: number; credito: number; abonado: number; saldo: number
        clientes: Row['clientes']
      }
      const mapa = new Map<number, Parcial>()
      for (const v of ventas) {
        let fila = mapa.get(v.cliente_id)
        if (!fila) {
          fila = { cliente_id: v.cliente_id, credito: 0, abonado: 0, saldo: 0, clientes: v.clientes || null }
          mapa.set(v.cliente_id, fila)
        }
        fila.credito += aCentavos(v.total)
        fila.abonado += aCentavos(v.pagado)
        fila.saldo += aCentavos(v.deuda)
      }
      const operacionesPorCliente = new Map<number, { operaciones: number; mt: number }>()
      for (const grupo of agruparVentasDeuda(ventas)) {
        if (grupo.deuda <= 0.009) continue
        let actual = operacionesPorCliente.get(grupo.cliente_id)
        if (!actual) { actual = { operaciones: 0, mt: 0 }; operacionesPorCliente.set(grupo.cliente_id, actual) }
        actual.operaciones += 1
        if (grupo.esMulti) actual.mt += 1
      }
      const ordenadas: Row[] = Array.from(mapa.values())
        .filter((r) => r.saldo > 0)
        .map((r) => ({
          cliente_id: r.cliente_id,
          credito: aQuetzales(r.credito), abonado: aQuetzales(r.abonado), saldo: aQuetzales(r.saldo),
          operaciones_pendientes: operacionesPorCliente.get(r.cliente_id)?.operaciones || 0,
          mt_pendientes: operacionesPorCliente.get(r.cliente_id)?.mt || 0,
          clientes: r.clientes,
        }))
        .sort((a, b) => (a.clientes?.nombre || '').localeCompare(b.clientes?.nombre || '', 'es'))
      setRows(ordenadas)
    } catch (e) {
      console.error('Error cargando deudas de clientes', e)
      setErrorCarga('No fue posible consultar todos los registros. No se muestran resultados parciales.')
      setRows([])
    } finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { void cargar() }, [cargar])

  const totales = useMemo(() => rows.reduce((acc, r) => {
    acc.credito += aCentavos(r.credito)
    acc.abonado += aCentavos(r.abonado)
    acc.saldo += aCentavos(r.saldo)
    return acc
  }, { credito: 0, abonado: 0, saldo: 0 }), [rows])

  const generarPDF = async () => {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)
      doc.setFontSize(14)
      doc.text('Deudas de clientes — Granja', 14, 35)
      doc.setFontSize(10)
      doc.text(clienteId
        ? `Cliente: ${clientes.find((c) => c.id === Number(clienteId))?.nombre || `#${clienteId}`}`
        : 'Cliente: Todos', 14, 41)
      autoTable(doc, {
        startY: 46,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total a crédito', formatoQuetzales(aQuetzales(totales.credito))],
          ['Total abonado', formatoQuetzales(aQuetzales(totales.abonado))],
          ['Saldo total', formatoQuetzales(aQuetzales(totales.saldo))],
        ],
        styles: { fontSize: 9 },
      })
      const y = (doc as any).lastAutoTable.finalY + 6
      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'NIT', 'Operaciones', 'MT', 'Crédito', 'Abonado', 'Saldo']],
        body: rows.map((r) => [
          r.clientes?.nombre || `Cliente #${r.cliente_id}`,
          r.clientes?.nit || '—',
          String(r.operaciones_pendientes), String(r.mt_pendientes),
          formatoQuetzales(r.credito), formatoQuetzales(r.abonado), formatoQuetzales(r.saldo),
        ]),
        styles: { fontSize: 8 },
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      })
      const ahora = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      doc.save(`reporte_deudas_clientes_granja_${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}.pdf`)
    } catch (e) { console.error(e); alert('No fue posible generar el PDF.') }
    finally { setGenerando(false) }
  }

  return <div className="p-6 max-w-6xl mx-auto">
    <div className="flex justify-center mb-4"><Image src="/logo.png" alt="Logo" width={180} height={72}/></div>
    <h1 className="text-2xl font-bold mb-2">💳 Deudas por Cliente — Granja</h1>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <select className="border p-2 text-sm w-full md:w-[420px]" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
        <option value="">— Todos los clientes con deuda —</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <button onClick={() => void cargar()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60" disabled={loading}>🔎 Buscar</button>
      <button onClick={generarPDF} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60" disabled={generando || loading || !!errorCarga || rows.length === 0}>
        {generando ? 'Generando…' : '📄 Reporte PDF'}
      </button>
      <Link href="/granja/reportes" className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm">⬅ Volver</Link>
    </div>
    {errorCarga && <div role="alert" className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 rounded text-sm">{errorCarga}</div>}
    <div className="border rounded p-4 bg-white mb-4 text-sm">
      <div>Total a crédito: {formatoQuetzales(aQuetzales(totales.credito))}</div>
      <div>Total abonado: {formatoQuetzales(aQuetzales(totales.abonado))}</div>
      <div><b>Saldo total: {formatoQuetzales(aQuetzales(totales.saldo))}</b></div>
      <div className="text-xs text-gray-500 mt-1">Las operaciones MT se cuentan una sola vez por venta, aunque tengan varios tramos.</div>
    </div>
    <div className="border rounded bg-white overflow-auto"><table className="w-full text-sm">
      <thead className="bg-gray-200"><tr>
        <th className="p-2 text-left">Cliente</th><th className="p-2 text-left">NIT</th>
        <th className="p-2 text-right">Operaciones pendientes</th><th className="p-2 text-right">MT pendientes</th>
        <th className="p-2 text-right">Crédito</th><th className="p-2 text-right">Abonado</th><th className="p-2 text-right">Saldo</th>
        <th className="p-2 text-left">Acciones</th>
      </tr></thead>
      <tbody>
        {loading ? <tr><td className="p-4 text-gray-500" colSpan={8}>Cargando todos los registros…</td></tr>
          : rows.length === 0 ? <tr><td className="p-4 text-gray-500" colSpan={8}>{errorCarga || 'No hay clientes con deuda.'}</td></tr>
          : rows.map((r) => <tr key={r.cliente_id} className="border-t">
            <td className="p-2">{r.clientes?.nombre || `Cliente #${r.cliente_id}`}</td>
            <td className="p-2">{r.clientes?.nit || '—'}</td>
            <td className="p-2 text-right">{r.operaciones_pendientes}</td>
            <td className="p-2 text-right">{r.mt_pendientes}</td>
            <td className="p-2 text-right">{formatoQuetzales(r.credito)}</td>
            <td className="p-2 text-right">{formatoQuetzales(r.abonado)}</td>
            <td className="p-2 text-right font-semibold">{formatoQuetzales(r.saldo)}</td>
            <td className="p-2"><Link href={`/granja/reportes/deudas-clientes/vista?cliente_id=${r.cliente_id}`}
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs">Detalle / Abonos</Link></td>
          </tr>)}
      </tbody>
    </table></div>
  </div>
}
