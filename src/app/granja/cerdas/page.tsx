'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
}

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_lb: number | null
  notas: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

type MovimientoGranja = {
  fecha: string
  ubicacion_id: number
  lote_id?: number | null
  tipo: 'AJUSTE' | 'SALIDA_MUERTE'
  cantidad: number
  referencia_tabla: string
  referencia_id: number
  observaciones?: string | null
}

const ESTADOS = [
  'VACIA',
  'SERVIDA',
  'PRENADA',
  'LACTANDO',
  'DESTETADA',
  'ABORTO',
  'MUERTA',
  'BAJA',
]

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const fechaISOaTimestampMediodia = (fechaISO: string) => {
  return new Date(`${fechaISO}T12:00:00.000Z`).toISOString()
}

export default function GranjaCerdasPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  const [form, setForm] = useState({
    arete: '',
    nombre: '',
    estado: 'VACIA',
    ubicacion_id: '',
    lote_id: '',
    fecha_nacimiento: '',
    peso_lb: '',
    notas: '',
    activa: true,
  })

  const [filtros, setFiltros] = useState({
    q: '',
    estado: 'TODAS',
    ubicacion_id: 'TODAS',
    incluir_inactivas: false,
  })

  const registrarMovimiento = useCallback(async (opts: MovimientoGranja) => {
    const { data: userData } = await supabase.auth.getUser()

    const payload = {
      fecha: opts.fecha,
      ubicacion_id: opts.ubicacion_id,
      lote_id: opts.lote_id ?? null,
      tipo: opts.tipo,
      cantidad: opts.cantidad,
      peso_total_kg: null,
      referencia_tabla: opts.referencia_tabla,
      referencia_id: opts.referencia_id,
      user_id: userData?.user?.id ?? null,
      observaciones: opts.observaciones ?? null,
    }

    const res = await supabase.from('granja_movimientos').insert([payload])

    if (res.error) throw res.error
  }, [])

  const cargarCatalogos = useCallback(async () => {
    const ubicacionesRes = await supabase
      .from('granja_ubicaciones')
      .select('id,codigo,nombre')
      .order('codigo', { ascending: true })

    if (!ubicacionesRes.error) {
      setUbicaciones((ubicacionesRes.data ?? []) as Ubicacion[])
    }

    const lotesRes = await supabase
      .from('granja_lotes')
      .select('id,codigo')
      .order('codigo', { ascending: true })

    if (!lotesRes.error) {
      setLotes((lotesRes.data ?? []) as Lote[])
    }
  }, [])

  const cargarCerdas = useCallback(async () => {
    setLoading(true)
    setMsg(null)

    try {
      let query = supabase
        .from('granja_cerdas')
        .select(
          'id,arete,nombre,estado,ubicacion_id,lote_id,fecha_nacimiento,peso_lb,notas,activa,created_at,updated_at'
        )
        .order('arete', { ascending: true })

      if (filtros.estado !== 'TODAS') {
        query = query.eq('estado', filtros.estado)
      }

      if (filtros.ubicacion_id !== 'TODAS') {
        query = query.eq('ubicacion_id', Number(filtros.ubicacion_id))
      }

      if (!filtros.incluir_inactivas) {
        query = query.eq('activa', true)
      }

      const busqueda = filtros.q.trim()

      if (busqueda) {
        query = query.or(`arete.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%`)
      }

      const res = await query

      if (res.error) throw res.error

      setCerdas((res.data ?? []) as Cerda[])
    } catch (error) {
      console.error('Error cargando cerdas', error)
      const message = error instanceof Error ? error.message : 'Error cargando cerdas.'
      setMsg(message)
    } finally {
      setLoading(false)
    }
  }, [filtros.estado, filtros.incluir_inactivas, filtros.q, filtros.ubicacion_id])

  useEffect(() => {
    cargarCatalogos()
    cargarCerdas()
  }, [cargarCatalogos, cargarCerdas])

  const resetForm = () => {
    setForm({
      arete: '',
      nombre: '',
      estado: 'VACIA',
      ubicacion_id: '',
      lote_id: '',
      fecha_nacimiento: '',
      peso_lb: '',
      notas: '',
      activa: true,
    })
  }

  const crearCerda = async () => {
    setMsg(null)

    try {
      setGuardando(true)

      const arete = form.arete.trim().toUpperCase()
      const nombre = form.nombre.trim()

      if (!arete) throw new Error('Arete es requerido.')
      if (!nombre) throw new Error('Nombre es requerido.')
      if (!form.ubicacion_id) throw new Error('Ubicación es requerida.')

      const ubicacionId = Number(form.ubicacion_id)

      if (!Number.isFinite(ubicacionId)) {
        throw new Error('Ubicación inválida.')
      }

      const loteId = form.lote_id ? Number(form.lote_id) : null

      if (form.lote_id && !Number.isFinite(Number(form.lote_id))) {
        throw new Error('Lote inválido.')
      }

      const pesoLb =
        form.peso_lb.trim() === ''
          ? null
          : Number(form.peso_lb.replace(',', '.'))

      if (pesoLb !== null && (!Number.isFinite(pesoLb) || pesoLb < 0)) {
        throw new Error('Peso inválido.')
      }

      const estadoFinal = form.estado
      const activaFinal =
        form.activa && estadoFinal !== 'MUERTA' && estadoFinal !== 'BAJA'

      const insertRes = await supabase
        .from('granja_cerdas')
        .insert([
          {
            arete,
            nombre,
            estado: estadoFinal,
            ubicacion_id: ubicacionId,
            lote_id: loteId,
            fecha_nacimiento: form.fecha_nacimiento || null,
            peso_lb: pesoLb,
            notas: form.notas.trim() || null,
            activa: activaFinal,
          },
        ])
        .select('id,ubicacion_id,lote_id,activa,estado')
        .single()

      if (insertRes.error) throw insertRes.error

      const nuevaCerda = insertRes.data

      if (
        nuevaCerda?.id &&
        nuevaCerda?.ubicacion_id &&
        nuevaCerda.activa &&
        nuevaCerda.estado !== 'MUERTA' &&
        nuevaCerda.estado !== 'BAJA'
      ) {
        try {
          await registrarMovimiento({
            fecha: fechaISOaTimestampMediodia(hoyISO()),
            ubicacion_id: Number(nuevaCerda.ubicacion_id),
            lote_id: nuevaCerda.lote_id ? Number(nuevaCerda.lote_id) : null,
            tipo: 'AJUSTE',
            cantidad: 1,
            referencia_tabla: 'granja_cerdas',
            referencia_id: Number(nuevaCerda.id),
            observaciones: `ALTA CERDA ${arete}`,
          })
        } catch (movError) {
          await supabase.from('granja_cerdas').delete().eq('id', nuevaCerda.id)
          throw movError
        }
      }

      setMsg('Cerda guardada correctamente.')
      resetForm()
      await cargarCerdas()
    } catch (error) {
      console.error('Error creando cerda', error)
      const message = error instanceof Error ? error.message : 'Error creando cerda.'
      setMsg(message)
      alert(message)
    } finally {
      setGuardando(false)
    }
  }

  const actualizarCerdaCampo = async (id: number, patch: Partial<Cerda>) => {
    try {
      const updateRes = await supabase.from('granja_cerdas').update(patch).eq('id', id)

      if (updateRes.error) throw updateRes.error

      setCerdas((prev) =>
        prev.map((cerda) => (cerda.id === id ? { ...cerda, ...patch } : cerda))
      )
    } catch (error) {
      console.error('Error actualizando cerda', error)
      const message = error instanceof Error ? error.message : 'No se pudo guardar el cambio.'
      setMsg(message)
      alert(message)
    }
  }

  const cambiarEstadoCerda = async (cerda: Cerda, nuevoEstado: string) => {
    setMsg(null)

    try {
      const estadoAnterior = cerda.estado
      const activaAnterior = cerda.activa
      const pasaAMuerte = nuevoEstado === 'MUERTA'
      const pasaABaja = nuevoEstado === 'BAJA'

      if (estadoAnterior === nuevoEstado) return

      if ((pasaAMuerte || pasaABaja) && !cerda.ubicacion_id) {
        throw new Error('La cerda necesita una ubicación para afectar inventario.')
      }

      const patch: Partial<Cerda> = {
        estado: nuevoEstado,
      }

      if (pasaAMuerte || pasaABaja) {
        patch.activa = false
      }

      const updateRes = await supabase.from('granja_cerdas').update(patch).eq('id', cerda.id)

      if (updateRes.error) throw updateRes.error

      if ((pasaAMuerte || pasaABaja) && activaAnterior && cerda.ubicacion_id) {
        try {
          await registrarMovimiento({
            fecha: fechaISOaTimestampMediodia(hoyISO()),
            ubicacion_id: Number(cerda.ubicacion_id),
            lote_id: cerda.lote_id ? Number(cerda.lote_id) : null,
            tipo: pasaAMuerte ? 'SALIDA_MUERTE' : 'AJUSTE',
            cantidad: pasaAMuerte ? 1 : -1,
            referencia_tabla: 'granja_cerdas',
            referencia_id: cerda.id,
            observaciones: pasaAMuerte
              ? `MUERTE CERDA ${cerda.arete}`
              : `BAJA CERDA ${cerda.arete}`,
          })
        } catch (movError) {
          await supabase
            .from('granja_cerdas')
            .update({
              estado: estadoAnterior,
              activa: activaAnterior,
            })
            .eq('id', cerda.id)

          throw movError
        }
      }

      setCerdas((prev) =>
        prev.map((item) =>
          item.id === cerda.id
            ? {
                ...item,
                ...patch,
              }
            : item
        )
      )

      setMsg('Estado actualizado correctamente.')
    } catch (error) {
      console.error('Error cambiando estado de cerda', error)
      const message =
        error instanceof Error ? error.message : 'No se pudo cambiar el estado.'
      setMsg(message)
      alert(message)
    }
  }

  const cambiarUbicacionCerda = async (cerda: Cerda, ubicacionId: string) => {
    const nuevoValor = ubicacionId ? Number(ubicacionId) : null

    if (ubicacionId && !Number.isFinite(Number(ubicacionId))) {
      alert('Ubicación inválida.')
      return
    }

    await actualizarCerdaCampo(cerda.id, {
      ubicacion_id: nuevoValor,
    })
  }

  const cambiarLoteCerda = async (cerda: Cerda, loteId: string) => {
    const nuevoValor = loteId ? Number(loteId) : null

    if (loteId && !Number.isFinite(Number(loteId))) {
      alert('Lote inválido.')
      return
    }

    await actualizarCerdaCampo(cerda.id, {
      lote_id: nuevoValor,
    })
  }

  const cambiarPesoCerda = async (cerda: Cerda, valor: string) => {
    const peso = valor.trim() === '' ? null : Number(valor.replace(',', '.'))

    if (peso !== null && (!Number.isFinite(peso) || peso < 0)) {
      alert('Peso inválido.')
      await cargarCerdas()
      return
    }

    await actualizarCerdaCampo(cerda.id, {
      peso_lb: peso,
    })
  }

  const cambiarActivaCerda = async (cerda: Cerda, activa: boolean) => {
    if (!activa && cerda.estado !== 'MUERTA' && cerda.estado !== 'BAJA') {
      const confirmar = window.confirm(
        'Esto marcará la cerda como inactiva, pero no afectará inventario. Para muerte o baja usa el estado MUERTA o BAJA. ¿Deseas continuar?'
      )

      if (!confirmar) return
    }

    await actualizarCerdaCampo(cerda.id, {
      activa,
    })
  }

  const ubicMap = useMemo(() => {
    return new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion]))
  }, [ubicaciones])

  const loteMap = useMemo(() => {
    return new Map(lotes.map((lote) => [lote.id, lote]))
  }, [lotes])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-sm text-gray-600">
            Registro maestro de cerdas por arete, ubicación, lote y estado.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/granja/cerdas/evento"
            className="text-sm px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Registrar evento
          </Link>

          <Link
            href="/granja"
            className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
          >
            ← Menú de Granja
          </Link>
        </div>
      </div>

      {msg ? (
        <div className="mb-4 p-3 rounded border bg-white text-sm">{msg}</div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Nueva cerda</h2>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Arete único</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: AR1077"
                  value={form.arete}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      arete: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Nombre</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: Hembra 1077"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs text-gray-600">Estado inicial</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={form.estado}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      estado: e.target.value,
                      activa:
                        e.target.value === 'MUERTA' || e.target.value === 'BAJA'
                          ? false
                          : prev.activa,
                    }))
                  }
                >
                  {ESTADOS.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activa}
                  disabled={form.estado === 'MUERTA' || form.estado === 'BAJA'}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      activa: e.target.checked,
                    }))
                  }
                />
                Activa
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Ubicación actual</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={form.ubicacion_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      ubicacion_id: e.target.value,
                    }))
                  }
                >
                  <option value="">— Selecciona —</option>
                  {ubicaciones.map((ubicacion) => (
                    <option key={ubicacion.id} value={String(ubicacion.id)}>
                      {ubicacion.codigo} — {ubicacion.nombre ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600">Lote opcional</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={form.lote_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      lote_id: e.target.value,
                    }))
                  }
                >
                  <option value="">— Sin lote —</option>
                  {lotes.map((lote) => (
                    <option key={lote.id} value={String(lote.id)}>
                      {lote.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">
                  Fecha nacimiento opcional
                </label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-2"
                  value={form.fecha_nacimiento}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      fecha_nacimiento: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Peso lb opcional</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: 420"
                  value={form.peso_lb}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      peso_lb: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Notas opcionales</label>
              <textarea
                className="w-full border rounded px-2 py-2"
                placeholder="Observaciones generales de la cerda"
                rows={4}
                value={form.notas}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    notas: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={crearCerda}
                disabled={guardando}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              >
                {guardando ? 'Guardando...' : 'Guardar cerda'}
              </button>

              <button
                onClick={resetForm}
                disabled={guardando}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-60"
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Cerdas registradas</h2>

            <button
              onClick={cargarCerdas}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Recargar
            </button>
          </div>

          <div className="grid gap-2 mb-3">
            <div className="grid grid-cols-3 gap-2">
              <input
                className="border rounded px-2 py-2 col-span-1"
                placeholder="Buscar arete o nombre..."
                value={filtros.q}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    q: e.target.value,
                  }))
                }
              />

              <select
                className="border rounded px-2 py-2"
                value={filtros.estado}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    estado: e.target.value,
                  }))
                }
              >
                <option value="TODAS">Todos estados</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>

              <select
                className="border rounded px-2 py-2"
                value={filtros.ubicacion_id}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    ubicacion_id: e.target.value,
                  }))
                }
              >
                <option value="TODAS">Todas ubicaciones</option>
                {ubicaciones.map((ubicacion) => (
                  <option key={ubicacion.id} value={String(ubicacion.id)}>
                    {ubicacion.codigo}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.incluir_inactivas}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    incluir_inactivas: e.target.checked,
                  }))
                }
              />
              Incluir inactivas
            </label>

            <button
              onClick={cargarCerdas}
              className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white text-sm w-fit"
            >
              Aplicar filtros
            </button>
          </div>

          <div className="text-xs text-gray-600 mb-2">
            {loading ? 'Cargando...' : `Mostrando: ${cerdas.length}`}
          </div>

          <div className="border rounded overflow-auto">
            <table className="min-w-[780px] w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-2 text-left">Arete</th>
                  <th className="border px-2 py-2 text-left">Nombre</th>
                  <th className="border px-2 py-2 text-left">Estado</th>
                  <th className="border px-2 py-2 text-left">Ubicación</th>
                  <th className="border px-2 py-2 text-left">Lote</th>
                  <th className="border px-2 py-2 text-right">Peso lb</th>
                  <th className="border px-2 py-2 text-center">Activa</th>
                </tr>
              </thead>

              <tbody>
                {cerdas.length === 0 ? (
                  <tr>
                    <td
                      className="border px-2 py-4 text-center text-gray-600"
                      colSpan={7}
                    >
                      No hay registros con esos filtros.
                    </td>
                  </tr>
                ) : (
                  cerdas.map((cerda) => {
                    const ubicacion = cerda.ubicacion_id
                      ? ubicMap.get(cerda.ubicacion_id)
                      : null

                    const lote = cerda.lote_id ? loteMap.get(cerda.lote_id) : null

                    return (
                      <tr key={cerda.id} className="hover:bg-gray-50">
                        <td className="border px-2 py-2">{cerda.arete}</td>

                        <td className="border px-2 py-2">{cerda.nombre}</td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={cerda.estado}
                            onChange={(e) =>
                              cambiarEstadoCerda(cerda, e.target.value)
                            }
                          >
                            {ESTADOS.map((estado) => (
                              <option key={estado} value={estado}>
                                {estado}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={cerda.ubicacion_id ?? ''}
                            onChange={(e) =>
                              cambiarUbicacionCerda(cerda, e.target.value)
                            }
                          >
                            <option value="">—</option>
                            {ubicaciones.map((ubicacionItem) => (
                              <option
                                key={ubicacionItem.id}
                                value={String(ubicacionItem.id)}
                              >
                                {ubicacionItem.codigo}
                              </option>
                            ))}
                          </select>

                          {ubicacion ? (
                            <div className="text-[11px] text-gray-500">
                              {ubicacion.codigo} — {ubicacion.nombre ?? ''}
                            </div>
                          ) : null}
                        </td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={cerda.lote_id ?? ''}
                            onChange={(e) => cambiarLoteCerda(cerda, e.target.value)}
                          >
                            <option value="">—</option>
                            {lotes.map((loteItem) => (
                              <option key={loteItem.id} value={String(loteItem.id)}>
                                {loteItem.codigo}
                              </option>
                            ))}
                          </select>

                          {lote ? (
                            <div className="text-[11px] text-gray-500">
                              {lote.codigo}
                            </div>
                          ) : null}
                        </td>

                        <td className="border px-2 py-2 text-right">
                          <input
                            className="border rounded px-2 py-1 w-24 text-right"
                            value={cerda.peso_lb ?? ''}
                            onChange={(e) => {
                              const valor = e.target.value

                              setCerdas((prev) =>
                                prev.map((item) =>
                                  item.id === cerda.id
                                    ? {
                                        ...item,
                                        peso_lb:
                                          valor.trim() === ''
                                            ? null
                                            : Number(valor.replace(',', '.')),
                                      }
                                    : item
                                )
                              )
                            }}
                            onBlur={(e) => cambiarPesoCerda(cerda, e.target.value)}
                          />
                        </td>

                        <td className="border px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!cerda.activa}
                            onChange={(e) =>
                              cambiarActivaCerda(cerda, e.target.checked)
                            }
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Para muerte, baja, parto, destete o revisión de embarazo es mejor usar la pantalla de eventos.
          </p>
        </section>
      </div>
    </div>
  )
}
