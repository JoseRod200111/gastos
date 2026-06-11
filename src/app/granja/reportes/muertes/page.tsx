'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Ubicacion = {
  id: number
  codigo: string | null
  nombre: string | null
}

type Cerda = {
  id: number
  arete: string | null
  nombre: string | null
  estado: string | null
  activa: boolean | null
  ubicacion_id: number | null
}

type EventoMuerteCerda = {
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
  created_at: string | null
  granja_cerdas?: {
    id: number
    arete: string | null
    nombre: string | null
    estado: string | null
    activa: boolean | null
    ubicacion_id: number | null
  } | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
}

type BajaMuerte = {
  id: number
  fecha: string
  ubicacion_id: number | null
  lote_id: number | null
  cantidad: number | null
  hembras: number | null
  machos: number | null
  motivo: string | null
  foto_url: string | null
  observaciones: string | null
  reportado_por: string | null
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
}

type RegistroMuerte = {
  id: string
  origen: 'CERDA' | 'LOTE'
  referenciaId: number
  fecha: string
  fechaOrden: string
  cerdaId: number | null
  arete: string
  nombreCerda: string
  estadoCerda: string
  ubicacionId: number | null
  ubicacionCodigo: string
  ubicacionTexto: string
  cantidad: number
  hembras: number
  machos: number
  causaCategoria: string
  causaTexto: string
  observaciones: string
  detalle: string
  createdAt: string | null
}

type ResumenCausa = {
  causa: string
  cantidad: number
  porcentaje: number
}

type ResumenUbicacion = {
  ubicacion: string
  cantidad: number
}

const CAUSAS = [
  { value: '', label: 'Todas las causas' },
  { value: 'RESPIRATORIA', label: 'Respiratoria' },
  { value: 'DIGESTIVA', label: 'Digestiva / diarrea / cólico' },
  { value: 'LOCOMOTORA', label: 'Locomotora / lesión / cojeras' },
  { value: 'REPRODUCTIVA', label: 'Reproductiva / parto / aborto' },
  { value: 'PROLAPSO', label: 'Prolapso' },
  { value: 'CARDIACA', label: 'Cardiaca / muerte súbita' },
  { value: 'ACCIDENTE', label: 'Accidente / golpe / aplastamiento' },
  { value: 'INFECCIOSA', label: 'Infecciosa / fiebre / septicemia' },
  { value: 'DESCONOCIDA', label: 'Desconocida / sin clasificar' },
  { value: 'OTRA', label: 'Otra' },
]

const CAUSA_LABEL: Record<string, string> = Object.fromEntries(
  CAUSAS.map((c) => [c.value, c.label])
)

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const restarDias = (fecha: string, dias: number) => {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() - dias)

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}`
}

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const texto = (value: unknown) => String(value ?? '').trim()

const normalizar = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const ubicacionTexto = (
  ubicacion?: { codigo: string | null; nombre: string | null } | null
) => {
  if (!ubicacion) return '—'

  const codigo = ubicacion.codigo || ''
  const nombre = ubicacion.nombre || ''

  if (!codigo && !nombre) return '—'
  return `${codigo}${nombre ? ` — ${nombre}` : ''}`
}

const clasificarCausa = (motivoRaw: unknown) => {
  const motivo = normalizar(motivoRaw)

  if (!motivo) return 'DESCONOCIDA'

  if (
    motivo.includes('resp') ||
    motivo.includes('tos') ||
    motivo.includes('pulmon') ||
    motivo.includes('neum') ||
    motivo.includes('ahog') ||
    motivo.includes('asfix')
  ) {
    return 'RESPIRATORIA'
  }

  if (
    motivo.includes('diar') ||
    motivo.includes('digest') ||
    motivo.includes('estom') ||
    motivo.includes('intestinal') ||
    motivo.includes('colico') ||
    motivo.includes('ulcera') ||
    motivo.includes('vomito')
  ) {
    return 'DIGESTIVA'
  }

  if (
    motivo.includes('cojera') ||
    motivo.includes('pata') ||
    motivo.includes('locom') ||
    motivo.includes('lesion') ||
    motivo.includes('fract') ||
    motivo.includes('herida') ||
    motivo.includes('articul') ||
    motivo.includes('postrada') ||
    motivo.includes('no se levanta')
  ) {
    return 'LOCOMOTORA'
  }

  if (
    motivo.includes('parto') ||
    motivo.includes('aborto') ||
    motivo.includes('uter') ||
    motivo.includes('metritis') ||
    motivo.includes('reproduct') ||
    motivo.includes('lactancia') ||
    motivo.includes('periparto')
  ) {
    return 'REPRODUCTIVA'
  }

  if (motivo.includes('prolap')) {
    return 'PROLAPSO'
  }

  if (
    motivo.includes('corazon') ||
    motivo.includes('card') ||
    motivo.includes('subita') ||
    motivo.includes('infarto')
  ) {
    return 'CARDIACA'
  }

  if (
    motivo.includes('accidente') ||
    motivo.includes('golpe') ||
    motivo.includes('aplast') ||
    motivo.includes('trauma') ||
    motivo.includes('caida')
  ) {
    return 'ACCIDENTE'
  }

  if (
    motivo.includes('fiebre') ||
    motivo.includes('infecc') ||
    motivo.includes('septic') ||
    motivo.includes('bacteria') ||
    motivo.includes('virus') ||
    motivo.includes('erisipela')
  ) {
    return 'INFECCIOSA'
  }

  if (
    motivo.includes('desconoc') ||
    motivo.includes('sin causa') ||
    motivo.includes('no se sabe') ||
    motivo.includes('n/a')
  ) {
    return 'DESCONOCIDA'
  }

  return 'OTRA'
}

const getCausaLabel = (value: string) => CAUSA_LABEL[value] || value || '—'

const getMotivoEvento = (ev: EventoMuerteCerda) => {
  const datos = ev.datos || {}
  const motivoDatos = texto(datos.motivo)
  const obs = texto(ev.observaciones)
  const resultado = texto(ev.resultado)

  return motivoDatos || obs || resultado || 'Sin motivo registrado'
}

const getMotivoBaja = (baja: BajaMuerte) => {
  return texto(baja.motivo) || texto(baja.observaciones) || 'Sin motivo registrado'
}

const crearPieChartDataUrl = (resumen: ResumenCausa[]) => {
  if (typeof document === 'undefined') return null
  if (resumen.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = 520
  canvas.height = 320

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const colors = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#f59e0b',
    '#7c3aed',
    '#0891b2',
    '#be123c',
    '#65a30d',
    '#4b5563',
    '#9333ea',
  ]

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const total = resumen.reduce((s, r) => s + r.cantidad, 0)
  const cx = 160
  const cy = 160
  const radius = 105

  let start = -Math.PI / 2

  resumen.forEach((row, idx) => {
    const angle = (row.cantidad / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, start, start + angle)
    ctx.closePath()
    ctx.fillStyle = colors[idx % colors.length]
    ctx.fill()
    start += angle
  })

  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.font = 'bold 18px Arial'
  ctx.fillStyle = '#111827'
  ctx.fillText('Distribución por causa', 300, 38)

  ctx.font = '13px Arial'

  resumen.slice(0, 9).forEach((row, idx) => {
    const y = 70 + idx * 24

    ctx.fillStyle = colors[idx % colors.length]
    ctx.fillRect(300, y - 11, 14, 14)

    ctx.fillStyle = '#111827'
    ctx.fillText(
      `${row.causa}: ${row.cantidad} (${row.porcentaje.toFixed(1)}%)`,
      322,
      y
    )
  })

  return canvas.toDataURL('image/png')
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()

    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getLastAutoTableY(doc: jsPDF, fallback: number) {
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || fallback
  )
}

export default function ReporteMuertesPage() {
  const hoy = useMemo(() => hoyISO(), [])

  const [desde, setDesde] = useState(restarDias(hoy, 30))
  const [hasta, setHasta] = useState(hoy)
  const [cerdaId, setCerdaId] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [causa, setCausa] = useState('')
  const [buscar, setBuscar] = useState('')

  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [eventosMuerte, setEventosMuerte] = useState<EventoMuerteCerda[]>([])
  const [bajasMuerte, setBajasMuerte] = useState<BajaMuerte[]>([])
  const [loading, setLoading] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const cargarCatalogos = useCallback(async () => {
    const [cerdasRes, ubicRes] = await Promise.all([
      supabase
        .from('granja_cerdas')
        .select('id, arete, nombre, estado, activa, ubicacion_id')
        .eq('estado', 'MUERTA')
        .order('arete', { ascending: true }),

      supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre')
        .order('codigo', { ascending: true }),
    ])

    if (cerdasRes.error) {
      console.error('Error cargando cerdas muertas', cerdasRes.error)
    }

    if (ubicRes.error) {
      console.error('Error cargando ubicaciones', ubicRes.error)
    }

    setCerdas((cerdasRes.data || []) as Cerda[])
    setUbicaciones((ubicRes.data || []) as Ubicacion[])
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      let eventosQuery = supabase
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
          user_id,
          created_at,
          granja_cerdas (
            id,
            arete,
            nombre,
            estado,
            activa,
            ubicacion_id
          ),
          granja_ubicaciones (
            codigo,
            nombre
          )
        `
        )
        .eq('tipo', 'MUERTE')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (desde) eventosQuery = eventosQuery.gte('fecha', desde)
      if (hasta) eventosQuery = eventosQuery.lte('fecha', hasta)
      if (cerdaId) eventosQuery = eventosQuery.eq('cerda_id', Number(cerdaId))
      if (ubicacionId) eventosQuery = eventosQuery.eq('ubicacion_id', Number(ubicacionId))

      let bajasQuery = supabase
        .from('granja_bajas_muerte')
        .select(
          `
          id,
          fecha,
          ubicacion_id,
          lote_id,
          cantidad,
          hembras,
          machos,
          motivo,
          foto_url,
          observaciones,
          reportado_por,
          granja_ubicaciones (
            codigo,
            nombre
          )
        `
        )
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })

      if (desde) bajasQuery = bajasQuery.gte('fecha', desde)
      if (hasta) bajasQuery = bajasQuery.lte('fecha', hasta)
      if (ubicacionId) bajasQuery = bajasQuery.eq('ubicacion_id', Number(ubicacionId))

      const [eventosRes, bajasRes] = await Promise.all([eventosQuery, bajasQuery])

      if (eventosRes.error) {
        console.error('Error cargando eventos de muerte', eventosRes.error)
        alert(`No se pudieron cargar muertes de cerdas: ${eventosRes.error.message}`)
      }

      if (bajasRes.error) {
        console.error('Error cargando bajas por muerte', bajasRes.error)
        alert(`No se pudieron cargar bajas por muerte: ${bajasRes.error.message}`)
      }

      setEventosMuerte((eventosRes.data || []) as unknown as EventoMuerteCerda[])
      setBajasMuerte((bajasRes.data || []) as unknown as BajaMuerte[])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, cerdaId, ubicacionId])

  useEffect(() => {
    cargarCatalogos()
  }, [cargarCatalogos])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const registrosBase = useMemo<RegistroMuerte[]>(() => {
    const eventos: RegistroMuerte[] = eventosMuerte.map((ev) => {
      const motivo = getMotivoEvento(ev)
      const causaCategoria = clasificarCausa(motivo)
      const cerda = ev.granja_cerdas
      const ubic = ev.granja_ubicaciones

      return {
        id: `cerda-${ev.id}`,
        origen: 'CERDA',
        referenciaId: ev.id,
        fecha: ev.fecha,
        fechaOrden: ev.fecha || ev.created_at || '',
        cerdaId: cerda?.id ?? ev.cerda_id ?? null,
        arete: cerda?.arete || '—',
        nombreCerda: cerda?.nombre || '—',
        estadoCerda: cerda?.estado || '—',
        ubicacionId: ev.ubicacion_id,
        ubicacionCodigo: ubic?.codigo || '—',
        ubicacionTexto: ubicacionTexto(ubic),
        cantidad: 1,
        hembras: 1,
        machos: 0,
        causaCategoria,
        causaTexto: motivo,
        observaciones: ev.observaciones || '',
        detalle: `Muerte registrada como evento de cerda${
          cerda?.activa === false ? ' · Cerda inactiva' : ''
        }`,
        createdAt: ev.created_at,
      }
    })

    const bajas: RegistroMuerte[] = bajasMuerte.map((baja) => {
      const motivo = getMotivoBaja(baja)
      const causaCategoria = clasificarCausa(motivo)
      const ubic = baja.granja_ubicaciones

      return {
        id: `baja-${baja.id}`,
        origen: 'LOTE',
        referenciaId: baja.id,
        fecha: baja.fecha,
        fechaOrden: baja.fecha || '',
        cerdaId: null,
        arete: '—',
        nombreCerda: 'No aplica',
        estadoCerda: '—',
        ubicacionId: baja.ubicacion_id,
        ubicacionCodigo: ubic?.codigo || '—',
        ubicacionTexto: ubicacionTexto(ubic),
        cantidad: toNum(baja.cantidad),
        hembras: toNum(baja.hembras),
        machos: toNum(baja.machos),
        causaCategoria,
        causaTexto: motivo,
        observaciones: baja.observaciones || '',
        detalle: `Baja general por muerte${baja.foto_url ? ' · Tiene foto/enlace' : ''}`,
        createdAt: null,
      }
    })

    return [...eventos, ...bajas].sort((a, b) =>
      b.fechaOrden.localeCompare(a.fechaOrden)
    )
  }, [eventosMuerte, bajasMuerte])

  const registros = useMemo(() => {
    const q = normalizar(buscar)

    return registrosBase.filter((r) => {
      if (causa && r.causaCategoria !== causa) return false

      if (q) {
        const hay = normalizar(
          [
            r.arete,
            r.nombreCerda,
            r.estadoCerda,
            r.ubicacionTexto,
            r.causaTexto,
            r.observaciones,
            r.detalle,
            r.referenciaId,
            r.origen,
          ].join(' ')
        )

        if (!hay.includes(q)) return false
      }

      return true
    })
  }, [registrosBase, causa, buscar])

  const resumen = useMemo(() => {
    const totalMuertes = registros.reduce((s, r) => s + r.cantidad, 0)

    const totalCerdas = registros
      .filter((r) => r.origen === 'CERDA')
      .reduce((s, r) => s + r.cantidad, 0)

    const totalLote = registros
      .filter((r) => r.origen === 'LOTE')
      .reduce((s, r) => s + r.cantidad, 0)

    const causaMap = new Map<string, number>()
    const ubicMap = new Map<string, number>()
    const estadoMap = new Map<string, number>()

    registros.forEach((r) => {
      const causaLabel = getCausaLabel(r.causaCategoria)

      causaMap.set(causaLabel, (causaMap.get(causaLabel) || 0) + r.cantidad)
      ubicMap.set(r.ubicacionCodigo, (ubicMap.get(r.ubicacionCodigo) || 0) + r.cantidad)

      if (r.origen === 'CERDA') {
        estadoMap.set(r.estadoCerda, (estadoMap.get(r.estadoCerda) || 0) + r.cantidad)
      }
    })

    const porCausa: ResumenCausa[] = Array.from(causaMap.entries())
      .map(([causaLabel, cantidad]) => ({
        causa: causaLabel,
        cantidad,
        porcentaje: totalMuertes > 0 ? (cantidad / totalMuertes) * 100 : 0,
      }))
      .sort((a, b) => b.cantidad - a.cantidad)

    const porUbicacion: ResumenUbicacion[] = Array.from(ubicMap.entries())
      .map(([ubicacion, cantidad]) => ({ ubicacion, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    const porEstado = Array.from(estadoMap.entries())
      .map(([estado, cantidad]) => ({ estado, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)

    return {
      totalMuertes,
      totalCerdas,
      totalLote,
      porCausa,
      porUbicacion,
      porEstado,
      causaPrincipal: porCausa[0],
      ubicacionPrincipal: porUbicacion[0],
      estadoPrincipal: porEstado[0],
    }
  }, [registros])

  const generarPDF = async () => {
    if (registros.length === 0) {
      alert('No hay datos para generar el PDF.')
      return
    }

    setGenerandoPdf(true)

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const logo = await fetchLogoDataUrl()

      let y = 8

      if (logo) {
        doc.addImage(logo, 'PNG', pageWidth / 2 - 20, y, 40, 16)
        y += 20
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(20, 20, 20)
      doc.text('REPORTE DE MUERTES DE GRANJA', pageWidth / 2, y, {
        align: 'center',
      })

      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.text(`Generado: ${new Date().toLocaleString()}`, pageWidth / 2, y, {
        align: 'center',
      })

      y += 6

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: 12, right: 12 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        body: [
          ['Desde', desde || '—', 'Hasta', hasta || '—'],
          [
            'Cerda',
            cerdaId
              ? cerdas.find((c) => String(c.id) === cerdaId)?.arete || cerdaId
              : 'Todas',
            'Ubicación',
            ubicacionId
              ? ubicaciones.find((u) => String(u.id) === ubicacionId)?.codigo ||
                ubicacionId
              : 'Todas',
          ],
          ['Causa', causa ? getCausaLabel(causa) : 'Todas', 'Búsqueda', buscar || '—'],
        ],
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 24 },
          1: { cellWidth: 78 },
          2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 24 },
          3: { cellWidth: 130 },
        },
      })

      y = getLastAutoTableY(doc, y) + 5

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        margin: { left: 12, right: 12 },
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        body: [
          [
            'Total muertes',
            String(resumen.totalMuertes),
            'Muertes de cerdas',
            String(resumen.totalCerdas),
          ],
          [
            'Bajas generales',
            String(resumen.totalLote),
            'Causa principal',
            resumen.causaPrincipal
              ? `${resumen.causaPrincipal.causa} (${resumen.causaPrincipal.cantidad})`
              : '—',
          ],
          [
            'Ubicación principal',
            resumen.ubicacionPrincipal
              ? `${resumen.ubicacionPrincipal.ubicacion} (${resumen.ubicacionPrincipal.cantidad})`
              : '—',
            'Estado más repetido',
            resumen.estadoPrincipal
              ? `${resumen.estadoPrincipal.estado} (${resumen.estadoPrincipal.cantidad})`
              : '—',
          ],
        ],
        columnStyles: {
          0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 36 },
          1: { cellWidth: 60 },
          2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 40 },
          3: { cellWidth: 120 },
        },
      })

      y = getLastAutoTableY(doc, y) + 6

      const pie = crearPieChartDataUrl(resumen.porCausa)

      if (pie) {
        doc.addImage(pie, 'PNG', 12, y, 124, 76)

        autoTable(doc, {
          startY: y,
          theme: 'grid',
          margin: { left: 145, right: 12 },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255 },
          head: [['Causa', 'Cantidad', '%']],
          body: resumen.porCausa.map((r) => [
            r.causa,
            String(r.cantidad),
            `${r.porcentaje.toFixed(1)}%`,
          ]),
          columnStyles: {
            0: { cellWidth: 74 },
            1: { halign: 'right', cellWidth: 24 },
            2: { halign: 'right', cellWidth: 24 },
          },
        })

        y = Math.max(y + 82, getLastAutoTableY(doc, y) + 6)
      }

      autoTable(doc, {
        startY: y,
        theme: 'striped',
        margin: { left: 12, right: 12, bottom: 14 },
        styles: {
          fontSize: 7.2,
          cellPadding: 1.7,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center',
        },
        head: [
          [
            'Fecha',
            'Tipo',
            'Arete',
            'Cerda',
            'Ubicación',
            'Cant.',
            'H',
            'M',
            'Causa',
            'Motivo / Observación',
          ],
        ],
        body: registros.map((r) => [
          r.fecha,
          r.origen === 'CERDA' ? 'Cerda' : 'General',
          r.arete,
          r.nombreCerda,
          r.ubicacionTexto,
          String(r.cantidad),
          String(r.hembras),
          String(r.machos),
          getCausaLabel(r.causaCategoria),
          `${r.causaTexto}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
        ]),
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 18 },
          2: { cellWidth: 22 },
          3: { cellWidth: 34 },
          4: { cellWidth: 40 },
          5: { cellWidth: 13, halign: 'right' },
          6: { cellWidth: 10, halign: 'right' },
          7: { cellWidth: 10, halign: 'right' },
          8: { cellWidth: 34 },
          9: { cellWidth: 58 },
        },
      })

      const totalPages = doc.getNumberOfPages()

      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(120, 120, 120)

        doc.text(`Página ${i} de ${totalPages}`, pageWidth - 12, pageHeight - 7, {
          align: 'right',
        })
      }

      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)

      doc.save(`reporte_muertes_granja_${stamp}.pdf`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <img src="/logo.png" alt="Logo" className="h-10" />

        <div>
          <h1 className="text-2xl font-bold">Reporte de muertes</h1>
        </div>

        <Link
          href="/granja"
          className="ml-auto bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="border rounded-lg bg-white p-4 shadow-sm mb-4">
        <h2 className="font-semibold mb-3">Filtros de búsqueda</h2>

        <div className="grid md:grid-cols-6 gap-3 text-sm">
          <div>
            <label className="block text-xs font-semibold mb-1">Desde</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Hasta</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Cerda fallecida</label>
            <select
              className="border rounded p-2 w-full"
              value={cerdaId}
              onChange={(e) => setCerdaId(e.target.value)}
            >
              <option value="">Todas las cerdas fallecidas</option>
              {cerdas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.arete || `ID ${c.id}`}
                  {c.nombre ? ` — ${c.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Ubicación</label>
            <select
              className="border rounded p-2 w-full"
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
            >
              <option value="">Todas las ubicaciones</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo || `ID ${u.id}`}
                  {u.nombre ? ` — ${u.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Causa</label>
            <select
              className="border rounded p-2 w-full"
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
            >
              {CAUSAS.map((c) => (
                <option key={c.value || 'TODAS'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Texto</label>
            <input
              className="border rounded p-2 w-full"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Arete, motivo, observación..."
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>

          <button
            onClick={() => {
              setDesde(restarDias(hoyISO(), 30))
              setHasta(hoyISO())
              setCerdaId('')
              setUbicacionId('')
              setCausa('')
              setBuscar('')
            }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
          >
            Limpiar
          </button>

          <button
            onClick={generarPDF}
            disabled={generandoPdf || registros.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {generandoPdf ? 'Generando PDF...' : 'Imprimir PDF'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <div className="border rounded bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-600">Total muertes</div>
          <div className="text-2xl font-bold">{resumen.totalMuertes}</div>
        </div>

        <div className="border rounded bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-600">Muertes de cerdas</div>
          <div className="text-2xl font-bold">{resumen.totalCerdas}</div>
        </div>

        <div className="border rounded bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-600">Bajas generales</div>
          <div className="text-2xl font-bold">{resumen.totalLote}</div>
        </div>

        <div className="border rounded bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-600">Causa principal</div>
          <div className="text-lg font-bold">
            {resumen.causaPrincipal
              ? `${resumen.causaPrincipal.causa} (${resumen.causaPrincipal.cantidad})`
              : '—'}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Muertes por causa</h2>

          <div className="space-y-2 text-sm">
            {resumen.porCausa.length === 0 ? (
              <div className="text-gray-500">Sin datos.</div>
            ) : (
              resumen.porCausa.map((r) => (
                <div key={r.causa}>
                  <div className="flex justify-between gap-3">
                    <span>{r.causa}</span>
                    <b>
                      {r.cantidad} · {r.porcentaje.toFixed(1)}%
                    </b>
                  </div>

                  <div className="h-2 bg-gray-200 rounded">
                    <div
                      className="h-2 bg-blue-600 rounded"
                      style={{ width: `${Math.min(100, r.porcentaje)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Ubicaciones con más muertes</h2>

          <div className="space-y-2 text-sm">
            {resumen.porUbicacion.slice(0, 8).map((r) => (
              <div key={r.ubicacion} className="flex justify-between border-b pb-1">
                <span>{r.ubicacion}</span>
                <b>{r.cantidad}</b>
              </div>
            ))}

            {resumen.porUbicacion.length === 0 ? (
              <div className="text-gray-500">Sin datos.</div>
            ) : null}
          </div>
        </div>

        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Lectura rápida</h2>

          <div className="text-sm space-y-2">
            <p>
              <b>Ubicación principal:</b>{' '}
              {resumen.ubicacionPrincipal
                ? `${resumen.ubicacionPrincipal.ubicacion} (${resumen.ubicacionPrincipal.cantidad})`
                : '—'}
            </p>

            <p>
              <b>Estado de cerda más repetido:</b>{' '}
              {resumen.estadoPrincipal
                ? `${resumen.estadoPrincipal.estado} (${resumen.estadoPrincipal.cantidad})`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
        <div className="p-3 border-b flex items-center">
          <h2 className="font-semibold">Detalle de muertes</h2>

          <span className="ml-auto text-sm text-gray-600">
            Mostrando {registros.length} registros
          </span>
        </div>

        <div className="overflow-auto max-h-[640px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-200 sticky top-0">
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-left">Arete</th>
                <th className="p-2 text-left">Cerda</th>
                <th className="p-2 text-left">Estado</th>
                <th className="p-2 text-left">Ubicación</th>
                <th className="p-2 text-right">Cant.</th>
                <th className="p-2 text-right">H</th>
                <th className="p-2 text-right">M</th>
                <th className="p-2 text-left">Causa</th>
                <th className="p-2 text-left">Motivo / observación</th>
              </tr>
            </thead>

            <tbody>
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-3 text-center text-gray-500">
                    No hay registros con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2">{r.fecha}</td>
                    <td className="p-2">
                      {r.origen === 'CERDA' ? 'Cerda' : 'General'}
                    </td>
                    <td className="p-2 font-semibold">{r.arete}</td>
                    <td className="p-2">{r.nombreCerda}</td>
                    <td className="p-2">{r.estadoCerda}</td>
                    <td className="p-2">{r.ubicacionTexto}</td>
                    <td className="p-2 text-right font-semibold">{r.cantidad}</td>
                    <td className="p-2 text-right">{r.hembras}</td>
                    <td className="p-2 text-right">{r.machos}</td>
                    <td className="p-2">{getCausaLabel(r.causaCategoria)}</td>
                    <td className="p-2">
                      <div>{r.causaTexto}</div>

                      {r.observaciones ? (
                        <div className="text-gray-500 mt-1">{r.observaciones}</div>
                      ) : null}

                      <div className="text-gray-400 mt-1">{r.detalle}</div>
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
