'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Empleado = { id: number; codigo: string; nombre_completo: string; cliente_id: number | null; estado: string }
type Periodo = { id: number; anio: number; mes: number; quincena: number; fecha_inicio: string; fecha_fin: string; estado: string }
type Cliente = { id: number; nombre: string }
type Saldo = { cliente_id: number; cliente: string | null; saldo_ventas: number; saldo_granja: number; saldo_total: number }
type Anticipo = { id: number; empleado_id: number; erogacion_id: number | null; fecha: string; monto: number; periodo_id: number | null; estado: string; observaciones: string | null }
type Aplicacion = { id: number; anticipo_id: number; ficha_id: number; monto: number; fecha_aplicacion: string; origen: string }
type Prestamo = { id: number; fecha: string; monto_total: number; estado: string; numero_cuotas: number; observaciones: string | null }
type CuotaPrestamo = { id: number; prestamo_id: number; numero_cuota: number; periodo_id: number | null; monto: number; estado: string }
type Descuento = { id: number; fecha: string; cliente_id: number | null; modulo: string; monto_total: number; estado: string; observaciones: string | null; referencia_id: number | null; referencia_tabla: string | null }
type CuotaVenta = { id: number; descuento_id: number; numero_cuota: number; periodo_id: number | null; monto: number; estado: string; aplicado_en: string | null; aplicado_monto_ventas: number; aplicado_monto_granja: number }
type Ficha = { id: number; periodo_id: number; estado: string; fecha_pago: string | null; anticipos: number; prestamos: number; descuentos_ventas: number; liquido_pagar: number }
type Venta = { id: number; fecha: string; cliente_id: number | null }
type DetalleVenta = { id: number; venta_id: number; concepto: string; importe: number }
type PagoVenta = { id: number; venta_id: number | null; fecha: string; monto: number; observaciones: string | null }

type Movimiento = {
  fecha: string
  tipo: string
  referencia: string
  descripcion: string
  monto: number | null
  estado: string
  periodo: string
  observacion?: string
}

type Datos = {
  anticipos: Anticipo[]
  aplicaciones: Aplicacion[]
  prestamos: Prestamo[]
  cuotasPrestamo: CuotaPrestamo[]
  descuentos: Descuento[]
  cuotasVenta: CuotaVenta[]
  fichas: Ficha[]
  ventas: Venta[]
  detalles: DetalleVenta[]
  pagos: PagoVenta[]
}

const vacios: Datos = { anticipos: [], aplicaciones: [], prestamos: [], cuotasPrestamo: [], descuentos: [], cuotasVenta: [], fichas: [], ventas: [], detalles: [], pagos: [] }
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const fmt = (v: unknown) => `Q${num(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fechaFmt = (v?: string | null) => v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : 'Sin fecha registrada'
const redondear = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
const similar = (a: string, b: string) => {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || a.length < 4 || b.length < 4) return false
  let i = 0; let j = 0; let cambios = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++cambios > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return cambios + (a.length - i) + (b.length - j) <= 1
}

export default function EstadoCuentaRRHHPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empleadoId, setEmpleadoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState('TODOS')
  const [datos, setDatos] = useState<Datos>(vacios)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [avisoGeneral, setAvisoGeneral] = useState('')
  const [pendientesPorEmpleado, setPendientesPorEmpleado] = useState<Map<number, number>>(new Map())

  const empleado = useMemo(() => empleados.find((e) => e.id === Number(empleadoId)), [empleados, empleadoId])
  const periodoMap = useMemo(() => new Map(periodos.map((p) => [p.id, p])), [periodos])
  const saldo = useMemo(() => saldos.find((s) => Number(s.cliente_id) === Number(empleado?.cliente_id)), [saldos, empleado])
  const nombrePeriodo = useMemo(() => (id: number | null) => {
    const p = id ? periodoMap.get(Number(id)) : undefined
    return p ? `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${fechaFmt(p.fecha_inicio)}–${fechaFmt(p.fecha_fin)})` : 'Sin quincena asignada'
  }, [periodoMap])

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      try {
        const [resEmp, resPer, resSal, resCuotas, resClientes] = await Promise.all([
          supabase.from('rrhh_empleados').select('id,codigo,nombre_completo,cliente_id,estado').order('nombre_completo'),
          supabase.from('rrhh_periodos_planilla').select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado'),
          supabase.from('rrhh_v_cliente_saldo_total').select('cliente_id,cliente,saldo_ventas,saldo_granja,saldo_total'),
          supabase.from('rrhh_descuentos_ventas_cuotas').select('monto,estado,rrhh_descuentos_ventas!inner(empleado_id,estado)').eq('estado', 'PENDIENTE').eq('rrhh_descuentos_ventas.estado', 'PENDIENTE'),
          supabase.from('clientes').select('id,nombre').order('nombre'),
        ])
        for (const [nombre, res] of [['empleados', resEmp], ['periodos', resPer], ['saldos', resSal], ['cuotas', resCuotas], ['clientes', resClientes]] as const) {
          if (res.error) throw new Error(`No se pudieron consultar ${nombre}: ${res.error.message}`)
        }
        if ((resEmp.data || []).length >= 1000 || (resCuotas.data || []).length >= 1000 || (resClientes.data || []).length >= 1000) throw new Error('La consulta general alcanzó el límite de 1000 registros. No se mostrarán resultados incompletos; habrá que agregar paginación.')
        const m = new Map<number, number>()
        ;((resCuotas.data || []) as unknown[]).forEach((item) => {
          const r = item as { monto: number; rrhh_descuentos_ventas?: { empleado_id: number } | { empleado_id: number }[] }
          const d = Array.isArray(r.rrhh_descuentos_ventas) ? r.rrhh_descuentos_ventas[0] : r.rrhh_descuentos_ventas
          if (d?.empleado_id) m.set(Number(d.empleado_id), redondear((m.get(Number(d.empleado_id)) || 0) + num(r.monto)))
        })
        if (vigente) {
          const lista = (resEmp.data || []) as Empleado[]
          setEmpleados(lista)
          setPeriodos((resPer.data || []) as Periodo[])
          setSaldos((resSal.data || []) as Saldo[])
          setClientes((resClientes.data || []) as Cliente[])
          setPendientesPorEmpleado(m)
          const initial = new URLSearchParams(window.location.search).get('empleado_id')
          setEmpleadoId((actual) => actual || (initial && lista.some((e) => String(e.id) === initial) ? initial : String(lista[0]?.id || '')))
        }
      } catch (err) {
        if (vigente) setAvisoGeneral(err instanceof Error ? err.message : 'No se pudo consultar el resumen de RRHH.')
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [])

  useEffect(() => {
    if (!empleado) { setDatos(vacios); return }
    let vigente = true
    const cargar = async () => {
      setError('')
      setCargando(true)
      setDatos(vacios)
      try {
        const id = empleado.id
        const [a, p, d, f, v] = await Promise.all([
          supabase.from('rrhh_anticipos').select('id,empleado_id,erogacion_id,fecha,monto,periodo_id,estado,observaciones').eq('empleado_id', id).order('fecha', { ascending: false }),
          supabase.from('rrhh_prestamos').select('id,fecha,monto_total,estado,numero_cuotas,observaciones').eq('empleado_id', id),
          supabase.from('rrhh_descuentos_ventas').select('id,fecha,cliente_id,modulo,monto_total,estado,observaciones,referencia_id,referencia_tabla').eq('empleado_id', id),
          supabase.from('rrhh_planilla_empleado').select('id,periodo_id,estado,fecha_pago,anticipos,prestamos,descuentos_ventas,liquido_pagar').eq('empleado_id', id),
          empleado.cliente_id ? supabase.from('ventas').select('id,fecha,cliente_id').eq('cliente_id', empleado.cliente_id).order('fecha', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ])
        for (const [nombre, res] of [['anticipos', a], ['préstamos', p], ['descuentos', d], ['fichas', f], ['ventas', v]] as const) {
          if (res.error) throw new Error(`Error en ${nombre}: ${res.error.message}`)
        }
        if ([a,p,d,f,v].some((res) => (res.data || []).length >= 1000)) throw new Error('Este empleado tiene 1000 o más registros en una consulta. El informe evita mostrar un historial truncado.')
        const listaA = (a.data || []) as Anticipo[]
        const listaP = (p.data || []) as Prestamo[]
        const listaD = (d.data || []) as Descuento[]
        const listaV = (v.data || []) as Venta[]
        const consultarHijos = async (tabla: string, columnas: string, campo: string, ids: number[]) => {
          if (!ids.length) return []
          // En lotes: PostgREST puede rechazar un filtro IN demasiado grande.
          const lotes: unknown[] = []
          for (let i = 0; i < ids.length; i += 100) {
            const r = await supabase.from(tabla).select(columnas).in(campo, ids.slice(i, i + 100))
            if (r.error) throw new Error(`Error consultando ${tabla}: ${r.error.message}`)
            if ((r.data || []).length >= 1000) throw new Error(`Demasiados registros en ${tabla}. No se mostrará un historial truncado.`)
            lotes.push(...(r.data || []))
          }
          return lotes
        }
        const [ap, cp, cv, det, pag] = await Promise.all([
          consultarHijos('rrhh_anticipo_aplicaciones', 'id,anticipo_id,ficha_id,monto,fecha_aplicacion,origen', 'anticipo_id', listaA.map((r) => r.id)),
          consultarHijos('rrhh_prestamo_cuotas', 'id,prestamo_id,numero_cuota,periodo_id,monto,estado', 'prestamo_id', listaP.map((r) => r.id)),
          consultarHijos('rrhh_descuentos_ventas_cuotas', 'id,descuento_id,numero_cuota,periodo_id,monto,estado,aplicado_en,aplicado_monto_ventas,aplicado_monto_granja', 'descuento_id', listaD.map((r) => r.id)),
          consultarHijos('detalle_venta', 'id,venta_id,concepto,importe', 'venta_id', listaV.map((r) => r.id)),
          empleado.cliente_id ? (async () => {
            const r = await supabase.from('pagos_venta').select('id,venta_id,fecha,monto,observaciones').eq('cliente_id', empleado.cliente_id)
            if (r.error) throw new Error(`Error consultando pagos de ventas: ${r.error.message}`)
            if ((r.data || []).length >= 1000) throw new Error('Hay demasiados pagos de ventas. El informe evita mostrar datos incompletos.')
            return (r.data || []) as PagoVenta[]
          })() : Promise.resolve([] as PagoVenta[]),
        ])
        if (vigente) setDatos({
          anticipos: listaA, aplicaciones: ap as Aplicacion[], prestamos: listaP, cuotasPrestamo: cp as CuotaPrestamo[],
          descuentos: listaD, cuotasVenta: cv as CuotaVenta[], fichas: (f.data || []) as Ficha[],
          ventas: listaV, detalles: det as DetalleVenta[], pagos: pag as PagoVenta[],
        })
      } catch (err) {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar el estado de cuenta.')
      } finally { if (vigente) setCargando(false) }
    }
    void cargar()
    return () => { vigente = false }
  }, [empleado])

  const resumen = useMemo(() => {
    const anticiposValidos = datos.anticipos.filter((a) => a.estado !== 'ANULADO')
    const anticipoEntregado = redondear(anticiposValidos.reduce((s, a) => s + num(a.monto), 0))
    const anticipoRecuperado = redondear(datos.aplicaciones.reduce((s, a) => s + num(a.monto), 0))
    const prestamosActivos = datos.prestamos.filter((p) => p.estado !== 'ANULADO')
    const prestamoOriginal = redondear(prestamosActivos.reduce((s, p) => s + num(p.monto_total), 0))
    const prestamoCuotasPendientes = redondear(datos.cuotasPrestamo.filter((c) => c.estado === 'PENDIENTE').reduce((s, c) => s + num(c.monto), 0))
    const cuotasVentas = redondear(datos.cuotasVenta.filter((c) => c.estado === 'PENDIENTE' && datos.descuentos.some((d) => d.id === c.descuento_id && d.estado === 'PENDIENTE')).reduce((s, c) => s + num(c.monto), 0))
    return { anticipoEntregado, anticipoRecuperado, anticipoSaldo: redondear(anticipoEntregado - anticipoRecuperado), prestamoOriginal, prestamoCuotasPendientes, cuotasVentas }
  }, [datos])

  const movimientos = useMemo(() => {
    const lista: Movimiento[] = []
    for (const a of datos.anticipos) {
      const abonado = datos.aplicaciones.filter((ap) => ap.anticipo_id === a.id).reduce((s, ap) => s + num(ap.monto), 0)
      lista.push({ fecha: a.fecha, tipo: 'Entrega de anticipo', referencia: `Anticipo #${a.id}${a.erogacion_id ? ` / Erog. #${a.erogacion_id}` : ''}`, descripcion: a.observaciones || 'Dinero entregado al empleado', monto: a.monto, estado: `${a.estado} · saldo ${fmt(Math.max(0, num(a.monto) - abonado))}`, periodo: nombrePeriodo(a.periodo_id), observacion: 'La fecha de entrega no determina por sí sola la quincena de recuperación.' })
    }
    for (const a of datos.aplicaciones) {
      const ficha = datos.fichas.find((f) => f.id === a.ficha_id)
      lista.push({ fecha: a.fecha_aplicacion, tipo: 'Recuperación de anticipo', referencia: `Anticipo #${a.anticipo_id} / Ficha #${a.ficha_id}`, descripcion: `Origen: ${a.origen}`, monto: -num(a.monto), estado: ficha ? `Ficha ${ficha.estado}` : 'Ficha no encontrada', periodo: ficha ? nombrePeriodo(ficha.periodo_id) : 'Sin período', observacion: 'Fecha de aplicación registrada, no necesariamente fecha de entrega del anticipo.' })
    }
    for (const p of datos.prestamos) {
      const pendiente = datos.cuotasPrestamo.filter((c) => c.prestamo_id === p.id && c.estado === 'PENDIENTE').reduce((s, c) => s + num(c.monto), 0)
      lista.push({ fecha: p.fecha, tipo: 'Préstamo', referencia: `Préstamo #${p.id}`, descripcion: p.observaciones || `${p.numero_cuotas} cuotas`, monto: p.monto_total, estado: `${p.estado} · cuotas pendientes ${fmt(pendiente)}`, periodo: 'Según calendario de cuotas' })
    }
    for (const c of datos.cuotasPrestamo) {
      lista.push({ fecha: '', tipo: 'Cuota de préstamo', referencia: `Préstamo #${c.prestamo_id} / Cuota #${c.numero_cuota}`, descripcion: 'Recuperación programada del préstamo', monto: c.monto, estado: c.estado, periodo: nombrePeriodo(c.periodo_id), observacion: 'Esta tabla no guarda la fecha exacta de cobro: APLICADA no prueba por sí solo cuándo se pagó el salario.' })
    }
    for (const d of datos.descuentos) {
      lista.push({ fecha: d.fecha, tipo: 'Plan de descuento por venta', referencia: `Plan #${d.id}`, descripcion: d.observaciones || `Origen ${d.modulo}${d.referencia_id ? ` #${d.referencia_id}` : ''}`, monto: d.monto_total, estado: d.estado, periodo: 'Según calendario de cuotas', observacion: 'El plan de descuento NO es una nueva venta ni un préstamo adicional.' })
    }
    for (const c of datos.cuotasVenta) {
      const plan = datos.descuentos.find((d) => d.id === c.descuento_id)
      lista.push({ fecha: c.aplicado_en?.slice(0, 10) || '', tipo: 'Cuota por venta', referencia: `Plan #${c.descuento_id} / Cuota #${c.numero_cuota}`, descripcion: `Fuente: ${plan?.modulo || 'Desconocida'}`, monto: c.monto, estado: c.estado, periodo: nombrePeriodo(c.periodo_id), observacion: c.estado === 'APLICADA' ? `Aplicación a ventas: ${fmt(c.aplicado_monto_ventas)}; granja: ${fmt(c.aplicado_monto_granja)}` : undefined })
    }
    for (const v of datos.ventas) {
      const detalles = datos.detalles.filter((d) => d.venta_id === v.id)
      const importe = detalles.reduce((s, d) => s + num(d.importe), 0)
      const pagos = datos.pagos.filter((p) => p.venta_id === v.id).reduce((s, p) => s + num(p.monto), 0)
      lista.push({ fecha: v.fecha, tipo: 'Venta a cliente/empleado', referencia: `Venta #${v.id}`, descripcion: detalles.map((d) => d.concepto).join('; ') || 'Sin detalles', monto: redondear(importe), estado: `Pagos vinculados ${fmt(pagos)} · diferencia ${fmt(Math.max(0, importe - pagos))}`, periodo: 'No es descuento automático', observacion: 'Pagos sin venta_id no pueden asignarse a esta venta; usar el saldo oficial del cliente para determinar deuda real.' })
    }
    for (const p of datos.pagos) {
      lista.push({ fecha: p.fecha, tipo: 'Pago de venta', referencia: `Pago #${p.id}${p.venta_id ? ` / Venta #${p.venta_id}` : ' / Sin venta asignada'}`, descripcion: p.observaciones || 'Abono registrado en Ventas', monto: -num(p.monto), estado: 'Registrado', periodo: 'No corresponde necesariamente a una planilla' })
    }
    for (const f of datos.fichas) {
      lista.push({ fecha: f.fecha_pago || '', tipo: 'Ficha de planilla', referencia: `Ficha #${f.id}`, descripcion: `Anticipos ${fmt(f.anticipos)} · Préstamos ${fmt(f.prestamos)} · Ventas ${fmt(f.descuentos_ventas)} · Líquido ${fmt(f.liquido_pagar)}`, monto: null, estado: f.estado, periodo: nombrePeriodo(f.periodo_id), observacion: f.estado === 'PAGADO' ? 'Estado registrado en sistema; requiere comprobante externo para confirmar la entrega efectiva del salario.' : undefined })
    }
    return lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || a.tipo.localeCompare(b.tipo))
  }, [datos, nombrePeriodo])

  const tiposDisponibles = useMemo(() => [...new Set(movimientos.map((m) => m.tipo))].sort(), [movimientos])
  const movimientosFiltrados = useMemo(() => movimientos.filter((m) =>
    (tipo === 'TODOS' || tipo === m.tipo) && (!desde || m.fecha >= desde) && (!hasta || (m.fecha && m.fecha <= hasta))
  ), [movimientos, tipo, desde, hasta])

  const exportarCSV = () => {
    if (!empleado || !movimientosFiltrados.length) return
    const seguro = (v: unknown) => {
      const texto = String(v ?? '')
      // Evita que Excel interprete fórmulas de campos libres.
      const neutral = /^[=+@-]/.test(texto.trim()) ? `'${texto}` : texto
      return `"${neutral.replace(/"/g, '""')}"`
    }
    const filas = [
      ['Fecha', 'Tipo', 'Referencia', 'Descripción', 'Importe Q', 'Estado / saldo', 'Período', 'Información adicional'],
      ...movimientosFiltrados.map((m) => [m.fecha, m.tipo, m.referencia, m.descripcion, m.monto === null ? '' : String(m.monto), m.estado, m.periodo, m.observacion || '']),
    ]
    const csv = '\ufeff' + filas.map((f) => f.map(seguro).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `estado_cuenta_${empleado.codigo}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const empleadosFiltrados = useMemo(() => empleados.filter((e) => `${e.codigo} ${e.nombre_completo}`.toLowerCase().includes(busqueda.toLowerCase())), [empleados, busqueda])
  const alertasEmpleados = useMemo(() => empleados.map((e) => {
    const saldoE = saldos.find((s) => s.cliente_id === e.cliente_id)
    const deuda = e.cliente_id ? num(saldoE?.saldo_total) : 0
    return { ...e, deuda, programado: pendientesPorEmpleado.get(e.id) || 0 }
  }).filter((e) => !e.cliente_id || e.deuda > e.programado + 0.009), [empleados, saldos, pendientesPorEmpleado])

  const posiblesClientes = useMemo(() => {
    if (!empleado) return [] as Cliente[]
    const nombreEmpleado = normalizar(empleado.nombre_completo)
    return clientes.filter((c) => {
      if (c.id === empleado.cliente_id) return false
      const nombreCliente = normalizar(c.nombre)
      // Sugerencia, nunca relación automática: coincidencia de nombre y otro término.
      return nombreEmpleado.length > 1 && nombreCliente.length > 1
        && similar(nombreEmpleado[0], nombreCliente[0])
        && nombreCliente.slice(1).some((t) => nombreEmpleado.slice(1).some((x) => similar(x, t)))
    }).slice(0, 10)
  }, [empleado, clientes])

  const alertas: string[] = []
  if (empleado && !empleado.cliente_id) alertas.push('Este empleado NO tiene cliente relacionado. Sus ventas a crédito no se identifican automáticamente para RRHH. Comprueba la identidad y vincúlalo en Empleados.')
  if (empleado?.cliente_id && !saldo) alertas.push('No se recibió un saldo para el cliente vinculado; revisa la vista de saldos si esperabas una deuda.')
  if (posiblesClientes.length > 0) alertas.push('Hay clientes con nombres parecidos al empleado pero con un ID distinto. Comprueba si están duplicados o mal vinculados; NO se asociarán automáticamente.')
  if (saldo && num(saldo.saldo_total) > resumen.cuotasVentas + 0.009) alertas.push(`Hay deuda de cliente (${fmt(saldo.saldo_total)}) mayor que las cuotas de ventas pendientes de RRHH (${fmt(resumen.cuotasVentas)}). La diferencia NO se descuenta automáticamente; debe programarse.`)
  if (saldo && resumen.cuotasVentas > num(saldo.saldo_total) + 0.009) alertas.push('Las cuotas programadas superan el saldo de cliente. Revisa las cuotas para evitar descuentos excesivos.')
  const fichasPagadas = datos.fichas.filter((f) => f.estado === 'PAGADO')
  if (fichasPagadas.some((f) => num(f.anticipos) > 0 && !datos.aplicaciones.some((a) => a.ficha_id === f.id))) alertas.push('Existe al menos una ficha PAGADA con anticipos descontados pero sin aplicaciones vinculadas. Puede haber historial inconsistente: no se modifica automáticamente.')
  if (datos.pagos.some((p) => !p.venta_id)) alertas.push('Hay pagos de cliente sin venta_id; el saldo por cada venta no puede calcularse de forma exacta. El saldo oficial del cliente prevalece.')

  return <main className="mx-auto max-w-7xl p-6 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div><h1 className="text-2xl font-bold">RRHH — Estado de cuenta de empleados</h1><p className="text-sm text-slate-600 mt-1">Ventas, préstamos, anticipos, cuotas y fichas; información de solo lectura.</p></div>
      <Link href="/rrhh" className="rounded bg-slate-700 px-4 py-2 text-white text-sm">Volver a RRHH</Link>
    </div>
    {avisoGeneral && <p role="alert" className="border border-red-400 p-3 mb-4 text-red-800">{avisoGeneral}</p>}
    <section className="border rounded-lg bg-white p-4 mb-5">
      <h2 className="font-semibold mb-3">Buscar y seleccionar empleado</h2>
      <div className="flex flex-col md:flex-row gap-3">
        <input className="border rounded p-2 flex-1" placeholder="Código o nombre" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <select className="border rounded p-2 md:w-96" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}><option value="">Selecciona empleado</option>{empleadosFiltrados.map((e) => <option key={e.id} value={String(e.id)}>{e.codigo} — {e.nombre_completo}</option>)}</select>
      </div>
      {empleado && <p className="mt-3 text-sm">Cliente vinculado: <strong>{empleado.cliente_id ? `${saldo?.cliente || 'ID'} #${empleado.cliente_id}` : 'NINGUNO'}</strong> <Link className="underline text-blue-700 ml-3" href="/rrhh/empleados">Configurar empleado/cliente</Link></p>}
    </section>
    <section className="border rounded-lg bg-white p-4 mb-5"><h2 className="font-semibold mb-2">Otros empleados con deudas sin recuperar o sin cliente vinculado ({alertasEmpleados.length})</h2>
      <p className="text-xs text-slate-600 mb-3">Comparación orientativa: deuda actual del cliente frente a cuotas pendientes. Puede incluir otros saldos y no significa que todas las ventas deban descontarse en esta quincena.</p>
      <div className="max-h-44 overflow-auto flex flex-wrap gap-2">{alertasEmpleados.map((e) => <button key={e.id} className="text-left border rounded px-3 py-2 text-sm hover:bg-slate-100" onClick={() => { setEmpleadoId(String(e.id)); setBusqueda('') }}>{e.codigo}: {e.nombre_completo} — {e.cliente_id ? `deuda ${fmt(e.deuda)} / cuotas ${fmt(e.programado)}` : 'sin cliente'}</button>)}{!alertasEmpleados.length && <span className="text-sm">No hay diferencias evidentes en el resumen consultado.</span>}</div>
    </section>
    {cargando && <p className="mb-4">Cargando información financiera…</p>}
    {error && <p role="alert" className="border border-red-400 p-3 mb-4 text-red-800">{error}</p>}
    {!cargando && empleado && !error && <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {[['Anticipos entregados', resumen.anticipoEntregado], ['Anticipos recuperados', resumen.anticipoRecuperado], ['Anticipos pendientes', resumen.anticipoSaldo], ['Cuotas préstamos pendientes', resumen.prestamoCuotasPendientes], ['Saldo cliente (Ventas + Granja)', saldo?.saldo_total || 0]].map(([nombre, monto]) => <div key={String(nombre)} className="border bg-white rounded p-3"><p className="text-xs text-slate-600">{nombre}</p><p className="font-bold text-lg mt-1">{fmt(monto)}</p></div>)}
      </div>
      <p className="text-sm text-slate-600 mb-4">Cuotas de ventas pendientes programadas: <strong>{fmt(resumen.cuotasVentas)}</strong>. El saldo del cliente ya incluye sus ventas: no se suma otra vez como préstamo.</p>
      {posiblesClientes.length > 0 && <section className="border rounded bg-white p-3 mb-3"><h3 className="font-semibold mb-1">Posibles clientes que debes verificar</h3><p className="text-xs text-slate-600 mb-2">Solo sugerencias por parecido de nombre. No se modifica el cliente relacionado.</p>{posiblesClientes.map((c) => <p key={c.id} className="text-sm py-1">Cliente #{c.id} — {c.nombre} · saldo {fmt(saldos.find((s) => s.cliente_id === c.id)?.saldo_total || 0)}</p>)}</section>}
      {alertas.map((a, i) => <p key={i} className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm mb-2">{a}</p>)}
      <section className="border rounded-lg bg-white p-4 mt-4">
        <h2 className="font-semibold mb-2">Conciliación de anticipos con fichas de planilla</h2>
        <p className="text-xs text-slate-600 mb-3">Permite identificar diferencias como Q100 en una quincena y Q105 en otra, sin modificar ni dar por pagados los movimientos históricos.</p>
        <div className="overflow-auto"><table className="w-full min-w-[740px] text-sm"><thead><tr className="border-b bg-slate-100">{['Quincena','Ficha','Estado','Fecha de pago declarada','Anticipo descontado en ficha','Aplicaciones asociadas','Diferencia'].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead><tbody>{[...datos.fichas].sort((a,b) => b.periodo_id-a.periodo_id).map((f) => {
          const aplicado = redondear(datos.aplicaciones.filter((a) => a.ficha_id === f.id).reduce((ac,a) => ac+num(a.monto), 0))
          const diferencia = redondear(num(f.anticipos)-aplicado)
          return <tr key={f.id} className={`border-b ${f.estado === 'PAGADO' && Math.abs(diferencia) > 0.009 ? 'bg-amber-50' : ''}`}><td className="px-3 py-2">{nombrePeriodo(f.periodo_id)}</td><td className="px-3 py-2">#{f.id}</td><td className="px-3 py-2">{f.estado}</td><td className="px-3 py-2">{fechaFmt(f.fecha_pago)}</td><td className="px-3 py-2">{fmt(f.anticipos)}</td><td className="px-3 py-2">{fmt(aplicado)}</td><td className="px-3 py-2">{fmt(diferencia)}</td></tr>
        })}{!datos.fichas.length && <tr><td className="p-3" colSpan={7}>No hay fichas guardadas.</td></tr>}</tbody></table></div>
        <p className="text-xs text-slate-600 mt-2">La diferencia no demuestra por sí sola que faltó dinero: puede haber registros antiguos sin vínculo. Un estado PAGADO no sustituye la confirmación de entrega real del salario.</p>
      </section>
      <div className="flex gap-2 flex-wrap my-5"><Link href="/rrhh/descuentos-ventas" className="bg-blue-700 text-white px-3 py-2 rounded text-sm">Programar descuento por venta</Link><Link href="/rrhh/prestamos" className="border px-3 py-2 rounded text-sm">Préstamos</Link><Link href="/rrhh/anticipos" className="border px-3 py-2 rounded text-sm">Anticipos</Link><Link href="/rrhh/planilla" className="border px-3 py-2 rounded text-sm">Planilla</Link></div>
      <h2 className="text-lg font-semibold mt-6 mb-3">Historial de movimientos ({movimientosFiltrados.length} de {movimientos.length})</h2>
      <div className="flex flex-wrap items-end gap-3 mb-3"><label className="text-sm">Desde<input className="block border rounded p-2" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label className="text-sm">Hasta<input className="block border rounded p-2" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label><label className="text-sm">Tipo<select className="block border rounded p-2" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="TODOS">Todos</option>{tiposDisponibles.map((t) => <option key={t} value={t}>{t}</option>)}</select></label><button className="border px-3 py-2 rounded text-sm" onClick={exportarCSV} disabled={movimientosFiltrados.length === 0}>Exportar CSV</button></div>
      <div className="border rounded-lg overflow-auto bg-white"><table className="w-full text-xs min-w-[1040px]"><thead className="bg-slate-100"><tr>{['Fecha del movimiento / pago','Tipo','Referencia','Detalle / explicación','Importe','Estado / saldo','Quincena de recuperación'].map((x) => <th key={x} className="text-left border-b px-3 py-2">{x}</th>)}</tr></thead><tbody>{movimientosFiltrados.map((m, i) => <tr key={`${m.tipo}-${m.referencia}-${i}`} className="border-t align-top"><td className="p-3 whitespace-nowrap">{fechaFmt(m.fecha)}</td><td className="p-3 font-semibold">{m.tipo}</td><td className="p-3">{m.referencia}</td><td className="p-3">{m.descripcion}{m.observacion && <p className="text-slate-500 mt-1">{m.observacion}</p>}</td><td className="p-3 whitespace-nowrap">{m.monto === null ? '—' : fmt(m.monto)}</td><td className="p-3">{m.estado}</td><td className="p-3">{m.periodo}</td></tr>)}{!movimientosFiltrados.length && <tr><td colSpan={7} className="p-4 text-center">Sin movimientos para este empleado.</td></tr>}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-600">Las cuotas marcadas APLICADA no prueban por sí mismas que el salario haya sido entregado. Las fechas faltantes se indican explícitamente. El historial no crea préstamos, anticipos ni pagos.</p>
    </>}
  </main>
}
