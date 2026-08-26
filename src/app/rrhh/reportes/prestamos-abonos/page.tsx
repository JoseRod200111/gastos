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

type Prestamo = {
  id: number
  empleado_id: number
  fecha: string
  monto_total: number
  numero_cuotas: number
  observaciones: string | null
  estado: 'ACTIVO' | 'PAGADO' | 'ANULADO'
  user_id: string | null
  created_at: string
}

type Cuota = {
  id: number
  prestamo_id: number
  numero_cuota: number
  periodo_id: number | null
  monto: number
  estado: 'PENDIENTE' | 'APLICADA' | 'ANULADA'
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

type AbonoPrestamo = {
  prestamo_id: number
  cuota_id: number
  numero_cuota: number
  empleado_id: number
  empleado_codigo: string
  empleado_nombre: string
  fecha_prestamo: string
  monto_prestamo: number
  estado_prestamo: string
  estado_cuota: string
  abono_fecha: string
  abono_fecha_iso: string
  monto_abonado: number
  periodo_id: number | null
  periodo_texto: string
  registrado_por: string
  planilla_id: number | null
  detalle_id: number | null
  fuente: 'PLANILLA' | 'ESTADO_CUOTA'
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


export default function ReportePrestamosAbonosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [planillas, setPlanillas] = useState<PlanillaEmpleado[]>([])
  const [detalles, setDetalles] = useState<PlanillaDetalle[]>([])
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map())
  const [busqueda, setBusqueda] = useState('')
  const [estadoPrestamoFiltro, setEstadoPrestamoFiltro] = useState('TODOS')
  const [estadoCuotaFiltro, setEstadoCuotaFiltro] = useState('APLICADA')
  const [fuenteFiltro, setFuenteFiltro] = useState('TODAS')
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [desdePrestamo, setDesdePrestamo] = useState('')
  const [hastaPrestamo, setHastaPrestamo] = useState('')
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

  const prestamoMap = useMemo(() => {
    const map = new Map<number, Prestamo>()
    prestamos.forEach((p) => map.set(p.id, p))
    return map
  }, [prestamos])

  const cuotaMap = useMemo(() => {
    const map = new Map<number, Cuota>()
    cuotas.forEach((c) => map.set(c.id, c))
    return map
  }, [cuotas])

  const abonos = useMemo(() => {
    const rows: AbonoPrestamo[] = []

    detalles
      .filter((d) => {
        const ref = String(d.referencia_tabla || '').toLowerCase()
        const concepto = String(d.concepto || '').toLowerCase()
        return d.tipo === 'DESCUENTO' && (ref.includes('prestamo') || ref.includes('préstamo') || concepto.includes('prestamo') || concepto.includes('préstamo'))
      })
      .forEach((d) => {
        const cuota = d.referencia_id ? cuotaMap.get(Number(d.referencia_id)) : undefined
        if (!cuota) return
        const prestamo = prestamoMap.get(cuota.prestamo_id)
        if (!prestamo) return

        const emp = empleadoMap.get(prestamo.empleado_id)
        const planilla = planillaMap.get(d.planilla_empleado_id)
        const periodo = planilla?.periodo_id ? periodoMap.get(planilla.periodo_id) : cuota.periodo_id ? periodoMap.get(cuota.periodo_id) : undefined

        rows.push({
          prestamo_id: prestamo.id,
          cuota_id: cuota.id,
          numero_cuota: cuota.numero_cuota,
          empleado_id: prestamo.empleado_id,
          empleado_codigo: emp?.codigo || String(prestamo.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          fecha_prestamo: prestamo.fecha,
          monto_prestamo: toNum(prestamo.monto_total),
          estado_prestamo: prestamo.estado,
          estado_cuota: cuota.estado,
          abono_fecha: d.created_at,
          abono_fecha_iso: isoFromAny(d.created_at),
          monto_abonado: toNum(d.monto),
          periodo_id: periodo?.id || null,
          periodo_texto: periodoLabel(periodo),
          registrado_por: userLabel(planilla?.user_id || null, profiles, planilla?.editado_por),
          planilla_id: planilla?.id || null,
          detalle_id: d.id,
          fuente: 'PLANILLA',
          observaciones: d.observaciones || planilla?.observaciones || prestamo.observaciones || '',
        })
      })

    const cuotasConDetalle = new Set(rows.map((r) => r.cuota_id))

    cuotas
      .filter((c) => c.estado === 'APLICADA' && !cuotasConDetalle.has(c.id))
      .forEach((c) => {
        const prestamo = prestamoMap.get(c.prestamo_id)
        if (!prestamo) return
        const emp = empleadoMap.get(prestamo.empleado_id)
        const periodo = c.periodo_id ? periodoMap.get(c.periodo_id) : undefined
        const fecha = periodo?.fecha_fin || c.created_at

        rows.push({
          prestamo_id: prestamo.id,
          cuota_id: c.id,
          numero_cuota: c.numero_cuota,
          empleado_id: prestamo.empleado_id,
          empleado_codigo: emp?.codigo || String(prestamo.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          fecha_prestamo: prestamo.fecha,
          monto_prestamo: toNum(prestamo.monto_total),
          estado_prestamo: prestamo.estado,
          estado_cuota: c.estado,
          abono_fecha: fecha,
          abono_fecha_iso: isoFromAny(fecha),
          monto_abonado: toNum(c.monto),
          periodo_id: c.periodo_id,
          periodo_texto: periodoLabel(periodo),
          registrado_por: userLabel(prestamo.user_id, profiles),
          planilla_id: null,
          detalle_id: null,
          fuente: 'ESTADO_CUOTA',
          observaciones: prestamo.observaciones || 'Cuota aplicada sin detalle de planilla vinculado.',
        })
      })

    return rows.sort((a, b) => String(b.abono_fecha).localeCompare(String(a.abono_fecha)))
  }, [cuotas, detalles, empleadoMap, periodoMap, planillaMap, prestamoMap, cuotaMap, profiles])

  const abonosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return abonos.filter((a) => {
      const texto = `${a.empleado_codigo} ${a.empleado_nombre} ${a.prestamo_id} ${a.cuota_id} ${a.registrado_por} ${a.observaciones}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (estadoPrestamoFiltro !== 'TODOS' && a.estado_prestamo !== estadoPrestamoFiltro) return false
      if (estadoCuotaFiltro !== 'TODOS' && a.estado_cuota !== estadoCuotaFiltro) return false
      if (fuenteFiltro !== 'TODAS' && a.fuente !== fuenteFiltro) return false
      if (periodoFiltro && String(a.periodo_id || '') !== periodoFiltro) return false
      if (desdePrestamo && a.fecha_prestamo < desdePrestamo) return false
      if (hastaPrestamo && a.fecha_prestamo > hastaPrestamo) return false
      if (desdeAbono && a.abono_fecha_iso < desdeAbono) return false
      if (hastaAbono && a.abono_fecha_iso > hastaAbono) return false
      return true
    })
  }, [abonos, busqueda, estadoPrestamoFiltro, estadoCuotaFiltro, fuenteFiltro, periodoFiltro, desdePrestamo, hastaPrestamo, desdeAbono, hastaAbono])

  const resumen = useMemo(() => {
    const empleadosUnicos = new Set(abonosFiltrados.map((a) => a.empleado_id))
    const prestamosUnicos = new Set(abonosFiltrados.map((a) => a.prestamo_id))
    return {
      movimientos: abonosFiltrados.length,
      empleados: empleadosUnicos.size,
      prestamos: prestamosUnicos.size,
      abonado: abonosFiltrados.reduce((acc, a) => acc + toNum(a.monto_abonado), 0),
      desde: desdeAbono || 'Sin inicio',
      hasta: hastaAbono || 'Sin fin',
    }
  }, [abonosFiltrados, desdeAbono, hastaAbono])

  const cargarDatos = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const [empRows, periodoRows, prestamoRows, cuotaRows, planillaRows, detalleRows] = await Promise.all([
        fetchAll('rrhh_empleados', 'id,codigo,nombre_completo,estado', 'nombre_completo', true),
        fetchAll('rrhh_periodos_planilla', 'id,anio,mes,quincena,fecha_inicio,fecha_fin,estado', 'fecha_inicio', false),
        fetchAll('rrhh_prestamos', 'id,empleado_id,fecha,monto_total,numero_cuotas,observaciones,estado,user_id,created_at', 'fecha', false),
        fetchAll('rrhh_prestamo_cuotas', 'id,prestamo_id,numero_cuota,periodo_id,monto,estado,created_at', 'id', false),
        fetchAll('rrhh_planilla_empleado', 'id,periodo_id,empleado_id,estado,fecha_pago,observaciones,user_id,created_at,updated_at,editado_por,editado_en', 'created_at', false),
        fetchAll('rrhh_planilla_detalle', 'id,planilla_empleado_id,tipo,concepto,monto,referencia_tabla,referencia_id,observaciones,created_at', 'created_at', false),
      ])

      setEmpleados(empRows as Empleado[])
      setPeriodos(periodoRows as Periodo[])
      setPrestamos(prestamoRows as Prestamo[])
      setCuotas(cuotaRows as Cuota[])
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
      doc.text('Reporte detallado de abonos a préstamos', 14, 36)

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
          ['Préstamos incluidos', String(resumen.prestamos)],
          ['Total abonado/aplicado', money(resumen.abonado)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [126, 34, 206] },
      })

      const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 75

      autoTable(doc, {
        startY: finalY + 8,
        head: [['Fecha/hora abono', 'Empleado', 'Préstamo', 'Cuota', 'Monto abono', 'Período', 'Registró', 'Fuente']],
        body: abonosFiltrados.map((a) => [
          formatDateTime(a.abono_fecha),
          `${a.empleado_codigo} - ${a.empleado_nombre}`,
          `#${a.prestamo_id}`,
          `${a.numero_cuota}`,
          money(a.monto_abonado),
          a.periodo_texto,
          a.registrado_por,
          a.fuente === 'PLANILLA' ? `Planilla ${a.planilla_id || ''}` : 'Cuota aplicada',
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [126, 34, 206] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 38 },
          2: { cellWidth: 18 },
          3: { cellWidth: 14 },
          4: { halign: 'right', cellWidth: 20 },
          5: { cellWidth: 34 },
          6: { cellWidth: 30 },
          7: { cellWidth: 22 },
        },
      })

      addPdfFooter(doc)
      doc.save(`reporte_abonos_prestamos_${cleanFilePart(busqueda || 'general')}_${fileStamp()}.pdf`)
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

      <h1 className="text-2xl font-bold mb-1">Abonos de préstamos</h1>
      <p className="text-sm text-gray-600 mb-4">
        Reporte detallado de cada cuota aplicada/descontada, con fecha, hora, monto, usuario y período.
      </p>

      <div className="flex gap-2 mb-4">
        <Link href="/rrhh" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">Volver a RRHH</Link>
        <Link href="/rrhh/prestamos" className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm">Registrar préstamos</Link>
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
            Buscar empleado / usuario / préstamo
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" placeholder="Nombre, código, # préstamo..." />
          </label>

          <label className="text-sm">
            Estado préstamo
            <select value={estadoPrestamoFiltro} onChange={(e) => setEstadoPrestamoFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="PAGADO">Pagado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </label>

          <label className="text-sm">
            Estado cuota
            <select value={estadoCuotaFiltro} onChange={(e) => setEstadoCuotaFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODOS">Todas</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="APLICADA">Aplicada</option>
              <option value="ANULADA">Anulada</option>
            </select>
          </label>

          <label className="text-sm">
            Fuente
            <select value={fuenteFiltro} onChange={(e) => setFuenteFiltro(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODAS">Todas</option>
              <option value="PLANILLA">Detalle de planilla</option>
              <option value="ESTADO_CUOTA">Cuota aplicada sin detalle</option>
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
            Préstamo desde
            <input type="date" value={desdePrestamo} onChange={(e) => setDesdePrestamo(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Préstamo hasta
            <input type="date" value={hastaPrestamo} onChange={(e) => setHastaPrestamo(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Abono hasta
            <input type="date" value={hastaAbono} onChange={(e) => setHastaAbono(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>

          <label className="text-sm">
            Abono desde
            <input type="date" value={desdeAbono} onChange={(e) => setDesdeAbono(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setBusqueda('')
              setEstadoPrestamoFiltro('TODOS')
              setEstadoCuotaFiltro('APLICADA')
              setFuenteFiltro('TODAS')
              setPeriodoFiltro('')
              setDesdePrestamo('')
              setHastaPrestamo('')
              setDesdeAbono('')
              setHastaAbono('')
            }}
            className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4 mb-4">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Movimientos</div>
          <div className="text-xl font-bold">{resumen.movimientos}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Empleados</div>
          <div className="text-xl font-bold">{resumen.empleados}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Préstamos</div>
          <div className="text-xl font-bold">{resumen.prestamos}</div>
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
              <th className="border px-2 py-2 text-left">Préstamo</th>
              <th className="border px-2 py-2 text-center">Cuota</th>
              <th className="border px-2 py-2 text-right">Monto préstamo</th>
              <th className="border px-2 py-2 text-right">Monto abonado</th>
              <th className="border px-2 py-2 text-left">Período</th>
              <th className="border px-2 py-2 text-left">Registró</th>
              <th className="border px-2 py-2 text-left">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {abonosFiltrados.map((a) => (
              <tr key={`${a.fuente}-${a.detalle_id || a.cuota_id}`}>
                <td className="border px-2 py-2">{formatDateTime(a.abono_fecha)}</td>
                <td className="border px-2 py-2">{a.empleado_codigo} - {a.empleado_nombre}</td>
                <td className="border px-2 py-2">
                  #{a.prestamo_id}
                  <div className="text-xs text-gray-500">Fecha: {formatDate(a.fecha_prestamo)} / Estado: {a.estado_prestamo}</div>
                </td>
                <td className="border px-2 py-2 text-center">
                  {a.numero_cuota}
                  <div className="text-xs text-gray-500">{a.estado_cuota}</div>
                </td>
                <td className="border px-2 py-2 text-right">{money(a.monto_prestamo)}</td>
                <td className="border px-2 py-2 text-right font-semibold">{money(a.monto_abonado)}</td>
                <td className="border px-2 py-2">{a.periodo_texto}</td>
                <td className="border px-2 py-2">{a.registrado_por}</td>
                <td className="border px-2 py-2">
                  {a.observaciones || '—'}
                  <div className="text-xs text-gray-500">
                    {a.fuente === 'PLANILLA' ? `Planilla ${a.planilla_id} / Detalle ${a.detalle_id}` : 'Cuota aplicada sin detalle de planilla'}
                  </div>
                </td>
              </tr>
            ))}

            {abonosFiltrados.length === 0 && (
              <tr>
                <td colSpan={9} className="border px-3 py-6 text-center text-gray-500">
                  No hay abonos de préstamos con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
