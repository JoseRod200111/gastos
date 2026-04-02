'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  activo: boolean
}

type StockRow = {
  ubicacion_id: number
  cantidad: number | null
  tipo: 'ENTRADA_COMPRA' | 'ENTRADA_PARTO' | 'SALIDA_VENTA' | 'SALIDA_MUERTE' | 'AJUSTE'
  fecha?: string
}

type StockMap = Record<number, number>

const toNum = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const finDeDiaUTC = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

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

function generarPdfInventarioPorCuadros(params: {
  fechaCorte: string
  grupos: Record<string, Ubicacion[]>
  stockTeorico: StockMap
}) {
  const { fechaCorte, grupos, stockTeorico } = params

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.text('REPORTE DE INVENTARIO (TEÓRICO)', 14, 16)

  doc.setFontSize(10)
  doc.text(`Fecha de corte: ${fechaCorte}`, 14, 23)

  const totalGeneral = Object.values(stockTeorico).reduce((a, n) => a + toNum(n), 0)
  doc.text(`Total general: ${totalGeneral}`, 14, 28)

  // Resumen por grupo
  const resumenBody: any[] = []
  for (const [g, lista] of Object.entries(grupos)) {
    const subtotal = lista.reduce((acc, u) => acc + toNum(stockTeorico[u.id] ?? 0), 0)
    resumenBody.push([g, String(subtotal)])
  }
  resumenBody.push(['TOTAL', String(totalGeneral)])

  autoTable(doc, {
    startY: 34,
    head: [['Grupo', 'Total']],
    body: resumenBody,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [220, 220, 220] },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { halign: 'right' } },
  })

  let y = (doc as any).lastAutoTable.finalY + 6

  // Secciones por grupo (tipo “cuadros”)
  for (const [g, lista] of Object.entries(grupos)) {
    if (y > 260) {
      doc.addPage()
      y = 16
    }

    doc.setFontSize(11)
    doc.text(g.toUpperCase(), 14, y)
    y += 2

    autoTable(doc, {
      startY: y + 2,
      head: [['Ubicación', 'Cantidad']],
      body: lista.map((u) => [u.codigo, String(toNum(stockTeorico[u.id] ?? 0))]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [210, 210, 210] },
      margin: { left: 14, right: 14 },
      columnStyles: { 1: { halign: 'right' } },
    })

    y = (doc as any).lastAutoTable.finalY + 8
  }

  const now = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const name = `reporte_inventario_${fechaCorte}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
  doc.save(name)
}

export default function GranjaInventarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [stockTeorico, setStockTeorico] = useState<StockMap>({})
  const [valoresEditados, setValoresEditados] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  // ✅ nuevo: fecha de corte
  const [fechaCorte, setFechaCorte] = useState<string>('')

  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const f = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    setFechaCorte(f)
  }, [])

  // ----------- helpers de agrupacion -----------

  const groupNameFor = (u: Ubicacion): string => {
    if (u.nombre && u.nombre.includes(' - ')) {
      return u.nombre.split(' - ')[0] || 'Otros'
    }
    if (u.nombre) return u.nombre
    // heuristica por codigo
    if (u.codigo.startsWith('TR')) return 'Galera'
    if (u.codigo.startsWith('M1')) return 'Maternidad 1'
    if (u.codigo.startsWith('M2')) return 'Maternidad 2'
    if (u.codigo.startsWith('L1')) return 'Lechonera 1'
    if (u.codigo.startsWith('L2')) return 'Lechonera 2'
    if (u.codigo.startsWith('L3')) return 'Lechonera 3'
    if (u.codigo.startsWith('S2')) return 'Sitio 2'
    return 'Otros'
  }

  const grupos = useMemo(() => {
    const g: Record<string, Ubicacion[]> = {}
    for (const u of ubicaciones) {
      const nombreGrupo = groupNameFor(u)
      if (!g[nombreGrupo]) g[nombreGrupo] = []
      g[nombreGrupo].push(u)
    }
    // ordenar ubicaciones dentro de cada grupo por codigo
    for (const key of Object.keys(g)) {
      g[key].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
    }
    return g
  }, [ubicaciones])

  // Totales en pantalla
  const totalGeneral = useMemo(() => {
    return Object.values(stockTeorico).reduce((a, n) => a + toNum(n), 0)
  }, [stockTeorico])

  const totalesPorGrupo = useMemo(() => {
    const t: Record<string, number> = {}
    for (const [g, lista] of Object.entries(grupos)) {
      t[g] = lista.reduce((acc, u) => acc + toNum(stockTeorico[u.id] ?? 0), 0)
    }
    return t
  }, [grupos, stockTeorico])

  // ----------- cargar datos (con fecha) -----------

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      // 1) ubicaciones activas
      const { data: ubicData, error: ubicError } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, activo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (ubicError) {
        console.error('Error cargando ubicaciones', ubicError)
        return
      }

      const ubicList = (ubicData as Ubicacion[]) || []
      setUbicaciones(ubicList)

      if (ubicList.length === 0) {
        setStockTeorico({})
        setValoresEditados({})
        return
      }

      // 2) inventario teorico por movimientos (hasta fechaCorte)
      let movQuery = supabase
        .from('granja_movimientos')
        .select('ubicacion_id, cantidad, tipo, fecha')

      if (fechaCorte) {
        movQuery = movQuery.lte('fecha', finDeDiaUTC(fechaCorte))
      }

      const { data: movData, error: movError } = await movQuery

      if (movError) {
        console.error('Error cargando movimientos', movError)
        return
      }

      const mapa: StockMap = {}
      ;(movData as StockRow[]).forEach((row) => {
        const id = row.ubicacion_id
        const cant = toNum(row.cantidad || 0)
        if (!mapa[id]) mapa[id] = 0

        // ✅ salidas RESTAN, entradas y ajustes SUMAN
        if (row.tipo === 'SALIDA_VENTA' || row.tipo === 'SALIDA_MUERTE') {
          mapa[id] -= cant
        } else {
          // ENTRADA_COMPRA, ENTRADA_PARTO, AJUSTE
          mapa[id] += cant
        }
      })

      setStockTeorico(mapa)

      // 3) valores editados iniciales (como strings en inputs)
      const inicial: Record<number, string> = {}
      for (const u of ubicList) {
        const cant = mapa[u.id] ?? 0
        inicial[u.id] = String(cant)
      }
      setValoresEditados(inicial)
    } finally {
      setLoading(false)
    }
  }, [fechaCorte])

  useEffect(() => {
    if (fechaCorte) cargarDatos()
  }, [cargarDatos, fechaCorte])

  // ----------- cambios en inputs -----------

  const actualizarValor = (idUbicacion: number, valor: string) => {
    setValoresEditados((prev) => ({
      ...prev,
      [idUbicacion]: valor,
    }))
  }

  // ----------- reporte pdf -----------

  const generarPDF = async () => {
    if (!fechaCorte) {
      alert('Selecciona una fecha de corte.')
      return
    }
    if (ubicaciones.length === 0) {
      alert('No hay ubicaciones para reportar.')
      return
    }

    setGenerandoPdf(true)
    try {
      const logo = await fetchLogoDataUrl()
      generarPdfInventarioPorCuadros({
        fechaCorte,
        grupos,
        stockTeorico,
      })

      // (logo se usa dentro del helper si quieres; aquí lo dejamos listo por si luego deseas integrarlo arriba)
      void logo
    } finally {
      setGenerandoPdf(false)
    }
  }

  // ----------- guardar ajustes -----------

  const guardarInventario = async () => {
    if (guardando) return

    setGuardando(true)
    try {
      // obtener usuario actual para registrar quien ajusta
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ajustes: {
        ubicacion_id: number
        tipo: string
        cantidad: number
        referencia_tabla: string
        referencia_id: number | null
        observaciones: string
        user_id: string | null
      }[] = []

      for (const u of ubicaciones) {
        const original = stockTeorico[u.id] ?? 0
        const texto = valoresEditados[u.id] ?? ''
        const nuevoNumero = texto.trim() === '' ? 0 : Number(texto)

        if (Number.isNaN(nuevoNumero)) {
          alert(`El valor para la ubicación ${u.codigo} no es un número válido.`)
          setGuardando(false)
          return
        }

        const diff = nuevoNumero - original
        if (diff !== 0) {
          ajustes.push({
            ubicacion_id: u.id,
            tipo: 'AJUSTE',
            cantidad: diff, // positivo agrega, negativo descuenta
            referencia_tabla: 'INVENTARIO_MANUAL',
            referencia_id: null,
            observaciones: `Ajuste manual desde pantalla de inventario (corte ${fechaCorte || '—'})`,
            user_id: userId,
          })
        }
      }

      if (ajustes.length === 0) {
        alert('No hay cambios que guardar.')
        setGuardando(false)
        return
      }

      const { error: insertError } = await supabase.from('granja_movimientos').insert(ajustes)

      if (insertError) {
        console.error('Error registrando ajustes', insertError)
        alert('Ocurrió un error al guardar los ajustes de inventario.')
        setGuardando(false)
        return
      }

      alert('Inventario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // ----------- UI -----------

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario</h1>
          <p className="text-xs text-gray-600">
            Ajuste manual del inventario por tramo o jaula. Cada cambio se registra como movimiento de tipo ajuste.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      {/* barra superior: fecha + botones */}
      <div className="mb-4 flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Fecha de corte</label>
            <input
              type="date"
              value={fechaCorte}
              onChange={(e) => setFechaCorte(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <button
            onClick={cargarDatos}
            disabled={loading || !fechaCorte}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {loading ? 'Cargando…' : '🔍 Buscar'}
          </button>

          <button
            onClick={generarPDF}
            disabled={generandoPdf || loading || ubicaciones.length === 0}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {generandoPdf ? 'Generando…' : '📄 Reporte PDF'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <p className="text-xs text-gray-500">Cargando ubicaciones e inventario…</p>
          ) : (
            <p className="text-xs text-gray-500">Ubicaciones activas: {ubicaciones.length}</p>
          )}

          <button
            onClick={guardarInventario}
            disabled={guardando || loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {guardando ? 'Guardando…' : 'Guardar inventario'}
          </button>
        </div>
      </div>

      {/* Totales */}
      <div className="grid md:grid-cols-4 gap-3 mb-5">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Fecha de corte</div>
          <div className="text-lg font-bold">{fechaCorte || '—'}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total general</div>
          <div className="text-lg font-bold">{totalGeneral}</div>
        </div>

        <div className="border rounded p-3 bg-white md:col-span-2">
          <div className="text-xs text-gray-500">Totales por grupo</div>
          <div className="text-xs text-gray-700 flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {Object.entries(totalesPorGrupo).slice(0, 6).map(([g, t]) => (
              <span key={g}>
                <span className="font-semibold">{g}:</span> {t}
              </span>
            ))}
            {Object.keys(totalesPorGrupo).length > 6 ? <span className="text-gray-500">…</span> : null}
          </div>
        </div>
      </div>

      {/* grid de tarjetas de inventario */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grupos).map(([grupo, lista]) => (
          <div key={grupo} className="border rounded-lg bg-white shadow-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide">{grupo}</h2>
              <span className="text-[11px] text-gray-600">
                Total: {lista.reduce((acc, u) => acc + toNum(stockTeorico[u.id] ?? 0), 0)}
              </span>
            </div>

            <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs">
              {lista.map((u) => (
                <Fragment key={u.id}>
                  <div className="py-1 pr-1 text-right font-medium">{u.codigo}</div>
                  <input
                    type="number"
                    className="border rounded w-full px-2 py-1 text-right"
                    value={valoresEditados[u.id] ?? ''}
                    onChange={(e) => actualizarValor(u.id, e.target.value)}
                  />
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
