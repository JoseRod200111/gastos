'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'


const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'
type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
  cliente_id: number | null
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

type SaldoCliente = {
  cliente_id: number
  cliente: string | null
  saldo_ventas: number
  saldo_granja: number
  saldo_total: number
}

type Descuento = {
  id: number
  empleado_id: number
  cliente_id: number | null
  periodo_id: number | null
  modulo: 'VENTAS' | 'GRANJA_CERDOS' | 'MANUAL'
  fecha: string
  monto_total: number
  numero_cuotas: number
  monto_cuota: number
  estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO'
  observaciones: string | null
  created_at: string
  empleado_codigo: string
  empleado_nombre: string
  cliente_nombre: string
  periodo_texto: string
  cuotas_texto: string
}

type Cuota = {
  id: number
  descuento_id: number
  numero_cuota: number
  periodo_id: number | null
  monto: number
  estado: 'PENDIENTE' | 'APLICADA' | 'ANULADA'
}

type FormState = {
  empleado_id: string
  modulo: 'VENTAS' | 'GRANJA_CERDOS' | 'MANUAL'
  fecha: string
  monto_total: string
  numero_cuotas: string
  anio_inicio: string
  mes_inicio: string
  quincena_inicio: '1' | '2'
  observaciones: string
}

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

function todayISO() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function monthISO(anio: number, mes: number, dia: number) {
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${anio}-${m}-${d}`
}

function lastDayOfMonth(anio: number, mes: number) {
  return new Date(anio, mes, 0).getDate()
}

function fechasPeriodo(anio: number, mes: number, quincena: number) {
  if (quincena === 1) {
    return {
      fecha_inicio: monthISO(anio, mes, 1),
      fecha_fin: monthISO(anio, mes, 15),
    }
  }

  return {
    fecha_inicio: monthISO(anio, mes, 16),
    fecha_fin: monthISO(anio, mes, Math.min(30, lastDayOfMonth(anio, mes))),
  }
}

function siguientePeriodo(anio: number, mes: number, quincena: number) {
  if (quincena === 1) return { anio, mes, quincena: 2 }
  if (mes === 12) return { anio: anio + 1, mes: 1, quincena: 1 }
  return { anio, mes: mes + 1, quincena: 1 }
}

const periodoLabel = (p: Periodo) => `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${p.fecha_inicio} a ${p.fecha_fin})`

const emptyForm = (): FormState => {
  const d = new Date()
  return {
    empleado_id: '',
    modulo: 'VENTAS',
    fecha: todayISO(),
    monto_total: '',
    numero_cuotas: '1',
    anio_inicio: String(d.getFullYear()),
    mes_inicio: String(d.getMonth() + 1),
    quincena_inicio: d.getDate() <= 15 ? '1' : '2',
    observaciones: '',
  }
}

export default function RrhhDescuentosVentasPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [saldos, setSaldos] = useState<SaldoCliente[]>([])
  const [descuentos, setDescuentos] = useState<Descuento[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('PENDIENTE')
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const saldoMap = useMemo(() => {
    const map = new Map<number, SaldoCliente>()
    saldos.forEach((s) => map.set(Number(s.cliente_id), s))
    return map
  }, [saldos])

  const cuotasPorDescuento = useMemo(() => {
    const map = new Map<number, Cuota[]>()
    cuotas.forEach((c) => {
      const arr = map.get(c.descuento_id) || []
      arr.push(c)
      map.set(c.descuento_id, arr)
    })
    return map
  }, [cuotas])

  const empleadoSeleccionado = form.empleado_id ? empleadoMap.get(Number(form.empleado_id)) : undefined
  const saldoSeleccionado = empleadoSeleccionado?.cliente_id
    ? saldoMap.get(empleadoSeleccionado.cliente_id)
    : undefined

  const descuentosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return descuentos.filter((d) => {
      const texto = `${d.empleado_codigo} ${d.empleado_nombre} ${d.cliente_nombre} ${d.modulo} ${d.observaciones || ''}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (estadoFiltro !== 'TODOS' && d.estado !== estadoFiltro) return false
      return true
    })
  }, [descuentos, busqueda, estadoFiltro])

  const resumen = useMemo(() => {
    return descuentosFiltrados.reduce(
      (acc, d) => {
        acc.total += toNum(d.monto_total)
        if (d.estado === 'PENDIENTE') acc.pendiente += toNum(d.monto_total)
        if (d.estado === 'APLICADO') acc.aplicado += toNum(d.monto_total)
        if (d.estado === 'ANULADO') acc.anulado += toNum(d.monto_total)
        return acc
      },
      { total: 0, pendiente: 0, aplicado: 0, anulado: 0 }
    )
  }, [descuentosFiltrados])

  const cargarCatalogos = async () => {
    const [empRes, perRes, saldoRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select('id,codigo,nombre_completo,cliente_id,estado')
        .order('nombre_completo', { ascending: true }),
      supabase
        .from('rrhh_periodos_planilla')
        .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
        .order('quincena', { ascending: false }),
      supabase
        .from('rrhh_v_cliente_saldo_total')
        .select('cliente_id,cliente,saldo_ventas,saldo_granja,saldo_total'),
    ])

    if (empRes.error) throw new Error(`Error cargando empleados: ${empRes.error.message}`)
    if (perRes.error) throw new Error(`Error cargando períodos: ${perRes.error.message}`)
    if (saldoRes.error) throw new Error(`Error cargando saldos: ${saldoRes.error.message}`)

    setEmpleados((empRes.data || []) as Empleado[])
    setPeriodos((perRes.data || []) as Periodo[])
    setSaldos((saldoRes.data || []) as SaldoCliente[])
  }

  const cargarDescuentos = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const [descRes, cuotasRes] = await Promise.all([
        supabase
          .from('rrhh_descuentos_ventas')
          .select('id,empleado_id,cliente_id,periodo_id,modulo,fecha,monto_total,numero_cuotas,monto_cuota,estado,observaciones,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('rrhh_descuentos_ventas_cuotas')
          .select('id,descuento_id,numero_cuota,periodo_id,monto,estado')
          .order('descuento_id', { ascending: false })
          .order('numero_cuota', { ascending: true }),
      ])

      if (descRes.error) throw new Error(`Error cargando descuentos: ${descRes.error.message}`)
      if (cuotasRes.error) throw new Error(`Error cargando cuotas: ${cuotasRes.error.message}`)

      const cuotaRows = (cuotasRes.data || []) as Cuota[]
      setCuotas(cuotaRows)

      const cuotaMap = new Map<number, Cuota[]>()
      cuotaRows.forEach((c) => {
        const arr = cuotaMap.get(c.descuento_id) || []
        arr.push(c)
        cuotaMap.set(c.descuento_id, arr)
      })

      const rows = ((descRes.data || []) as Omit<Descuento, 'empleado_codigo' | 'empleado_nombre' | 'cliente_nombre' | 'periodo_texto' | 'cuotas_texto'>[]).map((d) => {
        const emp = empleadoMap.get(Number(d.empleado_id))
        const saldo = d.cliente_id ? saldoMap.get(Number(d.cliente_id)) : undefined
        const periodo = d.periodo_id ? periodoMap.get(Number(d.periodo_id)) : undefined
        const listaCuotas = cuotaMap.get(Number(d.id)) || []
        const cuotasTexto = listaCuotas.length === 0
          ? 'Sin cuotas'
          : listaCuotas
              .map((c) => {
                const p = c.periodo_id ? periodoMap.get(Number(c.periodo_id)) : undefined
                const estado = c.estado === 'PENDIENTE' ? 'pend.' : c.estado === 'APLICADA' ? 'aplic.' : 'anul.'
                return `#${c.numero_cuota} ${money(c.monto)} ${p ? `Q${p.quincena}/${String(p.mes).padStart(2, '0')}` : 'sin período'} ${estado}`
              })
              .join(' | ')

        return {
          ...d,
          empleado_codigo: emp?.codigo || String(d.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          cliente_nombre: saldo?.cliente || (d.cliente_id ? `Cliente #${d.cliente_id}` : 'Sin cliente'),
          periodo_texto: periodo ? periodoLabel(periodo) : 'Según cuotas',
          cuotas_texto: cuotasTexto,
        }
      })

      setDescuentos(rows)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando descuentos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
      .then(() => cargarDescuentos())
      .catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error cargando página.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (empleados.length > 0) {
      cargarDescuentos().catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error recargando descuentos.')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleados, periodos, saldos])

  const limpiar = () => {
    setForm(emptyForm())
    setMensaje('')
  }

  const usarSaldo = (tipo: 'VENTAS' | 'GRANJA_CERDOS' | 'TOTAL') => {
    if (!saldoSeleccionado) return

    const monto = tipo === 'VENTAS'
      ? saldoSeleccionado.saldo_ventas
      : tipo === 'GRANJA_CERDOS'
        ? saldoSeleccionado.saldo_granja
        : saldoSeleccionado.saldo_total

    setForm((prev) => ({
      ...prev,
      modulo: tipo === 'GRANJA_CERDOS' ? 'GRANJA_CERDOS' : 'VENTAS',
      monto_total: String(round2(toNum(monto))),
    }))
  }

  const obtenerOCrearPeriodo = async (anio: number, mes: number, quincena: number) => {
    const fechas = fechasPeriodo(anio, mes, quincena)

    const { data, error } = await supabase
      .from('rrhh_periodos_planilla')
      .upsert(
        {
          anio,
          mes,
          quincena,
          fecha_inicio: fechas.fecha_inicio,
          fecha_fin: fechas.fecha_fin,
          estado: 'ABIERTO',
        },
        { onConflict: 'anio,mes,quincena' }
      )
      .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
      .single()

    if (error) throw new Error(`Error creando período ${anio}-${mes} Q${quincena}: ${error.message}`)
    return data as Periodo
  }

  const crearPeriodosCuotas = async (cuotasCantidad: number) => {
    const resultado: Periodo[] = []
    let cursor = {
      anio: Number(form.anio_inicio),
      mes: Number(form.mes_inicio),
      quincena: Number(form.quincena_inicio),
    }

    for (let i = 0; i < cuotasCantidad; i += 1) {
      const p = await obtenerOCrearPeriodo(cursor.anio, cursor.mes, cursor.quincena)
      resultado.push(p)
      cursor = siguientePeriodo(cursor.anio, cursor.mes, cursor.quincena)
    }

    return resultado
  }

  const guardar = async () => {
    setMensaje('')

    if (!form.empleado_id) {
      alert('Selecciona un empleado.')
      return
    }

    const emp = empleadoMap.get(Number(form.empleado_id))
    if (!emp) {
      alert('Empleado no encontrado.')
      return
    }

    const montoTotal = round2(toNum(form.monto_total))
    if (montoTotal <= 0) {
      alert('El monto debe ser mayor que 0.')
      return
    }

    const numeroCuotas = Math.max(1, Math.floor(toNum(form.numero_cuotas)))
    if (numeroCuotas <= 0) {
      alert('El número de cuotas debe ser mayor que 0.')
      return
    }

    setSaving(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const periodosCuotas = await crearPeriodosCuotas(numeroCuotas)
      const primerPeriodo = periodosCuotas[0]
      const montoBase = Math.floor((montoTotal / numeroCuotas) * 100) / 100
      const cuotasPayload = periodosCuotas.map((p, index) => {
        const monto = index === numeroCuotas - 1
          ? round2(montoTotal - montoBase * (numeroCuotas - 1))
          : round2(montoBase)

        return {
          numero_cuota: index + 1,
          periodo_id: p.id,
          monto,
          estado: 'PENDIENTE',
        }
      })

      const { data: descData, error: descError } = await supabase
        .from('rrhh_descuentos_ventas')
        .insert({
          empleado_id: emp.id,
          cliente_id: emp.cliente_id,
          periodo_id: primerPeriodo?.id || null,
          modulo: form.modulo,
          fecha: form.fecha,
          monto_total: montoTotal,
          numero_cuotas: numeroCuotas,
          monto_cuota: round2(montoTotal / numeroCuotas),
          estado: 'PENDIENTE',
          observaciones: form.observaciones.trim() || null,
          user_id: userId,
        })
        .select('id')
        .single()

      if (descError) throw new Error(`Error guardando descuento: ${descError.message}`)

      const descuentoId = Number(descData?.id || 0)
      if (!descuentoId) throw new Error('No se pudo obtener el ID del descuento.')

      const { error: cuotasError } = await supabase
        .from('rrhh_descuentos_ventas_cuotas')
        .insert(cuotasPayload.map((c) => ({ ...c, descuento_id: descuentoId })))

      if (cuotasError) throw new Error(`Error guardando cuotas: ${cuotasError.message}`)

      setMensaje('Descuento registrado correctamente.')
      limpiar()
      await cargarCatalogos()
      await cargarDescuentos()
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error guardando descuento.')
    } finally {
      setSaving(false)
    }
  }

  const anular = async (descuento: Descuento) => {
    if (!confirm(`¿Anular descuento de ${descuento.empleado_nombre} por ${money(descuento.monto_total)}?`)) return

    setMensaje('')

    try {
      const { error: descError } = await supabase
        .from('rrhh_descuentos_ventas')
        .update({ estado: 'ANULADO' })
        .eq('id', descuento.id)

      if (descError) throw new Error(`Error anulando descuento: ${descError.message}`)

      const { error: cuotaError } = await supabase
        .from('rrhh_descuentos_ventas_cuotas')
        .update({ estado: 'ANULADA' })
        .eq('descuento_id', descuento.id)
        .eq('estado', 'PENDIENTE')

      if (cuotaError) throw new Error(`Error anulando cuotas: ${cuotaError.message}`)

      setMensaje('Descuento anulado.')
      await cargarDescuentos()
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error anulando descuento.')
    }
  }

  const eliminar = async (descuento: Descuento) => {
    const lista = cuotasPorDescuento.get(descuento.id) || []
    const tieneAplicadas = lista.some((c) => c.estado === 'APLICADA')

    if (tieneAplicadas) {
      alert('No se puede eliminar porque ya tiene cuotas aplicadas. Anúlalo para conservar historial.')
      return
    }

    if (!confirm(`¿Eliminar definitivamente este descuento de ${descuento.empleado_nombre}?`)) return

    const { error } = await supabase.from('rrhh_descuentos_ventas').delete().eq('id', descuento.id)

    if (error) {
      setMensaje(`Error eliminando descuento: ${error.message}`)
      return
    }

    setMensaje('Descuento eliminado.')
    await cargarDescuentos()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-14" />
          <div>
            <h1 className="text-2xl font-bold">Recursos Humanos — Descuentos por ventas</h1>
            <p className="text-sm text-slate-600">
              Convierte saldos de empleados/clientes en descuentos aplicables a planilla.
            </p>
          </div>
        </div>
        <Link href="/rrhh" className="px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800">
          Volver a RRHH
        </Link>
      </div>

      {mensaje && <div className="border rounded p-3 mb-4 bg-white">{mensaje}</div>}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <section className="border rounded p-4 bg-white">
          <h2 className="font-semibold text-lg mb-3">Nuevo descuento</h2>

          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              Empleado
              <select
                className="border rounded px-3 py-2 font-normal"
                value={form.empleado_id}
                onChange={(e) => setForm((prev) => ({ ...prev, empleado_id: e.target.value }))}
              >
                <option value="">Selecciona empleado</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.codigo} — {e.nombre_completo}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="border rounded p-2">
                <div className="text-slate-600">Ventas</div>
                <div className="font-bold">{money(saldoSeleccionado?.saldo_ventas)}</div>
                <button
                  type="button"
                  className="mt-2 w-full text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:bg-slate-300"
                  disabled={!saldoSeleccionado || toNum(saldoSeleccionado.saldo_ventas) <= 0}
                  onClick={() => usarSaldo('VENTAS')}
                >
                  Usar
                </button>
              </div>
              <div className="border rounded p-2">
                <div className="text-slate-600">Granja</div>
                <div className="font-bold">{money(saldoSeleccionado?.saldo_granja)}</div>
                <button
                  type="button"
                  className="mt-2 w-full text-xs px-2 py-1 bg-emerald-600 text-white rounded disabled:bg-slate-300"
                  disabled={!saldoSeleccionado || toNum(saldoSeleccionado.saldo_granja) <= 0}
                  onClick={() => usarSaldo('GRANJA_CERDOS')}
                >
                  Usar
                </button>
              </div>
              <div className="border rounded p-2">
                <div className="text-slate-600">Total</div>
                <div className="font-bold">{money(saldoSeleccionado?.saldo_total)}</div>
                <button
                  type="button"
                  className="mt-2 w-full text-xs px-2 py-1 bg-slate-700 text-white rounded disabled:bg-slate-300"
                  disabled={!saldoSeleccionado || toNum(saldoSeleccionado.saldo_total) <= 0}
                  onClick={() => usarSaldo('TOTAL')}
                >
                  Usar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-semibold">
                Tipo
                <select
                  className="border rounded px-3 py-2 font-normal"
                  value={form.modulo}
                  onChange={(e) => setForm((prev) => ({ ...prev, modulo: e.target.value as FormState['modulo'] }))}
                >
                  <option value="VENTAS">Ventas regulares</option>
                  <option value="GRANJA_CERDOS">Ventas de cerdos</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </label>

              <label className="grid gap-1 text-sm font-semibold">
                Fecha
                <input
                  type="date"
                  className="border rounded px-3 py-2 font-normal"
                  value={form.fecha}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-semibold">
                Monto total
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="border rounded px-3 py-2 font-normal"
                  value={form.monto_total}
                  onChange={(e) => setForm((prev) => ({ ...prev, monto_total: e.target.value }))}
                />
              </label>

              <label className="grid gap-1 text-sm font-semibold">
                Número de cuotas
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="border rounded px-3 py-2 font-normal"
                  value={form.numero_cuotas}
                  onChange={(e) => setForm((prev) => ({ ...prev, numero_cuotas: e.target.value }))}
                />
              </label>
            </div>

            <div className="border rounded p-3">
              <h3 className="font-semibold mb-2">Primera quincena de descuento</h3>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="border rounded px-3 py-2"
                  value={form.anio_inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, anio_inicio: e.target.value }))}
                  placeholder="Año"
                />
                <select
                  className="border rounded px-3 py-2"
                  value={form.mes_inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, mes_inicio: e.target.value }))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  className="border rounded px-3 py-2"
                  value={form.quincena_inicio}
                  onChange={(e) => setForm((prev) => ({ ...prev, quincena_inicio: e.target.value as '1' | '2' }))}
                >
                  <option value="1">1 al 15</option>
                  <option value="2">16 al 30</option>
                </select>
              </div>
            </div>

            <label className="grid gap-1 text-sm font-semibold">
              Observaciones
              <textarea
                className="border rounded px-3 py-2 font-normal min-h-20"
                value={form.observaciones}
                onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={saving}
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {saving ? 'Guardando...' : 'Registrar descuento'}
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300"
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 content-start">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="border rounded p-3 bg-white">
              <div className="text-sm text-slate-600">Total filtrado</div>
              <div className="text-xl font-bold">{money(resumen.total)}</div>
            </div>
            <div className="border rounded p-3 bg-white">
              <div className="text-sm text-slate-600">Pendiente</div>
              <div className="text-xl font-bold text-red-600">{money(resumen.pendiente)}</div>
            </div>
            <div className="border rounded p-3 bg-white">
              <div className="text-sm text-slate-600">Aplicado</div>
              <div className="text-xl font-bold text-emerald-700">{money(resumen.aplicado)}</div>
            </div>
            <div className="border rounded p-3 bg-white">
              <div className="text-sm text-slate-600">Anulado</div>
              <div className="text-xl font-bold">{money(resumen.anulado)}</div>
            </div>
          </div>

          <div className="border rounded p-4 bg-white">
            <h2 className="font-semibold mb-3">Descuentos registrados</h2>
            <div className="grid md:grid-cols-[1fr_180px_120px] gap-3 mb-3">
              <input
                className="border rounded px-3 py-2"
                placeholder="Buscar empleado, cliente o tipo"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <select
                className="border rounded px-3 py-2"
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
              >
                <option value="PENDIENTE">Pendientes</option>
                <option value="APLICADO">Aplicados</option>
                <option value="ANULADO">Anulados</option>
                <option value="TODOS">Todos</option>
              </select>
              <button
                type="button"
                onClick={() => Promise.all([cargarCatalogos(), cargarDescuentos()])}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Actualizar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-200">
                    <th className="border px-2 py-2 text-left">Empleado</th>
                    <th className="border px-2 py-2 text-left">Tipo</th>
                    <th className="border px-2 py-2 text-right">Monto</th>
                    <th className="border px-2 py-2 text-center">Cuotas</th>
                    <th className="border px-2 py-2 text-left">Detalle cuotas</th>
                    <th className="border px-2 py-2 text-center">Estado</th>
                    <th className="border px-2 py-2 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={7} className="border px-2 py-4 text-center">Cargando...</td>
                    </tr>
                  )}

                  {!loading && descuentosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={7} className="border px-2 py-4 text-center text-slate-600">
                        No hay descuentos con los filtros aplicados.
                      </td>
                    </tr>
                  )}

                  {descuentosFiltrados.map((d) => (
                    <tr key={d.id} className="align-top">
                      <td className="border px-2 py-2">
                        <div className="font-semibold">{d.empleado_codigo}</div>
                        <div>{d.empleado_nombre}</div>
                        <div className="text-xs text-slate-500">Cliente: {d.cliente_nombre}</div>
                      </td>
                      <td className="border px-2 py-2">{d.modulo}</td>
                      <td className="border px-2 py-2 text-right font-semibold">{money(d.monto_total)}</td>
                      <td className="border px-2 py-2 text-center">{d.numero_cuotas}</td>
                      <td className="border px-2 py-2 text-xs min-w-80">{d.cuotas_texto}</td>
                      <td className="border px-2 py-2 text-center">{d.estado}</td>
                      <td className="border px-2 py-2 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          {d.estado === 'PENDIENTE' && (
                            <button
                              type="button"
                              onClick={() => anular(d)}
                              className="px-2 py-1 rounded bg-orange-600 text-white text-xs"
                            >
                              Anular
                            </button>
                          )}
                          {d.estado !== 'APLICADO' && (
                            <button
                              type="button"
                              onClick={() => eliminar(d)}
                              className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
