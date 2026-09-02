'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

type ProveedorInfo = {
  nombre: string
  nit: string | null
  telefono: string | null
}

type MetodoPago = {
  id: number
  metodo: string
}

type SaldoVista = {
  erogacion_id: number
  fecha: string
  proveedor_id: number | null
  proveedor: string | null
  nit: string | null
  empresa: string | null
  division: string | null
  categoria: string | null
  credito: number
  abonado: number
  saldo: number
  estado_saldo: string
}

type DetalleCompra = {
  id: number
  erogacion_id: number
  concepto: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
  documento: string | null
  forma_pago?: { metodo: string | null } | { metodo: string | null }[] | null
}

type PagoErogacion = {
  id: number
  proveedor_id: number
  erogacion_id: number | null
  fecha: string
  monto: number
  metodo_pago_id: number | null
  documento: string | null
  observaciones: string | null
  user_id: string | null
  created_at: string | null
}

const PAGE_SIZE = 1000

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (value: unknown) => `Q${round2(toNum(value)).toFixed(2)}`

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const only = value.slice(0, 10)
  const parts = only.split('-')
  if (parts.length !== 3) return value
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value

  return d.toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function fileStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

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

function asObj<T>(rel: unknown): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllSaldosProveedor(proveedorId: number) {
  const all: SaldoVista[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('v_erogaciones_saldos')
      .select('*')
      .eq('proveedor_id', proveedorId)
      .order('fecha', { ascending: false })
      .order('erogacion_id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: all, error }

    all.push(...(((data || []) as unknown[]) as SaldoVista[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

async function fetchDetalles(erogacionIds: number[]) {
  const all: DetalleCompra[] = []
  const ids = Array.from(new Set(erogacionIds.filter((id) => id > 0)))

  for (const chunk of chunkArray(ids, 250)) {
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('detalle_compra')
        .select('id,erogacion_id,concepto,cantidad,precio_unitario,importe,documento,forma_pago(metodo)')
        .in('erogacion_id', chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) return { data: all, error }

      all.push(...(((data || []) as unknown[]) as DetalleCompra[]))
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  return { data: all, error: null }
}

async function fetchPagos(proveedorId: number) {
  const all: PagoErogacion[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('pagos_erogacion')
      .select('id,proveedor_id,erogacion_id,fecha,monto,metodo_pago_id,documento,observaciones,user_id,created_at')
      .eq('proveedor_id', proveedorId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: all, error }

    all.push(...(((data || []) as unknown[]) as PagoErogacion[]))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: all, error: null }
}

function VistaProveedorInner() {
  const sp = useSearchParams()
  const proveedorId = Number(sp.get('proveedor_id') || 0)
  const nombreParam = sp.get('nombre') || ''

  const [proveedor, setProveedor] = useState<ProveedorInfo>({ nombre: nombreParam, nit: null, telefono: null })
  const [saldos, setSaldos] = useState<SaldoVista[]>([])
  const [detalles, setDetalles] = useState<Record<number, DetalleCompra[]>>({})
  const [pagos, setPagos] = useState<PagoErogacion[]>([])
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPago, setLoadingPago] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const [filtros, setFiltros] = useState({
    estado: 'PENDIENTES',
    desde: '',
    hasta: '',
    erogacion_id: '',
  })

  const [pago, setPago] = useState({
    modo: 'auto' as 'auto' | 'erogacion',
    erogacion_id: '',
    fecha: todayISO(),
    monto: '',
    metodo_pago_id: '',
    documento: '',
    observaciones: '',
  })

  const cargarProveedor = useCallback(async () => {
    if (!proveedorId) return

    const { data, error } = await supabase
      .from('proveedores')
      .select('nombre,nit,telefono')
      .eq('id', proveedorId)
      .single()

    if (!error && data) {
      setProveedor({
        nombre: data.nombre || `Proveedor #${proveedorId}`,
        nit: data.nit || null,
        telefono: data.telefono || null,
      })
    }
  }, [proveedorId])

  const cargarMetodos = useCallback(async () => {
    const { data, error } = await supabase
      .from('forma_pago')
      .select('id,metodo')
      .order('metodo', { ascending: true })

    if (error) {
      setMensaje(`Error cargando métodos de pago: ${error.message}`)
      return
    }

    setMetodos(((data || []) as MetodoPago[]).filter((m) => !m.metodo.toLowerCase().includes('pendiente')))
  }, [])

  const cargarDatos = useCallback(async () => {
    if (!proveedorId) {
      setMensaje('No se recibió proveedor_id.')
      return
    }

    setLoading(true)
    setMensaje('')

    try {
      const { data: saldosData, error: saldoError } = await fetchAllSaldosProveedor(proveedorId)

      if (saldoError) {
        console.error(saldoError)
        setMensaje(`No se pudieron cargar saldos. Ejecutá primero sql/erogaciones_saldos_proveedores.sql. Detalle: ${saldoError.message}`)
        setSaldos([])
        return
      }

      setSaldos(saldosData || [])

      const ids = (saldosData || []).map((s) => Number(s.erogacion_id)).filter((id) => id > 0)
      const { data: detData, error: detError } = await fetchDetalles(ids)

      if (detError) {
        console.error(detError)
        setMensaje(`No se pudieron cargar detalles: ${detError.message}`)
      } else {
        const grouped: Record<number, DetalleCompra[]> = {}
        ;(detData || []).forEach((d) => {
          const erogId = Number(d.erogacion_id)
          if (!grouped[erogId]) grouped[erogId] = []
          grouped[erogId].push(d)
        })
        setDetalles(grouped)
      }

      const { data: pagosData, error: pagosError } = await fetchPagos(proveedorId)
      if (pagosError) {
        console.error(pagosError)
        setMensaje(`No se pudieron cargar abonos: ${pagosError.message}`)
      } else {
        setPagos((pagosData || []).map((p) => ({ ...p, monto: toNum(p.monto) })))
      }
    } finally {
      setLoading(false)
    }
  }, [proveedorId])

  useEffect(() => {
    cargarProveedor()
    cargarMetodos()
    cargarDatos()
  }, [cargarProveedor, cargarMetodos, cargarDatos])

  const saldosFiltrados = useMemo(() => {
    return saldos.filter((row) => {
      if (filtros.estado === 'PENDIENTES' && toNum(row.saldo) <= 0.009) return false
      if (filtros.estado === 'PAGADAS' && !(toNum(row.credito) > 0 && toNum(row.saldo) <= 0.009)) return false
      if (filtros.estado === 'PARCIALES' && !(toNum(row.abonado) > 0 && toNum(row.saldo) > 0.009)) return false
      if (filtros.estado === 'SOBREPAGADAS' && row.estado_saldo !== 'SOBREPAGADA') return false
      if (filtros.desde && row.fecha < filtros.desde) return false
      if (filtros.hasta && row.fecha > filtros.hasta) return false
      if (filtros.erogacion_id.trim() && !String(row.erogacion_id).includes(filtros.erogacion_id.trim())) return false
      return true
    })
  }, [saldos, filtros])

  const totales = useMemo(() => {
    return saldosFiltrados.reduce(
      (acc, row) => {
        acc.credito += toNum(row.credito)
        acc.abonado += toNum(row.abonado)
        acc.saldo += toNum(row.saldo)
        acc.registros += 1
        return acc
      },
      { credito: 0, abonado: 0, saldo: 0, registros: 0 }
    )
  }, [saldosFiltrados])

  const pagosRecientes = useMemo(() => pagos.slice(0, 10), [pagos])

  const registrarPago = async () => {
    if (!proveedorId) return setMensaje('No se recibió proveedor_id.')
    const montoTotal = round2(toNum(pago.monto))
    if (montoTotal <= 0) return setMensaje('Ingresá un monto válido para el pago.')
    if (!pago.metodo_pago_id) return setMensaje('Seleccioná método de pago.')

    const pendientes = saldos
      .filter((row) => toNum(row.saldo) > 0.009)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.erogacion_id - b.erogacion_id)

    if (pendientes.length === 0) return setMensaje('Este proveedor no tiene saldos pendientes.')

    const payloads: Record<string, unknown>[] = []

    if (pago.modo === 'erogacion') {
      const erogacionId = Number(pago.erogacion_id)
      const selected = pendientes.find((row) => row.erogacion_id === erogacionId)
      if (!selected) return setMensaje('La erogación seleccionada no tiene saldo pendiente.')
      if (montoTotal > toNum(selected.saldo) + 0.009) return setMensaje(`El monto excede el saldo de la erogación #${erogacionId}: ${money(selected.saldo)}.`)

      payloads.push({
        proveedor_id: proveedorId,
        erogacion_id: erogacionId,
        fecha: pago.fecha,
        monto: montoTotal,
        metodo_pago_id: Number(pago.metodo_pago_id),
        documento: pago.documento.trim() || null,
        observaciones: pago.observaciones.trim() || null,
      })
    } else {
      const totalPendiente = round2(pendientes.reduce((acc, row) => acc + toNum(row.saldo), 0))
      if (montoTotal > totalPendiente + 0.009) return setMensaje(`El monto excede el saldo total pendiente del proveedor: ${money(totalPendiente)}.`)

      let restante = montoTotal
      for (const row of pendientes) {
        if (restante <= 0.009) break
        const aplicado = round2(Math.min(restante, toNum(row.saldo)))
        restante = round2(restante - aplicado)

        payloads.push({
          proveedor_id: proveedorId,
          erogacion_id: row.erogacion_id,
          fecha: pago.fecha,
          monto: aplicado,
          metodo_pago_id: Number(pago.metodo_pago_id),
          documento: pago.documento.trim() || null,
          observaciones: pago.observaciones.trim()
            ? `${pago.observaciones.trim()} | Aplicado automáticamente a erogación #${row.erogacion_id}`
            : `Aplicado automáticamente a erogación #${row.erogacion_id}`,
        })
      }
    }

    setLoadingPago(true)
    setMensaje('')

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const payloadFinal = payloads.map((p) => ({ ...p, user_id: userId }))

      const { error } = await supabase.from('pagos_erogacion').insert(payloadFinal)

      if (error) {
        console.error(error)
        setMensaje(`No se pudo registrar el pago. Detalle: ${error.message}`)
        return
      }

      setPago({
        modo: 'auto',
        erogacion_id: '',
        fecha: todayISO(),
        monto: '',
        metodo_pago_id: '',
        documento: '',
        observaciones: '',
      })
      setMensaje('Pago registrado correctamente.')
      await cargarDatos()
    } finally {
      setLoadingPago(false)
    }
  }

  const generarPDF = async () => {
    if (saldosFiltrados.length === 0) {
      setMensaje('No hay saldos para generar PDF con los filtros actuales.')
      return
    }

    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const logo = await fetchLogoDataUrl()

      if (logo) doc.addImage(logo, 'PNG', pageWidth / 2 - 22, 9, 44, 18)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('Detalle de deuda por proveedor', pageWidth / 2, 34, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Proveedor: ${proveedor.nombre || `#${proveedorId}`}`, 14, 42)
      doc.text(`NIT: ${proveedor.nit || 'CF'}`, 14, 47)
      doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 52)

      autoTable(doc, {
        startY: 58,
        head: [['Resumen', 'Valor']],
        body: [
          ['Erogaciones mostradas', String(totales.registros)],
          ['Crédito histórico', money(totales.credito)],
          ['Abonado', money(totales.abonado)],
          ['Saldo pendiente', money(totales.saldo)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 65, 85] },
      })

      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 82

      autoTable(doc, {
        startY: finalY + 8,
        head: [['Erogación', 'Fecha', 'Empresa', 'Categoría', 'Crédito', 'Abonado', 'Saldo', 'Estado']],
        body: saldosFiltrados.map((row) => [
          `#${row.erogacion_id}`,
          formatDate(row.fecha),
          row.empresa || '—',
          row.categoria || '—',
          money(row.credito),
          money(row.abonado),
          money(row.saldo),
          row.estado_saldo,
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
      })

      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text('AGRO INDUSTRIAS RYB', 14, pageHeight - 8)
        doc.text(`Página ${i} de ${pages}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
      }

      doc.save(`deuda_proveedor_${proveedorId}_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4"><img src="/logo.png" alt="Logo Empresa" className="h-16" /></div>

      <h1 className="text-2xl font-bold mb-1">Detalle de proveedor</h1>
      <p className="text-sm text-gray-600 mb-4">
        Proveedor: <strong>{proveedor.nombre || `#${proveedorId}`}</strong> · NIT: {proveedor.nit || 'CF'} {proveedor.telefono ? `· Tel: ${proveedor.telefono}` : ''}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/erogacion/saldos" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">Volver a saldos</Link>
        <Link href={`/erogacion/saldos/abonos?proveedor_id=${proveedorId}&nombre=${encodeURIComponent(proveedor.nombre || '')}`} className="bg-teal-700 hover:bg-teal-800 text-white px-3 py-2 rounded text-sm">Ver abonos</Link>
        <button type="button" onClick={cargarDatos} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">{loading ? 'Cargando...' : 'Recargar'}</button>
        <button type="button" onClick={generarPDF} disabled={generandoPdf || loading} className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white px-3 py-2 rounded text-sm">{generandoPdf ? 'Generando...' : 'Reporte PDF'}</button>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-yellow-50">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Registrar abono o pago</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Modo
            <select value={pago.modo} onChange={(e) => setPago({ ...pago, modo: e.target.value as 'auto' | 'erogacion', erogacion_id: '' })} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="auto">Aplicar automático a deudas más antiguas</option>
              <option value="erogacion">Aplicar a erogación específica</option>
            </select>
          </label>

          {pago.modo === 'erogacion' && (
            <label className="text-sm">
              Erogación
              <select value={pago.erogacion_id} onChange={(e) => setPago({ ...pago, erogacion_id: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full">
                <option value="">Seleccionar</option>
                {saldos.filter((s) => toNum(s.saldo) > 0.009).map((s) => (
                  <option key={s.erogacion_id} value={s.erogacion_id}>#{s.erogacion_id} · {formatDate(s.fecha)} · saldo {money(s.saldo)}</option>
                ))}
              </select>
            </label>
          )}

          <label className="text-sm">
            Fecha pago
            <input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Monto
            <input type="number" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" placeholder="0.00" />
          </label>

          <label className="text-sm">
            Método
            <select value={pago.metodo_pago_id} onChange={(e) => setPago({ ...pago, metodo_pago_id: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Seleccionar</option>
              {metodos.map((m) => (<option key={m.id} value={m.id}>{m.metodo}</option>))}
            </select>
          </label>

          <label className="text-sm">
            Documento
            <input value={pago.documento} onChange={(e) => setPago({ ...pago, documento: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" placeholder="Cheque, depósito, transferencia..." />
          </label>

          <label className="text-sm md:col-span-2">
            Observaciones
            <input value={pago.observaciones} onChange={(e) => setPago({ ...pago, observaciones: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
        </div>

        <button type="button" onClick={registrarPago} disabled={loadingPago || loading} className="mt-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white px-4 py-2 rounded text-sm">
          {loadingPago ? 'Guardando...' : 'Registrar pago'}
        </button>
      </section>

      <section className="grid gap-3 md:grid-cols-4 mb-4">
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Erogaciones</div><div className="text-lg font-bold">{totales.registros}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Crédito</div><div className="text-lg font-bold">{money(totales.credito)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Abonado</div><div className="text-lg font-bold text-green-700">{money(totales.abonado)}</div></div>
        <div className="border rounded p-3 bg-white"><div className="text-xs text-gray-500">Saldo</div><div className="text-lg font-bold text-red-700">{money(totales.saldo)}</div></div>
      </section>

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Filtros del detalle</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">Estado
            <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="PENDIENTES">Pendientes</option>
              <option value="PARCIALES">Con abono parcial</option>
              <option value="PAGADAS">Pagadas</option>
              <option value="SOBREPAGADAS">Sobrepagadas</option>
              <option value="TODAS">Todas</option>
            </select>
          </label>
          <label className="text-sm">Desde
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
          <label className="text-sm">Hasta
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
          <label className="text-sm">ID erogación
            <input value={filtros.erogacion_id} onChange={(e) => setFiltros({ ...filtros, erogacion_id: e.target.value })} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
        </div>
      </section>

      <section className="border rounded-lg bg-white overflow-auto mb-5">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="border px-2 py-2 text-left">Erogación</th>
              <th className="border px-2 py-2 text-left">Fecha</th>
              <th className="border px-2 py-2 text-left">Empresa / División</th>
              <th className="border px-2 py-2 text-left">Categoría</th>
              <th className="border px-2 py-2 text-right">Crédito</th>
              <th className="border px-2 py-2 text-right">Abonado</th>
              <th className="border px-2 py-2 text-right">Saldo</th>
              <th className="border px-2 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {saldosFiltrados.map((row) => {
              const dets = detalles[row.erogacion_id] || []
              return (
                <tr key={row.erogacion_id} className="align-top">
                  <td className="border px-2 py-2 font-semibold">#{row.erogacion_id}</td>
                  <td className="border px-2 py-2">{formatDate(row.fecha)}</td>
                  <td className="border px-2 py-2">{row.empresa || '—'}<div className="text-xs text-gray-500">{row.division || '—'}</div></td>
                  <td className="border px-2 py-2">{row.categoria || '—'}</td>
                  <td className="border px-2 py-2 text-right">{money(row.credito)}</td>
                  <td className="border px-2 py-2 text-right text-green-700">{money(row.abonado)}</td>
                  <td className="border px-2 py-2 text-right font-bold text-red-700">{money(row.saldo)}</td>
                  <td className="border px-2 py-2">
                    {row.estado_saldo}
                    {dets.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-blue-700">Ver detalles</summary>
                        <div className="mt-1 space-y-1">
                          {dets.map((d) => {
                            const fp = asObj<{ metodo: string | null }>(d.forma_pago)
                            return (
                              <div key={d.id} className="border rounded p-1 bg-gray-50">
                                <strong>{d.concepto || 'Sin concepto'}</strong> · Cant. {toNum(d.cantidad)} · Importe {money(toNum(d.importe) || toNum(d.cantidad) * toNum(d.precio_unitario))}
                                <div>Pago original: {fp?.metodo || '—'} · Doc: {d.documento || '—'}</div>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              )
            })}
            {saldosFiltrados.length === 0 && <tr><td colSpan={8} className="border px-3 py-6 text-center text-gray-500">No hay erogaciones con los filtros seleccionados.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-3">Últimos abonos registrados</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-200">
              <tr>
                <th className="border px-2 py-2 text-left">Fecha pago</th>
                <th className="border px-2 py-2 text-left">Registrado</th>
                <th className="border px-2 py-2 text-left">Erogación</th>
                <th className="border px-2 py-2 text-right">Monto</th>
                <th className="border px-2 py-2 text-left">Documento</th>
              </tr>
            </thead>
            <tbody>
              {pagosRecientes.map((p) => (
                <tr key={p.id}>
                  <td className="border px-2 py-2">{formatDate(p.fecha)}</td>
                  <td className="border px-2 py-2">{formatDateTime(p.created_at)}</td>
                  <td className="border px-2 py-2">{p.erogacion_id ? `#${p.erogacion_id}` : 'General'}</td>
                  <td className="border px-2 py-2 text-right font-semibold">{money(p.monto)}</td>
                  <td className="border px-2 py-2">{p.documento || '—'}</td>
                </tr>
              ))}
              {pagosRecientes.length === 0 && <tr><td colSpan={5} className="border px-3 py-4 text-center text-gray-500">No hay abonos registrados para este proveedor.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function VistaProveedorPage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando...</div>}>
      <VistaProveedorInner />
    </Suspense>
  )
}
