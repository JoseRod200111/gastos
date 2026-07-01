'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
  estado: Cuota['estado']
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

const monthISO = (anio: number, mes: number, dia: number) => {
  const m = String(mes).padStart(2, '0')
  const d = String(dia).padStart(2, '0')
  return `${anio}-${m}-${d}`
}

const lastDayOfMonth = (anio: number, mes: number) => new Date(anio, mes, 0).getDate()

const fechasPeriodo = (anio: number, mes: number, quincena: number) => {
  if (quincena === 1) {
    return { inicio: monthISO(anio, mes, 1), fin: monthISO(anio, mes, 15) }
  }
  return { inicio: monthISO(anio, mes, 16), fin: monthISO(anio, mes, Math.min(30, lastDayOfMonth(anio, mes))) }
}

const siguienteQuincena = (anio: number, mes: number, quincena: number) => {
  if (quincena === 1) return { anio, mes, quincena: 2 }
  if (mes === 12) return { anio: anio + 1, mes: 1, quincena: 1 }
  return { anio, mes: mes + 1, quincena: 1 }
}

const periodoLabel = (p: Periodo) => `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${p.fecha_inicio} a ${p.fecha_fin})`

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
          estado: c.estado,
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

  const obtenerOCrearPeriodo = async (anio: number, mes: number, quincena: number) => {
    const fechas = fechasPeriodo(anio, mes, quincena)

    const { data, error } = await supabase
      .from('rrhh_periodos_planilla')
      .upsert(
        {
          anio,
          mes,
          quincena,
          fecha_inicio: fechas.inicio,
          fecha_fin: fechas.fin,
          estado: 'ABIERTO',
        },
        { onConflict: 'anio,mes,quincena' }
      )
      .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
      .single()

    if (error) throw new Error(`Error creando período ${anio}-${mes} Q${quincena}: ${error.message}`)
    return data as Periodo
  }

  const generarPeriodosCuotas = async (numeroCuotas: number) => {
    let anio = Number(form.inicio_anio)
    let mes = Number(form.inicio_mes)
    let quincena = Number(form.inicio_quincena)
    const result: Periodo[] = []

    if (!anio || !mes || !quincena) return result

    for (let i = 0; i < numeroCuotas; i += 1) {
      const periodo = await obtenerOCrearPeriodo(anio, mes, quincena)
      result.push(periodo)
      const siguiente = siguienteQuincena(anio, mes, quincena)
      anio = siguiente.anio
      mes = siguiente.mes
      quincena = siguiente.quincena
    }

    return result
  }

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
    const numeroCuotas = Math.trunc(toNum(form.numero_cuotas))

    if (montoTotal <= 0) {
      alert('El monto total debe ser mayor que 0.')
      return
    }

    if (numeroCuotas <= 0) {
      alert('El número de cuotas debe ser mayor que 0.')
      return
    }

    setSaving(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const userEmail = userData?.user?.email || null
      const periodosCuotas = await generarPeriodosCuotas(numeroCuotas)

      const { data: prestamoData, error: prestErr } = await supabase
        .from('rrhh_prestamos')
        .insert({
          empleado_id: Number(form.empleado_id),
          fecha: form.fecha,
          monto_total: montoTotal,
          numero_cuotas: numeroCuotas,
          observaciones: form.observaciones.trim() || null,
          estado: 'ACTIVO',
          user_id: userId,
        })
        .select('id')
        .single()

      if (prestErr) throw new Error(`Error creando préstamo: ${prestErr.message}`)

      const prestamoId = Number(prestamoData?.id || 0)
      const cuotaBase = round2(montoTotal / numeroCuotas)
      let acumulado = 0

      const cuotasPayload = Array.from({ length: numeroCuotas }).map((_, index) => {
        const numero = index + 1
        const monto = numero === numeroCuotas ? round2(montoTotal - acumulado) : cuotaBase
        acumulado = round2(acumulado + monto)
        return {
          prestamo_id: prestamoId,
          numero_cuota: numero,
          periodo_id: periodosCuotas[index]?.id || null,
          monto,
          estado: 'PENDIENTE',
        }
      })

      const { error: cuotasErr } = await supabase.from('rrhh_prestamo_cuotas').insert(cuotasPayload)
      if (cuotasErr) throw new Error(`Error creando cuotas: ${cuotasErr.message}`)

      await supabase.from('rrhh_auditoria').insert({
        tabla: 'rrhh_prestamos',
        accion: 'CREAR',
        registro_id: String(prestamoId),
        empleado_id: Number(form.empleado_id),
        usuario_id: userId,
        usuario_email: userEmail,
        detalle: { monto_total: montoTotal, numero_cuotas: numeroCuotas, cuotas: cuotasPayload },
        observaciones: form.observaciones.trim() || null,
      })

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

  const cambiarEstadoPrestamo = async (prestamo: Prestamo, estado: Prestamo['estado']) => {
    if (!confirm(`¿Cambiar el préstamo #${prestamo.id} a ${estado}?`)) return

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const userEmail = userData?.user?.email || null

      const { error } = await supabase.from('rrhh_prestamos').update({ estado }).eq('id', prestamo.id)
      if (error) throw new Error(error.message)

      if (estado === 'ANULADO') {
        const { error: cuotasError } = await supabase
          .from('rrhh_prestamo_cuotas')
          .update({ estado: 'ANULADA' })
          .eq('prestamo_id', prestamo.id)
        if (cuotasError) throw new Error(cuotasError.message)
      }

      if (estado === 'PAGADO') {
        const { error: cuotasError } = await supabase
          .from('rrhh_prestamo_cuotas')
          .update({ estado: 'APLICADA' })
          .eq('prestamo_id', prestamo.id)
        if (cuotasError) throw new Error(cuotasError.message)
      }

      await supabase.from('rrhh_auditoria').insert({
        tabla: 'rrhh_prestamos',
        accion: `CAMBIAR_ESTADO_${estado}`,
        registro_id: String(prestamo.id),
        empleado_id: prestamo.empleado_id,
        usuario_id: userId,
        usuario_email: userEmail,
        detalle: { estado_anterior: prestamo.estado, estado_nuevo: estado },
      })

      await cargarPrestamos()
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cambiando estado de préstamo.')
    }
  }

  const guardarCuota = async (cuotaId: number) => {
    const edit = editCuotas[cuotaId]
    if (!edit) return

    const monto = round2(toNum(edit.monto))
    if (monto < 0) {
      alert('La cuota no puede ser negativa.')
      return
    }

    try {
      const { error } = await supabase
        .from('rrhh_prestamo_cuotas')
        .update({
          monto,
          estado: edit.estado,
          periodo_id: edit.periodo_id ? Number(edit.periodo_id) : null,
        })
        .eq('id', cuotaId)

      if (error) throw new Error(error.message)
      await cargarPrestamos()
      setMensaje('Cuota actualizada correctamente.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error actualizando cuota.')
    }
  }

  const eliminarPrestamo = async (prestamo: Prestamo) => {
    if (!confirm(`¿Eliminar el préstamo #${prestamo.id} de ${prestamo.empleado_nombre}?`)) return

    try {
      const { error } = await supabase.from('rrhh_prestamos').delete().eq('id', prestamo.id)
      if (error) throw new Error(error.message)
      await cargarPrestamos()
      setMensaje('Préstamo eliminado correctamente.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error eliminando préstamo.')
    }
  }

  const actualizarEditCuota = (cuotaId: number, patch: Partial<EditCuotaState>) => {
    setEditCuotas((prev) => ({
      ...prev,
      [cuotaId]: { ...prev[cuotaId], ...patch },
    }))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo Empresa" className="h-14" />
          <div>
            <h1 className="text-2xl font-bold">Recursos Humanos — Préstamos</h1>
            <p className="text-sm text-slate-600">Registra préstamos y divide el descuento en cuotas por quincena.</p>
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
              onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}
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
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Monto total</label>
            <input type="number" step="0.01" value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Número de cuotas</label>
            <input type="number" min="1" step="1" value={form.numero_cuotas} onChange={(e) => setForm({ ...form, numero_cuotas: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio año</label>
            <input type="number" value={form.inicio_anio} onChange={(e) => setForm({ ...form, inicio_anio: e.target.value })} className="w-full border p-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio mes</label>
            <select value={form.inicio_mes} onChange={(e) => setForm({ ...form, inicio_mes: e.target.value })} className="w-full border p-2">
              {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Inicio quincena</label>
            <select value={form.inicio_quincena} onChange={(e) => setForm({ ...form, inicio_quincena: e.target.value })} className="w-full border p-2">
              <option value="1">1 al 15</option>
              <option value="2">16 al 30</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-semibold mb-1">Observaciones</label>
            <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="w-full border p-2" rows={3} />
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
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empleado, código u observación" className="border p-2 md:col-span-2" />
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="border p-2">
            <option value="TODOS">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="PAGADO">Pagados</option>
            <option value="ANULADO">Anulados</option>
          </select>
          <button type="button" onClick={cargarPrestamos} className="bg-blue-600 text-white px-4 py-2 rounded">Actualizar</button>
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
                        {p.estado !== 'PAGADO' && <button type="button" onClick={() => cambiarEstadoPrestamo(p, 'PAGADO')} className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">Pagar</button>}
                        {p.estado !== 'ANULADO' && <button type="button" onClick={() => cambiarEstadoPrestamo(p, 'ANULADO')} className="bg-orange-600 text-white px-2 py-1 rounded text-xs">Anular</button>}
                        <button type="button" onClick={() => eliminarPrestamo(p)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">Eliminar</button>
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
            <h3 className="font-semibold mb-3">Cuotas del préstamo #{prestamoSeleccionado}</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-200">
                  <tr>
                    <th className="border p-2">Cuota</th>
                    <th className="border p-2">Período</th>
                    <th className="border p-2">Monto</th>
                    <th className="border p-2">Estado</th>
                    <th className="border p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(cuotasPorPrestamo.get(prestamoSeleccionado) || []).map((c) => {
                    const edit = editCuotas[c.id]
                    return (
                      <tr key={c.id}>
                        <td className="border p-2 text-center">{c.numero_cuota}</td>
                        <td className="border p-2">
                          <select value={edit?.periodo_id || ''} onChange={(e) => actualizarEditCuota(c.id, { periodo_id: e.target.value })} className="w-full border p-1">
                            <option value="">Sin período</option>
                            {periodos.map((p) => <option key={p.id} value={p.id}>{periodoLabel(p)}</option>)}
                          </select>
                        </td>
                        <td className="border p-2">
                          <input type="number" step="0.01" value={edit?.monto || ''} onChange={(e) => actualizarEditCuota(c.id, { monto: e.target.value })} className="w-full border p-1 text-right" />
                        </td>
                        <td className="border p-2">
                          <select value={edit?.estado || c.estado} onChange={(e) => actualizarEditCuota(c.id, { estado: e.target.value as Cuota['estado'] })} className="w-full border p-1">
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="APLICADA">Aplicada</option>
                            <option value="ANULADA">Anulada</option>
                          </select>
                        </td>
                        <td className="border p-2">
                          <button type="button" onClick={() => guardarCuota(c.id)} className="bg-blue-600 text-white px-2 py-1 rounded text-xs">Guardar cuota</button>
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
