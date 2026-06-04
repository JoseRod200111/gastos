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

const restarDias = (fecha: string, dias: number) => {
  if (!fecha) return ''

  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)

  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - dias)

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

const toInt = (value: string) => {
  const clean = String(value || '').trim()
  if (clean === '') return 0

  const n = Number(clean)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

const toNumOrNull = (value: string) => {
  const clean = String(value || '').trim()
  if (clean === '') return null

  const n = Number(clean)
  return Number.isFinite(n) ? n : NaN
}

const fechaTimestamp = (fecha: string) => `${fecha}T12:00:00.000Z`

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
  const [ubicacionId, setUbicacionId] = useState('')
  const [loteId, setLoteId] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [cerdaBusqueda, setCerdaBusqueda] = useState('')
  const [incluirInactivasSelector, setIncluirInactivasSelector] = useState(false)

  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [filtroBusqueda, setFiltroBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  const [macho, setMacho] = useState('')
  const [revisionResultado, setRevisionResultado] = useState('')

  const [partoVivos, setPartoVivos] = useState('')
  const [partoMuertos, setPartoMuertos] = useState('')
  const [partoMomias, setPartoMomias] = useState('')
  const [partoHembras, setPartoHembras] = useState('')
  const [partoMachos, setPartoMachos] = useState('')
  const [partoPesoCamadaKg, setPartoPesoCamadaKg] = useState('')

  const [desteteCantidad, setDesteteCantidad] = useState('')
  const [desteteHembras, setDesteteHembras] = useState('')
  const [desteteMachos, setDesteteMachos] = useState('')
  const [destetePesoTotalKg, setDestetePesoTotalKg] = useState('')
  const [desteteDestinoId, setDesteteDestinoId] = useState('')

  const [abortoFetos, setAbortoFetos] = useState('')
  const [abortoMotivo, setAbortoMotivo] = useState('')

  const [medicamento, setMedicamento] = useState('')
  const [dosis, setDosis] = useState('')
  const [viaAplicacion, setViaAplicacion] = useState('')
  const [responsable, setResponsable] = useState('')

  const [muerteMotivo, setMuerteMotivo] = useState('')
  const [bajaMotivo, setBajaMotivo] = useState('')

  const [trasladoDestinoId, setTrasladoDestinoId] = useState('')

  const [modoRegularizarPrenada, setModoRegularizarPrenada] = useState(false)
  const [fechaPartoEstimada, setFechaPartoEstimada] = useState('')
  const [fechaMontaEstimada, setFechaMontaEstimada] = useState('')
  const [tipoServicioEstimado, setTipoServicioEstimado] = useState<
    'MONTA' | 'INSEMINACION'
  >('MONTA')

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
      if (revisionResultado === 'POSITIVO') return 'PRENADA'
      if (revisionResultado === 'NEGATIVO') return 'VACIA'
      return null
    }

    return ESTADOS_POR_EVENTO[tipo] || null
  }, [tipo, revisionResultado])

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

  const puedeRegularizarPrenada = useMemo(() => {
    if (!cerdaSeleccionada) return false
    return normalizar(cerdaSeleccionada.estado) === 'PRENADA'
  }, [cerdaSeleccionada])

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
        throw new Error(`Error cargando cerdas: ${cRes.error.message}`)
      }

      if (uRes.error) {
        throw new Error(`Error cargando ubicaciones: ${uRes.error.message}`)
      }

      if (lRes.error) {
        console.error('Error cargando lotes', lRes.error)
      }

      setCerdas((cRes.data ?? []) as Cerda[])
      setUbicaciones((uRes.data ?? []) as Ubicacion[])
      setLotes((lRes.data ?? []) as Lote[])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error cargando catálogos.'

      console.error(error)
      setMsg(message)
      alert(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const cargarEventos = useCallback(async () => {
    if (!filtroDesde || !filtroHasta) return

    setMsg(null)

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

  const limpiarCamposEvento = () => {
    setRevisionResultado('')
    setMacho('')

    setPartoVivos('')
    setPartoMuertos('')
    setPartoMomias('')
    setPartoHembras('')
    setPartoMachos('')
    setPartoPesoCamadaKg('')

    setDesteteCantidad('')
    setDesteteHembras('')
    setDesteteMachos('')
    setDestetePesoTotalKg('')
    setDesteteDestinoId('')

    setAbortoFetos('')
    setAbortoMotivo('')

    setMedicamento('')
    setDosis('')
    setViaAplicacion('')
    setResponsable('')

    setMuerteMotivo('')
    setBajaMotivo('')
    setTrasladoDestinoId('')
  }

  const limpiarFormulario = () => {
    setCerdaId('')
    setFecha(todayYYYYMMDD())
    setTipo('MONTA')
    setUbicacionId('')
    setLoteId('')
    setObservaciones('')
    setMsg(null)
    setModoRegularizarPrenada(false)
    setFechaPartoEstimada('')
    setFechaMontaEstimada('')
    setTipoServicioEstimado('MONTA')
    limpiarCamposEvento()
  }

  const validar = () => {
    if (!cerdaId) return 'Selecciona una cerda.'
    if (!fecha) return 'Selecciona una fecha.'
    if (!tipo) return 'Selecciona un tipo de evento.'

    if (tipo === 'REVISION_EMBARAZO') {
      if (revisionResultado !== 'POSITIVO' && revisionResultado !== 'NEGATIVO') {
        return 'Selecciona si la revisión fue POSITIVO o NEGATIVO.'
      }
    }

    if (tipo === 'PARTO') {
      const vivos = toInt(partoVivos)
      const muertos = toInt(partoMuertos)
      const momias = toInt(partoMomias)
      const hembras = toInt(partoHembras)
      const machos = toInt(partoMachos)
      const peso = toNumOrNull(partoPesoCamadaKg)

      if ([vivos, muertos, momias, hembras, machos].some((n) => Number.isNaN(n))) {
        return 'Los datos del parto deben ser números válidos.'
      }

      if ([vivos, muertos, momias, hembras, machos].some((n) => n < 0)) {
        return 'Los datos del parto no pueden ser negativos.'
      }

      if (peso !== null && Number.isNaN(peso)) {
        return 'El peso de camada debe ser válido.'
      }

      if (vivos + muertos + momias <= 0) {
        return 'Ingresa al menos un nacido vivo, muerto o momia.'
      }

      if (hembras + machos > vivos) {
        return 'Hembras + machos no puede ser mayor que nacidos vivos.'
      }
    }

    if (tipo === 'DESTETE') {
      const cantidad = toInt(desteteCantidad)
      const hembras = toInt(desteteHembras)
      const machos = toInt(desteteMachos)
      const peso = toNumOrNull(destetePesoTotalKg)

      if ([cantidad, hembras, machos].some((n) => Number.isNaN(n))) {
        return 'Los datos del destete deben ser números válidos.'
      }

      if ([cantidad, hembras, machos].some((n) => n < 0)) {
        return 'Los datos del destete no pueden ser negativos.'
      }

      if (cantidad <= 0) {
        return 'Ingresa la cantidad de lechones destetados.'
      }

      if (hembras + machos > cantidad) {
        return 'Hembras + machos no puede ser mayor que la cantidad destetada.'
      }

      if (peso !== null && Number.isNaN(peso)) {
        return 'El peso total de destete debe ser válido.'
      }
    }

    if (tipo === 'ABORTO') {
      const fetos = toInt(abortoFetos)

      if (Number.isNaN(fetos)) return 'El número de fetos debe ser válido.'
      if (fetos < 0) return 'El número de fetos no puede ser negativo.'
    }

    if (tipo === 'MEDICACION') {
      if (!medicamento.trim()) return 'Ingresa el medicamento aplicado.'
    }

    if (tipo === 'MUERTE') {
      if (!muerteMotivo.trim()) return 'Ingresa el motivo de muerte.'
    }

    if (tipo === 'BAJA') {
      if (!bajaMotivo.trim()) return 'Ingresa el motivo de baja.'
    }

    if (tipo === 'TRASLADO') {
      if (!trasladoDestinoId) return 'Selecciona la ubicación destino del traslado.'

      if (
        cerdaSeleccionada?.ubicacion_id &&
        Number(trasladoDestinoId) === Number(cerdaSeleccionada.ubicacion_id)
      ) {
        return 'El destino no puede ser igual a la ubicación actual.'
      }
    }

    return null
  }

  const getResultadoEvento = () => {
    if (tipo === 'REVISION_EMBARAZO') return revisionResultado
    if (tipo === 'PARTO') return 'REGISTRADO'
    if (tipo === 'DESTETE') return 'REGISTRADO'
    if (tipo === 'ABORTO') return 'REGISTRADO'
    if (tipo === 'MEDICACION') return 'APLICADA'
    if (tipo === 'MUERTE') return 'COMPLETADA'
    if (tipo === 'BAJA') return 'COMPLETADA'
    if (tipo === 'TRASLADO') return 'COMPLETADO'
    return null
  }

  const getDatosEvento = () => {
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
      return {
        macho: macho.trim() || null,
        fechas_sugeridas: fechasSugeridas,
      }
    }

    if (tipo === 'REVISION_EMBARAZO') {
      return {
        resultado_revision: revisionResultado,
      }
    }

    if (tipo === 'PARTO') {
      return {
        nacidos_vivos: toInt(partoVivos),
        nacidos_muertos: toInt(partoMuertos),
        momias: toInt(partoMomias),
        hembras: toInt(partoHembras),
        machos: toInt(partoMachos),
        peso_camada_kg: toNumOrNull(partoPesoCamadaKg),
        destete_sugerido: sumarDias(fecha, 21),
      }
    }

    if (tipo === 'DESTETE') {
      return {
        cantidad_destetada: toInt(desteteCantidad),
        hembras: toInt(desteteHembras),
        machos: toInt(desteteMachos),
        peso_total_kg: toNumOrNull(destetePesoTotalKg),
        destino_ubicacion_id: desteteDestinoId ? Number(desteteDestinoId) : null,
        celo_post_destete_sugerido: sumarDias(fecha, 5),
      }
    }

    if (tipo === 'ABORTO') {
      return {
        fetos: toInt(abortoFetos),
        motivo: abortoMotivo.trim() || null,
      }
    }

    if (tipo === 'MEDICACION') {
      return {
        medicamento: medicamento.trim(),
        dosis: dosis.trim() || null,
        via_aplicacion: viaAplicacion.trim() || null,
        responsable: responsable.trim() || null,
      }
    }

    if (tipo === 'MUERTE') {
      return {
        motivo: muerteMotivo.trim(),
      }
    }

    if (tipo === 'BAJA') {
      return {
        motivo: bajaMotivo.trim(),
      }
    }

    if (tipo === 'TRASLADO') {
      return {
        origen_ubicacion_id: cerdaSeleccionada?.ubicacion_id ?? null,
        destino_ubicacion_id: Number(trasladoDestinoId),
      }
    }

    return {}
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
        ...getDatosEvento(),
        estado_anterior: cerda.estado,
        estado_sugerido: estadoSugerido,
      }

      const ubicacionEvento =
        tipo === 'TRASLADO' && trasladoDestinoId
          ? Number(trasladoDestinoId)
          : ubicacionFinal

      const { data: eventoInsertado, error: eventoError } = await supabase
        .from('granja_cerda_eventos')
        .insert({
          cerda_id: Number(cerdaId),
          fecha,
          tipo,
          resultado: getResultadoEvento(),
          ubicacion_id: ubicacionEvento,
          lote_id: loteFinal,
          datos,
          observaciones: observaciones.trim() || null,
          user_id: userId,
        })
        .select('id')
        .single()

      if (eventoError) {
        console.error('Error guardando evento', eventoError)
        alert(`No se pudo guardar el evento: ${eventoError.message}`)
        return
      }

      const eventoId = Number(eventoInsertado?.id || 0)

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

      if (tipo === 'TRASLADO') {
        updateCerda.ubicacion_id = Number(trasladoDestinoId)
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
        alert(`El evento fue registrado, pero no se pudo actualizar la cerda: ${updateError.message}`)
      }

      if (tipo === 'PARTO') {
        const vivos = toInt(partoVivos)
        const hembras = toInt(partoHembras)
        const machos = toInt(partoMachos)

        const { error: partoError } = await supabase.from('granja_partos').insert({
          fecha,
          ubicacion_id: ubicacionFinal,
          lote_id: loteFinal,
          cerda_id: cerda.arete,
          nacidos_vivos: vivos,
          nacidos_muertos: toInt(partoMuertos),
          momias: toInt(partoMomias),
          peso_camda_kg: toNumOrNull(partoPesoCamadaKg),
          hembras,
          machos,
          observaciones: observaciones.trim() || null,
          user_id: userId,
        })

        if (partoError) {
          console.error('Error registrando parto', partoError)
          alert(`El evento fue guardado, pero no se pudo registrar en granja_partos: ${partoError.message}`)
        }

        if (ubicacionFinal && vivos > 0) {
          const { error: movPartoError } = await supabase
            .from('granja_movimientos')
            .insert({
              fecha: fechaTimestamp(fecha),
              ubicacion_id: ubicacionFinal,
              tipo: 'ENTRADA_PARTO',
              lote_id: loteFinal,
              cantidad: vivos,
              hembras,
              machos,
              peso_total_kg: toNumOrNull(partoPesoCamadaKg),
              referencia_tabla: 'granja_cerda_eventos',
              referencia_id: eventoId || null,
              user_id: userId,
              observaciones: `PARTO CERDA ${cerda.arete}. Vivos: ${vivos}.`,
            })

          if (movPartoError) {
            console.error('Error registrando entrada por parto', movPartoError)
            alert(`El parto fue guardado, pero no se pudo registrar la entrada de inventario: ${movPartoError.message}`)
          }
        }
      }

      if (tipo === 'DESTETE') {
        const cantidad = toInt(desteteCantidad)
        const hembras = toInt(desteteHembras)
        const machos = toInt(desteteMachos)
        const destino = desteteDestinoId ? Number(desteteDestinoId) : null

        if (ubicacionFinal && destino && cantidad > 0) {
          const obs = `DESTETE CERDA ${cerda.arete}. Traslado de lechones destetados.`

          const { error: movDesteteError } = await supabase
            .from('granja_movimientos')
            .insert([
              {
                fecha: fechaTimestamp(fecha),
                ubicacion_id: ubicacionFinal,
                tipo: 'AJUSTE',
                lote_id: loteFinal,
                cantidad: -Math.abs(cantidad),
                hembras: hembras > 0 ? -Math.abs(hembras) : null,
                machos: machos > 0 ? -Math.abs(machos) : null,
                peso_total_kg: toNumOrNull(destetePesoTotalKg),
                referencia_tabla: 'granja_cerda_eventos',
                referencia_id: eventoId || null,
                user_id: userId,
                observaciones: obs,
              },
              {
                fecha: fechaTimestamp(fecha),
                ubicacion_id: destino,
                tipo: 'AJUSTE',
                lote_id: loteFinal,
                cantidad: Math.abs(cantidad),
                hembras: hembras > 0 ? Math.abs(hembras) : null,
                machos: machos > 0 ? Math.abs(machos) : null,
                peso_total_kg: toNumOrNull(destetePesoTotalKg),
                referencia_tabla: 'granja_cerda_eventos',
                referencia_id: eventoId || null,
                user_id: userId,
                observaciones: obs,
              },
            ])

          if (movDesteteError) {
            console.error('Error registrando movimiento de destete', movDesteteError)
            alert(`El destete fue guardado, pero no se pudo registrar el traslado de inventario: ${movDesteteError.message}`)
          }
        }
      }

      if (tipo === 'MUERTE' && ubicacionFinal) {
        const { error: movError } = await supabase
          .from('granja_movimientos')
          .insert({
            fecha: fechaTimestamp(fecha),
            ubicacion_id: ubicacionFinal,
            tipo: 'SALIDA_MUERTE',
            cantidad: 1,
            hembras: 1,
            machos: 0,
            referencia_tabla: 'granja_cerdas',
            referencia_id: Number(cerdaId),
            user_id: userId,
            observaciones: `MUERTE CERDA ${cerda.arete}. Motivo: ${muerteMotivo.trim()}`,
          })

        if (movError) {
          console.error('Error registrando salida por muerte', movError)
          alert(`El evento fue registrado, pero no se pudo registrar la salida de inventario: ${movError.message}`)
        }
      }

      if (tipo === 'BAJA' && ubicacionFinal) {
        const { error: movError } = await supabase
          .from('granja_movimientos')
          .insert({
            fecha: fechaTimestamp(fecha),
            ubicacion_id: ubicacionFinal,
            tipo: 'AJUSTE',
            cantidad: -1,
            hembras: -1,
            machos: 0,
            referencia_tabla: 'granja_cerdas',
            referencia_id: Number(cerdaId),
            user_id: userId,
            observaciones: `BAJA CERDA ${cerda.arete}. Motivo: ${bajaMotivo.trim()}`,
          })

        if (movError) {
          console.error('Error registrando baja en inventario', movError)
          alert(`El evento fue registrado, pero no se pudo registrar el ajuste de inventario: ${movError.message}`)
        }
      }

      if (tipo === 'TRASLADO') {
        const origen = cerda.ubicacion_id ? Number(cerda.ubicacion_id) : null
        const destino = Number(trasladoDestinoId)

        if (origen && destino) {
          const obs = `TRASLADO CERDA ${cerda.arete}.`

          const { error: movTrasladoError } = await supabase
            .from('granja_movimientos')
            .insert([
              {
                fecha: fechaTimestamp(fecha),
                ubicacion_id: origen,
                tipo: 'AJUSTE',
                lote_id: loteFinal,
                cantidad: -1,
                hembras: -1,
                machos: 0,
                referencia_tabla: 'granja_cerda_eventos',
                referencia_id: eventoId || null,
                user_id: userId,
                observaciones: obs,
              },
              {
                fecha: fechaTimestamp(fecha),
                ubicacion_id: destino,
                tipo: 'AJUSTE',
                lote_id: loteFinal,
                cantidad: 1,
                hembras: 1,
                machos: 0,
                referencia_tabla: 'granja_cerda_eventos',
                referencia_id: eventoId || null,
                user_id: userId,
                observaciones: obs,
              },
            ])

          if (movTrasladoError) {
            console.error('Error registrando traslado', movTrasladoError)
            alert(`El evento fue guardado, pero no se pudo registrar el movimiento de inventario: ${movTrasladoError.message}`)
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

  const calcularMontaDesdeParto = () => {
    if (!fechaPartoEstimada) {
      alert('Ingresa la fecha estimada de parto.')
      return
    }

    setFechaMontaEstimada(restarDias(fechaPartoEstimada, 115))
  }

  const guardarRegularizacionPrenada = async () => {
    const cerda = cerdaSeleccionada

    if (!cerda) {
      alert('Selecciona una cerda.')
      return
    }

    if (normalizar(cerda.estado) !== 'PRENADA') {
      alert('Esta opción es solo para cerdas con estado PRENADA.')
      return
    }

    if (!fechaMontaEstimada) {
      alert('Ingresa o calcula la fecha estimada de monta/inseminación.')
      return
    }

    const confirmar = confirm(
      `Se registrará un evento ${tipoServicioEstimado} estimado para ${cerda.arete} con fecha ${fechaMontaEstimada}. ¿Continuar?`
    )

    if (!confirmar) return

    setGuardando(true)
    setMsg(null)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ubicacionFinal = cerda.ubicacion_id ? Number(cerda.ubicacion_id) : null
      const loteFinal = cerda.lote_id ? Number(cerda.lote_id) : null

      const { error: servicioError } = await supabase
        .from('granja_cerda_eventos')
        .insert({
          cerda_id: cerda.id,
          fecha: fechaMontaEstimada,
          tipo: tipoServicioEstimado,
          resultado: 'ESTIMADO',
          ubicacion_id: ubicacionFinal,
          lote_id: loteFinal,
          datos: {
            regularizacion: true,
            motivo: 'Cerda ingresada directamente como PRENADA sin evento reproductivo previo.',
            fecha_parto_estimada: fechaPartoEstimada || null,
            fecha_revision_estimada: sumarDias(fechaMontaEstimada, 21),
            fecha_parto_calculada: sumarDias(fechaMontaEstimada, 115),
          },
          observaciones: 'Evento estimado creado para regularizar cerda ingresada como PRENADA.',
          user_id: userId,
        })

      if (servicioError) {
        console.error('Error registrando regularización', servicioError)
        alert(`No se pudo registrar la regularización: ${servicioError.message}`)
        return
      }

      const fechaRevision = sumarDias(fechaMontaEstimada, 21)

      const { error: revisionError } = await supabase
        .from('granja_cerda_eventos')
        .insert({
          cerda_id: cerda.id,
          fecha: fechaRevision,
          tipo: 'REVISION_EMBARAZO',
          resultado: 'POSITIVO',
          ubicacion_id: ubicacionFinal,
          lote_id: loteFinal,
          datos: {
            regularizacion: true,
            origen: tipoServicioEstimado,
            fecha_servicio_estimada: fechaMontaEstimada,
          },
          observaciones: 'Revisión positiva estimada creada automáticamente por regularización de cerda preñada.',
          user_id: userId,
        })

      if (revisionError) {
        console.error('Error registrando revisión positiva estimada', revisionError)
        alert(`Se registró el servicio estimado, pero no la revisión positiva: ${revisionError.message}`)
      }

      const { error: updateError } = await supabase
        .from('granja_cerdas')
        .update({
          estado: 'PRENADA',
          updated_at: new Date().toISOString(),
        })
        .eq('id', cerda.id)

      if (updateError) {
        console.error('Error actualizando estado de cerda', updateError)
      }

      alert('Regularización de embarazo registrada correctamente.')

      setModoRegularizarPrenada(false)
      setFechaPartoEstimada('')
      setFechaMontaEstimada('')
      await cargarCatalogos()
      await cargarEventos()
    } finally {
      setGuardando(false)
    }
  }

  const renderCamposEvento = () => {
    if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
      return (
        <div>
          <label className="block text-xs font-semibold mb-1">Macho</label>
          <input
            className="w-full border rounded px-2 py-2"
            value={macho}
            onChange={(e) => setMacho(e.target.value)}
            placeholder="Ej: M-330"
          />
        </div>
      )
    }

    if (tipo === 'REVISION_EMBARAZO') {
      return (
        <div>
          <label className="block text-xs font-semibold mb-1">Resultado</label>
          <select
            className="w-full border rounded px-2 py-2"
            value={revisionResultado}
            onChange={(e) => setRevisionResultado(e.target.value)}
          >
            <option value="">— Selecciona —</option>
            <option value="POSITIVO">POSITIVO</option>
            <option value="NEGATIVO">NEGATIVO</option>
          </select>
        </div>
      )
    }

    if (tipo === 'PARTO') {
      return (
        <div className="grid gap-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Nacidos vivos</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoVivos}
                onChange={(e) => setPartoVivos(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nacidos muertos</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoMuertos}
                onChange={(e) => setPartoMuertos(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Momias</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoMomias}
                onChange={(e) => setPartoMomias(e.target.value)}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Hembras vivas</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoHembras}
                onChange={(e) => setPartoHembras(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos vivos</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoMachos}
                onChange={(e) => setPartoMachos(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Peso camada kg</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={partoPesoCamadaKg}
                onChange={(e) => setPartoPesoCamadaKg(e.target.value)}
              />
            </div>
          </div>
        </div>
      )
    }

    if (tipo === 'DESTETE') {
      return (
        <div className="grid gap-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Cantidad destetada</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={desteteCantidad}
                onChange={(e) => setDesteteCantidad(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Hembras</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={desteteHembras}
                onChange={(e) => setDesteteHembras(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Machos</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={desteteMachos}
                onChange={(e) => setDesteteMachos(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Peso total kg</label>
              <input
                type="number"
                min="0"
                className="w-full border rounded px-2 py-2"
                value={destetePesoTotalKg}
                onChange={(e) => setDestetePesoTotalKg(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              Destino de lechones destetados
            </label>
            <select
              className="w-full border rounded px-2 py-2"
              value={desteteDestinoId}
              onChange={(e) => setDesteteDestinoId(e.target.value)}
            >
              <option value="">— Solo registrar evento, sin mover inventario —</option>
              {ubicaciones.map((ubicacion) => (
                <option key={ubicacion.id} value={ubicacion.id}>
                  {ubicacion.codigo}
                  {ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )
    }

    if (tipo === 'ABORTO') {
      return (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Cantidad de fetos</label>
            <input
              type="number"
              min="0"
              className="w-full border rounded px-2 py-2"
              value={abortoFetos}
              onChange={(e) => setAbortoFetos(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Motivo</label>
            <input
              className="w-full border rounded px-2 py-2"
              value={abortoMotivo}
              onChange={(e) => setAbortoMotivo(e.target.value)}
            />
          </div>
        </div>
      )
    }

    if (tipo === 'MEDICACION') {
      return (
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Medicamento</label>
            <input
              className="w-full border rounded px-2 py-2"
              value={medicamento}
              onChange={(e) => setMedicamento(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Dosis</label>
            <input
              className="w-full border rounded px-2 py-2"
              value={dosis}
              onChange={(e) => setDosis(e.target.value)}
              placeholder="Ej: 5 ml"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Vía de aplicación</label>
            <input
              className="w-full border rounded px-2 py-2"
              value={viaAplicacion}
              onChange={(e) => setViaAplicacion(e.target.value)}
              placeholder="Ej: IM, oral, etc."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Responsable</label>
            <input
              className="w-full border rounded px-2 py-2"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
            />
          </div>
        </div>
      )
    }

    if (tipo === 'MUERTE') {
      return (
        <div>
          <label className="block text-xs font-semibold mb-1">Motivo de muerte</label>
          <input
            className="w-full border rounded px-2 py-2"
            value={muerteMotivo}
            onChange={(e) => setMuerteMotivo(e.target.value)}
          />
        </div>
      )
    }

    if (tipo === 'BAJA') {
      return (
        <div>
          <label className="block text-xs font-semibold mb-1">Motivo de baja</label>
          <input
            className="w-full border rounded px-2 py-2"
            value={bajaMotivo}
            onChange={(e) => setBajaMotivo(e.target.value)}
          />
        </div>
      )
    }

    if (tipo === 'TRASLADO') {
      return (
        <div>
          <label className="block text-xs font-semibold mb-1">Destino</label>
          <select
            className="w-full border rounded px-2 py-2"
            value={trasladoDestinoId}
            onChange={(e) => setTrasladoDestinoId(e.target.value)}
          >
            <option value="">— Selecciona destino —</option>
            {ubicaciones.map((ubicacion) => (
              <option key={ubicacion.id} value={ubicacion.id}>
                {ubicacion.codigo}
                {ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}
              </option>
            ))}
          </select>
        </div>
      )
    }

    return null
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
            Registro de monta, revisión, parto, destete, aborto, medicación, muerte, baja y traslado.
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
                  onChange={(e) => {
                    setCerdaId(e.target.value)
                    setModoRegularizarPrenada(false)
                    setFechaPartoEstimada('')
                    setFechaMontaEstimada('')
                  }}
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
                    {ubicacionActualCerda ? (
                      <div>
                        <b>Ubicación actual:</b> {ubicacionActualCerda.codigo}
                        {ubicacionActualCerda.nombre
                          ? ` — ${ubicacionActualCerda.nombre}`
                          : ''}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {puedeRegularizarPrenada ? (
              <div className="border rounded bg-amber-50 border-amber-300 p-3 text-xs text-amber-900">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <b>Esta cerda está marcada como PRENADA.</b>
                    <div>
                      Puedes crear un evento reproductivo estimado si fue ingresada ya preñada.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModoRegularizarPrenada((prev) => !prev)}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs"
                  >
                    {modoRegularizarPrenada ? 'Ocultar' : 'Regularizar embarazo'}
                  </button>
                </div>

                {modoRegularizarPrenada ? (
                  <div className="grid md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block font-semibold mb-1">
                        Tipo de servicio estimado
                      </label>
                      <select
                        className="border rounded p-2 w-full"
                        value={tipoServicioEstimado}
                        onChange={(e) =>
                          setTipoServicioEstimado(
                            e.target.value as 'MONTA' | 'INSEMINACION'
                          )
                        }
                      >
                        <option value="MONTA">MONTA</option>
                        <option value="INSEMINACION">INSEMINACION</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1">
                        Fecha estimada de parto
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          className="border rounded p-2 w-full"
                          value={fechaPartoEstimada}
                          onChange={(e) => setFechaPartoEstimada(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={calcularMontaDesdeParto}
                          className="bg-slate-700 hover:bg-slate-800 text-white px-3 rounded"
                        >
                          Calcular
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1">
                        Fecha estimada de monta/inseminación
                      </label>
                      <input
                        type="date"
                        className="border rounded p-2 w-full"
                        value={fechaMontaEstimada}
                        onChange={(e) => setFechaMontaEstimada(e.target.value)}
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={guardarRegularizacionPrenada}
                        disabled={guardando}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded w-full"
                      >
                        {guardando ? 'Guardando...' : 'Guardar regularización'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Tipo</label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value)
                    limpiarCamposEvento()
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

            {tipo !== 'TRASLADO' ? (
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Ubicación del evento
                </label>
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
              </div>
            ) : null}

            {renderCamposEvento()}

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
        </div>
      </div>
    </div>
  )
}
