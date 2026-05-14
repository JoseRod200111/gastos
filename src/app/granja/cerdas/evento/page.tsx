'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type CerdaRow = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  activa: boolean
}

type UbicacionRow = { id: number; codigo: string; nombre: string | null; activo?: boolean }
type LoteRow = { id: number; codigo: string }

type EventoRow = {
  id: number
  cerda_id: number
  fecha: string
  tipo: string
  resultado: string | null
  ubicacion_id: number | null
  lote_id: number | null
  observaciones: string | null
  datos: any
  created_at: string
  // extras si usas vista (si no existe, quedan null)
  arete?: string
  cerda_nombre?: string | null
  ubicacion_codigo?: string | null
}

const EVENTOS = [
  { key: 'MONTA', label: 'Monta (natural)' },
  { key: 'INSEMINACION', label: 'Inseminación (artificial)' },
  { key: 'REVISION_EMBARAZO', label: 'Revisión de embarazo (día 21)' },
  { key: 'PARTO', label: 'Parto' },
  { key: 'DESTETE', label: 'Destete' },
  { key: 'ABORTO', label: 'Aborto' },
  { key: 'MEDICACION', label: 'Medicación / Vacuna' },
  { key: 'MUERTE', label: 'Muerte' },
]

function addDaysISO(dateISO: string, days: number) {
  const d = new Date(dateISO + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function GranjaCerdasEventosPage() {
  // catálogos
  const [cerdas, setCerdas] = useState<CerdaRow[]>([])
  const [ubicaciones, setUbicaciones] = useState<UbicacionRow[]>([])
  const [lotes, setLotes] = useState<LoteRow[]>([])

  // lista eventos
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingEventos, setLoadingEventos] = useState(false)

  // filtros lista
  const [fDesde, setFDesde] = useState<string>(todayISO())
  const [fHasta, setFHasta] = useState<string>(todayISO())
  const [fTipo, setFTipo] = useState<string>('TODOS')
  const [fBuscar, setFBuscar] = useState<string>('')

  // form evento
  const [cerdaId, setCerdaId] = useState<string>('') // string por selects
  const [fecha, setFecha] = useState<string>(todayISO())
  const [tipo, setTipo] = useState<string>('MONTA')
  const [resultado, setResultado] = useState<string>('') // depende del tipo
  const [ubicacionId, setUbicacionId] = useState<string>('') // opcional
  const [loteId, setLoteId] = useState<string>('') // opcional
  const [observaciones, setObservaciones] = useState<string>('')

  // datos variables (se guardan en JSONB)
  const [macho, setMacho] = useState<string>('') // MONTA
  const [materialGenetico, setMaterialGenetico] = useState<string>('') // INSEMINACION
  const [costoQ, setCostoQ] = useState<string>('') // INSEMINACION
  const [nacVivos, setNacVivos] = useState<string>('0') // PARTO
  const [nacMuertos, setNacMuertos] = useState<string>('0') // PARTO
  const [momias, setMomias] = useState<string>('0') // PARTO
  const [medNombre, setMedNombre] = useState<string>('') // MEDICACION
  const [medDosis, setMedDosis] = useState<string>('') // MEDICACION
  const [medProxFecha, setMedProxFecha] = useState<string>('') // MEDICACION

  const cerdaSel = useMemo(() => {
    const idNum = Number(cerdaId || 0)
    return cerdas.find((c) => c.id === idNum) || null
  }, [cerdaId, cerdas])

  const sugeridos = useMemo(() => {
    if (!fecha) return null
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
      return {
        revision21: addDaysISO(fecha, 21),
        parto115: addDaysISO(fecha, 115),
      }
    }
    if (tipo === 'PARTO') {
      return {
        destete21: addDaysISO(fecha, 21),
        destete28: addDaysISO(fecha, 28),
      }
    }
    return null
  }, [tipo, fecha])

  const cargarCatalogos = async () => {
    setLoading(true)
    try {
      const [cRes, uRes, lRes] = await Promise.all([
        supabase
          .from('granja_cerdas')
          .select('id, arete, nombre, estado, ubicacion_id, lote_id, activa')
          .order('arete', { ascending: true }),
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre, activo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo')
          .order('codigo', { ascending: false }),
      ])

      if (cRes.error) console.error('Error cargando cerdas', cRes.error)
      if (uRes.error) console.error('Error cargando ubicaciones', uRes.error)
      if (lRes.error) console.error('Error cargando lotes', lRes.error)

      setCerdas((cRes.data as any) || [])
      setUbicaciones((uRes.data as any) || [])
      setLotes((lRes.data as any) || [])

      // defaults
      if (!cerdaId && (cRes.data || []).length > 0) {
        setCerdaId(String((cRes.data as any)[0].id))
      }
      if (!ubicacionId && cerdaSel?.ubicacion_id) {
        setUbicacionId(String(cerdaSel.ubicacion_id))
      }
      if (!loteId && cerdaSel?.lote_id) {
        setLoteId(String(cerdaSel.lote_id))
      }
    } finally {
      setLoading(false)
    }
  }

  const cargarEventos = async () => {
    setLoadingEventos(true)
    try {
      // Preferimos la vista si existe; si no, caemos a la tabla y resolvemos arete por separado.
      const fromView = await supabase
        .from('v_granja_cerda_eventos')
        .select(
          'id,fecha,tipo,resultado,observaciones,datos,cerda_id,arete,cerda_nombre,ubicacion_codigo,ubicacion_id,lote_id,created_at'
        )
        .gte('fecha', fDesde)
        .lte('fecha', fHasta)
        .order('fecha', { ascending: false })
        .limit(200)

      if (!fromView.error) {
        let rows = ((fromView.data as any) || []) as EventoRow[]

        if (fTipo !== 'TODOS') rows = rows.filter((r) => r.tipo === fTipo)

        const q = fBuscar.trim().toLowerCase()
        if (q) {
          rows = rows.filter((r: any) => {
            const a = String(r.arete || '').toLowerCase()
            const n = String(r.cerda_nombre || '').toLowerCase()
            return a.includes(q) || n.includes(q)
          })
        }

        setEventos(rows)
        return
      }

      // fallback: tabla directa
      const base = await supabase
        .from('granja_cerda_eventos')
        .select('id,cerda_id,fecha,tipo,resultado,ubicacion_id,lote_id,observaciones,datos,created_at')
        .gte('fecha', fDesde)
        .lte('fecha', fHasta)
        .order('fecha', { ascending: false })
        .limit(200)

      if (base.error) {
        console.error('Error cargando eventos', base.error)
        return
      }

      let rows = ((base.data as any) || []) as EventoRow[]
      if (fTipo !== 'TODOS') rows = rows.filter((r) => r.tipo === fTipo)

      setEventos(rows)
    } finally {
      setLoadingEventos(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // si cambias cerda seleccionada, sugiere su ubicación/lote actual
    if (!cerdaSel) return
    if (!ubicacionId && cerdaSel.ubicacion_id) setUbicacionId(String(cerdaSel.ubicacion_id))
    if (!loteId && cerdaSel.lote_id) setLoteId(String(cerdaSel.lote_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cerdaSel?.id])

  useEffect(() => {
    cargarEventos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fDesde, fHasta])

  const estadoSugerido = useMemo(() => {
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') return 'SERVIDA'
    if (tipo === 'REVISION_EMBARAZO') {
      if (resultado === 'POSITIVO') return 'PRENADA'
      if (resultado === 'NEGATIVO') return 'VACIA'
      return null
    }
    if (tipo === 'PARTO') return 'LACTANDO'
    if (tipo === 'DESTETE') return 'DESTETADA'
    if (tipo === 'ABORTO') return 'ABORTO'
    if (tipo === 'MUERTE') return 'MUERTA'
    return null
  }, [tipo, resultado])

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

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id ?? null

    const datos: any = {}
    if (tipo === 'MONTA') {
      if (macho.trim()) datos.macho = macho.trim()
    }
    if (tipo === 'INSEMINACION') {
      if (materialGenetico.trim()) datos.material_genetico = materialGenetico.trim()
      if (costoQ.trim()) datos.costo_q = Number(costoQ)
    }
    if (tipo === 'PARTO') {
      datos.nacidos_vivos = Number(nacVivos || 0)
      datos.nacidos_muertos = Number(nacMuertos || 0)
      datos.momias = Number(momias || 0)
      datos.total = datos.nacidos_vivos + datos.nacidos_muertos + datos.momias
    }
    if (tipo === 'MEDICACION') {
      if (medNombre.trim()) datos.medicamento = medNombre.trim()
      if (medDosis.trim()) datos.dosis = medDosis.trim()
      if (medProxFecha) datos.proxima_fecha = medProxFecha
    }

    const ins = await supabase
      .from('granja_cerda_eventos')
      .insert({
        cerda_id: Number(cerdaId),
        fecha,
        tipo,
        resultado: resultado.trim() ? resultado.trim() : null,
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

    if (estadoSugerido) {
      const patch: any = {
        estado: estadoSugerido,
        updated_at: new Date().toISOString(),
      }
      if (estadoSugerido === 'MUERTA') patch.activa = false
      if (ubicacionId) patch.ubicacion_id = Number(ubicacionId)
      if (loteId) patch.lote_id = Number(loteId)

      const up = await supabase.from('granja_cerdas').update(patch).eq('id', Number(cerdaId))
      if (up.error) {
        console.warn('Evento guardado, pero no se pudo actualizar estado de cerda:', up.error)
      }
    }

    alert('Evento guardado.')
    limpiarForm()
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
    cargarEventos()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10" />
          <div>
            <h1 className="text-2xl font-bold">Granja — Eventos de cerdas</h1>
            <p className="text-sm text-gray-600">
              Monta / inseminación, revisión (21 días), parto (115 días), destete, aborto, medicación, muerte.
            </p>
          </div>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* FORM */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Registrar evento</h2>

          <div className="grid gap-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Cerda</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={cerdaId}
                  onChange={(e) => setCerdaId(e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {cerdas.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.arete} {c.nombre ? `— ${c.nombre}` : ''} ({c.estado})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Fecha</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-2"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value)
                    setResultado('')
                  }}
                >
                  {EVENTOS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Resultado (si aplica)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder={
                    tipo === 'REVISION_EMBARAZO'
                      ? 'POSITIVO o NEGATIVO'
                      : tipo === 'ABORTO'
                      ? 'Causa / tipo'
                      : 'Opcional'
                  }
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Ubicación (opcional)</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={ubicacionId}
                  onChange={(e) => setUbicacionId(e.target.value)}
                >
                  <option value="">— Sin cambio —</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Lote (opcional)</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={loteId}
                  onChange={(e) => setLoteId(e.target.value)}
                >
                  <option value="">— Sin cambio —</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campos variables */}
            {tipo === 'MONTA' && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Macho (opcional)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: M-330 o nombre del macho"
                  value={macho}
                  onChange={(e) => setMacho(e.target.value)}
                />
              </div>
            )}

            {tipo === 'INSEMINACION' && (
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Material genético (opcional)</label>
                  <input
                    className="w-full border rounded px-2 py-2"
                    placeholder="Ej: Lote semen / proveedor"
                    value={materialGenetico}
                    onChange={(e) => setMaterialGenetico(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Costo (Q) (opcional)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-2"
                    placeholder="Ej: 125"
                    value={costoQ}
                    onChange={(e) => setCostoQ(e.target.value)}
                  />
                </div>
              </div>
            )}

            {tipo === 'PARTO' && (
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium">Nacidos vivos</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-2"
                    value={nacVivos}
                    onChange={(e) => setNacVivos(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Nacidos muertos</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-2"
                    value={nacMuertos}
                    onChange={(e) => setNacMuertos(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Momias</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-2"
                    value={momias}
                    onChange={(e) => setMomias(e.target.value)}
                  />
                </div>
              </div>
            )}

            {tipo === 'MEDICACION' && (
              <div className="grid gap-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Medicamento / vacuna</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      placeholder="Ej: Ivermectina"
                      value={medNombre}
                      onChange={(e) => setMedNombre(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Dosis</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      placeholder="Ej: 2 ml"
                      value={medDosis}
                      onChange={(e) => setMedDosis(e.target.value)}
                    />
                  </div>
                </div>

                <div className="md:w-1/2">
                  <label className="text-sm font-medium">Próxima fecha (opcional)</label>
                  <input
                    type="date"
                    className="w-full border rounded px-2 py-2"
                    value={medProxFecha}
                    onChange={(e) => setMedProxFecha(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Observaciones</label>
              <textarea
                className="w-full border rounded px-2 py-2 min-h-[90px]"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>

            {/* sugeridos */}
            {sugeridos && (
              <div className="border rounded p-3 bg-slate-50 text-sm">
                <div className="font-semibold mb-1">Fechas sugeridas</div>
                {'revision21' in sugeridos && (
                  <div>
                    • Revisión embarazo (día 21): <b>{(sugeridos as any).revision21}</b>
                  </div>
                )}
                {'parto115' in sugeridos && (
                  <div>
                    • Parto (día 115): <b>{(sugeridos as any).parto115}</b>
                  </div>
                )}
                {'destete21' in sugeridos && (
                  <div>
                    • Destete sugerido (21–28 días): <b>{(sugeridos as any).destete21}</b> a{' '}
                    <b>{(sugeridos as any).destete28}</b>
                  </div>
                )}
              </div>
            )}

            {estadoSugerido && (
              <div className="text-sm text-gray-600">
                Estado sugerido para la cerda: <b>{estadoSugerido}</b>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={guardarEvento}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                disabled={loading}
              >
                Guardar evento
              </button>
              <button
                onClick={limpiarForm}
                className="bg-slate-200 hover:bg-slate-300 text-slate-900 px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        {/* LISTA */}
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Eventos (historial)</h2>
            <button
              onClick={cargarEventos}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
            >
              Recargar
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 mb-3">
            <div>
              <label className="text-xs text-gray-600">Desde</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2"
                value={fDesde}
                onChange={(e) => setFDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Hasta</label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2"
                value={fHasta}
                onChange={(e) => setFHasta(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3 mb-3">
            <input
              className="border rounded px-2 py-2"
              placeholder="Buscar arete o nombre…"
              value={fBuscar}
              onChange={(e) => setFBuscar(e.target.value)}
            />
            <select
              className="border rounded px-2 py-2"
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value)}
            >
              <option value="TODOS">Todos los tipos</option>
              {EVENTOS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              onClick={cargarEventos}
              className="bg-slate-700 hover:bg-slate-800 text-white rounded px-3 py-2"
            >
              Aplicar filtros
            </button>
          </div>

          <div className="text-sm text-gray-600 mb-2">
            Mostrando: <b>{eventos.length}</b>
          </div>

          <div className="border rounded overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border px-2 py-2 text-left">Fecha</th>
                  <th className="border px-2 py-2 text-left">Cerda</th>
                  <th className="border px-2 py-2 text-left">Tipo</th>
                  <th className="border px-2 py-2 text-left">Resultado</th>
                  <th className="border px-2 py-2 text-left">Detalle</th>
                  <th className="border px-2 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loadingEventos ? (
                  <tr>
                    <td className="border px-2 py-2" colSpan={6}>
                      Cargando…
                    </td>
                  </tr>
                ) : eventos.length === 0 ? (
                  <tr>
                    <td className="border px-2 py-2" colSpan={6}>
                      No hay eventos en este rango.
                    </td>
                  </tr>
                ) : (
                  eventos
                    .filter((r: any) => (fTipo === 'TODOS' ? true : r.tipo === fTipo))
                    .filter((r: any) => {
                      const q = fBuscar.trim().toLowerCase()
                      if (!q) return true
                      const a = String(r.arete || '').toLowerCase()
                      const n = String(r.cerda_nombre || '').toLowerCase()
                      return a.includes(q) || n.includes(q)
                    })
                    .map((r: any) => {
                      const cerdaTxt = r.arete
                        ? `${r.arete}${r.cerda_nombre ? ` — ${r.cerda_nombre}` : ''}`
                        : `#${r.cerda_id}`

                      let detalle = ''
                      const d = r.datos || {}
                      if (r.tipo === 'MONTA' && d.macho) detalle = `Macho: ${d.macho}`
                      if (r.tipo === 'INSEMINACION') {
                        const a = d.material_genetico ? `Genética: ${d.material_genetico}` : ''
                        const c = d.costo_q != null ? `Costo Q${d.costo_q}` : ''
                        detalle = [a, c].filter(Boolean).join(' · ')
                      }
                      if (r.tipo === 'PARTO') {
                        detalle = `Vivos:${d.nacidos_vivos ?? 0} · Muertos:${d.nacidos_muertos ?? 0} · Momias:${d.momias ?? 0}`
                      }
                      if (r.tipo === 'MEDICACION') {
                        const m = d.medicamento ? `${d.medicamento}` : ''
                        const ds = d.dosis ? `Dosis: ${d.dosis}` : ''
                        const pf = d.proxima_fecha ? `Próx: ${d.proxima_fecha}` : ''
                        detalle = [m, ds, pf].filter(Boolean).join(' · ')
                      }
                      if (!detalle) detalle = r.observaciones ? String(r.observaciones) : '—'

                      const tipoLabel = EVENTOS.find((x) => x.key === r.tipo)?.label || r.tipo

                      return (
                        <tr key={r.id}>
                          <td className="border px-2 py-2">{r.fecha}</td>
                          <td className="border px-2 py-2">{cerdaTxt}</td>
                          <td className="border px-2 py-2">{tipoLabel}</td>
                          <td className="border px-2 py-2">{r.resultado || '—'}</td>
                          <td className="border px-2 py-2">{detalle}</td>
                          <td className="border px-2 py-2">
                            <button
                              onClick={() => eliminarEvento(r.id)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      )
                    })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            Nota: esta pantalla registra historial por cerda (tabla <code>granja_cerda_eventos</code>) y puede actualizar el
            estado de <code>granja_cerdas</code>.
          </div>
        </section>
      </div>
    </div>
  )
}
