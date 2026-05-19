'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
}

type Ubicacion = { id: number; codigo: string; nombre: string | null }
type Lote = { id: number; codigo: string }

type TipoEvento =
  | 'MONTA'
  | 'INSEMINACION'
  | 'REVISION_EMBARAZO'
  | 'PARTO'
  | 'DESTETE'
  | 'ABORTO'
  | 'MEDICACION'
  | 'MUERTE'

const TIPOS: { value: TipoEvento; label: string }[] = [
  { value: 'MONTA', label: 'Monta (natural)' },
  { value: 'INSEMINACION', label: 'Inseminación (artificial)' },
  { value: 'REVISION_EMBARAZO', label: 'Revisión embarazo (día 21)' },
  { value: 'PARTO', label: 'Parto (día 115)' },
  { value: 'DESTETE', label: 'Destete (21–28 días)' },
  { value: 'ABORTO', label: 'Aborto' },
  { value: 'MEDICACION', label: 'Medicación' },
  { value: 'MUERTE', label: 'Muerte' },
]

export default function GranjaCerdasEventosPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])

  const [cerdaId, setCerdaId] = useState<string>('')
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [tipo, setTipo] = useState<TipoEvento>('MONTA')
  const [resultado, setResultado] = useState<string>('') // REVISION_EMBARAZO
  const [ubicacionId, setUbicacionId] = useState<string>('') // opcional
  const [loteId, setLoteId] = useState<string>('') // opcional
  const [macho, setMacho] = useState<string>('') // MONTA / INSEMINACION
  const [obs, setObs] = useState<string>('')

  const [nacidosVivos, setNacidosVivos] = useState<string>('') // PARTO
  const [nacidosMuertos, setNacidosMuertos] = useState<string>('') // PARTO
  const [momias, setMomias] = useState<string>('') // PARTO

  const [medNombre, setMedNombre] = useState<string>('') // MEDICACION
  const [medDosis, setMedDosis] = useState<string>('') // MEDICACION
  const [medProxFecha, setMedProxFecha] = useState<string>('') // MEDICACION

  // Para afectar el inventario general, hay que registrar movimientos en granja_movimientos.
  const registrarMovimiento = async (opts: {
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
  }

  const [fDesde, setFDesde] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  })
  const [fHasta, setFHasta] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [fQ, setFQ] = useState<string>('')
  const [fTipo, setFTipo] = useState<string>('TODOS')

  const [eventos, setEventos] = useState<any[]>([])

  const cargarCatalogos = async () => {
    const cRes = await supabase
      .from('granja_cerdas')
      .select('id,arete,nombre,estado,ubicacion_id,lote_id')
      .order('arete', { ascending: true })
    if (!cRes.error) setCerdas((cRes.data as Cerda[]) || [])

    const uRes = await supabase.from('granja_ubicaciones').select('id,codigo,nombre').order('codigo')
    if (!uRes.error) setUbicaciones((uRes.data as Ubicacion[]) || [])

    const lRes = await supabase.from('granja_lotes').select('id,codigo').order('codigo')
    if (!lRes.error) setLotes(((lRes.data as any[]) || []).map((x) => ({ id: x.id, codigo: x.codigo })))
  }

  const cargarEventos = async () => {
    setLoading(true)
    setMsg(null)
    try {
      let q = supabase
        .from('v_granja_cerda_eventos')
        .select('*')
        .gte('fecha', fDesde)
        .lte('fecha', fHasta)
        .order('fecha', { ascending: false })
        .limit(500)

      if (fTipo !== 'TODOS') q = q.eq('tipo', fTipo)
      if (fQ.trim()) {
        const s = fQ.trim()
        q = q.or(`arete.ilike.%${s}%,cerda_nombre.ilike.%${s}%`)
      }

      const r = await q
      if (r.error) throw r.error
      setEventos(r.data || [])
    } catch (e: any) {
      console.error(e)
      setMsg(e?.message ?? 'Error cargando eventos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
    cargarEventos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cerdaSel = useMemo(() => {
    const id = Number(cerdaId)
    if (!id) return null
    return cerdas.find((c) => c.id === id) ?? null
  }, [cerdaId, cerdas])

  const fechasSugeridas = useMemo(() => {
    if (!fecha) return { rev: '', parto: '' }
    const d = new Date(fecha + 'T00:00:00')
    const rev = new Date(d)
    rev.setDate(rev.getDate() + 21)

    const parto = new Date(d)
    parto.setDate(parto.getDate() + 115)

    return {
      rev: rev.toISOString().slice(0, 10),
      parto: parto.toISOString().slice(0, 10),
    }
  }, [fecha])

  const estadoSugerido = useMemo(() => {
    if (!tipo) return ''
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') return 'SERVIDA'
    if (tipo === 'REVISION_EMBARAZO') {
      if (resultado === 'POSITIVO') return 'PRENADA'
      if (resultado === 'NEGATIVO') return 'VACIA'
      return ''
    }
    if (tipo === 'PARTO') return 'LACTANDO'
    if (tipo === 'DESTETE') return 'DESTETADA'
    if (tipo === 'ABORTO') return 'ABORTO'
    if (tipo === 'MUERTE') return 'MUERTA'
    return ''
  }, [tipo, resultado])

  const limpiar = () => {
    setCerdaId('')
    setFecha(new Date().toISOString().slice(0, 10))
    setTipo('MONTA')
    setResultado('')
    setUbicacionId('')
    setLoteId('')
    setMacho('')
    setObs('')
    setNacidosVivos('')
    setNacidosMuertos('')
    setMomias('')
    setMedNombre('')
    setMedDosis('')
    setMedProxFecha('')
  }

  const guardarEvento = async () => {
    setMsg(null)

    if (!cerdaId) {
      alert('Selecciona una cerda.')
      return
    }
    if (!fecha) {
      alert('Selecciona la fecha.')
      return
    }
    if (!tipo) {
      alert('Selecciona el tipo.')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData?.user?.id ?? null

    // Validaciones de flujo (evitar eventos ilógicos)
    const h = await supabase
      .from('granja_cerda_eventos')
      .select('id,tipo,fecha,resultado')
      .eq('cerda_id', cerdaId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .limit(200)
    if (h.error) {
      alert(h.error.message)
      return
    }
    const hist = h.data || []
    const tieneMonta = hist.some((e) => e.tipo === 'MONTA' || e.tipo === 'INSEMINACION')
    const tieneParto = hist.some((e) => e.tipo === 'PARTO')

    if (tipo === 'REVISION_EMBARAZO' && !tieneMonta) {
      alert('No puedes registrar revisión de embarazo sin una monta/inseminación previa.')
      return
    }
    if (tipo === 'PARTO' && !tieneMonta) {
      alert('No puedes registrar parto sin una monta/inseminación previa.')
      return
    }
    if (tipo === 'DESTETE' && !tieneParto) {
      alert('No puedes registrar destete sin un parto previo.')
      return
    }
    if (tipo === 'REVISION_EMBARAZO' && resultado !== 'POSITIVO' && resultado !== 'NEGATIVO') {
      alert('En revisión de embarazo el resultado debe ser POSITIVO o NEGATIVO.')
      return
    }

    const datos: any = {}

    if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
      datos.macho = macho.trim() || null
    }

    if (tipo === 'PARTO') {
      const v = nacidosVivos === '' ? 0 : Number(nacidosVivos)
      const m = nacidosMuertos === '' ? 0 : Number(nacidosMuertos)
      const mo = momias === '' ? 0 : Number(momias)
      if (Number.isNaN(v) || Number.isNaN(m) || Number.isNaN(mo)) {
        alert('Valores de parto inválidos.')
        return
      }
      datos.nacidos_vivos = v
      datos.nacidos_muertos = m
      datos.momias = mo
      datos.total = v + m + mo
    }

    if (tipo === 'MEDICACION') {
      if (!medNombre.trim()) {
        alert('Nombre del medicamento es requerido.')
        return
      }
      datos.medicamento = medNombre.trim()
      datos.dosis = medDosis.trim() || null
      datos.proxima_fecha = medProxFecha || null
    }

    const payload = {
      cerda_id: Number(cerdaId),
      fecha,
      tipo,
      resultado: resultado || null,
      observaciones: obs.trim() || null,
      datos,
      user_id: userId,
    }

    const ins = await supabase.from('granja_cerda_eventos').insert(payload).select('id').single()

    if (ins.error) {
      console.error('Error guardando evento', ins.error)
      alert('No se pudo guardar el evento.')
      return
    }

    // Inventario: solo algunos eventos afectan conteo general.
    // - MUERTE: resta 1 en la ubicación
    // - PARTO: suma nacidos vivos en la ubicación
    try {
      const c = cerdas.find((x) => x.id === Number(cerdaId))
      const ubicacionFinal = ubicacionId ? Number(ubicacionId) : c?.ubicacion_id
      const loteFinal = loteId ? Number(loteId) : c?.lote_id

      if (tipo === 'MUERTE' && ubicacionFinal) {
        await registrarMovimiento({
          fecha,
          ubicacion_id: ubicacionFinal,
          lote_id: loteFinal ?? null,
          tipo: 'SALIDA_MUERTE',
          cantidad: -1,
          referencia_tabla: 'granja_cerda_eventos',
          referencia_id: ins.data.id,
          observaciones: 'MUERTE (cerdas)',
        })
      }

      if (tipo === 'PARTO' && ubicacionFinal) {
        const vivos = Number(datos?.nacidos_vivos ?? 0)
        if (vivos > 0) {
          await registrarMovimiento({
            fecha,
            ubicacion_id: ubicacionFinal,
            lote_id: loteFinal ?? null,
            tipo: 'ENTRADA_PARTO',
            cantidad: vivos,
            referencia_tabla: 'granja_cerda_eventos',
            referencia_id: ins.data.id,
            observaciones: 'PARTO (cerdas)',
          })
        }
      }
    } catch (e) {
      console.warn('Evento guardado, pero no se pudo afectar inventario:', e)
    }

    // actualizar estado sugerido
    if (estadoSugerido) {
      const payloadEstado: any = { estado: estadoSugerido }
      if (estadoSugerido === 'MUERTA') payloadEstado.activa = false

      const up = await supabase.from('granja_cerdas').update(payloadEstado).eq('id', cerdaId)
      if (up.error) console.warn('No se pudo actualizar estado de cerda', up.error)
    }

    alert('Evento guardado.')
    await cargarCatalogos()
    await cargarEventos()
    limpiar()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Granja — Eventos de cerdas</h1>
          <p className="text-sm text-gray-600">
            Monta / inseminación, revisión (21 días), parto (115 días), destete, aborto, medicación, muerte.
          </p>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ← Menú de Granja
        </Link>
      </div>

      {msg ? <div className="mb-4 p-3 rounded border bg-white text-sm">{msg}</div> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <h2 className="font-semibold mb-3">Registrar evento</h2>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
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
                      {c.arete} — {c.nombre} ({c.estado})
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={tipo}
                  onChange={(e) => {
                    const v = e.target.value as TipoEvento
                    setTipo(v)
                    if (v !== 'REVISION_EMBARAZO') setResultado('')
                  }}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Resultado (si aplica)</label>
                {tipo === 'REVISION_EMBARAZO' ? (
                  <select
                    className="w-full border rounded px-2 py-2"
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                  >
                    <option value="">— Selecciona —</option>
                    <option value="POSITIVO">POSITIVO</option>
                    <option value="NEGATIVO">NEGATIVO</option>
                  </select>
                ) : (
                  <input
                    className="w-full border rounded px-2 py-2"
                    placeholder={tipo === 'ABORTO' ? 'Causa / tipo' : 'Opcional'}
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                      {u.codigo} — {u.nombre ?? ''}
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

            {(tipo === 'MONTA' || tipo === 'INSEMINACION') ? (
              <div>
                <label className="text-sm font-medium">Macho (opcional)</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: M-330 o nombre del macho"
                  value={macho}
                  onChange={(e) => setMacho(e.target.value)}
                />
              </div>
            ) : null}

            {tipo === 'PARTO' ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Nacidos vivos</label>
                  <input
                    className="w-full border rounded px-2 py-2"
                    value={nacidosVivos}
                    onChange={(e) => setNacidosVivos(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Nacidos muertos</label>
                  <input
                    className="w-full border rounded px-2 py-2"
                    value={nacidosMuertos}
                    onChange={(e) => setNacidosMuertos(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Momias</label>
                  <input
                    className="w-full border rounded px-2 py-2"
                    value={momias}
                    onChange={(e) => setMomias(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {tipo === 'MEDICACION' ? (
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium">Medicamento</label>
                  <input
                    className="w-full border rounded px-2 py-2"
                    value={medNombre}
                    onChange={(e) => setMedNombre(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Dosis (opcional)</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={medDosis}
                      onChange={(e) => setMedDosis(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Próxima fecha (opcional)</label>
                    <input
                      type="date"
                      className="w-full border rounded px-2 py-2"
                      value={medProxFecha}
                      onChange={(e) => setMedProxFecha(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium">Observaciones</label>
              <textarea
                className="w-full border rounded px-2 py-2"
                rows={4}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>

            {(tipo === 'MONTA' || tipo === 'INSEMINACION') && fecha ? (
              <div className="border rounded p-3 bg-gray-50 text-sm">
                <div className="font-medium mb-1">Fechas sugeridas</div>
                <div>• Revisión embarazo (día 21): <b>{fechasSugeridas.rev}</b></div>
                <div>• Parto (día 115): <b>{fechasSugeridas.parto}</b></div>
              </div>
            ) : null}

            <div className="text-sm">
              Estado sugerido para la cerda: <b>{estadoSugerido || '—'}</b>
            </div>

            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={guardarEvento}
              >
                Guardar evento
              </button>

              <button className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={limpiar}>
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Eventos (historial)</h2>
            <button
              onClick={cargarEventos}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Recargar
            </button>
          </div>

          <div className="grid gap-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
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

            <div className="grid grid-cols-3 gap-2">
              <input
                className="border rounded px-2 py-2"
                placeholder="Buscar arete o nombre..."
                value={fQ}
                onChange={(e) => setFQ(e.target.value)}
              />

              <select
                className="border rounded px-2 py-2"
                value={fTipo}
                onChange={(e) => setFTipo(e.target.value)}
              >
                <option value="TODOS">Todos los tipos</option>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              <button
                onClick={cargarEventos}
                className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
              >
                Aplicar filtros
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-600 mb-2">
            {loading ? 'Cargando...' : `Mostrando: ${eventos.length}`}
          </div>

          <div className="border rounded overflow-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-2 text-left">Fecha</th>
                  <th className="border px-2 py-2 text-left">Cerda</th>
                  <th className="border px-2 py-2 text-left">Tipo</th>
                  <th className="border px-2 py-2 text-left">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 ? (
                  <tr>
                    <td className="border px-2 py-4 text-center text-gray-600" colSpan={4}>
                      No hay eventos con esos filtros.
                    </td>
                  </tr>
                ) : (
                  eventos.map((e: any) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-2">{e.fecha}</td>
                      <td className="border px-2 py-2">
                        {e.arete || ''} {e.cerda_nombre ? `— ${e.cerda_nombre}` : ''}
                      </td>
                      <td className="border px-2 py-2">{e.tipo}</td>
                      <td className="border px-2 py-2">{e.resultado ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            Nota: esta pantalla registra historial por cerda (tabla granja_cerda_eventos) y puede actualizar el estado de granja_cerdas.
          </div>
        </section>
      </div>
    </div>
  )
}
