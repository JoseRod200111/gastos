'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
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

type TipoEvento = 'MONTA' | 'INSEMINACION' | 'REVISION_EMBARAZO' | 'PARTO' | 'DESTETE' | 'ABORTO' | 'MEDICACION' | 'MUERTE'

type Ubicacion = { id: number; codigo: string; nombre: string | null }
type Lote = { id: number; codigo: string; activo: boolean | null }

type CerdaMini = {
  id: number
  arete: string
  nombre: string
  estado: EstadoCerda
  ubicacion_id: number | null
  lote_id: number | null
  activa: boolean
}

type Evento = {
  id: number
  cerda_id: number
  fecha: string
  tipo: TipoEvento
  resultado: string | null
  ubicacion_id: number | null
  lote_id: number | null
  datos: any
  observaciones: string | null
  created_at: string
}

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getCerdaIdFromQuery() {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  return url.searchParams.get('cerda_id') ?? ''
}

export default function GranjaCerdasEventoPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<CerdaMini[]>([])

  const [loading, setLoading] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])

  // filtros listado
  const [desde, setDesde] = useState<string>(todayISO())
  const [hasta, setHasta] = useState<string>(todayISO())
  const [q, setQ] = useState('')
  const [fTipo, setFTipo] = useState<string>('TODOS')

  // form
  const [cerdaId, setCerdaId] = useState<string>(() => getCerdaIdFromQuery())
  const [fecha, setFecha] = useState<string>(todayISO())
  const [tipo, setTipo] = useState<TipoEvento>('MONTA')
  const [resultado, setResultado] = useState<string>('') // en revisión será dropdown
  const [observaciones, setObservaciones] = useState<string>('')

  const [ubicacionId, setUbicacionId] = useState<string>('') // opcional
  const [loteId, setLoteId] = useState<string>('') // opcional

  // específicos
  const [macho, setMacho] = useState('')
  const [materialGenetico, setMaterialGenetico] = useState('')
  const [costoQ, setCostoQ] = useState('')
  const [nacVivos, setNacVivos] = useState('0')
  const [nacMuertos, setNacMuertos] = useState('0')
  const [momias, setMomias] = useState('0')
  const [medNombre, setMedNombre] = useState('')
  const [medDosis, setMedDosis] = useState('')
  const [medProxFecha, setMedProxFecha] = useState('')

  const tipos: TipoEvento[] = useMemo(
    () => ['MONTA', 'INSEMINACION', 'REVISION_EMBARAZO', 'PARTO', 'DESTETE', 'ABORTO', 'MEDICACION', 'MUERTE'],
    []
  )

  const selectedCerda = useMemo(() => {
    const idNum = cerdaId ? Number(cerdaId) : null
    if (!idNum) return null
    return cerdas.find((c) => c.id === idNum) ?? null
  }, [cerdas, cerdaId])

  const estadoSugerido: EstadoCerda | null = useMemo(() => {
    if (tipo === 'REVISION_EMBARAZO') {
      if (resultado === 'POSITIVO') return 'PRENADA'
      if (resultado === 'NEGATIVO') return 'VACIA'
      return null
    }
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') return 'SERVIDA'
    if (tipo === 'PARTO') return 'LACTANDO'
    if (tipo === 'DESTETE') return 'DESTETADA'
    if (tipo === 'ABORTO') return 'ABORTO'
    if (tipo === 'MUERTE') return 'MUERTA'
    return null
  }, [tipo, resultado])

  const cargarCatalogos = useCallback(async () => {
    const uRes = await supabase
      .from('granja_ubicaciones')
      .select('id,codigo,nombre')
      .eq('activa', true)
      .order('codigo', { ascending: true })

    const lRes = await supabase.from('granja_lotes').select('id,codigo,activo').order('codigo', { ascending: true })

    if (!uRes.error) setUbicaciones((uRes.data as any[]) ?? [])
    if (!lRes.error) setLotes((lRes.data as any[]) ?? [])
  }, [])

  const cargarCerdasMini = useCallback(async () => {
    const res = await supabase
      .from('granja_cerdas')
      .select('id,arete,nombre,estado,ubicacion_id,lote_id,activa')
      .eq('activa', true)
      .order('arete', { ascending: true })

    if (!res.error) setCerdas((res.data as any[]) ?? [])
  }, [])

  const cargarEventos = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('v_granja_cerda_eventos')
        .select(
          `
          id,cerda_id,fecha,tipo,resultado,ubicacion_id,lote_id,datos,observaciones,created_at,
          arete,cerda_nombre,ubicacion_codigo
        `
        )
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (cerdaId) query = query.eq('cerda_id', Number(cerdaId))
      if (fTipo !== 'TODOS') query = query.eq('tipo', fTipo)

      if (q.trim()) {
        const qq = q.trim()
        query = query.or(`arete.ilike.%${qq}%,cerda_nombre.ilike.%${qq}%`)
      }

      const res = await query
      if (res.error) {
        console.error('Error cargando eventos', res.error)
        alert('No se pudieron cargar eventos.')
        return
      }
      setEventos((res.data as any[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [cerdaId, desde, hasta, fTipo, q])

  useEffect(() => {
    cargarCatalogos()
    cargarCerdasMini()
    // rango inicial: últimos 14 días
    const d = new Date()
    const h = new Date()
    d.setDate(d.getDate() - 14)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    setDesde(`${yyyy}-${mm}-${dd}`)
    setHasta(todayISO())
  }, [cargarCatalogos, cargarCerdasMini])

  useEffect(() => {
    cargarEventos()
  }, [cargarEventos])

  const limpiarForm = () => {
    setFecha(todayISO())
    setTipo('MONTA')
    setResultado('')
    setObservaciones('')
    setMacho('')
    setMaterialGenetico('')
    setCostoQ('')
    setNacVivos('0')
    setNacMuertos('0')
    setMomias('0')
    setMedNombre('')
    setMedDosis('')
    setMedProxFecha('')
    setUbicacionId('')
    setLoteId('')
  }

  // helpers validación
  const tieneEventoPrevio = async (cerdaIdNum: number, tiposReq: TipoEvento[]) => {
    const res = await supabase
      .from('granja_cerda_eventos')
      .select('id,tipo,fecha,resultado')
      .eq('cerda_id', cerdaIdNum)
      .in('tipo', tiposReq)
      .limit(1)

    if (res.error) return false
    return (res.data ?? []).length > 0
  }

  const guardarEvento = async () => {
    if (!cerdaId) {
      alert('Selecciona una cerda.')
      return
    }
    if (!fecha || !tipo) {
      alert('Fecha y tipo son obligatorios.')
      return
    }

    const cerdaIdNum = Number(cerdaId)

    // VALIDACIONES CLAVE
    if (tipo === 'DESTETE') {
      const ok = await tieneEventoPrevio(cerdaIdNum, ['PARTO'])
      if (!ok) {
        alert('No puedes registrar DESTETE sin un PARTO previo.')
        return
      }
    }

    if (tipo === 'PARTO') {
      const ok = await tieneEventoPrevio(cerdaIdNum, ['MONTA', 'INSEMINACION'])
      if (!ok) {
        alert('No puedes registrar PARTO sin una MONTA o INSEMINACION previa.')
        return
      }
    }

    if (tipo === 'REVISION_EMBARAZO') {
      const ok = await tieneEventoPrevio(cerdaIdNum, ['MONTA', 'INSEMINACION'])
      if (!ok) {
        alert('No puedes registrar REVISION sin una MONTA o INSEMINACION previa.')
        return
      }
      if (resultado !== 'POSITIVO' && resultado !== 'NEGATIVO') {
        alert('La revisión de embarazo debe ser POSITIVO o NEGATIVO.')
        return
      }
    }

    if (tipo === 'MUERTE') {
      if (selectedCerda && !selectedCerda.activa) {
        alert('Esta cerda ya está inactiva.')
        return
      }
    }

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id ?? null

    // datos variables por tipo
    const datos: any = {}

    if (tipo === 'MONTA') {
      if (macho.trim()) datos.macho = macho.trim()
    }

    if (tipo === 'INSEMINACION') {
      if (materialGenetico.trim()) datos.material_genetico = materialGenetico.trim()
      if (costoQ.trim()) datos.costo_q = Number(costoQ)
    }

    if (tipo === 'PARTO') {
      const vivos = Number(nacVivos || 0)
      const muertos = Number(nacMuertos || 0)
      const m = Number(momias || 0)
      datos.nacidos_vivos = vivos
      datos.nacidos_muertos = muertos
      datos.momias = m
      datos.total = vivos + muertos + m
    }

    if (tipo === 'MEDICACION') {
      if (medNombre.trim()) datos.medicamento = medNombre.trim()
      if (medDosis.trim()) datos.dosis = medDosis.trim()
      if (medProxFecha) datos.proxima_fecha = medProxFecha
    }

    // inserta evento
    const ins = await supabase
      .from('granja_cerda_eventos')
      .insert({
        cerda_id: cerdaIdNum,
        fecha,
        tipo,
        resultado:
          tipo === 'REVISION_EMBARAZO'
            ? resultado
            : resultado.trim()
            ? resultado.trim()
            : null,
        ubicacion_id: ubicacionId ? Number(ubicacionId) : null,
        lote_id: loteId ? Number(loteId) : null,
        datos,
        observaciones: observaciones.trim() ? observaciones.trim() : null,
        user_id: userId,
      })
      .select('id')
      .single()

    if (ins.error) {
      console.error('Error guardando evento', ins.error)
      alert('No se pudo guardar el evento.')
      return
    }

    // === AFECTAR INVENTARIO ===
    // Ubicación efectiva: la del evento si viene, si no la actual de la cerda
    const ubicacionEfectiva =
      ubicacionId ? Number(ubicacionId) : selectedCerda?.ubicacion_id ?? null
    const loteEfectivo = loteId ? Number(loteId) : selectedCerda?.lote_id ?? null

    // MUERTE: -1
    if (tipo === 'MUERTE' && ubicacionEfectiva) {
      const mov = await supabase.from('granja_movimientos').insert({
        fecha,
        tipo: 'SALIDA_MUERTE',
        ubicacion_id: ubicacionEfectiva,
        lote_id: loteEfectivo,
        cantidad: -1,
        motivo: `MUERTE_CERDA arete=${selectedCerda?.arete ?? ''}`,
        observaciones: `Evento MUERTE (cerdas) -1`,
        referencia_tabla: 'granja_cerda_eventos',
        referencia_id: ins.data.id,
        user_id: userId,
      })
      if (mov.error) {
        console.warn('Evento guardado, pero no se pudo registrar movimiento de inventario:', mov.error)
      }
    }

    // PARTO: + nacidos vivos (si hay ubicación)
    if (tipo === 'PARTO' && ubicacionEfectiva) {
      const vivos = Number(nacVivos || 0)
      if (vivos > 0) {
        const mov = await supabase.from('granja_movimientos').insert({
          fecha,
          tipo: 'ENTRADA_PARTO',
          ubicacion_id: ubicacionEfectiva,
          lote_id: loteEfectivo,
          cantidad: vivos,
          motivo: `PARTO_CERDA arete=${selectedCerda?.arete ?? ''}`,
          observaciones: `Evento PARTO (cerdas) +${vivos} nacidos vivos`,
          referencia_tabla: 'granja_cerda_eventos',
          referencia_id: ins.data.id,
          user_id: userId,
        })
        if (mov.error) {
          console.warn('Parto guardado, pero no se pudo registrar entrada al inventario:', mov.error)
        }
      }
    }

    // actualiza estado cerda y también ubicación/lote si los puso
    if (estadoSugerido) {
      const patch: any = {
        estado: estadoSugerido,
        updated_at: new Date().toISOString(),
      }

      if (estadoSugerido === 'MUERTA') patch.activa = false
      if (ubicacionId) patch.ubicacion_id = Number(ubicacionId)
      if (loteId) patch.lote_id = Number(loteId)

      const up = await supabase.from('granja_cerdas').update(patch).eq('id', cerdaIdNum)
      if (up.error) console.warn('Evento guardado, pero no se pudo actualizar estado de cerda:', up.error)
    }

    alert('Evento guardado.')
    limpiarForm()
    cargarCerdasMini()
    cargarEventos()
  }

  const eliminarEvento = async (id: number) => {
    const ok = confirm('¿Eliminar este evento?')
    if (!ok) return

    const del = await supabase.from('granja_cerda_eventos').delete().eq('id', id)
    if (del.error) {
      console.error('Error eliminando evento', del.error)
      alert('No se pudo eliminar.')
      return
    }

    alert('Evento eliminado.')
    cargarEventos()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-14" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold">Granja — Eventos de cerdas</h1>
          <p className="text-sm text-gray-600">
            Monta / inseminación, revisión (día 21), parto, destete, aborto, medicación y muerte.
          </p>
        </div>

        <Link href="/granja/cerdas" className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white">
          ⬅ Volver a Cerdas
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Registrar evento</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Cerda</label>
              <select className="w-full border rounded px-2 py-2" value={cerdaId} onChange={(e) => setCerdaId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {cerdas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.arete} — {c.nombre} ({c.estado})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Fecha</label>
              <input className="w-full border rounded px-2 py-2" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div>
              <label className="text-xs text-gray-600">Tipo</label>
              <select className="w-full border rounded px-2 py-2" value={tipo} onChange={(e) => {
                const t = e.target.value as TipoEvento
                setTipo(t)
                // si cambia a revisión, obliga dropdown limpio
                if (t === 'REVISION_EMBARAZO') setResultado('POSITIVO')
                else setResultado('')
              }}>
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Ubicación (opcional)</label>
              <select className="w-full border rounded px-2 py-2" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
                <option value="">— (usar actual) —</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Lote (opcional)</label>
              <select className="w-full border rounded px-2 py-2" value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                <option value="">— (usar actual) —</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </select>
            </div>

            {/* Resultado: si revisión, dropdown */}
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Resultado</label>
              {tipo === 'REVISION_EMBARAZO' ? (
                <select className="w-full border rounded px-2 py-2" value={resultado} onChange={(e) => setResultado(e.target.value)}>
                  <option value="POSITIVO">POSITIVO</option>
                  <option value="NEGATIVO">NEGATIVO</option>
                </select>
              ) : (
                <input className="w-full border rounded px-2 py-2" value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Opcional (texto libre)" />
              )}
            </div>

            {/* Campos por tipo */}
            {tipo === 'MONTA' && (
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Macho (opcional)</label>
                <input className="w-full border rounded px-2 py-2" value={macho} onChange={(e) => setMacho(e.target.value)} />
              </div>
            )}

            {tipo === 'INSEMINACION' && (
              <>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Material genético (opcional)</label>
                  <input className="w-full border rounded px-2 py-2" value={materialGenetico} onChange={(e) => setMaterialGenetico(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Costo (Q) (opcional)</label>
                  <input className="w-full border rounded px-2 py-2" value={costoQ} onChange={(e) => setCostoQ(e.target.value)} inputMode="decimal" />
                </div>
              </>
            )}

            {tipo === 'PARTO' && (
              <>
                <div>
                  <label className="text-xs text-gray-600">Nacidos vivos</label>
                  <input className="w-full border rounded px-2 py-2" value={nacVivos} onChange={(e) => setNacVivos(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Nacidos muertos</label>
                  <input className="w-full border rounded px-2 py-2" value={nacMuertos} onChange={(e) => setNacMuertos(e.target.value)} inputMode="numeric" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Momias</label>
                  <input className="w-full border rounded px-2 py-2" value={momias} onChange={(e) => setMomias(e.target.value)} inputMode="numeric" />
                </div>
                <div className="text-xs text-gray-500 flex items-end pb-2">
                  Nota: se suma al inventario solo “vivos”.
                </div>
              </>
            )}

            {tipo === 'MEDICACION' && (
              <>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Medicamento</label>
                  <input className="w-full border rounded px-2 py-2" value={medNombre} onChange={(e) => setMedNombre(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Dosis (opcional)</label>
                  <input className="w-full border rounded px-2 py-2" value={medDosis} onChange={(e) => setMedDosis(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Próxima fecha (opcional)</label>
                  <input className="w-full border rounded px-2 py-2" type="date" value={medProxFecha} onChange={(e) => setMedProxFecha(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="mt-3">
            <label className="text-xs text-gray-600">Observaciones</label>
            <textarea className="w-full border rounded px-2 py-2 h-24" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white" onClick={guardarEvento}>
              Guardar evento
            </button>
            <button className="px-4 py-2 rounded bg-slate-200 hover:bg-slate-300" onClick={limpiarForm}>
              Limpiar
            </button>
          </div>

          <div className="text-xs text-gray-500 mt-3">
            Nota: esta pantalla registra historial por cerda (tabla <code>granja_cerda_eventos</code>) y puede actualizar el estado de <code>granja_cerdas</code>.
          </div>
        </section>

        {/* Listado */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Historial de eventos</h2>

          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-600">Desde</label>
              <input className="w-full border rounded px-2 py-2" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Hasta</label>
              <input className="w-full border rounded px-2 py-2" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3 mt-2">
            <input className="border rounded px-2 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar arete o nombre..." />
            <select className="border rounded px-2 py-2" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="TODOS">Todos los tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white" onClick={cargarEventos} disabled={loading}>
              Aplicar filtros
            </button>
          </div>

          <div className="text-xs text-gray-600 mt-2">Mostrando: {eventos.length}</div>

          <div className="mt-2 overflow-x-auto border rounded">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border px-2 py-2">Fecha</th>
                  <th className="border px-2 py-2">Cerda</th>
                  <th className="border px-2 py-2">Tipo</th>
                  <th className="border px-2 py-2">Resultado</th>
                  <th className="border px-2 py-2">Detalle</th>
                  <th className="border px-2 py-2">Acc.</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 ? (
                  <tr>
                    <td className="border px-2 py-3 text-center text-gray-600" colSpan={6}>
                      {loading ? 'Cargando...' : 'Sin eventos con esos filtros.'}
                    </td>
                  </tr>
                ) : (
                  eventos.map((e: any) => (
                    <tr key={e.id}>
                      <td className="border px-2 py-2">{e.fecha}</td>
                      <td className="border px-2 py-2">
                        <div className="font-semibold">{e.arete ?? `#${e.cerda_id}`}</div>
                        <div className="text-xs text-gray-600">{e.cerda_nombre ?? ''}</div>
                      </td>
                      <td className="border px-2 py-2">{e.tipo}</td>
                      <td className="border px-2 py-2">{e.resultado ?? '—'}</td>
                      <td className="border px-2 py-2 text-xs">
                        {e.tipo === 'PARTO' ? (
                          <div>
                            Vivos: {e.datos?.nacidos_vivos ?? 0} | Muertos: {e.datos?.nacidos_muertos ?? 0} | Momias:{' '}
                            {e.datos?.momias ?? 0}
                          </div>
                        ) : e.tipo === 'INSEMINACION' ? (
                          <div>
                            Material: {e.datos?.material_genetico ?? '—'} | Costo Q: {e.datos?.costo_q ?? '—'}
                          </div>
                        ) : e.tipo === 'MEDICACION' ? (
                          <div>
                            Med: {e.datos?.medicamento ?? '—'} | Dosis: {e.datos?.dosis ?? '—'} | Próx:{' '}
                            {e.datos?.proxima_fecha ?? '—'}
                          </div>
                        ) : e.tipo === 'MONTA' ? (
                          <div>Macho: {e.datos?.macho ?? '—'}</div>
                        ) : (
                          <div>{e.observaciones ?? '—'}</div>
                        )}
                      </td>
                      <td className="border px-2 py-2">
                        <button className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-xs" onClick={() => eliminarEvento(e.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            Importante: MUERTE registra movimiento en inventario (-1). PARTO registra entrada por nacidos vivos (+vivos).
          </div>
        </section>
      </div>
    </div>
  )
}
