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
  tipo: 'ENTRADA_COMPRA' | 'ENTRADA_PARTO' | 'SALIDA_VENTA' | 'SALIDA_MUERTE' | 'AJUSTE'
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

type CerdaRow = {
  id: number
  arete: string | null
  ubicacion_id: number | null
  estado: string | null
  activa: boolean | null
}

type CerdasMap = Record<number, number>
type CerdasAretesMap = Record<number, string[]>

type EstadoUbicacion = {
  teorico: number
  cerdasProtegidas: number
  aretes: string[]
  editableTeorico: number
  manual: string
  totalManual: number
  diferencia: number
}

type GrupoUbicaciones = Record<string, Ubicacion[]>

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

function generarPdfInventarioDiario(
  fecha: string,
  grupos: GrupoUbicaciones,
  estado: Record<number, EstadoUbicacion>
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
    editable: number
    manual: number
    diferencia: number
  }> = []

  let totalTeorico = 0
  let totalCerdas = 0
  let totalEditable = 0
  let totalManual = 0
  let totalDiferencia = 0

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([area, ubicaciones]) => {
      let teorico = 0
      let cerdas = 0
      let editable = 0
      let manual = 0
      let diferencia = 0
      let tieneConteos = false

      ubicaciones.forEach((ubicacion) => {
        const item = estado[ubicacion.id]
        if (!item) return

        teorico += item.teorico
        cerdas += item.cerdasProtegidas
        editable += item.editableTeorico

        if (item.manual !== '') {
          tieneConteos = true
          manual += item.totalManual
          diferencia += item.diferencia
        }
      })

      if (!tieneConteos && teorico === 0 && cerdas === 0 && editable === 0) return

      resumen.push({
        area,
        teorico,
        cerdas,
        editable,
        manual,
        diferencia,
      })

      totalTeorico += teorico
      totalCerdas += cerdas
      totalEditable += editable
      totalManual += manual
      totalDiferencia += diferencia
    })

  const body = resumen.map((row) => [
    row.area,
    String(row.teorico),
    String(row.cerdas),
    String(row.editable),
    String(row.manual),
    String(row.diferencia),
  ])

  body.push([
    'TOTAL GENERAL',
    String(totalTeorico),
    String(totalCerdas),
    String(totalEditable),
    String(totalManual),
    String(totalDiferencia),
  ])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Cerdas', 'Editable teórico', 'Conteo total', 'Diferencia']],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  })

  let y = (doc as any).lastAutoTable.finalY + 8

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([area, ubicaciones]) => {
      const rows = ubicaciones
        .map((ubicacion) => {
          const item = estado[ubicacion.id]
          if (!item || item.manual === '') return null

          return [
            ubicacion.codigo,
            ubicacion.nombre || '',
            String(item.teorico),
            String(item.cerdasProtegidas),
            item.aretes.length > 0 ? item.aretes.join(', ') : '—',
            String(item.editableTeorico),
            item.manual,
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
            'Ubicación',
            'Nombre',
            'Teórico',
            'Cerdas',
            'Aretes',
            'Editable teórico',
            'Conteo editable',
            'Conteo total',
            'Dif.',
          ],
        ],
        body: rows,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [230, 230, 230] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 8
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
    return Object.values(estado).reduce(
      (sum, item) => sum + toNum(item.cerdasProtegidas),
      0
    )
  }, [estado])

  const totalEditableTeoricoGeneral = useMemo(() => {
    return Object.values(estado).reduce(
      (sum, item) => sum + toNum(item.editableTeorico),
      0
    )
  }, [estado])

  const totalManualGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (item.manual === '') return sum
      return sum + toNum(item.totalManual)
    }, 0)
  }, [estado])

  const totalDiferenciaGeneral = useMemo(() => {
    return Object.values(estado).reduce((sum, item) => {
      if (item.manual === '') return sum
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
      .select('id, arete, ubicacion_id, estado, activa')
      .eq('activa', true)

    if (error) {
      console.error('Error cargando cerdas', error)
      alert(`Error cargando cerdas registradas: ${error.message}`)
      return {
        cerdasPorUbicacion: {} as CerdasMap,
        aretesPorUbicacion: {} as CerdasAretesMap,
      }
    }

    const cerdasPorUbicacion: CerdasMap = {}
    const aretesPorUbicacion: CerdasAretesMap = {}

    ;((data ?? []) as CerdaRow[]).forEach((cerda) => {
      if (!cerda.ubicacion_id) return

      const estadoCerda = String(cerda.estado || '').toUpperCase()
      if (estadoCerda === 'MUERTA' || estadoCerda === 'BAJA') return

      const ubicacionId = Number(cerda.ubicacion_id)

      if (cerdasPorUbicacion[ubicacionId] === undefined) {
        cerdasPorUbicacion[ubicacionId] = 0
      }

      if (!aretesPorUbicacion[ubicacionId]) {
        aretesPorUbicacion[ubicacionId] = []
      }

      cerdasPorUbicacion[ubicacionId] += 1

      aretesPorUbicacion[ubicacionId].push(
        cerda.arete && cerda.arete.trim() !== ''
          ? cerda.arete
          : `Sin arete #${cerda.id}`
      )
    })

    Object.keys(aretesPorUbicacion).forEach((id) => {
      aretesPorUbicacion[Number(id)].sort((a, b) =>
        a.localeCompare(b, 'es', {
          numeric: true,
          sensitivity: 'base',
        })
      )
    })

    return {
      cerdasPorUbicacion,
      aretesPorUbicacion,
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

      const { cerdasPorUbicacion, aretesPorUbicacion } = await cargarCerdas()

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

      const mapInventarioDiario = new Map<number, InventarioDiarioRow>()

      inventarioDiario.forEach((row) => {
        mapInventarioDiario.set(Number(row.ubicacion_id), row)
      })

      const nuevoEstado: Record<number, EstadoUbicacion> = {}

      ubicacionesData.forEach((ubicacion) => {
        const teoricoActual = teoricos[ubicacion.id] ?? 0
        const cerdasProtegidas = cerdasPorUbicacion[ubicacion.id] ?? 0
        const aretes = aretesPorUbicacion[ubicacion.id] ?? []

        const zonaProtegida = esMaternidadOGestacion(ubicacion)

        const cerdasAplicables = zonaProtegida ? cerdasProtegidas : 0
        const editableTeorico = zonaProtegida
          ? Math.max(teoricoActual - cerdasAplicables, 0)
          : Math.max(teoricoActual, 0)

        const rowGuardado = mapInventarioDiario.get(ubicacion.id)

        let manualEditableStr = ''

        if (rowGuardado) {
          const totalManualGuardado = toNum(rowGuardado.conteo_manual)

          if (zonaProtegida) {
            manualEditableStr = String(Math.max(totalManualGuardado - cerdasAplicables, 0))
          } else {
            manualEditableStr = String(Math.max(totalManualGuardado, 0))
          }
        }

        const manualEditableNum =
          manualEditableStr === '' ? 0 : Math.max(Number(manualEditableStr) || 0, 0)

        const totalManual =
          manualEditableStr === ''
            ? 0
            : zonaProtegida
              ? cerdasAplicables + manualEditableNum
              : manualEditableNum

        const diferencia = manualEditableStr === '' ? 0 : totalManual - teoricoActual

        nuevoEstado[ubicacion.id] = {
          teorico: teoricoActual,
          cerdasProtegidas: cerdasAplicables,
          aretes: zonaProtegida ? aretes : [],
          editableTeorico,
          manual: manualEditableStr,
          totalManual,
          diferencia,
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

  const handleManualChange = (ubicacionId: number, value: string) => {
    const limpio = value === '' ? '' : String(Math.max(Number(value) || 0, 0))

    setEstado((prev) => {
      const actual = prev[ubicacionId]

      if (!actual) return prev

      const manualEditableNum = limpio === '' ? 0 : Number(limpio) || 0
      const totalManual =
        limpio === '' ? 0 : actual.cerdasProtegidas + manualEditableNum
      const diferencia = limpio === '' ? 0 : totalManual - actual.teorico

      return {
        ...prev,
        [ubicacionId]: {
          ...actual,
          manual: limpio,
          totalManual,
          diferencia,
        },
      }
    })
  }

  const copiarTeoricoComoConteo = () => {
    setEstado((prev) => {
      const copy: Record<number, EstadoUbicacion> = {}

      Object.entries(prev).forEach(([ubicacionId, item]) => {
        const manual = String(Math.max(item.editableTeorico, 0))
        const manualNum = Number(manual) || 0
        const totalManual = item.cerdasProtegidas + manualNum

        copy[Number(ubicacionId)] = {
          ...item,
          manual,
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
          manual: '',
          totalManual: 0,
          diferencia: 0,
        }
      })

      return copy
    })
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

    const hayConteos = Object.values(estado).some((item) => item.manual !== '')

    if (!hayConteos) {
      const ok = confirm('No hay conteos manuales ingresados. ¿Generar PDF de todos modos?')
      if (!ok) return
    }

    setImprimiendo(true)

    try {
      generarPdfInventarioDiario(fecha, grupos, { ...estado })
    } finally {
      setImprimiendo(false)
    }
  }

  const guardarInventario = async () => {
    if (!fecha) {
      alert('Selecciona una fecha.')
      return
    }

    const registrosBase = Object.entries(estado)
      .filter(([, value]) => value.manual !== '')
      .map(([ubicacionId, value]) => {
        const manualEditable = Number(value.manual) || 0
        const totalManual = value.cerdasProtegidas + manualEditable
        const teorico = value.teorico || 0

        return {
          fecha,
          ubicacion_id: Number(ubicacionId),
          conteo_manual: totalManual,
          teorico_al_momento: teorico,
          diferencia: totalManual - teorico,
          hembras_manual: value.cerdasProtegidas,
          machos_manual: null,
        }
      })

    if (registrosBase.length === 0) {
      alert('No hay conteos para guardar.')
      return
    }

    const invalidos = registrosBase.filter((row) => row.conteo_manual < row.hembras_manual)

    if (invalidos.length > 0) {
      alert('Hay ubicaciones donde el conteo total sería menor que las cerdas registradas.')
      return
    }

    const estadoParaPdf = { ...estado }

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ubicacionIds = registrosBase.map((row) => row.ubicacion_id)

      const { error: deleteError } = await supabase
        .from('granja_inventario_diario')
        .delete()
        .eq('fecha', fecha)
        .in('ubicacion_id', ubicacionIds)

      if (deleteError) {
        console.error('Error eliminando inventario diario anterior', deleteError)
        alert(`Ocurrió un error al reemplazar el inventario diario: ${deleteError.message}`)
        return
      }

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

      generarPdfInventarioDiario(fecha, grupos, estadoParaPdf)

      alert('Inventario diario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const renderCampoUbicacion = (ubicacion: Ubicacion) => {
    const data = estado[ubicacion.id] || {
      teorico: 0,
      cerdasProtegidas: 0,
      aretes: [],
      editableTeorico: 0,
      manual: '',
      totalManual: 0,
      diferencia: 0,
    }

    const diferencia = data.diferencia

    const diffColor =
      diferencia === 0
        ? 'text-gray-600'
        : diferencia > 0
          ? 'text-emerald-700'
          : 'text-red-700'

    const tieneCerdas = data.cerdasProtegidas > 0

    return (
      <div
        key={ubicacion.id}
        className="grid grid-cols-[92px_48px_48px_minmax(70px,1fr)_80px_58px_58px] items-start gap-2 mb-2"
      >
        <div>
          <div className="text-[11px] font-semibold text-right leading-tight">
            {ubicacion.codigo}
          </div>
          <div className="text-[10px] text-gray-500 text-right leading-tight">
            {ubicacion.nombre || ''}
          </div>
        </div>

        <div className="text-right text-[11px] text-gray-700 py-1">
          {data.teorico}
        </div>

        <div className="text-right text-[11px] text-gray-700 py-1">
          {data.cerdasProtegidas}
        </div>

        <div className="text-left text-[10px] text-gray-600 leading-tight py-1 break-words min-w-0">
          {tieneCerdas ? data.aretes.join(', ') : '—'}
        </div>

        <input
          type="number"
          min="0"
          className="border rounded px-1 py-1 text-right text-[11px] w-full"
          value={data.manual}
          onChange={(e) => handleManualChange(ubicacion.id, e.target.value)}
          title={
            tieneCerdas
              ? 'Este conteo no modifica las cerdas registradas. Solo cuenta la parte editable.'
              : 'Conteo manual de esta ubicación.'
          }
        />

        <div className="text-right text-[11px] text-gray-700 py-1">
          {data.manual === '' ? '—' : data.totalManual}
        </div>

        <div className={`text-right text-[11px] py-1 ${diffColor}`}>
          {data.manual === '' ? '—' : diferencia}
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Total teórico</div>
          <div className="text-xl font-bold">{totalTeoricoGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Cerdas registradas</div>
          <div className="text-xl font-bold">{totalCerdasGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Editable teórico</div>
          <div className="text-xl font-bold">{totalEditableTeoricoGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Total conteo manual</div>
          <div className="text-xl font-bold">{totalManualGeneral}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Diferencia total</div>
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

      <div className="mb-2 text-[11px] text-gray-600 grid grid-cols-[92px_48px_48px_minmax(70px,1fr)_80px_58px_58px] gap-2 pr-4">
        <span></span>
        <span className="text-right">Teórico</span>
        <span className="text-right">Cerdas</span>
        <span className="text-left">Aretes</span>
        <span className="text-right">Conteo</span>
        <span className="text-right">Total</span>
        <span className="text-right">Dif.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grupos)
          .sort(([a], [b]) => ordenarGrupos(a, b))
          .map(([nombreGrupo, ubicacionesGrupo]) => {
            const totalGrupoTeorico = ubicacionesGrupo.reduce(
              (sum, ubicacion) => sum + toNum(estado[ubicacion.id]?.teorico),
              0
            )

            const totalGrupoCerdas = ubicacionesGrupo.reduce(
              (sum, ubicacion) =>
                sum + toNum(estado[ubicacion.id]?.cerdasProtegidas),
              0
            )

            return (
              <div key={nombreGrupo} className="border rounded-lg p-3 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h2 className="font-semibold text-sm">{nombreGrupo.toUpperCase()}</h2>
                  <span className="text-[11px] text-gray-600 whitespace-nowrap">
                    Total: {totalGrupoTeorico} · Cerdas: {totalGrupoCerdas}
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
