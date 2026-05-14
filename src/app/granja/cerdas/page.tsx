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
  fecha: string | null
  tipo_origen: string | null
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

export default function GranjaCerdasPage() {
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

  const cargarCatalogos = useCallback(async () => {
    // IMPORTANTE: NO filtrar por "activo" porque esa columna NO existe en tu BD (ya te dio error antes).
    const [uRes, lRes] = await Promise.all([
      supabase
        .from('granja_ubicaciones')
        .select('id,codigo,nombre')
        .order('codigo', { ascending: true }),
      supabase
        .from('granja_lotes')
        .select('id,codigo,fecha,tipo_origen')
        .order('id', { ascending: false }),
    ])

    if (uRes.error) console.error('Error cargando ubicaciones:', uRes.error)
    if (lRes.error) console.error('Error cargando lotes:', lRes.error)

    setUbicaciones((uRes.data ?? []) as Ubicacion[])
    setLotes((lRes.data ?? []) as Lote[])
  }, [])

  const cargarCerdas = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('granja_cerdas')
        .select(
          'id,arete,nombre,estado,ubicacion_id,lote_id,fecha_nacimiento,peso_lb,notas,activa,created_at,updated_at'
        )
        .order('id', { ascending: false })

      // filtros
      const txt = filtros.q.trim()
      if (txt) {
        // OR ilike arete o nombre
        const safe = txt.replace(/,/g, ' ')
        q = q.or(`arete.ilike.%${safe}%,nombre.ilike.%${safe}%`)
      }

      if (filtros.estado !== 'TODAS') {
        q = q.eq('estado', filtros.estado)
      }

      if (filtros.ubicacion_id !== 'TODAS') {
        q = q.eq('ubicacion_id', Number(filtros.ubicacion_id))
      }

      if (!filtros.incluir_inactivas) {
        q = q.eq('activa', true)
      }

      const res = await q
      if (res.error) throw res.error

      setCerdas((res.data ?? []) as Cerda[])
    } catch (e) {
      console.error('Error cargando cerdas:', e)
      alert('Error cargando cerdas (revisa consola).')
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    ;(async () => {
      await cargarCatalogos()
      await cargarCerdas()
    })()
  }, [cargarCatalogos, cargarCerdas])

  const crearCerda = async () => {
    const arete = form.arete.trim()
    const nombre = form.nombre.trim()

    if (!arete || !nombre) {
      alert('Arete y nombre son obligatorios.')
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
        peso_lb:
          form.peso_lb.trim() === '' ? null : Number(form.peso_lb.replace(',', '.')),
        notas: form.notas.trim() ? form.notas.trim() : null,
        activa: !!form.activa,
      }

      const res = await supabase.from('granja_cerdas').insert(payload).select('id').single()
      if (res.error) throw res.error

      resetForm()
      await cargarCerdas()
      alert('Cerda registrada.')
    } catch (e: any) {
      console.error('Error creando cerda:', e)
      // si choca UNIQUE de arete
      if (String(e?.message || '').toLowerCase().includes('duplicate')) {
        alert('Ese arete ya existe.')
      } else {
        alert('No se pudo crear la cerda (revisa consola).')
      }
    } finally {
      setGuardando(false)
    }
  }

  const actualizarCerdaCampo = async (id: number, patch: Partial<Cerda>) => {
    try {
      const res = await supabase.from('granja_cerdas').update(patch).eq('id', id)
      if (res.error) throw res.error
      await cargarCerdas()
    } catch (e) {
      console.error('Error actualizando cerda:', e)
      alert('No se pudo actualizar (revisa consola).')
    }
  }

  const estadosSelect = (
    <select
      className="border rounded px-2 py-2"
      value={form.estado}
      onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
    >
      {ESTADOS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Logo */}
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-14" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-sm text-gray-600">
            Registro maestro de cerdas por arete y estado. Peso en libras (lb).
          </p>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mt-4">
        {/* Form */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Nueva cerda</h2>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Arete (único)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: AR1077"
                  value={form.arete}
                  onChange={(e) => setForm((f) => ({ ...f, arete: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Nombre</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: Hembra 1077"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs text-gray-600">Estado</label>
                {estadosSelect}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))}
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
                  onChange={(e) => setForm((f) => ({ ...f, ubicacion_id: e.target.value }))}
                >
                  <option value="">— Selecciona —</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.codigo} — {u.nombre ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600">Lote (opcional)</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={form.lote_id}
                  onChange={(e) => setForm((f) => ({ ...f, lote_id: e.target.value }))}
                >
                  <option value="">— Sin lote —</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Fecha nacimiento (opcional)</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-2"
                  value={form.fecha_nacimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: 420"
                  value={form.peso_lb}
                  onChange={(e) => setForm((f) => ({ ...f, peso_lb: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600">Notas (opcional)</label>
              <textarea
                className="w-full border rounded px-2 py-2"
                placeholder="Observaciones generales de la cerda"
                rows={4}
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={crearCerda}
                disabled={guardando}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              >
                Guardar cerda
              </button>

              <button
                onClick={resetForm}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        {/* Lista */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Cerdas registradas</h2>
            <button
              onClick={cargarCerdas}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              🔎 Recargar
            </button>
          </div>

          <div className="grid gap-2 mb-3">
            <div className="grid grid-cols-3 gap-2">
              <input
                className="border rounded px-2 py-2 col-span-1"
                placeholder="Buscar arete o nombre..."
                value={filtros.q}
                onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
              />

              <select
                className="border rounded px-2 py-2"
                value={filtros.estado}
                onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
              >
                <option value="TODAS">Todos estados</option>
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                className="border rounded px-2 py-2"
                value={filtros.ubicacion_id}
                onChange={(e) => setFiltros((f) => ({ ...f, ubicacion_id: e.target.value }))}
              >
                <option value="TODAS">Todas ubicaciones</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.codigo}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filtros.incluir_inactivas}
                onChange={(e) =>
                  setFiltros((f) => ({ ...f, incluir_inactivas: e.target.checked }))
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
                  <th className="border px-2 py-2 text-right">Peso (lb)</th>
                  <th className="border px-2 py-2 text-center">Activa</th>
                </tr>
              </thead>
              <tbody>
                {cerdas.length === 0 ? (
                  <tr>
                    <td className="border px-2 py-4 text-center text-gray-600" colSpan={7}>
                      No hay registros con esos filtros.
                    </td>
                  </tr>
                ) : (
                  cerdas.map((c) => {
                    const u = c.ubicacion_id ? ubicMap.get(c.ubicacion_id) : null
                    const l = c.lote_id ? loteMap.get(c.lote_id) : null

                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="border px-2 py-2">{c.arete}</td>
                        <td className="border px-2 py-2">{c.nombre}</td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={c.estado}
                            onChange={(e) =>
                              actualizarCerdaCampo(c.id, { estado: e.target.value })
                            }
                          >
                            {ESTADOS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={c.ubicacion_id ?? ''}
                            onChange={(e) =>
                              actualizarCerdaCampo(c.id, {
                                ubicacion_id: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {ubicaciones.map((uu) => (
                              <option key={uu.id} value={String(uu.id)}>
                                {uu.codigo}
                              </option>
                            ))}
                          </select>
                          {u ? (
                            <div className="text-[11px] text-gray-500">
                              {u.codigo} — {u.nombre ?? ''}
                            </div>
                          ) : null}
                        </td>

                        <td className="border px-2 py-2">
                          <select
                            className="border rounded px-2 py-1"
                            value={c.lote_id ?? ''}
                            onChange={(e) =>
                              actualizarCerdaCampo(c.id, {
                                lote_id: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {lotes.map((ll) => (
                              <option key={ll.id} value={String(ll.id)}>
                                {ll.codigo}
                              </option>
                            ))}
                          </select>
                          {l ? (
                            <div className="text-[11px] text-gray-500">{l.codigo}</div>
                          ) : null}
                        </td>

                        <td className="border px-2 py-2 text-right">
                          <input
                            className="border rounded px-2 py-1 w-24 text-right"
                            value={c.peso_lb ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              // edición local: solo UI (no guardar aquí)
                              setCerdas((prev) =>
                                prev.map((x) =>
                                  x.id === c.id
                                    ? {
                                        ...x,
                                        peso_lb: v === '' ? null : Number(v.replace(',', '.')),
                                      }
                                    : x
                                )
                              )
                            }}
                            onBlur={(e) => {
                              const v = e.target.value
                              actualizarCerdaCampo(c.id, {
                                peso_lb: v === '' ? null : Number(v.replace(',', '.')),
                              })
                            }}
                          />
                        </td>

                        <td className="border px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!c.activa}
                            onChange={(e) =>
                              actualizarCerdaCampo(c.id, { activa: e.target.checked })
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
            La “Ficha” todavía no existe: será la próxima pantalla (historial + eventos próximos).
          </p>
        </section>
      </div>
    </div>
  )
}
