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

type CerdaRow = {
  id: number
  arete: string
  nombre: string
  estado: CerdaEstado
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_kg: number | null // en BD; en UI lo tratamos como lb (solo etiqueta/uso)
  notas: string | null
  activa: boolean
  created_at: string | null
  updated_at: string | null
  granja_ubicaciones?: { codigo: string; nombre: string | null } | null
  granja_lotes?: { codigo: string } | null
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

export default function GranjaCerdasPage() {
  const [loading, setLoading] = useState(false)
  const [savingNew, setSavingNew] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<CerdaRow[]>([])

  const [qText, setQText] = useState('')
  const [qEstado, setQEstado] = useState<string>('')
  const [qUbicacion, setQUbicacion] = useState<string>('')
  const [incluirInactivas, setIncluirInactivas] = useState(false)

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

  const [editId, setEditId] = useState<number | null>(null)
  const [edit, setEdit] = useState<Partial<FormCerda> & { estado?: CerdaEstado } | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

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
          `
          id, arete, nombre, estado, ubicacion_id, lote_id,
          fecha_nacimiento, peso_kg, notas, activa, created_at, updated_at,
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `
        )
        .order('activa', { ascending: false })
        .order('arete', { ascending: true })

      if (!incluirInactivas) q = q.eq('activa', true)

      const t = qText.trim()
      if (t) {
        q = q.or(`arete.ilike.%${t}%,nombre.ilike.%${t}%`)
      }

      if (qEstado) q = q.eq('estado', qEstado)
      if (qUbicacion) q = q.eq('ubicacion_id', Number(qUbicacion))

      const { data, error } = await q
      if (error) {
        console.error('Error cargando cerdas', error)
        alert('No se pudieron cargar las cerdas.')
        setCerdas([])
        return
      }
      setCerdas((data ?? []) as any)
    } finally {
      setLoading(false)
    }
  }, [qText, qEstado, qUbicacion, incluirInactivas])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    cargarCerdas()
  }, [cargarCerdas])

  const limpiarForm = () => {
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

    const pesoLb = toNumOrNull(form.peso_lb)
    if (Number.isNaN(pesoLb)) return alert('Peso (lb) inválido.')

    setSavingNew(true)
    try {
      const payload: any = {
        arete,
        nombre,
        estado: form.estado,
        ubicacion_id: form.ubicacion_id ? Number(form.ubicacion_id) : null,
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        fecha_nacimiento: form.fecha_nacimiento ? form.fecha_nacimiento : null,
        peso_kg: pesoLb, // en BD; lo usamos como lb por ahora (solo para mostrar/registrar en lb)
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

      limpiarForm()
      await cargarCerdas()
      alert('Cerda registrada.')
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (c: CerdaRow) => {
    setEditId(c.id)
    setEdit({
      arete: c.arete ?? '',
      nombre: c.nombre ?? '',
      estado: c.estado ?? 'VACIA',
      ubicacion_id: c.ubicacion_id ? String(c.ubicacion_id) : '',
      lote_id: c.lote_id ? String(c.lote_id) : '',
      fecha_nacimiento: c.fecha_nacimiento ?? '',
      peso_lb: c.peso_kg == null ? '' : String(c.peso_kg),
      notas: c.notas ?? '',
      activa: Boolean(c.activa),
    })
  }

  const cancelEdit = () => {
    setEditId(null)
    setEdit(null)
  }

  const saveEdit = async (id: number) => {
    if (!edit) return
    const arete = (edit.arete ?? '').trim()
    const nombre = (edit.nombre ?? '').trim()

    if (!arete) return alert('El arete es obligatorio.')
    if (!nombre) return alert('El nombre es obligatorio.')

    const pesoLb = toNumOrNull(edit.peso_lb ?? '')
    if (Number.isNaN(pesoLb)) return alert('Peso (lb) inválido.')

    setSavingId(id)
    try {
      const payload: any = {
        arete,
        nombre,
        estado: (edit.estado ?? 'VACIA') as CerdaEstado,
        ubicacion_id: edit.ubicacion_id ? Number(edit.ubicacion_id) : null,
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        fecha_nacimiento: edit.fecha_nacimiento ? edit.fecha_nacimiento : null,
        peso_kg: pesoLb,
        notas: (edit.notas ?? '').trim() ? (edit.notas ?? '').trim() : null,
        activa: Boolean(edit.activa),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('granja_cerdas').update(payload).eq('id', id)
      if (error) {
        console.error('Error actualizando cerda', error)
        alert(`No se pudo actualizar. ${error.message}`)
        return
      }

      cancelEdit()
      await cargarCerdas()
      alert('Cerda actualizada.')
    } finally {
      setSavingId(null)
    }
  }

  const darDeBaja = async (c: CerdaRow) => {
    if (!confirm(`¿Dar de baja a la cerda ${c.arete}? (no se elimina, se marca como BAJA e inactiva)`))
      return

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

      <div className="flex items-center justify-between mb-2">
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

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        {/* NUEVA CERDA */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-4">Nueva cerda</h2>

          <div className="grid gap-3 grid-cols-2">
            <div className="col-span-1">
              <label className="text-xs text-gray-600">Arete (único)</label>
              <input
                className="border p-2 w-full rounded"
                value={form.arete}
                onChange={(e) => setForm((p) => ({ ...p, arete: e.target.value }))}
                placeholder="Ej: AR1077"
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Nombre</label>
              <input
                className="border p-2 w-full rounded"
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej: Hembra 1077"
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Estado</label>
              <select
                className="border p-2 w-full rounded"
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

            <div className="col-span-1 flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) => setForm((p) => ({ ...p, activa: e.target.checked }))}
                />
                Activa
              </label>
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Ubicación actual</label>
              <select
                className="border p-2 w-full rounded"
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

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Lote (opcional)</label>
              <select
                className="border p-2 w-full rounded"
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

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Fecha nacimiento (opcional)</label>
              <input
                type="date"
                className="border p-2 w-full rounded"
                value={form.fecha_nacimiento}
                onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
                max={hoyISO()}
              />
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
              <input
                type="number"
                className="border p-2 w-full rounded"
                value={form.peso_lb}
                onChange={(e) => setForm((p) => ({ ...p, peso_lb: e.target.value }))}
                placeholder="Ej: 420"
                step="0.01"
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-600">Notas (opcional)</label>
              <textarea
                className="border p-2 w-full rounded min-h-[90px]"
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones generales de la cerda"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={crearCerda}
              disabled={savingNew}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {savingNew ? 'Guardando…' : 'Guardar cerda'}
            </button>
            <button
              onClick={limpiarForm}
              className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
            >
              Limpiar
            </button>
          </div>
        </section>

        {/* LISTA */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Cerdas registradas</h2>

          <div className="grid gap-2 md:grid-cols-3 items-center">
            <input
              className="border p-2 rounded md:col-span-1"
              placeholder="Buscar por arete o nombre…"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
            />

            <select
              className="border p-2 rounded md:col-span-1"
              value={qEstado}
              onChange={(e) => setQEstado(e.target.value)}
            >
              <option value="">Todos estados</option>
              {estados.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className="border p-2 rounded md:col-span-1"
              value={qUbicacion}
              onChange={(e) => setQUbicacion(e.target.value)}
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
                checked={incluirInactivas}
                onChange={(e) => setIncluirInactivas(e.target.checked)}
              />
              Incluir inactivas
            </label>

            <button
              onClick={cargarCerdas}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded md:col-span-1"
            >
              Recargar
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Mostrando: {loading ? '…' : cerdas.length}
          </div>

          <div className="mt-3 border rounded overflow-x-auto">
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
                    <td className="p-3 text-gray-600" colSpan={8}>
                      No hay registros con esos filtros.
                    </td>
                  </tr>
                ) : null}

                {cerdas.map((c) => {
                  const isEdit = editId === c.id && edit

                  return (
                    <tr key={c.id}>
                      <td className="p-2 border">
                        {isEdit ? (
                          <input
                            className="border p-1 rounded w-28"
                            value={edit.arete ?? ''}
                            onChange={(e) => setEdit((p) => ({ ...(p ?? {}), arete: e.target.value }))}
                          />
                        ) : (
                          c.arete
                        )}
                      </td>

                      <td className="p-2 border">
                        {isEdit ? (
                          <input
                            className="border p-1 rounded w-40"
                            value={edit.nombre ?? ''}
                            onChange={(e) => setEdit((p) => ({ ...(p ?? {}), nombre: e.target.value }))}
                          />
                        ) : (
                          c.nombre
                        )}
                      </td>

                      <td className="p-2 border">
                        {isEdit ? (
                          <select
                            className="border p-1 rounded"
                            value={(edit.estado ?? 'VACIA') as any}
                            onChange={(e) =>
                              setEdit((p) => ({ ...(p ?? {}), estado: e.target.value as CerdaEstado }))
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
                        {isEdit ? (
                          <select
                            className="border p-1 rounded"
                            value={edit.ubicacion_id ?? ''}
                            onChange={(e) =>
                              setEdit((p) => ({ ...(p ?? {}), ubicacion_id: e.target.value }))
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
                          c.granja_ubicaciones?.codigo ?? '—'
                        )}
                      </td>

                      <td className="p-2 border">
                        {isEdit ? (
                          <select
                            className="border p-1 rounded"
                            value={edit.lote_id ?? ''}
                            onChange={(e) => setEdit((p) => ({ ...(p ?? {}), lote_id: e.target.value }))}
                          >
                            <option value="">—</option>
                            {lotes.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.codigo}
                              </option>
                            ))}
                          </select>
                        ) : (
                          c.granja_lotes?.codigo ?? '—'
                        )}
                      </td>

                      <td className="p-2 border">
                        {isEdit ? (
                          <input
                            type="number"
                            className="border p-1 rounded w-24"
                            value={edit.peso_lb ?? ''}
                            onChange={(e) =>
                              setEdit((p) => ({ ...(p ?? {}), peso_lb: e.target.value }))
                            }
                            step="0.01"
                          />
                        ) : c.peso_kg == null ? (
                          '—'
                        ) : (
                          String(c.peso_kg)
                        )}
                      </td>

                      <td className="p-2 border">{c.activa ? 'Sí' : 'No'}</td>

                      <td className="p-2 border">
                        {isEdit ? (
                          <div className="flex gap-2">
                            <button
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs disabled:opacity-60"
                              disabled={savingId === c.id}
                              onClick={() => saveEdit(c.id)}
                            >
                              {savingId === c.id ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button
                              className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-xs"
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              className="bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-xs"
                              onClick={() => startEdit(c)}
                            >
                              Editar
                            </button>
                            <button
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                              onClick={() => darDeBaja(c)}
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
          </div>

          <div className="mt-3 text-xs text-gray-600">
            La ficha todavía no existe; será la próxima pantalla (historial + eventos próximos).
          </div>
        </section>
      </div>
    </div>
  )
}
