'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  tipo?: string | null
  activo?: boolean | null
}

type Lote = {
  id: number
  codigo: string
  tipo_origen?: string | null
  fecha?: string | null
  observaciones?: string | null
}

type CerdaEstado =
  | 'VACIA'
  | 'SERVIDA'
  | 'PRENADA'
  | 'LACTANDO'
  | 'DESTETADA'
  | 'ABORTO'
  | 'MUERTA'
  | 'BAJA'

type RelUbic = { codigo: string; nombre: string | null }
type RelLote = { codigo: string }

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: CerdaEstado
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_lb: number | null
  notas: string | null
  activa: boolean
  created_at: string | null
  updated_at: string | null
  granja_ubicaciones?: RelUbic | RelUbic[] | null
  granja_lotes?: RelLote | RelLote[] | null
}

type FormCerda = {
  arete: string
  nombre: string
  estado: CerdaEstado
  ubicacion_id: string
  lote_id: string
  fecha_nacimiento: string
  peso_lb: string
  notas: string
  activa: boolean
}

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const toNumOrNull = (v: string) => {
  const t = (v ?? '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const firstOrNull = <T,>(v: T | T[] | null | undefined): T | null => {
  if (!v) return null
  if (Array.isArray(v)) return v[0] ?? null
  return v
}

export default function GranjaCerdasPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  // filtros
  const [fArete, setFArete] = useState('')
  const [fNombre, setFNombre] = useState('')
  const [fEstado, setFEstado] = useState<string>('') // '' = todos
  const [fUbicacion, setFUbicacion] = useState<string>('') // '' = todas
  const [fActivas, setFActivas] = useState<boolean>(true)

  // alta
  const [form, setForm] = useState<FormCerda>({
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

  // edición
  const [editId, setEditId] = useState<number | null>(null)
  const [edit, setEdit] = useState<FormCerda | null>(null)
  const [guardandoEditId, setGuardandoEditId] = useState<number | null>(null)

  const estados: CerdaEstado[] = useMemo(
    () => ['VACIA', 'SERVIDA', 'PRENADA', 'LACTANDO', 'DESTETADA', 'ABORTO', 'MUERTA', 'BAJA'],
    []
  )

  const cargarCatalogos = useCallback(async () => {
    const uRes = await supabase
      .from('granja_ubicaciones')
      .select('id, codigo, nombre, tipo, activo')
      .order('codigo', { ascending: true })

    if (uRes.error) {
      console.error('Error cargando ubicaciones', uRes.error)
      alert('No se pudieron cargar las ubicaciones.')
      return
    }

    const lRes = await supabase
      .from('granja_lotes')
      .select('id, codigo, tipo_origen, fecha, observaciones')
      .order('fecha', { ascending: false })
      .limit(500)

    if (lRes.error) {
      console.error('Error cargando lotes', lRes.error)
      alert('No se pudieron cargar los lotes.')
      return
    }

    const ubis = (uRes.data ?? []) as Ubicacion[]
    const lts = (lRes.data ?? []) as Lote[]

    setUbicaciones(ubis)
    setLotes(lts)

    if (!form.ubicacion_id && ubis.length > 0) {
      setForm((p) => ({ ...p, ubicacion_id: String(ubis[0].id) }))
    }
  }, [form.ubicacion_id])

  const cargarCerdas = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('granja_cerdas')
        .select(
          [
            'id',
            'arete',
            'nombre',
            'estado',
            'ubicacion_id',
            'lote_id',
            'fecha_nacimiento',
            'peso_lb',
            'notas',
            'activa',
            'created_at',
            'updated_at',
            'granja_ubicaciones ( codigo, nombre )',
            'granja_lotes ( codigo )',
          ].join(', ')
        )
        .order('activa', { ascending: false })
        .order('arete', { ascending: true })

      if (fActivas) q = q.eq('activa', true)
      if (fArete.trim()) q = q.ilike('arete', `%${fArete.trim()}%`)
      if (fNombre.trim()) q = q.ilike('nombre', `%${fNombre.trim()}%`)
      if (fEstado) q = q.eq('estado', fEstado)
      if (fUbicacion) q = q.eq('ubicacion_id', Number(fUbicacion))

      const { data, error } = await q
      if (error) {
        console.error('Error cargando cerdas', error)
        alert(`No se pudieron cargar las cerdas. ${error.message}`)
        setCerdas([])
        return
      }

      const mapped: Cerda[] = (data ?? []).map((r: any) => ({
        ...r,
        granja_ubicaciones: firstOrNull<RelUbic>(r.granja_ubicaciones),
        granja_lotes: firstOrNull<RelLote>(r.granja_lotes),
      }))

      setCerdas(mapped)
    } finally {
      setLoading(false)
    }
  }, [fActivas, fArete, fNombre, fEstado, fUbicacion])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    cargarCerdas()
  }, [cargarCerdas])

  const limpiarFiltros = () => {
    setFArete('')
    setFNombre('')
    setFEstado('')
    setFUbicacion('')
    setFActivas(true)
  }

  const resetForm = () => {
    setForm({
      arete: '',
      nombre: '',
      estado: 'VACIA',
      ubicacion_id: ubicaciones.length ? String(ubicaciones[0].id) : '',
      lote_id: '',
      fecha_nacimiento: '',
      peso_lb: '',
      notas: '',
      activa: true,
    })
  }

  const crearCerda = async () => {
    const arete = form.arete.trim()
    const nombre = form.nombre.trim()

    if (!arete) return alert('El arete es obligatorio.')
    if (!nombre) return alert('El nombre es obligatorio.')

    const peso = toNumOrNull(form.peso_lb)
    if (Number.isNaN(peso)) return alert('Peso inválido.')

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
        activa: form.activa,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('granja_cerdas').insert(payload)
      if (error) {
        console.error('Error creando cerda', error)
        alert(`No se pudo crear. ${error.message}`)
        return
      }

      resetForm()
      await cargarCerdas()
      alert('Cerda registrada.')
    } finally {
      setGuardando(false)
    }
  }

  const empezarEdicion = (c: Cerda) => {
    setEditId(c.id)
    setEdit({
      arete: c.arete ?? '',
      nombre: c.nombre ?? '',
      estado: (c.estado as CerdaEstado) ?? 'VACIA',
      ubicacion_id: c.ubicacion_id ? String(c.ubicacion_id) : '',
      lote_id: c.lote_id ? String(c.lote_id) : '',
      fecha_nacimiento: c.fecha_nacimiento ?? '',
      peso_lb: c.peso_lb == null ? '' : String(c.peso_lb),
      notas: c.notas ?? '',
      activa: Boolean(c.activa),
    })
  }

  const cancelarEdicion = () => {
    setEditId(null)
    setEdit(null)
  }

  const guardarEdicion = async (id: number) => {
    if (!edit) return
    const arete = edit.arete.trim()
    const nombre = edit.nombre.trim()

    if (!arete) return alert('El arete es obligatorio.')
    if (!nombre) return alert('El nombre es obligatorio.')

    const peso = toNumOrNull(edit.peso_lb)
    if (Number.isNaN(peso)) return alert('Peso inválido.')

    setGuardandoEditId(id)
    try {
      const payload = {
        arete,
        nombre,
        estado: edit.estado,
        ubicacion_id: edit.ubicacion_id ? Number(edit.ubicacion_id) : null,
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        fecha_nacimiento: edit.fecha_nacimiento ? edit.fecha_nacimiento : null,
        peso_lb: peso,
        notas: edit.notas?.trim() ? edit.notas.trim() : null,
        activa: edit.activa,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('granja_cerdas').update(payload).eq('id', id)
      if (error) {
        console.error('Error actualizando cerda', error)
        alert(`No se pudo actualizar. ${error.message}`)
        return
      }

      cancelarEdicion()
      await cargarCerdas()
      alert('Cerda actualizada.')
    } finally {
      setGuardandoEditId(null)
    }
  }

  const bajaLogica = async (c: Cerda) => {
    if (!confirm(`¿Dar de baja a la cerda ${c.arete}? (no se elimina, solo se desactiva)`)) return
    const { error } = await supabase
      .from('granja_cerdas')
      .update({ activa: false, estado: 'BAJA', updated_at: new Date().toISOString() })
      .eq('id', c.id)

    if (error) {
      console.error('Error dando de baja', error)
      alert('No se pudo dar de baja.')
      return
    }
    await cargarCerdas()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-sm text-gray-600">Registro maestro de cerdas por arete y estado. Peso en libras (lb).</p>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      {/* Layout original: 2 paneles */}
      <div className="grid gap-6 md:grid-cols-2 mt-6">
        {/* Nueva cerda */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Nueva cerda</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-600">Arete (único)</label>
              <input
                className="border p-2 w-full"
                value={form.arete}
                onChange={(e) => setForm((p) => ({ ...p, arete: e.target.value }))}
                placeholder="Ej: AR1077"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Nombre</label>
              <input
                className="border p-2 w-full"
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Hembra 1077"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Estado</label>
              <select
                className="border p-2 w-full"
                value={form.estado}
                onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value as CerdaEstado }))}
              >
                {estados.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm mt-6">
              <input
                type="checkbox"
                checked={form.activa}
                onChange={(e) => setForm((p) => ({ ...p, activa: e.target.checked }))}
              />
              Activa
            </label>

            <div>
              <label className="text-xs text-gray-600">Ubicación actual</label>
              <select
                className="border p-2 w-full"
                value={form.ubicacion_id}
                onChange={(e) => setForm((p) => ({ ...p, ubicacion_id: e.target.value }))}
              >
                <option value="">— Selecciona —</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Lote (opcional)</label>
              <select
                className="border p-2 w-full"
                value={form.lote_id}
                onChange={(e) => setForm((p) => ({ ...p, lote_id: e.target.value }))}
              >
                <option value="">— Sin lote —</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Fecha nacimiento (opcional)</label>
              <input
                type="date"
                className="border p-2 w-full"
                value={form.fecha_nacimiento}
                onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                max={hoyISO()}
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.peso_lb}
                onChange={(e) => setForm((p) => ({ ...p, peso_lb: e.target.value }))}
                placeholder="Ej: 420"
                step="0.01"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Notas (opcional)</label>
              <textarea
                className="border p-2 w-full"
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones generales de la cerda"
                rows={4}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={crearCerda}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {guardando ? 'Guardando…' : 'Guardar cerda'}
            </button>
            <button onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded">
              Limpiar
            </button>
          </div>
        </section>

        {/* Cerdas registradas */}
        <section className="border rounded-lg p-4 shadow-sm bg-white overflow-x-auto">
          <h2 className="font-semibold mb-3">Cerdas registradas</h2>

          <div className="grid gap-2 md:grid-cols-3 items-center mb-2">
            <input
              className="border p-2"
              placeholder="Buscar por arete o nombre…"
              value={fArete || fNombre ? (fArete ? fArete : fNombre) : ''}
              onChange={(e) => {
                // Si escribe aquí, lo usamos como búsqueda general: arete + nombre
                const v = e.target.value
                setFArete(v)
                setFNombre(v)
              }}
            />

            <select className="border p-2" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="">Todos estados</option>
              {estados.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className="border p-2"
              value={fUbicacion}
              onChange={(e) => setFUbicacion(e.target.value)}
            >
              <option value="">Todas ubicaciones</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={!fActivas}
                onChange={(e) => setFActivas(!e.target.checked)}
              />
              Incluir inactivas
            </label>

            <button
              onClick={cargarCerdas}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              🔎 Recargar
            </button>
          </div>

          <div className="text-xs text-gray-600 mb-2">
            Mostrando: {loading ? '…' : cerdas.length}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-2 border text-left">Arete</th>
                <th className="p-2 border text-left">Nombre</th>
                <th className="p-2 border text-left">Estado</th>
                <th className="p-2 border text-left">Ubicación</th>
                <th className="p-2 border text-left">Lote</th>
                <th className="p-2 border text-left">Peso (lb)</th>
                <th className="p-2 border text-left">Activa</th>
                <th className="p-2 border text-left">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {!loading && cerdas.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-600 border" colSpan={8}>
                    No hay registros con esos filtros.
                  </td>
                </tr>
              ) : null}

              {cerdas.map((c) => {
                const enEdicion = editId === c.id && edit
                const ub = firstOrNull<RelUbic>(c.granja_ubicaciones)
                const lt = firstOrNull<RelLote>(c.granja_lotes)

                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 border">
                      {enEdicion ? (
                        <input
                          className="border p-1 w-28"
                          value={edit.arete}
                          onChange={(e) => setEdit((p) => (p ? { ...p, arete: e.target.value } : p))}
                        />
                      ) : (
                        c.arete
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <input
                          className="border p-1 w-40"
                          value={edit.nombre}
                          onChange={(e) => setEdit((p) => (p ? { ...p, nombre: e.target.value } : p))}
                        />
                      ) : (
                        c.nombre
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <select
                          className="border p-1"
                          value={edit.estado}
                          onChange={(e) =>
                            setEdit((p) => (p ? { ...p, estado: e.target.value as CerdaEstado } : p))
                          }
                        >
                          {estados.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        c.estado
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <select
                          className="border p-1"
                          value={edit.ubicacion_id}
                          onChange={(e) =>
                            setEdit((p) => (p ? { ...p, ubicacion_id: e.target.value } : p))
                          }
                        >
                          <option value="">—</option>
                          {ubicaciones.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.codigo}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ub?.codigo ?? '—'
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <select
                          className="border p-1"
                          value={edit.lote_id}
                          onChange={(e) => setEdit((p) => (p ? { ...p, lote_id: e.target.value } : p))}
                        >
                          <option value="">—</option>
                          {lotes.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.codigo}
                            </option>
                          ))}
                        </select>
                      ) : (
                        lt?.codigo ?? '—'
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <input
                          type="number"
                          className="border p-1 w-24"
                          value={edit.peso_lb}
                          onChange={(e) => setEdit((p) => (p ? { ...p, peso_lb: e.target.value } : p))}
                          step="0.01"
                        />
                      ) : c.peso_lb == null ? (
                        '—'
                      ) : (
                        Number(c.peso_lb).toFixed(2).replace(/\.00$/, '')
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <input
                          type="checkbox"
                          checked={edit.activa}
                          onChange={(e) => setEdit((p) => (p ? { ...p, activa: e.target.checked } : p))}
                        />
                      ) : c.activa ? (
                        'Sí'
                      ) : (
                        'No'
                      )}
                    </td>

                    <td className="p-2 border">
                      {enEdicion ? (
                        <div className="flex gap-2">
                          <button
                            className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs disabled:opacity-60"
                            onClick={() => guardarEdicion(c.id)}
                            disabled={guardandoEditId === c.id}
                          >
                            {guardandoEditId === c.id ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button
                            className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-xs"
                            onClick={cancelarEdicion}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            className="bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-xs"
                            onClick={() => empezarEdicion(c)}
                          >
                            Editar
                          </button>

                          <button
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                            onClick={() => bajaLogica(c)}
                          >
                            Baja
                          </button>

                          <Link
                            href={`/granja/cerdas/vista?id=${c.id}`}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-xs"
                          >
                            Ficha
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="mt-3 text-xs text-gray-600">
            La “Ficha” todavía no existe: será la próxima pantalla (historial + eventos próximos).
          </div>
        </section>
      </div>
    </div>
  )
}
