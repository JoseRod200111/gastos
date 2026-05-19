'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  activa: boolean
}

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
}

type TipoEvento =
  | 'MONTA'
  | 'INSEMINACION'
  | 'REVISION_EMBARAZO'
  | 'PARTO'
  | 'DESTETE'
  | 'ABORTO'
  | 'MEDICACION'
  | 'MUERTE'
  | 'DESCARTE'

type EventoHistorial = {
  id: number
  tipo: string
  fecha: string
  resultado: string | null
}

type EventoVista = {
  id: number
  fecha: string
  tipo: string
  resultado: string | null
  arete: string | null
  cerda_nombre: string | null
}

const TIPOS: { value: TipoEvento; label: string }[] = [
  { value: 'MONTA', label: 'Monta natural' },
  { value: 'INSEMINACION', label: 'Inseminación artificial' },
  { value: 'REVISION_EMBARAZO', label: 'Revisión de embarazo' },
  { value: 'PARTO', label: 'Parto' },
  { value: 'DESTETE', label: 'Destete' },
  { value: 'ABORTO', label: 'Aborto' },
  { value: 'MEDICACION', label: 'Medicación' },
  { value: 'MUERTE', label: 'Muerte' },
  { value: 'DESCARTE', label: 'Descarte / baja' },
]

const EVENTOS_QUE_CIERRAN_CICLO = ['PARTO', 'DESTETE', 'ABORTO', 'MUERTE', 'DESCARTE']

export default function GranjaCerdasEventosPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])

  const [cerdaId, setCerdaId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [tipo, setTipo] = useState<TipoEvento>('MONTA')
  const [resultado, setResultado] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [loteId, setLoteId] = useState('')
  const [macho, setMacho] = useState('')
  const [obs, setObs] = useState('')

  const [nacidosVivos, setNacidosVivos] = useState('')
  const [nacidosMuertos, setNacidosMuertos] = useState('')
  const [momias, setMomias] = useState('')

  const [medNombre, setMedNombre] = useState('')
  const [medDosis, setMedDosis] = useState('')
  const [medProxFecha, setMedProxFecha] = useState('')

  const [fDesde, setFDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  })
  const [fHasta, setFHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [fQ, setFQ] = useState('')
  const [fTipo, setFTipo] = useState('TODOS')

  const [eventos, setEventos] = useState<EventoVista[]>([])

  const cerdaSeleccionada = useMemo(() => {
    const id = Number(cerdaId)
    if (!id) return null
    return cerdas.find((c) => c.id === id) ?? null
  }, [cerdaId, cerdas])

  const fechasSugeridas = useMemo(() => {
    if (!fecha) return { revision: '', parto: '' }

    const base = new Date(`${fecha}T00:00:00`)
    const revision = new Date(base)
    const parto = new Date(base)

    revision.setDate(revision.getDate() + 21)
    parto.setDate(parto.getDate() + 115)

    return {
      revision: revision.toISOString().slice(0, 10),
      parto: parto.toISOString().slice(0, 10),
    }
  }, [fecha])

  const estadoSugerido = useMemo(() => {
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
    if (tipo === 'DESCARTE') return 'BAJA'

    return ''
  }, [tipo, resultado])

  const cargarCatalogos = async () => {
    const cRes = await supabase
      .from('granja_cerdas')
      .select('id,arete,nombre,estado,ubicacion_id,lote_id,activa')
      .order('arete', { ascending: true })

    if (!cRes.error) {
      setCerdas((cRes.data ?? []) as Cerda[])
    }

    const uRes = await supabase
      .from('granja_ubicaciones')
      .select('id,codigo,nombre')
      .order('codigo', { ascending: true })

    if (!uRes.error) {
      setUbicaciones((uRes.data ?? []) as Ubicacion[])
    }

    const lRes = await supabase
      .from('granja_lotes')
      .select('id,codigo')
      .order('codigo', { ascending: true })

    if (!lRes.error) {
      setLotes((lRes.data ?? []) as Lote[])
    }
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

      if (fTipo !== 'TODOS') {
        q = q.eq('tipo', fTipo)
      }

      if (fQ.trim()) {
        const s = fQ.trim()
        q = q.or(`arete.ilike.%${s}%,cerda_nombre.ilike.%${s}%`)
      }

      const res = await q

      if (res.error) throw res.error

      setEventos((res.data ?? []) as EventoVista[])
    } catch (error) {
      console.error('Error cargando eventos', error)
      setMsg('Error cargando eventos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarCatalogos()
    cargarEventos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const obtenerHistorial = async (idCerda: number) => {
    const res = await supabase
      .from('granja_cerda_eventos')
      .select('id,tipo,fecha,resultado')
      .eq('cerda_id', idCerda)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .limit(300)

    if (res.error) throw res.error

    return (res.data ?? []) as EventoHistorial[]
  }

  const existeEventoDespuesDeCorte = (
    historial: EventoHistorial[],
    tiposBuscados: string[],
    tiposCorte: string[]
  ) => {
    for (const evento of historial) {
      if (tiposBuscados.includes(evento.tipo)) return true
      if (tiposCorte.includes(evento.tipo)) return false
    }

    return false
  }

  const ultimaRevisionDespuesDeServicio = (historial: EventoHistorial[]) => {
    for (const evento of historial) {
      if (evento.tipo === 'REVISION_EMBARAZO') return evento.resultado
      if (evento.tipo === 'MONTA' || evento.tipo === 'INSEMINACION') return null
      if (EVENTOS_QUE_CIERRAN_CICLO.includes(evento.tipo)) return null
    }

    return null
  }

  const validarFlujo = (historial: EventoHistorial[]) => {
    const tieneServicioVigente = existeEventoDespuesDeCorte(
      historial,
      ['MONTA', 'INSEMINACION'],
      EVENTOS_QUE_CIERRAN_CICLO
    )

    const tienePartoVigente = existeEventoDespuesDeCorte(
      historial,
      ['PARTO'],
      ['DESTETE', 'MUERTE', 'DESCARTE']
    )

    if (tipo === 'REVISION_EMBARAZO' && !tieneServicioVigente) {
      throw new Error('No puedes registrar revisión de embarazo sin una monta o inseminación previa.')
    }

    if (tipo === 'PARTO' && !tieneServicioVigente) {
      throw new Error('No puedes registrar parto sin una monta o inseminación previa.')
    }

    if (tipo === 'PARTO') {
      const revision = ultimaRevisionDespuesDeServicio(historial)

      if (revision === 'NEGATIVO') {
        throw new Error('No puedes registrar parto porque la última revisión de embarazo fue NEGATIVA.')
      }
    }

    if (tipo === 'DESTETE' && !tienePartoVigente) {
      throw new Error('No puedes registrar destete sin un parto previo.')
    }

    if (tipo === 'REVISION_EMBARAZO' && resultado !== 'POSITIVO' && resultado !== 'NEGATIVO') {
      throw new Error('Selecciona POSITIVO o NEGATIVO en la revisión de embarazo.')
    }

    if ((tipo === 'MUERTE' || tipo === 'DESCARTE') && cerdaSeleccionada?.activa === false) {
      throw new Error('Esta cerda ya está inactiva.')
    }
  }

  const crearMovimientoInventario = async (opts: {
    fecha: string
    ubicacion_id: number
    lote_id: number | null
    tipo: 'ENTRADA_PARTO' | 'SALIDA_MUERTE' | 'AJUSTE'
    cantidad: number
    referencia_id: number
    observaciones: string
  }) => {
    const { data: userData } = await supabase.auth.getUser()

    const res = await supabase.from('granja_movimientos').insert([
      {
        fecha: opts.fecha,
        ubicacion_id: opts.ubicacion_id,
        lote_id: opts.lote_id,
        tipo: opts.tipo,
        cantidad: opts.cantidad,
        hembras: null,
        machos: null,
        peso_total_kg: null,
        referencia_tabla: 'granja_cerda_eventos',
        referencia_id: opts.referencia_id,
        user_id: userData?.user?.id ?? null,
        observaciones: opts.observaciones,
      },
    ])

    if (res.error) throw res.error
  }

  const guardarEvento = async () => {
    setMsg(null)

    try {
      setGuardando(true)

      if (!cerdaId) throw new Error('Selecciona una cerda.')
      if (!fecha) throw new Error('Selecciona la fecha.')
      if (!tipo) throw new Error('Selecciona el tipo de evento.')
      if (!cerdaSeleccionada) throw new Error('La cerda seleccionada no existe o no cargó correctamente.')

      const idCerda = Number(cerdaId)
      const historial = await obtenerHistorial(idCerda)

      validarFlujo(historial)

      const datos: Record<string, string | number | null> = {}

      if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
        datos.macho = macho.trim() || null
      }

      if (tipo === 'PARTO') {
        const vivos = nacidosVivos === '' ? 0 : Number(nacidosVivos)
        const muertos = nacidosMuertos === '' ? 0 : Number(nacidosMuertos)
        const momiasNum = momias === '' ? 0 : Number(momias)

        if (!Number.isFinite(vivos) || vivos < 0) throw new Error('Nacidos vivos inválido.')
        if (!Number.isFinite(muertos) || muertos < 0) throw new Error('Nacidos muertos inválido.')
        if (!Number.isFinite(momiasNum) || momiasNum < 0) throw new Error('Momias inválido.')

        datos.nacidos_vivos = vivos
        datos.nacidos_muertos = muertos
        datos.momias = momiasNum
        datos.total = vivos + muertos + momiasNum
      }

      if (tipo === 'MEDICACION') {
        if (!medNombre.trim()) throw new Error('El nombre del medicamento es requerido.')

        datos.medicamento = medNombre.trim()
        datos.dosis = medDosis.trim() || null
        datos.proxima_fecha = medProxFecha || null
      }

      const ubicacionFinal = ubicacionId
        ? Number(ubicacionId)
        : cerdaSeleccionada.ubicacion_id

      const loteFinal = loteId
        ? Number(loteId)
        : cerdaSeleccionada.lote_id

      if ((tipo === 'PARTO' || tipo === 'MUERTE' || tipo === 'DESCARTE') && !ubicacionFinal) {
        throw new Error('Este evento necesita una ubicación para afectar inventario.')
      }

      const { data: userData } = await supabase.auth.getUser()

      const insertEvento = await supabase
        .from('granja_cerda_eventos')
        .insert([
          {
            cerda_id: idCerda,
            fecha,
            tipo,
            resultado: resultado || null,
            ubicacion_id: ubicacionFinal ?? null,
            lote_id: loteFinal ?? null,
            datos,
            observaciones: obs.trim() || null,
            user_id: userData?.user?.id ?? null,
          },
        ])
        .select('id')
        .single()

      if (insertEvento.error) throw insertEvento.error

      const eventoId = Number(insertEvento.data.id)

      try {
        if (tipo === 'PARTO') {
          const vivos = Number(datos.nacidos_vivos ?? 0)

          if (vivos > 0 && ubicacionFinal) {
            await crearMovimientoInventario({
              fecha,
              ubicacion_id: ubicacionFinal,
              lote_id: loteFinal ?? null,
              tipo: 'ENTRADA_PARTO',
              cantidad: vivos,
              referencia_id: eventoId,
              observaciones: `PARTO CERDA ${cerdaSeleccionada.arete}`,
            })
          }
        }

        if (tipo === 'MUERTE' && ubicacionFinal) {
          await crearMovimientoInventario({
            fecha,
            ubicacion_id: ubicacionFinal,
            lote_id: loteFinal ?? null,
            tipo: 'SALIDA_MUERTE',
            cantidad: 1,
            referencia_id: eventoId,
            observaciones: `MUERTE CERDA ${cerdaSeleccionada.arete}`,
          })
        }

        if (tipo === 'DESCARTE' && ubicacionFinal) {
          await crearMovimientoInventario({
            fecha,
            ubicacion_id: ubicacionFinal,
            lote_id: loteFinal ?? null,
            tipo: 'AJUSTE',
            cantidad: -1,
            referencia_id: eventoId,
            observaciones: `DESCARTE CERDA ${cerdaSeleccionada.arete}`,
          })
        }
      } catch (movError) {
        await supabase.from('granja_cerda_eventos').delete().eq('id', eventoId)
        throw movError
      }

      const patchCerda: Partial<Cerda> = {}

      if (estadoSugerido) {
        patchCerda.estado = estadoSugerido
      }

      if (ubicacionId) {
        patchCerda.ubicacion_id = Number(ubicacionId)
      }

      if (loteId) {
        patchCerda.lote_id = Number(loteId)
      }

      if (tipo === 'MUERTE' || tipo === 'DESCARTE') {
        patchCerda.activa = false
      }

      if (Object.keys(patchCerda).length > 0) {
        const updateCerda = await supabase
          .from('granja_cerdas')
          .update(patchCerda)
          .eq('id', idCerda)

        if (updateCerda.error) throw updateCerda.error
      }

      setMsg('Evento guardado correctamente.')
      await cargarCatalogos()
      await cargarEventos()
      limpiar()
    } catch (error) {
      console.error('Error guardando evento', error)
      const message = error instanceof Error ? error.message : 'No se pudo guardar el evento.'
      setMsg(message)
      alert(message)
    } finally {
      setGuardando(false)
    }
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
            Registro de monta, revisión, parto, destete, aborto, medicación, muerte y descarte.
          </p>
        </div>

        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ← Menú de Granja
        </Link>
      </div>

      {msg ? (
        <div className="mb-4 p-3 rounded border bg-white text-sm">
          {msg}
        </div>
      ) : null}

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
                      {c.arete} — {c.nombre ?? 'Sin nombre'} ({c.estado})
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
                    const nuevoTipo = e.target.value as TipoEvento
                    setTipo(nuevoTipo)

                    if (nuevoTipo !== 'REVISION_EMBARAZO') {
                      setResultado('')
                    }

                    if (nuevoTipo !== 'PARTO') {
                      setNacidosVivos('')
                      setNacidosMuertos('')
                      setMomias('')
                    }

                    if (nuevoTipo !== 'MEDICACION') {
                      setMedNombre('')
                      setMedDosis('')
                      setMedProxFecha('')
                    }
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
                <label className="text-sm font-medium">Resultado</label>
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
                    placeholder="Opcional"
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Ubicación</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={ubicacionId}
                  onChange={(e) => setUbicacionId(e.target.value)}
                >
                  <option value="">— Usar ubicación actual —</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.codigo} — {u.nombre ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Lote</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={loteId}
                  onChange={(e) => setLoteId(e.target.value)}
                >
                  <option value="">— Usar lote actual —</option>
                  {lotes.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.codigo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {cerdaSeleccionada ? (
              <div className="text-xs border rounded p-2 bg-gray-50">
                Ubicación actual: {cerdaSeleccionada.ubicacion_id ?? '—'} | Lote actual:{' '}
                {cerdaSeleccionada.lote_id ?? '—'} | Estado actual: {cerdaSeleccionada.estado}
              </div>
            ) : null}

            {tipo === 'MONTA' || tipo === 'INSEMINACION' ? (
              <div>
                <label className="text-sm font-medium">Macho</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  placeholder="Ej: M-330"
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
                    type="number"
                    min="0"
                    className="w-full border rounded px-2 py-2"
                    value={nacidosVivos}
                    onChange={(e) => setNacidosVivos(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Nacidos muertos</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full border rounded px-2 py-2"
                    value={nacidosMuertos}
                    onChange={(e) => setNacidosMuertos(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Momias</label>
                  <input
                    type="number"
                    min="0"
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
                    <label className="text-sm font-medium">Dosis</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={medDosis}
                      onChange={(e) => setMedDosis(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Próxima fecha</label>
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
                <div>
                  Revisión embarazo: <b>{fechasSugeridas.revision}</b>
                </div>
                <div>
                  Parto: <b>{fechasSugeridas.parto}</b>
                </div>
              </div>
            ) : null}

            <div className="text-sm">
              Estado sugerido: <b>{estadoSugerido || '—'}</b>
            </div>

            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                onClick={guardarEvento}
                disabled={guardando}
              >
                {guardando ? 'Guardando...' : 'Guardar evento'}
              </button>

              <button
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                onClick={limpiar}
                disabled={guardando}
              >
                Limpiar
              </button>
            </div>
          </div>
        </section>

        <section className="border rounded-lg p-4 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Eventos registrados</h2>
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
                  eventos.map((evento) => (
                    <tr key={evento.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-2">{evento.fecha}</td>
                      <td className="border px-2 py-2">
                        {evento.arete || ''}{' '}
                        {evento.cerda_nombre ? `— ${evento.cerda_nombre}` : ''}
                      </td>
                      <td className="border px-2 py-2">{evento.tipo}</td>
                      <td className="border px-2 py-2">{evento.resultado ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
