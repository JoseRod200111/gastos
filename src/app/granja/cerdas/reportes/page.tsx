'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
}

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_lb: number | null
  paridad: number | null
  notas: string | null
  activa: boolean
  created_at: string | null
  updated_at: string | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
}

type CerdaEvento = {
  id: number
  cerda_id: number
  fecha: string
  tipo: string
  resultado: string | null
  ubicacion_id: number | null
  lote_id: number | null
  datos: unknown
  observaciones: string | null
  created_at: string | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
  granja_lotes?: {
    codigo: string | null
  } | null
}

type FormCerda = {
  arete: string
  nombre: string
  estado: string
  ubicacion_id: string
  lote_id: string
  fecha_nacimiento: string
  peso_lb: string
  paridad: string
  notas: string
  activa: boolean
}

type ReporteTipo =
  | 'PARTOS_PROXIMOS'
  | 'REVISION_CELO'
  | 'PROXIMOS_DESTETES'
  | 'HEMBRAS_VACIAS'
  | 'MONTAS'
  | 'REPETICIONES'
  | 'ABORTOS'
  | 'PARTOS_INTERVALO'
  | 'RESUMEN_REPRODUCTIVO'

type ReporteGenerado = {
  titulo: string
  columnas: string[]
  filas: string[][]
  resumen: Array<[string, string]>
}

const ESTADOS_CERDA = [
  'VACIA',
  'SERVIDA',
  'PRENADA',
  'LACTANDO',
  'DESTETADA',
  'ABORTO',
  'MUERTA',
  'BAJA',
]

const REPORTES: Array<{ value: ReporteTipo; label: string; ayuda: string }> = [
  {
    value: 'PARTOS_PROXIMOS',
    label: 'Partos próximos por intervalo',
    ayuda: 'Usa la última monta o inseminación y estima parto a 115 días.',
  },
  {
    value: 'REVISION_CELO',
    label: 'Revisión de celo',
    ayuda: 'Muestra hembras que podrían requerir revisión de celo o servicio.',
  },
  {
    value: 'PROXIMOS_DESTETES',
    label: 'Próximos destetes por intervalo',
    ayuda: 'Usa el último parto y estima destete a 21 días.',
  },
  {
    value: 'HEMBRAS_VACIAS',
    label: 'Hembras vacías y días vacías',
    ayuda: 'Calcula días desde último destete, aborto, baja de preñez o registro.',
  },
  {
    value: 'MONTAS',
    label: 'Montas / inseminaciones',
    ayuda: 'Eventos de monta e inseminación en el intervalo.',
  },
  {
    value: 'REPETICIONES',
    label: 'Repeticiones',
    ayuda: 'Busca eventos marcados como repetición o revisión negativa.',
  },
  {
    value: 'ABORTOS',
    label: 'Abortos',
    ayuda: 'Eventos de aborto en el intervalo.',
  },
  {
    value: 'PARTOS_INTERVALO',
    label: 'Partos por intervalo',
    ayuda: 'Detalle de partos, nacidos vivos, muertos, momias y totales.',
  },
  {
    value: 'RESUMEN_REPRODUCTIVO',
    label: 'Resumen reproductivo por intervalo',
    ayuda: 'Totales y promedios: vivos, muertos, momias, destetados y productividad.',
  },
]

const normalizar = (v: string | null | undefined) =>
  String(v || '').trim().toUpperCase()

const formatFecha = (fecha?: string | null) => {
  if (!fecha) return '—'
  return String(fecha).slice(0, 10)
}

const hoyISO = () => {
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

const diasEntre = (desde: string, hasta: string) => {
  if (!desde || !hasta) return 0
  const a = new Date(`${desde.slice(0, 10)}T00:00:00`)
  const b = new Date(`${hasta.slice(0, 10)}T00:00:00`)
  const diff = b.getTime() - a.getTime()
  return Math.floor(diff / 86400000)
}

const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

const ubicacionTexto = (
  u?: { codigo: string | null; nombre: string | null } | null
) => {
  if (!u) return '—'
  const codigo = u.codigo || ''
  const nombre = u.nombre || ''
  if (!codigo && !nombre) return '—'
  return `${codigo}${nombre ? ` — ${nombre}` : ''}`
}

const datosObj = (datos: unknown): Record<string, unknown> => {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {}
  return datos as Record<string, unknown>
}

const dato = (ev: CerdaEvento, key: string) => datosObj(ev.datos)[key]

const datoNum = (ev: CerdaEvento, keys: string[]) => {
  for (const key of keys) {
    const value = dato(ev, key)
    if (value !== undefined && value !== null && String(value).trim() !== '') return num(value)
  }
  return 0
}

const datosTexto = (ev: CerdaEvento) => {
  const d = datosObj(ev.datos)
  const keys = Object.keys(d)
  if (keys.length === 0) return '—'

  return keys
    .filter((key) => !['estado_anterior', 'estado_sugerido'].includes(key))
    .map((key) => `${key}: ${String(d[key] ?? '—')}`)
    .join(' | ')
}

const eventoEs = (ev: CerdaEvento, tipo: string) => normalizar(ev.tipo) === tipo

const eventoIncluye = (ev: CerdaEvento, palabras: string[]) => {
  const t = normalizar(ev.tipo)
  const r = normalizar(ev.resultado)
  const o = normalizar(ev.observaciones)
  return palabras.some((p) => t.includes(p) || r.includes(p) || o.includes(p))
}

const ultimoEvento = (
  eventos: CerdaEvento[],
  cerdaId: number,
  predicate: (ev: CerdaEvento) => boolean
) => {
  return eventos
    .filter((ev) => Number(ev.cerda_id) === Number(cerdaId) && predicate(ev))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0]
}

const eventosDeCerda = (eventos: CerdaEvento[], cerdaId: number) => {
  return eventos
    .filter((ev) => Number(ev.cerda_id) === Number(cerdaId))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
}

const filtrarEventosIntervalo = (
  eventos: CerdaEvento[],
  desde: string,
  hasta: string,
  predicate: (ev: CerdaEvento) => boolean
) => {
  return eventos.filter((ev) => {
    const f = formatFecha(ev.fecha)
    if (desde && f < desde) return false
    if (hasta && f > hasta) return false
    return predicate(ev)
  })
}


const mapCerdas = (cerdas: Cerda[]) => {
  const m = new Map<number, Cerda>()
  cerdas.forEach((c) => m.set(Number(c.id), c))
  return m
}

const getLastAutoTableY = (doc: jsPDF, fallback: number) => {
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || fallback
  )
}

const pdfNombreSeguro = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)

const calcularParidadHistorial = (eventos: CerdaEvento[], cerdaId: number) => {
  return eventos.filter(
    (ev) => Number(ev.cerda_id) === Number(cerdaId) && eventoEs(ev, 'PARTO')
  ).length
}

function generarFichaCerdaPdf(
  cerda: Cerda,
  eventosTodos: CerdaEvento[],
  eventosFiltrados: CerdaEvento[],
  partosRegistradosEnHistorial: number
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.text('FICHA INDIVIDUAL DE HEMBRA', 14, 16)

  doc.setFontSize(10)
  doc.text(
    `Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    14,
    23
  )

  autoTable(doc, {
    startY: 30,
    head: [['Campo', 'Información']],
    body: [
      ['Arete', cerda.arete || '—'],
      ['Nombre', cerda.nombre || '—'],
      ['Estado', cerda.estado || '—'],
      ['Paridad actual', String(cerda.paridad ?? 0)],
      ['Partos registrados en historial', String(partosRegistradosEnHistorial)],
      ['Activa', cerda.activa ? 'Sí' : 'No'],
      ['Ubicación actual', ubicacionTexto(cerda.granja_ubicaciones)],
      ['Lote', cerda.granja_lotes?.codigo || '—'],
      ['Fecha nacimiento', formatFecha(cerda.fecha_nacimiento)],
      [
        'Peso lb',
        cerda.peso_lb !== null && cerda.peso_lb !== undefined
          ? String(cerda.peso_lb)
          : '—',
      ],
      ['Fecha de registro', formatFecha(cerda.created_at)],
      ['Última actualización', formatFecha(cerda.updated_at)],
      ['Notas', cerda.notas || '—'],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [220, 220, 220] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { cellWidth: 125 },
    },
    margin: { left: 14, right: 14 },
  })

  let y = getLastAutoTableY(doc, 30) + 10

  const partos = eventosTodos.filter((ev) => eventoEs(ev, 'PARTO'))
  const destetes = eventosTodos.filter((ev) => eventoEs(ev, 'DESTETE'))
  const montas = eventosTodos.filter((ev) => eventoEs(ev, 'MONTA') || eventoEs(ev, 'INSEMINACION'))
  const abortos = eventosTodos.filter((ev) => eventoEs(ev, 'ABORTO'))

  const vivos = partos.reduce(
    (acc, ev) => acc + datoNum(ev, ['nacidos_vivos', 'vivos']),
    0
  )
  const destetados = destetes.reduce(
    (acc, ev) => acc + datoNum(ev, ['cantidad_destetada', 'destetados']),
    0
  )

  doc.setFontSize(13)
  doc.text('Resumen reproductivo', 14, y)

  autoTable(doc, {
    startY: y + 4,
    head: [['Indicador', 'Valor']],
    body: [
      ['Montas / inseminaciones', String(montas.length)],
      ['Partos', String(partos.length)],
      ['Abortos', String(abortos.length)],
      ['Destetes', String(destetes.length)],
      ['Total nacidos vivos', String(vivos)],
      ['Promedio nacidos vivos / parto', String(partos.length ? round2(vivos / partos.length) : 0)],
      ['Total destetados', String(destetados)],
      ['Promedio destetados / camada', String(destetes.length ? round2(destetados / destetes.length) : 0)],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: 14, right: 14 },
  })

  y = getLastAutoTableY(doc, y) + 10

  if (y > 240) {
    doc.addPage()
    y = 16
  }

  doc.setFontSize(13)
  doc.text('Historial completo de eventos', 14, y)

  doc.setFontSize(9)
  doc.text(
    `Eventos mostrados: ${eventosFiltrados.length} de ${eventosTodos.length}.`,
    14,
    y + 6
  )

  const bodyEventos = eventosFiltrados.map((ev) => [
    formatFecha(ev.fecha),
    ev.tipo || '—',
    ev.resultado || '—',
    ubicacionTexto(ev.granja_ubicaciones),
    datosTexto(ev),
    ev.observaciones || '—',
  ])

  autoTable(doc, {
    startY: y + 10,
    head: [['Fecha', 'Tipo', 'Resultado', 'Ubicación', 'Datos', 'Observaciones']],
    body:
      bodyEventos.length > 0
        ? bodyEventos
        : [['—', 'Sin eventos en el filtro aplicado', '—', '—', '—', '—']],
    styles: { fontSize: 7 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: 5, right: 5 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      3: { cellWidth: 36 },
      4: { cellWidth: 55 },
      5: { cellWidth: 42 },
    },
  })

  const name = `ficha_hembra_${pdfNombreSeguro(cerda.arete || String(cerda.id))}_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.pdf`

  doc.save(name)
}

function imprimirReporteGeneral(
  reporte: ReporteGenerado,
  desde: string,
  hasta: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(15)
  doc.text(reporte.titulo, 10, 14)

  doc.setFontSize(9)
  doc.text(`Rango: ${desde || '—'} a ${hasta || '—'}`, 10, 21)
  doc.text(
    `Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    10,
    27
  )

  autoTable(doc, {
    startY: 33,
    head: [['Resumen', 'Valor']],
    body: reporte.resumen.length > 0 ? reporte.resumen : [['Registros', String(reporte.filas.length)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220] },
    margin: { left: 10, right: 10 },
    tableWidth: 110,
  })

  const y = getLastAutoTableY(doc, 33) + 8

  autoTable(doc, {
    startY: y,
    head: [reporte.columnas],
    body: reporte.filas.length > 0 ? reporte.filas : [reporte.columnas.map(() => '—')],
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 55, 75] },
    margin: { left: 5, right: 5 },
  })

  const name = `${pdfNombreSeguro(reporte.titulo)}_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.pdf`

  doc.save(name)
}

function construirReporte(
  tipo: ReporteTipo,
  cerdas: Cerda[],
  eventos: CerdaEvento[],
  desde: string,
  hasta: string
): ReporteGenerado {
  const cerdasMap = mapCerdas(cerdas)
  const hoy = hoyISO()
  const desdeFinal = desde || '1900-01-01'
  const hastaFinal = hasta || '2999-12-31'
  const cerdasActivas = cerdas.filter((c) => c.activa && !['MUERTA', 'BAJA'].includes(normalizar(c.estado)))

  if (tipo === 'PARTOS_PROXIMOS') {
    const filas = cerdasActivas
      .map((cerda) => {
        const servicio = ultimoEvento(
          eventos,
          cerda.id,
          (ev) => eventoEs(ev, 'MONTA') || eventoEs(ev, 'INSEMINACION')
        )

        if (!servicio) return null

        const partoEstimado = sumarDias(formatFecha(servicio.fecha), 115)
        if (partoEstimado < desdeFinal || partoEstimado > hastaFinal) return null

        return [
          cerda.arete,
          cerda.nombre || '—',
          cerda.estado || '—',
          ubicacionTexto(cerda.granja_ubicaciones),
          formatFecha(servicio.fecha),
          servicio.tipo || '—',
          String(dato(servicio, 'macho') || '—'),
          partoEstimado,
          String(diasEntre(hoy, partoEstimado)),
        ]
      })
      .filter(Boolean) as string[][]

    return {
      titulo: 'Reporte de partos próximos',
      columnas: ['Arete', 'Nombre', 'Estado', 'Ubicación', 'Última monta', 'Tipo', 'Macho', 'Parto estimado', 'Días faltantes'],
      filas,
      resumen: [['Partos próximos', String(filas.length)]],
    }
  }

  if (tipo === 'PROXIMOS_DESTETES') {
    const filas = cerdasActivas
      .map((cerda) => {
        const parto = ultimoEvento(eventos, cerda.id, (ev) => eventoEs(ev, 'PARTO'))
        if (!parto) return null

        const desteteEstimado = String(dato(parto, 'destete_sugerido') || sumarDias(formatFecha(parto.fecha), 21))
        if (desteteEstimado < desdeFinal || desteteEstimado > hastaFinal) return null

        return [
          cerda.arete,
          cerda.nombre || '—',
          cerda.estado || '—',
          ubicacionTexto(cerda.granja_ubicaciones),
          formatFecha(parto.fecha),
          String(datoNum(parto, ['nacidos_vivos', 'vivos'])),
          desteteEstimado,
          String(diasEntre(hoy, desteteEstimado)),
        ]
      })
      .filter(Boolean) as string[][]

    return {
      titulo: 'Reporte de próximos destetes',
      columnas: ['Arete', 'Nombre', 'Estado', 'Ubicación', 'Fecha parto', 'Vivos', 'Destete estimado', 'Días faltantes'],
      filas,
      resumen: [['Destetes próximos', String(filas.length)]],
    }
  }

  if (tipo === 'REVISION_CELO') {
    const filas = cerdasActivas
      .map((cerda) => {
        const ultDestete = ultimoEvento(eventos, cerda.id, (ev) => eventoEs(ev, 'DESTETE'))
        const ultAborto = ultimoEvento(eventos, cerda.id, (ev) => eventoEs(ev, 'ABORTO'))
        const ultServicio = ultimoEvento(
          eventos,
          cerda.id,
          (ev) => eventoEs(ev, 'MONTA') || eventoEs(ev, 'INSEMINACION')
        )

        const base = [ultDestete, ultAborto]
          .filter(Boolean)
          .sort((a, b) => String(b?.fecha).localeCompare(String(a?.fecha)))[0]

        if (!base) return null
        if (ultServicio && formatFecha(ultServicio.fecha) > formatFecha(base.fecha)) return null

        const fechaRevision = sumarDias(formatFecha(base.fecha), eventoEs(base, 'DESTETE') ? 5 : 21)
        if (fechaRevision < desdeFinal || fechaRevision > hastaFinal) return null

        return [
          cerda.arete,
          cerda.nombre || '—',
          cerda.estado || '—',
          ubicacionTexto(cerda.granja_ubicaciones),
          base.tipo,
          formatFecha(base.fecha),
          fechaRevision,
          String(diasEntre(formatFecha(base.fecha), hoy)),
        ]
      })
      .filter(Boolean) as string[][]

    return {
      titulo: 'Reporte de revisión de celo',
      columnas: ['Arete', 'Nombre', 'Estado', 'Ubicación', 'Evento base', 'Fecha base', 'Fecha revisión', 'Días desde evento'],
      filas,
      resumen: [['Hembras para revisar', String(filas.length)]],
    }
  }

  if (tipo === 'HEMBRAS_VACIAS') {
    const filas = cerdasActivas
      .filter((cerda) => ['VACIA', 'DESTETADA', 'ABORTO'].includes(normalizar(cerda.estado)))
      .map((cerda) => {
        const base = ultimoEvento(
          eventos,
          cerda.id,
          (ev) =>
            eventoEs(ev, 'DESTETE') ||
            eventoEs(ev, 'ABORTO') ||
            (eventoEs(ev, 'REVISION_EMBARAZO') && normalizar(ev.resultado).includes('NEG')) ||
            eventoIncluye(ev, ['VACIA'])
        )

        const fechaBase = base ? formatFecha(base.fecha) : formatFecha(cerda.created_at)
        return [
          cerda.arete,
          cerda.nombre || '—',
          cerda.estado || '—',
          ubicacionTexto(cerda.granja_ubicaciones),
          base?.tipo || 'Registro',
          fechaBase,
          String(diasEntre(fechaBase, hoy)),
        ]
      })

    return {
      titulo: 'Reporte de hembras vacías',
      columnas: ['Arete', 'Nombre', 'Estado', 'Ubicación', 'Desde evento', 'Fecha base', 'Días vacía'],
      filas,
      resumen: [['Hembras vacías', String(filas.length)]],
    }
  }

  if (tipo === 'MONTAS') {
    const evs = filtrarEventosIntervalo(
      eventos,
      desdeFinal,
      hastaFinal,
      (ev) => eventoEs(ev, 'MONTA') || eventoEs(ev, 'INSEMINACION')
    )

    const filas = evs.map((ev) => {
      const cerda = cerdasMap.get(Number(ev.cerda_id))
      const partoEstimado = sumarDias(formatFecha(ev.fecha), 115)
      return [
        formatFecha(ev.fecha),
        cerda?.arete || '—',
        cerda?.nombre || '—',
        ev.tipo || '—',
        String(dato(ev, 'macho') || '—'),
        ubicacionTexto(ev.granja_ubicaciones || cerda?.granja_ubicaciones),
        partoEstimado,
        ev.observaciones || '—',
      ]
    })

    return {
      titulo: 'Reporte de montas e inseminaciones',
      columnas: ['Fecha', 'Arete', 'Nombre', 'Tipo', 'Macho', 'Ubicación', 'Parto estimado', 'Obs.'],
      filas,
      resumen: [['Montas / inseminaciones', String(filas.length)]],
    }
  }

  if (tipo === 'REPETICIONES') {
    const evs = filtrarEventosIntervalo(
      eventos,
      desdeFinal,
      hastaFinal,
      (ev) =>
        eventoIncluye(ev, ['REPET']) ||
        (eventoEs(ev, 'REVISION_EMBARAZO') && normalizar(ev.resultado).includes('NEG'))
    )

    const filas = evs.map((ev) => {
      const cerda = cerdasMap.get(Number(ev.cerda_id))
      return [
        formatFecha(ev.fecha),
        cerda?.arete || '—',
        cerda?.nombre || '—',
        cerda?.estado || '—',
        ev.tipo || '—',
        ev.resultado || '—',
        ubicacionTexto(ev.granja_ubicaciones || cerda?.granja_ubicaciones),
        ev.observaciones || '—',
      ]
    })

    return {
      titulo: 'Reporte de repeticiones',
      columnas: ['Fecha', 'Arete', 'Nombre', 'Estado', 'Tipo', 'Resultado', 'Ubicación', 'Obs.'],
      filas,
      resumen: [['Repeticiones detectadas', String(filas.length)]],
    }
  }

  if (tipo === 'ABORTOS') {
    const evs = filtrarEventosIntervalo(eventos, desdeFinal, hastaFinal, (ev) => eventoEs(ev, 'ABORTO'))

    const filas = evs.map((ev) => {
      const cerda = cerdasMap.get(Number(ev.cerda_id))
      return [
        formatFecha(ev.fecha),
        cerda?.arete || '—',
        cerda?.nombre || '—',
        cerda?.estado || '—',
        ubicacionTexto(ev.granja_ubicaciones || cerda?.granja_ubicaciones),
        String(datoNum(ev, ['fetos'])),
        String(dato(ev, 'motivo') || ev.observaciones || '—'),
      ]
    })

    return {
      titulo: 'Reporte de abortos',
      columnas: ['Fecha', 'Arete', 'Nombre', 'Estado', 'Ubicación', 'Fetos', 'Motivo / obs.'],
      filas,
      resumen: [['Abortos', String(filas.length)]],
    }
  }

  if (tipo === 'PARTOS_INTERVALO') {
    const evs = filtrarEventosIntervalo(eventos, desdeFinal, hastaFinal, (ev) => eventoEs(ev, 'PARTO'))

    const filas = evs.map((ev) => {
      const cerda = cerdasMap.get(Number(ev.cerda_id))
      const vivos = datoNum(ev, ['nacidos_vivos', 'vivos'])
      const muertos = datoNum(ev, ['nacidos_muertos', 'muertos'])
      const momias = datoNum(ev, ['momias'])
      const total = vivos + muertos + momias
      return [
        formatFecha(ev.fecha),
        cerda?.arete || '—',
        cerda?.nombre || '—',
        ubicacionTexto(ev.granja_ubicaciones || cerda?.granja_ubicaciones),
        String(vivos),
        String(muertos),
        String(momias),
        String(total),
        String(datoNum(ev, ['hembras'])),
        String(datoNum(ev, ['machos'])),
        ev.observaciones || '—',
      ]
    })

    const totalVivos = evs.reduce((acc, ev) => acc + datoNum(ev, ['nacidos_vivos', 'vivos']), 0)
    const totalMuertos = evs.reduce((acc, ev) => acc + datoNum(ev, ['nacidos_muertos', 'muertos']), 0)
    const totalMomias = evs.reduce((acc, ev) => acc + datoNum(ev, ['momias']), 0)

    return {
      titulo: 'Reporte de partos por intervalo',
      columnas: ['Fecha', 'Arete', 'Nombre', 'Ubicación', 'Vivos', 'Muertos', 'Momias', 'Total', 'Hembras', 'Machos', 'Obs.'],
      filas,
      resumen: [
        ['Partos', String(evs.length)],
        ['Nacidos vivos', String(totalVivos)],
        ['Nacidos muertos', String(totalMuertos)],
        ['Momias', String(totalMomias)],
        ['Promedio vivos / parto', String(evs.length ? round2(totalVivos / evs.length) : 0)],
      ],
    }
  }

  const partos = filtrarEventosIntervalo(eventos, desdeFinal, hastaFinal, (ev) => eventoEs(ev, 'PARTO'))
  const destetes = filtrarEventosIntervalo(eventos, desdeFinal, hastaFinal, (ev) => eventoEs(ev, 'DESTETE'))
  const abortos = filtrarEventosIntervalo(eventos, desdeFinal, hastaFinal, (ev) => eventoEs(ev, 'ABORTO'))
  const montas = filtrarEventosIntervalo(
    eventos,
    desdeFinal,
    hastaFinal,
    (ev) => eventoEs(ev, 'MONTA') || eventoEs(ev, 'INSEMINACION')
  )
  const totalVivos = partos.reduce((acc, ev) => acc + datoNum(ev, ['nacidos_vivos', 'vivos']), 0)
  const totalMuertos = partos.reduce((acc, ev) => acc + datoNum(ev, ['nacidos_muertos', 'muertos']), 0)
  const totalMomias = partos.reduce((acc, ev) => acc + datoNum(ev, ['momias']), 0)
  const totalDestetados = destetes.reduce((acc, ev) => acc + datoNum(ev, ['cantidad_destetada', 'destetados']), 0)
  const cerdasConDestete = new Set(destetes.map((ev) => Number(ev.cerda_id))).size
  const diasRango = Math.max(diasEntre(desdeFinal, hastaFinal) + 1, 1)
  const factorAnual = 365 / diasRango
  const lechonesCerdaAnio = cerdasConDestete > 0 ? round2((totalDestetados / cerdasConDestete) * factorAnual) : 0

  return {
    titulo: 'Resumen reproductivo por intervalo',
    columnas: ['Indicador', 'Valor'],
    filas: [
      ['Partos', String(partos.length)],
      ['Montas / inseminaciones', String(montas.length)],
      ['Abortos', String(abortos.length)],
      ['Destetes', String(destetes.length)],
      ['Total nacidos vivos', String(totalVivos)],
      ['Total nacidos muertos', String(totalMuertos)],
      ['Total momias', String(totalMomias)],
      ['Promedio nacidos vivos / parto', String(partos.length ? round2(totalVivos / partos.length) : 0)],
      ['Total destetados', String(totalDestetados)],
      ['Promedio destetados / camada', String(destetes.length ? round2(totalDestetados / destetes.length) : 0)],
      ['Cerdas con destete en rango', String(cerdasConDestete)],
      ['Lechones destetados / cerda / año', String(lechonesCerdaAnio)],
    ],
    resumen: [
      ['Partos', String(partos.length)],
      ['Nacidos vivos', String(totalVivos)],
      ['Nacidos muertos', String(totalMuertos)],
      ['Momias', String(totalMomias)],
      ['Promedio vivos / parto', String(partos.length ? round2(totalVivos / partos.length) : 0)],
      ['Promedio destetados / camada', String(destetes.length ? round2(totalDestetados / destetes.length) : 0)],
      ['Lechones destetados / cerda / año', String(lechonesCerdaAnio)],
    ],
  }
}

export default function CerdasReportesPage() {
  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [eventos, setEventos] = useState<CerdaEvento[]>([])

  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [mostrarInactivas, setMostrarInactivas] = useState(false)

  const [eventoDesde, setEventoDesde] = useState('')
  const [eventoHasta, setEventoHasta] = useState('')
  const [eventoTipo, setEventoTipo] = useState('')
  const [eventoBusqueda, setEventoBusqueda] = useState('')

  const [reporteTipo, setReporteTipo] = useState<ReporteTipo>('PARTOS_PROXIMOS')
  const [reporteDesde, setReporteDesde] = useState(hoyISO())
  const [reporteHasta, setReporteHasta] = useState(sumarDias(hoyISO(), 30))

  const [cerdaSeleccionadaId, setCerdaSeleccionadaId] = useState<number | null>(null)

  const [form, setForm] = useState<FormCerda>({
    arete: '',
    nombre: '',
    estado: 'VACIA',
    ubicacion_id: '',
    lote_id: '',
    fecha_nacimiento: '',
    peso_lb: '',
    paridad: '0',
    notas: '',
    activa: true,
  })

  const cerdaSeleccionada = useMemo(() => {
    if (!cerdaSeleccionadaId) return null
    return cerdas.find((c) => Number(c.id) === Number(cerdaSeleccionadaId)) || null
  }, [cerdas, cerdaSeleccionadaId])

  const eventosCerdaSeleccionadaTodos = useMemo(() => {
    if (!cerdaSeleccionadaId) return []
    return eventosDeCerda(eventos, cerdaSeleccionadaId)
  }, [eventos, cerdaSeleccionadaId])

  const tiposEventosDisponibles = useMemo(() => {
    const tipos = new Set<string>()
    eventosCerdaSeleccionadaTodos.forEach((ev) => {
      if (ev.tipo) tipos.add(ev.tipo)
    })
    return Array.from(tipos).sort((a, b) => a.localeCompare(b, 'es'))
  }, [eventosCerdaSeleccionadaTodos])

  const eventosCerdaSeleccionadaFiltrados = useMemo(() => {
    const q = eventoBusqueda.trim().toLowerCase()
    return eventosCerdaSeleccionadaTodos.filter((ev) => {
      const fecha = formatFecha(ev.fecha)
      if (eventoDesde && fecha < eventoDesde) return false
      if (eventoHasta && fecha > eventoHasta) return false
      if (eventoTipo && ev.tipo !== eventoTipo) return false
      if (!q) return true
      const texto = [
        ev.fecha,
        ev.tipo,
        ev.resultado,
        ev.observaciones,
        datosTexto(ev),
        ev.granja_ubicaciones?.codigo,
        ev.granja_ubicaciones?.nombre,
        ev.granja_lotes?.codigo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return texto.includes(q)
    })
  }, [eventosCerdaSeleccionadaTodos, eventoDesde, eventoHasta, eventoTipo, eventoBusqueda])

  const partosRegistradosEnHistorial = useMemo(() => {
    if (!cerdaSeleccionadaId) return 0
    return calcularParidadHistorial(eventos, cerdaSeleccionadaId)
  }, [eventos, cerdaSeleccionadaId])

  const reporteGenerado = useMemo(() => {
    return construirReporte(reporteTipo, cerdas, eventos, reporteDesde, reporteHasta)
  }, [reporteTipo, cerdas, eventos, reporteDesde, reporteHasta])

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      const [cerdasRes, ubicacionesRes, lotesRes, eventosRes] = await Promise.all([
        supabase
          .from('granja_cerdas')
          .select(
            `
            id,
            arete,
            nombre,
            estado,
            ubicacion_id,
            lote_id,
            fecha_nacimiento,
            peso_lb,
            paridad,
            notas,
            activa,
            created_at,
            updated_at,
            granja_ubicaciones (
              codigo,
              nombre
            ),
            granja_lotes (
              codigo
            )
          `
          )
          .order('arete', { ascending: true }),

        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),

        supabase.from('granja_lotes').select('id, codigo').order('codigo', { ascending: true }),

        supabase
          .from('granja_cerda_eventos')
          .select(
            `
            id,
            cerda_id,
            fecha,
            tipo,
            resultado,
            ubicacion_id,
            lote_id,
            datos,
            observaciones,
            created_at,
            granja_ubicaciones (
              codigo,
              nombre
            ),
            granja_lotes (
              codigo
            )
          `
          )
          .order('fecha', { ascending: false }),
      ])

      if (cerdasRes.error) {
        console.error(cerdasRes.error)
        alert(`Error cargando cerdas: ${cerdasRes.error.message}`)
        return
      }

      if (ubicacionesRes.error) {
        console.error(ubicacionesRes.error)
        alert(`Error cargando ubicaciones: ${ubicacionesRes.error.message}`)
        return
      }

      if (lotesRes.error) console.error(lotesRes.error)

      if (eventosRes.error) {
        console.error(eventosRes.error)
        alert(`Error cargando eventos: ${eventosRes.error.message}`)
        return
      }

      setCerdas((cerdasRes.data || []) as unknown as Cerda[])
      setUbicaciones((ubicacionesRes.data || []) as Ubicacion[])
      setLotes((lotesRes.data || []) as Lote[])
      setEventos((eventosRes.data || []) as unknown as CerdaEvento[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const cerdasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cerdas.filter((cerda) => {
      if (!mostrarInactivas && !cerda.activa) return false
      if (filtroEstado && cerda.estado !== filtroEstado) return false
      if (!q) return true
      const texto = [
        cerda.arete,
        cerda.nombre,
        cerda.estado,
        cerda.notas,
        cerda.granja_ubicaciones?.codigo,
        cerda.granja_ubicaciones?.nombre,
        cerda.granja_lotes?.codigo,
        cerda.paridad !== null && cerda.paridad !== undefined ? `paridad ${cerda.paridad}` : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return texto.includes(q)
    })
  }, [cerdas, busqueda, filtroEstado, mostrarInactivas])

  const llenarFormulario = (cerda: Cerda) => {
    setCerdaSeleccionadaId(cerda.id)
    setEventoDesde('')
    setEventoHasta('')
    setEventoTipo('')
    setEventoBusqueda('')

    setForm({
      arete: cerda.arete || '',
      nombre: cerda.nombre || '',
      estado: cerda.estado || 'VACIA',
      ubicacion_id: cerda.ubicacion_id ? String(cerda.ubicacion_id) : '',
      lote_id: cerda.lote_id ? String(cerda.lote_id) : '',
      fecha_nacimiento: cerda.fecha_nacimiento ? String(cerda.fecha_nacimiento).slice(0, 10) : '',
      peso_lb: cerda.peso_lb !== null && cerda.peso_lb !== undefined ? String(cerda.peso_lb) : '',
      paridad: cerda.paridad !== null && cerda.paridad !== undefined ? String(cerda.paridad) : '0',
      notas: cerda.notas || '',
      activa: Boolean(cerda.activa),
    })
  }

  const limpiarSeleccion = () => {
    setCerdaSeleccionadaId(null)
    setEventoDesde('')
    setEventoHasta('')
    setEventoTipo('')
    setEventoBusqueda('')

    setForm({
      arete: '',
      nombre: '',
      estado: 'VACIA',
      ubicacion_id: '',
      lote_id: '',
      fecha_nacimiento: '',
      peso_lb: '',
      paridad: '0',
      notas: '',
      activa: true,
    })
  }

  const guardarCambios = async () => {
    if (!cerdaSeleccionadaId) {
      alert('Selecciona una cerda primero.')
      return
    }

    const arete = form.arete.trim()
    if (!arete) {
      alert('El arete es obligatorio.')
      return
    }

    if (!form.estado) {
      alert('Selecciona un estado.')
      return
    }

    const paridadNum = Number(form.paridad)
    if (!Number.isInteger(paridadNum) || paridadNum < 0) {
      alert('La paridad debe ser un número entero mayor o igual a 0.')
      return
    }

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const payload = {
        arete,
        nombre: form.nombre.trim() || null,
        estado: form.estado,
        ubicacion_id: form.ubicacion_id ? Number(form.ubicacion_id) : null,
        lote_id: form.lote_id ? Number(form.lote_id) : null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        peso_lb: form.peso_lb.trim() === '' ? null : Number(form.peso_lb),
        paridad: paridadNum,
        notas: form.notas.trim() || null,
        activa: form.activa,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('granja_cerdas')
        .update(payload)
        .eq('id', cerdaSeleccionadaId)

      if (error) {
        console.error(error)
        alert(`No se pudieron guardar los cambios: ${error.message}`)
        return
      }

      const { error: eventoError } = await supabase.from('granja_cerda_eventos').insert({
        cerda_id: cerdaSeleccionadaId,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'EDICION',
        resultado: 'ACTUALIZADA',
        ubicacion_id: payload.ubicacion_id,
        lote_id: payload.lote_id,
        datos: { cambios: payload },
        observaciones: 'Edición manual desde página de reportes de cerdas.',
        user_id: userId,
      })

      if (eventoError) console.error(eventoError)

      alert('Cerda actualizada correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const darDeBajaCerda = async () => {
    if (!cerdaSeleccionada) {
      alert('Selecciona una cerda primero.')
      return
    }

    const confirmar = confirm(
      `¿Eliminar/dar de baja la cerda con arete ${cerdaSeleccionada.arete}? No se borrará su historial.`
    )
    if (!confirmar) return

    const motivo = prompt('Motivo de baja o eliminación:', 'Baja manual desde reportes')
    if (motivo === null) return

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const { error } = await supabase
        .from('granja_cerdas')
        .update({ activa: false, estado: 'BAJA', updated_at: new Date().toISOString() })
        .eq('id', cerdaSeleccionada.id)

      if (error) {
        console.error(error)
        alert(`No se pudo dar de baja la cerda: ${error.message}`)
        return
      }

      const { error: eventoError } = await supabase.from('granja_cerda_eventos').insert({
        cerda_id: cerdaSeleccionada.id,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'BAJA',
        resultado: 'COMPLETADA',
        ubicacion_id: cerdaSeleccionada.ubicacion_id,
        lote_id: cerdaSeleccionada.lote_id,
        datos: { arete: cerdaSeleccionada.arete },
        observaciones: motivo || 'Baja manual desde reportes',
        user_id: userId,
      })

      if (eventoError) console.error(eventoError)

      alert('Cerda dada de baja correctamente.')
      limpiarSeleccion()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const imprimirFicha = () => {
    if (!cerdaSeleccionada) {
      alert('Selecciona una cerda primero.')
      return
    }

    generarFichaCerdaPdf(
      cerdaSeleccionada,
      eventosCerdaSeleccionadaTodos,
      eventosCerdaSeleccionadaFiltrados,
      partosRegistradosEnHistorial
    )
  }

  const imprimirReporteSeleccionado = () => {
    imprimirReporteGeneral(reporteGenerado, reporteDesde, reporteHasta)
  }

  const totalActivas = cerdas.filter((c) => c.activa).length
  const totalInactivas = cerdas.filter((c) => !c.activa).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={150} height={60} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Reportes y control de cerdas</h1>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Total cerdas</div>
          <div className="text-xl font-bold">{cerdas.length}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Activas</div>
          <div className="text-xl font-bold">{totalActivas}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Inactivas / baja</div>
          <div className="text-xl font-bold">{totalInactivas}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Mostrando</div>
          <div className="text-xl font-bold">{cerdasFiltradas.length}</div>
        </div>
      </div>

      <div className="border rounded-lg bg-white p-4 shadow-sm mb-5">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="min-w-[280px] flex-1">
            <label className="block text-xs font-semibold mb-1">Reporte</label>
            <select
              className="border rounded p-2 w-full text-sm"
              value={reporteTipo}
              onChange={(e) => setReporteTipo(e.target.value as ReporteTipo)}
            >
              {REPORTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Desde</label>
            <input
              type="date"
              className="border rounded p-2 text-sm"
              value={reporteDesde}
              onChange={(e) => setReporteDesde(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Hasta</label>
            <input
              type="date"
              className="border rounded p-2 text-sm"
              value={reporteHasta}
              onChange={(e) => setReporteHasta(e.target.value)}
            />
          </div>

          <button
            onClick={imprimirReporteSeleccionado}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm"
          >
            Imprimir reporte PDF
          </button>
        </div>

        <p className="text-xs text-gray-600 mb-3">
          {REPORTES.find((r) => r.value === reporteTipo)?.ayuda}
        </p>

        <div className="grid md:grid-cols-4 gap-2 mb-3">
          {reporteGenerado.resumen.slice(0, 8).map(([label, value]) => (
            <div key={label} className="border rounded p-2 bg-slate-50">
              <div className="text-[11px] text-gray-600">{label}</div>
              <div className="font-bold">{value}</div>
            </div>
          ))}
        </div>

        <div className="border rounded overflow-auto max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-200 sticky top-0">
              <tr>
                {reporteGenerado.columnas.map((col) => (
                  <th key={col} className="p-2 text-left whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {reporteGenerado.filas.length === 0 ? (
                <tr>
                  <td colSpan={reporteGenerado.columnas.length} className="p-3 text-gray-500">
                    No hay datos para este reporte con el rango seleccionado.
                  </td>
                </tr>
              ) : (
                reporteGenerado.filas.slice(0, 120).map((fila, idx) => (
                  <tr key={idx} className="border-t">
                    {fila.map((cell, cellIdx) => (
                      <td key={cellIdx} className="p-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {reporteGenerado.filas.length > 120 ? (
          <div className="text-[11px] text-gray-500 mt-2">
            La vista muestra los primeros 120 registros. El PDF incluye todos los registros del reporte.
          </div>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold mb-1">Buscar</label>
              <input
                className="border rounded p-2 w-full text-sm"
                placeholder="Arete, nombre, estado, ubicación, lote, paridad..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Estado</label>
              <select
                className="border rounded p-2 text-sm"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="">Todos</option>
                {ESTADOS_CERDA.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={mostrarInactivas}
                onChange={(e) => setMostrarInactivas(e.target.checked)}
              />
              Mostrar bajas
            </label>

            <button
              onClick={cargarDatos}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {loading ? 'Cargando…' : 'Buscar / Actualizar'}
            </button>
          </div>

          <div className="border rounded overflow-auto max-h-[650px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-200 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Arete</th>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Paridad</th>
                  <th className="p-2 text-left">Ubicación</th>
                  <th className="p-2 text-left">Activa</th>
                  <th className="p-2 text-left">Acción</th>
                </tr>
              </thead>

              <tbody>
                {cerdasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-3 text-gray-500">
                      No hay cerdas para mostrar.
                    </td>
                  </tr>
                ) : (
                  cerdasFiltradas.map((cerda) => (
                    <tr
                      key={cerda.id}
                      className={`border-t ${
                        cerdaSeleccionadaId === cerda.id ? 'bg-amber-50' : ''
                      }`}
                    >
                      <td className="p-2 font-semibold">{cerda.arete}</td>
                      <td className="p-2">{cerda.nombre || '—'}</td>
                      <td className="p-2">{cerda.estado || '—'}</td>
                      <td className="p-2">{cerda.paridad ?? 0}</td>
                      <td className="p-2 text-xs">{ubicacionTexto(cerda.granja_ubicaciones)}</td>
                      <td className="p-2">{cerda.activa ? 'Sí' : 'No'}</td>
                      <td className="p-2">
                        <button
                          onClick={() => llenarFormulario(cerda)}
                          className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 rounded text-xs"
                        >
                          Ver / Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold">Detalle de cerda</h2>
            {cerdaSeleccionada ? (
              <span className="text-xs text-gray-500">ID: {cerdaSeleccionada.id}</span>
            ) : null}
          </div>

          {!cerdaSeleccionada ? (
            <div className="text-sm text-gray-500">
              Selecciona una cerda de la tabla para ver, editar o imprimir su ficha.
            </div>
          ) : (
            <>
              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Arete</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={form.arete}
                      onChange={(e) => setForm((prev) => ({ ...prev, arete: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Nombre</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={form.nombre}
                      onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Estado</label>
                    <select
                      className="border rounded p-2 w-full"
                      value={form.estado}
                      onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                    >
                      {ESTADOS_CERDA.map((estado) => (
                        <option key={estado} value={estado}>
                          {estado}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Paridad</label>
                    <input
                      type="number"
                      min="0"
                      className="border rounded p-2 w-full"
                      value={form.paridad}
                      onChange={(e) => setForm((prev) => ({ ...prev, paridad: e.target.value }))}
                    />
                    <div className="text-[10px] text-gray-500 mt-1">
                      Partos en historial: {partosRegistradosEnHistorial}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Activa</label>
                    <select
                      className="border rounded p-2 w-full"
                      value={form.activa ? 'SI' : 'NO'}
                      onChange={(e) => setForm((prev) => ({ ...prev, activa: e.target.value === 'SI' }))}
                    >
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Ubicación</label>
                  <select
                    className="border rounded p-2 w-full"
                    value={form.ubicacion_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, ubicacion_id: e.target.value }))}
                  >
                    <option value="">— Sin ubicación —</option>
                    {ubicaciones.map((ubicacion) => (
                      <option key={ubicacion.id} value={ubicacion.id}>
                        {ubicacion.codigo}{ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Lote</label>
                  <select
                    className="border rounded p-2 w-full"
                    value={form.lote_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, lote_id: e.target.value }))}
                  >
                    <option value="">— Sin lote —</option>
                    {lotes.map((lote) => (
                      <option key={lote.id} value={lote.id}>
                        {lote.codigo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fecha nacimiento</label>
                    <input
                      type="date"
                      className="border rounded p-2 w-full"
                      value={form.fecha_nacimiento}
                      onChange={(e) => setForm((prev) => ({ ...prev, fecha_nacimiento: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Peso lb</label>
                    <input
                      type="number"
                      className="border rounded p-2 w-full"
                      value={form.peso_lb}
                      onChange={(e) => setForm((prev) => ({ ...prev, peso_lb: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Notas</label>
                  <textarea
                    className="border rounded p-2 w-full min-h-[80px]"
                    value={form.notas}
                    onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={guardarCambios}
                    disabled={guardando}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
                  >
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>

                  <button
                    onClick={imprimirFicha}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded text-sm"
                  >
                    Imprimir ficha PDF
                  </button>

                  <button
                    onClick={darDeBajaCerda}
                    disabled={guardando}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
                  >
                    Eliminar / Baja
                  </button>

                  <button
                    onClick={limpiarSeleccion}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="mt-5 border-t pt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold">Historial completo de eventos</h3>
                    <p className="text-[11px] text-gray-500">
                      La ficha incluye toda la información registrada: partos, montas, destetes, repeticiones, abortos, traslados, bajas, edición y demás eventos.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEventoDesde('')
                      setEventoHasta('')
                      setEventoTipo('')
                      setEventoBusqueda('')
                    }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-3 py-1 rounded text-xs"
                  >
                    Limpiar filtros
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                  <div>
                    <label className="block font-semibold mb-1">Desde</label>
                    <input
                      type="date"
                      className="border rounded p-1 w-full"
                      value={eventoDesde}
                      onChange={(e) => setEventoDesde(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Hasta</label>
                    <input
                      type="date"
                      className="border rounded p-1 w-full"
                      value={eventoHasta}
                      onChange={(e) => setEventoHasta(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Tipo</label>
                    <select
                      className="border rounded p-1 w-full"
                      value={eventoTipo}
                      onChange={(e) => setEventoTipo(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {tiposEventosDisponibles.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Buscar evento</label>
                    <input
                      className="border rounded p-1 w-full"
                      placeholder="Resultado, obs., datos, ubicación..."
                      value={eventoBusqueda}
                      onChange={(e) => setEventoBusqueda(e.target.value)}
                    />
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 mb-2">
                  Mostrando {eventosCerdaSeleccionadaFiltrados.length} de {eventosCerdaSeleccionadaTodos.length} eventos.
                </div>

                <div className="border rounded overflow-auto max-h-[360px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-200 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Fecha</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Resultado</th>
                        <th className="p-2 text-left">Ubicación</th>
                        <th className="p-2 text-left">Datos</th>
                        <th className="p-2 text-left">Obs.</th>
                      </tr>
                    </thead>

                    <tbody>
                      {eventosCerdaSeleccionadaFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-3 text-gray-500">
                            No hay eventos con los filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        eventosCerdaSeleccionadaFiltrados.map((ev) => (
                          <tr key={ev.id} className="border-t">
                            <td className="p-2">{formatFecha(ev.fecha)}</td>
                            <td className="p-2">{ev.tipo}</td>
                            <td className="p-2">{ev.resultado || '—'}</td>
                            <td className="p-2">{ubicacionTexto(ev.granja_ubicaciones)}</td>
                            <td className="p-2 text-[11px]">{datosTexto(ev)}</td>
                            <td className="p-2">{ev.observaciones || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
