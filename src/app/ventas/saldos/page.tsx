'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Cliente = {
  id: number
  nombre: string
  nit?: string | null
}

type SaldoItem = {
  cliente_id: number
  nombre: string
  nit: string | null
  credito: number
  abonado: number
  saldo: number
}

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const fmtQ = (n: number) => `Q${round2(toNum(n)).toFixed(2)}`

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

function nombreArchivo() {
  const now = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  return `reporte_saldos_clientes_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
}

export default function SaldosPorClientePage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedClienteId, setSelectedClienteId] = useState<string>('')
  const [rows, setRows] = useState<SaldoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const totals = useMemo(() => {
    const tCredito = rows.reduce((s, r) => s + toNum(r.credito), 0)
    const tAbonado = rows.reduce((s, r) => s + toNum(r.abonado), 0)
    const tSaldo = rows.reduce((s, r) => s + toNum(r.saldo), 0)

    return {
      tCredito: round2(tCredito),
      tAbonado: round2(tAbonado),
      tSaldo: round2(tSaldo),
    }
  }, [rows])

  const cargarClientes = useCallback(async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, nit')
      .order('nombre', { ascending: true })

    if (error) {
      console.error('Error cargando clientes:', error)
      setClientes([])
      return
    }

    setClientes((data as Cliente[]) || [])
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)

    try {
      let q = supabase.from('v_saldos_clientes').select('*')

      if (selectedClienteId) {
        q = q.eq('cliente_id', Number(selectedClienteId))
      }

      const { data, error } = await q.order('nombre', { ascending: true })

      if (error) {
        console.error('Error cargando saldos:', error)
        setRows([])
        return
      }

      const normalizados = ((data as SaldoItem[]) || [])
        .map((r) => ({
          cliente_id: Number(r.cliente_id),
          nombre: r.nombre || `Cliente #${r.cliente_id}`,
          nit: r.nit || null,
          credito: toNum(r.credito),
          abonado: toNum(r.abonado),
          saldo: toNum(r.saldo),
        }))
        .filter((r) => r.saldo > 0.000001)

      setRows(normalizados)
    } finally {
      setLoading(false)
    }
  }, [selectedClienteId])

  useEffect(() => {
    cargarClientes()
  }, [cargarClientes])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function generarPDF() {
    setGenerando(true)

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 8, 50, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Saldos de clientes', 14, 35)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      const clienteTxt = selectedClienteId
        ? `Cliente: ${clientes.find((c) => c.id === Number(selectedClienteId))?.nombre || 'Seleccionado'}`
        : 'Cliente: Todos los clientes con saldo pendiente'

      doc.text(clienteTxt, 14, 41)

      autoTable(doc, {
        startY: 47,
        head: [['Resumen', 'Valor']],
        body: [
          ['Total a crédito', fmtQ(totals.tCredito)],
          ['Total abonado', fmtQ(totals.tAbonado)],
          ['Saldo total', fmtQ(totals.tSaldo)],
        ],
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [220, 225, 232],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: {
          1: { halign: 'right' },
        },
      })

      const y = ((doc as any).lastAutoTable?.finalY || 65) + 6

      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'NIT', 'Crédito', 'Abonado', 'Saldo']],
        body: rows.map((r) => [
          r.nombre,
          r.nit || '—',
          fmtQ(r.credito),
          fmtQ(r.abonado),
          fmtQ(r.saldo),
        ]),
        theme: 'grid',
        styles: {
          fontSize: 8.5,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [220, 225, 232],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 30 },
          2: { halign: 'right', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 30 },
        },
        didDrawPage: () => {
          const pageWidth = doc.internal.pageSize.getWidth()
          const pageHeight = doc.internal.pageSize.getHeight()
          const page = doc.getCurrentPageInfo().pageNumber

          doc.setFontSize(8)
          doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
          doc.text(`Página ${page}`, pageWidth - 14, pageHeight - 8, {
            align: 'right',
          })
        },
      })

      doc.save(nombreArchivo())
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <h1 className="text-2xl font-bold mb-3">💰 Saldos por Cliente</h1>

      <div className="mb-4 flex flex-col md:flex-row items-center gap-3">
        <select
          className="border p-2 text-sm w-full md:w-[440px]"
          value={selectedClienteId}
          onChange={(e) => setSelectedClienteId(e.target.value)}
        >
          <option value="">— Todos los clientes con saldo pendiente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {c.nit ? ` • NIT: ${c.nit}` : ''}
            </option>
          ))}
        </select>

        <button
          onClick={cargar}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
          disabled={loading}
        >
          🔎 Buscar
        </button>

        <button
          onClick={generarPDF}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          disabled={generando || rows.length === 0}
        >
          {generando ? 'Generando…' : '📄 Reporte PDF'}
        </button>

        {selectedClienteId && (
          <button
            onClick={() => setSelectedClienteId('')}
            className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded text-sm"
          >
            Limpiar
          </button>
        )}

        <Link
          href="/ventas"
          className="md:ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver al Menú de Ventas
        </Link>
      </div>

      <div className="border rounded p-4 bg-white mb-4 text-sm">
        <div>Total a crédito: {fmtQ(totals.tCredito)}</div>
        <div>Total abonado: {fmtQ(totals.tAbonado)}</div>
        <div>
          <b>Saldo total: {fmtQ(totals.tSaldo)}</b>
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
                  No hay clientes con saldo pendiente.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.cliente_id} className="border-t">
                  <td className="p-2">{r.nombre}</td>
                  <td className="p-2">{r.nit || '—'}</td>
                  <td className="p-2 text-right">{fmtQ(r.credito)}</td>
                  <td className="p-2 text-right">{fmtQ(r.abonado)}</td>
                  <td className="p-2 text-right font-semibold">{fmtQ(r.saldo)}</td>
                  <td className="p-2">
                    <Link
                      href={`/ventas/saldos/vista?cliente_id=${r.cliente_id}&nombre=${encodeURIComponent(r.nombre)}`}
                      className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Detalle / Registrar pago
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
