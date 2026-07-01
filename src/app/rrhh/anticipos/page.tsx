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

type Anticipo = {
  id: number
  empleado_id: number
  fecha: string
  monto: number
  periodo_id: number | null
  estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO'
  observaciones: string | null
  created_at: string
  empleado_codigo: string
  empleado_nombre: string
  periodo_texto: string
}

type FormState = {
  id: number | null
  empleado_id: string
  fecha: string
  monto: string
  periodo_id: string
  estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO'
  observaciones: string
}

const emptyForm = (): FormState => ({
  id: null,
  empleado_id: '',
  fecha: todayISO(),
  monto: '',
  periodo_id: '',
  estado: 'PENDIENTE',
  observaciones: '',
})

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

const periodoLabel = (p: Periodo) => `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena} (${p.fecha_inicio} a ${p.fecha_fin})`

export default function RrhhAnticiposPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [anticipos, setAnticipos] = useState<Anticipo[]>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('PENDIENTE')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
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

  const anticiposFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return anticipos.filter((a) => {
      const texto = `${a.empleado_codigo} ${a.empleado_nombre} ${a.observaciones || ''}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (estadoFiltro !== 'TODOS' && a.estado !== estadoFiltro) return false
      if (desde && a.fecha < desde) return false
      if (hasta && a.fecha > hasta) return false
      return true
    })
  }, [anticipos, busqueda, estadoFiltro, desde, hasta])

  const resumen = useMemo(() => {
    return anticiposFiltrados.reduce(
      (acc, a) => {
        acc.total += toNum(a.monto)
        if (a.estado === 'PENDIENTE') acc.pendiente += toNum(a.monto)
        if (a.estado === 'APLICADO') acc.aplicado += toNum(a.monto)
        if (a.estado === 'ANULADO') acc.anulado += toNum(a.monto)
        return acc
      },
      { total: 0, pendiente: 0, aplicado: 0, anulado: 0 }
    )
  }, [anticiposFiltrados])

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

  const cargarAnticipos = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const { data, error } = await supabase
        .from('rrhh_anticipos')
        .select('id,empleado_id,fecha,monto,periodo_id,estado,observaciones,created_at')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (error) throw new Error(`Error cargando anticipos: ${error.message}`)

      const rows = ((data || []) as {
        id: number
        empleado_id: number
        fecha: string
        monto: number
        periodo_id: number | null
        estado: Anticipo['estado']
        observaciones: string | null
        created_at: string
      }[]).map((row) => {
        const emp = empleadoMap.get(Number(row.empleado_id))
        const periodo = row.periodo_id ? periodoMap.get(Number(row.periodo_id)) : undefined
        return {
          ...row,
          empleado_codigo: emp?.codigo || String(row.empleado_id),
          empleado_nombre: emp?.nombre_completo || 'Empleado no encontrado',
          periodo_texto: periodo ? periodoLabel(periodo) : 'Sin período fijo',
        }
      })

      setAnticipos(rows)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando anticipos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
      .then(() => cargarAnticipos())
      .catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error cargando página.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (empleados.length > 0) {
      cargarAnticipos().catch((err) => {
        console.error(err)
        setMensaje(err instanceof Error ? err.message : 'Error recargando anticipos.')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleados, periodos])

  const limpiar = () => {
    setForm(emptyForm())
    setMensaje('')
  }

  const editar = (anticipo: Anticipo) => {
    setForm({
      id: anticipo.id,
      empleado_id: String(anticipo.empleado_id),
      fecha: anticipo.fecha,
      monto: String(anticipo.monto),
      periodo_id: anticipo.periodo_id ? String(anticipo.periodo_id) : '',
      estado: anticipo.estado,
      observaciones: anticipo.observaciones || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const guardar = async () => {
    setMensaje('')

    if (!form.empleado_id) {
      alert('Selecciona un empleado.')
      return
    }

    if (!form.fecha) {
      alert('Selecciona la fecha del anticipo.')
      return
    }

    const monto = toNum(form.monto)
    if (monto <= 0) {
      alert('El monto debe ser mayor que 0.')
      return
    }

    setSaving(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const userEmail = userData?.user?.email || null

      const payload = {
        empleado_id: Number(form.empleado_id),
        fecha: form.fecha,
        monto,
        periodo_id: form.periodo_id ? Number(form.periodo_id) : null,
        estado: form.estado,
        observaciones: form.observaciones.trim() || null,
        user_id: userId,
      }

      let anticipoId = form.id

      if (form.id) {
        const { error } = await supabase.from('rrhh_anticipos').update(payload).eq('id', form.id)
        if (error) throw new Error(`Error actualizando anticipo: ${error.message}`)
      } else {
        const { data, error } = await supabase.from('rrhh_anticipos').insert(payload).select('id').single()
        if (error) throw new Error(`Error creando anticipo: ${error.message}`)
        anticipoId = Number(data?.id || 0)
      }

      await supabase.from('rrhh_auditoria').insert({
        tabla: 'rrhh_anticipos',
        accion: form.id ? 'ACTUALIZAR' : 'CREAR',
        registro_id: anticipoId ? String(anticipoId) : null,
        empleado_id: Number(form.empleado_id),
        usuario_id: userId,
        usuario_email: userEmail,
        detalle: payload,
        observaciones: form.observaciones.trim() || null,
      })

      limpiar()
      await cargarAnticipos()
      setMensaje('Anticipo guardado correctamente.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error guardando anticipo.')
    } finally {
      setSaving(false)
    }
  }

  const cambiarEstado = async (anticipo: Anticipo, estado: Anticipo['estado']) => {
    if (!confirm(`¿Cambiar el anticipo a estado ${estado}?`)) return

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id || null
      const userEmail = userData?.user?.email || null

      const { error } = await supabase.from('rrhh_anticipos').update({ estado }).eq('id', anticipo.id)
      if (error) throw new Error(error.message)

      await supabase.from('rrhh_auditoria').insert({
        tabla: 'rrhh_anticipos',
        accion: `CAMBIAR_ESTADO_${estado}`,
        registro_id: String(anticipo.id),
        empleado_id: anticipo.empleado_id,
        usuario_id: userId,
        usuario_email: userEmail,
        detalle: { estado_anterior: anticipo.estado, estado_nuevo: estado },
      })

      await cargarAnticipos()
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cambiando estado.')
    }
  }

  const eliminar = async (anticipo: Anticipo) => {
    if (!confirm(`¿Eliminar el anticipo de ${anticipo.empleado_nombre} por ${money(anticipo.monto)}?`)) return

    try {
      const { error } = await supabase.from('rrhh_anticipos').delete().eq('id', anticipo.id)
      if (error) throw new Error(error.message)
      await cargarAnticipos()
      setMensaje('Anticipo eliminado correctamente.')
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error eliminando anticipo.')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo Empresa" className="h-14" />
          <div>
            <h1 className="text-2xl font-bold">Recursos Humanos — Anticipos</h1>
            <p className="text-sm text-slate-600">Registra anticipos que se descontarán en planilla.</p>
          </div>
        </div>
        <Link href="/rrhh" className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded">
          Volver a RRHH
        </Link>
      </div>

      {mensaje && <div className="border rounded p-3 mb-4 text-sm bg-slate-50">{mensaje}</div>}

      <div className="grid lg:grid-cols-[420px_1fr] gap-4">
        <section className="border rounded p-4 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">{form.id ? `Editar anticipo #${form.id}` : 'Nuevo anticipo'}</h2>
            <button type="button" onClick={limpiar} className="bg-slate-200 px-3 py-2 rounded text-sm">
              Nuevo
            </button>
          </div>

          <label className="block text-sm font-semibold mb-1">Empleado</label>
          <select
            value={form.empleado_id}
            onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}
            className="w-full border p-2 mb-3"
          >
            <option value="">Selecciona empleado</option>
            {empleados
              .filter((e) => e.estado === 'ACTIVO')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} — {e.nombre_completo}
                </option>
              ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className="w-full border p-2 mb-3"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Monto</label>
              <input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="w-full border p-2 mb-3"
              />
            </div>
          </div>

          <label className="block text-sm font-semibold mb-1">Período a descontar</label>
          <select
            value={form.periodo_id}
            onChange={(e) => setForm({ ...form, periodo_id: e.target.value })}
            className="w-full border p-2 mb-3"
          >
            <option value="">Sin período fijo</option>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {periodoLabel(p)}
              </option>
            ))}
          </select>

          <label className="block text-sm font-semibold mb-1">Estado</label>
          <select
            value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value as FormState['estado'] })}
            className="w-full border p-2 mb-3"
          >
            <option value="PENDIENTE">Pendiente</option>
            <option value="APLICADO">Aplicado</option>
            <option value="ANULADO">Anulado</option>
          </select>

          <label className="block text-sm font-semibold mb-1">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            className="w-full border p-2 mb-4"
            rows={4}
          />

          <button
            type="button"
            onClick={guardar}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white px-4 py-2 rounded"
          >
            {saving ? 'Guardando...' : 'Guardar anticipo'}
          </button>
        </section>

        <section className="border rounded p-4 bg-white">
          <h2 className="font-semibold mb-4">Anticipos registrados</h2>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar empleado, código u observación"
              className="border p-2"
            />
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="border p-2">
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="APLICADO">Aplicados</option>
              <option value="ANULADO">Anulados</option>
            </select>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border p-2" />
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border p-2" />
          </div>

          <div className="grid md:grid-cols-4 gap-3 mb-4">
            <div className="border rounded p-3"><div className="text-xs">Mostrando</div><div className="font-bold">{anticiposFiltrados.length}</div></div>
            <div className="border rounded p-3"><div className="text-xs">Pendiente</div><div className="font-bold text-red-600">{money(resumen.pendiente)}</div></div>
            <div className="border rounded p-3"><div className="text-xs">Aplicado</div><div className="font-bold text-emerald-700">{money(resumen.aplicado)}</div></div>
            <div className="border rounded p-3"><div className="text-xs">Total filtro</div><div className="font-bold">{money(resumen.total)}</div></div>
          </div>

          <div className="overflow-auto border rounded max-h-[620px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-200 sticky top-0">
                <tr>
                  <th className="border p-2 text-left">Fecha</th>
                  <th className="border p-2 text-left">Empleado</th>
                  <th className="border p-2 text-right">Monto</th>
                  <th className="border p-2 text-left">Período</th>
                  <th className="border p-2 text-left">Estado</th>
                  <th className="border p-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {anticiposFiltrados.map((a) => (
                  <tr key={a.id}>
                    <td className="border p-2">{a.fecha}</td>
                    <td className="border p-2">
                      <div className="font-semibold">{a.empleado_codigo}</div>
                      <div>{a.empleado_nombre}</div>
                      {a.observaciones && <div className="text-xs text-slate-500">{a.observaciones}</div>}
                    </td>
                    <td className="border p-2 text-right font-semibold">{money(a.monto)}</td>
                    <td className="border p-2">{a.periodo_texto}</td>
                    <td className="border p-2">{a.estado}</td>
                    <td className="border p-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => editar(a)} className="bg-slate-700 text-white px-2 py-1 rounded text-xs">Editar</button>
                        {a.estado !== 'APLICADO' && <button type="button" onClick={() => cambiarEstado(a, 'APLICADO')} className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">Aplicar</button>}
                        {a.estado !== 'ANULADO' && <button type="button" onClick={() => cambiarEstado(a, 'ANULADO')} className="bg-orange-600 text-white px-2 py-1 rounded text-xs">Anular</button>}
                        <button type="button" onClick={() => eliminar(a)} className="bg-red-600 text-white px-2 py-1 rounded text-xs">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && anticiposFiltrados.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-slate-600">No hay anticipos con los filtros aplicados.</td></tr>
                )}
                {loading && <tr><td colSpan={6} className="p-4">Cargando...</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
