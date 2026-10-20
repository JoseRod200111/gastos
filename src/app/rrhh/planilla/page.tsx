'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Area = {
  id: number
  codigo: string
  nombre: string
}

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
  salario_base: number
  bono_produccion_diario: number
  cliente_id: number | null
  fecha_ingreso: string
  fecha_baja: string | null
  estado: 'ACTIVO' | 'BAJA'
}

type Distribucion = {
  empleado_id: number
  area_id: number
  porcentaje: number
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

type SaldoCliente = {
  cliente_id: number
  cliente: string | null
  saldo_ventas: number
  saldo_granja: number
  saldo_total: number
}

type PlanillaGuardada = {
  id: number
  periodo_id: number
  empleado_id: number
  updated_at: string
  salario_base: number
  salario_diario: number
  hora_normal: number
  dias_trabajados: number
  horas_extra: number
  valor_hora_extra: number
  salario_ordinario: number
  monto_horas_extra: number
  bono_produccion_diario: number
  bono_produccion_total: number
  bonificacion_ley: number
  otros_bonos: number
  igss: number
  irtra: number
  anticipos: number
  prestamos: number
  descuentos_ventas: number
  descuentos_manual: number
  total_devengado: number
  total_descuentos: number
  liquido_pagar: number
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'
  fecha_pago: string | null
  observaciones: string | null
}

type PlanillaRow = {
  id: number | null
  revision: string | null
  empleado_id: number
  codigo: string
  nombre: string
  cliente_id: number | null
  saldo_cliente: number
  saldo_ventas: number
  saldo_granja: number
  salario_base: string
  salario_diario: number
  hora_normal: number
  dias_trabajados: string
  horas_extra: string
  valor_hora_extra: number
  salario_ordinario: number
  monto_horas_extra: number
  bono_produccion_diario: string
  bono_produccion_total: number
  bonificacion_ley: string
  otros_bonos: string
  igss: string
  irtra: string
  anticipos: string
  prestamos: string
  descuentos_ventas: string
  descuentos_manual: string
  total_devengado: number
  total_descuentos: number
  liquido_pagar: number
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'
  fecha_pago: string
  observaciones: string
}

type Parametros = {
  horasDia: number
  multiplicadorHoraExtra: number
  bonificacionLeyMensual: number
  igssPorcentaje: number
  irtraPorcentaje: number
}

type AutoTableDoc = jsPDF & {
  lastAutoTable?: { finalY: number }
}

const defaultParametros: Parametros = {
  horasDia: 8,
  multiplicadorHoraExtra: 1.5,
  bonificacionLeyMensual: 250,
  igssPorcentaje: 5.5,
  irtraPorcentaje: 1.5,
}

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

const safeFilePart = (value: string | number | null | undefined) => {
  const cleaned = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || 'sin_nombre'
}

const fichaPlanillaFileName = (row: PlanillaRow, planillaId: number | null, anio: string, mes: string, quincena: string) => {
  const idParte = planillaId ? `ID${planillaId}` : 'ID_sin_guardar'
  const periodoParte = `${anio}_${String(mes).padStart(2, '0')}_Q${quincena}`

  return `ficha_planilla_${idParte}_${safeFilePart(row.nombre)}_${safeFilePart(row.codigo)}_${periodoParte}.pdf`
}

const monthISO = (anio: number, mes: number, dia: number) => {
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${anio}-${m}-${d}`
}

const lastDayOfMonth = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const dateOnlyToISO = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const maxDateOnly = (a: string, b: string) => dateOnlyToISO(parseDateOnly(a) > parseDateOnly(b) ? parseDateOnly(a) : parseDateOnly(b))
const minDateOnly = (a: string, b: string) => dateOnlyToISO(parseDateOnly(a) < parseDateOnly(b) ? parseDateOnly(a) : parseDateOnly(b))

const diasEntreInclusivo = (inicio: string, fin: string) => {
  const start = parseDateOnly(inicio).getTime()
  const end = parseDateOnly(fin).getTime()
  const days = Math.floor((end - start) / 86400000) + 1
  return Number.isFinite(days) ? Math.max(0, days) : 0
}

const calcularDiasEmpleadoEnPeriodo = (empleado: Empleado, fechaInicio: string, fechaFin: string) => {
  if (!empleado.fecha_ingreso) return 15

  const inicioReal = maxDateOnly(fechaInicio, empleado.fecha_ingreso)
  const finReal = empleado.fecha_baja ? minDateOnly(fechaFin, empleado.fecha_baja) : fechaFin
  const dias = diasEntreInclusivo(inicioReal, finReal)

  return Math.min(15, Math.max(0, dias))
}

const calcularFechasPeriodo = (anio: number, mes: number, quincena: number) => {
  if (quincena === 1) {
    return {
      fechaInicio: monthISO(anio, mes, 1),
      fechaFin: monthISO(anio, mes, 15),
      etiqueta: `1 al 15/${String(mes).padStart(2, '0')}/${anio}`,
    }
  }

  const diaFin = Math.min(30, lastDayOfMonth(anio, mes))

  return {
    fechaInicio: monthISO(anio, mes, 16),
    fechaFin: monthISO(anio, mes, diaFin),
    etiqueta: `16 al 30/${String(mes).padStart(2, '0')}/${anio}`,
  }
}

const calcularFila = (row: PlanillaRow, parametros: Parametros) => {
  const salarioBase = toNum(row.salario_base)
  const salarioDiario = round2(salarioBase / 30)
  const horaNormal = round2(salarioDiario / parametros.horasDia)
  const dias = toNum(row.dias_trabajados)
  const horasExtra = toNum(row.horas_extra)
  const valorHoraExtra = round2(horaNormal * parametros.multiplicadorHoraExtra)
  const salarioOrdinario = round2(salarioDiario * dias)
  const montoHorasExtra = round2(valorHoraExtra * horasExtra)
  const bonoDiario = toNum(row.bono_produccion_diario)
  const bonoProduccion = round2(bonoDiario * dias)
  const bonificacionLey = toNum(row.bonificacion_ley)
  const otrosBonos = toNum(row.otros_bonos)
  const igss = toNum(row.igss)
  const irtra = toNum(row.irtra)
  const anticipos = toNum(row.anticipos)
  const prestamos = toNum(row.prestamos)
  const ventas = toNum(row.descuentos_ventas)
  const manual = toNum(row.descuentos_manual)

  const totalDevengado = round2(
    salarioOrdinario + montoHorasExtra + bonoProduccion + bonificacionLey + otrosBonos
  )

  const totalDescuentos = round2(igss + irtra + anticipos + prestamos + ventas + manual)
  const liquido = round2(totalDevengado - totalDescuentos)

  return {
    ...row,
    salario_diario: salarioDiario,
    hora_normal: horaNormal,
    valor_hora_extra: valorHoraExtra,
    salario_ordinario: salarioOrdinario,
    monto_horas_extra: montoHorasExtra,
    bono_produccion_total: bonoProduccion,
    total_devengado: totalDevengado,
    total_descuentos: totalDescuentos,
    liquido_pagar: liquido,
  }
}

const getLogoDataUrl = async () => {
  const response = await fetch('/Logo%20Tech%209_Fondo%20Transparente.png')
  const blob = await response.blob()

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const addHeader = async (doc: jsPDF, titulo: string) => {
  try {
    const logo = await getLogoDataUrl()
    doc.addImage(logo, 'PNG', 14, 8, 28, 20)
  } catch {
    doc.setFontSize(9)
    doc.text('TECH NINE', 14, 15)
  }

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, 105, 18, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Generado: ${new Date().toLocaleString()}`, 196, 12, { align: 'right' })
}

export default function RrhhPlanillaPage() {
  const now = new Date()

  const [anio, setAnio] = useState(String(now.getFullYear()))
  const [mes, setMes] = useState(String(now.getMonth() + 1))
  const [quincena, setQuincena] = useState<'1' | '2'>(now.getDate() <= 15 ? '1' : '2')

  const [areas, setAreas] = useState<Area[]>([])
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([])
  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [filas, setFilas] = useState<PlanillaRow[]>([])
  const [parametros, setParametros] = useState<Parametros>(defaultParametros)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingFichaEmpleadoId, setSavingFichaEmpleadoId] = useState<number | null>(null)
  const [pagandoEmpleadoId, setPagandoEmpleadoId] = useState<number | null>(null)
  const [dirtyIds, setDirtyIds] = useState<number[]>([])
  const [periodoCargado, setPeriodoCargado] = useState('')
  const periodoSeleccionado = `${anio}-${mes}-${quincena}`
  const mismoPeriodo = periodoCargado === periodoSeleccionado
  const [mensaje, setMensaje] = useState('')
  const [busquedaEmpleado, setBusquedaEmpleado] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'TODOS' | 'PENDIENTE' | 'PAGADO' | 'ANULADO'>('TODOS')

  const fechas = useMemo(() => {
    return calcularFechasPeriodo(Number(anio), Number(mes), Number(quincena))
  }, [anio, mes, quincena])

  const resumen = useMemo(() => {
    return filas.reduce(
      (acc, row) => {
        acc.devengado += row.total_devengado
        acc.descuentos += row.total_descuentos
        acc.liquido += row.liquido_pagar
        acc.empleados += 1
        if (row.estado === 'PAGADO') acc.pagados += 1
        if (row.estado === 'PENDIENTE') acc.pendientes += 1
        return acc
      },
      { empleados: 0, pagados: 0, pendientes: 0, devengado: 0, descuentos: 0, liquido: 0 }
    )
  }, [filas])


  const filasVisibles = useMemo(() => {
    const q = busquedaEmpleado.trim().toLowerCase()

    return filas.filter((row) => {
      const matchTexto = !q
        || row.codigo.toLowerCase().includes(q)
        || row.nombre.toLowerCase().includes(q)
        || String(row.empleado_id).includes(q)

      const matchEstado = estadoFiltro === 'TODOS' || row.estado === estadoFiltro

      return matchTexto && matchEstado
    })
  }, [filas, busquedaEmpleado, estadoFiltro])

  const distribucionesPorEmpleado = useMemo(() => {
    const map = new Map<number, Distribucion[]>()

    distribuciones.forEach((d) => {
      const arr = map.get(d.empleado_id) || []
      arr.push(d)
      map.set(d.empleado_id, arr)
    })

    return map
  }, [distribuciones])

  const cargarCatalogos = async () => {
    setMensaje('')

    const [empRes, areaRes, distRes, paramsRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select('id,codigo,nombre_completo,salario_base,bono_produccion_diario,cliente_id,fecha_ingreso,fecha_baja,estado')
        .lte('fecha_ingreso', fechas.fechaFin)
        .or(`fecha_baja.is.null,fecha_baja.gte.${fechas.fechaInicio}`)
        .order('codigo', { ascending: true }),

      supabase
        .from('rrhh_areas')
        .select('id,codigo,nombre')
        .eq('activo', true)
        .order('id', { ascending: true }),

      supabase
        .from('rrhh_empleado_distribucion')
        .select('empleado_id,area_id,porcentaje'),

      supabase
        .from('rrhh_parametros')
        .select('clave,valor')
        .eq('activo', true),
    ])

    if (empRes.error) throw new Error(`Error cargando empleados: ${empRes.error.message}`)
    if (areaRes.error) throw new Error(`Error cargando áreas: ${areaRes.error.message}`)
    if (distRes.error) throw new Error(`Error cargando distribución: ${distRes.error.message}`)

    setAreas((areaRes.data || []) as Area[])
    setDistribuciones((distRes.data || []) as Distribucion[])

    if (paramsRes.error) throw new Error(`Error cargando parámetros: ${paramsRes.error.message}`)
    const next = { ...defaultParametros }
    if (paramsRes.data) {

      paramsRes.data.forEach((p) => {
        const value = toNum(p.valor)
        if (p.clave === 'HORAS_DIA') next.horasDia = value || defaultParametros.horasDia
        if (p.clave === 'MULTIPLICADOR_HORA_EXTRA') {
          next.multiplicadorHoraExtra = value || defaultParametros.multiplicadorHoraExtra
        }
        if (p.clave === 'BONIFICACION_LEY_MENSUAL') next.bonificacionLeyMensual = value
        if (p.clave === 'IGSS_PORCENTAJE') next.igssPorcentaje = value
        if (p.clave === 'IRTRA_PORCENTAJE') next.irtraPorcentaje = value
      })

      setParametros(next)
    }

    return {
      empleadosList: (empRes.data || []) as Empleado[],
      parametrosActuales: next,
    }
  }

  // Consultar una planilla NUNCA crea ni reabre un período.
  const obtenerPeriodoSoloLectura = async (): Promise<Periodo | null> => {
    const { data, error } = await supabase
      .from('rrhh_periodos_planilla')
      .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
      .eq('anio', Number(anio))
      .eq('mes', Number(mes))
      .eq('quincena', Number(quincena))
      .maybeSingle()
    if (error) throw new Error(`Error consultando período: ${error.message}`)
    const p = (data as Periodo | null) || null
    setPeriodo(p)
    return p
  }

  const cargarSaldosCliente = async (empleadosList: Empleado[]) => {
    const clienteIds = empleadosList
      .map((e) => e.cliente_id)
      .filter((id): id is number => id !== null && id !== undefined)

    if (clienteIds.length === 0) return new Map<number, SaldoCliente>()

    const { data, error } = await supabase
      .from('rrhh_v_cliente_saldo_total')
      .select('cliente_id,cliente,saldo_ventas,saldo_granja,saldo_total')
      .in('cliente_id', clienteIds)

    if (error) throw new Error(`Error cargando saldos de clientes: ${error.message}`)

    const map = new Map<number, SaldoCliente>()
    ;((data || []) as SaldoCliente[]).forEach((s) => map.set(Number(s.cliente_id), s))
    return map
  }

  const cargarAnticipos = async (empleadosList: Empleado[]) => {
    const ids = empleadosList.map((e) => e.id)
    if (ids.length === 0) return new Map<number, number>()

    const { data, error } = await supabase
      .from('rrhh_anticipos')
      .select('id,empleado_id,monto')
      .in('empleado_id', ids)
      .eq('estado', 'PENDIENTE')
      .lte('fecha', fechas.fechaFin)
    if (error) throw new Error(`Error cargando anticipos: ${error.message}`)

    const anticipos = (data || []) as { id: number; empleado_id: number; monto: number }[]
    if (!anticipos.length) return new Map<number, number>()

    const { data: aplicaciones, error: aplicacionesError } = await supabase
      .from('rrhh_anticipo_aplicaciones')
      .select('anticipo_id,monto')
      .in('anticipo_id', anticipos.map((a) => a.id))
    if (aplicacionesError) throw new Error(`Error consultando abonos de anticipos: ${aplicacionesError.message}`)

    const abonado = new Map<number, number>()
    ;((aplicaciones || []) as { anticipo_id: number; monto: number }[]).forEach((a) => {
      abonado.set(a.anticipo_id, round2((abonado.get(a.anticipo_id) || 0) + toNum(a.monto)))
    })
    const resultado = new Map<number, number>()
    anticipos.forEach((a) => {
      const saldo = round2(toNum(a.monto) - (abonado.get(a.id) || 0))
      if (saldo < 0) throw new Error(`Anticipo #${a.id} con pagos superiores al importe. Revisar antes de continuar.`)
      resultado.set(a.empleado_id, round2((resultado.get(a.empleado_id) || 0) + saldo))
    })
    return resultado
  }

  const cargarCuotasPrestamo = async (empleadosList: Empleado[], periodoId: number) => {
    const ids = empleadosList.map((e) => e.id)
    if (ids.length === 0) return new Map<number, number>()

    const { data, error } = await supabase
      .from('rrhh_prestamo_cuotas')
      .select('monto,periodo_id, rrhh_prestamos!inner(empleado_id, estado)')
      .eq('estado', 'PENDIENTE')
      .eq('periodo_id', periodoId)
      .eq('rrhh_prestamos.estado', 'ACTIVO')
      .in('rrhh_prestamos.empleado_id', ids)

    if (error) throw new Error(`Error cargando cuotas de préstamo: ${error.message}`)

    const map = new Map<number, number>()

    ;((data || []) as unknown[]).forEach((item) => {
      const row = item as {
        monto?: number
        rrhh_prestamos?: { empleado_id?: number } | { empleado_id?: number }[]
      }
      const prestamo = Array.isArray(row.rrhh_prestamos)
        ? row.rrhh_prestamos[0]
        : row.rrhh_prestamos
      const empleadoId = Number(prestamo?.empleado_id || 0)

      if (empleadoId > 0) {
        map.set(empleadoId, round2((map.get(empleadoId) || 0) + toNum(row.monto)))
      }
    })

    return map
  }

  const cargarCuotasVentas = async (empleadosList: Empleado[], periodoId: number) => {
    const ids = empleadosList.map((e) => e.id)
    if (ids.length === 0) return new Map<number, number>()

    const { data, error } = await supabase
      .from('rrhh_descuentos_ventas_cuotas')
      .select('monto,periodo_id, rrhh_descuentos_ventas!inner(empleado_id, estado)')
      .eq('estado', 'PENDIENTE')
      .eq('periodo_id', periodoId)
      .eq('rrhh_descuentos_ventas.estado', 'PENDIENTE')
      .in('rrhh_descuentos_ventas.empleado_id', ids)

    if (error) throw new Error(`Error cargando cuotas de ventas: ${error.message}`)

    const map = new Map<number, number>()

    ;((data || []) as unknown[]).forEach((item) => {
      const row = item as {
        monto?: number
        rrhh_descuentos_ventas?: { empleado_id?: number } | { empleado_id?: number }[]
      }
      const descuento = Array.isArray(row.rrhh_descuentos_ventas)
        ? row.rrhh_descuentos_ventas[0]
        : row.rrhh_descuentos_ventas
      const empleadoId = Number(descuento?.empleado_id || 0)

      if (empleadoId > 0) {
        map.set(empleadoId, round2((map.get(empleadoId) || 0) + toNum(row.monto)))
      }
    })

    return map
  }

  const crearFilaInicial = (
    emp: Empleado,
    saldoMap: Map<number, SaldoCliente>,
    anticiposMap: Map<number, number>,
    prestamosMap: Map<number, number>,
    ventasCuotasMap: Map<number, number>,
    params: Parametros
  ) => {
    const salarioDiario = round2(toNum(emp.salario_base) / 30)
    const horaNormal = round2(salarioDiario / params.horasDia)
    const dias = calcularDiasEmpleadoEnPeriodo(emp, fechas.fechaInicio, fechas.fechaFin)
    const bonoLey = quincena === '2' ? params.bonificacionLeyMensual : 0
    const igss = quincena === '2' ? round2(toNum(emp.salario_base) * (params.igssPorcentaje / 100)) : 0
    const irtra = quincena === '2' ? round2(toNum(emp.salario_base) * (params.irtraPorcentaje / 100)) : 0
    const saldo = emp.cliente_id ? saldoMap.get(emp.cliente_id) : undefined

    return calcularFila(
      {
        id: null,
        revision: null,
        empleado_id: emp.id,
        codigo: emp.codigo,
        nombre: emp.nombre_completo,
        cliente_id: emp.cliente_id,
        saldo_cliente: round2(toNum(saldo?.saldo_total)),
        saldo_ventas: round2(toNum(saldo?.saldo_ventas)),
        saldo_granja: round2(toNum(saldo?.saldo_granja)),
        salario_base: String(toNum(emp.salario_base)),
        salario_diario: salarioDiario,
        hora_normal: horaNormal,
        dias_trabajados: String(dias),
        horas_extra: '0',
        valor_hora_extra: round2(horaNormal * params.multiplicadorHoraExtra),
        salario_ordinario: 0,
        monto_horas_extra: 0,
        bono_produccion_diario: String(toNum(emp.bono_produccion_diario)),
        bono_produccion_total: 0,
        bonificacion_ley: String(bonoLey),
        otros_bonos: '0',
        igss: String(igss),
        irtra: String(irtra),
        anticipos: String(anticiposMap.get(emp.id) || 0),
        prestamos: String(prestamosMap.get(emp.id) || 0),
        descuentos_ventas: String(ventasCuotasMap.get(emp.id) || 0),
        descuentos_manual: '0',
        total_devengado: 0,
        total_descuentos: 0,
        liquido_pagar: 0,
        estado: 'PENDIENTE',
        fecha_pago: '',
        observaciones: dias < 15 ? `Ingreso/baja parcial en período. Días calculados: ${dias}.` : '',
      },
      params
    )
  }

  const generarFilasIniciales = async (empleadosList: Empleado[], periodoId: number, params: Parametros) => {
    const empleadosDelPeriodo = empleadosList.filter(
      (emp) => calcularDiasEmpleadoEnPeriodo(emp, fechas.fechaInicio, fechas.fechaFin) > 0
    )

    const saldoMap = await cargarSaldosCliente(empleadosDelPeriodo)
    const anticiposMap = await cargarAnticipos(empleadosDelPeriodo)
    const prestamosMap = await cargarCuotasPrestamo(empleadosDelPeriodo, periodoId)
    const ventasCuotasMap = await cargarCuotasVentas(empleadosDelPeriodo, periodoId)

    const rows = empleadosDelPeriodo.map((emp) =>
      crearFilaInicial(emp, saldoMap, anticiposMap, prestamosMap, ventasCuotasMap, params)
    )

    setFilas(rows)
  }

  const cargarPlanilla = async () => {
    setLoading(true)
    setMensaje('')
    setPeriodoCargado('')
    setFilas([])
    setDirtyIds([])

    try {
      const { empleadosList, parametrosActuales } = await cargarCatalogos()

      if (empleadosList.length === 0) {
        setFilas([])
        setMensaje('No se encontraron empleados aplicables a este período. Revisa fecha de ingreso, fecha de baja o permisos/RLS de rrhh_empleados.')
        return
      }

      const p = await obtenerPeriodoSoloLectura()
      const { data, error } = p
        ? await supabase.from('rrhh_planilla_empleado').select('*')
          .eq('periodo_id', p.id).order('empleado_id', { ascending: true })
        : { data: [] as PlanillaGuardada[], error: null }
      if (error) throw new Error(`Error cargando planilla: ${error.message}`)
      const guardadas = (data || []) as PlanillaGuardada[]

      if (guardadas.length === 0) {
        await generarFilasIniciales(empleadosList, p?.id || 0, parametrosActuales)
        setPeriodoCargado(`${anio}-${mes}-${quincena}`)
        setMensaje('Planilla preparada con empleados aplicables al período. Los ingresos a media quincena se calculan con días proporcionales. Revisa y guarda para fijar los cálculos.')
        return
      }

      const empleadosDelPeriodo = empleadosList.filter(
        (emp) => calcularDiasEmpleadoEnPeriodo(emp, fechas.fechaInicio, fechas.fechaFin) > 0
      )
      const saldoMap = await cargarSaldosCliente(empleadosDelPeriodo)
      const empMap = new Map(empleadosDelPeriodo.map((e) => [e.id, e]))
      const guardadasEmpleadoIds = new Set(guardadas.map((g) => Number(g.empleado_id)))

      const rowsGuardadas = guardadas
        .map((g) => {
          const emp = empMap.get(g.empleado_id)
          if (!emp) return null

          const saldo = emp.cliente_id ? saldoMap.get(emp.cliente_id) : undefined

          // Los valores pagados/guardados son una fotografía histórica: no recalcular.
          return {
              id: g.id,
              revision: g.updated_at,
              empleado_id: g.empleado_id,
              codigo: emp.codigo,
              nombre: emp.nombre_completo,
              cliente_id: emp.cliente_id,
              saldo_cliente: round2(toNum(saldo?.saldo_total)),
              saldo_ventas: round2(toNum(saldo?.saldo_ventas)),
              saldo_granja: round2(toNum(saldo?.saldo_granja)),
              salario_base: String(toNum(g.salario_base)),
              salario_diario: toNum(g.salario_diario),
              hora_normal: toNum(g.hora_normal),
              dias_trabajados: String(toNum(g.dias_trabajados)),
              horas_extra: String(toNum(g.horas_extra)),
              valor_hora_extra: toNum(g.valor_hora_extra),
              salario_ordinario: toNum(g.salario_ordinario),
              monto_horas_extra: toNum(g.monto_horas_extra),
              bono_produccion_diario: String(toNum(g.bono_produccion_diario)),
              bono_produccion_total: toNum(g.bono_produccion_total),
              bonificacion_ley: String(toNum(g.bonificacion_ley)),
              otros_bonos: String(toNum(g.otros_bonos)),
              igss: String(toNum(g.igss)),
              irtra: String(toNum(g.irtra)),
              anticipos: String(toNum(g.anticipos)),
              prestamos: String(toNum(g.prestamos)),
              descuentos_ventas: String(toNum(g.descuentos_ventas)),
              descuentos_manual: String(toNum(g.descuentos_manual)),
              total_devengado: toNum(g.total_devengado),
              total_descuentos: toNum(g.total_descuentos),
              liquido_pagar: toNum(g.liquido_pagar),
              estado: g.estado,
              fecha_pago: g.fecha_pago || '',
              observaciones: g.observaciones || '',
            }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)

      const empleadosFaltantes = empleadosDelPeriodo.filter((emp) => !guardadasEmpleadoIds.has(emp.id))
      let filasNuevas: PlanillaRow[] = []

      if (empleadosFaltantes.length > 0) {
        const anticiposMap = await cargarAnticipos(empleadosFaltantes)
        const prestamosMap = await cargarCuotasPrestamo(empleadosFaltantes, p?.id || 0)
        const ventasCuotasMap = await cargarCuotasVentas(empleadosFaltantes, p?.id || 0)

        filasNuevas = empleadosFaltantes.map((emp) =>
          crearFilaInicial(emp, saldoMap, anticiposMap, prestamosMap, ventasCuotasMap, parametrosActuales)
        )
      }

      const rows = [...rowsGuardadas, ...filasNuevas].sort((a, b) => a.codigo.localeCompare(b.codigo))

      setFilas(rows)
      setPeriodoCargado(`${anio}-${mes}-${quincena}`)
      setMensaje(
        filasNuevas.length > 0
          ? `Planilla cargada desde registros guardados. Se agregaron ${filasNuevas.length} empleado(s) nuevo(s) que trabajaron en este período.`
          : 'Planilla cargada desde registros guardados.'
      )
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando planilla.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarPlanilla().catch((err) => {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando planilla.')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateRow = (empleadoId: number, field: keyof PlanillaRow, value: string) => {
    if (!mismoPeriodo || saving || pagandoEmpleadoId !== null) return
    setFilas((prev) => prev.map((row) => {
      if (row.empleado_id !== empleadoId || row.estado !== 'PENDIENTE') return row
      if (field === 'fecha_pago') return { ...row, fecha_pago: value }
      if (field === 'observaciones') return { ...row, observaciones: value }
      return calcularFila({ ...row, [field]: value }, parametros)
    }))
    // Elegir fecha real del pago no modifica el borrador.
    if (field !== 'fecha_pago') {
      setDirtyIds((prev) => prev.includes(empleadoId) ? prev : [...prev, empleadoId])
    }
  }

  const borradorPayload = (row: PlanillaRow) => ({
    ...(dirtyIds.includes(row.empleado_id) || !row.id ? calcularFila(row, parametros) : row),
    anio: Number(anio), mes: Number(mes), quincena: Number(quincena),
    // Estado y fecha_pago se deciden EXCLUSIVAMENTE en el servidor.
    id: undefined, estado: undefined, fecha_pago: undefined,
    revision: row.revision,
  })

  const guardarPlanilla = async () => {
    if (!mismoPeriodo) { alert('Carga el período seleccionado antes de guardar.'); return }
    if (!filas.length) return
    if (filas.some((r) => r.estado !== 'PENDIENTE' && dirtyIds.includes(r.empleado_id))) {
      alert('No se pueden editar fichas PAGADAS o ANULADAS. Recarga la planilla.')
      return
    }
    setSaving(true)
    setMensaje('')
    try {
      const pendientes = filas.filter((r) => r.estado === 'PENDIENTE')
      if (pendientes.length === 0) { setMensaje('No hay borradores pendientes que guardar.'); return }
      if (!dirtyIds.length && pendientes.every((r) => r.id !== null)) {
        setMensaje('Todas las fichas pendientes ya están guardadas y sin cambios.'); return
      }
      if (pendientes.some((r) => !Number.isFinite(r.liquido_pagar) || r.liquido_pagar < 0)) {
        throw new Error('Hay fichas con importe líquido negativo o inválido.')
      }
      const { error } = await supabase.rpc('rrhh_guardar_borrador_planilla', {
        p_filas: pendientes.map(borradorPayload),
      })
      if (error) throw new Error(`No se guardó la planilla: ${error.message}`)
      await cargarPlanilla()
      setMensaje('Borradores guardados. NO se confirmó ningún pago ni se aplicaron descuentos.')
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'Error guardando borradores.')
    } finally { setSaving(false) }
  }

  const confirmarPago = async (row: PlanillaRow) => {
    if (!mismoPeriodo || !row.id || !row.revision || row.estado !== 'PENDIENTE') return
    if (dirtyIds.includes(row.empleado_id)) {
      alert('Tienes cambios sin guardar en esta ficha. Primero guarda la planilla.'); return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_pago)) {
      alert('Selecciona la fecha REAL de entrega del salario antes de confirmar.'); return
    }
    if (!window.confirm(
      `¿Confirmas que el salario de ${row.codigo} - ${row.nombre} YA FUE ENTREGADO el ${row.fecha_pago}?\n` +
      `Líquido: ${money(row.liquido_pagar)}. Esta acción aplicará anticipos y cuotas y no se puede deshacer desde esta pantalla.`
    )) return
    setPagandoEmpleadoId(row.empleado_id)
    setMensaje('')
    try {
      const { error } = await supabase.rpc('rrhh_confirmar_pago_ficha', {
        p_ficha_id: row.id, p_fecha_pago: row.fecha_pago, p_revision: row.revision,
      })
      if (error) throw new Error(`NO se confirmó el pago: ${error.message}`)
      await cargarPlanilla()
      setMensaje(`Pago real confirmado para ${row.codigo} y descuentos registrados una sola vez.`)
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'Error confirmando pago.')
    } finally { setPagandoEmpleadoId(null) }
  }

  const imprimirFicha = async (row: PlanillaRow) => {
    if (savingFichaEmpleadoId !== null || saving) return

    setSavingFichaEmpleadoId(row.empleado_id)

    try {
      if (!mismoPeriodo || !row.id || dirtyIds.includes(row.empleado_id)) {
        alert('Primero GUARDA el borrador y vuelve a descargar. El PDF no guarda cambios ni pagos.')
        return
      }
      const rowGuardada = row
      const fichaId = row.id

      const doc = new jsPDF('p', 'mm', 'letter') as AutoTableDoc
      await addHeader(doc, rowGuardada.estado === 'PAGADO' ? 'FICHA DE PAGO QUINCENAL' : 'FICHA DE PLANILLA - SIN PAGAR')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`${rowGuardada.codigo} - ${rowGuardada.nombre}`, 14, 38)
      doc.setFont('helvetica', 'normal')
      doc.text(`Ficha planilla ID: ${fichaId || 'N/A'}`, 14, 45)
      doc.text(`Período: ${fechas.etiqueta}`, 14, 52)
      doc.text(`Estado: ${rowGuardada.estado}`, 105, 52)
      doc.text(`Fecha de pago: ${rowGuardada.fecha_pago || 'Pendiente'}`, 150, 52)
      doc.text(
        rowGuardada.estado === 'PAGADO'
          ? 'Pago registrado en la ficha'
          : 'BORRADOR: NO ACREDITA ENTREGA DE SALARIO NI DESCUENTOS',
        14,
        58
      )

    autoTable(doc, {
      startY: 66,
      head: [['Concepto', 'Cantidad / base', 'Monto']],
      body: [
        ['Salario base mensual', '', money(rowGuardada.salario_base)],
        ['Salario diario', 'Salario / 30', money(rowGuardada.salario_diario)],
        ['Días trabajados', rowGuardada.dias_trabajados, money(rowGuardada.salario_ordinario)],
        ['Horas extra', `${rowGuardada.horas_extra} h x ${money(rowGuardada.valor_hora_extra)}`, money(rowGuardada.monto_horas_extra)],
        ['Bono producción', `${money(rowGuardada.bono_produccion_diario)} x ${rowGuardada.dias_trabajados} días`, money(rowGuardada.bono_produccion_total)],
        ['Bonificación de ley', '', money(rowGuardada.bonificacion_ley)],
        ['Otros bonos', '', money(rowGuardada.otros_bonos)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    const afterDev = (doc.lastAutoTable?.finalY || 54) + 6

    autoTable(doc, {
      startY: afterDev,
      head: [['Descuento', 'Monto']],
      body: [
        ['IGSS', money(rowGuardada.igss)],
        ['IRTRA', money(rowGuardada.irtra)],
        ['Anticipos', money(rowGuardada.anticipos)],
        ['Préstamos', money(rowGuardada.prestamos)],
        ['Ventas descontadas', money(rowGuardada.descuentos_ventas)],
        ['Otros descuentos', money(rowGuardada.descuentos_manual)],
      ].filter((r) => toNum(r[1].replace('Q', '')) !== 0),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80] },
    })

    const afterDisc = (doc.lastAutoTable?.finalY || afterDev) + 8

    autoTable(doc, {
      startY: afterDisc,
      body: [
        ['Total devengado', money(rowGuardada.total_devengado)],
        ['Total descuentos', money(rowGuardada.total_descuentos)],
        ['Líquido a recibir', money(rowGuardada.liquido_pagar)],
      ],
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })

    const yFirma = Math.max((doc.lastAutoTable?.finalY || afterDisc) + 24, 205)
    doc.setFontSize(9)
    doc.text('Recibí conforme:', 14, yFirma)
    doc.line(14, yFirma + 18, 85, yFirma + 18)
    doc.text('Firma del empleado', 31, yFirma + 24)
    doc.line(120, yFirma + 18, 190, yFirma + 18)
    doc.text('Firma / autorización', 139, yFirma + 24)

    if (rowGuardada.observaciones) {
      doc.setFontSize(8)
      doc.text(`Observaciones: ${rowGuardada.observaciones}`, 14, yFirma + 36, { maxWidth: 180 })
    }

    doc.save(fichaPlanillaFileName(rowGuardada, fichaId, anio, mes, quincena))
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'No se pudo descargar la ficha.')
    } finally {
      setSavingFichaEmpleadoId(null)
    }
  }

  const imprimirReporteGeneral = async () => {
    if (!mismoPeriodo || filas.length === 0 || dirtyIds.length || filas.some((r) => !r.id)) {
      alert('Primero guarda todos los borradores de este período. Descargar PDF no guarda datos ni aplica descuentos.')
      return
    }

    const doc = new jsPDF('l', 'mm', 'letter') as AutoTableDoc
    await addHeader(doc, 'REPORTE GENERAL DE PLANILLA (GUARDADO)')

    doc.setFontSize(9)
    doc.text(`Período: ${fechas.etiqueta}`, 14, 34)
    doc.text(`Empleados: ${resumen.empleados}`, 14, 40)
    doc.text(`Devengado: ${money(resumen.devengado)}`, 75, 40)
    doc.text(`Descuentos: ${money(resumen.descuentos)}`, 135, 40)
    doc.text(`Líquido: ${money(resumen.liquido)}`, 200, 40)

    autoTable(doc, {
      startY: 48,
      head: [['ID', 'Empleado', 'Días', 'H.E.', 'Devengado', 'Descuentos', 'Líquido', 'Estado']],
      body: filas.map((row) => [
        row.codigo,
        row.nombre,
        row.dias_trabajados,
        row.horas_extra,
        money(row.total_devengado),
        money(row.total_descuentos),
        money(row.liquido_pagar),
        row.estado,
      ]),
      styles: { fontSize: 7, cellPadding: 1.6 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    const areaMap = new Map<number, { nombre: string; monto: number }>()

    filas.forEach((row) => {
      const dist = distribucionesPorEmpleado.get(row.empleado_id) || []
      dist.forEach((d) => {
        const area = areas.find((a) => a.id === d.area_id)
        if (!area) return

        const current = areaMap.get(area.id) || { nombre: area.nombre, monto: 0 }
        current.monto = round2(current.monto + row.liquido_pagar * (toNum(d.porcentaje) / 100))
        areaMap.set(area.id, current)
      })
    })

    const y = (doc.lastAutoTable?.finalY || 48) + 8

    autoTable(doc, {
      startY: y,
      head: [['Área', 'Monto distribuido']],
      body: Array.from(areaMap.values()).map((a) => [a.nombre, money(a.monto)]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80] },
    })

    doc.save(`reporte_planilla_${anio}_${String(mes).padStart(2, '0')}_Q${quincena}.pdf`)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <img src="/Logo%20Tech%209_Fondo%20Transparente.png" alt="Logo" className="h-12" />
        <div>
          <h1 className="text-2xl font-bold">Recursos Humanos — Planilla</h1>
          <p className="text-sm text-slate-600">
            Generación de planilla quincenal, cálculo de pago y ficha PDF por empleado.
          </p>
        </div>

        <Link
          href="/rrhh"
          className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          Volver a RRHH
        </Link>
      </div>

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Período de planilla</h2>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
          <label className="text-sm">
            Año
            <input
              type="number"
              className="mt-1 border rounded px-3 py-2 w-full"
              value={anio}
              onChange={(e) => { setAnio(e.target.value); setFilas([]); setPeriodo(null); setPeriodoCargado('') }}
            />
          </label>

          <label className="text-sm">
            Mes
            <select
              className="mt-1 border rounded px-3 py-2 w-full"
              value={mes}
              onChange={(e) => { setMes(e.target.value); setFilas([]); setPeriodo(null); setPeriodoCargado('') }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Quincena
            <select
              className="mt-1 border rounded px-3 py-2 w-full"
              value={quincena}
              onChange={(e) => { setQuincena(e.target.value as '1' | '2'); setFilas([]); setPeriodo(null); setPeriodoCargado('') }}
            >
              <option value="1">1 al 15</option>
              <option value="2">16 al 30</option>
            </select>
          </label>

          <div className="text-sm border rounded px-3 py-2 bg-slate-50 md:col-span-2">
            <div className="text-slate-600">Rango</div>
            <div className="font-semibold">
              {fechas.fechaInicio} a {fechas.fechaFin}
            </div>
          </div>

          <button
            type="button"
            onClick={cargarPlanilla}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Cargando...' : 'Cargar / generar'}
          </button>

          <button
            type="button"
            onClick={guardarPlanilla}
            disabled={saving || !mismoPeriodo || filas.length === 0 || pagandoEmpleadoId !== null}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {saving ? 'Guardando...' : 'Guardar borrador (sin pagar)'}
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-700">{periodo ? `Período #${periodo.id}: ${periodo.estado}. ` : 'Período todavía sin registrar. '}Guardar es un borrador. Descargar PDF exige haber guardado, y nunca marca un salario como pagado. Solo «Confirmar pago real» aplica descuentos.</p>
        {mensaje && <div className="mt-3 border rounded p-3 text-sm bg-slate-50">{mensaje}</div>}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-slate-600">Empleados</div>
          <div className="font-bold text-lg">{resumen.empleados}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-slate-600">Pendientes</div>
          <div className="font-bold text-lg">{resumen.pendientes}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-slate-600">Total devengado</div>
          <div className="font-bold text-lg">{money(resumen.devengado)}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-slate-600">Total descuentos</div>
          <div className="font-bold text-lg text-red-700">{money(resumen.descuentos)}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-slate-600">Líquido a pagar</div>
          <div className="font-bold text-lg text-emerald-700">{money(resumen.liquido)}</div>
        </div>
      </section>

      <section className="border rounded-lg p-3 bg-white mb-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="text-sm md:col-span-2">
            Buscar empleado
            <input
              type="text"
              className="mt-1 border rounded px-3 py-2 w-full"
              placeholder="Código, nombre o ID"
              value={busquedaEmpleado}
              onChange={(e) => setBusquedaEmpleado(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Estado
            <select
              className="mt-1 border rounded px-3 py-2 w-full"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as typeof estadoFiltro)}
            >
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="PAGADO">Pagados</option>
              <option value="ANULADO">Anulados</option>
            </select>
          </label>

          <div className="text-sm border rounded px-3 py-2 bg-slate-50">
            <div className="text-slate-600">Mostrando</div>
            <div className="font-semibold">{filasVisibles.length} de {filas.length}</div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={imprimirReporteGeneral}
          disabled={filas.length === 0}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          PDF general
        </button>
        <Link
          href="/rrhh/planilla/fichas"
          className="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded text-sm"
        >
          Buscar fichas pasadas
        </Link>
      </div>

      <section className="border rounded-lg bg-white overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-200 sticky top-0">
            <tr>
              <th className="border p-2 text-left">Empleado</th>
              <th className="border p-2">Salario</th>
              <th className="border p-2">Días</th>
              <th className="border p-2">H. extra</th>
              <th className="border p-2">Bono prod.</th>
              <th className="border p-2">Bonif.</th>
              <th className="border p-2">IGSS</th>
              <th className="border p-2">IRTRA</th>
              <th className="border p-2">Antic.</th>
              <th className="border p-2">Prést.</th>
              <th className="border p-2">Ventas</th>
              <th className="border p-2">Otro desc.</th>
              <th className="border p-2">Líquido</th>
              <th className="border p-2">Estado</th>
              <th className="border p-2">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filasVisibles.map((row) => (
              <tr key={row.empleado_id} className="align-top">
                <td className="border p-2 min-w-[220px]">
                  <div className="font-semibold">{row.codigo}</div>
                  <div>{row.nombre}</div>
                  {!row.cliente_id && <div className="mt-1 text-[11px] text-amber-800">Sin cliente relacionado: revisar ventas a crédito.</div>}
                  {row.saldo_cliente > 0 && (
                    <div className="mt-1 text-[11px] text-red-700">
                      Saldo cliente: {money(row.saldo_cliente)}
                    </div>
                  )}
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-24"
                    value={row.salario_base}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'salario_base', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">Día {money(row.salario_diario)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-16"
                    value={row.dias_trabajados}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'dias_trabajados', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">{money(row.salario_ordinario)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-16"
                    value={row.horas_extra}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'horas_extra', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">{money(row.monto_horas_extra)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.bono_produccion_diario}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) =>
                      updateRow(row.empleado_id, 'bono_produccion_diario', e.target.value)
                    }
                  />
                  <div className="text-[10px] text-slate-500">{money(row.bono_produccion_total)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.bonificacion_ley}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'bonificacion_ley', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.igss}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'igss', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.irtra}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'irtra', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.anticipos}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'anticipos', e.target.value)}
                  />
                  {toNum(row.anticipos) > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1">Se aplicará al pagar</div>
                  )}
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.prestamos}
                    disabled
                    title="Este importe se programa en RRHH / Préstamos y se actualiza al recargar la planilla."
                    onChange={(e) => updateRow(row.empleado_id, 'prestamos', e.target.value)}
                  />
                  {toNum(row.prestamos) > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1">Cuota del período</div>
                  )}
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.descuentos_ventas}
                    disabled
                    title="Este importe se programa en RRHH / Ventas a empleados."
                    onChange={(e) => updateRow(row.empleado_id, 'descuentos_ventas', e.target.value)}
                  />
                  {row.saldo_cliente > 0 && (
                    <>
                      <div className="text-[10px] text-slate-600 mt-1">
                        Deuda: {money(row.saldo_cliente)}
                      </div>
                      <Link
                        href="/rrhh/descuentos-ventas"
                        className="block mt-1 text-[10px] bg-red-600 text-white rounded px-2 py-1 text-center"
                      >
                        Programar
                      </Link>
                    </>
                  )}
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.descuentos_manual}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'descuentos_manual', e.target.value)}
                  />
                </td>

                <td className="border p-2 font-bold text-right min-w-[90px]">
                  <div>{money(row.liquido_pagar)}</div>
                  <div className="text-[10px] text-slate-500">Dev. {money(row.total_devengado)}</div>
                  <div className="text-[10px] text-red-700">Desc. {money(row.total_descuentos)}</div>
                </td>

                <td className="border p-2">
                  <span className="font-semibold">{row.estado}</span>
                  {row.estado === 'PENDIENTE' ? (
                    <label className="block mt-1 text-[10px]">
                      Fecha real de pago
                      <input type="date" className="border rounded px-1 py-1 w-full"
                        value={row.fecha_pago}
                        onChange={(e) => updateRow(row.empleado_id, 'fecha_pago', e.target.value)} />
                    </label>
                  ) : <div className="text-[10px]">{row.fecha_pago || '—'}</div>}
                </td>

                <td className="border p-2 min-w-[120px]">
                  <button
                    type="button"
                    onClick={() => imprimirFicha(row)}
                    disabled={saving || !mismoPeriodo || !row.id || dirtyIds.includes(row.empleado_id) || savingFichaEmpleadoId === row.empleado_id}
                    className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white rounded px-2 py-1 text-xs mb-1 w-full"
                    title="La descarga NO guarda cambios ni aplica descuentos. Guarda el borrador primero."
                  >
                    {savingFichaEmpleadoId === row.empleado_id ? 'Generando...' : 'PDF guardado'}
                  </button>
                  <div className="text-[10px] text-slate-500 mb-1">
                    {row.id ? `Ficha ID ${row.id}` : 'Guarda el borrador antes del PDF'}
                  </div>
                  {row.estado === 'PENDIENTE' && (
                    <button type="button" onClick={() => confirmarPago(row)}
                      disabled={saving || pagandoEmpleadoId !== null || dirtyIds.includes(row.empleado_id) || !row.id}
                      className="mb-2 bg-red-700 text-white rounded px-2 py-1 text-xs w-full disabled:opacity-50">
                      {pagandoEmpleadoId === row.empleado_id ? 'Confirmando...' : 'Confirmar pago REAL'}
                    </button>
                  )}
                  {dirtyIds.includes(row.empleado_id) && <div className="text-amber-700 text-[10px]">Cambios sin guardar</div>}
                  <textarea
                    className="border rounded px-1 py-1 w-full text-[11px]"
                    placeholder="Observaciones"
                    value={row.observaciones}
                    disabled={row.estado !== 'PENDIENTE' || saving || pagandoEmpleadoId !== null}
                    onChange={(e) => updateRow(row.empleado_id, 'observaciones', e.target.value)}
                  />
                </td>
              </tr>
            ))}

            {filas.length === 0 && (
              <tr>
                <td className="p-4 text-slate-600" colSpan={15}>
                  Carga o genera una planilla para ver empleados.
                </td>
              </tr>
            )}

            {filas.length > 0 && filasVisibles.length === 0 && (
              <tr>
                <td className="p-4 text-slate-600" colSpan={15}>
                  No hay empleados que coincidan con el filtro aplicado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
