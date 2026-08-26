'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
  estado: string
}

type Periodo = {
  id: number
  anio: number
  mes: number
  quincena: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

type Anticipo = {
  id: number
  empleado_id: number
  fecha: string
  monto: number
  periodo_id: number | null
  estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO'
  observaciones: string | null
  user_id: string | null
  created_at: string
}

type PlanillaEmpleado = {
  id: number
  periodo_id: number
  empleado_id: number
  estado: string
  fecha_pago: string | null
  observaciones: string | null
  user_id: string | null
  created_at: string
  updated_at: string
  editado_por: string | null
  editado_en: string | null
}

type PlanillaDetalle = {
  id: number
  planilla_empleado_id: number
  tipo: string
  concepto: string
  monto: number
  referencia_tabla: string | null
  referencia_id: number | null
  observaciones: string | null
  created_at: string
}

type AbonoAnticipo = {
  anticipo_id: number
  empleado_id: number
  empleado_codigo: string
  empleado_nombre: string
  fecha_anticipo: string
  monto_anticipo: number
  estado_anticipo: string
  abono_fecha: string
  abono_fecha_iso: string
  monto_abonado: number
  periodo_id: number | null
  periodo_texto: string
  registrado_por: string
  planilla_id: number | null
  detalle_id: number | null
  fuente: 'PLANILLA' | 'ESTADO_ANTICIPO'
  observaciones: string
}


const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function firstDayMonthISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-01`
}

function formatDate(fecha: string | null | undefined) {
  if (!fecha) return 'N/A'
  const value = String(fecha)
  const onlyDate = value.includes('T') ? value.slice(0, 10) : value.slice(0, 10)
  const parts = onlyDate.split('-')
  if (parts.length !== 3) return value
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/A'
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

function isoFromAny(value: string | null | undefined) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.toLocaleString('en-CA', { timeZone: 'America/Guatemala', year: 'numeric' })
  const m = d.toLocaleString('en-CA', { timeZone: 'America/Guatemala', month: '2-digit' })
  const day = d.toLocaleString('en-CA', { timeZone: 'America/Guatemala', day: '2-digit' })
  return `${y}-${m}-${day}`
}

function fileStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function cleanFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'reporte'
}

async function getImageDataUrl(src: string) {
  try {
    const res = await fetch(src)
    const blob = await res.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error('No se pudo cargar el logo para el PDF', error)
    return ''
  }
}

function addPdfFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Tech Nine', 14, pageHeight - 10)
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' })
  }
}

async function fetchAll(table: string, select: string, orderColumn?: string, ascending = true) {
  const rows: Record<string, unknown>[] = []
  const pageSize = 1000

  for (let from = 0; from < 20000; from += pageSize) {
    let query: any = supabase.from(table).select(select)
    if (orderColumn) query = query.order(orderColumn, { ascending })
    const { data, error } = await query.range(from, from + pageSize - 1)

    if (error) throw new Error(`Error cargando ${table}: ${error.message}`)

    const pageRows = (data || []) as Record<string, unknown>[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break
  }

  return rows
}

function periodoLabel(p?: Periodo) {
  if (!p) return 'Sin período'
  return `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${p.fecha_inicio} a ${p.fecha_fin})`
}

function userLabel(userId: string | null | undefined, profiles: Map<string, string>, editadoPor?: string | null) {
  if (editadoPor && editadoPor.trim()) return editadoPor
  if (userId && profiles.get(userId)) return profiles.get(userId) || userId
  return userId || 'N/A'
}


export default function ReporteAnticiposAbonosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [anticipos, setAnticipos] = useState<Anticipo[]>([])
  const [planillas, setPlanillas] = useState<PlanillaEmpleado[]>([])
  const [detalles, setDetalles] = useState<PlanillaDetalle[]>([])
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map())
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('TODOS')
  const [fuenteFiltro, setFuenteFiltro] = useState('TODAS')
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [desdeAnticipo, setDesdeAnticipo] = useState('')
  const [hastaAnticipo, setHastaAnticipo] = useState('')
  const [desdeAbono, setDesdeAbono] = useState(firstDayMonthISO())
  const [hastaAbono, setHastaAbono] = useState(todayISO())
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const empleadoMap = useMemo(() => {
    const map = new Map<number, Empleado>()
    empleados.forEach((e) => map.set(e.id, e))
    return map
  }, [empleados])

  const periodoMap = useMemo(() => {
    const map = new Map<number, Periodo>()
    periodos.forEach((p) => map.set(p.id, p))
    return map
  }, [periodos])

  const planillaMap = useMemo(() => {
    const map = new Map<number, PlanillaEmpleado>()
    planillas.forEach((p) => map.set(p.id, p))
    return map
  }, [planillas])

  const abonos = useMemo(() => {
    const rows: AbonoAnticipo[] = []
    const anticiposMap = new Map<number, Anticipo>()
    anticipos.forEach((a) => anticiposMap.set(a.id, a))

    detalles
      .filter((d) => {
        const ref = String(d.referencia_tabla || '').toLowerCase()
        const concepto = String(d.concepto || '').toLowerCase()
        return d.tipo === 'DESCUENTO' && (ref.includes('anticipo') || concepto.includes('anticipo'))
      })
      .forEach((d) => {
        const ant = d.referencia_id ? anticiposMap.get(Number(d.referencia_id)) : undefined
        if (!ant) return

        const emp = empleadoMap.get(ant.empleado_id)
        const planilla = planillaMap.get(d.planilla_empleado_id)
        const periodo = planilla?.periodo_id ? periodoMap.get(planilla.periodo_id) : ant.periodo_id ? periodoMap.get(ant.periodo_id) : undefined

        rows.push({
          anticipo_id: ant.id,
          empleado_id: ant.empleado_id,
          empleado_codigo: emp?.codigo || String(ant.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          fecha_anticipo: ant.fecha,
          monto_anticipo: toNum(ant.monto),
          estado_anticipo: ant.estado,
          abono_fecha: d.created_at,
          abono_fecha_iso: isoFromAny(d.created_at),
          monto_abonado: toNum(d.monto),
          periodo_id: periodo?.id || null,
          periodo_texto: periodoLabel(periodo),
          registrado_por: userLabel(planilla?.user_id || null, profiles, planilla?.editado_por),
          planilla_id: planilla?.id || null,
          detalle_id: d.id,
          fuente: 'PLANILLA',
          observaciones: d.observaciones || planilla?.observaciones || ant.observaciones || '',
        })
      })

    const conDetalle = new Set(rows.map((r) => r.anticipo_id))

    anticipos
      .filter((a) => a.estado === 'APLICADO' && !conDetalle.has(a.id))
      .forEach((a) => {
        const emp = empleadoMap.get(a.empleado_id)
        const periodo = a.periodo_id ? periodoMap.get(a.periodo_id) : undefined
        const fecha = periodo?.fecha_fin || a.created_at

        rows.push({
          anticipo_id: a.id,
          empleado_id: a.empleado_id,
          empleado_codigo: emp?.codigo || String(a.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          fecha_anticipo: a.fecha,
          monto_anticipo: toNum(a.monto),
          estado_anticipo: a.estado,
          abono_fecha: fecha,
          abono_fecha_iso: isoFromAny(fecha),
          monto_abonado: toNum(a.monto),
          periodo_id: a.periodo_id,
          periodo_texto: periodoLabel(periodo),
          registrado_por: userLabel(a.user_id, profiles),
          planilla_id: null,
          detalle_id: null,
          fuente: 'ESTADO_ANTICIPO',
          observaciones: a.observaciones || 'Aplicado sin detalle de planilla vinculado.',
        })
      })

    return rows.sort((a, b) => String(b.abono_fecha).localeCompare(String(a.abono_fecha)))
  }, [anticipos, detalles, empleadoMap, periodoMap, planillaMap, profiles])

  const abonosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return abonos.filter((a) => {
      const texto = `${a.empleado_codigo} ${a.empleado_nombre} ${a.anticipo_id} ${a.registrado_por} ${a.observaciones}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (estadoFiltro !== 'TODOS' && a.estado_anticipo !== estadoFiltro) return false
      if (fuenteFiltro !== 'TODAS' && a.fuente !== fuenteFiltro) return false
      if (periodoFiltro && String(a.periodo_id || '') !== periodoFiltro) return false
      if (desdeAnticipo && a.fecha_anticipo < desdeAnticipo) return false
      if (hastaAnticipo && a.fecha_anticipo > hastaAnticipo) return false
      if (desdeAbono && a.abono_fecha_iso < desdeAbono) return false
      if (hastaAbono && a.abono_fecha_iso > hastaAbono) return false
      return true
    })
  }, [abonos, busqueda, estadoFiltro, fuenteFiltro, periodoFiltro, desdeAnticipo, hastaAnticipo, desdeAbono, hastaAbono])

  const resumen = useMemo(() => {
    const empleadosUnicos = new Set(abonosFiltrados.map((a) => a.empleado_id))
    return {
      movimientos: abonosFiltrados.length,
      empleados: empleadosUnicos.size,
      abonado: abonosFiltrados.reduce((acc, a) => acc + toNum(a.monto_abonado), 0),
      desde: desdeAbono || 'Sin inicio',
      hasta: hastaAbono || 'Sin fin',
    }
  }, [abonosFiltrados, desdeAbono, hastaAbono])

  const cargarDatos = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const [empRows, periodoRows, anticipoRows, planillaRows, detalleRows] = await Promise.all([
        fetchAll('rrhh_empleados', 'id,codigo,nombre_completo,estado', 'nombre_completo', true),
        fetchAll('rrhh_periodos_planilla', 'id,anio,mes,quincena,fecha_inicio,fecha_fin,estado', 'fecha_inicio', false),
        fetchAll('rrhh_anticipos', 'id,empleado_id,fecha,monto,periodo_id,estado,observaciones,user_id,created_at', 'fecha', false),
        fetchAll('rrhh_planilla_empleado', 'id,periodo_id,empleado_id,estado,fecha_pago,observaciones,user_id,created_at,updated_at,editado_por,editado_en', 'created_at', false),
        fetchAll('rrhh_planilla_detalle', 'id,planilla_empleado_id,tipo,concepto,monto,referencia_tabla,referencia_id,observaciones,created_at', 'created_at', false),
      ])

      setEmpleados(empRows as Empleado[])
      setPeriodos(periodoRows as Periodo[])
      setAnticipos(anticipoRows as Anticipo[])
      setPlanillas(planillaRows as PlanillaEmpleado[])
      setDetalles(detalleRows as PlanillaDetalle[])

      const { data: profileData, error: profileError } = await supabase.from('profiles').select('id,email')
      if (!profileError) {
        const map = new Map<string, string>()
        ;((profileData || []) as { id: string; email: string | null }[]).forEach((p) => {
          if (p.email) map.set(p.id, p.email)
        })
        setProfiles(map)
      }
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando reporte.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generarPDF = async () => {
    if (abonosFiltrados.length === 0) {
      setMensaje('No hay abonos para generar PDF con los filtros actuales.')
      return
    }

    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF('p', 'mm', 'letter')
      const logo = await getImageDataUrl(RRHH_LOGO_URL)
      const pageWidth = doc.internal.pageSize.getWidth()

      if (logo) doc.addImage(logo, 'PNG', pageWidth / 2 - 14, 8, 28, 20)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(15)
      doc.text('Reporte detallado de abonos a anticipos', 14, 36)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Rango abono: ${resumen.desde} a ${resumen.hasta}`, 14, 43)
      doc.text(`Generado: ${formatDateTime(new Date().toISOString())}`, 14, 48)

      autoTable(doc, {
        startY: 54,
        head: [['Resumen', 'Valor']],
        body: [
          ['Movimientos', String(resumen.movimientos)],
          ['Empleados', String(resumen.empleados)],
          ['Total abonado/aplicado', money(resumen.abonado)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 118, 110] },
      })

      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 75

      autoTable(doc, {
        startY: finalY + 8,
        head: [['Fecha/hora abono', 'Empleado', 'Anticipo', 'Fecha anticipo', 'Monto abono', 'Período', 'Registró', 'Fuente']],
        body: abonosFiltrados.map((a) => [
          formatDateTime(a.abono_fecha),
          `${a.empleado_codigo} - ${a.empleado_nombre}`,
          `#${a.anticipo_id}`,
          formatDate(a.fecha_anticipo),
          money(a.monto_abonado),
          a.periodo_texto,
          a.registrado_por,
          a.fuente === 'PLANILLA' ? `Planilla ${a.planilla_id || ''}` : 'Estado aplicado',
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [15, 118, 110] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 38 },
          2: { cellWidth: 16 },
          3: { cellWidth: 20 },
          4: { halign: 'right', cellWidth: 20 },
          5: { cellWidth: 34 },
          6: { cellWidth: 30 },
          7: { cellWidth: 22 },
        },
      })

      addPdfFooter(doc)
      doc.save(`reporte_abonos_anticipos_${cleanFilePart(busqueda || 'general')}_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src={RRHH_LOGO_URL} alt="Logo Empresa" className="h-14" />
      </div>

      <h1 className="text-2xl font-bold mb-1">Abonos de anticipos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Reporte detallado de cada anticipo aplicado/descontado, con fecha, hora, monto, usuario y período.
      </p>

      <div className="flex gap-2 mb-4">
        <Link href="/rrhh" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">Volver a RRHH</Link>
        <Link href="/rrhh/anticipos" className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm">Registrar anticipos</Link>
        <button type="button" onClick={cargarDatos} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm" disabled={loading}>
          {loading ? 'Cargando...' : 'Recargar'}
        </button>
        <button type="button" onClick={generarPDF} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm" disabled={generandoPdf || loading}>
          {generandoPdf ? 'Generando...' : 'Reporte PDF'}
        </button>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-yellow-50">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            Buscar empleado / usuario / anticipo
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" placeholder="Nombre, código, # anticipo..." />
          </label>

          <label className="text-sm">
            Estado anticipo
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="APLICADO">Aplicado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </label>

          <label className="text-sm">
            Fuente
            <select value={fuenteFiltro} onChange={(e) => setFuenteFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODAS">Todas</option>
              <option value="PLANILLA">Detalle de planilla</option>
              <option value="ESTADO_ANTICIPO">Aplicado sin detalle</option>
            </select>
          </label>

          <label className="text-sm">
            Período
            <select value={periodoFiltro} onChange={(e) => setPeriodoFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Todos</option>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>{periodoLabel(p)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Anticipo desde
            <input type="date" value={desdeAnticipo} onChange={(e) => setDesdeAnticipo(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Anticipo hasta
            <input type="date" value={hastaAnticipo} onChange={(e) => setHastaAnticipo(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Abono desde
            <input type="date" value={desdeAbono} onChange={(e) => setDesdeAbono(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Abono hasta
            <input type="date" value={hastaAbono} onChange={(e) => setHastaAbono(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setBusqueda('')
              setEstadoFiltro('TODOS')
              setFuenteFiltro('TODAS')
              setPeriodoFiltro('')
              setDesdeAnticipo('')
              setHastaAnticipo('')
              setDesdeAbono('')
              setHastaAbono('')
            }}
            className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 mb-4">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Movimientos</div>
          <div className="text-xl font-bold">{resumen.movimientos}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Empleados</div>
          <div className="text-xl font-bold">{resumen.empleados}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total abonado/aplicado</div>
          <div className="text-xl font-bold text-green-700">{money(resumen.abonado)}</div>
        </div>
      </section>

      <section className="border rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="border px-2 py-2 text-left">Fecha/hora abono</th>
              <th className="border px-2 py-2 text-left">Empleado</th>
              <th className="border px-2 py-2 text-left">Anticipo</th>
              <th className="border px-2 py-2 text-right">Monto anticipo</th>
              <th className="border px-2 py-2 text-right">Monto abonado</th>
              <th className="border px-2 py-2 text-left">Período</th>
              <th className="border px-2 py-2 text-left">Registró</th>
              <th className="border px-2 py-2 text-left">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {abonosFiltrados.map((a) => (
              <tr key={`${a.fuente}-${a.detalle_id || a.anticipo_id}`}>
                <td className="border px-2 py-2">{formatDateTime(a.abono_fecha)}</td>
                <td className="border px-2 py-2">{a.empleado_codigo} - {a.empleado_nombre}</td>
                <td className="border px-2 py-2">
                  #{a.anticipo_id}
                  <div className="text-xs text-gray-500">Fecha: {formatDate(a.fecha_anticipo)} / Estado: {a.estado_anticipo}</div>
                </td>
                <td className="border px-2 py-2 text-right">{money(a.monto_anticipo)}</td>
                <td className="border px-2 py-2 text-right font-semibold">{money(a.monto_abonado)}</td>
                <td className="border px-2 py-2">{a.periodo_texto}</td>
                <td className="border px-2 py-2">{a.registrado_por}</td>
                <td className="border px-2 py-2">
                  {a.observaciones || '—'}
                  <div className="text-xs text-gray-500">
                    {a.fuente === 'PLANILLA' ? `Planilla ${a.planilla_id} / Detalle ${a.detalle_id}` : 'Aplicado sin detalle de planilla'}
                  </div>
                </td>
              </tr>
            ))}

            {abonosFiltrados.length === 0 && (
              <tr>
                <td colSpan={8} className="border px-3 py-6 text-center text-gray-500">
                  No hay abonos de anticipos con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
