'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

type EstadoCerda =
  | 'VACIA'
  | 'SERVIDA'
  | 'PRENADA'
  | 'LACTANDO'
  | 'DESTETADA'
  | 'ABORTO'
  | 'MUERTA'
  | 'BAJA'

type Ubicacion = { id: number; codigo: string; nombre: string | null }
type Lote = { id: number; codigo: string; activo: boolean | null }

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: EstadoCerda
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_lb: number | null
  notas: string | null
  activa: boolean
  created_at: string
  updated_at: string
  granja_ubicaciones?: { codigo: string; nombre: string | null } | null
  granja_lotes?: { codigo: string; activo: boolean | null } | null
}

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normRel<T>(v: any): T | null {
  if (!v) return null
  if (Array.isArray(v)) return (v[0] as T) ?? null
  return v as T
}

export default function GranjaCerdasPage() {
  // catálogos
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])

  // lista
  const [loading, setLoading] = useState(false)
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  // filtros
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState<string>('TODOS')
  const [fUbicacion, setFUbicacion] = useState<string>('TODAS')
  const [incluirInactivas, setIncluirInactivas] = useState(false)

  // form nueva cerda
  const [arete, setArete] = useState('')
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState<EstadoCerda>('VACIA')
  const [activa, setActiva] = useState(true)
  const [ubicacionId, setUbicacionId] = useState<string>('')
  const [loteId, setLoteId] = useState<string>('')
  const [fechaNac, setFechaNac] = useState<string>('')
  const [pesoLb, setPesoLb] = useState<string>('') // <- LB
  const [notas, setNotas] = useState<string>('')

  // IMPORTANTE: para que sí afecte inventario cuando se crea una cerda
  const [afectarInventarioAlta, setAfectarInventarioAlta] = useState(true)

  const estados: EstadoCerda[] = useMemo(
    () => ['VACIA', 'SERVIDA', 'PRENADA', 'LACTANDO', 'DESTETADA', 'ABORTO', 'MUERTA', 'BAJA'],
    []
  )

  const cargarCatalogos = useCallback(async () => {
    const uRes = await supabase
      .from('granja_ubicaciones')
      .select('id,codigo,nombre')
      .eq('activa', true)
      .order('codigo', { ascending: true })

    const lRes = await supabase
      .from('granja_lotes')
      .select('id,codigo,activo')
      .order('codigo', { ascending: true })

    if (!uRes.error) setUbicaciones((uRes.data as any[])?.map((x) => ({ ...x })) ?? [])
    if (!lRes.error) setLotes((lRes.data as any[])?.map((x) => ({ ...x })) ?? [])
  }, [])

  const cargarCerdas = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('granja_cerdas')
        .select(
          `
          id,arete,nombre,estado,ubicacion_id,lote_id,fecha_nacimiento,peso_lb,notas,activa,created_at,updated_at,
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo, activo )
        `
        )
        .order('id', { ascending: false })

      if (!incluirInactivas) query = query.eq('activa', true)
      if (fEstado !== 'TODOS') query = query.eq('estado', fEstado)
      if (fUbicacion !== 'TODAS') query = query.eq('ubicacion_id', Number(fUbicacion))
      if (q.trim()) {
        const qq = q.trim()
        // busca por arete o nombre
        query = query.or(`arete.ilike.%${qq}%,nombre.ilike.%${qq}%`)
      }

      const res = await query
      if (res.error) {
        console.error('Error cargando cerdas', res.error)
        alert('Error cargando cerdas.')
        return
      }

      const mapped: Cerda[] =
        (res.data as any[])?.map((row) => ({
          id: row.id,
          arete: row.arete,
          nombre: row.nombre,
          estado: row.estado,
          ubicacion_id: row.ubicacion_id ?? null,
          lote_id: row.lote_id ?? null,
          fecha_nacimiento: row.fecha_nacimiento ?? null,
          peso_lb: row.peso_lb ?? null,
          notas: row.notas ?? null,
          activa: !!row.activa,
          created_at: row.created_at,
          updated_at: row.updated_at,
          granja_ubicaciones: normRel(row.granja_ubicaciones),
          granja_lotes: normRel(row.granja_lotes),
        })) ?? []

      setCerdas(mapped)
    } finally {
      setLoading(false)
    }
  }, [fEstado, fUbicacion, incluirInactivas, q])

  useEffect(() => {
    cargarCatalogos()
    cargarCerdas()
  }, [cargarCatalogos, cargarCerdas])

  const limpiarForm = () => {
    setArete('')
    setNombre('')
    setEstado('VACIA')
    setActiva(true)
    setUbicacionId('')
    setLoteId('')
    setFechaNac('')
    setPesoLb('')
    setNotas('')
    setAfectarInventarioAlta(true)
  }

  const guardarCerda = async () => {
    if (!arete.trim() || !nombre.trim()) {
      alert('Arete y nombre son obligatorios.')
      return
    }

    const payload: any = {
      arete: arete.trim(),
      nombre: nombre.trim(),
      estado,
      ubicacion_id: ubicacionId ? Number(ubicacionId) : null,
      lote_id: loteId ? Number(loteId) : null,
      fecha_nacimiento: fechaNac ? fechaNac : null,
      peso_lb: pesoLb.trim() ? Number(pesoLb) : null, // <- LB
      notas: notas.trim() ? notas.trim() : null,
      activa,
      updated_at: new Date().toISOString(),
    }

    const ins = await supabase.from('granja_cerdas').insert(payload).select('id').single()
    if (ins.error) {
      console.error('Error creando cerda', ins.error)
      alert('No se pudo crear la cerda (revisa si el arete ya existe).')
      return
    }

    // +1 inventario si el usuario lo quiere y hay ubicación
    if (afectarInventarioAlta && ubicacionId) {
      const { data: u } = await supabase.auth.getUser()
      const userId = u?.user?.id ?? null

      const mov = await supabase.from('granja_movimientos').insert({
        fecha: todayISO(),
        tipo: 'AJUSTE',
        ubicacion_id: Number(ubicacionId),
        lote_id: loteId ? Number(loteId) : null,
        cantidad: 1,
        motivo: `ALTA_CERDA arete=${arete.trim()}`,
        observaciones: `Alta de cerda (cerdas) +1`,
        referencia_tabla: 'granja_cerdas',
        referencia_id: ins.data.id,
        user_id: userId,
      })

      if (mov.error) {
        console.warn('Cerda creada, pero no se pudo registrar movimiento de inventario:', mov.error)
        alert('Cerda creada, pero NO se pudo afectar inventario (revisa RLS/policies de granja_movimientos).')
      }
    }

    alert('Cerda guardada.')
    limpiarForm()
    cargarCerdas()
  }

  const actualizarCerda = async (id: number, patch: Partial<Cerda>) => {
    const upd = await supabase
      .from('granja_cerdas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (upd.error) {
      console.error('Error actualizando cerda', upd.error)
      alert('No se pudo actualizar.')
      return
    }
    cargarCerdas()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Logo */}
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-14" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold">Granja — Hembras (Cerdas)</h1>
          <p className="text-sm text-gray-600">Registro maestro de cerdas por arete y estado. Peso en libras (lb).</p>
        </div>

        <Link href="/granja" className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white">
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Nueva cerda */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Nueva cerda</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Arete (único)</label>
              <input
                className="w-full border rounded px-2 py-2"
                value={arete}
                onChange={(e) => setArete(e.target.value)}
                placeholder="Ej: AR1077"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Nombre</label>
              <input
                className="w-full border rounded px-2 py-2"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Hembra 1077"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Estado</label>
              <select className="w-full border rounded px-2 py-2" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCerda)}>
                {estados.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
              <span className="text-sm">Activa</span>
            </div>

            <div>
              <label className="text-xs text-gray-600">Ubicación actual</label>
              <select className="w-full border rounded px-2 py-2" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
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
              <select className="w-full border rounded px-2 py-2" value={loteId} onChange={(e) => setLoteId(e.target.value)}>
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
              <input className="w-full border rounded px-2 py-2" type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
              <input
                className="w-full border rounded px-2 py-2"
                value={pesoLb}
                onChange={(e) => setPesoLb(e.target.value)}
                placeholder="Ej: 420"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs text-gray-600">Notas (opcional)</label>
            <textarea className="w-full border rounded px-2 py-2 h-24" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones generales de la cerda" />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={afectarInventarioAlta}
              onChange={(e) => setAfectarInventarioAlta(e.target.checked)}
            />
            <span className="text-sm">Afectar inventario al crear (+1 en ubicación)</span>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white" onClick={guardarCerda}>
              Guardar cerda
            </button>
            <button className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300" onClick={limpiarForm}>
              Limpiar
            </button>
          </div>
        </section>

        {/* Listado */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Cerdas registradas</h2>
            <button className="text-sm px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white" onClick={cargarCerdas} disabled={loading}>
              🔄 Recargar
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <input className="border rounded px-2 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por arete o nombre..." />
            <select className="border rounded px-2 py-2" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="TODOS">Todos estados</option>
              {estados.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="border rounded px-2 py-2" value={fUbicacion} onChange={(e) => setFUbicacion(e.target.value)}>
              <option value="TODAS">Todas ubicaciones</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
            <span className="text-sm">Incluir inactivas</span>

            <button className="ml-auto text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" onClick={cargarCerdas}>
              Aplicar filtros
            </button>
          </div>

          <div className="text-xs text-gray-600 mt-2">Mostrando: {cerdas.length}</div>

          <div className="mt-2 overflow-x-auto border rounded">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border px-2 py-2">Arete</th>
                  <th className="border px-2 py-2">Nombre</th>
                  <th className="border px-2 py-2">Estado</th>
                  <th className="border px-2 py-2">Ubicación</th>
                  <th className="border px-2 py-2">Lote</th>
                  <th className="border px-2 py-2">Peso (lb)</th>
                  <th className="border px-2 py-2">Activa</th>
                  <th className="border px-2 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cerdas.length === 0 ? (
                  <tr>
                    <td className="border px-2 py-3 text-center text-gray-600" colSpan={8}>
                      {loading ? 'Cargando...' : 'No hay registros con esos filtros.'}
                    </td>
                  </tr>
                ) : (
                  cerdas.map((c) => (
                    <tr key={c.id}>
                      <td className="border px-2 py-2">{c.arete}</td>
                      <td className="border px-2 py-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          defaultValue={c.nombre}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v && v !== c.nombre) actualizarCerda(c.id, { nombre: v })
                          }}
                        />
                      </td>
                      <td className="border px-2 py-2">
                        <select
                          className="border rounded px-2 py-1"
                          value={c.estado}
                          onChange={(e) => actualizarCerda(c.id, { estado: e.target.value as EstadoCerda })}
                        >
                          {estados.map((s) => (
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
                          onChange={(e) => actualizarCerda(c.id, { ubicacion_id: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">—</option>
                          {ubicaciones.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.codigo}
                            </option>
                          ))}
                        </select>
                        <div className="text-[11px] text-gray-600">
                          {c.granja_ubicaciones?.codigo ? `${c.granja_ubicaciones.codigo} — ${c.granja_ubicaciones.nombre ?? ''}` : ''}
                        </div>
                      </td>
                      <td className="border px-2 py-2">
                        <select
                          className="border rounded px-2 py-1"
                          value={c.lote_id ?? ''}
                          onChange={(e) => actualizarCerda(c.id, { lote_id: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">—</option>
                          {lotes.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.codigo}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-2 py-2">
                        <input
                          className="border rounded px-2 py-1 w-24"
                          defaultValue={c.peso_lb ?? ''}
                          inputMode="decimal"
                          onBlur={(e) => {
                            const raw = e.target.value.trim()
                            const n = raw ? Number(raw) : null
                            if ((n ?? null) !== (c.peso_lb ?? null)) actualizarCerda(c.id, { peso_lb: n })
                          }}
                        />
                      </td>
                      <td className="border px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={c.activa}
                          onChange={(e) => actualizarCerda(c.id, { activa: e.target.checked })}
                        />
                      </td>
                      <td className="border px-2 py-2">
                        <Link
                          className="text-xs px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white inline-block"
                          href={`/granja/cerdas/evento?cerda_id=${c.id}`}
                        >
                          Eventos
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            La “Ficha” será la próxima pantalla (historial + eventos próximos).
          </div>
        </section>
      </div>
    </div>
  )
}
