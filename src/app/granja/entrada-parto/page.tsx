'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  tipo?: string | null
}

type Lote = {
  id: number
  codigo: string
  tipo_origen: string
  fecha: string
  observaciones: string | null
}

type PartoRow = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cerda_id: string
  nacidos_vivos: number
  nacidos_muertos: number
  momias: number
  peso_camda_kg: number | null
  hembras: number
  machos: number
  observaciones: string | null
  user_id: string | null
  created_at: string | null
  granja_ubicaciones?: { codigo: string; nombre: string | null } | null
  granja_lotes?: { codigo: string } | null
}

type FormState = {
  fecha: string
  ubicacion_id: string
  lote_id: string
  nuevo_lote_codigo: string
  cerda_id: string
  nacidos_vivos: string
  nacidos_muertos: string
  momias: string
  peso_camda_kg: string
  hembras: string
  machos: string
  observaciones: string
}

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const toInt = (v: string) => {
  const t = v.trim()
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

const toNumOrNull = (v: string) => {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const fechaISOaTimestampMediodia = (fechaISO: string) => {
  // “mediodía” para evitar temas de TZ al comparar cortes por día
  return new Date(`${fechaISO}T12:00:00`).toISOString()
}

export default function EntradaPartoPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [partos, setPartos] = useState<PartoRow[]>([])

  // ✅ lista de cerdas detectadas desde granja_partos
  const [cerdas, setCerdas] = useState<string[]>([])
  const [renombrandoCerda, setRenombrandoCerda] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [edit, setEdit] = useState<Partial<PartoRow>>({})
  const [guardandoEdicionId, setGuardandoEdicionId] = useState<number | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)

  const [form, setForm] = useState<FormState>({
    fecha: hoyISO(),
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

  const cargarCerdas = useCallback(async () => {
    // Traer varias para tener buena lista. Si hay MUCHÍSIMAS, luego hacemos paginación.
    const { data, error } = await supabase
      .from('granja_partos')
      .select('cerda_id')
      .order('cerda_id', { ascending: true })
      .limit(2000)

    if (error) {
      console.error('Error cargando cerdas', error)
      return
    }

    const uniq = new Set<string>()
    for (const r of (data ?? []) as any[]) {
      const val = String(r?.cerda_id ?? '').trim()
      if (val) uniq.add(val)
    }
    setCerdas(Array.from(uniq).sort((a, b) => a.localeCompare(b, 'es')))
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      // ubicaciones
      const uRes = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (uRes.error) {
        console.error('Error cargando ubicaciones', uRes.error)
        alert('No se pudieron cargar las ubicaciones.')
        return
      }

      // lotes (OJO: granja_lotes NO tiene "activo")
      const lRes = await supabase
        .from('granja_lotes')
        .select('id, codigo, tipo_origen, fecha, observaciones')
        .order('fecha', { ascending: false })
        .limit(300)

      if (lRes.error) {
        console.error('Error cargando lotes', lRes.error)
        alert('No se pudieron cargar los lotes.')
        return
      }

      // partos recientes
      const pRes = await supabase
        .from('granja_partos')
        .select(
          `
          id, fecha, ubicacion_id, lote_id, cerda_id,
          nacidos_vivos, nacidos_muertos, momias, peso_camda_kg,
          hembras, machos, observaciones, user_id, created_at,
          granja_ubicaciones ( codigo, nombre ),
          granja_lotes ( codigo )
        `
        )
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(50)

      if (pRes.error) {
        console.error('Error cargando partos', pRes.error)
        alert('No se pudieron cargar los partos.')
        return
      }

      const ubis = (uRes.data || []) as Ubicacion[]
      const lts = (lRes.data || []) as Lote[]
      const pts = (pRes.data || []) as any[]

      setUbicaciones(ubis)
      setLotes(lts)
      setPartos(pts as PartoRow[])

      // default ubicacion si vacío
      if (!form.ubicacion_id && ubis.length > 0) {
        setForm((prev) => ({ ...prev, ubicacion_id: String(ubis[0].id) }))
      }

      // ✅ cargar lista de cerdas
      await cargarCerdas()
    } finally {
      setLoading(false)
    }
  }, [form.ubicacion_id, cargarCerdas])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const totalNacidos = useMemo(() => {
    const vivos = toInt(form.nacidos_vivos)
    const muertos = toInt(form.nacidos_muertos)
    const mom = toInt(form.momias)
    if ([vivos, muertos, mom].some((x) => Number.isNaN(x))) return 0
    return vivos + muertos + mom
  }, [form.nacidos_vivos, form.nacidos_muertos, form.momias])

  const resetForm = () => {
    setForm({
      fecha: hoyISO(),
      ubicacion_id: ubicaciones.length ? String(ubicaciones[0].id) : '',
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
  }

  // -------- obtener/crear lote sin chocar UNIQUE (codigo) --------
  const obtenerOCrearLote = async (): Promise<number | null> => {
    // si el usuario eligió lote existente
    if (form.lote_id) return Number(form.lote_id)

    const codigoBase = form.nuevo_lote_codigo.trim() || `P-${form.fecha.replace(/-/g, '')}`

    // 1) buscar si ya existe por código (evita 409)
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

    // 2) crearlo
    const { data: ins, error: insErr } = await supabase
      .from('granja_lotes')
      .insert({
        codigo: codigoBase,
        tipo_origen: 'PARTO',
        fecha: form.fecha,
        observaciones: form.observaciones?.trim() ? form.observaciones.trim() : null,
      })
      .select('id')
      .single()

    if (insErr || !ins) {
      console.error('Error creando lote', insErr)
      return null
    }
    return ins.id
  }

  // -------- upsert movimiento inventario para un parto --------
  const upsertMovimientoParto = async (args: {
    partoId: number
    fecha: string
    ubicacion_id: number
    lote_id: number | null
    nacidos_vivos: number
    hembras: number | null
    machos: number | null
    peso_camda_kg: number | null
    user_id: string | null
    observaciones: string | null
  }) => {
    // Solo vivos afectan inventario
    const cantidadInv = args.nacidos_vivos

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
      fecha: fechaISOaTimestampMediodia(args.fecha),
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

  // ✅ Renombrar cerda (actualiza todos los partos que usan ese cerda_id)
  const renombrarCerda = async (oldId: string) => {
    const actual = oldId.trim()
    if (!actual) return

    const nuevo = prompt(`Nuevo código para la cerda "${actual}":`, actual)
    if (!nuevo) return
    const nuevoTrim = nuevo.trim()
    if (!nuevoTrim) return
    if (nuevoTrim === actual) return

    if (!confirm(`¿Renombrar "${actual}" → "${nuevoTrim}"? Esto cambia el código en todos los partos.`)) return

    setRenombrandoCerda(true)
    try {
      const { error } = await supabase.from('granja_partos').update({ cerda_id: nuevoTrim }).eq('cerda_id', actual)
      if (error) {
        console.error('Error renombrando cerda', error)
        alert('No se pudo renombrar la cerda (revisa RLS).')
        return
      }

      // si el form tenía ese valor, actualizarlo
      setForm((p) => ({ ...p, cerda_id: p.cerda_id.trim() === actual ? nuevoTrim : p.cerda_id }))

      // si está editando un parto con ese valor
      setEdit((p) => {
        const val = String(p.cerda_id ?? '').trim()
        if (val === actual) return { ...p, cerda_id: nuevoTrim }
        return p
      })

      alert('Cerda renombrada correctamente.')
      await cargarCerdas()
      await cargarDatos()
    } finally {
      setRenombrandoCerda(false)
    }
  }

  // -------- guardar parto --------
  const guardarParto = async () => {
    if (!form.fecha || !form.ubicacion_id) {
      alert('Fecha y ubicación son obligatorias.')
      return
    }
    if (!form.cerda_id.trim()) {
      alert('Debe indicar la cerda (arete/código).')
      return
    }

    const nacidosVivos = toInt(form.nacidos_vivos)
    const nacidosMuertos = toInt(form.nacidos_muertos)
    const momias = toInt(form.momias)

    if ([nacidosVivos, nacidosMuertos, momias].some((x) => Number.isNaN(x) || x < 0)) {
      alert('Vivos/Muertos/Momias deben ser números válidos (>= 0).')
      return
    }

    const hembras = form.hembras.trim() ? toInt(form.hembras) : null
    const machos = form.machos.trim() ? toInt(form.machos) : null
    if ([hembras, machos].some((x) => x !== null && (Number.isNaN(x) || (x as number) < 0))) {
      alert('Hembras/Machos deben ser números válidos (>= 0).')
      return
    }

    const pesoCamada = toNumOrNull(form.peso_camda_kg)
    if (pesoCamada !== null && (Number.isNaN(pesoCamada) || pesoCamada < 0)) {
      alert('Peso de camada debe ser un número válido (>= 0).')
      return
    }

    setGuardando(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const loteId = await obtenerOCrearLote()
      if (!loteId) {
        alert('No se pudo determinar/crear el lote.')
        return
      }

      // insertar parto
      const { data: partoIns, error: partoErr } = await supabase
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
          observaciones: form.observaciones?.trim() ? form.observaciones.trim() : null,
          user_id: userId,
        })
        .select('id')
        .single()

      if (partoErr || !partoIns) {
        console.error('Error guardando parto', partoErr)
        alert('No se pudo guardar el parto.')
        return
      }

      // movimiento inventario (ENTRADA_PARTO)
      const movRes = await upsertMovimientoParto({
        partoId: partoIns.id,
        fecha: form.fecha,
        ubicacion_id: Number(form.ubicacion_id),
        lote_id: loteId,
        nacidos_vivos: nacidosVivos,
        hembras: hembras,
        machos: machos,
        peso_camda_kg: pesoCamada,
        user_id: userId,
        observaciones: 'Entrada de cerdos por parto',
      })

      if (!movRes.ok) {
        alert('Parto guardado, pero NO se pudo registrar el movimiento de inventario (revisa RLS).')
      } else {
        alert('Parto registrado correctamente (inventario actualizado).')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // -------- edición / eliminación --------
  const empezarEditar = (p: PartoRow) => {
    setEditId(p.id)
    setEdit({ ...p })
  }

  const cancelarEditar = () => {
    setEditId(null)
    setEdit({})
  }

  const guardarEdicion = async () => {
    if (!editId) return
    const p = edit as PartoRow

    if (!p.fecha || !p.ubicacion_id) {
      alert('Fecha y ubicación son obligatorias.')
      return
    }
    if (!String(p.cerda_id || '').trim()) {
      alert('Debe indicar la cerda.')
      return
    }

    const vivos = Number(p.nacidos_vivos || 0)
    const muertos = Number(p.nacidos_muertos || 0)
    const mom = Number(p.momias || 0)
    if ([vivos, muertos, mom].some((x) => !Number.isFinite(x) || x < 0)) {
      alert('Vivos/Muertos/Momias deben ser válidos (>= 0).')
      return
    }

    setGuardandoEdicionId(editId)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const { error: updErr } = await supabase
        .from('granja_partos')
        .update({
          fecha: p.fecha,
          ubicacion_id: Number(p.ubicacion_id),
          lote_id: p.lote_id ? Number(p.lote_id) : null,
          cerda_id: String(p.cerda_id).trim(),
          nacidos_vivos: vivos,
          nacidos_muertos: muertos,
          momias: mom,
          peso_camda_kg: p.peso_camda_kg ?? null,
          hembras: Number(p.hembras || 0),
          machos: Number(p.machos || 0),
          observaciones: p.observaciones ?? null,
          user_id: userId,
        })
        .eq('id', editId)

      if (updErr) {
        console.error('Error actualizando parto', updErr)
        alert('No se pudo actualizar el parto.')
        return
      }

      const movRes = await upsertMovimientoParto({
        partoId: editId,
        fecha: p.fecha,
        ubicacion_id: Number(p.ubicacion_id),
        lote_id: p.lote_id ? Number(p.lote_id) : null,
        nacidos_vivos: vivos,
        hembras: Number.isFinite(Number(p.hembras)) ? Number(p.hembras) : null,
        machos: Number.isFinite(Number(p.machos)) ? Number(p.machos) : null,
        peso_camda_kg: p.peso_camda_kg ?? null,
        user_id: userId,
        observaciones: 'Entrada de cerdos por parto (editado)',
      })

      if (!movRes.ok) {
        alert('Parto actualizado, pero NO se pudo actualizar el movimiento de inventario (revisa RLS).')
      } else {
        alert('Parto actualizado (inventario ajustado).')
      }

      setEditId(null)
      setEdit({})
      await cargarDatos()
    } finally {
      setGuardandoEdicionId(null)
    }
  }

  const eliminarParto = async (p: PartoRow) => {
    if (eliminandoId) return
    if (!confirm(`¿Eliminar el parto #${p.id}? Esto revertirá el inventario.`)) return

    setEliminandoId(p.id)
    try {
      // 1) borrar movimiento asociado (revierte inventario)
      const { error: delMovErr } = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_partos')
        .eq('referencia_id', p.id)
        .eq('tipo', 'ENTRADA_PARTO')

      if (delMovErr) {
        console.error('Error eliminando movimiento', delMovErr)
        alert('No se pudo eliminar el movimiento de inventario. No se eliminó el parto (revisa RLS).')
        return
      }

      // 2) borrar parto
      const { error: delErr } = await supabase.from('granja_partos').delete().eq('id', p.id)
      if (delErr) {
        console.error('Error eliminando parto', delErr)
        alert('Se eliminó el movimiento, pero no se pudo eliminar el parto.')
        return
      }

      alert('Parto eliminado (inventario revertido).')
      await cargarDatos()
    } finally {
      setEliminandoId(null)
    }
  }

  // -------- UI --------
  return (
    <div className="p-6 max-w-5xl mx-auto">
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
        {/* Formulario */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo parto</h2>

          {loading ? <p className="text-xs text-gray-500 mb-2">Cargando…</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-700">Fecha</label>
              <input
                type="date"
                className="border p-2 w-full"
                value={form.fecha}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-700">Ubicación (tramo o jaula)</label>
              <select
                className="border p-2 w-full"
                value={form.ubicacion_id}
                onChange={(e) => setForm((p) => ({ ...p, ubicacion_id: e.target.value }))}
              >
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre || ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-700">Lote existente</label>
              <select
                className="border p-2 w-full"
                value={form.lote_id}
                onChange={(e) => setForm((p) => ({ ...p, lote_id: e.target.value }))}
              >
                <option value="">Crear/reusar por código</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.tipo_origen})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="text-xs text-gray-700">Código de nuevo lote (opcional)</label>
              <input
                className="border p-2 w-full"
                placeholder="Si se deja vacío: P-YYYYMMDD"
                value={form.nuevo_lote_codigo}
                onChange={(e) => setForm((p) => ({ ...p, nuevo_lote_codigo: e.target.value }))}
                disabled={Boolean(form.lote_id)}
              />
            </div>

            {/* ✅ Cerda con droplist + editar */}
            <div className="col-span-2">
              <div className="flex items-end justify-between gap-2">
                <label className="text-xs text-gray-700">Cerda (arete / código)</label>

                <button
                  type="button"
                  onClick={() => renombrarCerda(form.cerda_id)}
                  disabled={renombrandoCerda || !form.cerda_id.trim()}
                  className="text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white"
                  title="Renombrar este código de cerda en todos los partos"
                >
                  {renombrandoCerda ? 'Renombrando…' : 'Editar cerda'}
                </button>
              </div>

              <input
                className="border p-2 w-full"
                value={form.cerda_id}
                onChange={(e) => setForm((p) => ({ ...p, cerda_id: e.target.value }))}
                list="cerdas-list"
                placeholder="Escribe o selecciona una cerda…"
              />

              <datalist id="cerdas-list">
                {cerdas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>

              <p className="text-[11px] text-gray-500 mt-1">
                Puedes escribir manual o seleccionar una existente.
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-700">Nacidos vivos</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.nacidos_vivos}
                onChange={(e) => setForm((p) => ({ ...p, nacidos_vivos: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Nacidos muertos</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.nacidos_muertos}
                onChange={(e) => setForm((p) => ({ ...p, nacidos_muertos: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Momias</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.momias}
                onChange={(e) => setForm((p) => ({ ...p, momias: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Peso camada (kg)</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.peso_camda_kg}
                onChange={(e) => setForm((p) => ({ ...p, peso_camda_kg: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Hembras</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.hembras}
                onChange={(e) => setForm((p) => ({ ...p, hembras: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Machos</label>
              <input
                type="number"
                className="border p-2 w-full"
                value={form.machos}
                onChange={(e) => setForm((p) => ({ ...p, machos: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-700">Observaciones</label>
              <textarea
                className="border p-2 w-full"
                rows={3}
                value={form.observaciones}
                onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            Total nacidos (solo informativo): <span className="font-semibold">{totalNacidos}</span>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarParto}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
            >
              {guardando ? 'Guardando…' : 'Guardar parto'}
            </button>
            <button
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Lista derecha */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Partos recientes</h2>

          {partos.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay partos registrados.</p>
          ) : (
            <div className="space-y-3">
              {partos.map((p) => {
                const enEdicion = editId === p.id
                const loteCodigo = p.granja_lotes?.codigo || (p.lote_id ? `#${p.lote_id}` : '—')
                const ubi = p.granja_ubicaciones?.codigo || `#${p.ubicacion_id}`

                return (
                  <div key={p.id} className="border rounded p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-semibold">
                          #{p.id} · {p.fecha} · {ubi}
                        </div>
                        <div className="text-xs text-gray-600">
                          Lote: {loteCodigo} · Cerda: {p.cerda_id}
                        </div>

                        {!enEdicion ? (
                          <div className="mt-2 text-sm">
                            Vivos: <b>{p.nacidos_vivos}</b> · Muertos: <b>{p.nacidos_muertos}</b> · Momias: <b>{p.momias}</b>
                          </div>
                        ) : (
                          <>
                            <div className="mt-2">
                              <label className="text-[11px] text-gray-600">Cerda</label>
                              <div className="flex gap-2">
                                <input
                                  className="border p-1 w-full"
                                  value={String(edit.cerda_id ?? '')}
                                  onChange={(e) => setEdit((pr) => ({ ...pr, cerda_id: e.target.value }))}
                                  list="cerdas-list"
                                />
                                <button
                                  type="button"
                                  onClick={() => renombrarCerda(String(edit.cerda_id ?? ''))}
                                  disabled={renombrandoCerda || !String(edit.cerda_id ?? '').trim()}
                                  className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white text-xs px-3 py-2 rounded"
                                  title="Renombrar este código de cerda en todos los partos"
                                >
                                  {renombrandoCerda ? '…' : 'Editar'}
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[11px] text-gray-600">Vivos</label>
                                <input
                                  type="number"
                                  className="border p-1 w-full"
                                  value={String((edit.nacidos_vivos ?? 0) as any)}
                                  onChange={(e) => setEdit((pr) => ({ ...pr, nacidos_vivos: Number(e.target.value) }))}
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-600">Muertos</label>
                                <input
                                  type="number"
                                  className="border p-1 w-full"
                                  value={String((edit.nacidos_muertos ?? 0) as any)}
                                  onChange={(e) => setEdit((pr) => ({ ...pr, nacidos_muertos: Number(e.target.value) }))}
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-600">Momias</label>
                                <input
                                  type="number"
                                  className="border p-1 w-full"
                                  value={String((edit.momias ?? 0) as any)}
                                  onChange={(e) => setEdit((pr) => ({ ...pr, momias: Number(e.target.value) }))}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {!enEdicion ? null : (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] text-gray-600">Fecha</label>
                              <input
                                type="date"
                                className="border p-1 w-full"
                                value={String(edit.fecha ?? p.fecha)}
                                onChange={(e) => setEdit((pr) => ({ ...pr, fecha: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-gray-600">Ubicación</label>
                              <select
                                className="border p-1 w-full"
                                value={String(edit.ubicacion_id ?? p.ubicacion_id)}
                                onChange={(e) => setEdit((pr) => ({ ...pr, ubicacion_id: Number(e.target.value) }))}
                              >
                                {ubicaciones.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.codigo}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Lote</label>
                              <select
                                className="border p-1 w-full"
                                value={String(edit.lote_id ?? (p.lote_id ?? ''))}
                                onChange={(e) => setEdit((pr) => ({ ...pr, lote_id: e.target.value ? Number(e.target.value) : null }))}
                              >
                                <option value="">—</option>
                                {lotes.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.codigo}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Peso (kg)</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.peso_camda_kg ?? (p.peso_camda_kg ?? ''))}
                                onChange={(e) =>
                                  setEdit((pr) => ({
                                    ...pr,
                                    peso_camda_kg: e.target.value === '' ? null : Number(e.target.value),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}

                        {!enEdicion ? null : (
                          <div className="mt-2">
                            <label className="text-[11px] text-gray-600">Observaciones</label>
                            <input
                              className="border p-1 w-full"
                              value={String(edit.observaciones ?? '')}
                              onChange={(e) => setEdit((pr) => ({ ...pr, observaciones: e.target.value }))}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {!enEdicion ? (
                          <>
                            <button
                              onClick={() => empezarEditar(p)}
                              className="bg-slate-700 hover:bg-slate-800 text-white text-xs px-3 py-2 rounded"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => eliminarParto(p)}
                              disabled={eliminandoId === p.id}
                              className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-2 rounded"
                            >
                              {eliminandoId === p.id ? 'Eliminando…' : 'Eliminar'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={guardarEdicion}
                              disabled={guardandoEdicionId === p.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded"
                            >
                              {guardandoEdicionId === p.id ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button
                              onClick={cancelarEditar}
                              className="bg-gray-200 hover:bg-gray-300 text-gray-900 text-xs px-3 py-2 rounded"
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
