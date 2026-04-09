'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Cliente = {
  id: number
  nombre: string
  nit: string | null
}

type Row = {
  cliente_id: number
  credito: number
  abonado: number
  saldo: number
  clientes?: { nombre: string | null; nit: string | null } | null
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100
const fmtQ = (n: number) => `Q${round2(n).toFixed(2)}`

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export default function GranjaDeudasClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState<string>('') // filtro dropdown
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, nit')
        .order('nombre', { ascending: true })

      if (!error) setClientes((data || []) as Cliente[])
    })()
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      // Traemos todas las ventas de granja con deuda>0 (y opcionalmente filtramos cliente)
      let q = supabase
        .from('granja_ventas_cerdos')
        .select('cliente_id, total, pagado, deuda, clientes ( nombre, nit )')

      if (clienteId) q = q.eq('cliente_id', Number(clienteId))

      const { data, error } = await q
      if (error) {
        console.error(error)
        setRows([])
        return
      }

      const map: Record<number, Row> = {}
      for (const r of (data || []) as any[]) {
        const cid = Number(r.cliente_id)
        if (!map[cid]) {
          map[cid] = {
            cliente_id: cid,
            credito: 0,
            abonado: 0,
            saldo: 0,
            clientes: r.clientes ?? null,
          }
        }
        map[cid].credito += toNum(r.total)
        map[cid].abonado += toNum(r.pagado)
        map[cid].saldo += toNum(r.deuda)
      }

      const arr = Object.values(map)
        .filter((x) => x.saldo > 0.000001) // solo con deuda
        .sort((a, b) => (a.clientes?.nombre || '').localeCompare(b.clientes?.nombre || '', 'es'))

      setRows(arr)
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = useMemo(() => {
    const credito = rows.reduce((a, r) => a + toNum(r.credito), 0)
    const abonado = rows.reduce((a, r) => a + toNum(r.abonado), 0)
    const saldo = rows.reduce((a, r) => a + toNum(r.saldo), 0)
    return { credito: round2(credito), abonado: round2(abonado), saldo: round2(saldo) }
  }, [rows])

  const generarPDF = async () => {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)

      doc.setFontSize(14)
      doc.text('Deudas de clientes — Granja', 14, 35)

      doc.setFontSize(10)
      const filtroTxt = clienteId
        ? `Cliente: ${(clientes.find((c) => c.id === Number(clienteId))?.nombre || '')}`
        : 'Cliente: Todos'
      doc.text(filtroTxt, 14, 41)

      autoTable(doc, {
        startY: 46,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total a crédito', fmtQ(totales.credito)],
          ['Total abonado', fmtQ(totales.abonado)],
          ['Saldo total', fmtQ(totales.saldo)],
        ],
        styles: { fontSize: 9 },
      })

      const y = (doc as any).lastAutoTable.finalY + 6

      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'NIT', 'Crédito', 'Abonado', 'Saldo']],
        body: rows.map((r) => [
          r.clientes?.nombre || `Cliente #${r.cliente_id}`,
          r.clientes?.nit || '—',
          fmtQ(r.credito),
          fmtQ(r.abonado),
          fmtQ(r.saldo),
        ]),
        styles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })

      const now = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const name = `reporte_deudas_clientes_granja_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
      doc.save(name)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-2">💳 Deudas por Cliente — Granja</h1>

      <div className="mb-4 flex items-center gap-3">
        <select
          className="border p-2 text-sm w-full md:w-[420px]"
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
        >
          <option value="">— Todos los clientes con deuda —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <button
          onClick={cargar}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          disabled={loading}
        >
          🔎 Buscar
        </button>

        <button
          onClick={generarPDF}
          className="bg-emerald-600 text-white px-4 py-2 rounded text-sm"
          disabled={generando || rows.length === 0}
        >
          {generando ? 'Generando…' : '📄 Reporte PDF'}
        </button>

        <Link
          href="/granja/reportes"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver
        </Link>
      </div>

      <div className="border rounded p-4 bg-white mb-4 text-sm">
        <div>Total a crédito: {fmtQ(totales.credito)}</div>
        <div>Total abonado: {fmtQ(totales.abonado)}</div>
        <div>
          <b>Saldo total: {fmtQ(totales.saldo)}</b>
        </div>
      </div>

      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Cliente</th>
              <th className="p-2 text-left">NIT</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-right">Abonado</th>
              <th className="p-2 text-right">Saldo</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  No hay clientes con deuda.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.cliente_id} className="border-t">
                  <td className="p-2">{r.clientes?.nombre || `Cliente #${r.cliente_id}`}</td>
                  <td className="p-2">{r.clientes?.nit || '—'}</td>
                  <td className="p-2 text-right">{fmtQ(r.credito)}</td>
                  <td className="p-2 text-right">{fmtQ(r.abonado)}</td>
                  <td className="p-2 text-right font-semibold">{fmtQ(r.saldo)}</td>
                  <td className="p-2">
                    <Link
                      href={`/granja/reportes/deudas-clientes/vista?cliente_id=${r.cliente_id}`}
                      className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Detalle / Abonos
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}