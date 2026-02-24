'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ---------- Tipos ----------
type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  tipo: string | null
}

type Movimiento = {
  ubicacion_id: number
  tipo: string
  cantidad: number
  fecha: string | null
}

type InventarioDiarioRow = {
  ubicacion_id: number
  conteo_manual: number
  teorico_al_momento: number | null
  diferencia: number | null
}

type EstadoUbicacion = {
  teorico: number
  manual: string
  diferencia: number
}

// ---------- Helpers de códigos / orden ----------

const parseTR = (codigo: string) => {
  const m = codigo.match(/^TR0*(\d+)$/i)
  return m ? Number(m[1]) : null
}

const parseM1 = (codigo: string) => {
  const m = codigo.match(/^M1J(\d+)$/i)
  return m ? Number(m[1]) : null
}

const parseM2 = (codigo: string) => {
  const m = codigo.match(/^M2J(\d+)$/i)
  return m ? Number(m[1]) : null
}

const isTRBetween = (codigo: string, a: number, b: number) => {
  const n = parseTR(codigo)
  return n !== null && n >= a && n <= b
}

type GrupoConfig = {
  titulo: string
  match: (codigo: string) => boolean
  sortKey: (u: Ubicacion) => number | string
}

// ---------- Grupos de ubicaciones (orden visual) ----------
// Nota:
// - Galeras se agrupan por rango TR (soporta TR9 y TR09).
// - Maternidad 2 agrupa TODO lo que empiece con "M2" (M2Jxx y cualquier extra),
//   ordenando primero por el número si es M2Jxx y luego alfabéticamente.
const GRUPOS: GrupoConfig[] = [
  {
    titulo: 'GALERA 1',
    match: (c) => isTRBetween(c, 1, 8),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 2',
    match: (c) => isTRBetween(c, 9, 24),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 3',
    match: (c) => isTRBetween(c, 25, 44),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 4',
    match: (c) => isTRBetween(c, 45, 49),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'LECHONERA 1',
    match: (c) => ['L1T1', 'L1T2', 'L1T3', 'L1T4', 'L1T5'].includes(c),
    sortKey: (u) => ['L1T1', 'L1T2', 'L1T3', 'L1T4', 'L1T5'].indexOf(u.codigo),
  },
  {
    titulo: 'LECHONERA 2',
    match: (c) => ['L2T1', 'L2T2', 'L2T3', 'L2T4', 'L2T5'].includes(c),
    sortKey: (u) => ['L2T1', 'L2T2', 'L2T3', 'L2T4', 'L2T5'].indexOf(u.codigo),
  },
  {
    titulo: 'LECHONERA 3',
    match: (c) => ['L3T1', 'L3T2', 'L3T3', 'L3T4', 'L3T5'].includes(c),
    sortKey: (u) => ['L3T1', 'L3T2', 'L3T3', 'L3T4', 'L3T5'].indexOf(u.codigo),
  },
  {
    titulo: 'SITIO 2',
    match: (c) => ['S2TR1', 'S2TR2', 'S2TR3', 'S2TR4'].includes(c),
    sortKey: (u) => ['S2TR1', 'S2TR2', 'S2TR3', 'S2TR4'].indexOf(u.codigo),
  },
  {
    titulo: 'MATERNIDAD 1',
    match: (c) => parseM1(c) !== null,
    sortKey: (u) => parseM1(u.codigo) ?? 999999,
  },
  {
    titulo: 'MATERNIDAD 2',
    match: (c) => c.toUpperCase().startsWith('M2'),
    sortKey: (u) => {
      const n = parseM2(u.codigo)
      if (n !== null) return n
      // extras M2* que no sean M2Jxx: mandarlos después
      return 100000
    },
  },
]

const perteneceAUnGrupo = (codigo: string) => GRUPOS.some((g) => g.match(codigo))

const ordenarPorGrupo = (grupo: GrupoConfig, arr: Ubicacion[]) => {
  const titulo = grupo.titulo
  const isM2 = titulo === 'MATERNIDAD 2'

  return [...arr].sort((a, b) => {
    const ka = grupo.sortKey(a)
    const kb = grupo.sortKey(b)

    if (typeof ka === 'number' && typeof kb === 'number' && ka !== kb) return ka - kb
    if (typeof ka === 'number' && typeof kb === 'string') return -1
    if (typeof ka === 'string' && typeof kb === 'number') return 1
    if (typeof ka === 'string' && typeof kb === 'string' && ka !== kb) return ka.localeCompare(kb)

    // para MATERNIDAD 2, si ambos fueron "extras" (100000), ordenar por código
    if (isM2) return a.codigo.localeCompare(b.codigo)

    return a.codigo.localeCompare(b.codigo)
  })
}

// ---------- Helpers para PDF ----------

function generarPdfInventarioDiario(
  fecha: string,
  ubicaciones: Ubicacion[],
  estado: Record<number, EstadoUbicacion>
) {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('Inventario diario de cerdos', 14, 18)

  doc.setFontSize(11)
  doc.text(`Fecha: ${fecha}`, 14, 26)

  const ahora = new Date()
  const fechaHoraStr = `${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`
  doc.setFontSize(9)
  doc.text(`Generado: ${fechaHoraStr}`, 14, 32)

  // ---- Resumen por área ----
  const otrasUbicaciones = ubicaciones.filter((u) => !perteneceAUnGrupo(u.codigo))

  type ResumenArea = {
    area: string
    teorico: number
    manual: number
    diferencia: number
  }

  const resumen: ResumenArea[] = []

  let totalTeorico = 0
  let totalManual = 0
  let totalDiff = 0

  const acumularGrupo = (titulo: string, ubis: Ubicacion[]) => {
    let teo = 0
    let man = 0
    let diff = 0

    ubis.forEach((u) => {
      const e = estado[u.id]
      if (!e || e.manual === '') return // sin conteo, no se incluye

      const teorico = e.teorico || 0
      const manualNum = Number(e.manual) || 0
      const diferencia = manualNum - teorico

      teo += teorico
      man += manualNum
      diff += diferencia
    })

    // si no hay datos en el área, no la agregamos
    if (teo === 0 && man === 0 && diff === 0) return

    resumen.push({
      area: titulo,
      teorico: teo,
      manual: man,
      diferencia: diff,
    })

    totalTeorico += teo
    totalManual += man
    totalDiff += diff
  }

  GRUPOS.forEach((grupo) => {
    const ubisGrupo = ordenarPorGrupo(
      grupo,
      ubicaciones.filter((u) => grupo.match(u.codigo))
    )
    if (ubisGrupo.length === 0) return
    acumularGrupo(grupo.titulo, ubisGrupo)
  })

  if (otrasUbicaciones.length > 0) {
    acumularGrupo('OTRAS UBICACIONES', otrasUbicaciones)
  }

  const body = resumen.map((r) => [
    r.area,
    r.teorico.toString(),
    r.manual.toString(),
    r.diferencia.toString(),
  ])

  body.push(['TOTAL GENERAL', totalTeorico.toString(), totalManual.toString(), totalDiff.toString()])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Manual', 'Diferencia']],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 163, 74] },
  })

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const nombre = (() => {
    const y = ahora.getFullYear()
    const m = pad(ahora.getMonth() + 1)
    const d = pad(ahora.getDate())
    const h = pad(ahora.getHours())
    const min = pad(ahora.getMinutes())
    const s = pad(ahora.getSeconds())
    return `inventario_diario_${y}${m}${d}_${h}${min}${s}.pdf`
  })()

  doc.save(nombre)
}

export default function InventarioDiarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [estado, setEstado] = useState<Record<number, EstadoUbicacion>>({})
  const [fecha, setFecha] = useState('')
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const calcularTeorico = useCallback(
    (ubis: Ubicacion[], movimientos: Movimiento[]) => {
      const teos: Record<number, number> = {}
      ubis.forEach((u) => (teos[u.id] = 0))

      movimientos.forEach((m) => {
        const prev = teos[m.ubicacion_id] ?? 0
        if (m.tipo === 'ENTRADA') teos[m.ubicacion_id] = prev + (m.cantidad || 0)
        else if (m.tipo === 'SALIDA') teos[m.ubicacion_id] = prev - (m.cantidad || 0)
        else if (m.tipo === 'AJUSTE') teos[m.ubicacion_id] = prev + (m.cantidad || 0)
      })

      return teos
    },
    []
  )

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const { data: ubis, error: errU } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo')
        .order('codigo', { ascending: true })

      if (errU) {
        console.error('Error cargando ubicaciones', errU)
        alert('No se pudieron cargar las ubicaciones.')
        return
      }

      const ubicacionesData = (ubis || []) as Ubicacion[]
      setUbicaciones(ubicacionesData)

      const { data: movs, error: errM } = await supabase
        .from('inventario_movimientos')
        .select('ubicacion_id, tipo, cantidad, fecha')
        .order('id', { ascending: true })

      if (errM) {
        console.error('Error cargando movimientos', errM)
        alert('No se pudieron cargar los movimientos de inventario.')
        return
      }

      const movimientos = (movs || []) as Movimiento[]
      const teoricos = calcularTeorico(ubicacionesData, movimientos)

      // si hay inventario diario para la fecha, cargarlo
      let inventarioDia: InventarioDiarioRow[] = []
      if (fecha) {
        const { data: inv, error: errInv } = await supabase
          .from('granja_inventario_diario')
          .select('ubicacion_id, conteo_manual, teorico_al_momento, diferencia')
          .eq('fecha', fecha)

        if (errInv) {
          console.error('Error cargando inventario diario', errInv)
        } else {
          inventarioDia = (inv || []) as InventarioDiarioRow[]
        }
      }

      const mapDia = new Map<number, InventarioDiarioRow>()
      inventarioDia.forEach((r) => mapDia.set(r.ubicacion_id, r))

      const nuevoEstado: Record<number, EstadoUbicacion> = {}
      ubicacionesData.forEach((u) => {
        const teo = teoricos[u.id] ?? 0
        const row = mapDia.get(u.id)
        const manualStr = row ? String(row.conteo_manual) : ''
        const manualNum = row ? Number(row.conteo_manual) || 0 : 0
        const diff = manualStr === '' ? 0 : manualNum - teo

        nuevoEstado[u.id] = {
          teorico: teo,
          manual: manualStr,
          diferencia: diff,
        }
      })

      setEstado(nuevoEstado)
    } finally {
      setLoading(false)
    }
  }, [calcularTeorico, fecha])

  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const f = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    setFecha(f)
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleManualChange = (ubicacionId: number, value: string) => {
    setEstado((prev) => {
      const copy = { ...prev }
      const teo = copy[ubicacionId]?.teorico ?? 0
      const manualNum = value === '' ? 0 : Number(value) || 0
      const diff = value === '' ? 0 : manualNum - teo
      copy[ubicacionId] = { teorico: teo, manual: value, diferencia: diff }
      return copy
    })
  }

  const guardarInventario = async () => {
    if (!fecha) return

    // preparar inserts (solo donde haya conteo)
    const registros = Object.entries(estado)
      .filter(([, v]) => v.manual !== '')
      .map(([ubicacion_id, v]) => {
        const manualNum = Number(v.manual) || 0
        const teo = v.teorico || 0
        return {
          fecha,
          ubicacion_id: Number(ubicacion_id),
          conteo_manual: manualNum,
          teorico_al_momento: teo,
          diferencia: manualNum - teo,
        }
      })

    if (registros.length === 0) {
      alert('No hay conteos para guardar.')
      return
    }

    // Copia del estado para el PDF, antes de que cambie nada
    const estadoParaPdf = { ...estado }

    setGuardando(true)
    try {
      const { error } = await supabase.from('granja_inventario_diario').insert(registros)

      if (error) {
        console.error('Error guardando inventario diario', error)
        alert('Ocurrió un error al guardar el inventario diario.')
        return
      }

      // Generar y descargar PDF automáticamente
      generarPdfInventarioDiario(fecha, ubicaciones, estadoParaPdf)

      alert('Inventario diario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const otrasUbicaciones = ubicaciones.filter((u) => !perteneceAUnGrupo(u.codigo))

  const renderCampoUbicacion = (u: Ubicacion) => {
    const data = estado[u.id] || { teorico: 0, manual: '', diferencia: 0 }
    const diff = data.diferencia
    const diffColor = diff === 0 ? 'text-gray-600' : diff > 0 ? 'text-emerald-700' : 'text-red-700'

    return (
      <div key={u.id} className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-right">{u.codigo}</div>
          <div className="text-[10px] text-gray-500 text-right">{u.nombre || ''}</div>
        </div>

        <div className="w-20 text-right text-[11px] text-gray-700">{data.teorico}</div>

        <input
          type="number"
          className="w-20 border rounded px-1 py-1 text-right text-[11px]"
          value={data.manual}
          onChange={(e) => handleManualChange(u.id, e.target.value)}
        />

        <div className={`w-16 text-right text-[11px] ${diffColor}`}>{diff}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* encabezado */}
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario diario</h1>
          <p className="text-xs text-gray-600">
            Registrar conteos manuales por ubicación y comparar contra el inventario teórico.
          </p>
        </div>
        <Link href="/granja" className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">
          ⬅ Menú de Granja
        </Link>
      </div>

      {/* filtros superiores */}
      <div className="mb-4 flex items-center gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1">Fecha</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {loading && <span className="text-xs text-gray-600">Cargando inventario…</span>}

        <button
          type="button"
          onClick={guardarInventario}
          disabled={guardando || !fecha}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {guardando ? 'Guardando…' : 'Guardar inventario diario'}
        </button>
      </div>

      {/* leyenda columnas */}
      <div className="mb-2 text-[11px] text-gray-600 flex justify-end gap-6 pr-6">
        <span className="w-20 text-right">Teórico</span>
        <span className="w-20 text-right">Conteo</span>
        <span className="w-16 text-right">Diferencia</span>
      </div>

      {/* grilla de grupos */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {GRUPOS.map((grupo) => {
          const ubicGrupo = ordenarPorGrupo(grupo, ubicaciones.filter((u) => grupo.match(u.codigo)))
          if (ubicGrupo.length === 0) return null

          return (
            <div key={grupo.titulo} className="border rounded-lg p-3 bg-white shadow-sm">
              <h2 className="font-semibold text-sm mb-2">{grupo.titulo}</h2>
              {ubicGrupo.map((u) => renderCampoUbicacion(u))}
            </div>
          )
        })}

        {otrasUbicaciones.length > 0 && (
          <div className="border rounded-lg p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Otras ubicaciones</h2>
            {[...otrasUbicaciones].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((u) => renderCampoUbicacion(u))}
          </div>
        )}
      </div>
    </div>
  )
}

