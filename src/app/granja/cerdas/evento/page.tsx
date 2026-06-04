'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  activa: boolean
  paridad: number | null
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

type EventoRow = {
  id: number
  cerda_id: number
  fecha: string
  tipo: string
  resultado: string | null
  observaciones: string | null
  granja_cerdas?: {
    arete: string | null
    nombre: string | null
  } | null
}

const TIPOS_EVENTO = [
  'MONTA',
  'INSEMINACION',
  'REVISION_EMBARAZO',
  'PARTO',
  'DESTETE',
  'ABORTO',
  'MEDICACION',
  'MUERTE',
  'BAJA',
  'TRASLADO',
  'OTRO',
]

const RESULTADOS_REVISION = ['POSITIVO', 'NEGATIVO']

const ESTADOS_POR_EVENTO: Record<string, string | null> = {
  MONTA: 'SERVIDA',
  INSEMINACION: 'SERVIDA',
  REVISION_EMBARAZO: null,
  PARTO: 'LACTANDO',
  DESTETE: 'DESTETADA',
  ABORTO: 'ABORTO',
  MEDICACION: null,
  MUERTE: 'MUERTA',
  BAJA: 'BAJA',
  TRASLADO: null,
  OTRO: null,
}

const todayYYYYMMDD = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const sumarDias = (fecha: string, dias: number) => {
  if (!fecha) return ''

  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)

  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + dias)

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}`
}

const normalizar = (value: string | null | undefined) =>
  String(value || '').trim().toUpperCase()

const formatFecha = (fecha?: string | null) => {
  if (!fecha) return '—'
  return String(fecha).slice(0, 10)
}

const isCerdaDisponible = (cerda: Cerda, incluirInactivas: boolean) => {
  const estado = normalizar(cerda.estado)

  if (incluirInactivas) return true

  if (!cerda.activa) return false
  if (estado === 'MUERTA') return false
  if (estado === 'BAJA') return false

  return true
}

export default function EventoCerdaPage() {
  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [eventos, setEventos] = useState<EventoRow[]>([])

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [cerdaId, setCerdaId] = useState('')
  const [fecha, setFecha] = useState('')
  const [tipo, setTipo] = useState('MONTA')
  const [resultado, setResultado] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [loteId, setLoteId] = useState('')
  const [macho, setMacho] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [cerdaBusqueda, setCerdaBusqueda] = useState('')
  const [incluirInactivasSelector, setIncluirInactivasSelector] = useState(false)

  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    const hoy = todayYYYYMMDD()

    setFecha(hoy)
    setFiltroDesde(sumarDias(hoy, -14))
    setFiltroHasta(hoy)
  }, [])

  const cerdaSeleccionada = useMemo(() => {
    const id = Number(cerdaId || 0)
    if (!id) return null

    return cerdas.find((cerda) => Number(cerda.id) === id) || null
  }, [cerdaId, cerdas])

  const cerdasDisponiblesSelector = useMemo(() => {
    const q = cerdaBusqueda.trim().toLowerCase()

    return cerdas
      .filter((cerda) => isCerdaDisponible(cerda, incluirInactivasSelector))
      .filter((cerda) => {
        if (!q) return true

        const texto = [
          cerda.arete,
          cerda.nombre,
          cerda.estado,
          cerda.activa ? 'activa' : 'inactiva',
          cerda.paridad !== null && cerda.paridad !== undefined
            ? `paridad ${cerda.paridad}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return texto.includes(q)
      })
      .sort((a, b) =>
        String(a.arete || '').localeCompare(String(b.arete || ''), 'es', {
          numeric: true,
          sensitivity: 'base',
        })
      )
  }, [cerdas, cerdaBusqueda, incluirInactivasSelector])

  const ubicacionActualCerda = useMemo(() => {
    if (!cerdaSeleccionada?.ubicacion_id) return null

    return (
      ubicaciones.find(
        (ubicacion) =>
          Number(ubicacion.id) === Number(cerdaSeleccionada.ubicacion_id)
      ) || null
    )
  }, [cerdaSeleccionada, ubicaciones])

  const loteActualCerda = useMemo(() => {
    if (!cerdaSeleccionada?.lote_id) return null

    return (
      lotes.find((lote) => Number(lote.id) === Number(cerdaSeleccionada.lote_id)) ||
      null
    )
  }, [cerdaSeleccionada, lotes])

  const estadoSugerido = useMemo(() => {
    if (tipo === 'REVISION_EMBARAZO') {
      const r = normalizar(resultado)

      if (r === 'POSITIVO') return 'PRENADA'
      if (r === 'NEGATIVO') return 'VACIA'

      return null
    }

    return ESTADOS_POR_EVENTO[tipo] || null
  }, [tipo, resultado])

  const fechasSugeridas = useMemo(() => {
    if (!fecha) return []

    if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
      return [
        {
          label: 'Revisión embarazo',
          fecha: sumarDias(fecha, 21),
        },
        {
          label: 'Parto estimado',
          fecha: sumarDias(fecha, 115),
        },
      ]
    }

    if (tipo === 'PARTO') {
      return [
        {
          label: 'Destete sugerido',
          fecha: sumarDias(fecha, 21),
        },
      ]
    }

    if (tipo === 'DESTETE') {
      return [
        {
          label: 'Celo post-destete sugerido',
          fecha: sumarDias(fecha, 5),
        },
      ]
    }

    return []
  }, [fecha, tipo])

  const cargarCatalogos = useCallback(async () => {
    setLoading(true)
    setMsg(null)

    try {
      const [cRes, uRes, lRes] = await Promise.all([
        supabase
          .from('granja_cerdas')
          .select('id,arete,nombre,estado,ubicacion_id,lote_id,activa,paridad')
          .order('arete', { ascending: true }),

        supabase
          .from('granja_ubicaciones')
          .select('id,codigo,nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        supabase
          .from('granja_lotes')
          .select('id,codigo')
          .order('codigo', { ascending: true }),
      ])

      if (cRes.error) {
        console.error('Error cargando cerdas', cRes.error)
        throw new Error(`Error cargando cerdas: ${cRes.error.message}`)
      }

      if (uRes.error) {
        console.error('Error cargando ubicaciones', uRes.error)
        throw new Error(`Error cargando ubicaciones: ${uRes.error.message}`)
      }

      if (lRes.error) {
        console.error('Error cargando lotes', lRes.error)
      }

      setCerdas((cRes.data ?? []) as Cerda[])
      setUbicaciones((uRes.data ?? []) as Ubicacion[])
      setLotes((lRes.data ?? []) as Lote[])
    } catch (error) {
      console.error('Error cargando catálogos', error)

      const message =
        error instanceof Error ? error.message : 'Error cargando catálogos.'

      setMsg(message)
      alert(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarEventos = useCallback(async () => {
    if (!filtroDesde || !filtroHasta) return

    let query = supabase
      .from('granja_cerda_eventos')
      .select(
        `
        id,
        cerda_id,
        fecha,
        tipo,
        resultado,
        observaciones,
        granja_cerdas (
          arete,
          nombre
        )
      `
      )
      .gte('fecha', filtroDesde)
      .lte('fecha', filtroHasta)
      .order('fecha', { ascending: false })

    if (filtroTipo) {
      query = query.eq('tipo', filtroTipo)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error cargando eventos', error)
      setMsg(`Error cargando eventos: ${error.message}`)
      return
    }

    setEventos((data ?? []) as unknown as EventoRow[])
  }, [filtroDesde, filtroHasta, filtroTipo])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    if (filtroDesde && filtroHasta) {
      cargarEventos()
    }
  }, [filtroDesde, filtroHasta, filtroTipo, cargarEventos])

  const eventosFiltrados = useMemo(() => {
    const q = filtroBusqueda.trim().toLowerCase()

    if (!q) return eventos

    return eventos.filter((evento) => {
      const texto = [
        evento.fecha,
        evento.tipo,
        evento.resultado,
        evento.observaciones,
        evento.granja_cerdas?.arete,
        evento.granja_cerdas?.nombre,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return texto.includes(q)
    })
  }, [eventos, filtroBusqueda])

  const limpiarFormulario = () => {
    setCerdaId('')
    setFecha(todayYYYYMMDD())
    setTipo('MONTA')
    setResultado('')
    setUbicacionId('')
    setLoteId('')
    setMacho('')
    setObservaciones('')
    setMsg(null)
  }

  const validar = () => {
    if (!cerdaId) return 'Selecciona una cerda.'
    if (!fecha) return 'Selecciona una fecha.'
    if (!tipo) return 'Selecciona un tipo de evento.'

    if (tipo === 'REVISION_EMBARAZO') {
      const r = normalizar(resultado)

      if (r !== 'POSITIVO' && r !== 'NEGATIVO') {
        return 'Para revisión de embarazo, selecciona resultado POSITIVO o NEGATIVO.'
      }
    }

    return null
  }

  const guardarEvento = async () => {
    const errorValidacion = validar()

    if (errorValidacion) {
      alert(errorValidacion)
      return
    }

    const cerda = cerdaSeleccionada

    if (!cerda) {
      alert('No se encontró la cerda seleccionada.')
      return
    }

    setGuardando(true)
    setMsg(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ubicacionFinal = ubicacionId
        ? Number(ubicacionId)
        : cerda.ubicacion_id
          ? Number(cerda.ubicacion_id)
          : null

      const loteFinal = loteId
        ? Number(loteId)
        : cerda.lote_id
          ? Number(cerda.lote_id)
          : null

      const datos = {
        macho: macho.trim() || null,
        estado_anterior: cerda.estado,
        estado_sugerido: estadoSugerido,
        fechas_sugeridas: fechasSugeridas,
      }

      const { error: eventoError } = await supabase
        .from('granja_cerda_eventos')
        .insert({
          cerda_id: Number(cerdaId),
          fecha,
          tipo,
          resultado: resultado.trim() || null,
          ubicacion_id: ubicacionFinal,
          lote_id: loteFinal,
          datos,
          observaciones: observaciones.trim() || null,
          user_id: userId,
        })

      if (eventoError) {
        console.error('Error guardando evento', eventoError)
        alert(`No se pudo guardar el evento: ${eventoError.message}`)
        return
      }

      const updateCerda: {
        estado?: string
        ubicacion_id?: number | null
        lote_id?: number | null
        activa?: boolean
        updated_at: string
      } = {
        updated_at: new Date().toISOString(),
      }

      if (estadoSugerido) {
        updateCerda.estado = estadoSugerido
      }

      if (ubicacionFinal !== null) {
        updateCerda.ubicacion_id = ubicacionFinal
      }

      if (loteFinal !== null) {
        updateCerda.lote_id = loteFinal
      }

      if (tipo === 'MUERTE' || tipo === 'BAJA') {
        updateCerda.activa = false
      }

      const { error: updateError } = await supabase
        .from('granja_cerdas')
        .update(updateCerda)
        .eq('id', Number(cerdaId))

      if (updateError) {
        console.error('Error actualizando cerda', updateError)
        alert(
          `El evento fue registrado, pero no se pudo actualizar el estado de la cerda: ${updateError.message}`
        )
      }

      if (tipo === 'MUERTE') {
        if (!ubicacionFinal) {
          alert(
            'El evento fue registrado, pero no se registró salida de inventario porque la cerda no tiene ubicación.'
          )
        } else {
          const { error: movError } = await supabase
            .from('granja_movimientos')
            .insert({
              fecha: `${fecha}T12:00:00.000Z`,
              ubicacion_id: ubicacionFinal,
              tipo: 'SALIDA_MUERTE',
              cantidad: 1,
              hembras: 1,
              machos: 0,
              referencia_tabla: 'granja_cerdas',
              referencia_id: Number(cerdaId),
              user_id: userId,
              observaciones: `MUERTE CERDA ARETE ${cerda.arete}. ${
                observaciones.trim() || ''
              }`,
            })

          if (movError) {
            console.error('Error registrando salida por muerte', movError)
            alert(
              `El evento fue registrado, pero no se pudo registrar la salida de inventario: ${movError.message}`
            )
          }
        }
      }

      if (tipo === 'BAJA') {
        if (!ubicacionFinal) {
          alert(
            'El evento fue registrado, pero no se registró ajuste de inventario porque la cerda no tiene ubicación.'
          )
        } else {
          const { error: movError } = await supabase
            .from('granja_movimientos')
            .insert({
              fecha: `${fecha}T12:00:00.000Z`,
              ubicacion_id: ubicacionFinal,
              tipo: 'AJUSTE',
              cantidad: -1,
              hembras: -1,
              machos: 0,
              referencia_tabla: 'granja_cerdas',
              referencia_id: Number(cerdaId),
              user_id: userId,
              observaciones: `BAJA CERDA ARETE ${cerda.arete}. ${
                observaciones.trim() || ''
              }`,
            })

          if (movError) {
            console.error('Error registrando baja en inventario', movError)
            alert(
              `El evento fue registrado, pero no se pudo registrar el ajuste de inventario: ${movError.message}`
            )
          }
        }
      }

      alert('Evento guardado correctamente.')

      limpiarFormulario()
      await cargarCatalogos()
      await cargarEventos()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={150} height={60} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Granja — Eventos de cerdas</h1>
          <p className="text-xs text-gray-600">
            Registro de monta, revisión, parto, destete, aborto, medicación,
            muerte y descarte.
          </p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      {msg ? (
        <div className="border rounded bg-red-50 text-red-800 text-sm p-3 mb-4">
          {msg}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Registrar evento</h2>

            <button
              type="button"
              onClick={cargarCatalogos}
              disabled={loading}
              className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white text-xs disabled:opacity-60"
            >
              {loading ? 'Cargando...' : 'Recargar cerdas'}
            </button>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Buscar cerda</label>
                <input
                  className="w-full border rounded px-2 py-2 mb-2"
                  placeholder="Arete, nombre o estado"
                  value={cerdaBusqueda}
                  onChange={(e) => setCerdaBusqueda(e.target.value)}
                />

                <label className="block text-xs font-semibold mb-1">Cerda</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={cerdaId}
                  onChange={(e) => setCerdaId(e.target.value)}
                >
                  <option value="">
                    {cerdasDisponiblesSelector.length === 0
                      ? 'No hay cerdas con este filtro'
                      : '— Selecciona —'}
                  </option>

                  {cerdasDisponiblesSelector.map((cerda) => (
                    <option key={cerda.id} value={String(cerda.id)}>
                      {cerda.arete} — {cerda.nombre ?? 'Sin nombre'} —{' '}
                      {cerda.estado} — {cerda.activa ? 'Activa' : 'Inactiva'}
                    </option>
                  ))}
                </select>

                <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={incluirInactivasSelector}
                    onChange={(e) => setIncluirInactivasSelector(e.target.checked)}
                  />
                  Incluir inactivas / bajas en el selector
                </label>

                <div className="text-[11px] text-gray-500 mt-1">
                  Cerdas cargadas: {cerdas.length} · Disponibles con filtro:{' '}
                  {cerdasDisponiblesSelector.length}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Fecha</label>
                <input
                  type="date"
                  className="w-full border rounded px-2 py-2"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />

                {cerdaSeleccionada ? (
                  <div className="mt-3 border rounded bg-gray-50 p-2 text-xs">
                    <div>
                      <b>Seleccionada:</b> {cerdaSeleccionada.arete} —{' '}
                      {cerdaSeleccionada.nombre || 'Sin nombre'}
                    </div>
                    <div>
                      <b>Estado:</b> {cerdaSeleccionada.estado}
                    </div>
                    <div>
                      <b>Activa:</b> {cerdaSeleccionada.activa ? 'Sí' : 'No'}
                    </div>
                    <div>
                      <b>Paridad:</b> {cerdaSeleccionada.paridad ?? 0}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipo</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value)
                    setResultado('')
                  }}
                >
                  {TIPOS_EVENTO.map((tipoEvento) => (
                    <option key={tipoEvento} value={tipoEvento}>
                      {tipoEvento}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Resultado</label>

                {tipo === 'REVISION_EMBARAZO' ? (
                  <select
                    className="w-full border rounded px-2 py-2"
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                  >
                    <option value="">— Selecciona —</option>
                    {RESULTADOS_REVISION.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border rounded px-2 py-2"
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                    placeholder="Opcional"
                  />
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Ubicación</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={ubicacionId}
                  onChange={(e) => setUbicacionId(e.target.value)}
                >
                  <option value="">— Usar ubicación actual —</option>
                  {ubicaciones.map((ubicacion) => (
                    <option key={ubicacion.id} value={ubicacion.id}>
                      {ubicacion.codigo}
                      {ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}
                    </option>
                  ))}
                </select>

                {ubicacionActualCerda ? (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Actual:{' '}
                    {ubicacionActualCerda.codigo}
                    {ubicacionActualCerda.nombre
                      ? ` — ${ubicacionActualCerda.nombre}`
                      : ''}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Lote</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={loteId}
                  onChange={(e) => setLoteId(e.target.value)}
                >
                  <option value="">— Usar lote actual —</option>
                  {lotes.map((lote) => (
                    <option key={lote.id} value={lote.id}>
                      {lote.codigo}
                    </option>
                  ))}
                </select>

                {loteActualCerda ? (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Actual: {loteActualCerda.codigo}
                  </div>
                ) : null}
              </div>
            </div>

            {tipo === 'MONTA' || tipo === 'INSEMINACION' ? (
              <div>
                <label className="block text-xs font-semibold mb-1">Macho</label>
                <input
                  className="w-full border rounded px-2 py-2"
                  value={macho}
                  onChange={(e) => setMacho(e.target.value)}
                  placeholder="Ej: M-330"
                />
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-semibold mb-1">Observaciones</label>
              <textarea
                className="w-full border rounded px-2 py-2 min-h-[90px]"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </div>

            {fechasSugeridas.length > 0 ? (
              <div className="border rounded bg-gray-50 p-3 text-xs">
                <div className="font-semibold mb-1">Fechas sugeridas</div>

                {fechasSugeridas.map((item) => (
                  <div key={item.label}>
                    {item.label}: <b>{item.fecha}</b>
                  </div>
                ))}
              </div>
            ) : null}

            {estadoSugerido ? (
              <div className="text-sm">
                Estado sugerido:{' '}
                <span className="font-semibold">{estadoSugerido}</span>
              </div>
            ) : null}

            <div className="border rounded bg-slate-50 p-3 text-xs text-slate-700">
              <b>Nota:</b> MUERTE registra una salida de inventario con tipo
              SALIDA_MUERTE y cantidad 1. BAJA registra un AJUSTE con cantidad -1.
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={guardarEvento}
                disabled={guardando || loading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
              >
                {guardando ? 'Guardando...' : 'Guardar evento'}
              </button>

              <button
                type="button"
                onClick={limpiarFormulario}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Eventos registrados</h2>

            <button
              type="button"
              onClick={cargarEventos}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
            >
              Recargar
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-3 text-sm">
            <div>
              <label className="block text-xs font-semibold mb-1">Desde</label>
              <input
                type="date"
                className="border rounded p-2 w-full"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Hasta</label>
              <input
                type="date"
                className="border rounded p-2 w-full"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_150px_130px] gap-2 mb-3 text-sm">
            <input
              className="border rounded p-2 w-full"
              placeholder="Buscar arete o nombre"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
            />

            <select
              className="border rounded p-2 w-full"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {TIPOS_EVENTO.map((tipoEvento) => (
                <option key={tipoEvento} value={tipoEvento}>
                  {tipoEvento}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={cargarEventos}
              className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded"
            >
              Aplicar filtros
            </button>
          </div>

          <div className="text-xs text-gray-600 mb-2">
            Mostrando: {eventosFiltrados.length}
          </div>

          <div className="border rounded overflow-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-200 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Cerda</th>
                  <th className="p-2 text-left">Tipo</th>
                </tr>
              </thead>

              <tbody>
                {eventosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-3 text-gray-500">
                      No hay eventos registrados con esos filtros.
                    </td>
                  </tr>
                ) : (
                  eventosFiltrados.map((evento) => (
                    <tr key={evento.id} className="border-t">
                      <td className="p-2">{formatFecha(evento.fecha)}</td>
                      <td className="p-2">
                        {evento.granja_cerdas?.arete || '—'}
                        {evento.granja_cerdas?.nombre
                          ? ` — ${evento.granja_cerdas.nombre}`
                          : ''}
                      </td>
                      <td className="p-2">{evento.tipo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            
          </div>
        </div>
      </div>
    </div>
  )
}
