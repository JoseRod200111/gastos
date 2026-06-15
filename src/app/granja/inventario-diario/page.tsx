'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  tipo: string | null
  activo?: boolean | null
}

type GranjaMovimiento = {
  ubicacion_id: number
  tipo:
    | 'ENTRADA_COMPRA'
    | 'ENTRADA_PARTO'
    | 'SALIDA_VENTA'
    | 'SALIDA_MUERTE'
    | 'AJUSTE'
  cantidad: number | null
  fecha: string
}

type InventarioDiarioRow = {
  ubicacion_id: number
  conteo_manual: number
  teorico_al_momento: number | null
  diferencia: number | null
  hembras_manual?: number | null
  machos_manual?: number | null
}

type InventarioDiarioCerdaRow = {
  ubicacion_id: number
  cerda_id: number
}

type CerdaRow = {
  id: number
  arete: string | null
  nombre: string | null
  ubicacion_id: number | null
  estado: string | null
  activa: boolean | null
}

type EstadoUbicacion = {
  teorico: number

  cerdasTeorico: number
  lechonesTeorico: number
  cerdosTeorico: number

  cerdasManual: string
  lechonesManual: string
  cerdosManual: string

  aretes: string[]
  cerdaIdsTeoricos: number[]
  cerdaIdsManual: number[]

  totalManual: number
  diferencia: number
}

type GrupoUbicaciones = Record<string, Ubicacion[]>
type CerdasMap = Record<number, number>
type AretesMap = Record<number, string[]>
type CerdaIdsMap = Record<number, number[]>

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const absNum = (v: unknown) => Math.abs(toNum(v))

const hoyISO = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const finDeDiaUTC = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

const getLastAutoTableY = (doc: jsPDF, fallback: number) => {
  return (
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || fallback
  )
}

const esMaternidadOGestacion = (ubicacion: Ubicacion) => {
  const codigo = String(ubicacion.codigo || '').toUpperCase()
  const nombre = String(ubicacion.nombre || '').toUpperCase()

  return (
    nombre.includes('MATERNIDAD') ||
    nombre.includes('GESTACIÓN') ||
    nombre.includes('GESTACION') ||
    codigo.startsWith('M1') ||
    codigo.startsWith('M2') ||
    codigo.startsWith('G1') ||
    codigo.startsWith('G2') ||
    codigo.startsWith('G3')
  )
}

const groupNameFor = (ubicacion: Ubicacion) => {
  const codigo = ubicacion.codigo || ''
  const nombre = ubicacion.nombre || ''

  if (nombre.includes(' - ')) {
    return nombre.split(' - ')[0] || 'Otros'
  }

  if (nombre) return nombre

  if (codigo.startsWith('G1')) return 'Gestación 1'
  if (codigo.startsWith('G2')) return 'Gestación 2'
  if (codigo.startsWith('G3')) return 'Gestación 3'
  if (codigo.startsWith('TR')) return 'Galera'
  if (codigo.startsWith('M1')) return 'Maternidad 1'
  if (codigo.startsWith('M2')) return 'Maternidad 2'
  if (codigo.startsWith('L1')) return 'Lechonera 1'
  if (codigo.startsWith('L2')) return 'Lechonera 2'
  if (codigo.startsWith('L3')) return 'Lechonera 3'
  if (codigo.startsWith('S2')) return 'Sitio 2'

  return 'Otros'
}

const ordenarUbicaciones = (a: Ubicacion, b: Ubicacion) => {
  return a.codigo.localeCompare(b.codigo, 'es', {
    numeric: true,
    sensitivity: 'base',
  })
}

const ordenarGrupos = (a: string, b: string) => {
  const ordenPreferido = [
    'Gestación 1',
    'Gestación 2',
    'Gestación 3',
    'Galera 1',
    'Galera 2',
    'Galera 3',
    'Galera 4',
    'Galera',
    'Lechonera 1',
    'Lechonera 2',
    'Lechonera 3',
    'Maternidad 1',
    'Maternidad 2',
    'Sitio 2',
    'Otros',
  ]

  const ia = ordenPreferido.indexOf(a)
  const ib = ordenPreferido.indexOf(b)

  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1

  return a.localeCompare(b, 'es', {
    numeric: true,
    sensitivity: 'base',
  })
}

const limpiarNumeroInput = (value: string) => {
  if (value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return String(Math.max(Math.floor(n), 0))
}

const calcularTotalManual = (
  cerdasManual: string,
  lechonesManual: string,
  cerdosManual: string
) => {
  if (cerdasManual === '' && lechonesManual === '' && cerdosManual === '') {
    return 0
  }

  return toNum(cerdasManual) + toNum(lechonesManual) + toNum(cerdosManual)
}

const etiquetaCerda = (cerda: CerdaRow | undefined) => {
  if (!cerda) return 'Cerda no encontrada'

  const arete =
    cerda.arete && cerda.arete.trim() !== ''
      ? cerda.arete
      : `Sin arete #${cerda.id}`

  return `${arete}${cerda.nombre ? ` — ${cerda.nombre}` : ''}`
}

const idsToAretes = (ids: number[], cerdas: CerdaRow[]) => {
  return ids
    .map((id) => etiquetaCerda(cerdas.find((c) => c.id === id)))
    .sort((a, b) =>
      a.localeCompare(b, 'es', {
        numeric: true,
        sensitivity: 'base',
      })
    )
}

const nombreUbicacion = (ubicacion?: Ubicacion) => {
  if (!ubicacion) return '—'
  return `${ubicacion.codigo}${ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}`
}

const obtenerResumenCerdas = (
  ubicacionId: number,
  item: EstadoUbicacion,
  cerdas: CerdaRow[],
  ubicaciones: Ubicacion[]
) => {
  const teoricas = item.cerdaIdsTeoricos
  const contadas = item.cerdaIdsManual

  if (teoricas.length === 0 && contadas.length === 0) {
    return '—'
  }

  const faltantes = teoricas.filter((id) => !contadas.includes(id))
  const sobrantes = contadas.filter((id) => !teoricas.includes(id))

  if (faltantes.length === 0 && sobrantes.length === 0) {
    return 'OK'
  }

  const partes: string[] = []

  if (faltantes.length > 0) {
    partes.push(`Faltan: ${idsToAretes(faltantes, cerdas).join(', ')}`)
  }

  if (sobrantes.length > 0) {
    const detalleSobrantes = sobrantes.map((id) => {
      const cerda = cerdas.find((c) => c.id === id)
      const ubicacionTeoricaId = cerda?.ubicacion_id ?? null
      const ubicacionTeorica = ubicaciones.find((u) => u.id === ubicacionTeoricaId)

      if (!ubicacionTeorica || ubicacionTeorica.id === ubicacionId) {
        return etiquetaCerda(cerda)
      }

      return `${etiquetaCerda(cerda)} (teórica en ${ubicacionTeorica.codigo})`
    })

    partes.push(`Extra / fuera de lugar: ${detalleSobrantes.join(', ')}`)
  }

  return partes.join(' | ')
}

function generarPdfInventarioDiario(
  fecha: string,
  grupos: GrupoUbicaciones,
  estado: Record<number, EstadoUbicacion>,
  cerdas: CerdaRow[],
  ubicaciones: Ubicacion[]
) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('Inventario diario de cerdos', 14, 18)

  doc.setFontSize(11)
  doc.text(`Fecha: ${fecha}`, 14, 26)

  const ahora = new Date()

  doc.setFontSize(9)
  doc.text(`Generado: ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`, 14, 32)

  const resumen: Array<{
    area: string
    teorico: number
    cerdas: number
    lechones: number
    cerdos: number
    manual: number
    diferencia: number
  }> = []

  let totalTeorico = 0
  let totalCerdas = 0
  let totalLechones = 0
  let totalCerdos = 0
  let totalManual = 0
  let totalDiferencia = 0

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([area, ubicacionesGrupo]) => {
      let teorico = 0
      let cerdasConteo = 0
      let lechones = 0
      let cerdos = 0
      let manual = 0
      let diferencia = 0
      let tieneConteos = false

      ubicacionesGrupo.forEach((ubicacion) => {
        const item = estado[ubicacion.id]
        if (!item) return

        teorico += item.teorico

        if (
          item.cerdasManual !== '' ||
          item.lechonesManual !== '' ||
          item.cerdosManual !== ''
        ) {
          tieneConteos = true
          cerdasConteo += toNum(item.cerdasManual)
          lechones += toNum(item.lechonesManual)
          cerdos += toNum(item.cerdosManual)
          manual += item.totalManual
          diferencia += item.diferencia
        }
      })

      if (!tieneConteos && teorico === 0) return

      resumen.push({
        area,
        teorico,
        cerdas: cerdasConteo,
        lechones,
        cerdos,
        manual,
        diferencia,
      })

      totalTeorico += teorico
      totalCerdas += cerdasConteo
      totalLechones += lechones
      totalCerdos += cerdos
      totalManual += manual
      totalDiferencia += diferencia
    })

  const body = resumen.map((row) => [
    row.area,
    String(row.teorico),
    String(row.cerdas),
    String(row.lechones),
    String(row.cerdos),
    String(row.manual),
    String(row.diferencia),
  ])

  body.push([
    'TOTAL GENERAL',
    String(totalTeorico),
    String(totalCerdas),
    String(totalLechones),
    String(totalCerdos),
    String(totalManual),
    String(totalDiferencia),
  ])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Cerdas', 'Lechones', 'Cerdos', 'Conteo total', 'Diferencia']],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  })

  let y = getLastAutoTableY(doc, 38) + 8

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([area, ubicacionesGrupo]) => {
      const rows = ubicacionesGrupo
        .map((ubicacion) => {
          const item = estado[ubicacion.id]
          if (!item) return null

          const tieneConteo =
            item.cerdasManual !== '' ||
            item.lechonesManual !== '' ||
            item.cerdosManual !== ''

          if (!tieneConteo) return null

          const cerdasTeoricas = item.aretes.length > 0 ? item.aretes.join(', ') : '—'
          const cerdasContadas =
            item.cerdaIdsManual.length > 0
              ? idsToAretes(item.cerdaIdsManual, cerdas).join(', ')
              : '—'

          const validacion = obtenerResumenCerdas(
            ubicacion.id,
            item,
            cerdas,
            ubicaciones
          )

          return [
            ubicacion.codigo,
            ubicacion.nombre || '',
            String(item.teorico),
            cerdasTeoricas,
            cerdasContadas,
            validacion,
            String(toNum(item.cerdasManual)),
            String(toNum(item.lechonesManual)),
            String(toNum(item.cerdosManual)),
            String(item.totalManual),
            String(item.diferencia),
          ]
        })
        .filter(Boolean) as string[][]

      if (rows.length === 0) return

      if (y > 250) {
        doc.addPage()
        y = 16
      }

      doc.setFontSize(11)
      doc.text(area.toUpperCase(), 14, y)

      autoTable(doc, {
        startY: y + 4,
        head: [
          [
            'Ubic.',
            'Nombre',
            'Teórico',
            'Cerdas teóricas',
            'Cerdas contadas',
            'Validación',
            'Cerdas',
            'Lech.',
            'Cerdos',
            'Total',
            'Dif.',
          ],
        ],
        body: rows,
        styles: { fontSize: 5.8 },
        headStyles: { fillColor: [230, 230, 230] },
        margin: { left: 5, right: 5 },
        columnStyles: {
          0: { cellWidth: 13 },
          1: { cellWidth: 20 },
          2: { cellWidth: 12, halign: 'right' },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 36 },
          6: { cellWidth: 12, halign: 'right' },
          7: { cellWidth: 12, halign: 'right' },
          8: { cellWidth: 12, halign: 'right' },
          9: { cellWidth: 12, halign: 'right' },
          10: { cellWidth: 10, halign: 'right' },
        },
      })

      y = getLastAutoTableY(doc, y) + 8
    })

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  const name = `inventario_diario_${fecha}_${ahora.getFullYear()}${pad(
    ahora.getMonth() + 1
  )}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(
    ahora.getMinutes()
  )}${pad(ahora.getSeconds())}.pdf`

  doc.save(name)
}

export default function InventarioDiarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [estado, setEstado] = useState<Record<number, EstadoUbicacion>>({})
  const [cerdasDisponibles, setCerdasDisponibles] = useState<CerdaRow[]>([])
  const [fecha, setFecha] = useState('')
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [imprimiendo, setImprimiendo] = useState(false)

  const grupos = useMemo(() => {
    const agrupado: GrupoUbicaciones = {}

    ubicaciones.forEach((ubicacion) => {
      const nombreGrupo = groupNameFor(ubicacion)

      if (!agrupado[nombreGrupo]) {
        agrupado[nombreGrupo] = []
      }

      agrupado[nombreGrupo].push(ubicacion)
    })

    Object.keys(agrupado).forEach((grupo) => {
      agrupado[grupo].sort(ordenarUbicaciones)
    })

    return agrupado
  }, [ubicaciones])

  const totalTeoricoGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => sum + toNum(item.teorico), 0)
  }, [estado])

  const totalCerdasGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (
        item.cerdasManual === '' &&
        item.lechonesManual === '' &&
        item.cerdosManual === ''
      ) {
        return sum
      }

      return sum + toNum(item.cerdasManual)
    }, 0)
  }, [estado])

  const totalLechonesGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (
        item.cerdasManual === '' &&
        item.lechonesManual === '' &&
        item.cerdosManual === ''
      ) {
        return sum
      }

      return sum + toNum(item.lechonesManual)
    }, 0)
  }, [estado])

  const totalCerdosGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (
        item.cerdasManual === '' &&
        item.lechonesManual === '' &&
        item.cerdosManual === ''
      ) {
        return sum
      }

      return sum + toNum(item.cerdosManual)
    }, 0)
  }, [estado])

  const totalManualGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (
        item.cerdasManual === '' &&
        item.lechonesManual === '' &&
        item.cerdosManual === ''
      ) {
        return sum
      }

      return sum + toNum(item.totalManual)
    }, 0)
  }, [estado])

  const totalDiferenciaGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (
        item.cerdasManual === '' &&
        item.lechonesManual === '' &&
        item.cerdosManual === ''
      ) {
        return sum
      }

      return sum + toNum(item.diferencia)
    }, 0)
  }, [estado])

  const calcularTeorico = useCallback((ubis: Ubicacion[], movs: GranjaMovimiento[]) => {
    const teoricos: Record<number, number> = {}

    ubis.forEach((ubicacion) => {
      teoricos[ubicacion.id] = 0
    })

    movs.forEach((movimiento) => {
      const ubicacionId = Number(movimiento.ubicacion_id)

      if (teoricos[ubicacionId] === undefined) {
        teoricos[ubicacionId] = 0
      }

      if (movimiento.tipo === 'AJUSTE') {
        teoricos[ubicacionId] += toNum(movimiento.cantidad)
      } else if (
        movimiento.tipo === 'SALIDA_VENTA' ||
        movimiento.tipo === 'SALIDA_MUERTE'
      ) {
        teoricos[ubicacionId] -= absNum(movimiento.cantidad)
      } else {
        teoricos[ubicacionId] += absNum(movimiento.cantidad)
      }
    })

    return teoricos
  }, [])

  const cargarCerdas = useCallback(async () => {
    const { data, error } = await supabase
      .from('granja_cerdas')
      .select('id, arete, nombre, ubicacion_id, estado, activa')
      .eq('activa', true)

    if (error) {
      console.error('Error cargando cerdas', error)
      alert(`Error cargando cerdas registradas: ${error.message}`)

      return {
        cerdasPorUbicacion: {} as CerdasMap,
        aretesPorUbicacion: {} as AretesMap,
        cerdaIdsPorUbicacion: {} as CerdaIdsMap,
        cerdasActivas: [] as CerdaRow[],
      }
    }

    const cerdasActivas = ((data ?? []) as CerdaRow[]).filter((cerda) => {
      const estadoCerda = String(cerda.estado || '').toUpperCase()
      return estadoCerda !== 'MUERTA' && estadoCerda !== 'BAJA'
    })

    const cerdasPorUbicacion: CerdasMap = {}
    const aretesPorUbicacion: AretesMap = {}
    const cerdaIdsPorUbicacion: CerdaIdsMap = {}

    cerdasActivas.forEach((cerda) => {
      if (!cerda.ubicacion_id) return

      const ubicacionId = Number(cerda.ubicacion_id)

      if (cerdasPorUbicacion[ubicacionId] === undefined) {
        cerdasPorUbicacion[ubicacionId] = 0
      }

      if (!aretesPorUbicacion[ubicacionId]) {
        aretesPorUbicacion[ubicacionId] = []
      }

      if (!cerdaIdsPorUbicacion[ubicacionId]) {
        cerdaIdsPorUbicacion[ubicacionId] = []
      }

      cerdasPorUbicacion[ubicacionId] += 1

      aretesPorUbicacion[ubicacionId].push(
        cerda.arete && cerda.arete.trim() !== ''
          ? cerda.arete
          : `Sin arete #${cerda.id}`
      )

      cerdaIdsPorUbicacion[ubicacionId].push(cerda.id)
    })

    Object.keys(aretesPorUbicacion).forEach((id) => {
      aretesPorUbicacion[Number(id)].sort((a, b) =>
        a.localeCompare(b, 'es', {
          numeric: true,
          sensitivity: 'base',
        })
      )
    })

    Object.keys(cerdaIdsPorUbicacion).forEach((id) => {
      cerdaIdsPorUbicacion[Number(id)].sort((a, b) => a - b)
    })

    cerdasActivas.sort((a, b) =>
      etiquetaCerda(a).localeCompare(etiquetaCerda(b), 'es', {
        numeric: true,
        sensitivity: 'base',
      })
    )

    return {
      cerdasPorUbicacion,
      aretesPorUbicacion,
      cerdaIdsPorUbicacion,
      cerdasActivas,
    }
  }, [])

  const cargarDatos = useCallback(async () => {
    if (!fecha) return

    setLoading(true)

    try {
      const { data: ubicacionesDataRaw, error: errUbicaciones } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo, activo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (errUbicaciones) {
        console.error('Error cargando ubicaciones', errUbicaciones)
        alert(`No se pudieron cargar las ubicaciones: ${errUbicaciones.message}`)
        return
      }

      const ubicacionesData = ((ubicacionesDataRaw ?? []) as Ubicacion[]).sort(
        ordenarUbicaciones
      )

      setUbicaciones(ubicacionesData)

      const { data: movimientosDataRaw, error: errMovimientos } = await supabase
        .from('granja_movimientos')
        .select('ubicacion_id, tipo, cantidad, fecha')
        .lte('fecha', finDeDiaUTC(fecha))
        .order('fecha', { ascending: true })

      if (errMovimientos) {
        console.error('Error cargando movimientos', errMovimientos)
        alert(`Error cargando movimientos: ${errMovimientos.message}`)
        return
      }

      const movimientos = (movimientosDataRaw ?? []) as GranjaMovimiento[]
      const teoricos = calcularTeorico(ubicacionesData, movimientos)

      const {
        cerdasPorUbicacion,
        aretesPorUbicacion,
        cerdaIdsPorUbicacion,
        cerdasActivas,
      } = await cargarCerdas()

      setCerdasDisponibles(cerdasActivas)

      let inventarioDiario: InventarioDiarioRow[] = []

      const { data: inventarioDataRaw, error: errInventarioDiario } = await supabase
        .from('granja_inventario_diario')
        .select(
          'ubicacion_id, conteo_manual, teorico_al_momento, diferencia, hembras_manual, machos_manual'
        )
        .eq('fecha', fecha)

      if (!errInventarioDiario) {
        inventarioDiario = (inventarioDataRaw ?? []) as InventarioDiarioRow[]
      } else {
        console.error('Error cargando inventario diario guardado', errInventarioDiario)
      }

      let inventarioCerdas: InventarioDiarioCerdaRow[] = []

      const { data: inventarioCerdasRaw, error: errInventarioCerdas } = await supabase
        .from('granja_inventario_diario_cerdas')
        .select('ubicacion_id, cerda_id')
        .eq('fecha', fecha)

      if (!errInventarioCerdas) {
        inventarioCerdas = (inventarioCerdasRaw ?? []) as InventarioDiarioCerdaRow[]
      } else {
        console.error(
          'Error cargando cerdas contadas en inventario diario',
          errInventarioCerdas
        )
      }

      const mapInventarioDiario = new Map<number, InventarioDiarioRow>()

      inventarioDiario.forEach((row) => {
        mapInventarioDiario.set(Number(row.ubicacion_id), row)
      })

      const mapCerdasManual = new Map<number, number[]>()

      inventarioCerdas.forEach((row) => {
        const ubicacionId = Number(row.ubicacion_id)
        const cerdaId = Number(row.cerda_id)

        if (!mapCerdasManual.has(ubicacionId)) {
          mapCerdasManual.set(ubicacionId, [])
        }

        const actuales = mapCerdasManual.get(ubicacionId) || []

        if (!actuales.includes(cerdaId)) {
          actuales.push(cerdaId)
        }
      })

      const nuevoEstado: Record<number, EstadoUbicacion> = {}

      ubicacionesData.forEach((ubicacion) => {
        const teoricoActual = teoricos[ubicacion.id] ?? 0

        const cerdasTeorico = cerdasPorUbicacion[ubicacion.id] ?? 0
        const aretes = aretesPorUbicacion[ubicacion.id] ?? []
        const cerdaIdsTeoricos = cerdaIdsPorUbicacion[ubicacion.id] ?? []

        const zonaLechones = esMaternidadOGestacion(ubicacion)
        const restanteTeorico = Math.max(teoricoActual - cerdasTeorico, 0)

        const lechonesTeorico = zonaLechones ? restanteTeorico : 0
        const cerdosTeorico = zonaLechones ? 0 : restanteTeorico

        const rowGuardado = mapInventarioDiario.get(ubicacion.id)
        const cerdasManualIdsGuardadas = mapCerdasManual.get(ubicacion.id) || []

        let cerdasManual = ''
        let lechonesManual = ''
        let cerdosManual = ''

        if (rowGuardado) {
          const totalManualGuardado = Math.max(toNum(rowGuardado.conteo_manual), 0)
          const cerdasGuardadas = Math.max(toNum(rowGuardado.hembras_manual), 0)
          const cerdosGuardados = Math.max(toNum(rowGuardado.machos_manual), 0)
          const lechonesGuardados = Math.max(
            totalManualGuardado - cerdasGuardadas - cerdosGuardados,
            0
          )

          cerdasManual =
            cerdasManualIdsGuardadas.length > 0
              ? String(cerdasManualIdsGuardadas.length)
              : String(cerdasGuardadas)

          lechonesManual = String(lechonesGuardados)
          cerdosManual = String(cerdosGuardados)
        }

        if (!rowGuardado && cerdasManualIdsGuardadas.length > 0) {
          cerdasManual = String(cerdasManualIdsGuardadas.length)
        }

        const totalManual = calcularTotalManual(
          cerdasManual,
          lechonesManual,
          cerdosManual
        )

        const tieneConteo =
          cerdasManual !== '' || lechonesManual !== '' || cerdosManual !== ''

        nuevoEstado[ubicacion.id] = {
          teorico: teoricoActual,

          cerdasTeorico,
          lechonesTeorico,
          cerdosTeorico,

          cerdasManual,
          lechonesManual,
          cerdosManual,

          aretes,
          cerdaIdsTeoricos,
          cerdaIdsManual: cerdasManualIdsGuardadas,

          totalManual,
          diferencia: tieneConteo ? totalManual - teoricoActual : 0,
        }
      })

      setEstado(nuevoEstado)
    } finally {
      setLoading(false)
    }
  }, [calcularTeorico, cargarCerdas, fecha])

  useEffect(() => {
    setFecha(hoyISO())
  }, [])

  useEffect(() => {
    if (fecha) {
      cargarDatos()
    }
  }, [fecha, cargarDatos])

  const actualizarConteo = (
    ubicacionId: number,
    campo: 'cerdasManual' | 'lechonesManual' | 'cerdosManual',
    value: string
  ) => {
    const limpio = limpiarNumeroInput(value)

    setEstado((prev) => {
      const actual = prev[ubicacionId]

      if (!actual) return prev

      const cerdasManual =
        campo === 'cerdasManual' ? limpio : actual.cerdasManual

      const lechonesManual =
        campo === 'lechonesManual' ? limpio : actual.lechonesManual

      const cerdosManual =
        campo === 'cerdosManual' ? limpio : actual.cerdosManual

      const totalManual = calcularTotalManual(
        cerdasManual,
        lechonesManual,
        cerdosManual
      )

      const tieneConteo =
        cerdasManual !== '' || lechonesManual !== '' || cerdosManual !== ''

      return {
        ...prev,
        [ubicacionId]: {
          ...actual,
          cerdasManual,
          lechonesManual,
          cerdosManual,
          totalManual,
          diferencia: tieneConteo ? totalManual - actual.teorico : 0,
        },
      }
    })
  }

  const ubicacionDeCerdaSeleccionada = (
    cerdaId: number,
    estadoActual = estado
  ) => {
    for (const [ubicacionId, item] of Object.entries(estadoActual)) {
      if (item.cerdaIdsManual.includes(cerdaId)) {
        return Number(ubicacionId)
      }
    }

    return null
  }

  const agregarCerdaManual = (ubicacionId: number, cerdaIdTexto: string) => {
    if (!cerdaIdTexto) return

    const cerdaId = Number(cerdaIdTexto)

    if (!Number.isFinite(cerdaId) || cerdaId <= 0) return

    setEstado((prev) => {
      const actual = prev[ubicacionId]
      if (!actual) return prev

      if (actual.cerdaIdsManual.includes(cerdaId)) {
        alert('Esa cerda ya fue agregada en esta ubicación.')
        return prev
      }

      const yaAsignadaEn = ubicacionDeCerdaSeleccionada(cerdaId, prev)

      if (yaAsignadaEn !== null && yaAsignadaEn !== ubicacionId) {
        const ubicacion = ubicaciones.find((u) => u.id === yaAsignadaEn)
        alert(
          `Esa cerda ya fue asignada en otra ubicación: ${
            ubicacion?.codigo || yaAsignadaEn
          }. No puede estar dos veces en el mismo inventario diario.`
        )
        return prev
      }

      const cerdaIdsManual = [...actual.cerdaIdsManual, cerdaId].sort(
        (a, b) => a - b
      )

      const cerdasManual = String(cerdaIdsManual.length)

      const totalManual = calcularTotalManual(
        cerdasManual,
        actual.lechonesManual,
        actual.cerdosManual
      )

      const tieneConteo =
        cerdasManual !== '' ||
        actual.lechonesManual !== '' ||
        actual.cerdosManual !== ''

      return {
        ...prev,
        [ubicacionId]: {
          ...actual,
          cerdaIdsManual,
          cerdasManual,
          totalManual,
          diferencia: tieneConteo ? totalManual - actual.teorico : 0,
        },
      }
    })
  }

  const quitarCerdaManual = (ubicacionId: number, cerdaId: number) => {
    setEstado((prev) => {
      const actual = prev[ubicacionId]
      if (!actual) return prev

      const cerdaIdsManual = actual.cerdaIdsManual.filter((id) => id !== cerdaId)
      const cerdasManual =
        cerdaIdsManual.length > 0 ? String(cerdaIdsManual.length) : ''

      const totalManual = calcularTotalManual(
        cerdasManual,
        actual.lechonesManual,
        actual.cerdosManual
      )

      const tieneConteo =
        cerdasManual !== '' ||
        actual.lechonesManual !== '' ||
        actual.cerdosManual !== ''

      return {
        ...prev,
        [ubicacionId]: {
          ...actual,
          cerdaIdsManual,
          cerdasManual,
          totalManual,
          diferencia: tieneConteo ? totalManual - actual.teorico : 0,
        },
      }
    })
  }

  const copiarTeoricoComoConteo = () => {
    setEstado((prev) => {
      const copy: Record<number, EstadoUbicacion> = {}

      Object.entries(prev).forEach(([ubicacionId, item]) => {
        const cerdaIdsManual = [...item.cerdaIdsTeoricos]

        const cerdasManual = String(Math.max(cerdaIdsManual.length, 0))
        const lechonesManual = String(Math.max(item.lechonesTeorico, 0))
        const cerdosManual = String(Math.max(item.cerdosTeorico, 0))

        const totalManual = calcularTotalManual(
          cerdasManual,
          lechonesManual,
          cerdosManual
        )

        copy[Number(ubicacionId)] = {
          ...item,
          cerdasManual,
          lechonesManual,
          cerdosManual,
          cerdaIdsManual,
          totalManual,
          diferencia: totalManual - item.teorico,
        }
      })

      return copy
    })
  }

  const limpiarConteos = () => {
    const confirmar = confirm('¿Limpiar todos los conteos manuales en pantalla?')
    if (!confirmar) return

    setEstado((prev) => {
      const copy: Record<number, EstadoUbicacion> = {}

      Object.entries(prev).forEach(([ubicacionId, item]) => {
        copy[Number(ubicacionId)] = {
          ...item,
          cerdasManual: '',
          lechonesManual: '',
          cerdosManual: '',
          cerdaIdsManual: [],
          totalManual: 0,
          diferencia: 0,
        }
      })

      return copy
    })
  }

  const validarCerdasSeleccionadas = () => {
    const usadas = new Map<number, number>()

    for (const [ubicacionId, item] of Object.entries(estado)) {
      const repetidasEnMismaUbicacion = item.cerdaIdsManual.some(
        (id, index) => item.cerdaIdsManual.indexOf(id) !== index
      )

      if (repetidasEnMismaUbicacion) {
        return 'Hay una cerda repetida dentro de la misma ubicación.'
      }

      for (const cerdaId of item.cerdaIdsManual) {
        if (usadas.has(cerdaId)) {
          const ubicacionA = usadas.get(cerdaId)
          return `Una misma cerda está seleccionada en dos ubicaciones distintas: ${ubicacionA} y ${ubicacionId}.`
        }

        usadas.set(cerdaId, Number(ubicacionId))
      }

      if (
        item.cerdaIdsManual.length > 0 &&
        toNum(item.cerdasManual) !== item.cerdaIdsManual.length
      ) {
        return `El conteo de cerdas no coincide con las cerdas seleccionadas en la ubicación ${ubicacionId}.`
      }
    }

    return null
  }

  const imprimirPdf = async () => {
    if (!fecha) {
      alert('Selecciona una fecha.')
      return
    }

    if (ubicaciones.length === 0) {
      alert('Aún no hay ubicaciones cargadas.')
      return
    }

    const errorCerdas = validarCerdasSeleccionadas()
    if (errorCerdas) {
      alert(errorCerdas)
      return
    }

    const hayConteos = Object.values(estado).some(
      (item) =>
        item.cerdasManual !== '' ||
        item.lechonesManual !== '' ||
        item.cerdosManual !== ''
    )

    if (!hayConteos) {
      const ok = confirm('No hay conteos manuales ingresados. ¿Generar PDF de todos modos?')
      if (!ok) return
    }

    setImprimiendo(true)

    try {
      generarPdfInventarioDiario(
        fecha,
        grupos,
        { ...estado },
        cerdasDisponibles,
        ubicaciones
      )
    } finally {
      setImprimiendo(false)
    }
  }

  const guardarInventario = async () => {
    if (!fecha) {
      alert('Selecciona una fecha.')
      return
    }

    const errorCerdas = validarCerdasSeleccionadas()
    if (errorCerdas) {
      alert(errorCerdas)
      return
    }

    const registrosBase = Object.entries(estado)
      .filter(
        ([, value]) =>
          value.cerdasManual !== '' ||
          value.lechonesManual !== '' ||
          value.cerdosManual !== ''
      )
      .map(([ubicacionId, value]) => {
        const cerdasManual = toNum(value.cerdasManual)
        const lechonesManual = toNum(value.lechonesManual)
        const cerdosManual = toNum(value.cerdosManual)

        const totalManual = cerdasManual + lechonesManual + cerdosManual
        const teorico = value.teorico || 0

        return {
          fecha,
          ubicacion_id: Number(ubicacionId),
          conteo_manual: totalManual,
          teorico_al_momento: teorico,
          diferencia: totalManual - teorico,
          hembras_manual: cerdasManual,
          machos_manual: cerdosManual,
        }
      })

    const registrosCerdas = Object.entries(estado).flatMap(([ubicacionId, value]) =>
      value.cerdaIdsManual.map((cerdaId) => ({
        fecha,
        ubicacion_id: Number(ubicacionId),
        cerda_id: cerdaId,
      }))
    )

    if (registrosBase.length === 0 && registrosCerdas.length === 0) {
      const limpiar = confirm(
        'No hay conteos en pantalla. ¿Quieres borrar el inventario diario guardado para esta fecha?'
      )

      if (!limpiar) return
    }

    const estadoParaPdf = { ...estado }

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const { error: deleteError } = await supabase
        .from('granja_inventario_diario')
        .delete()
        .eq('fecha', fecha)

      if (deleteError) {
        console.error('Error eliminando inventario diario anterior', deleteError)
        alert(`Ocurrió un error al reemplazar el inventario diario: ${deleteError.message}`)
        return
      }

      const { error: deleteCerdasError } = await supabase
        .from('granja_inventario_diario_cerdas')
        .delete()
        .eq('fecha', fecha)

      if (deleteCerdasError) {
        console.error(
          'Error eliminando cerdas del inventario diario anterior',
          deleteCerdasError
        )
        alert(
          `Ocurrió un error al reemplazar las cerdas del inventario diario: ${deleteCerdasError.message}`
        )
        return
      }

      if (registrosBase.length > 0) {
        const registros = registrosBase.map((row) => ({
          ...row,
          user_id: userId,
        }))

        const { error: insertError } = await supabase
          .from('granja_inventario_diario')
          .insert(registros)

        if (insertError) {
          console.error('Error guardando inventario diario', insertError)
          alert(`Ocurrió un error al guardar el inventario diario: ${insertError.message}`)
          return
        }
      }

      if (registrosCerdas.length > 0) {
        const registros = registrosCerdas.map((row) => ({
          ...row,
          user_id: userId,
        }))

        const { error: insertCerdasError } = await supabase
          .from('granja_inventario_diario_cerdas')
          .insert(registros)

        if (insertCerdasError) {
          console.error('Error guardando cerdas contadas', insertCerdasError)
          alert(`Ocurrió un error al guardar las cerdas contadas: ${insertCerdasError.message}`)
          return
        }
      }

      generarPdfInventarioDiario(
        fecha,
        grupos,
        estadoParaPdf,
        cerdasDisponibles,
        ubicaciones
      )

      alert('Inventario diario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const renderCampoUbicacion = (ubicacion: Ubicacion) => {
    const data = estado[ubicacion.id] || {
      teorico: 0,

      cerdasTeorico: 0,
      lechonesTeorico: 0,
      cerdosTeorico: 0,

      cerdasManual: '',
      lechonesManual: '',
      cerdosManual: '',

      aretes: [],
      cerdaIdsTeoricos: [],
      cerdaIdsManual: [],

      totalManual: 0,
      diferencia: 0,
    }

    const tieneConteo =
      data.cerdasManual !== '' ||
      data.lechonesManual !== '' ||
      data.cerdosManual !== ''

    const diferencia = data.diferencia

    const diffColor =
      !tieneConteo || diferencia === 0
        ? 'text-gray-600'
        : diferencia > 0
          ? 'text-emerald-700'
          : 'text-red-700'

    const cerdasSeleccionadas = idsToAretes(data.cerdaIdsManual, cerdasDisponibles)

    const opcionesCerdas = cerdasDisponibles.filter((cerda) => {
      const actual = data.cerdaIdsManual.includes(cerda.id)
      if (actual) return false

      const asignadaEn = ubicacionDeCerdaSeleccionada(cerda.id)
      return asignadaEn === null || asignadaEn === ubicacion.id
    })

    const resumenCerdas = obtenerResumenCerdas(
      ubicacion.id,
      data,
      cerdasDisponibles,
      ubicaciones
    )

    const colorResumen =
      resumenCerdas === 'OK'
        ? 'text-emerald-700'
        : resumenCerdas === '—'
          ? 'text-gray-500'
          : 'text-red-700'

    return (
      <div key={ubicacion.id} className="border-b last:border-b-0 py-2">
        <div className="grid grid-cols-[90px_1fr] gap-2">
          <div className="text-right">
            <div className="text-[11px] font-semibold leading-tight">
              {ubicacion.codigo}
            </div>

            <div className="text-[10px] text-gray-500 leading-tight">
              {ubicacion.nombre || ''}
            </div>
          </div>

          <div className="min-w-0">
            <div className="grid grid-cols-[46px_46px_46px_minmax(70px,1fr)] gap-2 items-start mb-1">
              <div>
                <div className="text-[9px] text-gray-500 text-right">Teórico</div>
                <div className="text-[11px] text-gray-700 text-right">
                  {data.teorico}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Cer. T.</div>
                <div className="text-[11px] text-gray-700 text-right">
                  {data.cerdasTeorico}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Lech. T.</div>
                <div className="text-[11px] text-gray-700 text-right">
                  {data.lechonesTeorico}
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-[9px] text-gray-500 text-left">Cerdas teóricas</div>
                <div className="text-[10px] text-gray-700 leading-tight break-words">
                  {data.aretes.length > 0 ? data.aretes.join(', ') : '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[64px_64px_64px_44px_44px] gap-2 items-start">
              <div>
                <div className="text-[9px] text-gray-500 text-right">Cerdas</div>
                <input
                  type="number"
                  min="0"
                  className="border rounded px-1 py-1 text-right text-[11px] w-full bg-gray-50"
                  value={data.cerdasManual}
                  readOnly={data.cerdaIdsManual.length > 0}
                  onChange={(e) =>
                    actualizarConteo(ubicacion.id, 'cerdasManual', e.target.value)
                  }
                />
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Lechones</div>
                <input
                  type="number"
                  min="0"
                  className="border rounded px-1 py-1 text-right text-[11px] w-full"
                  value={data.lechonesManual}
                  onChange={(e) =>
                    actualizarConteo(ubicacion.id, 'lechonesManual', e.target.value)
                  }
                />
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Cerdos</div>
                <input
                  type="number"
                  min="0"
                  className="border rounded px-1 py-1 text-right text-[11px] w-full"
                  value={data.cerdosManual}
                  onChange={(e) =>
                    actualizarConteo(ubicacion.id, 'cerdosManual', e.target.value)
                  }
                />
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Total</div>
                <div className="text-[11px] text-gray-700 text-right py-1">
                  {tieneConteo ? data.totalManual : '—'}
                </div>
              </div>

              <div>
                <div className="text-[9px] text-gray-500 text-right">Dif.</div>
                <div className={`text-[11px] text-right py-1 ${diffColor}`}>
                  {tieneConteo ? diferencia : '—'}
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_84px] gap-2 items-center">
              <select
                className="border rounded px-1 py-1 text-[11px] w-full"
                value=""
                onChange={(e) => agregarCerdaManual(ubicacion.id, e.target.value)}
              >
                <option value="">Agregar cerda contada...</option>
                {opcionesCerdas.map((cerda) => (
                  <option key={cerda.id} value={cerda.id}>
                    {etiquetaCerda(cerda)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="border rounded px-2 py-1 text-[11px] bg-gray-100 hover:bg-gray-200"
                onClick={() => {
                  data.cerdaIdsTeoricos.forEach((id) => {
                    agregarCerdaManual(ubicacion.id, String(id))
                  })
                }}
              >
                Copiar cerdas
              </button>
            </div>

            <div className="mt-1 text-[10px] text-gray-600">
              <span className="font-semibold">Cerdas contadas:</span>{' '}
              {cerdasSeleccionadas.length > 0 ? (
                <span className="inline-flex flex-wrap gap-1">
                  {data.cerdaIdsManual.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="border rounded px-1 bg-blue-50 hover:bg-red-50"
                      onClick={() => quitarCerdaManual(ubicacion.id, id)}
                      title="Quitar cerda de esta ubicación"
                    >
                      {etiquetaCerda(cerdasDisponibles.find((c) => c.id === id))} ×
                    </button>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </div>

            <div className={`mt-1 text-[10px] leading-tight ${colorResumen}`}>
              <span className="font-semibold">Validación cerdas:</span>{' '}
              {resumenCerdas}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />

        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario diario</h1>
          <p className="text-xs text-gray-600">
            Registrar conteos manuales por ubicación y comparar contra inventario teórico.
          </p>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1">Fecha</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={cargarDatos}
          disabled={loading || !fecha}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {loading ? 'Cargando…' : 'Buscar'}
        </button>

        <button
          type="button"
          onClick={copiarTeoricoComoConteo}
          disabled={loading || ubicaciones.length === 0}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-900 px-4 py-2 rounded text-sm"
        >
          Copiar teórico a conteo
        </button>

        <button
          type="button"
          onClick={limpiarConteos}
          disabled={loading || ubicaciones.length === 0}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-60 text-gray-900 px-4 py-2 rounded text-sm"
        >
          Limpiar conteos
        </button>

        <button
          type="button"
          onClick={imprimirPdf}
          disabled={imprimiendo || loading || !fecha}
          className="ml-auto bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {imprimiendo ? 'Generando PDF…' : 'Imprimir PDF'}
        </button>

        <button
          type="button"
          onClick={guardarInventario}
          disabled={guardando || !fecha}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {guardando ? 'Guardando…' : 'Guardar inventario diario'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Total teórico</div>
          <div className="text-xl font-bold">{totalTeoricoGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Cerdas contadas</div>
          <div className="text-xl font-bold">{totalCerdasGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Lechones contados</div>
          <div className="text-xl font-bold">{totalLechonesGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Cerdos contados</div>
          <div className="text-xl font-bold">{totalCerdosGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Total conteo</div>
          <div className="text-xl font-bold">{totalManualGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Diferencia</div>
          <div
            className={`text-xl font-bold ${
              totalDiferenciaGeneral > 0
                ? 'text-emerald-700'
                : totalDiferenciaGeneral < 0
                  ? 'text-red-700'
                  : ''
            }`}
          >
            {totalDiferenciaGeneral}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
        {Object.entries(grupos)
          .sort(([a], [b]) => ordenarGrupos(a, b))
          .map(([nombreGrupo, ubicacionesGrupo]) => {
            const totalGrupoTeorico = ubicacionesGrupo.reduce(
              (sum, ubicacion) => sum + toNum(estado[ubicacion.id]?.teorico),
              0
            )

            return (
              <div
                key={nombreGrupo}
                className="border rounded-lg p-3 bg-white shadow-sm overflow-hidden"
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h2 className="font-semibold text-sm">
                    {nombreGrupo.toUpperCase()}
                  </h2>

                  <span className="text-[11px] text-gray-600 whitespace-nowrap">
                    Total: {totalGrupoTeorico}
                  </span>
                </div>

                {ubicacionesGrupo.map((ubicacion) => renderCampoUbicacion(ubicacion))}
              </div>
            )
          })}
      </div>
    </div>
  )
}
