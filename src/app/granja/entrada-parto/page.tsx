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

type Parto = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cerda_id: string
  nacidos_vivos: number
  nacidos_muertos: number
  momias: number
  peso_camda_kg: number | null
  hembras: number | null
  machos: number | null
  observaciones: string | null
  created_at?: string | null
}

type PartoEditable = Parto & { _edit?: boolean }

export default function GranjaEntradaPartoPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [partosRecientes, setPartosRecientes] = useState<PartoEditable[]>([])
  const [cerdasRegistradas, setCerdasRegistradas] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardandoEdicionId, setGuardandoEdicionId] = useState<number | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  const [form, setForm] = useState({
    fecha: '',
    ubicacion_id: '',
    lote_id: '',
    nuevo_lote_codigo: '',
    cerda_id: '',
    nacidos_vivos: '',
    nacidos_muertos: '',
    momias: '',
    peso_camda_kg: '',
    hembras: '',
    machos: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: '',
      ubicacion_id: '',
      lote_id: '',
      nuevo_lote_codigo: '',
      cerda_id: '',
      nacidos_vivos: '',
      nacidos_muertos: '',
      momias: '',
      peso_camda_kg: '',
      hembras: '',
      machos: '',
      observaciones: '',
    })

  const findUbicacion = (id: number) => ubicaciones.find((u) => u.id === id)
  const findLote = (id: number | null) => lotes.find((l) => l.id === id)

  const cerdasDesdePartos = (rows: Parto[]) => {
    const setCerdas = new Set<string>()
    rows.forEach((row) => {
      const c = (row.cerda_id || '').trim()
      if (c) setCerdas.add(c)
    })
    return Array.from(setCerdas).sort((a, b) => a.localeCompare(b, 'es'))
  }

  // -------- cargar catálogos y partos --------
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, lRes, pRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('fecha', { ascending: false })
          .limit(200),
        supabase
          .from('granja_partos')
          .select(
            'id, fecha, ubicacion_id, lote_id, cerda_id, nacidos_vivos, nacidos_muertos, momias, peso_camda_kg, hembras, machos, observaciones, created_at'
          )
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(50),
      ])

      if (uRes.error) console.error('Error cargando ubicaciones', uRes.error)
      if (lRes.error) console.error('Error cargando lotes', lRes.error)
      if (pRes.error) console.error('Error cargando partos', pRes.error)

      setUbicaciones(((uRes.data as Ubicacion[]) || []) as Ubicacion[])
      setLotes(((lRes.data as Lote[]) || []) as Lote[])

      const partos = ((pRes.data as Parto[]) || []) as Parto[]
      setPartosRecientes(partos.map((p) => ({ ...p, _edit: false })))
      setCerdasRegistradas(cerdasDesdePartos(partos))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // -------- helpers num --------
  const toInt = (v: string) => {
    const t = v.trim()
    if (!t) return 0
    const n = Number(t)
    return Number.isFinite(n) ? Math.trunc(n) : NaN
  }

  const toNumOrNull = (v: string) => {
    const t = v.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  // -------- obtener/crear lote (sin chocar UNIQUE) --------
  const obtenerOLiberarLote = async (): Promise<number | null> => {
    // si el usuario eligió un lote existente, usarlo
    if (form.lote_id) return Number(form.lote_id)

    // si no eligió lote, se crea / reutiliza por código
    const codigoBase = form.nuevo_lote_codigo.trim() || `P-${form.fecha.replace(/-/g, '')}`

    // 1) buscar si ya existe por codigo
    const { data: existente, error: exErr } = await supabase
      .from('granja_lotes')
      .select('id')
      .eq('codigo', codigoBase)
      .maybeSingle()

    if (exErr) {
      console.error('Error buscando lote existente', exErr)
      return null
    }

    if (existente?.id) return existente.id

    // 2) si no existe, crearlo
    const { data: loteInsertado, error: loteErr } = await supabase
      .from('granja_lotes')
      .insert({
        codigo: codigoBase,
        tipo_origen: 'PARTO',
        fecha: form.fecha,
        observaciones: form.observaciones || null,
      })
      .select('id')
      .single()

    if (loteErr || !loteInsertado) {
      console.error('Error creando lote', loteErr)
      return null
    }

    return loteInsertado.id
  }

  // -------- insertar/actualizar movimiento de inventario para este parto --------
  const upsertMovimientoParto = async (args: {
    partoId: number
    fecha: string
    ubicacion_id: number
    lote_id: number | null
    nacidos_vivos: number
    hembras: number | null
    machos: number | null
    peso_camda_kg: number | null
    observaciones: string | null
    user_id: string | null
  }) => {
    // cantidad que afecta inventario (vivos)
    const cantidadInv = args.nacidos_vivos

    // buscar si ya existe movimiento para ese parto
    const { data: movExist, error: movFindErr } = await supabase
      .from('granja_movimientos')
      .select('id')
      .eq('referencia_tabla', 'granja_partos')
      .eq('referencia_id', args.partoId)
      .eq('tipo', 'ENTRADA_PARTO')
      .maybeSingle()

    if (movFindErr) {
      console.error('Error buscando movimiento del parto', movFindErr)
      return { ok: false as const, error: movFindErr }
    }

    const payload = {
      fecha: new Date(`${args.fecha}T12:00:00`).toISOString(), // timestamp
      ubicacion_id: args.ubicacion_id,
      tipo: 'ENTRADA_PARTO',
      lote_id: args.lote_id,
      cantidad: cantidadInv,
      hembras: args.hembras,
      machos: args.machos,
      peso_total_kg: args.peso_camda_kg,
      referencia_tabla: 'granja_partos',
      referencia_id: args.partoId,
      user_id: args.user_id,
      observaciones: args.observaciones || 'Entrada de cerdos por parto',
    }

    if (movExist?.id) {
      const { error: updErr } = await supabase
        .from('granja_movimientos')
        .update(payload)
        .eq('id', movExist.id)

      if (updErr) {
        console.error('Error actualizando movimiento', updErr)
        return { ok: false as const, error: updErr }
      }
      return { ok: true as const }
    }

    const { error: insErr } = await supabase.from('granja_movimientos').insert(payload)
    if (insErr) {
      console.error('Error insertando movimiento', insErr)
      return { ok: false as const, error: insErr }
    }
    return { ok: true as const }
  }

  // -------- guardar parto --------
  const guardarParto = async () => {
    if (!form.fecha || !form.ubicacion_id) {
      alert('Fecha y ubicación son obligatorias.')
      return
    }
    if (!form.cerda_id.trim()) {
      alert('Debe indicar la cerda.')
      return
    }

    const nacidosVivos = toInt(form.nacidos_vivos)
    const nacidosMuertos = toInt(form.nacidos_muertos)
    const momias = toInt(form.momias)
    if ([nacidosVivos, nacidosMuertos, momias].some((x) => Number.isNaN(x))) {
      alert('Vivos/Muertos/Momias deben ser números válidos.')
      return
    }

    const hembras = form.hembras.trim() ? toInt(form.hembras) : null
    const machos = form.machos.trim() ? toInt(form.machos) : null
    if ([hembras, machos].some((x) => x !== null && Number.isNaN(x))) {
      alert('Hembras/Machos deben ser números válidos.')
      return
    }

    const pesoCamada = toNumOrNull(form.peso_camda_kg)
    if (pesoCamada !== null && Number.isNaN(pesoCamada)) {
      alert('Peso de camada debe ser un número válido.')
      return
    }

    setGuardando(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const loteId = await obtenerOLiberarLote()
      if (!loteId) {
        alert('No se pudo determinar/crear el lote.')
        return
      }

      // insertar parto
      const { data: partoInsertado, error: partoErr } = await supabase
        .from('granja_partos')
        .insert({
          fecha: form.fecha,
          ubicacion_id: Number(form.ubicacion_id),
          lote_id: loteId,
          cerda_id: form.cerda_id.trim(),
          nacidos_vivos: nacidosVivos,
          nacidos_muertos: nacidosMuertos,
          momias,
          peso_camda_kg: pesoCamada,
          hembras: hembras ?? 0,
          machos: machos ?? 0,
          observaciones: form.observaciones || null,
          user_id: userId,
        })
        .select('id')
        .single()

      if (partoErr || !partoInsertado) {
        console.error('Error guardando parto', partoErr)
        alert('No se pudo guardar el parto.')
        return
      }

      // movimiento inventario (SOLO vivos)
      const movRes = await upsertMovimientoParto({
        partoId: partoInsertado.id,
        fecha: form.fecha,
        ubicacion_id: Number(form.ubicacion_id),
        lote_id: loteId,
        nacidos_vivos: nacidosVivos,
        hembras,
        machos,
        peso_camda_kg: pesoCamada,
        observaciones: 'Entrada de cerdos por parto',
        user_id: userId,
      })

      if (!movRes.ok) {
        alert('Parto guardado, pero NO se pudo registrar el movimiento de inventario (revisar permisos/RLS).')
      } else {
        alert('Parto registrado correctamente (inventario actualizado).')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // -------- edición / eliminación (panel derecho) --------
  const activarEdicion = (id: number) => {
    setPartosRecientes((prev) => prev.map((p) => (p.id === id ? { ...p, _edit: true } : p)))
  }

  const cancelarEdicion = (id: number) => {
    // recargar desde DB para deshacer cambios locales
    cargarDatos()
  }

  const setCampoParto = (id: number, field: keyof Parto, value: any) => {
    setPartosRecientes((prev) =>
      prev.map((p) => (p.id === id ? ({ ...p, [field]: value } as PartoEditable) : p))
    )
  }

  const guardarEdicionParto = async (p: PartoEditable) => {
    if (guardandoEdicionId) return
    if (!p.fecha || !p.ubicacion_id || !p.cerda_id?.trim()) {
      alert('Fecha, ubicación y cerda son obligatorias.')
      return
    }

    setGuardandoEdicionId(p.id)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const { error: updErr } = await supabase
        .from('granja_partos')
        .update({
          fecha: p.fecha,
          ubicacion_id: p.ubicacion_id,
          lote_id: p.lote_id,
          cerda_id: p.cerda_id.trim(),
          nacidos_vivos: Number(p.nacidos_vivos || 0),
          nacidos_muertos: Number(p.nacidos_muertos || 0),
          momias: Number(p.momias || 0),
          peso_camda_kg: p.peso_camda_kg ?? null,
          hembras: p.hembras ?? 0,
          machos: p.machos ?? 0,
          observaciones: p.observaciones ?? null,
          user_id: userId,
        })
        .eq('id', p.id)

      if (updErr) {
        console.error('Error actualizando parto', updErr)
        alert('No se pudo actualizar el parto.')
        return
      }

      const movRes = await upsertMovimientoParto({
        partoId: p.id,
        fecha: p.fecha,
        ubicacion_id: p.ubicacion_id,
        lote_id: p.lote_id,
        nacidos_vivos: Number(p.nacidos_vivos || 0),
        hembras: p.hembras ?? null,
        machos: p.machos ?? null,
        peso_camda_kg: p.peso_camda_kg ?? null,
        observaciones: 'Entrada de cerdos por parto (editado)',
        user_id: userId,
      })

      if (!movRes.ok) {
        alert('Parto actualizado, pero NO se pudo actualizar el movimiento de inventario.')
      } else {
        alert('Parto actualizado e inventario ajustado.')
      }

      await cargarDatos()
    } finally {
      setGuardandoEdicionId(null)
    }
  }

  const eliminarParto = async (p: PartoEditable) => {
    if (eliminandoId) return
    if (!confirm(`¿Eliminar el parto #${p.id}? Esto ajustará el inventario.`)) return

    setEliminandoId(p.id)
    try {
      // 1) borrar movimiento asociado
      const { error: delMovErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_partos')
        .eq('referencia_id', p.id)
        .eq('tipo', 'ENTRADA_PARTO')

      if (delMovErr) {
        console.error('Error eliminando movimiento', delMovErr)
        alert('No se pudo eliminar el movimiento de inventario. Revisa permisos/RLS.')
        return
      }

      // 2) borrar parto
      const { error: delErr } = await supabase.from('granja_partos').delete().eq('id', p.id)
      if (delErr) {
        console.error('Error eliminando parto', delErr)
        alert('No se pudo eliminar el parto.')
        return
      }

      alert('Parto eliminado (inventario ajustado).')
      await cargarDatos()
    } finally {
      setEliminandoId(null)
    }
  }

  const totalNacidos = useMemo(() => {
    const vivos = toInt(form.nacidos_vivos)
    const muertos = toInt(form.nacidos_muertos)
    const mom = toInt(form.momias)
    if ([vivos, muertos, mom].some((x) => Number.isNaN(x))) return 0
    return vivos + muertos + mom
  }, [form.nacidos_vivos, form.nacidos_muertos, form.momias])

  // -------- UI --------
  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Entrada por parto</h1>
          <p className="text-xs text-gray-600">Registrar camadas y actualizar el inventario por ubicación.</p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ------ formulario ------ */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo parto</h2>

          {loading && <p className="text-xs text-gray-500 mb-2">Cargando catálogos…</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Fecha</label>
              <input
                type="date"
                className="border rounded w-full p-2 text-sm"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Ubicación (tramo o jaula)</label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.ubicacion_id}
                onChange={(e) => setForm({ ...form, ubicacion_id: e.target.value })}
              >
                <option value="">Seleccione una ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* lote existente */}
            <div>
              <label className="block text-xs font-semibold mb-1">Lote existente</label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.lote_id}
                onChange={(e) => setForm({ ...form, lote_id: e.target.value })}
              >
                <option value="">Crear / reutilizar lote</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.fecha})
                  </option>
                ))}
              </select>
            </div>

            {/* nuevo lote */}
            <div>
              <label className="block text-xs font-semibold mb-1">Código de nuevo lote</label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Vacío = P-AAAAMMDD"
                value={form.nuevo_lote_codigo}
                onChange={(e) => setForm({ ...form, nuevo_lote_codigo: e.target.value })}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Si registras varios partos el mismo día, se reutiliza el lote por código (sin error 409).
              </p>
            </div>

            {/* cerda */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Cerda (arete / código)</label>
              <div className="flex gap-2">
                <input
                  className="border rounded w-full p-2 text-sm"
                  value={form.cerda_id}
                  onChange={(e) => setForm({ ...form, cerda_id: e.target.value })}
                  placeholder="Escriba o seleccione de la lista"
                />
                <select
                  className="border rounded p-2 text-xs w-44"
                  value=""
                  onChange={(e) => setForm({ ...form, cerda_id: e.target.value })}
                >
                  <option value="">Cerdas registradas…</option>
                  {cerdasRegistradas.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nacidos vivos</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.nacidos_vivos}
                onChange={(e) => setForm({ ...form, nacidos_vivos: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nacidos muertos</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.nacidos_muertos}
                onChange={(e) => setForm({ ...form, nacidos_muertos: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Momias</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.momias}
                onChange={(e) => setForm({ ...form, momias: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Peso camada (kg)</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.peso_camda_kg}
                onChange={(e) => setForm({ ...form, peso_camda_kg: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Hembras</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.hembras}
                onChange={(e) => setForm({ ...form, hembras: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos</label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.machos}
                onChange={(e) => setForm({ ...form, machos: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">Observaciones</label>
              <textarea
                className="border rounded w-full p-2 text-sm"
                rows={3}
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Total nacidos (info): <span className="font-semibold">{totalNacidos}</span> ·
            Inventario suma: <span className="font-semibold">{toInt(form.nacidos_vivos) || 0}</span> (solo vivos)
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarParto}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar parto'}
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-200 px-4 py-2 rounded text-sm">
              Limpiar
            </button>
          </div>
        </div>

        {/* ------ partos recientes ------ */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Partos recientes</h2>
            <button
              onClick={cargarDatos}
              className="text-xs bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded"
            >
              Recargar
            </button>
          </div>

          {partosRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay partos registrados.</p>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-left">Cerda</th>
                    <th className="p-2 text-right">Vivos</th>
                    <th className="p-2 text-right">Muertos</th>
                    <th className="p-2 text-right">Momias</th>
                    <th className="p-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {partosRecientes.map((p) => {
                    const u = findUbicacion(p.ubicacion_id)
                    const l = findLote(p.lote_id)
                    const saving = guardandoEdicionId === p.id
                    const deleting = eliminandoId === p.id

                    return (
                      <tr key={p.id} className="border-t align-top">
                        <td className="p-2">
                          {p._edit ? (
                            <input
                              type="date"
                              className="border rounded px-2 py-1 w-[140px]"
                              value={p.fecha}
                              onChange={(e) => setCampoParto(p.id, 'fecha', e.target.value)}
                            />
                          ) : (
                            p.fecha
                          )}
                        </td>

                        <td className="p-2">
                          {p._edit ? (
                            <select
                              className="border rounded px-2 py-1 w-[160px]"
                              value={p.ubicacion_id}
                              onChange={(e) => setCampoParto(p.id, 'ubicacion_id', Number(e.target.value))}
                            >
                              {ubicaciones.map((uu) => (
                                <option key={uu.id} value={uu.id}>
                                  {uu.codigo}
                                </option>
                              ))}
                            </select>
                          ) : u ? (
                            `${u.codigo}${u.nombre ? ` — ${u.nombre}` : ''}`
                          ) : (
                            String(p.ubicacion_id)
                          )}
                        </td>

                        <td className="p-2">
                          {p._edit ? (
                            <select
                              className="border rounded px-2 py-1 w-[140px]"
                              value={p.lote_id ?? ''}
                              onChange={(e) =>
                                setCampoParto(p.id, 'lote_id', e.target.value ? Number(e.target.value) : null)
                              }
                            >
                              <option value="">—</option>
                              {lotes.map((ll) => (
                                <option key={ll.id} value={ll.id}>
                                  {ll.codigo}
                                </option>
                              ))}
                            </select>
                          ) : (
                            l?.codigo ?? '—'
                          )}
                        </td>

                        <td className="p-2">
                          {p._edit ? (
                            <input
                              className="border rounded px-2 py-1 w-[140px]"
                              value={p.cerda_id}
                              onChange={(e) => setCampoParto(p.id, 'cerda_id', e.target.value)}
                            />
                          ) : (
                            p.cerda_id
                          )}
                        </td>

                        <td className="p-2 text-right">
                          {p._edit ? (
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-[70px] text-right"
                              value={Number(p.nacidos_vivos || 0)}
                              onChange={(e) => setCampoParto(p.id, 'nacidos_vivos', Number(e.target.value))}
                            />
                          ) : (
                            p.nacidos_vivos
                          )}
                        </td>

                        <td className="p-2 text-right">
                          {p._edit ? (
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-[70px] text-right"
                              value={Number(p.nacidos_muertos || 0)}
                              onChange={(e) => setCampoParto(p.id, 'nacidos_muertos', Number(e.target.value))}
                            />
                          ) : (
                            p.nacidos_muertos
                          )}
                        </td>

                        <td className="p-2 text-right">
                          {p._edit ? (
                            <input
                              type="number"
                              className="border rounded px-2 py-1 w-[70px] text-right"
                              value={Number(p.momias || 0)}
                              onChange={(e) => setCampoParto(p.id, 'momias', Number(e.target.value))}
                            />
                          ) : (
                            p.momias
                          )}
                        </td>

                        <td className="p-2 text-right whitespace-nowrap">
                          {!p._edit ? (
                            <>
                              <button
                                onClick={() => activarEdicion(p.id)}
                                className="bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-[11px] mr-2"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => eliminarParto(p)}
                                disabled={deleting}
                                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-2 py-1 rounded text-[11px]"
                              >
                                {deleting ? 'Eliminando…' : 'Eliminar'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => guardarEdicionParto(p)}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-2 py-1 rounded text-[11px] mr-2"
                              >
                                {saving ? 'Guardando…' : 'Guardar'}
                              </button>
                              <button
                                onClick={() => cancelarEdicion(p.id)}
                                className="bg-gray-200 px-2 py-1 rounded text-[11px]"
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <p className="text-[11px] text-gray-600 mt-3">
                Nota: el inventario se actualiza con <b>nacidos vivos</b>. Muertos y momias quedan registrados en el parto,
                pero no aumentan stock.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
