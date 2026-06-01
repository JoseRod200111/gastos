'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  activo: boolean
}

type StockRow = {
  ubicacion_id: number
  cantidad: number | null
  tipo:
    | 'ENTRADA_COMPRA'
    | 'ENTRADA_PARTO'
    | 'SALIDA_VENTA'
    | 'SALIDA_MUERTE'
    | 'AJUSTE'
  fecha?: string
}

type CerdaRow = {
  id: number
  arete: string | null
  ubicacion_id: number | null
  estado: string | null
  activa: boolean | null
}

type StockMap = Record<number, number>
type CerdasMap = Record<number, number>
type CerdasAretesMap = Record<number, string[]>

type DesgloseUbicacion = {
  total: number
  cerdasProtegidas: number
  lechonesEditables: number
  cerdosEditables: number
  editableActual: number
  tipoEditable: 'LECHONES' | 'CERDOS'
  esZonaProtegida: boolean
}

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const absNum = (v: unknown) => Math.abs(toNum(v))

const finDeDiaUTC = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

const esMaternidadOGestacion = (u: Ubicacion) => {
  const codigo = String(u.codigo || '').toUpperCase()
  const nombre = String(u.nombre || '').toUpperCase()

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

const groupNameFor = (u: Ubicacion): string => {
  if (u.nombre && u.nombre.includes(' - ')) {
    return u.nombre.split(' - ')[0] || 'Otros'
  }

  if (u.nombre) return u.nombre

  if (u.codigo.startsWith('G1')) return 'Gestación 1'
  if (u.codigo.startsWith('G2')) return 'Gestación 2'
  if (u.codigo.startsWith('G3')) return 'Gestación 3'
  if (u.codigo.startsWith('TR')) return 'Galera'
  if (u.codigo.startsWith('M1')) return 'Maternidad 1'
  if (u.codigo.startsWith('M2')) return 'Maternidad 2'
  if (u.codigo.startsWith('L1')) return 'Lechonera 1'
  if (u.codigo.startsWith('L2')) return 'Lechonera 2'
  if (u.codigo.startsWith('L3')) return 'Lechonera 3'
  if (u.codigo.startsWith('S2')) return 'Sitio 2'

  return 'Otros'
}

const ordenarUbicaciones = (a: Ubicacion, b: Ubicacion) => {
  return a.codigo.localeCompare(b.codigo, 'es', {
    numeric: true,
    sensitivity: 'base',
  })
}

const ordenarGrupos = (a: string, b: string) => {
  const orden = [
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

  const ia = orden.indexOf(a)
  const ib = orden.indexOf(b)

  if (ia !== -1 && ib !== -1) return ia - ib
  if (ia !== -1) return -1
  if (ib !== -1) return 1

  return a.localeCompare(b, 'es', {
    numeric: true,
    sensitivity: 'base',
  })
}

const calcularDesglose = (
  ubicacion: Ubicacion,
  stockTeorico: StockMap,
  cerdasPorUbicacion: CerdasMap
): DesgloseUbicacion => {
  const total = toNum(stockTeorico[ubicacion.id] ?? 0)
  const cerdasRegistradas = toNum(cerdasPorUbicacion[ubicacion.id] ?? 0)
  const esZonaProtegida = esMaternidadOGestacion(ubicacion)

  if (esZonaProtegida) {
    const cerdasProtegidas = Math.max(cerdasRegistradas, 0)
    const lechonesEditables = Math.max(total - cerdasProtegidas, 0)

    return {
      total,
      cerdasProtegidas,
      lechonesEditables,
      cerdosEditables: 0,
      editableActual: lechonesEditables,
      tipoEditable: 'LECHONES',
      esZonaProtegida,
    }
  }

  return {
    total,
    cerdasProtegidas: 0,
    lechonesEditables: 0,
    cerdosEditables: total,
    editableActual: total,
    tipoEditable: 'CERDOS',
    esZonaProtegida,
  }
}

const calcularTotalVisual = (
  ubicacion: Ubicacion,
  valorEditable: string,
  stockTeorico: StockMap,
  cerdasPorUbicacion: CerdasMap
) => {
  const desglose = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)
  const editable = valorEditable.trim() === '' ? 0 : Number(valorEditable)

  if (!Number.isFinite(editable)) return desglose.total

  if (desglose.esZonaProtegida) {
    return desglose.cerdasProtegidas + editable
  }

  return editable
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

function generarPdfInventarioPorCuadros(params: {
  fechaCorte: string
  grupos: Record<string, Ubicacion[]>
  stockTeorico: StockMap
  cerdasPorUbicacion: CerdasMap
  cerdasAretesPorUbicacion: CerdasAretesMap
  valoresEditados: Record<number, string>
}) {
  const {
    fechaCorte,
    grupos,
    stockTeorico,
    cerdasPorUbicacion,
    cerdasAretesPorUbicacion,
    valoresEditados,
  } = params

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.text('REPORTE DE INVENTARIO DE GRANJA', 14, 16)

  doc.setFontSize(10)
  doc.text(`Fecha: ${fechaCorte}`, 14, 23)

  let totalGeneral = 0
  let totalCerdas = 0
  let totalLechones = 0
  let totalCerdos = 0

  Object.values(grupos).forEach((lista) => {
    lista.forEach((ubicacion) => {
      const d = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)

      totalGeneral += d.total
      totalCerdas += d.cerdasProtegidas
      totalLechones += d.lechonesEditables
      totalCerdos += d.cerdosEditables
    })
  })

  doc.text(`Total general: ${totalGeneral}`, 14, 29)
  doc.text(
    `Cerdas: ${totalCerdas}   Lechones: ${totalLechones}   Cerdos normales: ${totalCerdos}`,
    14,
    35
  )

  const resumenBody: string[][] = []

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([grupo, lista]) => {
      let total = 0
      let cerdas = 0
      let lechones = 0
      let cerdos = 0

      lista.forEach((ubicacion) => {
        const d = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)

        total += d.total
        cerdas += d.cerdasProtegidas
        lechones += d.lechonesEditables
        cerdos += d.cerdosEditables
      })

      resumenBody.push([
        grupo,
        String(total),
        String(cerdas),
        String(lechones),
        String(cerdos),
      ])
    })

  resumenBody.push([
    'TOTAL',
    String(totalGeneral),
    String(totalCerdas),
    String(totalLechones),
    String(totalCerdos),
  ])

  autoTable(doc, {
    startY: 42,
    head: [['Grupo', 'Total', 'Cerdas', 'Lechones', 'Cerdos']],
    body: resumenBody,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  })

  let y = (doc as any).lastAutoTable.finalY + 6

  Object.entries(grupos)
    .sort(([a], [b]) => ordenarGrupos(a, b))
    .forEach(([grupo, lista]) => {
      if (y > 260) {
        doc.addPage()
        y = 16
      }

      doc.setFontSize(11)
      doc.text(grupo.toUpperCase(), 14, y)
      y += 2

      autoTable(doc, {
        startY: y + 2,
        head: [['Ubicación', 'Total', 'Editable', 'Cerdas', 'Aretes', 'Lechones', 'Cerdos']],
        body: lista.map((ubicacion) => {
          const d = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)
          const editable = valoresEditados[ubicacion.id] ?? String(d.editableActual)
          const aretes =
            d.cerdasProtegidas > 0
              ? (cerdasAretesPorUbicacion[ubicacion.id] || []).join(', ')
              : '—'

          return [
            ubicacion.codigo,
            String(d.total),
            editable,
            String(d.cerdasProtegidas),
            aretes,
            String(d.lechonesEditables),
            String(d.cerdosEditables),
          ]
        }),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [210, 210, 210] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
        },
      })

      y = (doc as any).lastAutoTable.finalY + 8
    })

  const now = new Date()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

  const name = `reporte_inventario_${fechaCorte}_${now.getFullYear()}${pad(
    now.getMonth() + 1
  )}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(
    now.getSeconds()
  )}.pdf`

  doc.save(name)
}

export default function GranjaInventarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [stockTeorico, setStockTeorico] = useState<StockMap>({})
  const [cerdasPorUbicacion, setCerdasPorUbicacion] = useState<CerdasMap>({})
  const [cerdasAretesPorUbicacion, setCerdasAretesPorUbicacion] =
    useState<CerdasAretesMap>({})
  const [valoresEditados, setValoresEditados] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const [fechaCorte, setFechaCorte] = useState<string>('')

  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const f = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
      today.getDate()
    )}`
    setFechaCorte(f)
  }, [])

  const grupos = useMemo(() => {
    const g: Record<string, Ubicacion[]> = {}

    ubicaciones.forEach((ubicacion) => {
      const nombreGrupo = groupNameFor(ubicacion)

      if (!g[nombreGrupo]) {
        g[nombreGrupo] = []
      }

      g[nombreGrupo].push(ubicacion)
    })

    Object.keys(g).forEach((key) => {
      g[key].sort(ordenarUbicaciones)
    })

    return g
  }, [ubicaciones])

  const resumenGeneral = useMemo(() => {
    let total = 0
    let cerdas = 0
    let lechones = 0
    let cerdos = 0

    ubicaciones.forEach((ubicacion) => {
      const d = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)

      total += d.total
      cerdas += d.cerdasProtegidas
      lechones += d.lechonesEditables
      cerdos += d.cerdosEditables
    })

    return {
      total,
      cerdas,
      lechones,
      cerdos,
    }
  }, [ubicaciones, stockTeorico, cerdasPorUbicacion])

  const totalesPorGrupo = useMemo(() => {
    const t: Record<
      string,
      {
        total: number
        cerdas: number
        lechones: number
        cerdos: number
      }
    > = {}

    Object.entries(grupos).forEach(([grupo, lista]) => {
      let total = 0
      let cerdas = 0
      let lechones = 0
      let cerdos = 0

      lista.forEach((ubicacion) => {
        const d = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)

        total += d.total
        cerdas += d.cerdasProtegidas
        lechones += d.lechonesEditables
        cerdos += d.cerdosEditables
      })

      t[grupo] = {
        total,
        cerdas,
        lechones,
        cerdos,
      }
    })

    return t
  }, [grupos, stockTeorico, cerdasPorUbicacion])

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      const { data: ubicData, error: ubicError } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, activo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (ubicError) {
        console.error('Error cargando ubicaciones', ubicError)
        alert(`Error cargando ubicaciones: ${ubicError.message}`)
        return
      }

      const ubicList = ((ubicData ?? []) as Ubicacion[]).sort(ordenarUbicaciones)
      setUbicaciones(ubicList)

      if (ubicList.length === 0) {
        setStockTeorico({})
        setCerdasPorUbicacion({})
        setCerdasAretesPorUbicacion({})
        setValoresEditados({})
        return
      }

      let movQuery = supabase
        .from('granja_movimientos')
        .select('ubicacion_id, cantidad, tipo, fecha')

      if (fechaCorte) {
        movQuery = movQuery.lte('fecha', finDeDiaUTC(fechaCorte))
      }

      const { data: movData, error: movError } = await movQuery

      if (movError) {
        console.error('Error cargando movimientos', movError)
        alert(`Error cargando movimientos: ${movError.message}`)
        return
      }

      const mapa: StockMap = {}

      ;((movData ?? []) as StockRow[]).forEach((row) => {
        const id = Number(row.ubicacion_id)

        if (mapa[id] === undefined) {
          mapa[id] = 0
        }

        if (row.tipo === 'AJUSTE') {
          mapa[id] += toNum(row.cantidad)
        } else if (row.tipo === 'SALIDA_VENTA' || row.tipo === 'SALIDA_MUERTE') {
          mapa[id] -= absNum(row.cantidad)
        } else {
          mapa[id] += absNum(row.cantidad)
        }
      })

      const { data: cerdasData, error: cerdasError } = await supabase
        .from('granja_cerdas')
        .select('id, arete, ubicacion_id, estado, activa')
        .eq('activa', true)

      if (cerdasError) {
        console.error('Error cargando cerdas', cerdasError)
        alert(`Error cargando cerdas: ${cerdasError.message}`)
        return
      }

      const mapaCerdas: CerdasMap = {}
      const mapaAretes: CerdasAretesMap = {}

      ;((cerdasData ?? []) as CerdaRow[]).forEach((cerda) => {
        if (!cerda.ubicacion_id) return
        if (cerda.estado === 'MUERTA' || cerda.estado === 'BAJA') return

        const id = Number(cerda.ubicacion_id)

        if (mapaCerdas[id] === undefined) {
          mapaCerdas[id] = 0
        }

        if (!mapaAretes[id]) {
          mapaAretes[id] = []
        }

        mapaCerdas[id] += 1

        mapaAretes[id].push(
          cerda.arete && cerda.arete.trim() !== ''
            ? cerda.arete
            : `Sin arete #${cerda.id}`
        )
      })

      Object.keys(mapaAretes).forEach((id) => {
        mapaAretes[Number(id)].sort((a, b) =>
          a.localeCompare(b, 'es', {
            numeric: true,
            sensitivity: 'base',
          })
        )
      })

      setStockTeorico(mapa)
      setCerdasPorUbicacion(mapaCerdas)
      setCerdasAretesPorUbicacion(mapaAretes)

      const inicial: Record<number, string> = {}

      ubicList.forEach((ubicacion) => {
        const d = calcularDesglose(ubicacion, mapa, mapaCerdas)
        inicial[ubicacion.id] = String(d.editableActual)
      })

      setValoresEditados(inicial)
    } finally {
      setLoading(false)
    }
  }, [fechaCorte])

  useEffect(() => {
    if (fechaCorte) {
      cargarDatos()
    }
  }, [cargarDatos, fechaCorte])

  const actualizarValor = (idUbicacion: number, valor: string) => {
    setValoresEditados((prev) => ({
      ...prev,
      [idUbicacion]: valor,
    }))
  }

  const generarPDF = async () => {
    if (!fechaCorte) {
      alert('Selecciona una fecha de corte.')
      return
    }

    if (ubicaciones.length === 0) {
      alert('No hay ubicaciones para reportar.')
      return
    }

    setGenerandoPdf(true)

    try {
      const logo = await fetchLogoDataUrl()
      void logo

      generarPdfInventarioPorCuadros({
        fechaCorte,
        grupos,
        stockTeorico,
        cerdasPorUbicacion,
        cerdasAretesPorUbicacion,
        valoresEditados,
      })
    } finally {
      setGenerandoPdf(false)
    }
  }

  const guardarInventario = async () => {
    if (guardando) return

    if (!fechaCorte) {
      alert('Selecciona una fecha de corte antes de guardar.')
      return
    }

    setGuardando(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ajustes: {
        ubicacion_id: number
        tipo: 'AJUSTE'
        cantidad: number
        referencia_tabla: string
        referencia_id: number | null
        observaciones: string
        user_id: string | null
        fecha: string
      }[] = []

      const fechaMovimiento = finDeDiaUTC(fechaCorte)

      for (const ubicacion of ubicaciones) {
        const desglose = calcularDesglose(ubicacion, stockTeorico, cerdasPorUbicacion)
        const texto = valoresEditados[ubicacion.id] ?? ''
        const nuevoEditable = texto.trim() === '' ? 0 : Number(texto)

        if (Number.isNaN(nuevoEditable)) {
          alert(`El valor editable para ${ubicacion.codigo} no es un número válido.`)
          return
        }

        if (nuevoEditable < 0) {
          alert(`El valor editable para ${ubicacion.codigo} no puede ser negativo.`)
          return
        }

        const diff = nuevoEditable - desglose.editableActual

        if (diff !== 0) {
          const tipoProteccion = desglose.esZonaProtegida
            ? 'Solo se ajustaron lechones. Las cerdas registradas no se modificaron.'
            : 'Se ajustaron cerdos normales.'

          ajustes.push({
            ubicacion_id: ubicacion.id,
            tipo: 'AJUSTE',
            cantidad: diff,
            referencia_tabla: 'INVENTARIO_MANUAL',
            referencia_id: null,
            observaciones: `Ajuste manual desde inventario (corte ${fechaCorte}). ${tipoProteccion}`,
            user_id: userId,
            fecha: fechaMovimiento,
          })
        }
      }

      if (ajustes.length === 0) {
        alert('No hay cambios que guardar.')
        return
      }

      const confirmar = confirm(
        'Se guardarán los ajustes de inventario. Las cerdas registradas no serán eliminadas ni modificadas desde esta pantalla. ¿Continuar?'
      )

      if (!confirmar) return

      const { error: insertError } = await supabase.from('granja_movimientos').insert(ajustes)

      if (insertError) {
        console.error('Error registrando ajustes', insertError)
        alert(`Ocurrió un error al guardar los ajustes de inventario: ${insertError.message}`)
        return
      }

      alert('Inventario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const renderResumenGrupo = (grupo: string) => {
    const resumen = totalesPorGrupo[grupo] || {
      total: 0,
      cerdas: 0,
      lechones: 0,
      cerdos: 0,
    }

    return (
      <div className="text-[11px] text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          Total: <b>{resumen.total}</b>
        </span>
        <span>
          Cerdas: <b>{resumen.cerdas}</b>
        </span>
        <span>
          Lechones: <b>{resumen.lechones}</b>
        </span>
        <span>
          Cerdos: <b>{resumen.cerdos}</b>
        </span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />

        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario</h1>
        </div>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1">Fecha de corte</label>
            <input
              type="date"
              value={fechaCorte}
              onChange={(e) => setFechaCorte(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>

          <button
            onClick={cargarDatos}
            disabled={loading || !fechaCorte}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {loading ? 'Cargando…' : 'Buscar'}
          </button>

          <button
            onClick={generarPDF}
            disabled={generandoPdf || loading || ubicaciones.length === 0}
            className="bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {generandoPdf ? 'Generando…' : 'Reporte PDF'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <p className="text-xs text-gray-500">Cargando ubicaciones e inventario…</p>
          ) : (
            <p className="text-xs text-gray-500">Ubicaciones activas: {ubicaciones.length}</p>
          )}

          <button
            onClick={guardarInventario}
            disabled={guardando || loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {guardando ? 'Guardando…' : 'Guardar inventario'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-5">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Fecha</div>
          <div className="text-lg font-bold">{fechaCorte || '—'}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total general</div>
          <div className="text-lg font-bold">{resumenGeneral.total}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Cerdas</div>
          <div className="text-lg font-bold">{resumenGeneral.cerdas}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Lechones editables</div>
          <div className="text-lg font-bold">{resumenGeneral.lechones}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Cerdos editables</div>
          <div className="text-lg font-bold">{resumenGeneral.cerdos}</div>
        </div>
      </div>

      <div className="border rounded p-3 bg-white mb-5">
        <div className="text-xs text-gray-500 mb-2">Totales por grupo</div>

        <div className="text-xs text-gray-700 grid md:grid-cols-2 xl:grid-cols-3 gap-2">
          {Object.entries(totalesPorGrupo)
            .sort(([a], [b]) => ordenarGrupos(a, b))
            .map(([grupo, resumen]) => (
              <div key={grupo} className="border rounded p-2 bg-gray-50">
                <div className="font-semibold">{grupo}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  <span>Total: {resumen.total}</span>
                  <span>Cerdas: {resumen.cerdas}</span>
                  <span>Lechones: {resumen.lechones}</span>
                  <span>Cerdos: {resumen.cerdos}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grupos)
          .sort(([a], [b]) => ordenarGrupos(a, b))
          .map(([grupo, lista]) => (
            <div key={grupo} className="border rounded-lg bg-white shadow-sm p-3 overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wide">{grupo}</h2>
                  {renderResumenGrupo(grupo)}
                </div>
              </div>

              <div className="grid grid-cols-[72px_42px_72px_42px_minmax(70px,1fr)_42px] gap-x-2 gap-y-2 text-xs items-start">
                <div className="text-gray-500 text-right font-semibold">Ubic.</div>
                <div className="text-gray-500 text-right font-semibold">Total</div>
                <div className="text-gray-500 text-center font-semibold">Editable</div>
                <div className="text-gray-500 text-right font-semibold">Cerdas</div>
                <div className="text-gray-500 text-left font-semibold">Aretes</div>
                <div className="text-gray-500 text-right font-semibold">Lech.</div>

                {lista.map((ubicacion) => {
                  const desglose = calcularDesglose(
                    ubicacion,
                    stockTeorico,
                    cerdasPorUbicacion
                  )

                  const valorEditable =
                    valoresEditados[ubicacion.id] ?? String(desglose.editableActual)

                  const totalVisual = calcularTotalVisual(
                    ubicacion,
                    valorEditable,
                    stockTeorico,
                    cerdasPorUbicacion
                  )

                  const aretes = cerdasAretesPorUbicacion[ubicacion.id] || []

                  return (
                    <Fragment key={ubicacion.id}>
                      <div className="py-1 text-right font-medium leading-tight">
                        <div>{ubicacion.codigo}</div>
                        {ubicacion.nombre ? (
                          <div className="text-[10px] text-gray-500 font-normal leading-tight break-words">
                            {ubicacion.nombre}
                          </div>
                        ) : null}
                      </div>

                      <div className="py-1 text-right font-semibold">
                        {totalVisual}
                      </div>

                      <div className="py-1 flex justify-center">
                        <input
                          type="number"
                          min="0"
                          className="border rounded w-[70px] px-2 py-1 text-right"
                          value={valorEditable}
                          onChange={(e) => actualizarValor(ubicacion.id, e.target.value)}
                          title={
                            desglose.esZonaProtegida
                              ? 'Este campo solo ajusta lechones.'
                              : 'Este campo ajusta cerdos normales.'
                          }
                        />
                      </div>

                      <div className="py-1 text-right font-semibold">
                        {desglose.cerdasProtegidas}
                      </div>

                      <div className="py-1 text-left text-[10px] text-gray-700 leading-tight break-words min-w-0">
                        {desglose.cerdasProtegidas > 0 ? aretes.join(', ') : '—'}
                      </div>

                      <div className="py-1 text-right font-semibold">
                        {desglose.lechonesEditables}
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
