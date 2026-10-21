'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'


const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'
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
  created_at: string
  empleado_codigo: string
  empleado_nombre: string
}

type Cuota = {
  id: number
  prestamo_id: number
  numero_cuota: number
  periodo_id: number | null
  monto: number
  estado: 'PENDIENTE' | 'APLICADA' | 'ANULADA'
  periodo_texto: string
}

type FormState = {
  empleado_id: string
  fecha: string
  monto_total: string
  numero_cuotas: string
  inicio_anio: string
  inicio_mes: string
  inicio_quincena: string
  observaciones: string
}

type EditCuotaState = {
  id: number
  monto: string
  periodo_id: string
}

const emptyForm = (): FormState => ({
  empleado_id: '',
  fecha: todayISO(),
  monto_total: '',
  numero_cuotas: '1',
  inicio_anio: String(new Date().getFullYear()),
  inicio_mes: String(new Date().getMonth() + 1),
  inicio_quincena: new Date().getDate() <= 15 ? '1' : '2',
  observaciones: '',
})

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const periodoLabel = (p: Periodo) => `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${p.fecha_inicio} a ${p.fecha_fin})`

function formatDate(fecha: string) {
  if (!fecha) return 'N/A'
  const parts = fecha.split('-')
  if (parts.length !== 3) return fecha
  return `${parts[2]}/${parts[1]}/${parts[0]}`
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

export default function RrhhPrestamosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editCuotas, setEditCuotas] = useState<Record<number, EditCuotaState>>({})
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('ACTIVO')
  const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState<string | null>(null)

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

  const cuotasPorPrestamo = useMemo(() => {
    const map = new Map<number, Cuota[]>()
    cuotas.forEach((c) => {
      const arr = map.get(c.prestamo_id) || []
      arr.push(c)
      map.set(c.prestamo_id, arr)
    })
    map.forEach((arr) => arr.sort((a, b) => a.numero_cuota - b.numero_cuota))
    return map
  }, [cuotas])

  const prestamosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return prestamos.filter((p) => {
      const texto = `${p.empleado_codigo} ${p.empleado_nombre} ${p.observaciones || ''}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (estadoFiltro !== 'TODOS' && p.estado !== estadoFiltro) return false
      return true
    })
  }, [prestamos, busqueda, estadoFiltro])

  const resumen = useMemo(() => {
    return prestamosFiltrados.reduce(
      (acc, p) => {
        acc.total += toNum(p.monto_total)
        if (p.estado === 'ACTIVO') acc.activo += toNum(p.monto_total)
        if (p.estado === 'PAGADO') acc.pagado += toNum(p.monto_total)
        if (p.estado === 'ANULADO') acc.anulado += toNum(p.monto_total)
        return acc
      },
      { total: 0, activo: 0, pagado: 0, anulado: 0 }
    )
  }, [prestamosFiltrados])

  const cargarCatalogos = async () => {
    const [empRes, perRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select('id,codigo,nombre_completo,estado')
        .order('nombre_completo', { ascending: true }),
      supabase
        .from('rrhh_periodos_planilla')
        .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
        .order('quincena', { ascending: false }),
    ])

    if (empRes.error) throw new Error(`Error cargando empleados: ${empRes.error.message}`)
    if (perRes.error) throw new Error(`Error cargando períodos: ${perRes.error.message}`)

    setEmpleados((empRes.data || []) as Empleado[])
    setPeriodos((perRes.data || []) as Periodo[])
  }

  const cargarPrestamos = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const [prestRes, cuotaRes] = await Promise.all([
        supabase
          .from('rrhh_prestamos')
          .select('id,empleado_id,fecha,monto_total,numero_cuotas,observaciones,estado,created_at')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
        supabase
          .from('rrhh_prestamo_cuotas')
          .select('id,prestamo_id,numero_cuota,periodo_id,monto,estado')
          .order('prestamo_id', { ascending: false })
          .order('numero_cuota', { ascending: true }),
      ])

      if (prestRes.error) throw new Error(`Error cargando préstamos: ${prestRes.error.message}`)
      if (cuotaRes.error) throw new Error(`Error cargando cuotas: ${cuotaRes.error.message}`)

      const prestRows = ((prestRes.data || []) as {
        id: number
        empleado_id: number
        fecha: string
        monto_total: number
        numero_cuotas: number
        observaciones: string | null
        estado: Prestamo['estado']
        created_at: string
      }[]).map((row) => {
        const emp = empleadoMap.get(Number(row.empleado_id))
        return {
          ...row,
          empleado_codigo: emp?.codigo || String(row.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
        }
      })

      const cuotaRows = ((cuotaRes.data || []) as {
        id: number
        prestamo_id: number
        numero_cuota: number
        periodo_id: number | null
        monto: number
        estado: Cuota['estado']
      }[]).map((row) => {
        const periodo = row.periodo_id ? periodoMap.get(Number(row.periodo_id)) : undefined
        return {
          ...row,
          periodo_texto: periodo ? periodoLabel(periodo) : 'Sin período fijo',
        }
      })

      const edits: Record<number, EditCuotaState> = {}
      cuotaRows.forEach((c) => {
        edits[c.id] = {
          id: c.id,
          monto: String(c.monto),
          periodo_id: c.periodo_id ? String(c.periodo_id) : '',
        }
      })

      setPrestamos(prestRows)
      setCuotas(cuotaRows)
      setEditCuotas(edits)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando préstamos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
      .then(() => cargarPrestamos())
      .catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error cargando página.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (empleados.length > 0) {
      cargarPrestamos().catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error recargando préstamos.')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleados, periodos])

  const guardarPrestamo = async () => {
    setMensaje('')

    if (!form.empleado_id) {
      alert('Selecciona un empleado.')
      return
    }

    if (!form.fecha) {
      alert('Selecciona la fecha del préstamo.')
      return
    }

    const montoTotal = round2(toNum(form.monto_total))
    const numeroCuotas = Number(form.numero_cuotas)

    if (montoTotal <= 0 || !Number.isFinite(montoTotal)) {
      alert('El monto total debe ser mayor que 0.')
      return
    }

    if (!Number.isInteger(numeroCuotas) || numeroCuotas <= 0 || numeroCuotas > 120) {
      alert('El numero de cuotas debe ser un entero entre 1 y 120.')
      return
    }

    setSaving(true)

    try {
      // Un unico RPC crea prestamo, quincenas y cuotas en una transaccion.
      const { error } = await supabase.rpc('rrhh_crear_prestamo_con_cuotas', {
        p_empleado_id: Number(form.empleado_id),
        p_fecha: form.fecha,
        p_monto_total: montoTotal,
        p_numero_cuotas: numeroCuotas,
        p_anio: Number(form.inicio_anio),
        p_mes: Number(form.inicio_mes),
        p_quincena: Number(form.inicio_quincena),
        p_observaciones: form.observaciones.trim() || null,
      })
      if (error) throw new Error(`No se guardo el prestamo: ${error.message}`)

      setForm(emptyForm())
      await cargarCatalogos()
      await cargarPrestamos()
      setMensaje('Préstamo creado correctamente.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error guardando préstamo.')
    } finally {
      setSaving(false)
    }
  }

  const anularPrestamo = async (prestamo: Prestamo) => {
    if (prestamo.estado !== 'ACTIVO') return
    if (!confirm(`¿Anular el prestamo #${prestamo.id}? Solo es posible si ninguna cuota fue cobrada. Se conservara el historial.`)) return
    setSaving(true)
    setMensaje('')
    try {
      const { error } = await supabase.rpc('rrhh_anular_prestamo_seguro', {
        p_prestamo_id: prestamo.id,
      })
      if (error) throw new Error(error.message)
      await cargarPrestamos()
      setMensaje('Prestamo anulado. No se elimino ningun registro historico.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error anulando prestamo.')
    } finally {
      setSaving(false)
    }
  }

  const guardarCuotasPrestamo = async (prestamoId: number) => {
    const prestamo = prestamos.find((p) => p.id === prestamoId)
    if (!prestamo || prestamo.estado !== 'ACTIVO') return
    const pendientes = (cuotasPorPrestamo.get(prestamoId) || []).filter((c) => c.estado === 'PENDIENTE')
    const payload: {
      id: number
      monto: number
      periodo_id: number | null
      monto_original: number
      periodo_original: number | null
    }[] = []
    for (const cuota of pendientes) {
      const edit = editCuotas[cuota.id]
      const monto = Number(edit?.monto)
      if (!edit || !edit.monto.trim() || !Number.isFinite(monto) || monto <= 0 || Math.abs(Math.round(monto * 100) - monto * 100) > 1e-6) {
        setMensaje(`La cuota #${cuota.numero_cuota} debe tener un importe positivo con hasta dos decimales.`)
        return
      }
      payload.push({
        id: cuota.id,
        monto,
        periodo_id: edit.periodo_id ? Number(edit.periodo_id) : null,
        monto_original: cuota.monto,
        periodo_original: cuota.periodo_id,
      })
    }
    if (!confirm('¿Guardar la programacion? Los importes pendientes, mas los ya cobrados, deben sumar el prestamo original. Esto NO aplica ni cobra cuotas.')) return
    setSaving(true)
    setMensaje('')
    try {
      const { error } = await supabase.rpc('rrhh_editar_cuotas_prestamo', {
        p_prestamo_id: prestamoId,
        p_cuotas: payload,
      })
      if (error) throw new Error(error.message)
      await cargarPrestamos()
      setMensaje('Programacion guardada sin cobrar cuotas. Si ya habia un borrador de planilla, vuelve a cargarlo y guardarlo.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error actualizando cuotas.')
    } finally {
      setSaving(false)
    }
  }

  const actualizarEditCuota = (cuotaId: number, patch: Partial<EditCuotaState>) => {
    setEditCuotas((prev) => ({
      ...prev,
      [cuotaId]: { ...prev[cuotaId], ...patch },
    }))
  }

  const resumenDePrestamo = (prestamoId: number) => {
    const cuotasPrestamo = cuotasPorPrestamo.get(prestamoId) || []
    return cuotasPrestamo.reduce(
      (acc, cuota) => {
        const monto = toNum(cuota.monto)
        if (cuota.estado === 'APLICADA') acc.aplicado = round2(acc.aplicado + monto)
        if (cuota.estado === 'PENDIENTE') acc.pendiente = round2(acc.pendiente + monto)
        if (cuota.estado === 'ANULADA') acc.anulado = round2(acc.anulado + monto)
        acc.totalCuotas = round2(acc.totalCuotas + monto)
        return acc
      },
      { aplicado: 0, pendiente: 0, anulado: 0, totalCuotas: 0 }
    )
  }

  const crearDocumentoPrestamos = async (titulo: string) => {
    const doc = new jsPDF('p', 'mm', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()
    const logo = await getImageDataUrl(RRHH_LOGO_URL)

    if (logo) {
      doc.addImage(logo, 'PNG', 14, 8, 22, 22)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(titulo, pageWidth / 2, 17, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Generado: ${new Date().toLocaleString()}`, pageWidth - 14, 10, { align: 'right' })

    doc.setDrawColor(30, 41, 59)
    doc.setLineWidth(0.2)
    doc.line(14, 32, pageWidth - 14, 32)

    return doc
  }

  const generarPDFGeneralDeuda = async () => {
    setGenerandoPdf('general')
    setMensaje('')

    try {
      const doc = await crearDocumentoPrestamos('REPORTE GENERAL DE DEUDA POR PRÉSTAMOS')
      const prestamosBase = prestamosFiltrados
      const empleadosResumen = new Map<number, {
        codigo: string
        nombre: string
        prestamos: number
        total: number
        abonado: number
        pendiente: number
        anulado: number
      }>()

      prestamosBase.forEach((p) => {
        const resumenPrestamo = resumenDePrestamo(p.id)
        const actual = empleadosResumen.get(p.empleado_id) || {
          codigo: p.empleado_codigo,
          nombre: p.empleado_nombre,
          prestamos: 0,
          total: 0,
          abonado: 0,
          pendiente: 0,
          anulado: 0,
        }

        actual.prestamos += 1
        actual.total = round2(actual.total + toNum(p.monto_total))
        actual.abonado = round2(actual.abonado + resumenPrestamo.aplicado)
        actual.pendiente = round2(actual.pendiente + resumenPrestamo.pendiente)
        actual.anulado = round2(actual.anulado + resumenPrestamo.anulado)
        empleadosResumen.set(p.empleado_id, actual)
      })

      const totalPrestado = Array.from(empleadosResumen.values()).reduce((sum, e) => round2(sum + e.total), 0)
      const totalAbonado = Array.from(empleadosResumen.values()).reduce((sum, e) => round2(sum + e.abonado), 0)
      const totalPendiente = Array.from(empleadosResumen.values()).reduce((sum, e) => round2(sum + e.pendiente), 0)
      const totalAnulado = Array.from(empleadosResumen.values()).reduce((sum, e) => round2(sum + e.anulado), 0)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Filtros aplicados', 14, 40)
      doc.setFont('helvetica', 'normal')
      doc.text(`Búsqueda: ${busqueda.trim() || 'Todas'}`, 14, 46)
      doc.text(`Estado: ${estadoFiltro === 'TODOS' ? 'Todos' : estadoFiltro}`, 14, 52)

      autoTable(doc, {
        startY: 60,
        head: [['Resumen', 'Valor']],
        body: [
          ['Empleados con préstamo', String(empleadosResumen.size)],
          ['Préstamos mostrados', String(prestamosBase.length)],
          ['Total prestado', money(totalPrestado)],
          ['Total abonado / aplicado', money(totalAbonado)],
          ['Saldo pendiente', money(totalPendiente)],
          ['Cuotas anuladas', money(totalAnulado)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      })

      const finalYResumen = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 90

      autoTable(doc, {
        startY: finalYResumen + 8,
        head: [['Empleado', 'Préstamos', 'Total prestado', 'Abonado', 'Pendiente', 'Anulado']],
        body: Array.from(empleadosResumen.values()).map((e) => [
          `${e.codigo} — ${e.nombre}`,
          String(e.prestamos),
          money(e.total),
          money(e.abonado),
          money(e.pendiente),
          money(e.anulado),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      })

      const finalYEmpleado = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || finalYResumen + 20

      autoTable(doc, {
        startY: finalYEmpleado + 8,
        head: [['Préstamo', 'Fecha', 'Empleado', 'Monto', 'Abonado', 'Pendiente', 'Estado', 'Observaciones']],
        body: prestamosBase.map((p) => {
          const r = resumenDePrestamo(p.id)
          return [
            `#${p.id}`,
            formatDate(p.fecha),
            `${p.empleado_codigo} — ${p.empleado_nombre}`,
            money(p.monto_total),
            money(r.aplicado),
            money(r.pendiente),
            p.estado,
            p.observaciones || '',
          ]
        }),
        styles: { fontSize: 6.5 },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      })

      addPdfFooter(doc)
      doc.save(`reporte_deuda_prestamos_${cleanFilePart(estadoFiltro)}_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando reporte general de deuda.')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const generarPDFEmpleado = async (empleadoId: number) => {
    setGenerandoPdf(`empleado-${empleadoId}`)
    setMensaje('')

    try {
      const emp = empleadoMap.get(empleadoId)
      const prestamosEmpleado = prestamos
        .filter((p) => p.empleado_id === empleadoId)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)

      if (prestamosEmpleado.length === 0) {
        alert('Este empleado no tiene préstamos registrados.')
        return
      }

      const doc = await crearDocumentoPrestamos('REPORTE INDIVIDUAL DE PRÉSTAMOS')
      const empleadoNombre = emp ? `${emp.codigo} — ${emp.nombre_completo}` : `${prestamosEmpleado[0].empleado_codigo} — ${prestamosEmpleado[0].empleado_nombre}`
      const cuotasEmpleado = prestamosEmpleado.flatMap((p) => (cuotasPorPrestamo.get(p.id) || []).map((c) => ({ ...c, prestamo: p })))
      const cuotasAplicadas = cuotasEmpleado.filter((c) => c.estado === 'APLICADA')
      const cuotasPendientes = cuotasEmpleado.filter((c) => c.estado === 'PENDIENTE')
      const cuotasAnuladas = cuotasEmpleado.filter((c) => c.estado === 'ANULADA')

      const totalPrestado = prestamosEmpleado.reduce((sum, p) => round2(sum + toNum(p.monto_total)), 0)
      const totalAplicado = cuotasAplicadas.reduce((sum, c) => round2(sum + toNum(c.monto)), 0)
      const totalPendiente = cuotasPendientes.reduce((sum, c) => round2(sum + toNum(c.monto)), 0)
      const totalAnulado = cuotasAnuladas.reduce((sum, c) => round2(sum + toNum(c.monto)), 0)

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Empleado', 14, 40)
      doc.setFont('helvetica', 'normal')
      doc.text(empleadoNombre, 14, 46)
      doc.text(`Estado actual: ${emp?.estado || 'N/A'}`, 14, 52)

      autoTable(doc, {
        startY: 60,
        head: [['Resumen', 'Valor']],
        body: [
          ['Préstamos registrados', String(prestamosEmpleado.length)],
          ['Total prestado', money(totalPrestado)],
          ['Abonos/cuotas aplicadas', money(totalAplicado)],
          ['Saldo pendiente proyectado', money(totalPendiente)],
          ['Cuotas anuladas', money(totalAnulado)],
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      })

      const finalYResumen = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 90

      autoTable(doc, {
        startY: finalYResumen + 8,
        head: [['Préstamo', 'Fecha', 'Monto', 'Cuotas', 'Abonado', 'Pendiente', 'Estado', 'Observaciones']],
        body: prestamosEmpleado.map((p) => {
          const r = resumenDePrestamo(p.id)
          return [
            `#${p.id}`,
            formatDate(p.fecha),
            money(p.monto_total),
            String((cuotasPorPrestamo.get(p.id) || []).length),
            money(r.aplicado),
            money(r.pendiente),
            p.estado,
            p.observaciones || '',
          ]
        }),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
          2: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      })

      const finalYPrestamos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || finalYResumen + 20

      autoTable(doc, {
        startY: finalYPrestamos + 8,
        head: [['Abonos aplicados', 'Préstamo', 'Cuota', 'Período / fecha de descuento', 'Monto']],
        body: cuotasAplicadas.length > 0
          ? cuotasAplicadas.map((c) => ['Aplicado', `#${c.prestamo.id}`, String(c.numero_cuota), c.periodo_texto, money(c.monto)])
          : [['Sin abonos aplicados', '', '', '', '']],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [5, 150, 105] },
        columnStyles: { 4: { halign: 'right' } },
      })

      const finalYAplicadas = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || finalYPrestamos + 20

      autoTable(doc, {
        startY: finalYAplicadas + 8,
        head: [['Próximos pagos', 'Préstamo', 'Cuota', 'Período proyectado', 'Monto']],
        body: cuotasPendientes.length > 0
          ? cuotasPendientes.map((c) => ['Pendiente', `#${c.prestamo.id}`, String(c.numero_cuota), c.periodo_texto, money(c.monto)])
          : [['Sin cuotas pendientes', '', '', '', '']],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [185, 28, 28] },
        columnStyles: { 4: { halign: 'right' } },
      })

      addPdfFooter(doc)
      const codigo = emp?.codigo || prestamosEmpleado[0].empleado_codigo || String(empleadoId)
      doc.save(`reporte_prestamos_${cleanFilePart(codigo)}_${fileStamp()}.pdf`)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error generando reporte individual.')
    } finally {
      setGenerandoPdf(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-14" />
          <div>
            <h1 className="text-2xl font-bold">Recursos Humanos — Préstamos</h1>
            <p className="text-sm text-slate-600">Registra prestamos y programa cuotas. Solo Confirmar pago real en Planillas registra recuperaciones.</p>
          </div>
        </div>
        <Link href="/rrhh" className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded">
          Volver a RRHH
        </Link>
      </div>

      {mensaje && <div className="border rounded p-3 mb-4 text-sm bg-slate-50">{mensaje}</div>}

      <section className="border rounded p-4 bg-white mb-4">
        <h2 className="font-semibold mb-4">Nuevo préstamo</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Empleado</label>
            <select
              value={form.empleado_id}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, empleado_id: e.target.value })}
              className="w-full border p-2"
            >
              <option value="">Selecciona empleado</option>
              {empleados
                .filter((e) => e.estado === 'ACTIVO')
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.codigo} — {e.nombre_completo}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, fecha: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Monto total</label>
            <input type="number" step="0.01" value={form.monto_total} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, monto_total: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Número de cuotas</label>
            <input type="number" min="1" step="1" value={form.numero_cuotas} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, numero_cuotas: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio año</label>
            <input type="number" value={form.inicio_anio} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, inicio_anio: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio mes</label>
            <select value={form.inicio_mes} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, inicio_mes: e.target.value })} className="w-full border p-2">
              {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio quincena</label>
            <select value={form.inicio_quincena} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, inicio_quincena: e.target.value })} className="w-full border p-2">
              <option value="1">1 al 15</option>
              <option value="2">16 al 30</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-semibold mb-1">Observaciones</label>
            <textarea value={form.observaciones} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, observaciones: e.target.value })} className="w-full border p-2" rows={3} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={guardarPrestamo} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-4 py-2 rounded">
            {saving ? 'Guardando...' : 'Crear préstamo y cuotas'}
          </button>
          <button type="button" onClick={() => setForm(emptyForm())} className="bg-slate-200 px-4 py-2 rounded">
            Limpiar
          </button>
        </div>
      </section>

      <section className="border rounded p-4 bg-white">
        <h2 className="font-semibold mb-4">Préstamos registrados</h2>

        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <input value={busqueda} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setBusqueda(e.target.value)} placeholder="Buscar empleado, código u observación" className="border p-2 md:col-span-2" />
          <select value={estadoFiltro} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEstadoFiltro(e.target.value)} className="border p-2">
            <option value="TODOS">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="PAGADO">Pagados</option>
            <option value="ANULADO">Anulados</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cargarPrestamos} className="bg-blue-600 text-white px-4 py-2 rounded">Actualizar</button>
            <button
              type="button"
              onClick={generarPDFGeneralDeuda}
              disabled={generandoPdf === 'general' || prestamosFiltrados.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white px-4 py-2 rounded"
            >
              {generandoPdf === 'general' ? 'Generando...' : 'Reporte deuda PDF'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <div className="border rounded p-3"><div className="text-xs">Mostrando</div><div className="font-bold">{prestamosFiltrados.length}</div></div>
          <div className="border rounded p-3"><div className="text-xs">Activo</div><div className="font-bold text-red-600">{money(resumen.activo)}</div></div>
          <div className="border rounded p-3"><div className="text-xs">Pagado</div><div className="font-bold text-emerald-700">{money(resumen.pagado)}</div></div>
          <div className="border rounded p-3"><div className="text-xs">Total filtro</div><div className="font-bold">{money(resumen.total)}</div></div>
        </div>

        <div className="overflow-auto border rounded">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-200">
              <tr>
                <th className="border p-2 text-left">ID</th>
                <th className="border p-2 text-left">Empleado</th>
                <th className="border p-2 text-left">Fecha</th>
                <th className="border p-2 text-right">Monto</th>
                <th className="border p-2 text-center">Cuotas</th>
                <th className="border p-2 text-left">Estado</th>
                <th className="border p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {prestamosFiltrados.map((p) => {
                const cuotasPrestamo = cuotasPorPrestamo.get(p.id) || []
                const pendiente = cuotasPrestamo.filter((c) => c.estado === 'PENDIENTE').reduce((sum, c) => sum + toNum(c.monto), 0)
                return (
                  <tr key={p.id} className={prestamoSeleccionado === p.id ? 'bg-blue-50' : ''}>
                    <td className="border p-2">#{p.id}</td>
                    <td className="border p-2">
                      <div className="font-semibold">{p.empleado_codigo}</div>
                      <div>{p.empleado_nombre}</div>
                      {p.observaciones && <div className="text-xs text-slate-500">{p.observaciones}</div>}
                    </td>
                    <td className="border p-2">{p.fecha}</td>
                    <td className="border p-2 text-right">
                      <div className="font-semibold">{money(p.monto_total)}</div>
                      <div className="text-xs text-red-600">Pendiente: {money(pendiente)}</div>
                    </td>
                    <td className="border p-2 text-center">{cuotasPrestamo.length}</td>
                    <td className="border p-2">{p.estado}</td>
                    <td className="border p-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => setPrestamoSeleccionado(prestamoSeleccionado === p.id ? null : p.id)} className="bg-slate-700 text-white px-2 py-1 rounded text-xs">Cuotas</button>
                        <button type="button" onClick={() => generarPDFEmpleado(p.empleado_id)} disabled={generandoPdf === `empleado-${p.empleado_id}`} className="bg-blue-600 disabled:bg-slate-400 text-white px-2 py-1 rounded text-xs">PDF empleado</button>
                        {p.estado === 'ACTIVO' && <button type="button" onClick={() => anularPrestamo(p)} disabled={saving} className="bg-orange-600 disabled:bg-slate-400 text-white px-2 py-1 rounded text-xs">Anular sin abonos</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && prestamosFiltrados.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-slate-600">No hay préstamos con los filtros aplicados.</td></tr>
              )}
              {loading && <tr><td colSpan={7} className="p-4">Cargando...</td></tr>}
            </tbody>
          </table>
        </div>

        {prestamoSeleccionado && (
          <div className="mt-4 border rounded p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold">Cuotas del préstamo #{prestamoSeleccionado}</h3>
                <p className="text-xs text-slate-600">Las cuotas aplicadas no se editan. Para cambiar importes, ajusta las cuotas pendientes y guarda todas juntas; no se aplicara ningun pago.</p>
              </div>
              {prestamos.find((p) => p.id === prestamoSeleccionado)?.estado === 'ACTIVO' && (
                <button type="button" onClick={() => guardarCuotasPrestamo(prestamoSeleccionado)} disabled={saving} className="bg-blue-600 disabled:bg-slate-400 text-white px-3 py-2 rounded text-xs">{saving ? 'Guardando...' : 'Guardar cambios de cuotas'}</button>
              )}
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-200">
                  <tr>
                    <th className="border p-2">Cuota</th>
                    <th className="border p-2">Período</th>
                    <th className="border p-2">Monto</th>
                    <th className="border p-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(cuotasPorPrestamo.get(prestamoSeleccionado) || []).map((c) => {
                    const edit = editCuotas[c.id]
                    const editable = c.estado === 'PENDIENTE' && prestamos.some((p) => p.id === c.prestamo_id && p.estado === 'ACTIVO')
                    return (
                      <tr key={c.id}>
                        <td className="border p-2 text-center">{c.numero_cuota}</td>
                        <td className="border p-2">
                          <select value={edit?.periodo_id || ''} disabled={!editable || saving} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => actualizarEditCuota(c.id, { periodo_id: e.target.value })} className="w-full border p-1 disabled:bg-slate-100">
                            <option value="">Sin período</option>
                            {periodos.filter((p) => p.estado === 'ABIERTO' || p.id === c.periodo_id).map((p) => <option key={p.id} value={p.id}>{periodoLabel(p)}{p.estado !== 'ABIERTO' ? ` [${p.estado}]` : ''}</option>)}
                          </select>
                        </td>
                        <td className="border p-2">
                          <input type="number" min="0.01" step="0.01" disabled={!editable || saving} value={edit?.monto ?? ''} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => actualizarEditCuota(c.id, { monto: e.target.value })} className="w-full border p-1 text-right disabled:bg-slate-100" />
                        </td>
                        <td className="border p-2">
                          <span className="font-medium">{c.estado}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
