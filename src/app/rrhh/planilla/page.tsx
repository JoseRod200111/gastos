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

const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'

const defaultParametros: Parametros = {
  horasDia: 8,
  multiplicadorHoraExtra: 1.5,
  bonificacionLeyMensual: 250,
  igssPorcentaje: 4.83,
  irtraPorcentaje: 1,
}

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

const todayISO = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const monthISO = (anio: number, mes: number, dia: number) => {
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${anio}-${m}-${d}`
}

const lastDayOfMonth = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

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

const getImageDataUrl = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo cargar la imagen: ${url}`)

  const blob = await response.blob()

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const getLogoDataUrl = async () => {
  try {
    return await getImageDataUrl(RRHH_LOGO_URL)
  } catch {
    return await getImageDataUrl('/logo.png')
  }
}

const addHeader = async (doc: jsPDF, titulo: string) => {
  try {
    const logo = await getLogoDataUrl()
    doc.addImage(logo, 'PNG', 14, 7, 22, 22)
  } catch {
    doc.setFontSize(9)
    doc.text('AGRO INDUSTRIAS RYB', 14, 15)
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
        .select('id,codigo,nombre_completo,salario_base,bono_produccion_diario,cliente_id')
        .eq('estado', 'ACTIVO')
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

    if (!paramsRes.error && paramsRes.data) {
      const next = { ...defaultParametros }

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
      distribucionesList: (distRes.data || []) as Distribucion[],
    }
  }

  const obtenerOCrearPeriodo = async () => {
    const anioNum = Number(anio)
    const mesNum = Number(mes)
    const quincenaNum = Number(quincena)

    const { data, error } = await supabase
      .from('rrhh_periodos_planilla')
      .upsert(
        {
          anio: anioNum,
          mes: mesNum,
          quincena: quincenaNum,
          fecha_inicio: fechas.fechaInicio,
          fecha_fin: fechas.fechaFin,
          estado: 'ABIERTO',
        },
        { onConflict: 'anio,mes,quincena' }
      )
      .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
      .single()

    if (error) throw new Error(`Error creando período: ${error.message}`)

    const p = data as Periodo
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

    if (error) {
      console.error('Error cargando saldos de clientes', error)
      return new Map<number, SaldoCliente>()
    }

    const map = new Map<number, SaldoCliente>()
    ;((data || []) as SaldoCliente[]).forEach((s) => map.set(Number(s.cliente_id), s))
    return map
  }

  const cargarAnticipos = async (empleadosList: Empleado[]) => {
    const ids = empleadosList.map((e) => e.id)
    if (ids.length === 0) return new Map<number, number>()

    const { data, error } = await supabase
      .from('rrhh_anticipos')
      .select('empleado_id,monto')
      .in('empleado_id', ids)
      .eq('estado', 'PENDIENTE')
      .lte('fecha', fechas.fechaFin)

    if (error) {
      console.error('Error cargando anticipos', error)
      return new Map<number, number>()
    }

    const map = new Map<number, number>()
    ;((data || []) as { empleado_id: number; monto: number }[]).forEach((a) => {
      map.set(Number(a.empleado_id), round2((map.get(Number(a.empleado_id)) || 0) + toNum(a.monto)))
    })

    return map
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

    if (error) {
      console.error('Error cargando cuotas de préstamo', error)
      return new Map<number, number>()
    }

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

    if (error) {
      console.error('Error cargando cuotas de ventas', error)
      return new Map<number, number>()
    }

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

  const generarFilasIniciales = async (empleadosList: Empleado[], periodoId: number) => {
    const saldoMap = await cargarSaldosCliente(empleadosList)
    const anticiposMap = await cargarAnticipos(empleadosList)
    const prestamosMap = await cargarCuotasPrestamo(empleadosList, periodoId)
    const ventasCuotasMap = await cargarCuotasVentas(empleadosList, periodoId)

    const rows = empleadosList.map((emp) => {
      const salarioDiario = round2(toNum(emp.salario_base) / 30)
      const horaNormal = round2(salarioDiario / parametros.horasDia)
      const dias = 15
      const bonoLey = quincena === '2' ? parametros.bonificacionLeyMensual : 0
      const salarioOrdinario = round2(salarioDiario * dias)
      const igss = quincena === '2' ? round2(salarioOrdinario * (parametros.igssPorcentaje / 100)) : 0
      const irtra = quincena === '2' ? round2(salarioOrdinario * (parametros.irtraPorcentaje / 100)) : 0
      const saldo = emp.cliente_id ? saldoMap.get(emp.cliente_id) : undefined

      return calcularFila(
        {
          id: null,
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
          valor_hora_extra: round2(horaNormal * parametros.multiplicadorHoraExtra),
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
          observaciones: '',
        },
        parametros
      )
    })

    setFilas(rows)
  }

  const cargarPlanilla = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const { empleadosList } = await cargarCatalogos()

      if (empleadosList.length === 0) {
        setFilas([])
        setMensaje('No se encontraron empleados activos. Si sí aparecen en SQL, revisa permisos/RLS de rrhh_empleados y rrhh_empleado_distribucion.')
        return
      }

      const p = await obtenerOCrearPeriodo()

      const { data, error } = await supabase
        .from('rrhh_planilla_empleado')
        .select('*')
        .eq('periodo_id', p.id)
        .order('empleado_id', { ascending: true })

      if (error) throw new Error(`Error cargando planilla: ${error.message}`)

      const guardadas = (data || []) as PlanillaGuardada[]

      if (guardadas.length === 0) {
        await generarFilasIniciales(empleadosList, p.id)
        setMensaje('Planilla preparada con empleados activos. Revisa y guarda para fijar los cálculos.')
        return
      }

      const saldoMap = await cargarSaldosCliente(empleadosList)
      const empMap = new Map(empleadosList.map((e) => [e.id, e]))

      const rows = guardadas
        .map((g) => {
          const emp = empMap.get(g.empleado_id)
          if (!emp) return null

          const saldo = emp.cliente_id ? saldoMap.get(emp.cliente_id) : undefined

          return calcularFila(
            {
              id: g.id,
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
            },
            parametros
          )
        })
        .filter((row): row is PlanillaRow => row !== null)

      setFilas(rows)
      setMensaje('Planilla cargada desde registros guardados.')
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
    setFilas((prev) =>
      prev.map((row) => {
        if (row.empleado_id !== empleadoId) return row
        return calcularFila({ ...row, [field]: value }, parametros)
      })
    )
  }

  const updateEstado = (empleadoId: number, estado: PlanillaRow['estado']) => {
    setFilas((prev) =>
      prev.map((row) => {
        if (row.empleado_id !== empleadoId) return row
        return { ...row, estado, fecha_pago: estado === 'PAGADO' && !row.fecha_pago ? todayISO() : row.fecha_pago }
      })
    )
  }

  const marcarTodosPagados = () => {
    const fecha = todayISO()

    setFilas((prev) =>
      prev.map((row) => (
        row.estado === 'ANULADO'
          ? row
          : { ...row, estado: 'PAGADO', fecha_pago: row.fecha_pago || fecha }
      ))
    )
  }

  const marcarTodosPendientes = () => {
    setFilas((prev) =>
      prev.map((row) => (
        row.estado === 'ANULADO'
          ? row
          : { ...row, estado: 'PENDIENTE', fecha_pago: '' }
      ))
    )
  }

  const detalleParaFila = (row: PlanillaRow) => {
    const detalles = [
      { tipo: 'DEVENGADO', concepto: 'Salario ordinario', monto: row.salario_ordinario },
      { tipo: 'DEVENGADO', concepto: 'Horas extra', monto: row.monto_horas_extra },
      { tipo: 'DEVENGADO', concepto: 'Bono producción', monto: row.bono_produccion_total },
      { tipo: 'DEVENGADO', concepto: 'Bonificación de ley', monto: toNum(row.bonificacion_ley) },
      { tipo: 'DEVENGADO', concepto: 'Otros bonos', monto: toNum(row.otros_bonos) },
      { tipo: 'DESCUENTO', concepto: 'IGSS', monto: toNum(row.igss) },
      { tipo: 'DESCUENTO', concepto: 'IRTRA', monto: toNum(row.irtra) },
      { tipo: 'DESCUENTO', concepto: 'Anticipos', monto: toNum(row.anticipos) },
      { tipo: 'DESCUENTO', concepto: 'Préstamos', monto: toNum(row.prestamos) },
      { tipo: 'DESCUENTO', concepto: 'Ventas descontadas', monto: toNum(row.descuentos_ventas) },
      { tipo: 'DESCUENTO', concepto: 'Otros descuentos', monto: toNum(row.descuentos_manual) },
    ]

    return detalles.filter((d) => toNum(d.monto) !== 0)
  }


  const crearDescuentosVentasDirectos = async (p: Periodo, userId: string | null) => {
    const filasPagadasConVentas = filas.filter(
      (row) => row.estado === 'PAGADO' && toNum(row.descuentos_ventas) > 0
    )

    if (filasPagadasConVentas.length === 0) return

    const empleadoIds = filasPagadasConVentas.map((row) => row.empleado_id)

    const { data: cuotasExistentes, error: cuotasError } = await supabase
      .from('rrhh_descuentos_ventas_cuotas')
      .select('monto,estado,rrhh_descuentos_ventas!inner(empleado_id,estado,modulo)')
      .eq('periodo_id', p.id)
      .in('rrhh_descuentos_ventas.empleado_id', empleadoIds)

    if (cuotasError) throw new Error(`Error revisando descuentos de ventas existentes: ${cuotasError.message}`)

    const programadoPorEmpleado = new Map<number, number>()

    ;((cuotasExistentes || []) as unknown[]).forEach((item) => {
      const row = item as {
        monto?: number
        estado?: string
        rrhh_descuentos_ventas?: { empleado_id?: number; estado?: string } | { empleado_id?: number; estado?: string }[]
      }
      const descuento = Array.isArray(row.rrhh_descuentos_ventas)
        ? row.rrhh_descuentos_ventas[0]
        : row.rrhh_descuentos_ventas

      if (!descuento || descuento.estado === 'ANULADO' || row.estado === 'ANULADA') return

      const empleadoId = Number(descuento.empleado_id || 0)
      if (empleadoId > 0) {
        programadoPorEmpleado.set(
          empleadoId,
          round2((programadoPorEmpleado.get(empleadoId) || 0) + toNum(row.monto))
        )
      }
    })

    const crearDescuento = async (
      row: PlanillaRow,
      modulo: 'VENTAS' | 'GRANJA_CERDOS',
      monto: number
    ) => {
      if (monto <= 0) return
      if (!row.cliente_id) {
        throw new Error(`El empleado ${row.codigo} - ${row.nombre} no tiene cliente vinculado.`)
      }

      const { data: descData, error: descError } = await supabase
        .from('rrhh_descuentos_ventas')
        .insert({
          empleado_id: row.empleado_id,
          cliente_id: row.cliente_id,
          periodo_id: p.id,
          modulo,
          fecha: p.fecha_fin,
          monto_total: round2(monto),
          numero_cuotas: 1,
          monto_cuota: round2(monto),
          estado: 'PENDIENTE',
          observaciones: `DESCUENTO DIRECTO DESDE PLANILLA ${p.fecha_inicio} a ${p.fecha_fin}.`,
          user_id: userId,
        })
        .select('id')
        .single()

      if (descError) throw new Error(`Error creando descuento directo de ventas: ${descError.message}`)

      const descuentoId = Number(descData?.id || 0)
      if (!descuentoId) throw new Error('No se pudo obtener el ID del descuento directo.')

      const { error: cuotaError } = await supabase
        .from('rrhh_descuentos_ventas_cuotas')
        .insert({
          descuento_id: descuentoId,
          numero_cuota: 1,
          periodo_id: p.id,
          monto: round2(monto),
          estado: 'PENDIENTE',
        })

      if (cuotaError) throw new Error(`Error creando cuota directa de ventas: ${cuotaError.message}`)
    }

    for (const row of filasPagadasConVentas) {
      const montoEnPlanilla = round2(toNum(row.descuentos_ventas))
      const montoYaProgramado = round2(programadoPorEmpleado.get(row.empleado_id) || 0)
      const faltantePorProgramar = round2(montoEnPlanilla - montoYaProgramado)

      if (faltantePorProgramar <= 0) continue

      if (!row.cliente_id) {
        throw new Error(`El empleado ${row.codigo} - ${row.nombre} tiene descuento de ventas pero no tiene cliente vinculado.`)
      }

      let restante = faltantePorProgramar
      const montoVentasRegulares = round2(Math.min(restante, Math.max(row.saldo_ventas, 0)))
      restante = round2(restante - montoVentasRegulares)
      const montoVentasGranja = round2(Math.min(restante, Math.max(row.saldo_granja, 0)))
      restante = round2(restante - montoVentasGranja)

      if (montoVentasRegulares > 0) {
        await crearDescuento(row, 'VENTAS', montoVentasRegulares)
      }

      if (montoVentasGranja > 0) {
        await crearDescuento(row, 'GRANJA_CERDOS', montoVentasGranja)
      }

      if (restante > 0) {
        throw new Error(
          `El descuento de ventas de ${row.codigo} - ${row.nombre} excede la deuda actual por ${money(restante)}. `
          + `Deuda actual: ventas ${money(row.saldo_ventas)}, granja ${money(row.saldo_granja)}.`
        )
      }
    }
  }

  const aplicarMovimientosPagados = async (p: Periodo) => {
    const filasPagadas = filas.filter((row) => row.estado === 'PAGADO')
    const empleadosConAnticipos = filasPagadas
      .filter((row) => toNum(row.anticipos) > 0)
      .map((row) => row.empleado_id)

    const empleadosConPrestamos = filasPagadas
      .filter((row) => toNum(row.prestamos) > 0)
      .map((row) => row.empleado_id)

    const empleadosConVentas = filasPagadas
      .filter((row) => toNum(row.descuentos_ventas) > 0)
      .map((row) => row.empleado_id)

    if (empleadosConAnticipos.length > 0) {
      const { error } = await supabase
        .from('rrhh_anticipos')
        .update({ estado: 'APLICADO', periodo_id: p.id })
        .in('empleado_id', empleadosConAnticipos)
        .eq('estado', 'PENDIENTE')
        .lte('fecha', p.fecha_fin)

      if (error) throw new Error(`Error aplicando anticipos: ${error.message}`)
    }

    if (empleadosConPrestamos.length > 0) {
      const { data: cuotasData, error: cuotasError } = await supabase
        .from('rrhh_prestamo_cuotas')
        .select('id,prestamo_id,rrhh_prestamos!inner(empleado_id)')
        .eq('estado', 'PENDIENTE')
        .eq('periodo_id', p.id)
        .in('rrhh_prestamos.empleado_id', empleadosConPrestamos)

      if (cuotasError) throw new Error(`Error buscando cuotas de préstamo: ${cuotasError.message}`)

      const cuotas = (cuotasData || []) as unknown[]
      const cuotaIds: number[] = []
      const prestamoIds = new Set<number>()

      cuotas.forEach((item) => {
        const row = item as { id?: number; prestamo_id?: number }
        const cuotaId = Number(row.id || 0)
        const prestamoId = Number(row.prestamo_id || 0)

        if (cuotaId > 0) cuotaIds.push(cuotaId)
        if (prestamoId > 0) prestamoIds.add(prestamoId)
      })

      if (cuotaIds.length > 0) {
        const { error } = await supabase
          .from('rrhh_prestamo_cuotas')
          .update({ estado: 'APLICADA' })
          .in('id', cuotaIds)

        if (error) throw new Error(`Error aplicando cuotas de préstamo: ${error.message}`)
      }

      for (const prestamoId of Array.from(prestamoIds)) {
        const { count, error: countError } = await supabase
          .from('rrhh_prestamo_cuotas')
          .select('id', { count: 'exact', head: true })
          .eq('prestamo_id', prestamoId)
          .eq('estado', 'PENDIENTE')

        if (countError) throw new Error(`Error revisando préstamo: ${countError.message}`)

        if ((count || 0) === 0) {
          const { error } = await supabase
            .from('rrhh_prestamos')
            .update({ estado: 'PAGADO' })
            .eq('id', prestamoId)

          if (error) throw new Error(`Error cerrando préstamo: ${error.message}`)
        }
      }
    }

    if (empleadosConVentas.length > 0) {
      const { data: cuotasData, error: cuotasError } = await supabase
        .from('rrhh_descuentos_ventas_cuotas')
        .select('id,descuento_id,rrhh_descuentos_ventas!inner(empleado_id)')
        .eq('estado', 'PENDIENTE')
        .eq('periodo_id', p.id)
        .in('rrhh_descuentos_ventas.empleado_id', empleadosConVentas)

      if (cuotasError) throw new Error(`Error buscando cuotas de ventas: ${cuotasError.message}`)

      const cuotasVentas = (cuotasData || []) as unknown[]
      const cuotaIds: number[] = []
      const descuentoIds = new Set<number>()

      cuotasVentas.forEach((item) => {
        const row = item as { id?: number; descuento_id?: number }
        const cuotaId = Number(row.id || 0)
        const descuentoId = Number(row.descuento_id || 0)

        if (cuotaId > 0) cuotaIds.push(cuotaId)
        if (descuentoId > 0) descuentoIds.add(descuentoId)
      })

      if (cuotaIds.length > 0) {
        const { error } = await supabase
          .from('rrhh_descuentos_ventas_cuotas')
          .update({ estado: 'APLICADA' })
          .in('id', cuotaIds)

        if (error) throw new Error(`Error aplicando cuotas de ventas: ${error.message}`)
      }

      for (const descuentoId of Array.from(descuentoIds)) {
        const { count, error: countError } = await supabase
          .from('rrhh_descuentos_ventas_cuotas')
          .select('id', { count: 'exact', head: true })
          .eq('descuento_id', descuentoId)
          .eq('estado', 'PENDIENTE')

        if (countError) throw new Error(`Error revisando descuento de ventas: ${countError.message}`)

        if ((count || 0) === 0) {
          const { error } = await supabase
            .from('rrhh_descuentos_ventas')
            .update({ estado: 'APLICADO' })
            .eq('id', descuentoId)

          if (error) throw new Error(`Error cerrando descuento de ventas: ${error.message}`)
        }
      }
    }

    const hayPendientes = filas.some((row) => row.estado === 'PENDIENTE')
    const hayPagadas = filas.some((row) => row.estado === 'PAGADO')
    const nuevoEstadoPeriodo = hayPendientes ? 'ABIERTO' : hayPagadas ? 'PAGADO' : 'ANULADO'

    const { error: periodoError } = await supabase
      .from('rrhh_periodos_planilla')
      .update({
        estado: nuevoEstadoPeriodo,
        pagado_en: nuevoEstadoPeriodo === 'PAGADO' ? new Date().toISOString() : null,
      })
      .eq('id', p.id)

    if (periodoError) throw new Error(`Error actualizando período: ${periodoError.message}`)
  }

  const guardarPlanilla = async () => {
    if (filas.length === 0) {
      alert('Primero carga o genera una planilla.')
      return
    }

    setSaving(true)
    setMensaje('')

    try {
      const p = periodo || (await obtenerOCrearPeriodo())
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const userEmail = userData?.user?.email || null

      const payload = filas.map((row) => ({
        periodo_id: p.id,
        empleado_id: row.empleado_id,
        salario_base: round2(toNum(row.salario_base)),
        salario_diario: round2(row.salario_diario),
        hora_normal: round2(row.hora_normal),
        dias_trabajados: round2(toNum(row.dias_trabajados)),
        horas_extra: round2(toNum(row.horas_extra)),
        valor_hora_extra: round2(row.valor_hora_extra),
        salario_ordinario: round2(row.salario_ordinario),
        monto_horas_extra: round2(row.monto_horas_extra),
        bono_produccion_diario: round2(toNum(row.bono_produccion_diario)),
        bono_produccion_total: round2(row.bono_produccion_total),
        bonificacion_ley: round2(toNum(row.bonificacion_ley)),
        otros_bonos: round2(toNum(row.otros_bonos)),
        igss: round2(toNum(row.igss)),
        irtra: round2(toNum(row.irtra)),
        anticipos: round2(toNum(row.anticipos)),
        prestamos: round2(toNum(row.prestamos)),
        descuentos_ventas: round2(toNum(row.descuentos_ventas)),
        descuentos_manual: round2(toNum(row.descuentos_manual)),
        total_devengado: round2(row.total_devengado),
        total_descuentos: round2(row.total_descuentos),
        liquido_pagar: round2(row.liquido_pagar),
        estado: row.estado,
        fecha_pago: row.estado === 'PAGADO' ? row.fecha_pago || todayISO() : null,
        observaciones: row.observaciones || null,
        user_id: userId,
        updated_at: new Date().toISOString(),
        editado_por: userEmail,
        editado_en: new Date().toISOString(),
      }))

      const { data: saved, error } = await supabase
        .from('rrhh_planilla_empleado')
        .upsert(payload, { onConflict: 'periodo_id,empleado_id' })
        .select('id,empleado_id')

      if (error) throw new Error(`Error guardando planilla: ${error.message}`)

      const savedRows = (saved || []) as { id: number; empleado_id: number }[]
      const idByEmpleado = new Map(savedRows.map((r) => [Number(r.empleado_id), Number(r.id)]))

      for (const row of filas) {
        const planillaId = idByEmpleado.get(row.empleado_id) || row.id
        if (!planillaId) continue

        await supabase.from('rrhh_planilla_detalle').delete().eq('planilla_empleado_id', planillaId)
        await supabase.from('rrhh_planilla_area_costo').delete().eq('planilla_empleado_id', planillaId)

        const detalles = detalleParaFila(row).map((d) => ({
          planilla_empleado_id: planillaId,
          tipo: d.tipo,
          concepto: d.concepto,
          monto: round2(toNum(d.monto)),
        }))

        if (detalles.length > 0) {
          const { error: detErr } = await supabase.from('rrhh_planilla_detalle').insert(detalles)
          if (detErr) throw new Error(`Error guardando detalle: ${detErr.message}`)
        }

        const dist = distribucionesPorEmpleado.get(row.empleado_id) || []
        const costos = dist
          .filter((d) => toNum(d.porcentaje) > 0)
          .map((d) => ({
            planilla_empleado_id: planillaId,
            area_id: d.area_id,
            porcentaje: round2(toNum(d.porcentaje)),
            monto: round2(row.liquido_pagar * (toNum(d.porcentaje) / 100)),
          }))

        if (costos.length > 0) {
          const { error: costErr } = await supabase.from('rrhh_planilla_area_costo').insert(costos)
          if (costErr) throw new Error(`Error guardando distribución: ${costErr.message}`)
        }
      }

      await crearDescuentosVentasDirectos(p, userId)
      await aplicarMovimientosPagados(p)

      setFilas((prev) =>
        prev.map((row) => ({ ...row, id: idByEmpleado.get(row.empleado_id) || row.id }))
      )

      setMensaje('Planilla guardada correctamente. Los anticipos y cuotas de empleados marcados como pagados quedaron aplicados.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error guardando planilla.')
    } finally {
      setSaving(false)
    }
  }

  const imprimirFicha = async (row: PlanillaRow) => {
    const doc = new jsPDF('p', 'mm', 'letter') as AutoTableDoc
    await addHeader(doc, 'FICHA DE PAGO QUINCENAL')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${row.codigo} - ${row.nombre}`, 14, 38)
    doc.setFont('helvetica', 'normal')
    doc.text(`Período: ${fechas.etiqueta}`, 14, 45)
    doc.text(`Estado: ${row.estado}`, 105, 45)
    doc.text(`Fecha de pago: ${row.fecha_pago || 'Pendiente'}`, 150, 45)

    autoTable(doc, {
      startY: 54,
      head: [['Concepto', 'Cantidad / base', 'Monto']],
      body: [
        ['Salario base mensual', '', money(row.salario_base)],
        ['Salario diario', 'Salario / 30', money(row.salario_diario)],
        ['Días trabajados', row.dias_trabajados, money(row.salario_ordinario)],
        ['Horas extra', `${row.horas_extra} h x ${money(row.valor_hora_extra)}`, money(row.monto_horas_extra)],
        ['Bono producción', `${money(row.bono_produccion_diario)} x ${row.dias_trabajados} días`, money(row.bono_produccion_total)],
        ['Bonificación de ley', '', money(row.bonificacion_ley)],
        ['Otros bonos', '', money(row.otros_bonos)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    const afterDev = (doc.lastAutoTable?.finalY || 54) + 6

    autoTable(doc, {
      startY: afterDev,
      head: [['Descuento', 'Monto']],
      body: [
        ['IGSS', money(row.igss)],
        ['IRTRA', money(row.irtra)],
        ['Anticipos', money(row.anticipos)],
        ['Préstamos', money(row.prestamos)],
        ['Ventas descontadas', money(row.descuentos_ventas)],
        ['Otros descuentos', money(row.descuentos_manual)],
      ].filter((r) => toNum(r[1].replace('Q', '')) !== 0),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80] },
    })

    const afterDisc = (doc.lastAutoTable?.finalY || afterDev) + 8

    autoTable(doc, {
      startY: afterDisc,
      body: [
        ['Total devengado', money(row.total_devengado)],
        ['Total descuentos', money(row.total_descuentos)],
        ['Líquido a recibir', money(row.liquido_pagar)],
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

    if (row.observaciones) {
      doc.setFontSize(8)
      doc.text(`Observaciones: ${row.observaciones}`, 14, yFirma + 36, { maxWidth: 180 })
    }

    doc.save(`ficha_planilla_${row.codigo}_${anio}_${String(mes).padStart(2, '0')}_Q${quincena}.pdf`)
  }

  const imprimirReporteGeneral = async () => {
    if (filas.length === 0) {
      alert('No hay planilla cargada.')
      return
    }

    const doc = new jsPDF('l', 'mm', 'letter') as AutoTableDoc
    await addHeader(doc, 'REPORTE GENERAL DE PLANILLA')

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
        <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-14" />
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
              onChange={(e) => setAnio(e.target.value)}
            />
          </label>

          <label className="text-sm">
            Mes
            <select
              className="mt-1 border rounded px-3 py-2 w-full"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
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
              onChange={(e) => setQuincena(e.target.value as '1' | '2')}
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
            disabled={saving || filas.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

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
          onClick={marcarTodosPagados}
          disabled={filas.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          Marcar todos pagados
        </button>
        <button
          type="button"
          onClick={marcarTodosPendientes}
          disabled={filas.length === 0}
          className="bg-slate-500 hover:bg-slate-600 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          Marcar todos pendientes
        </button>
        <button
          type="button"
          onClick={imprimirReporteGeneral}
          disabled={filas.length === 0}
          className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          PDF general
        </button>
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
                    onChange={(e) => updateRow(row.empleado_id, 'salario_base', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">Día {money(row.salario_diario)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-16"
                    value={row.dias_trabajados}
                    onChange={(e) => updateRow(row.empleado_id, 'dias_trabajados', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">{money(row.salario_ordinario)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-16"
                    value={row.horas_extra}
                    onChange={(e) => updateRow(row.empleado_id, 'horas_extra', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500">{money(row.monto_horas_extra)}</div>
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.bono_produccion_diario}
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
                    onChange={(e) => updateRow(row.empleado_id, 'bonificacion_ley', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.igss}
                    onChange={(e) => updateRow(row.empleado_id, 'igss', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.irtra}
                    onChange={(e) => updateRow(row.empleado_id, 'irtra', e.target.value)}
                  />
                </td>

                <td className="border p-2">
                  <input
                    type="number"
                    className="border rounded px-1 py-1 w-20"
                    value={row.anticipos}
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
                    onChange={(e) => updateRow(row.empleado_id, 'descuentos_manual', e.target.value)}
                  />
                </td>

                <td className="border p-2 font-bold text-right min-w-[90px]">
                  <div>{money(row.liquido_pagar)}</div>
                  <div className="text-[10px] text-slate-500">Dev. {money(row.total_devengado)}</div>
                  <div className="text-[10px] text-red-700">Desc. {money(row.total_descuentos)}</div>
                </td>

                <td className="border p-2">
                  <select
                    className="border rounded px-1 py-1"
                    value={row.estado}
                    onChange={(e) => updateEstado(row.empleado_id, e.target.value as PlanillaRow['estado'])}
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="PAGADO">Pagado</option>
                    <option value="ANULADO">Anulado</option>
                  </select>

                  {row.estado === 'PAGADO' && (
                    <input
                      type="date"
                      className="border rounded px-1 py-1 mt-1 w-full"
                      value={row.fecha_pago}
                      onChange={(e) => updateRow(row.empleado_id, 'fecha_pago', e.target.value)}
                    />
                  )}
                </td>

                <td className="border p-2 min-w-[120px]">
                  <button
                    type="button"
                    onClick={() => imprimirFicha(row)}
                    className="bg-slate-700 hover:bg-slate-800 text-white rounded px-2 py-1 text-xs mb-1 w-full"
                  >
                    Ficha PDF
                  </button>
                  <textarea
                    className="border rounded px-1 py-1 w-full text-[11px]"
                    placeholder="Observaciones"
                    value={row.observaciones}
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
