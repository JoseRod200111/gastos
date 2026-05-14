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
  fecha: string
  tipo_origen: string
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
  created_at?: string | null
  updated_at?: string | null
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
] as const

const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function GranjaHembrasPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  const [filtros, setFiltros] = useState({
    q: '',
    estado: 'TODAS',
    ubicacion_id: 'TODAS',
    incluir_inactivas: false,
  })

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

  const resetForm = () =>
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

  const ubicMap = useMemo(() => {
    const m = new Map<number, Ubicacion>()
    ubicaciones.forEach((u) => m.set(u.id, u))
    return m
  }, [ubicaciones])

  const loteMap = useMemo(() => {
    const m = new Map<number, Lote>()
    lotes.forEach((l) => m.set(l.id, l))
    return m
  }, [lotes])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, lRes, cRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('fecha', { ascending: false })
          .limit(300),
        supabase
          .from('granja_cerdas')
          .select(
            'id, arete, nombre, estado, ubicacion_id, lote_id, fecha_nacimiento, peso_lb, notas, activa, created_at, updated_at'
          )
          .order('activa', { ascending: false })
          .order('arete', { ascending: true })
          .limit(2000),
      ])

      if (uRes.error) console.error('Error ubicaciones', uRes.error)
      if (lRes.error) console.error('Error lotes', lRes.error)
      if (cRes.error) console.error('Error cerdas', cRes.error)

      setUbicaciones((uRes.data as Ubicacion[]) || [])
      setLotes((lRes.data as Lote[]) || [])
      setCerdas((cRes.data as Cerda[]) || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleFiltroChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as any
    if (type === 'checkbox') {
      setFiltros((p) => ({ ...p, [name]: (e.target as HTMLInputElement).checked }))
    } else {
      setFiltros((p) => ({ ...p, [name]: value }))
    }
  }

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target as any
    if (type === 'checkbox') {
      setForm((p) => ({ ...p, [name]: (e.target as HTMLInputElement).checked }))
    } else {
      setForm((p) => ({ ...p, [name]: value }))
    }
  }

  const cerdasFiltradas = useMemo(() => {
    let rows = [...cerdas]

    if (!filtros.incluir_inactivas) rows = rows.filter((c) => c.activa)

    const q = filtros.q.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) => {
        const a = (c.arete || '').toLowerCase()
        const n = (c.nombre || '').toLowerCase()
        return a.includes(q) || n.includes(q)
      })
    }

    if (filtros.estado !== 'TODAS') rows = rows.filter((c) => c.estado === filtros.estado)

    if (filtros.ubicacion_id !== 'TODAS') {
      const id = Number(filtros.ubicacion_id)
      rows = rows.filter((c) => (c.ubicacion_id || 0) === id)
    }

    return rows
  }, [cerdas, filtros])

  const guardarCerda = async () => {
    const arete = form.arete.trim()
    const nombre = form.nombre.trim()
    if (!arete || !nombre) {
      alert('Areté y nombre son obligatorios.')
      return
    }

    if (!/^[A-Za-z0-9\-_.]+$/.test(arete)) {
      alert('El arete solo debe tener letras/números y - _ .')
      return
    }

    const peso = form.peso_lb.trim() ? Number(form.peso_lb) : null
    if (peso !== null && (Number.isNaN(peso) || peso < 0)) {
      alert('Peso (lb) inválido.')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        arete,
        nombre,
        estado: form.estado,
        ubicacion_id: form.ubicacion_id ? Number(form.ubicacion_id) : null,
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        fecha_nacimiento: form.fecha_nacimiento ? form.fecha_nacimiento : null,
        peso_lb: peso,
        notas: form.notas?.trim() ? form.notas.trim() : null,
        activa: !!form.activa,
        updated_at: new Date().toISOString(),
      }

      // insert
      const { error } = await supabase.from('granja_cerdas').insert(payload)

      if (error) {
        console.error('Error insertando cerda', error)
        if ((error as any)?.code === '23505') {
          alert('Ese arete ya existe. Debe ser único.')
        } else {
          alert('No se pudo guardar la cerda.')
        }
        return
      }

      alert('Cerda registrada.')
      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const toggleActiva = async (c: Cerda) => {
    if (
      !confirm(
        `${c.activa ? 'Desactivar' : 'Activar'} la cerda ${c.arete}?`
      )
    )
      return

    const { error } = await supabase
      .from('granja_cerdas')
      .update({ activa: !c.activa, updated_at: new Date().toISOString() })
      .eq('id', c.id)

    if (error) {
      console.error('Error cambiando activa', error)
      alert('No se pudo actualizar.')
      return
    }
    await cargarDatos()
  }

  const actualizarCampo = async (c: Cerda, patch: Partial<Cerda>) => {
    const { error } = await supabase
      .from('granja_cerdas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', c.id)

    if (error) {
      console.error('Error actualizando cerda', error)
      alert('No se pudo actualizar.')
      return false
    }
    return true
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-xs text-gray-600">
            Registro maestro de cerdas por arete y estado. Peso en libras (lb).
          </p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* FORM */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nueva cerda</h2>

          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-gray-600">Areté (único)</label>
                <input
                  name="arete"
                  value={form.arete}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Ej: AR1077"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Nombre</label>
                <input
                  name="nombre"
                  value={form.nombre}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Ej: Hembra 1077"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-gray-600">Estado</label>
                <select
                  name="estado"
                  value={form.estado}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="activa"
                    checked={form.activa}
                    onChange={handleFormChange}
                  />
                  Activa
                </label>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-gray-600">Ubicación actual</label>
                <select
                  name="ubicacion_id"
                  value={form.ubicacion_id}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">— Selecciona —</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nombre || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600">Lote (opcional)</label>
                <select
                  name="lote_id"
                  value={form.lote_id}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">— Sin lote —</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.codigo} ({l.tipo_origen}) · {l.fecha}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-gray-600">Fecha nacimiento (opcional)</label>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  value={form.fecha_nacimiento || ''}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                  max={hoyISO()}
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
                <input
                  name="peso_lb"
                  value={form.peso_lb}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Ej: 420"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Notas (opcional)</label>
              <textarea
                name="notas"
                value={form.notas}
                onChange={handleFormChange}
                className="w-full border rounded px-3 py-2"
                rows={3}
                placeholder="Observaciones generales de la cerda"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={guardarCerda}
                disabled={guardando}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
              >
                {guardando ? 'Guardando…' : 'Guardar cerda'}
              </button>

              <button
                onClick={resetForm}
                className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* LISTA */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Cerdas registradas</h2>

          <div className="grid gap-3 md:grid-cols-4 mb-3">
            <input
              name="q"
              value={filtros.q}
              onChange={handleFiltroChange}
              className="border rounded px-3 py-2 md:col-span-2"
              placeholder="Buscar por arete o nombre…"
            />

            <select
              name="estado"
              value={filtros.estado}
              onChange={handleFiltroChange}
              className="border rounded px-3 py-2"
            >
              <option value="TODAS">Todos estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <select
              name="ubicacion_id"
              value={filtros.ubicacion_id}
              onChange={handleFiltroChange}
              className="border rounded px-3 py-2"
            >
              <option value="TODAS">Todas ubicaciones</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm md:col-span-4">
              <input
                type="checkbox"
                name="incluir_inactivas"
                checked={filtros.incluir_inactivas}
                onChange={handleFiltroChange}
              />
              Incluir inactivas
            </label>

            <div className="md:col-span-4 flex gap-2">
              <button
                onClick={cargarDatos}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                🔎 Recargar
              </button>
              {loading && <span className="text-sm text-gray-500 self-center">Cargando…</span>}
            </div>
          </div>

          <div className="text-xs text-gray-600 mb-2">
            Mostrando: <span className="font-semibold">{cerdasFiltradas.length}</span>
          </div>

          <div className="border rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2 border">Areté</th>
                  <th className="text-left p-2 border">Nombre</th>
                  <th className="text-left p-2 border">Estado</th>
                  <th className="text-left p-2 border">Ubicación</th>
                  <th className="text-left p-2 border">Lote</th>
                  <th className="text-right p-2 border">Peso (lb)</th>
                  <th className="text-center p-2 border">Activa</th>
                  <th className="text-center p-2 border">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {cerdasFiltradas.length === 0 ? (
                  <tr>
                    <td className="p-3 text-center text-gray-500" colSpan={8}>
                      No hay cerdas con esos filtros.
                    </td>
                  </tr>
                ) : (
                  cerdasFiltradas.map((c) => {
                    const u = c.ubicacion_id ? ubicMap.get(c.ubicacion_id) : null
                    const l = c.lote_id ? loteMap.get(c.lote_id) : null

                    return (
                      <tr key={c.id} className="border-t">
                        <td className="p-2 border font-semibold">{c.arete}</td>
                        <td className="p-2 border">{c.nombre}</td>

                        <td className="p-2 border">
                          <select
                            className="border rounded px-2 py-1 w-full"
                            value={c.estado}
                            onChange={async (e) => {
                              const ok = await actualizarCampo(c, { estado: e.target.value })
                              if (ok) await cargarDatos()
                            }}
                          >
                            {ESTADOS.map((e) => (
                              <option key={e} value={e}>
                                {e}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2 border">
                          <select
                            className="border rounded px-2 py-1 w-full"
                            value={c.ubicacion_id ?? ''}
                            onChange={async (e) => {
                              const v = e.target.value
                              const ok = await actualizarCampo(c, {
                                ubicacion_id: v ? Number(v) : null,
                              })
                              if (ok) await cargarDatos()
                            }}
                          >
                            <option value="">—</option>
                            {ubicaciones.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.codigo}
                              </option>
                            ))}
                          </select>

                          <div className="text-[11px] text-gray-500 mt-1">
                            {u ? `${u.codigo} — ${u.nombre || ''}` : '—'}
                          </div>
                        </td>

                        <td className="p-2 border">
                          <select
                            className="border rounded px-2 py-1 w-full"
                            value={c.lote_id ?? ''}
                            onChange={async (e) => {
                              const v = e.target.value
                              const ok = await actualizarCampo(c, {
                                lote_id: v ? Number(v) : null,
                              })
                              if (ok) await cargarDatos()
                            }}
                          >
                            <option value="">—</option>
                            {lotes.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.codigo}
                              </option>
                            ))}
                          </select>

                          <div className="text-[11px] text-gray-500 mt-1">
                            {l ? `${l.codigo} (${l.tipo_origen})` : '—'}
                          </div>
                        </td>

                        <td className="p-2 border text-right">
                          <input
                            className="border rounded px-2 py-1 w-24 text-right"
                            defaultValue={c.peso_lb ?? ''}
                            placeholder="—"
                            onBlur={async (e) => {
                              const raw = e.target.value.trim()
                              const val = raw ? Number(raw) : null
                              if (val !== null && (Number.isNaN(val) || val < 0)) {
                                alert('Peso (lb) inválido.')
                                e.target.value = String(c.peso_lb ?? '')
                                return
                              }
                              if ((c.peso_lb ?? null) === val) return
                              const ok = await actualizarCampo(c, { peso_lb: val })
                              if (ok) await cargarDatos()
                            }}
                          />
                        </td>

                        <td className="p-2 border text-center">
                          {c.activa ? 'Sí' : 'No'}
                        </td>

                        <td className="p-2 border text-center">
                          <div className="flex gap-2 justify-center">
                            <Link
                              href={`/granja/hembras/ficha?arete=${encodeURIComponent(c.arete)}`}
                              className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 rounded text-xs"
                              title="Ficha (próximo paso)"
                            >
                              Ficha
                            </Link>
                            <button
                              onClick={() => toggleActiva(c)}
                              className={`px-3 py-1 rounded text-xs text-white ${
                                c.activa
                                  ? 'bg-orange-600 hover:bg-orange-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {c.activa ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-gray-500 mt-3">
            La “Ficha” todavía no existe: será la próxima pantalla (historial + eventos próximos).
          </div>
        </div>
      </div>
    </div>
  )
}
