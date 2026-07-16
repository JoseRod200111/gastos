'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'


const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'
type Area = {
  id: number
  codigo: string
  nombre: string
  activo: boolean
}

type Cliente = {
  id: number
  nombre: string
  nit: string | null
}

type Empresa = {
  id: number
  nombre: string
}

type Division = {
  id: number
  nombre: string
}

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
  dpi: string | null
  nit: string | null
  telefono: string | null
  direccion: string | null
  fecha_ingreso: string
  fecha_baja: string | null
  motivo_baja: string | null
  estado: 'ACTIVO' | 'BAJA'
  salario_base: number
  bono_produccion_diario: number
  cliente_id: number | null
  empresa_id: number | null
  division_id: number | null
  observaciones: string | null
  updated_at: string | null
}

type Distribucion = {
  id: number
  empleado_id: number
  area_id: number
  porcentaje: number
}

type FormState = {
  id: number | null
  codigo: string
  nombre: string
  dpi: string
  nit: string
  telefono: string
  direccion: string
  fecha_ingreso: string
  estado: 'ACTIVO' | 'BAJA'
  fecha_baja: string
  motivo_baja: string
  salario_base: string
  bono_produccion_diario: string
  cliente_id: string
  empresa_id: string
  division_id: string
  observaciones: string
}

const emptyForm = (): FormState => ({
  id: null,
  codigo: '',
  nombre: '',
  dpi: '',
  nit: '',
  telefono: '',
  direccion: '',
  fecha_ingreso: '',
  estado: 'ACTIVO',
  fecha_baja: '',
  motivo_baja: '',
  salario_base: '',
  bono_produccion_diario: '',
  cliente_id: '',
  empresa_id: '',
  division_id: '',
  observaciones: '',
})

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

const todayISO = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export default function RrhhEmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([])

  const [form, setForm] = useState<FormState>(emptyForm())
  const [porcentajes, setPorcentajes] = useState<Record<number, string>>({})

  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'ACTIVO' | 'BAJA' | 'TODOS'>('ACTIVO')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargarTodo = async () => {
    setLoading(true)
    setMensaje('')

    const [empleadosRes, clientesRes, empresasRes, divisionesRes, areasRes, distRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select(
          'id,codigo,nombre_completo,dpi,nit,telefono,direccion,fecha_ingreso,fecha_baja,motivo_baja,estado,salario_base,bono_produccion_diario,cliente_id,empresa_id,division_id,observaciones,updated_at'
        )
        .order('nombre_completo', { ascending: true }),
      supabase.from('clientes').select('id,nombre,nit').order('nombre', { ascending: true }),
      supabase.from('empresas').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('divisiones').select('id,nombre').order('nombre', { ascending: true }),
      supabase
        .from('rrhh_areas')
        .select('id,codigo,nombre,activo')
        .eq('activo', true)
        .order('id', { ascending: true }),
      supabase.from('rrhh_empleado_distribucion').select('id,empleado_id,area_id,porcentaje'),
    ])

    if (empleadosRes.error) setMensaje(`Error cargando empleados: ${empleadosRes.error.message}`)
    if (clientesRes.error) setMensaje(`Error cargando clientes: ${clientesRes.error.message}`)
    if (empresasRes.error) setMensaje(`Error cargando empresas: ${empresasRes.error.message}`)
    if (divisionesRes.error) setMensaje(`Error cargando divisiones: ${divisionesRes.error.message}`)
    if (areasRes.error) setMensaje(`Error cargando áreas: ${areasRes.error.message}`)
    if (distRes.error) setMensaje(`Error cargando distribución: ${distRes.error.message}`)

    setEmpleados((empleadosRes.data || []) as Empleado[])
    setClientes((clientesRes.data || []) as Cliente[])
    setEmpresas((empresasRes.data || []) as Empresa[])
    setDivisiones((divisionesRes.data || []) as Division[])
    setAreas((areasRes.data || []) as Area[])
    setDistribuciones((distRes.data || []) as Distribucion[])

    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (areas.length === 0) return

    setPorcentajes((prev) => {
      if (Object.keys(prev).length > 0) return prev

      const inicial: Record<number, string> = {}
      areas.forEach((area) => {
        inicial[area.id] = '0'
      })
      return inicial
    })
  }, [areas])

  const clientesMap = useMemo(() => {
    const map = new Map<number, Cliente>()
    clientes.forEach((cliente) => map.set(cliente.id, cliente))
    return map
  }, [clientes])

  const empresasMap = useMemo(() => {
    const map = new Map<number, Empresa>()
    empresas.forEach((empresa) => map.set(empresa.id, empresa))
    return map
  }, [empresas])

  const divisionesMap = useMemo(() => {
    const map = new Map<number, Division>()
    divisiones.forEach((division) => map.set(division.id, division))
    return map
  }, [divisiones])

  const empleadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return empleados.filter((empleado) => {
      const estadoOk = estadoFiltro === 'TODOS' || empleado.estado === estadoFiltro
      const texto = `${empleado.codigo} ${empleado.nombre_completo} ${empleado.dpi || ''} ${empleado.nit || ''}`.toLowerCase()
      const textoOk = q === '' || texto.includes(q)
      return estadoOk && textoOk
    })
  }, [busqueda, empleados, estadoFiltro])

  const totalDistribucion = useMemo(() => {
    return Object.values(porcentajes).reduce((acc, value) => acc + toNum(value), 0)
  }, [porcentajes])

  const salarioDiario = useMemo(() => toNum(form.salario_base) / 30, [form.salario_base])
  const salarioHora = useMemo(() => salarioDiario / 8, [salarioDiario])
  const horaExtra = useMemo(() => salarioHora * 1.5, [salarioHora])

  const limpiarFormulario = () => {
    const inicial: Record<number, string> = {}
    areas.forEach((area) => {
      inicial[area.id] = '0'
    })

    setForm(emptyForm())
    setPorcentajes(inicial)
    setMensaje('')
  }

  const seleccionarEmpleado = (empleado: Empleado) => {
    const distEmpleado = distribuciones.filter((dist) => dist.empleado_id === empleado.id)
    const nuevoPorcentaje: Record<number, string> = {}

    areas.forEach((area) => {
      const item = distEmpleado.find((dist) => dist.area_id === area.id)
      nuevoPorcentaje[area.id] = item ? String(item.porcentaje) : '0'
    })

    setForm({
      id: empleado.id,
      codigo: empleado.codigo || '',
      nombre: empleado.nombre_completo || '',
      dpi: empleado.dpi || '',
      nit: empleado.nit || '',
      telefono: empleado.telefono || '',
      direccion: empleado.direccion || '',
      fecha_ingreso: empleado.fecha_ingreso || '',
      estado: empleado.estado || 'ACTIVO',
      fecha_baja: empleado.fecha_baja || '',
      motivo_baja: empleado.motivo_baja || '',
      salario_base: String(empleado.salario_base || ''),
      bono_produccion_diario: String(empleado.bono_produccion_diario || ''),
      cliente_id: empleado.cliente_id ? String(empleado.cliente_id) : '',
      empresa_id: empleado.empresa_id ? String(empleado.empresa_id) : '',
      division_id: empleado.division_id ? String(empleado.division_id) : '',
      observaciones: empleado.observaciones || '',
    })

    setPorcentajes(nuevoPorcentaje)
    setMensaje('')
  }

  const validar = () => {
    if (!form.codigo.trim()) return 'Ingrese un código o ID interno del empleado.'
    if (!form.nombre.trim()) return 'Ingrese el nombre del empleado.'
    if (!form.fecha_ingreso) return 'Ingrese la fecha de ingreso.'
    if (toNum(form.salario_base) < 0) return 'El salario base no puede ser negativo.'
    if (toNum(form.bono_produccion_diario) < 0) return 'El bono de producción no puede ser negativo.'
    if (totalDistribucion > 100) return 'La distribución por áreas no puede superar 100%.'
    if (form.estado === 'BAJA' && !form.fecha_baja) return 'Ingrese la fecha de baja.'
    return ''
  }

  const guardarAuditoria = async (
    empleadoId: number,
    accion: string,
    observaciones: string,
    detalle: unknown
  ) => {
    const { data } = await supabase.auth.getUser()
    const user = data?.user ?? null

    await supabase.from('rrhh_auditoria').insert({
      tabla: 'rrhh_empleados',
      accion,
      registro_id: String(empleadoId),
      empleado_id: empleadoId,
      usuario_id: user?.id ?? null,
      usuario_email: user?.email ?? null,
      detalle,
      observaciones,
    })
  }

  const guardarEmpleado = async () => {
    const errorValidacion = validar()

    if (errorValidacion) {
      setMensaje(errorValidacion)
      return
    }

    setSaving(true)
    setMensaje('')

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null
    const userEmail = authData?.user?.email ?? null
    const now = new Date().toISOString()

    const payload = {
      codigo: form.codigo.trim(),
      nombre_completo: form.nombre.trim(),
      dpi: form.dpi.trim() || null,
      nit: form.nit.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
      fecha_ingreso: form.fecha_ingreso,
      estado: form.estado,
      fecha_baja: form.estado === 'BAJA' ? form.fecha_baja || todayISO() : null,
      motivo_baja: form.estado === 'BAJA' ? form.motivo_baja.trim() || null : null,
      salario_base: toNum(form.salario_base),
      bono_produccion_diario: toNum(form.bono_produccion_diario),
      cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
      division_id: form.division_id ? Number(form.division_id) : null,
      observaciones: form.observaciones.trim() || null,
      user_id: userId,
      updated_at: now,
      editado_por: userEmail,
      editado_en: now,
    }

    let empleadoId = form.id
    let accion = 'ACTUALIZAR'

    if (form.id) {
      const { error } = await supabase.from('rrhh_empleados').update(payload).eq('id', form.id)

      if (error) {
        setMensaje(`Error actualizando empleado: ${error.message}`)
        setSaving(false)
        return
      }
    } else {
      accion = 'CREAR'

      const { data, error } = await supabase
        .from('rrhh_empleados')
        .insert(payload)
        .select('id')
        .single()

      if (error) {
        setMensaje(`Error creando empleado: ${error.message}`)
        setSaving(false)
        return
      }

      empleadoId = Number(data?.id)
    }

    if (!empleadoId) {
      setMensaje('No se pudo identificar el empleado guardado.')
      setSaving(false)
      return
    }

    const { error: deleteDistError } = await supabase
      .from('rrhh_empleado_distribucion')
      .delete()
      .eq('empleado_id', empleadoId)

    if (deleteDistError) {
      setMensaje(`Empleado guardado, pero falló la distribución: ${deleteDistError.message}`)
      setSaving(false)
      return
    }

    const filasDistribucion = areas
      .map((area) => ({
        empleado_id: empleadoId,
        area_id: area.id,
        porcentaje: toNum(porcentajes[area.id]),
      }))
      .filter((row) => row.porcentaje > 0)

    if (filasDistribucion.length > 0) {
      const { error: insertDistError } = await supabase
        .from('rrhh_empleado_distribucion')
        .insert(filasDistribucion)

      if (insertDistError) {
        setMensaje(`Empleado guardado, pero falló la distribución: ${insertDistError.message}`)
        setSaving(false)
        return
      }
    }

    await guardarAuditoria(empleadoId, accion, accion === 'CREAR' ? 'Empleado creado' : 'Empleado actualizado', {
      empleado: payload,
      distribucion: filasDistribucion,
    })

    await cargarTodo()
    setMensaje('Empleado guardado correctamente.')

    if (!form.id) limpiarFormulario()

    setSaving(false)
  }

  const darDeBaja = async (empleado: Empleado) => {
    const motivo = window.prompt(`Motivo de baja para ${empleado.nombre_completo}:`, empleado.motivo_baja || '')

    if (motivo === null) return

    const fecha = window.prompt('Fecha de baja en formato YYYY-MM-DD:', todayISO())

    if (fecha === null) return

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null
    const userEmail = authData?.user?.email ?? null
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('rrhh_empleados')
      .update({
        estado: 'BAJA',
        fecha_baja: fecha || todayISO(),
        motivo_baja: motivo.trim() || null,
        user_id: userId,
        updated_at: now,
        editado_por: userEmail,
        editado_en: now,
      })
      .eq('id', empleado.id)

    if (error) {
      setMensaje(`Error dando de baja: ${error.message}`)
      return
    }

    await guardarAuditoria(empleado.id, 'BAJA', 'Empleado dado de baja', {
      fecha_baja: fecha || todayISO(),
      motivo_baja: motivo.trim() || null,
    })

    await cargarTodo()
    setMensaje('Empleado dado de baja correctamente.')
  }

  const reactivar = async (empleado: Empleado) => {
    const confirmar = window.confirm(`¿Reactivar a ${empleado.nombre_completo}?`)
    if (!confirmar) return

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id ?? null
    const userEmail = authData?.user?.email ?? null
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('rrhh_empleados')
      .update({
        estado: 'ACTIVO',
        fecha_baja: null,
        motivo_baja: null,
        user_id: userId,
        updated_at: now,
        editado_por: userEmail,
        editado_en: now,
      })
      .eq('id', empleado.id)

    if (error) {
      setMensaje(`Error reactivando empleado: ${error.message}`)
      return
    }

    await guardarAuditoria(empleado.id, 'REACTIVAR', 'Empleado reactivado', {})
    await cargarTodo()
    setMensaje('Empleado reactivado correctamente.')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start gap-4 mb-5">
        <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-12" />

        <div>
          <h1 className="text-2xl font-bold">Recursos Humanos — Empleados</h1>
          <p className="text-sm text-gray-600">
            Registro base de empleados, salario, bono de producción y distribución contable por áreas.
          </p>
        </div>

        <Link
          href="/menu"
          className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          Volver al menú
        </Link>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-slate-50">{mensaje}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Datos del empleado</h2>

            <button
              type="button"
              onClick={limpiarFormulario}
              className="bg-slate-200 hover:bg-slate-300 px-3 py-2 rounded text-sm"
            >
              Nuevo empleado
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">ID / código</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nombre</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">DPI</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.dpi}
                onChange={(e) => setForm({ ...form, dpi: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">NIT</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.nit}
                onChange={(e) => setForm({ ...form, nit: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Teléfono</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Fecha ingreso</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={form.fecha_ingreso}
                onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Salario base mensual</label>
              <input
                type="number"
                className="w-full border rounded px-3 py-2"
                value={form.salario_base}
                onChange={(e) => setForm({ ...form, salario_base: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Bono producción diario</label>
              <input
                type="number"
                className="w-full border rounded px-3 py-2"
                value={form.bono_produccion_diario}
                onChange={(e) => setForm({ ...form, bono_produccion_diario: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Empresa</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.empresa_id}
                onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
              >
                <option value="">Sin empresa fija</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">División</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.division_id}
                onChange={(e) => setForm({ ...form, division_id: e.target.value })}
              >
                <option value="">Sin división fija</option>
                {divisiones.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">Cliente relacionado</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.cliente_id}
                onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
              >
                <option value="">No vinculado a cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre} {cliente.nit ? `— ${cliente.nit}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">Dirección</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="border rounded p-3">
              <div className="text-xs text-gray-600">Salario diario</div>
              <div className="text-lg font-bold">{money(salarioDiario)}</div>
            </div>

            <div className="border rounded p-3">
              <div className="text-xs text-gray-600">Hora normal</div>
              <div className="text-lg font-bold">{money(salarioHora)}</div>
            </div>

            <div className="border rounded p-3">
              <div className="text-xs text-gray-600">Hora extra 1.5</div>
              <div className="text-lg font-bold">{money(horaExtra)}</div>
            </div>
          </div>

          <div className="mt-4 border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Distribución contable por áreas</h3>
              <span className={totalDistribucion > 100 ? 'font-bold text-red-600' : 'font-bold'}>
                Total: {totalDistribucion.toFixed(2)}%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {areas.map((area) => (
                <div key={area.id}>
                  <label className="block text-xs font-semibold mb-1">{area.nombre}</label>
                  <input
                    type="number"
                    className="w-full border rounded px-3 py-2"
                    value={porcentajes[area.id] ?? '0'}
                    onChange={(e) => setPorcentajes({ ...porcentajes, [area.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Estado</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as 'ACTIVO' | 'BAJA' })}
              >
                <option value="ACTIVO">Activo</option>
                <option value="BAJA">Dado de baja</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Fecha baja</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={form.fecha_baja}
                onChange={(e) => setForm({ ...form, fecha_baja: e.target.value })}
                disabled={form.estado !== 'BAJA'}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Motivo baja</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.motivo_baja}
                onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })}
                disabled={form.estado !== 'BAJA'}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold mb-1">Observaciones</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            />
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={guardarEmpleado}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {saving ? 'Guardando...' : 'Guardar empleado'}
            </button>

            <button
              type="button"
              onClick={limpiarFormulario}
              className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded"
            >
              Limpiar
            </button>
          </div>
        </section>

        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Empleados registrados</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            <input
              className="border rounded px-3 py-2 md:col-span-2"
              placeholder="Buscar por ID, nombre, DPI o NIT"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <select
              className="border rounded px-3 py-2"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as 'ACTIVO' | 'BAJA' | 'TODOS')}
            >
              <option value="ACTIVO">Activos</option>
              <option value="BAJA">Dados de baja</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>

          <button
            type="button"
            onClick={cargarTodo}
            disabled={loading}
            className="mb-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>

          <div className="max-h-[690px] overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-200 sticky top-0">
                <tr>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Empleado</th>
                  <th className="p-2 text-left">Salario</th>
                  <th className="p-2 text-left">Bono diario</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Empresa / división</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empleadosFiltrados.map((empleado) => {
                  const cliente = empleado.cliente_id ? clientesMap.get(empleado.cliente_id) : null
                  const empresa = empleado.empresa_id ? empresasMap.get(empleado.empresa_id) : null
                  const division = empleado.division_id ? divisionesMap.get(empleado.division_id) : null

                  return (
                    <tr key={empleado.id} className="border-t align-top">
                      <td className="p-2 font-semibold">{empleado.codigo}</td>
                      <td className="p-2">
                        <div className="font-semibold">{empleado.nombre_completo}</div>
                        <div className="text-xs text-gray-600">Ingreso: {empleado.fecha_ingreso}</div>
                        {empleado.dpi && <div className="text-xs text-gray-600">DPI: {empleado.dpi}</div>}
                      </td>
                      <td className="p-2">{money(empleado.salario_base)}</td>
                      <td className="p-2">{money(empleado.bono_produccion_diario)}</td>
                      <td className="p-2">{cliente?.nombre || '—'}</td>
                      <td className="p-2">
                        <div>{empresa?.nombre || '—'}</div>
                        <div className="text-xs text-gray-600">{division?.nombre || '—'}</div>
                      </td>
                      <td className="p-2">
                        <span className={empleado.estado === 'ACTIVO' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                          {empleado.estado === 'ACTIVO' ? 'Activo' : 'Baja'}
                        </span>
                        {empleado.fecha_baja && <div className="text-xs text-gray-600">{empleado.fecha_baja}</div>}
                      </td>
                      <td className="p-2">
                        <div className="grid gap-1">
                          <button
                            type="button"
                            onClick={() => seleccionarEmpleado(empleado)}
                            className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 rounded"
                          >
                            Ver / Editar
                          </button>

                          {empleado.estado === 'ACTIVO' ? (
                            <button
                              type="button"
                              onClick={() => darDeBaja(empleado)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                            >
                              Dar de baja
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => reactivar(empleado)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {empleadosFiltrados.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-600" colSpan={8}>
                      No hay empleados con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
