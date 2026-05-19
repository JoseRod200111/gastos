'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = { id: number; codigo: string; nombre: string | null }
type Lote = { id: number; codigo: string }

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

const ESTADOS = ['VACIA', 'SERVIDA', 'PRENADA', 'LACTANDO', 'DESTETADA', 'ABORTO', 'MUERTA', 'BAJA']

export default function GranjaCerdasPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // El inventario general de granja se calcula desde `granja_movimientos`.
  // Si quieres que una acción afecte inventario, debes insertar un movimiento.
  const registrarMovimiento = useCallback(
    async (opts: {
      fecha: string
      ubicacion_id: number
      lote_id?: number | null
      tipo: string
      cantidad: number
      referencia_tabla: string
      referencia_id: number
      observaciones?: string | null
    }) => {
      const { data: u } = await supabase.auth.getUser()

      const payload = {
        fecha: opts.fecha,
        ubicacion_id: opts.ubicacion_id,
        lote_id: opts.lote_id ?? null,
        tipo: opts.tipo,
        cantidad: opts.cantidad,
        peso_total_kg: null,
        referencia_tabla: opts.referencia_tabla,
        referencia_id: opts.referencia_id,
        user_id: u?.user?.id ?? null,
        observaciones: opts.observaciones ?? null,
      }

      const r = await supabase.from('granja_movimientos').insert([payload])
      if (r.error) throw r.error
    },
    []
  )

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

  const estadosSelect = useMemo(() => {
    return (
      <select
        className="w-full border rounded px-2 py-2"
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
  }, [form.estado])

  const cargarCatalogos = useCallback(async () => {
    const uRes = await supabase.from('granja_ubicaciones').select('id,codigo,nombre').order('codigo')
    if (!uRes.error) setUbicaciones((uRes.data as Ubicacion[]) || [])

    const lRes = await supabase.from('granja_lotes').select('id,codigo').order('codigo')
    if (!lRes.error) setLotes(((lRes.data as any[]) || []).map((x) => ({ id: x.id, codigo: x.codigo })))
  }, [])

  const cargarCerdas = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      let q = supabase
        .from('granja_cerdas')
        .select('id,arete,nombre,estado,ubicacion_id,lote_id,fecha_nacimiento,peso_lb,notas,activa,created_at,updated_at')
        .order('arete', { ascending: true })

      if (filtros.estado !== 'TODAS') q = q.eq('estado', filtros.estado)
      if (filtros.ubicacion_id !== 'TODAS') q = q.eq('ubicacion_id', Number(filtros.ubicacion_id))
      if (!filtros.incluir_inactivas) q = q.eq('activa', true)

      const s = filtros.q.trim()
      if (s) q = q.or(`arete.ilike.%${s}%,nombre.ilike.%${s}%`)

      const res = await q
      if (res.error) throw res.error

      setCerdas((res.data ?? []) as Cerda[])
    } catch (e: any) {
      console.error('Error cargando cerdas', e)
      setMsg(e?.message ?? 'Error cargando cerdas.')
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

      const arete = form.arete.trim()
      const nombre = form.nombre.trim()
      if (!arete) throw new Error('Arete es requerido.')
      if (!nombre) throw new Error('Nombre es requerido.')
      if (!form.ubicacion_id) throw new Error('Ubicación es requerida.')

      const ubicacionId = Number(form.ubicacion_id)
      if (!Number.isFinite(ubicacionId)) throw new Error('Ubicación inválida.')

      const loteId = form.lote_id ? Number(form.lote_id) : null
      if (form.lote_id && !Number.isFinite(loteId as number)) throw new Error('Lote inválido.')

      const pesoLb = form.peso_lb === '' ? null : Number(String(form.peso_lb).replace(',', '.'))
      if (pesoLb != null && Number.isNaN(pesoLb)) throw new Error('Peso (lb) inválido.')

      const payload = [
        {
          arete,
          nombre,
          estado: form.estado,
          ubicacion_id: ubicacionId,
          lote_id: loteId,
          fecha_nacimiento: form.fecha_nacimiento || null,
          peso_lb: pesoLb,
          notas: form.notas.trim() || null,
          activa: form.activa,
        },
      ]

      const res = await supabase
        .from('granja_cerdas')
        .insert(payload)
        .select('id, ubicacion_id, lote_id')
        .single()

      if (res.error) throw res.error

      // Afectar inventario (+1) para que se refleje en Inventario por ubicación.
      if (res.data?.id && res.data?.ubicacion_id) {
        await registrarMovimiento({
          fecha: new Date().toISOString().slice(0, 10),
          ubicacion_id: res.data.ubicacion_id,
          lote_id: res.data.lote_id ?? null,
          tipo: 'AJUSTE',
          cantidad: 1,
          referencia_tabla: 'granja_cerdas',
          referencia_id: res.data.id,
          observaciones: `ALTA CERDA ${arete}`,
        })
      }

      setMsg('Cerda guardada.')
      resetForm()
      await cargarCerdas()
    } catch (e: any) {
      console.error('Error creando cerda', e)
      setMsg(e?.message ?? 'Error creando cerda.')
    } finally {
      setGuardando(false)
    }
  }

  const actualizarCerdaCampo = async (id: number, patch: Partial<Cerda>) => {
    try {
      const r = await supabase.from('granja_cerdas').update(patch).eq('id', id)
      if (r.error) throw r.error
      setCerdas((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    } catch (e) {
      console.error('Error actualizando cerda', e)
      setMsg('No se pudo guardar el cambio.')
    }
  }

  const ubicMap = useMemo(() => new Map(ubicaciones.map((u) => [u.id, u])), [ubicaciones])
  const loteMap = useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-sm text-gray-600">Registro maestro de cerdas por arete y estado. Peso en libras (lb).</p>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ← Menú de Granja
        </Link>
      </div>

      {msg ? (
        <div className="mb-4 p-3 rounded border bg-white text-sm">{msg}</div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Formulario */}
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
                            onChange={(e) => actualizarCerdaCampo(c.id, { estado: e.target.value })}
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
                          {l ? <div className="text-[11px] text-gray-500">{l.codigo}</div> : null}
                        </td>

                        <td className="border px-2 py-2 text-right">
                          <input
                            className="border rounded px-2 py-1 w-24 text-right"
                            value={c.peso_lb ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setCerdas((prev) =>
                                prev.map((x) =>
                                  x.id === c.id
                                    ? { ...x, peso_lb: v === '' ? null : Number(v.replace(',', '.')) }
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
                            onChange={(e) => actualizarCerdaCampo(c.id, { activa: e.target.checked })}
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
