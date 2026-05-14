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

type WeightField = 'peso_lb' | 'peso_kg'

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: CerdaEstado
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  notas: string | null
  activa: boolean
  created_at: string | null
  updated_at: string | null

  // peso (puede venir en uno u otro)
  peso_lb?: number | null
  peso_kg?: number | null

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
  peso: string // en pantalla SIEMPRE libras
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
  const [guardando, setGuardando] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  // Detecta si en BD el campo es peso_lb o peso_kg
  const [weightField, setWeightField] = useState<WeightField>('peso_lb')

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
    peso: '',
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

  // 1) Detectar columna de peso real en BD (peso_lb o peso_kg)
  const detectarCampoPeso = useCallback(async () => {
    // probamos peso_lb primero
    const t1 = await supabase.from('granja_cerdas').select('id, peso_lb').limit(1)
    if (!t1.error) {
      setWeightField('peso_lb')
      return
    }

    // si falló, probamos peso_kg
    const t2 = await supabase.from('granja_cerdas').select('id, peso_kg').limit(1)
    if (!t2.error) {
      setWeightField('peso_kg')
      return
    }

    // Si ambos fallan, dejamos peso_lb pero avisamos (para que mires el error real)
    console.error('No se pudo detectar campo de peso (peso_lb/peso_kg).', t1.error, t2.error)
  }, [])

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
      const wf = weightField // peso_lb o peso_kg

      let q = supabase
        .from('granja_cerdas')
        .select(
          `
          id, arete, nombre, estado, ubicacion_id, lote_id,
          fecha_nacimiento, ${wf}, notas, activa, created_at, updated_at,
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `
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

      setCerdas((data ?? []) as Cerda[])
    } finally {
      setLoading(false)
    }
  }, [fActivas, fArete, fNombre, fEstado, fUbicacion, weightField])

  useEffect(() => {
    ;(async () => {
      await detectarCampoPeso()
      await cargarCatalogos()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      peso: '',
      notas: '',
      activa: true,
    })
  }

  const crearCerda = async () => {
    const arete = form.arete.trim()
    const nombre = form.nombre.trim()

    if (!arete) return alert('El arete es obligatorio.')
    if (!nombre) return alert('El nombre es obligatorio.')

    const peso = toNumOrNull(form.peso)
    if (Number.isNaN(peso)) return alert('Peso inválido.')

    setGuardando(true)
    try {
      const wf = weightField
      const payload: any = {
        arete,
        nombre,
        estado: form.estado,
        ubicacion_id: form.ubicacion_id ? Number(form.ubicacion_id) : null,
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        fecha_nacimiento: form.fecha_nacimiento ? form.fecha_nacimiento : null,
        notas: form.notas?.trim() ? form.notas.trim() : null,
        activa: form.activa,
        updated_at: new Date().toISOString(),
      }
      payload[wf] = peso

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
    const peso =
      weightField === 'peso_lb'
        ? c.peso_lb
        : c.peso_kg

    setEditId(c.id)
    setEdit({
      arete: c.arete ?? '',
      nombre: c.nombre ?? '',
      estado: (c.estado as CerdaEstado) ?? 'VACIA',
      ubicacion_id: c.ubicacion_id ? String(c.ubicacion_id) : '',
      lote_id: c.lote_id ? String(c.lote_id) : '',
      fecha_nacimiento: c.fecha_nacimiento ?? '',
      peso: peso == null ? '' : String(peso),
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

    const peso = toNumOrNull(edit.peso)
    if (Number.isNaN(peso)) return alert('Peso inválido.')

    setGuardandoEditId(id)
    try {
      const wf = weightField
      const payload: any = {
        arete,
        nombre,
        estado: edit.estado,
        ubicacion_id: edit.ubicacion_id ? Number(edit.ubicacion_id) : null,
        lote_id: edit.lote_id ? Number(edit.lote_id) : null,
        fecha_nacimiento: edit.fecha_nacimiento ? edit.fecha_nacimiento : null,
        notas: edit.notas?.trim() ? edit.notas.trim() : null,
        activa: edit.activa,
        updated_at: new Date().toISOString(),
      }
      payload[wf] = peso

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
      alert(`No se pudo dar de baja. ${error.message}`)
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
        <h1 className="text-2xl font-bold">Granja — Cerdas</h1>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        Registro maestro de cerdas por arete y estado. Peso en libras (lb).
      </p>

      {/* Alta */}
      <div className="border rounded-lg p-4 bg-white shadow-sm mb-6">
        <h2 className="font-semibold mb-3">Nueva cerda</h2>

        <div className="grid gap-3 md:grid-cols-3">
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
              placeholder="Ej: Cerda 12"
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

          <div>
            <label className="text-xs text-gray-600">Ubicación actual</label>
            <select
              className="border p-2 w-full"
              value={form.ubicacion_id}
              onChange={(e) => setForm((p) => ({ ...p, ubicacion_id: e.target.value }))}
            >
              <option value="">— Sin ubicación —</option>
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
              value={form.peso}
              onChange={(e) => setForm((p) => ({ ...p, peso: e.target.value }))}
              placeholder="Ej: 420"
              step="0.01"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Notas (opcional)</label>
            <input
              className="border p-2 w-full"
              value={form.notas}
              onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
              placeholder="Observaciones generales…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input
              type="checkbox"
              checked={form.activa}
              onChange={(e) => setForm((p) => ({ ...p, activa: e.target.checked }))}
            />
            Activa
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={crearCerda}
            disabled={guardando}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {guardando ? 'Guardando…' : 'Guardar cerda'}
          </button>
          <button
            onClick={resetForm}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="border rounded-lg p-4 bg-white shadow-sm mb-4">
        <h2 className="font-semibold mb-3">Cerdas registradas</h2>

        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="border p-2"
            placeholder="Buscar por arete…"
            value={fArete}
            onChange={(e) => setFArete(e.target.value)}
          />
          <input
            className="border p-2"
            placeholder="Buscar por nombre…"
            value={fNombre}
            onChange={(e) => setFNombre(e.target.value)}
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
                {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fActivas} onChange={(e) => setFActivas(e.target.checked)} />
            Incluir inactivas
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={cargarCerdas}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Recargar
          </button>
          <button onClick={limpiarFiltros} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded">
            Limpiar filtros
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Campo de peso detectado en BD: <b>{weightField}</b> (mostrando siempre en lb).
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded-lg bg-white shadow-sm overflow-x-auto">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold">Listado</div>
          <div className="text-sm text-gray-600">
            {loading ? 'Cargando…' : `${cerdas.length} registro(s)`}
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Arete</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Ubicación</th>
              <th className="p-2 text-left">Lote</th>
              <th className="p-2 text-left">Peso (lb)</th>
              <th className="p-2 text-left">Activa</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cerdas.map((c) => {
              const enEdicion = editId === c.id && edit
              const peso =
                weightField === 'peso_lb'
                  ? c.peso_lb
                  : c.peso_kg

              return (
                <tr key={c.id} className="border-t">
                  <td className="p-2">
                    {enEdicion ? (
                      <input
                        className="border p-1 w-32"
                        value={edit.arete}
                        onChange={(e) => setEdit((p) => (p ? { ...p, arete: e.target.value } : p))}
                      />
                    ) : (
                      c.arete
                    )}
                  </td>

                  <td className="p-2">
                    {enEdicion ? (
                      <input
                        className="border p-1 w-48"
                        value={edit.nombre}
                        onChange={(e) => setEdit((p) => (p ? { ...p, nombre: e.target.value } : p))}
                      />
                    ) : (
                      c.nombre
                    )}
                  </td>

                  <td className="p-2">
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

                  <td className="p-2">
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
                            {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      c.granja_ubicaciones?.codigo ?? '—'
                    )}
                  </td>

                  <td className="p-2">
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
                      c.granja_lotes?.codigo ?? '—'
                    )}
                  </td>

                  <td className="p-2">
                    {enEdicion ? (
                      <input
                        type="number"
                        className="border p-1 w-28"
                        value={edit.peso}
                        onChange={(e) => setEdit((p) => (p ? { ...p, peso: e.target.value } : p))}
                        step="0.01"
                        placeholder="lb"
                      />
                    ) : (
                      peso == null ? '—' : String(peso)
                    )}
                  </td>

                  <td className="p-2">
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

                  <td className="p-2">
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

            {!loading && cerdas.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-600" colSpan={8}>
                  No hay registros con esos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-600">
        Nota: la ficha <code>/granja/cerdas/vista</code> la hacemos en el siguiente paso (historial + eventos próximos).
      </div>
    </div>
  )
}
