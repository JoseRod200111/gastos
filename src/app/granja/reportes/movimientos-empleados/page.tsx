'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type MovimientoGranja = {
  id: number
  fecha: string
  tipo: string
  cantidad: number | null
  hembras: number | null
  machos: number | null
  peso_total_kg: number | null
  ubicacion_id: number | null
  lote_id: number | null
  referencia_tabla: string | null
  referencia_id: number | null
  observaciones: string | null
  user_id: string | null
  created_at?: string | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
}

type EventoCerda = {
  id: number
  cerda_id: number
  fecha: string
  tipo: string
  resultado: string | null
  ubicacion_id: number | null
  lote_id: number | null
  datos: Record<string, unknown> | null
  observaciones: string | null
  user_id: string | null
  created_at?: string | null
  granja_cerdas?: {
    arete: string | null
    nombre: string | null
  } | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
}

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Usuario = {
  id: string
  email?: string | null
  nombre?: string | null
  full_name?: string | null
  name?: string | null
  [key: string]: unknown
}

type AccionEmpleado = {
  id: string
  origen: 'MOVIMIENTO_INVENTARIO' | 'EVENTO_CERDA'
  fecha: string
  hora: string
  fechaEvento: string
  horaEvento: string
  fechaRegistro: string
  horaRegistro: string
  fechaHoraEventoOrden: string
  fechaHoraRegistroOrden: string
  fechaHoraOrden: string
  diasDiferenciaRegistro: number
  usuarioId: string | null
  usuarioTexto: string
  seccion: string
  tipoAccion: string
  ubicacionId: number | null
  ubicacionCodigo: string
  ubicacionTexto: string
  loteTexto: string
  referencia: string
  cantidad: number
  entradas: number
  salidas: number
  ajustes: number
  cambioNeto: number
  observaciones: string
  detalle: string
  busqueda: string
}

type ResumenUbicacion = {
  ubicacion: string
  entradas: number
  salidas: number
  ajustes: number
  cambioNeto: number
  movimientos: number
}

const pad = (n: number) => String(n).padStart(2, '0')

const hoyYYYYMMDD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const restarDias = (fecha: string, dias: number) => {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() - dias)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const normalizar = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const formatFecha = (value?: string | null) => {
  if (!value) return '—'
  return String(value).slice(0, 10)
}

const formatHora = (value?: string | null) => {
  if (!value) return '—'

  const raw = String(value)

  if (raw.includes('T')) {
    const hora = raw.split('T')[1]?.slice(0, 8)
    return hora || '—'
  }

  if (raw.length >= 19) {
    return raw.slice(11, 19)
  }

  return '—'
}

const fechaEventoValor = (fecha?: string | null) => {
  if (!fecha) return ''

  const raw = String(fecha)
  if (raw.length === 10) return `${raw}T12:00:00`
  return raw
}

const fechaRegistroValor = (createdAt?: string | null) => {
  if (!createdAt) return ''
  return String(createdAt)
}

const diffDiasFecha = (fechaEvento?: string | null, fechaRegistro?: string | null) => {
  if (!fechaEvento || !fechaRegistro) return 0

  const evento = new Date(formatFecha(fechaEvento) + 'T00:00:00')
  const registro = new Date(formatFecha(fechaRegistro) + 'T00:00:00')

  const diff = registro.getTime() - evento.getTime()
  if (!Number.isFinite(diff)) return 0

  return Math.round(diff / (24 * 60 * 60 * 1000))
}

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const ubicacionTexto = (
  u?: { codigo: string | null; nombre: string | null } | null
) => {
  if (!u) return '—'

  const codigo = u.codigo || ''
  const nombre = u.nombre || ''

  if (!codigo && !nombre) return '—'

  return `${codigo}${nombre ? ` — ${nombre}` : ''}`
}

const loteTexto = (l?: { codigo: string | null } | null) => {
  if (!l?.codigo) return '—'
  return l.codigo
}

const limpiarTramo = (value: string) => {
  const v = value.trim().toUpperCase()

  if (!v) return ''

  return v.replace(/^TR0+/, 'TR')
}

const tipoMovimientoLegible = (tipo: string) => {
  const t = String(tipo || '').toUpperCase()

  if (t === 'ENTRADA_COMPRA') return 'Entrada por compra'
  if (t === 'ENTRADA_PARTO') return 'Entrada por parto'
  if (t === 'SALIDA_VENTA') return 'Salida por venta'
  if (t === 'SALIDA_MUERTE') return 'Salida por muerte'
  if (t === 'AJUSTE') return 'Ajuste / traslado'
  if (t === 'TRASLADO') return 'Traslado'

  return t || 'Movimiento'
}

const tipoEventoLegible = (tipo: string) => {
  const t = String(tipo || '').toUpperCase()

  if (t === 'MONTA') return 'Monta'
  if (t === 'INSEMINACION') return 'Inseminación'
  if (t === 'REVISION_EMBARAZO') return 'Revisión embarazo'
  if (t === 'PARTO') return 'Parto'
  if (t === 'DESTETE') return 'Destete'
  if (t === 'ABORTO') return 'Aborto'
  if (t === 'MEDICACION') return 'Medicación'
  if (t === 'MUERTE') return 'Muerte'
  if (t === 'BAJA') return 'Baja'
  if (t === 'TRASLADO') return 'Traslado de cerda'

  return t || 'Evento'
}

const clasificarMovimiento = (mov: MovimientoGranja) => {
  const tipo = String(mov.tipo || '').toUpperCase()
  const cantidad = toNum(mov.cantidad)

  if (tipo.startsWith('ENTRADA')) {
    return {
      entradas: Math.abs(cantidad),
      salidas: 0,
      ajustes: 0,
      cambioNeto: Math.abs(cantidad),
    }
  }

  if (tipo.startsWith('SALIDA')) {
    return {
      entradas: 0,
      salidas: Math.abs(cantidad),
      ajustes: 0,
      cambioNeto: -Math.abs(cantidad),
    }
  }

  if (tipo === 'AJUSTE') {
    return {
      entradas: 0,
      salidas: 0,
      ajustes: cantidad,
      cambioNeto: cantidad,
    }
  }

  if (cantidad > 0) {
    return {
      entradas: cantidad,
      salidas: 0,
      ajustes: 0,
      cambioNeto: cantidad,
    }
  }

  if (cantidad < 0) {
    return {
      entradas: 0,
      salidas: Math.abs(cantidad),
      ajustes: 0,
      cambioNeto: cantidad,
    }
  }

  return {
    entradas: 0,
    salidas: 0,
    ajustes: 0,
    cambioNeto: 0,
  }
}

const detalleDatosEvento = (ev: EventoCerda) => {
  const datos = ev.datos || {}
  const tipo = String(ev.tipo || '').toUpperCase()

  if (tipo === 'PARTO') {
    return [
      `Vivos: ${datos.nacidos_vivos ?? '—'}`,
      `Muertos: ${datos.nacidos_muertos ?? '—'}`,
      `Momias: ${datos.momias ?? '—'}`,
      `Hembras: ${datos.hembras ?? '—'}`,
      `Machos: ${datos.machos ?? '—'}`,
    ].join(' · ')
  }

  if (tipo === 'DESTETE') {
    return [
      `Destetados: ${datos.cantidad_destetada ?? '—'}`,
      `Hembras: ${datos.hembras ?? '—'}`,
      `Machos: ${datos.machos ?? '—'}`,
      datos.destino_ubicacion_id ? `Destino ID: ${datos.destino_ubicacion_id}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  if (tipo === 'MONTA' || tipo === 'INSEMINACION') {
    return `Macho: ${datos.macho ?? '—'}`
  }

  if (tipo === 'REVISION_EMBARAZO') {
    return `Resultado: ${ev.resultado || datos.resultado_revision || '—'}`
  }

  if (tipo === 'ABORTO') {
    return `Fetos: ${datos.fetos ?? '—'} · Motivo: ${datos.motivo ?? '—'}`
  }

  if (tipo === 'MEDICACION') {
    return [
      `Medicamento: ${datos.medicamento ?? '—'}`,
      `Dosis: ${datos.dosis ?? '—'}`,
      `Vía: ${datos.via_aplicacion ?? '—'}`,
      `Responsable: ${datos.responsable ?? '—'}`,
    ].join(' · ')
  }

  if (tipo === 'MUERTE' || tipo === 'BAJA') {
    return `Motivo: ${datos.motivo ?? ev.observaciones ?? '—'}`
  }

  if (tipo === 'TRASLADO') {
    return [
      `Origen ID: ${datos.origen_ubicacion_id ?? '—'}`,
      `Destino ID: ${datos.destino_ubicacion_id ?? ev.ubicacion_id ?? '—'}`,
    ].join(' · ')
  }

  return ''
}

const obtenerTextoUsuario = (usuario?: Usuario | null) => {
  if (!usuario) return null

  const email = String(usuario.email || '').trim()
  const nombre = String(usuario.nombre || usuario.full_name || usuario.name || '').trim()

  if (email && nombre) return `${nombre} (${email})`
  if (email) return email
  if (nombre) return nombre

  return null
}

function generarPdf(
  acciones: AccionEmpleado[],
  resumen: ResumenUbicacion[],
  filtros: {
    desdeFecha: string
    desdeHora: string
    hastaFecha: string
    hastaHora: string
    seccion: string
    usuario: string
    ubicacion: string
    tipo: string
    texto: string
    tipoFecha: string
  }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(15)
  doc.text('Reporte de movimientos de empleados', 14, 14)

  doc.setFontSize(9)
  doc.text(
    `Rango: ${filtros.desdeFecha} ${filtros.desdeHora || '00:00'} a ${filtros.hastaFecha} ${
      filtros.hastaHora || '23:59'
    } · Fecha usada: ${filtros.tipoFecha || 'Registro'}`,
    14,
    21
  )

  doc.text(
    `Sección: ${filtros.seccion || 'Todas'} · Usuario: ${
      filtros.usuario || 'Todos'
    } · Ubicación: ${filtros.ubicacion || 'Todas'} · Tipo: ${
      filtros.tipo || 'Todos'
    }`,
    14,
    27
  )

  if (filtros.texto.trim()) {
    doc.text(`Búsqueda: ${filtros.texto}`, 14, 33)
  }

  autoTable(doc, {
    startY: filtros.texto.trim() ? 39 : 34,
    head: [['Ubicación', 'Entradas', 'Salidas', 'Ajustes', 'Cambio neto', 'Movimientos']],
    body: resumen.map((row) => [
      row.ubicacion,
      String(row.entradas),
      String(row.salidas),
      String(row.ajustes),
      String(row.cambioNeto),
      String(row.movimientos),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const y =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 50

  autoTable(doc, {
    startY: y + 8,
    head: [
      [
        'Fecha evento',
        'Hora evento',
        'Fecha registro',
        'Hora registro',
        'Usuario',
        'Sección',
        'Tipo',
        'Ubicación',
        'Referencia',
        'Cambio',
        'Detalle / observación',
      ],
    ],
    body: acciones.map((a) => [
      a.fechaEvento,
      a.horaEvento,
      a.fechaRegistro,
      a.horaRegistro,
      a.usuarioTexto,
      a.seccion,
      a.tipoAccion,
      a.ubicacionCodigo,
      a.referencia,
      String(a.cambioNeto),
      `${a.detalle}${a.observaciones ? ` · ${a.observaciones}` : ''}`,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 15 },
      2: { cellWidth: 19 },
      3: { cellWidth: 15 },
      4: { cellWidth: 37 },
      5: { cellWidth: 24 },
      6: { cellWidth: 30 },
      7: { cellWidth: 24 },
      8: { cellWidth: 32 },
      9: { cellWidth: 14, halign: 'right' },
      10: { cellWidth: 62 },
    },
  })

  const now = new Date()
  const name = `reporte_movimientos_empleados_${now
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.pdf`

  doc.save(name)
}

export default function MovimientosEmpleadosPage() {
  const [movimientos, setMovimientos] = useState<MovimientoGranja[]>([])
  const [eventosCerdas, setEventosCerdas] = useState<EventoCerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const [loading, setLoading] = useState(false)

  const [desdeFecha, setDesdeFecha] = useState('')
  const [hastaFecha, setHastaFecha] = useState('')
  const [desdeHora, setDesdeHora] = useState('00:00')
  const [hastaHora, setHastaHora] = useState('23:59')

  const [seccion, setSeccion] = useState('GRANJA')
  const [usuarioFiltro, setUsuarioFiltro] = useState('')
  const [ubicacionFiltro, setUbicacionFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [textoFiltro, setTextoFiltro] = useState('')
  const [tipoFechaFiltro, setTipoFechaFiltro] = useState<'REGISTRO' | 'EVENTO' | 'AMBAS'>('REGISTRO')

  useEffect(() => {
    const hoy = hoyYYYYMMDD()
    setHastaFecha(hoy)
    setDesdeFecha(restarDias(hoy, 7))
  }, [])

  const desdeISO = useMemo(() => {
    if (!desdeFecha) return ''
    return `${desdeFecha}T${desdeHora || '00:00'}:00`
  }, [desdeFecha, desdeHora])

  const hastaISO = useMemo(() => {
    if (!hastaFecha) return ''
    return `${hastaFecha}T${hastaHora || '23:59'}:59`
  }, [hastaFecha, hastaHora])

  const usuarioTexto = useCallback(
    (userId: string | null) => {
      if (!userId) return 'Sin usuario'

      const encontrado = usuarios.find((u) => u.id === userId)
      const texto = obtenerTextoUsuario(encontrado)

      if (texto) return texto

      return `Usuario ${userId.slice(0, 8)}`
    },
    [usuarios]
  )

  const cargarDatos = useCallback(async () => {
    if (!desdeISO || !hastaISO || !desdeFecha || !hastaFecha) return

    setLoading(true)

    try {
      const selectMovimientos = `
            id,
            fecha,
            tipo,
            cantidad,
            hembras,
            machos,
            peso_total_kg,
            ubicacion_id,
            lote_id,
            referencia_tabla,
            referencia_id,
            observaciones,
            user_id,
            created_at,
            granja_ubicaciones (
              codigo,
              nombre
            ),
            granja_lotes (
              codigo
            )
          `

      const selectEventos = `
            id,
            cerda_id,
            fecha,
            tipo,
            resultado,
            ubicacion_id,
            lote_id,
            datos,
            observaciones,
            user_id,
            created_at,
            granja_cerdas (
              arete,
              nombre
            ),
            granja_ubicaciones (
              codigo,
              nombre
            ),
            granja_lotes (
              codigo
            )
          `

      const cargarMovimientosPorRegistro = async () => {
        const { data, error } = await supabase
          .from('granja_movimientos')
          .select(selectMovimientos)
          .gte('created_at', desdeISO)
          .lte('created_at', hastaISO)
          .order('created_at', { ascending: false })

        if (error) throw error
        return (data || []) as unknown as MovimientoGranja[]
      }

      const cargarMovimientosPorEvento = async () => {
        const { data, error } = await supabase
          .from('granja_movimientos')
          .select(selectMovimientos)
          .gte('fecha', desdeISO)
          .lte('fecha', hastaISO)
          .order('fecha', { ascending: false })

        if (error) throw error
        return (data || []) as unknown as MovimientoGranja[]
      }

      const cargarEventosPorRegistro = async () => {
        const { data, error } = await supabase
          .from('granja_cerda_eventos')
          .select(selectEventos)
          .gte('created_at', desdeISO)
          .lte('created_at', hastaISO)
          .order('created_at', { ascending: false })

        if (error) throw error
        return (data || []) as unknown as EventoCerda[]
      }

      const cargarEventosPorEvento = async () => {
        const { data, error } = await supabase
          .from('granja_cerda_eventos')
          .select(selectEventos)
          .gte('fecha', desdeFecha)
          .lte('fecha', hastaFecha)
          .order('fecha', { ascending: false })

        if (error) throw error
        return (data || []) as unknown as EventoCerda[]
      }

      const combinarMovimientos = (listas: MovimientoGranja[][]) => {
        const map = new Map<number, MovimientoGranja>()
        listas.flat().forEach((row) => map.set(row.id, row))
        return Array.from(map.values()).sort((a, b) => {
          const fechaA = fechaRegistroValor(a.created_at) || fechaEventoValor(a.fecha)
          const fechaB = fechaRegistroValor(b.created_at) || fechaEventoValor(b.fecha)
          return fechaB.localeCompare(fechaA)
        })
      }

      const combinarEventos = (listas: EventoCerda[][]) => {
        const map = new Map<number, EventoCerda>()
        listas.flat().forEach((row) => map.set(row.id, row))
        return Array.from(map.values()).sort((a, b) => {
          const fechaA = fechaRegistroValor(a.created_at) || fechaEventoValor(a.fecha)
          const fechaB = fechaRegistroValor(b.created_at) || fechaEventoValor(b.fecha)
          return fechaB.localeCompare(fechaA)
        })
      }

      let movs: MovimientoGranja[] = []
      let evs: EventoCerda[] = []

      if (tipoFechaFiltro === 'REGISTRO') {
        const [movimientosRegistro, eventosRegistro] = await Promise.all([
          cargarMovimientosPorRegistro(),
          cargarEventosPorRegistro(),
        ])

        movs = movimientosRegistro
        evs = eventosRegistro
      } else if (tipoFechaFiltro === 'EVENTO') {
        const [movimientosEvento, eventosEvento] = await Promise.all([
          cargarMovimientosPorEvento(),
          cargarEventosPorEvento(),
        ])

        movs = movimientosEvento
        evs = eventosEvento
      } else {
        const [movimientosRegistro, movimientosEvento, eventosRegistro, eventosEvento] =
          await Promise.all([
            cargarMovimientosPorRegistro(),
            cargarMovimientosPorEvento(),
            cargarEventosPorRegistro(),
            cargarEventosPorEvento(),
          ])

        movs = combinarMovimientos([movimientosRegistro, movimientosEvento])
        evs = combinarEventos([eventosRegistro, eventosEvento])
      }

      const { data: ubicacionesData, error: ubicacionesError } = await supabase
        .from('granja_ubicaciones')
        .select('id,codigo,nombre')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (ubicacionesError) {
        console.error('Error ubicaciones', ubicacionesError)
      }

      setMovimientos(movs)
      setEventosCerdas(evs)
      setUbicaciones((ubicacionesData || []) as Ubicacion[])

      const userIds = Array.from(
        new Set(
          [...movs.map((m) => m.user_id), ...evs.map((e) => e.user_id)].filter(
            Boolean
          ) as string[]
        )
      )

      if (userIds.length > 0) {
        const { data: perfiles, error: perfilesError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds)

        if (!perfilesError && perfiles) {
          setUsuarios(perfiles as Usuario[])
        } else {
          console.error('No se pudieron cargar perfiles de usuario:', perfilesError)
          setUsuarios(userIds.map((id) => ({ id, email: null })))
        }
      } else {
        setUsuarios([])
      }
    } catch (error) {
      console.error('Error cargando movimientos de empleados', error)
      const message = error instanceof Error ? error.message : 'Error desconocido'
      alert(`Error cargando movimientos de empleados: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [desdeISO, hastaISO, desdeFecha, hastaFecha, tipoFechaFiltro])

  useEffect(() => {
    if (desdeISO && hastaISO) {
      cargarDatos()
    }
  }, [desdeISO, hastaISO, cargarDatos])

  const accionesBase = useMemo(() => {
    const accionesMovimientos: AccionEmpleado[] = movimientos.map((mov) => {
      const clase = clasificarMovimiento(mov)
      const fechaEvento = fechaEventoValor(mov.fecha)
      const fechaRegistro = fechaRegistroValor(mov.created_at)
      const fechaHora = tipoFechaFiltro === 'EVENTO' ? fechaEvento : fechaRegistro || fechaEvento
      const ubicacion = ubicacionTexto(mov.granja_ubicaciones)
      const codigo = mov.granja_ubicaciones?.codigo || '—'
      const tipoLegible = tipoMovimientoLegible(mov.tipo)

      const referencia = [
        mov.referencia_tabla || '',
        mov.referencia_id ? `#${mov.referencia_id}` : '',
      ]
        .filter(Boolean)
        .join(' ')

      const detalle = [
        `Cantidad: ${mov.cantidad ?? 0}`,
        mov.hembras !== null && mov.hembras !== undefined
          ? `Hembras: ${mov.hembras}`
          : '',
        mov.machos !== null && mov.machos !== undefined ? `Machos: ${mov.machos}` : '',
        mov.peso_total_kg !== null && mov.peso_total_kg !== undefined
          ? `Peso: ${mov.peso_total_kg} kg`
          : '',
        mov.granja_lotes?.codigo ? `Lote: ${mov.granja_lotes.codigo}` : '',
      ]
        .filter(Boolean)
        .join(' · ')

      const usuario = usuarioTexto(mov.user_id)

      const busqueda = [
        mov.tipo,
        tipoLegible,
        ubicacion,
        codigo,
        mov.observaciones,
        referencia,
        detalle,
        usuario,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return {
        id: `mov-${mov.id}`,
        origen: 'MOVIMIENTO_INVENTARIO',
        fecha: formatFecha(fechaHora),
        hora: formatHora(fechaHora),
        fechaEvento: formatFecha(fechaEvento),
        horaEvento: formatHora(fechaEvento),
        fechaRegistro: formatFecha(fechaRegistro),
        horaRegistro: formatHora(fechaRegistro),
        fechaHoraEventoOrden: fechaEvento,
        fechaHoraRegistroOrden: fechaRegistro,
        fechaHoraOrden: fechaHora,
        diasDiferenciaRegistro: diffDiasFecha(fechaEvento, fechaRegistro),
        usuarioId: mov.user_id,
        usuarioTexto: usuario,
        seccion: 'Inventario granja',
        tipoAccion: tipoLegible,
        ubicacionId: mov.ubicacion_id,
        ubicacionCodigo: codigo,
        ubicacionTexto: ubicacion,
        loteTexto: loteTexto(mov.granja_lotes),
        referencia,
        cantidad: toNum(mov.cantidad),
        entradas: clase.entradas,
        salidas: clase.salidas,
        ajustes: clase.ajustes,
        cambioNeto: clase.cambioNeto,
        observaciones: mov.observaciones || '',
        detalle,
        busqueda,
      }
    })

    const accionesEventos: AccionEmpleado[] = eventosCerdas.map((ev) => {
      const fechaEvento = fechaEventoValor(ev.fecha)
      const fechaRegistro = fechaRegistroValor(ev.created_at)
      const fechaHora = tipoFechaFiltro === 'EVENTO' ? fechaEvento : fechaRegistro || fechaEvento
      const ubicacion = ubicacionTexto(ev.granja_ubicaciones)
      const codigo = ev.granja_ubicaciones?.codigo || '—'
      const tipoLegible = tipoEventoLegible(ev.tipo)

      const arete = ev.granja_cerdas?.arete || '—'
      const nombre = ev.granja_cerdas?.nombre || ''

      const referencia = `Cerda ${arete}${nombre ? ` — ${nombre}` : ''}`
      const detalle = detalleDatosEvento(ev)

      let entradas = 0
      let salidas = 0
      const ajustes = 0
      let cambioNeto = 0

      const tipo = String(ev.tipo || '').toUpperCase()
      const datos = ev.datos || {}

      if (tipo === 'PARTO') {
        entradas = toNum(datos.nacidos_vivos)
        cambioNeto = entradas
      }

      if (tipo === 'MUERTE' || tipo === 'BAJA') {
        salidas = 1
        cambioNeto = -1
      }

      const usuario = usuarioTexto(ev.user_id)

      const busqueda = [
        ev.tipo,
        tipoLegible,
        ev.resultado,
        ubicacion,
        codigo,
        ev.observaciones,
        referencia,
        detalle,
        usuario,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return {
        id: `cerda-evento-${ev.id}`,
        origen: 'EVENTO_CERDA',
        fecha: formatFecha(fechaHora),
        hora: formatHora(fechaHora),
        fechaEvento: formatFecha(fechaEvento),
        horaEvento: formatHora(fechaEvento),
        fechaRegistro: formatFecha(fechaRegistro),
        horaRegistro: formatHora(fechaRegistro),
        fechaHoraEventoOrden: fechaEvento,
        fechaHoraRegistroOrden: fechaRegistro,
        fechaHoraOrden: fechaHora,
        diasDiferenciaRegistro: diffDiasFecha(fechaEvento, fechaRegistro),
        usuarioId: ev.user_id,
        usuarioTexto: usuario,
        seccion: 'Eventos de cerdas',
        tipoAccion: tipoLegible,
        ubicacionId: ev.ubicacion_id,
        ubicacionCodigo: codigo,
        ubicacionTexto: ubicacion,
        loteTexto: loteTexto(ev.granja_lotes),
        referencia,
        cantidad: cambioNeto,
        entradas,
        salidas,
        ajustes,
        cambioNeto,
        observaciones: ev.observaciones || '',
        detalle,
        busqueda,
      }
    })

    return [...accionesMovimientos, ...accionesEventos].sort((a, b) =>
      b.fechaHoraOrden.localeCompare(a.fechaHoraOrden)
    )
  }, [movimientos, eventosCerdas, usuarioTexto, tipoFechaFiltro])

  const tiposDisponibles = useMemo(() => {
    return Array.from(new Set(accionesBase.map((a) => a.tipoAccion))).sort((a, b) =>
      a.localeCompare(b, 'es')
    )
  }, [accionesBase])

  const accionesFiltradas = useMemo(() => {
    const texto = normalizar(textoFiltro)
    const tramoBuscado = limpiarTramo(textoFiltro)

    return accionesBase.filter((a) => {
      if (seccion && seccion !== 'TODAS') {
        if (seccion === 'GRANJA' && !a.seccion.toLowerCase().includes('granja')) {
          return false
        }

        if (seccion === 'EVENTOS_CERDAS' && a.origen !== 'EVENTO_CERDA') {
          return false
        }

        if (seccion === 'INVENTARIO' && a.origen !== 'MOVIMIENTO_INVENTARIO') {
          return false
        }
      }

      if (usuarioFiltro && a.usuarioId !== usuarioFiltro) return false

      if (ubicacionFiltro && String(a.ubicacionId || '') !== ubicacionFiltro) {
        return false
      }

      if (tipoFiltro && a.tipoAccion !== tipoFiltro) return false

      if (texto) {
        const normal = a.busqueda
        const codigoUbicacion = limpiarTramo(a.ubicacionCodigo)

        if (
          !normal.includes(texto) &&
          !(tramoBuscado && codigoUbicacion.includes(tramoBuscado))
        ) {
          return false
        }
      }

      return true
    })
  }, [
    accionesBase,
    seccion,
    usuarioFiltro,
    ubicacionFiltro,
    tipoFiltro,
    textoFiltro,
  ])

  const resumen = useMemo(() => {
    const map = new Map<string, ResumenUbicacion>()

    accionesFiltradas.forEach((a) => {
      const key = a.ubicacionCodigo || '—'

      if (!map.has(key)) {
        map.set(key, {
          ubicacion: key,
          entradas: 0,
          salidas: 0,
          ajustes: 0,
          cambioNeto: 0,
          movimientos: 0,
        })
      }

      const row = map.get(key)!

      row.entradas += a.entradas
      row.salidas += a.salidas
      row.ajustes += a.ajustes
      row.cambioNeto += a.cambioNeto
      row.movimientos += 1
    })

    return Array.from(map.values()).sort((a, b) =>
      a.ubicacion.localeCompare(b.ubicacion, 'es', {
        numeric: true,
        sensitivity: 'base',
      })
    )
  }, [accionesFiltradas])

  const totalEntradas = accionesFiltradas.reduce((sum, a) => sum + a.entradas, 0)
  const totalSalidas = accionesFiltradas.reduce((sum, a) => sum + a.salidas, 0)
  const totalAjustes = accionesFiltradas.reduce((sum, a) => sum + a.ajustes, 0)
  const totalCambio = accionesFiltradas.reduce((sum, a) => sum + a.cambioNeto, 0)
  const totalRegistrosTardios = accionesFiltradas.filter((a) => a.diasDiferenciaRegistro > 0).length

  const imprimirPdf = () => {
    generarPdf(accionesFiltradas, resumen, {
      desdeFecha,
      desdeHora,
      hastaFecha,
      hastaHora,
      seccion,
      usuario: usuarioFiltro,
      ubicacion: ubicacionFiltro,
      tipo: tipoFiltro,
      texto: textoFiltro,
      tipoFecha:
        tipoFechaFiltro === 'REGISTRO'
          ? 'Fecha de registro'
          : tipoFechaFiltro === 'EVENTO'
            ? 'Fecha del evento'
            : 'Registro o evento',
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={150} height={60} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Movimientos de empleados</h1>
          <p className="text-xs text-gray-600">
            Busca cambios por fecha del evento, fecha de registro, hora, usuario, ubicación, tipo de acción y referencia.
          </p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Volver
        </Link>
      </div>

      <div className="border rounded-lg bg-white p-4 mb-4">
        <h2 className="font-semibold mb-3">Filtros de búsqueda</h2>

        <div className="grid md:grid-cols-7 gap-3 text-sm">
          <div>
            <label className="block text-xs font-semibold mb-1">Buscar por fecha</label>
            <select
              className="border rounded p-2 w-full"
              value={tipoFechaFiltro}
              onChange={(e) => setTipoFechaFiltro(e.target.value as 'REGISTRO' | 'EVENTO' | 'AMBAS')}
            >
              <option value="REGISTRO">Registro</option>
              <option value="EVENTO">Evento</option>
              <option value="AMBAS">Ambas</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Desde fecha</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={desdeFecha}
              onChange={(e) => setDesdeFecha(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Desde hora</label>
            <input
              type="time"
              className="border rounded p-2 w-full"
              value={desdeHora}
              onChange={(e) => setDesdeHora(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Hasta fecha</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={hastaFecha}
              onChange={(e) => setHastaFecha(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Hasta hora</label>
            <input
              type="time"
              className="border rounded p-2 w-full"
              value={hastaHora}
              onChange={(e) => setHastaHora(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Sección</label>
            <select
              className="border rounded p-2 w-full"
              value={seccion}
              onChange={(e) => setSeccion(e.target.value)}
            >
              <option value="TODAS">Todas</option>
              <option value="GRANJA">Granja</option>
              <option value="INVENTARIO">Inventario granja</option>
              <option value="EVENTOS_CERDAS">Eventos de cerdas</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Usuario</label>
            <select
              className="border rounded p-2 w-full"
              value={usuarioFiltro}
              onChange={(e) => setUsuarioFiltro(e.target.value)}
            >
              <option value="">Todos los usuarios</option>
              {usuarios.map((u) => {
                const texto = obtenerTextoUsuario(u) || `Usuario ${u.id.slice(0, 8)}`
                return (
                  <option key={u.id} value={u.id}>
                    {texto}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-[180px_220px_1fr] gap-3 text-sm mt-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Tramo / ubicación</label>
            <select
              className="border rounded p-2 w-full"
              value={ubicacionFiltro}
              onChange={(e) => setUbicacionFiltro(e.target.value)}
            >
              <option value="">Todas</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo}
                  {u.nombre ? ` — ${u.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Tipo de acción</label>
            <select
              className="border rounded p-2 w-full"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              {tiposDisponibles.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              Buscar texto, referencia, arete, tramo u observación
            </label>
            <input
              className="border rounded p-2 w-full"
              value={textoFiltro}
              onChange={(e) => setTextoFiltro(e.target.value)}
              placeholder="Ej: AR1023, parto, destete, TR8, traslado, baja..."
            />
            <div className="text-[11px] text-gray-500 mt-1">
              TR8 y TR08 se buscan como el mismo tramo. Usa &quot;Registro&quot; para ver cuándo se capturó en el sistema y &quot;Evento&quot; para ver la fecha real asignada al movimiento.
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>

          <button
            onClick={imprimirPdf}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
          >
            Imprimir PDF
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-4">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Entradas</div>
          <div className="text-xl font-bold text-emerald-700">+{totalEntradas}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Salidas</div>
          <div className="text-xl font-bold text-red-700">-{totalSalidas}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Ajustes</div>
          <div
            className={`text-xl font-bold ${
              totalAjustes > 0
                ? 'text-emerald-700'
                : totalAjustes < 0
                  ? 'text-red-700'
                  : ''
            }`}
          >
            {totalAjustes > 0 ? `+${totalAjustes}` : totalAjustes}
          </div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Cambio neto</div>
          <div
            className={`text-xl font-bold ${
              totalCambio > 0
                ? 'text-emerald-700'
                : totalCambio < 0
                  ? 'text-red-700'
                  : ''
            }`}
          >
            {totalCambio > 0 ? `+${totalCambio}` : totalCambio}
          </div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Registrados tarde</div>
          <div className="text-xl font-bold text-amber-700">
            {totalRegistrosTardios}
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white mb-4 overflow-hidden">
        <h2 className="font-semibold p-3 border-b">Resumen por tramo / ubicación</h2>

        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-200 sticky top-0">
              <tr>
                <th className="p-2 text-left">Ubicación</th>
                <th className="p-2 text-right">Entradas</th>
                <th className="p-2 text-right">Salidas</th>
                <th className="p-2 text-right">Ajustes</th>
                <th className="p-2 text-right">Cambio neto</th>
                <th className="p-2 text-right">Movimientos</th>
              </tr>
            </thead>

            <tbody>
              {resumen.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-3 text-gray-500">
                    No hay datos para mostrar.
                  </td>
                </tr>
              ) : (
                resumen.map((row) => (
                  <tr key={row.ubicacion} className="border-t">
                    <td className="p-2">{row.ubicacion}</td>
                    <td className="p-2 text-right text-emerald-700">
                      +{row.entradas}
                    </td>
                    <td className="p-2 text-right text-red-700">
                      -{row.salidas}
                    </td>
                    <td
                      className={`p-2 text-right ${
                        row.ajustes > 0
                          ? 'text-emerald-700'
                          : row.ajustes < 0
                            ? 'text-red-700'
                            : ''
                      }`}
                    >
                      {row.ajustes > 0 ? `+${row.ajustes}` : row.ajustes}
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        row.cambioNeto > 0
                          ? 'text-emerald-700'
                          : row.cambioNeto < 0
                            ? 'text-red-700'
                            : ''
                      }`}
                    >
                      {row.cambioNeto > 0 ? `+${row.cambioNeto}` : row.cambioNeto}
                    </td>
                    <td className="p-2 text-right">{row.movimientos}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <h2 className="font-semibold p-3 border-b">
          Detalle de acciones realizadas
        </h2>

        <div className="overflow-auto max-h-[620px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-200 sticky top-0">
              <tr>
                <th className="p-2 text-left">Fecha evento</th>
                <th className="p-2 text-left">Hora evento</th>
                <th className="p-2 text-left">Fecha registro</th>
                <th className="p-2 text-left">Hora registro</th>
                <th className="p-2 text-left">Usuario</th>
                <th className="p-2 text-left">Sección</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-left">Ubicación</th>
                <th className="p-2 text-left">Referencia</th>
                <th className="p-2 text-right">Cambio</th>
                <th className="p-2 text-left">Detalle / observación</th>
              </tr>
            </thead>

            <tbody>
              {accionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-3 text-gray-500">
                    No hay acciones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                accionesFiltradas.map((a) => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="p-2">{a.fechaEvento}</td>
                    <td className="p-2">{a.horaEvento}</td>
                    <td className="p-2">{a.fechaRegistro}</td>
                    <td className="p-2">{a.horaRegistro}</td>
                    <td className="p-2">{a.usuarioTexto}</td>
                    <td className="p-2">{a.seccion}</td>
                    <td className="p-2 font-semibold">{a.tipoAccion}</td>
                    <td className="p-2">{a.ubicacionTexto}</td>
                    <td className="p-2">{a.referencia || '—'}</td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        a.cambioNeto > 0
                          ? 'text-emerald-700'
                          : a.cambioNeto < 0
                            ? 'text-red-700'
                            : ''
                      }`}
                    >
                      {a.cambioNeto > 0 ? `+${a.cambioNeto}` : a.cambioNeto}
                    </td>
                    <td className="p-2">
                      <div>{a.detalle || '—'}</div>
                      {a.observaciones ? (
                        <div className="text-gray-500 mt-1">{a.observaciones}</div>
                      ) : null}
                      {a.diasDiferenciaRegistro > 0 ? (
                        <div className="text-amber-700 mt-1">
                          Registrado {a.diasDiferenciaRegistro} día(s) después del evento.
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
