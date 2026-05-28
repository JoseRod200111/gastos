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

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  activa: boolean
}

type EventoCerda = {
  id: number
  tipo: string
  fecha: string
  resultado: string | null
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

const fechaISOaTimestampMediodia = (fechaISO: string) => {
  return new Date(`${fechaISO}T12:00:00.000Z`).toISOString()
}

const toInt = (v: string) => {
  const t = String(v || '').trim()
  if (t === '') return 0
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

const toNumOrNull = (v: string) => {
  const t = String(v || '').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const EVENTOS_QUE_CIERRAN_CICLO = ['PARTO', 'DESTETE', 'ABORTO', 'MUERTE', 'DESCARTE']

export default function EntradaPartoPage() {
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [partos, setPartos] = useState<PartoRow[]>([])

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

  const cerdaSeleccionada = useMemo(() => {
    const id = Number(form.cerda_id)
    if (!id) return null
    return cerdas.find((cerda) => cerda.id === id) ?? null
  }, [form.cerda_id, cerdas])

  const totalNacidos = useMemo(() => {
    const vivos = toInt(form.nacidos_vivos)
    const muertos = toInt(form.nacidos_muertos)
    const momias = toInt(form.momias)

    if ([vivos, muertos, momias].some((x) => Number.isNaN(x))) return 0

    return vivos + muertos + momias
  }, [form.nacidos_vivos, form.nacidos_muertos, form.momias])

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      const ubicacionesRes = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (ubicacionesRes.error) {
        console.error('Error cargando ubicaciones', ubicacionesRes.error)
        alert(`No se pudieron cargar las ubicaciones: ${ubicacionesRes.error.message}`)
        return
      }

      const lotesRes = await supabase
        .from('granja_lotes')
        .select('id, codigo, tipo_origen, fecha, observaciones')
        .order('fecha', { ascending: false })
        .limit(300)

      if (lotesRes.error) {
        console.error('Error cargando lotes', lotesRes.error)
        alert(`No se pudieron cargar los lotes: ${lotesRes.error.message}`)
        return
      }

      const cerdasRes = await supabase
        .from('granja_cerdas')
        .select('id, arete, nombre, estado, ubicacion_id, lote_id, activa')
        .order('arete', { ascending: true })

      if (cerdasRes.error) {
        console.error('Error cargando cerdas', cerdasRes.error)
        alert(`No se pudieron cargar las cerdas: ${cerdasRes.error.message}`)
        return
      }

      const partosRes = await supabase
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

      if (partosRes.error) {
        console.error('Error cargando partos', partosRes.error)
        alert(`No se pudieron cargar los partos: ${partosRes.error.message}`)
        return
      }

      const ubicacionesData = (ubicacionesRes.data ?? []) as Ubicacion[]
      const lotesData = (lotesRes.data ?? []) as Lote[]
      const cerdasData = (cerdasRes.data ?? []) as Cerda[]
      const partosData = (partosRes.data ?? []) as PartoRow[]

      setUbicaciones(ubicacionesData)
      setLotes(lotesData)
      setCerdas(cerdasData)
      setPartos(partosData)

      setForm((prev) => {
        if (prev.ubicacion_id || ubicacionesData.length === 0) return prev

        return {
          ...prev,
          ubicacion_id: String(ubicacionesData[0].id),
        }
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const resetForm = () => {
    setForm({
      fecha: hoyISO(),
      ubicacion_id: ubicaciones.length > 0 ? String(ubicaciones[0].id) : '',
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

  const obtenerHistorialCerda = async (cerdaId: number) => {
    const res = await supabase
      .from('granja_cerda_eventos')
      .select('id,tipo,fecha,resultado')
      .eq('cerda_id', cerdaId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .limit(300)

    if (res.error) throw res.error

    return (res.data ?? []) as EventoCerda[]
  }

  const existeEventoDespuesDeCorte = (
    historial: EventoCerda[],
    tiposBuscados: string[],
    tiposCorte: string[]
  ) => {
    for (const evento of historial) {
      if (tiposBuscados.includes(evento.tipo)) return true
      if (tiposCorte.includes(evento.tipo)) return false
    }

    return false
  }

  const ultimaRevisionDespuesDeServicio = (historial: EventoCerda[]) => {
    for (const evento of historial) {
      if (evento.tipo === 'REVISION_EMBARAZO') return evento.resultado
      if (evento.tipo === 'MONTA' || evento.tipo === 'INSEMINACION') return null
      if (EVENTOS_QUE_CIERRAN_CICLO.includes(evento.tipo)) return null
    }

    return null
  }

  const validarPartoParaCerda = async (cerda: Cerda) => {
    if (!cerda.activa) {
      throw new Error('La cerda seleccionada está inactiva.')
    }

    if (cerda.estado === 'MUERTA' || cerda.estado === 'BAJA') {
      throw new Error('No puedes registrar parto para una cerda muerta o dada de baja.')
    }

    const historial = await obtenerHistorialCerda(cerda.id)

    const tieneServicioVigente = existeEventoDespuesDeCorte(
      historial,
      ['MONTA', 'INSEMINACION'],
      EVENTOS_QUE_CIERRAN_CICLO
    )

    if (!tieneServicioVigente) {
      throw new Error('No puedes registrar parto sin una monta o inseminación previa.')
    }

    const revision = ultimaRevisionDespuesDeServicio(historial)

    if (revision === 'NEGATIVO') {
      throw new Error('No puedes registrar parto porque la última revisión de embarazo fue NEGATIVA.')
    }
  }

  const obtenerOCrearLote = async () => {
    if (form.lote_id) return Number(form.lote_id)

    const codigoBase = form.nuevo_lote_codigo.trim() || `P-${form.fecha.replace(/-/g, '')}`

    const existenteRes = await supabase
      .from('granja_lotes')
      .select('id')
      .eq('codigo', codigoBase)
      .maybeSingle()

    if (existenteRes.error) {
      throw existenteRes.error
    }

    if (existenteRes.data?.id) {
      return Number(existenteRes.data.id)
    }

    const insertRes = await supabase
      .from('granja_lotes')
      .insert([
        {
          codigo: codigoBase,
          tipo_origen: 'PARTO',
          fecha: form.fecha,
          observaciones: form.observaciones.trim() || null,
        },
      ])
      .select('id')
      .single()

    if (insertRes.error) {
      throw insertRes.error
    }

    return Number(insertRes.data.id)
  }

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
    const movimientoExistenteRes = await supabase
      .from('granja_movimientos')
      .select('id')
      .eq('referencia_tabla', 'granja_partos')
      .eq('referencia_id', args.partoId)
      .eq('tipo', 'ENTRADA_PARTO')
      .maybeSingle()

    if (movimientoExistenteRes.error) {
      throw movimientoExistenteRes.error
    }

    const payload = {
      fecha: fechaISOaTimestampMediodia(args.fecha),
      ubicacion_id: args.ubicacion_id,
      tipo: 'ENTRADA_PARTO',
      lote_id: args.lote_id,
      cantidad: args.nacidos_vivos,
      hembras: args.hembras,
      machos: args.machos,
      peso_total_kg: args.peso_camda_kg,
      referencia_tabla: 'granja_partos',
      referencia_id: args.partoId,
      user_id: args.user_id,
      observaciones: args.observaciones || 'Entrada de cerdos por parto',
    }

    if (movimientoExistenteRes.data?.id) {
      const updateRes = await supabase
        .from('granja_movimientos')
        .update(payload)
        .eq('id', movimientoExistenteRes.data.id)

      if (updateRes.error) throw updateRes.error

      return
    }

    const insertRes = await supabase.from('granja_movimientos').insert([payload])

    if (insertRes.error) throw insertRes.error
  }

  const registrarEventoCerdaParto = async (args: {
    cerda: Cerda
    partoId: number
    fecha: string
    ubicacion_id: number
    lote_id: number | null
    nacidos_vivos: number
    nacidos_muertos: number
    momias: number
    hembras: number | null
    machos: number | null
    peso_camda_kg: number | null
    observaciones: string | null
    user_id: string | null
  }) => {
    const eventoExistenteRes = await supabase
      .from('granja_cerda_eventos')
      .select('id')
      .eq('tipo', 'PARTO')
      .eq('cerda_id', args.cerda.id)
      .contains('datos', { granja_parto_id: args.partoId })
      .maybeSingle()

    if (eventoExistenteRes.error) {
      throw eventoExistenteRes.error
    }

    const payload = {
      cerda_id: args.cerda.id,
      fecha: args.fecha,
      tipo: 'PARTO',
      resultado: null,
      ubicacion_id: args.ubicacion_id,
      lote_id: args.lote_id,
      datos: {
        granja_parto_id: args.partoId,
        nacidos_vivos: args.nacidos_vivos,
        nacidos_muertos: args.nacidos_muertos,
        momias: args.momias,
        total: args.nacidos_vivos + args.nacidos_muertos + args.momias,
        hembras: args.hembras,
        machos: args.machos,
        peso_camda_kg: args.peso_camda_kg,
      },
      observaciones: args.observaciones,
      user_id: args.user_id,
    }

    if (eventoExistenteRes.data?.id) {
      const updateRes = await supabase
        .from('granja_cerda_eventos')
        .update(payload)
        .eq('id', eventoExistenteRes.data.id)

      if (updateRes.error) throw updateRes.error

      return
    }

    const insertRes = await supabase.from('granja_cerda_eventos').insert([payload])

    if (insertRes.error) throw insertRes.error
  }

  const actualizarEstadoCerdaPostParto = async (args: {
    cerda: Cerda
    ubicacion_id: number
    lote_id: number | null
  }) => {
    const updateRes = await supabase
      .from('granja_cerdas')
      .update({
        estado: 'LACTANDO',
        ubicacion_id: args.ubicacion_id,
        lote_id: args.lote_id,
      })
      .eq('id', args.cerda.id)

    if (updateRes.error) throw updateRes.error
  }

  const guardarParto = async () => {
    try {
      setGuardando(true)

      if (!form.fecha) throw new Error('La fecha es obligatoria.')
      if (!form.ubicacion_id) throw new Error('La ubicación es obligatoria.')
      if (!form.cerda_id) throw new Error('Selecciona una cerda.')

      const cerda = cerdaSeleccionada

      if (!cerda) {
        throw new Error('La cerda seleccionada no existe o no cargó correctamente.')
      }

      await validarPartoParaCerda(cerda)

      const nacidosVivos = toInt(form.nacidos_vivos)
      const nacidosMuertos = toInt(form.nacidos_muertos)
      const momias = toInt(form.momias)

      if ([nacidosVivos, nacidosMuertos, momias].some((x) => Number.isNaN(x) || x < 0)) {
        throw new Error('Vivos, muertos y momias deben ser números válidos mayores o iguales a 0.')
      }

      if (nacidosVivos <= 0) {
        throw new Error('Para afectar inventario, nacidos vivos debe ser mayor que 0.')
      }

      const hembras = form.hembras.trim() ? toInt(form.hembras) : null
      const machos = form.machos.trim() ? toInt(form.machos) : null

      if ([hembras, machos].some((x) => x !== null && (Number.isNaN(x) || (x as number) < 0))) {
        throw new Error('Hembras y machos deben ser números válidos mayores o iguales a 0.')
      }

      if (hembras !== null && machos !== null && hembras + machos !== nacidosVivos) {
        throw new Error('La suma de hembras y machos debe ser igual a nacidos vivos.')
      }

      const pesoCamada = toNumOrNull(form.peso_camda_kg)

      if (pesoCamada !== null && (Number.isNaN(pesoCamada) || pesoCamada < 0)) {
        throw new Error('Peso de camada debe ser un número válido mayor o igual a 0.')
      }

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ubicacionId = Number(form.ubicacion_id)
      const loteId = await obtenerOCrearLote()

      const insertPartoRes = await supabase
        .from('granja_partos')
        .insert([
          {
            fecha: form.fecha,
            ubicacion_id: ubicacionId,
            lote_id: loteId,
            cerda_id: cerda.arete,
            nacidos_vivos: nacidosVivos,
            nacidos_muertos: nacidosMuertos,
            momias,
            peso_camda_kg: pesoCamada,
            hembras: hembras ?? 0,
            machos: machos ?? 0,
            observaciones: form.observaciones.trim() || null,
            user_id: userId,
          },
        ])
        .select('id')
        .single()

      if (insertPartoRes.error) throw insertPartoRes.error

      const partoId = Number(insertPartoRes.data.id)

      try {
        await upsertMovimientoParto({
          partoId,
          fecha: form.fecha,
          ubicacion_id: ubicacionId,
          lote_id: loteId,
          nacidos_vivos: nacidosVivos,
          hembras,
          machos,
          peso_camda_kg: pesoCamada,
          user_id: userId,
          observaciones: `PARTO CERDA ${cerda.arete}`,
        })

        await registrarEventoCerdaParto({
          cerda,
          partoId,
          fecha: form.fecha,
          ubicacion_id: ubicacionId,
          lote_id: loteId,
          nacidos_vivos: nacidosVivos,
          nacidos_muertos: nacidosMuertos,
          momias,
          hembras,
          machos,
          peso_camda_kg: pesoCamada,
          observaciones: form.observaciones.trim() || `PARTO CERDA ${cerda.arete}`,
          user_id: userId,
        })

        await actualizarEstadoCerdaPostParto({
          cerda,
          ubicacion_id: ubicacionId,
          lote_id: loteId,
        })
      } catch (postError) {
        await supabase
          .from('granja_movimientos')
          .delete()
          .eq('referencia_tabla', 'granja_partos')
          .eq('referencia_id', partoId)

        await supabase.from('granja_partos').delete().eq('id', partoId)

        throw postError
      }

      alert('Parto registrado correctamente. Inventario actualizado y cerda marcada como LACTANDO.')
      resetForm()
      await cargarDatos()
    } catch (error) {
      console.error('Error guardando parto', error)
      const message = error instanceof Error ? error.message : 'No se pudo guardar el parto.'
      alert(message)
    } finally {
      setGuardando(false)
    }
  }

  const empezarEditar = (parto: PartoRow) => {
    setEditId(parto.id)
    setEdit({ ...parto })
  }

  const cancelarEditar = () => {
    setEditId(null)
    setEdit({})
  }

  const buscarCerdaPorArete = (arete: string) => {
    return cerdas.find((cerda) => cerda.arete === arete) ?? null
  }

  const guardarEdicion = async () => {
    if (!editId) return

    try {
      setGuardandoEdicionId(editId)

      const parto = edit as PartoRow

      if (!parto.fecha) throw new Error('Fecha obligatoria.')
      if (!parto.ubicacion_id) throw new Error('Ubicación obligatoria.')
      if (!String(parto.cerda_id || '').trim()) throw new Error('Cerda obligatoria.')

      const vivos = Number(parto.nacidos_vivos || 0)
      const muertos = Number(parto.nacidos_muertos || 0)
      const momias = Number(parto.momias || 0)
      const hembras = Number(parto.hembras || 0)
      const machos = Number(parto.machos || 0)

      if ([vivos, muertos, momias, hembras, machos].some((x) => !Number.isFinite(x) || x < 0)) {
        throw new Error('Los valores numéricos deben ser mayores o iguales a 0.')
      }

      if (vivos <= 0) {
        throw new Error('Nacidos vivos debe ser mayor que 0.')
      }

      if (hembras + machos !== vivos) {
        throw new Error('La suma de hembras y machos debe ser igual a nacidos vivos.')
      }

      const cerda = buscarCerdaPorArete(String(parto.cerda_id).trim())

      if (!cerda) {
        throw new Error('La cerda del parto editado no existe en el maestro de cerdas.')
      }

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const updatePartoRes = await supabase
        .from('granja_partos')
        .update({
          fecha: parto.fecha,
          ubicacion_id: Number(parto.ubicacion_id),
          lote_id: parto.lote_id ? Number(parto.lote_id) : null,
          cerda_id: cerda.arete,
          nacidos_vivos: vivos,
          nacidos_muertos: muertos,
          momias,
          peso_camda_kg: parto.peso_camda_kg ?? null,
          hembras,
          machos,
          observaciones: parto.observaciones ?? null,
          user_id: userId,
        })
        .eq('id', editId)

      if (updatePartoRes.error) throw updatePartoRes.error

      await upsertMovimientoParto({
        partoId: editId,
        fecha: parto.fecha,
        ubicacion_id: Number(parto.ubicacion_id),
        lote_id: parto.lote_id ? Number(parto.lote_id) : null,
        nacidos_vivos: vivos,
        hembras,
        machos,
        peso_camda_kg: parto.peso_camda_kg ?? null,
        user_id: userId,
        observaciones: `PARTO CERDA ${cerda.arete} (editado)`,
      })

      await registrarEventoCerdaParto({
        cerda,
        partoId: editId,
        fecha: parto.fecha,
        ubicacion_id: Number(parto.ubicacion_id),
        lote_id: parto.lote_id ? Number(parto.lote_id) : null,
        nacidos_vivos: vivos,
        nacidos_muertos: muertos,
        momias,
        hembras,
        machos,
        peso_camda_kg: parto.peso_camda_kg ?? null,
        observaciones: parto.observaciones || `PARTO CERDA ${cerda.arete} (editado)`,
        user_id: userId,
      })

      await actualizarEstadoCerdaPostParto({
        cerda,
        ubicacion_id: Number(parto.ubicacion_id),
        lote_id: parto.lote_id ? Number(parto.lote_id) : null,
      })

      alert('Parto actualizado correctamente. Inventario ajustado.')
      setEditId(null)
      setEdit({})
      await cargarDatos()
    } catch (error) {
      console.error('Error actualizando parto', error)
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el parto.'
      alert(message)
    } finally {
      setGuardandoEdicionId(null)
    }
  }

  const eliminarParto = async (parto: PartoRow) => {
    if (eliminandoId) return

    const ok = confirm(
      `¿Eliminar el parto #${parto.id}? Esto eliminará el movimiento de inventario asociado.`
    )

    if (!ok) return

    try {
      setEliminandoId(parto.id)

      const deleteMovimientoRes = await supabase
        .from('granja_movimientos')
        .delete()
        .eq('referencia_tabla', 'granja_partos')
        .eq('referencia_id', parto.id)
        .eq('tipo', 'ENTRADA_PARTO')

      if (deleteMovimientoRes.error) throw deleteMovimientoRes.error

      const cerda = buscarCerdaPorArete(parto.cerda_id)

      if (cerda) {
        const eventosRes = await supabase
          .from('granja_cerda_eventos')
          .delete()
          .eq('tipo', 'PARTO')
          .eq('cerda_id', cerda.id)
          .contains('datos', { granja_parto_id: parto.id })

        if (eventosRes.error) throw eventosRes.error
      }

      const deletePartoRes = await supabase.from('granja_partos').delete().eq('id', parto.id)

      if (deletePartoRes.error) throw deletePartoRes.error

      alert('Parto eliminado. Inventario revertido.')
      await cargarDatos()
    } catch (error) {
      console.error('Error eliminando parto', error)
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el parto.'
      alert(message)
    } finally {
      setEliminandoId(null)
    }
  }

  const cerdaInfo = (arete: string) => {
    const cerda = buscarCerdaPorArete(arete)

    if (!cerda) return null

    return cerda
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />

        <div>
          <h1 className="text-2xl font-bold">Granja — Entrada por parto</h1>
          <p className="text-xs text-gray-600">
            Registra partos usando cerdas del maestro, valida monta previa y actualiza inventario.
          </p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo parto</h2>

          {loading ? <p className="text-xs text-gray-500 mb-2">Cargando…</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-700">Fecha</label>
              <input
                type="date"
                className="border p-2 w-full"
                value={form.fecha}
                onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-700">Ubicación de la camada</label>
              <select
                className="border p-2 w-full"
                value={form.ubicacion_id}
                onChange={(e) => setForm((prev) => ({ ...prev, ubicacion_id: e.target.value }))}
              >
                <option value="">— Selecciona ubicación —</option>
                {ubicaciones.map((ubicacion) => (
                  <option key={ubicacion.id} value={String(ubicacion.id)}>
                    {ubicacion.codigo} — {ubicacion.nombre || ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-700">Lote existente</label>
              <select
                className="border p-2 w-full"
                value={form.lote_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    lote_id: e.target.value,
                    nuevo_lote_codigo: e.target.value ? '' : prev.nuevo_lote_codigo,
                  }))
                }
              >
                <option value="">Crear/reusar por código</option>
                {lotes.map((lote) => (
                  <option key={lote.id} value={String(lote.id)}>
                    {lote.codigo} ({lote.tipo_origen})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-700">Código de nuevo lote</label>
              <input
                className="border p-2 w-full disabled:bg-gray-100"
                placeholder="Si se deja vacío: P-YYYYMMDD"
                value={form.nuevo_lote_codigo}
                disabled={Boolean(form.lote_id)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nuevo_lote_codigo: e.target.value }))
                }
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-700">Cerda</label>
              <select
                className="border p-2 w-full"
                value={form.cerda_id}
                onChange={(e) => {
                  const id = e.target.value
                  const cerda = cerdas.find((item) => String(item.id) === id)

                  setForm((prev) => ({
                    ...prev,
                    cerda_id: id,
                    ubicacion_id: cerda?.ubicacion_id ? String(cerda.ubicacion_id) : prev.ubicacion_id,
                    lote_id: cerda?.lote_id ? String(cerda.lote_id) : prev.lote_id,
                  }))
                }}
              >
                <option value="">— Selecciona una cerda —</option>
                {cerdas.map((cerda) => (
                  <option
                    key={cerda.id}
                    value={String(cerda.id)}
                    disabled={!cerda.activa || cerda.estado === 'MUERTA' || cerda.estado === 'BAJA'}
                  >
                    {cerda.arete} — {cerda.nombre || 'Sin nombre'} ({cerda.estado})
                  </option>
                ))}
              </select>

              {cerdaSeleccionada ? (
                <div className="mt-1 text-[11px] text-gray-600 border rounded p-2 bg-gray-50">
                  Estado actual: <b>{cerdaSeleccionada.estado}</b> · Activa:{' '}
                  <b>{cerdaSeleccionada.activa ? 'Sí' : 'No'}</b> · Ubicación actual:{' '}
                  <b>{cerdaSeleccionada.ubicacion_id ?? '—'}</b>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500 mt-1">
                  Solo se permite registrar parto a cerdas existentes y activas.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-700">Nacidos vivos</label>
              <input
                type="number"
                min="0"
                className="border p-2 w-full"
                value={form.nacidos_vivos}
                onChange={(e) => setForm((prev) => ({ ...prev, nacidos_vivos: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Nacidos muertos</label>
              <input
                type="number"
                min="0"
                className="border p-2 w-full"
                value={form.nacidos_muertos}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nacidos_muertos: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Momias</label>
              <input
                type="number"
                min="0"
                className="border p-2 w-full"
                value={form.momias}
                onChange={(e) => setForm((prev) => ({ ...prev, momias: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Peso camada kg</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="border p-2 w-full"
                value={form.peso_camda_kg}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, peso_camda_kg: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Hembras</label>
              <input
                type="number"
                min="0"
                className="border p-2 w-full"
                value={form.hembras}
                onChange={(e) => setForm((prev) => ({ ...prev, hembras: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs text-gray-700">Machos</label>
              <input
                type="number"
                min="0"
                className="border p-2 w-full"
                value={form.machos}
                onChange={(e) => setForm((prev) => ({ ...prev, machos: e.target.value }))}
              />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-gray-700">Observaciones</label>
              <textarea
                className="border p-2 w-full"
                rows={3}
                value={form.observaciones}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, observaciones: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            Total nacidos: <b>{totalNacidos}</b>
          </div>

          <div className="mt-1 text-xs text-gray-500">
            Al guardar, se valida que exista monta/inseminación previa, se registra el evento
            PARTO, la cerda pasa a LACTANDO y los nacidos vivos entran al inventario general.
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarParto}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
            >
              {guardando ? 'Guardando…' : 'Guardar parto'}
            </button>

            <button
              onClick={resetForm}
              disabled={guardando}
              className="bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-900 px-4 py-2 rounded"
            >
              Limpiar
            </button>
          </div>
        </section>

        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Partos recientes</h2>

          {partos.length === 0 ? (
            <p className="text-sm text-gray-600">Aún no hay partos registrados.</p>
          ) : (
            <div className="space-y-3">
              {partos.map((parto) => {
                const enEdicion = editId === parto.id
                const loteCodigo = parto.granja_lotes?.codigo || (parto.lote_id ? `#${parto.lote_id}` : '—')
                const ubicacionCodigo = parto.granja_ubicaciones?.codigo || `#${parto.ubicacion_id}`
                const cerda = cerdaInfo(parto.cerda_id)

                return (
                  <div key={parto.id} className="border rounded p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-semibold">
                          #{parto.id} · {parto.fecha} · {ubicacionCodigo}
                        </div>

                        <div className="text-xs text-gray-600">
                          Lote: {loteCodigo} · Cerda: {parto.cerda_id}
                          {cerda ? ` (${cerda.estado})` : ''}
                        </div>

                        {!enEdicion ? (
                          <div className="mt-2 text-sm">
                            Vivos: <b>{parto.nacidos_vivos}</b> · Muertos:{' '}
                            <b>{parto.nacidos_muertos}</b> · Momias: <b>{parto.momias}</b>
                            <br />
                            Hembras: <b>{parto.hembras}</b> · Machos: <b>{parto.machos}</b>
                          </div>
                        ) : (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <label className="text-[11px] text-gray-600">Cerda</label>
                              <select
                                className="border p-1 w-full"
                                value={String(cerdas.find((item) => item.arete === String(edit.cerda_id ?? parto.cerda_id))?.id ?? '')}
                                onChange={(e) => {
                                  const selected = cerdas.find((item) => String(item.id) === e.target.value)

                                  setEdit((prev) => ({
                                    ...prev,
                                    cerda_id: selected?.arete ?? '',
                                  }))
                                }}
                              >
                                <option value="">— Selecciona —</option>
                                {cerdas.map((item) => (
                                  <option key={item.id} value={String(item.id)}>
                                    {item.arete} — {item.nombre || 'Sin nombre'} ({item.estado})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Fecha</label>
                              <input
                                type="date"
                                className="border p-1 w-full"
                                value={String(edit.fecha ?? parto.fecha)}
                                onChange={(e) =>
                                  setEdit((prev) => ({ ...prev, fecha: e.target.value }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Ubicación</label>
                              <select
                                className="border p-1 w-full"
                                value={String(edit.ubicacion_id ?? parto.ubicacion_id)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    ubicacion_id: Number(e.target.value),
                                  }))
                                }
                              >
                                {ubicaciones.map((ubicacion) => (
                                  <option key={ubicacion.id} value={String(ubicacion.id)}>
                                    {ubicacion.codigo}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Lote</label>
                              <select
                                className="border p-1 w-full"
                                value={String(edit.lote_id ?? parto.lote_id ?? '')}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    lote_id: e.target.value ? Number(e.target.value) : null,
                                  }))
                                }
                              >
                                <option value="">—</option>
                                {lotes.map((lote) => (
                                  <option key={lote.id} value={String(lote.id)}>
                                    {lote.codigo}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Peso kg</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.peso_camda_kg ?? parto.peso_camda_kg ?? '')}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    peso_camda_kg: e.target.value === '' ? null : Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Vivos</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.nacidos_vivos ?? parto.nacidos_vivos)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    nacidos_vivos: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Muertos</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.nacidos_muertos ?? parto.nacidos_muertos)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    nacidos_muertos: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Momias</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.momias ?? parto.momias)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    momias: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Hembras</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.hembras ?? parto.hembras)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    hembras: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <label className="text-[11px] text-gray-600">Machos</label>
                              <input
                                type="number"
                                className="border p-1 w-full"
                                value={String(edit.machos ?? parto.machos)}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    machos: Number(e.target.value),
                                  }))
                                }
                              />
                            </div>

                            <div className="col-span-2">
                              <label className="text-[11px] text-gray-600">Observaciones</label>
                              <input
                                className="border p-1 w-full"
                                value={String(edit.observaciones ?? parto.observaciones ?? '')}
                                onChange={(e) =>
                                  setEdit((prev) => ({
                                    ...prev,
                                    observaciones: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {!enEdicion ? (
                          <>
                            <button
                              onClick={() => empezarEditar(parto)}
                              className="bg-slate-700 hover:bg-slate-800 text-white text-xs px-3 py-2 rounded"
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => eliminarParto(parto)}
                              disabled={eliminandoId === parto.id}
                              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs px-3 py-2 rounded"
                            >
                              {eliminandoId === parto.id ? 'Eliminando…' : 'Eliminar'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={guardarEdicion}
                              disabled={guardandoEdicionId === parto.id}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs px-3 py-2 rounded"
                            >
                              {guardandoEdicionId === parto.id ? 'Guardando…' : 'Guardar'}
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
        </section>
      </div>
    </div>
  )
}
