'use client'

import { useCallback, useEffect, useState } from 'react'
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
}

type EstadoUbicacion = {
  teorico: number
  manual: string
  diferencia: number
}

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

// Igual que en /granja/inventario.
// Esto hace que ambas pantallas calculen hasta el mismo corte.
const finDeDiaUTC = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

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

const GRUPOS: GrupoConfig[] = [
  {
    titulo: 'GALERA 1',
    match: (codigo) => isTRBetween(codigo, 1, 8),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 2',
    match: (codigo) => isTRBetween(codigo, 9, 24),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 3',
    match: (codigo) => isTRBetween(codigo, 25, 44),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'GALERA 4',
    match: (codigo) => isTRBetween(codigo, 45, 49),
    sortKey: (u) => parseTR(u.codigo) ?? 999999,
  },
  {
    titulo: 'LECHONERA 1',
    match: (codigo) => ['L1T1', 'L1T2', 'L1T3', 'L1T4', 'L1T5'].includes(codigo),
    sortKey: (u) => ['L1T1', 'L1T2', 'L1T3', 'L1T4', 'L1T5'].indexOf(u.codigo),
  },
  {
    titulo: 'LECHONERA 2',
    match: (codigo) => ['L2T1', 'L2T2', 'L2T3', 'L2T4', 'L2T5'].includes(codigo),
    sortKey: (u) => ['L2T1', 'L2T2', 'L2T3', 'L2T4', 'L2T5'].indexOf(u.codigo),
  },
  {
    titulo: 'LECHONERA 3',
    match: (codigo) => ['L3T1', 'L3T2', 'L3T3', 'L3T4', 'L3T5'].includes(codigo),
    sortKey: (u) => ['L3T1', 'L3T2', 'L3T3', 'L3T4', 'L3T5'].indexOf(u.codigo),
  },
  {
    titulo: 'SITIO 2',
    match: (codigo) => ['S2TR1', 'S2TR2', 'S2TR3', 'S2TR4'].includes(codigo),
    sortKey: (u) => ['S2TR1', 'S2TR2', 'S2TR3', 'S2TR4'].indexOf(u.codigo),
  },
  {
    titulo: 'MATERNIDAD 1',
    match: (codigo) => parseM1(codigo) !== null,
    sortKey: (u) => parseM1(u.codigo) ?? 999999,
  },
  {
    titulo: 'MATERNIDAD 2',
    match: (codigo) => codigo.toUpperCase().startsWith('M2'),
    sortKey: (u) => {
      const n = parseM2(u.codigo)
      if (n !== null) return n
      return 100000
    },
  },
]

const perteneceAUnGrupo = (codigo: string) => GRUPOS.some((g) => g.match(codigo))

const ordenarPorGrupo = (grupo: GrupoConfig, arr: Ubicacion[]) => {
  const isM2 = grupo.titulo === 'MATERNIDAD 2'

  return [...arr].sort((a, b) => {
    const ka = grupo.sortKey(a)
    const kb = grupo.sortKey(b)

    if (typeof ka === 'number' && typeof kb === 'number' && ka !== kb) {
      return ka - kb
    }

    if (isM2) return a.codigo.localeCompare(b.codigo)

    return a.codigo.localeCompare(b.codigo)
  })
}

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

  doc.setFontSize(9)
  doc.text(`Generado: ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`, 14, 32)

  const otras = ubicaciones.filter((u) => !perteneceAUnGrupo(u.codigo))

  const resumen: Array<{
    area: string
    teorico: number
    manual: number
    diferencia: number
  }> = []

  let totalTeorico = 0
  let totalManual = 0
  let totalDiferencia = 0

  const acumular = (area: string, ubis: Ubicacion[]) => {
    let teorico = 0
    let manual = 0
    let diferencia = 0

    ubis.forEach((u) => {
      const e = estado[u.id]
      if (!e || e.manual === '') return

      const teo = e.teorico || 0
      const man = Number(e.manual) || 0

      teorico += teo
      manual += man
      diferencia += man - teo
    })

    if (teorico === 0 && manual === 0 && diferencia === 0) return

    resumen.push({
      area,
      teorico,
      manual,
      diferencia,
    })

    totalTeorico += teorico
    totalManual += manual
    totalDiferencia += diferencia
  }

  GRUPOS.forEach((grupo) => {
    const ubis = ordenarPorGrupo(
      grupo,
      ubicaciones.filter((u) => grupo.match(u.codigo))
    )

    if (ubis.length) acumular(grupo.titulo, ubis)
  })

  if (otras.length) {
    acumular('OTRAS UBICACIONES', otras)
  }

  const body = resumen.map((r) => [
    r.area,
    String(r.teorico),
    String(r.manual),
    String(r.diferencia),
  ])

  body.push([
    'TOTAL GENERAL',
    String(totalTeorico),
    String(totalManual),
    String(totalDiferencia),
  ])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Manual', 'Diferencia']],
    body,
    styles: { fontSize: 9 },
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

  const calcularTeorico = useCallback((ubis: Ubicacion[], movs: GranjaMovimiento[]) => {
    const teoricos: Record<number, number> = {}

    ubis.forEach((u) => {
      teoricos[u.id] = 0
    })

    movs.forEach((movimiento) => {
      const ubicacionId = movimiento.ubicacion_id

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

  const cargarDatos = useCallback(async () => {
    if (!fecha) return

    setLoading(true)

    try {
      const { data: ubis, error: errUbicaciones } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo, activo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (errUbicaciones) {
        console.error('Error cargando ubicaciones', errUbicaciones)
        alert('No se pudieron cargar las ubicaciones.')
        return
      }

      const ubicacionesData = (ubis ?? []) as Ubicacion[]
      setUbicaciones(ubicacionesData)

      const { data: movs, error: errMovimientos } = await supabase
        .from('granja_movimientos')
        .select('ubicacion_id, tipo, cantidad, fecha')
        .lte('fecha', finDeDiaUTC(fecha))
        .order('fecha', { ascending: true })

      if (errMovimientos) {
        console.error('Error cargando movimientos', errMovimientos)
        alert('Error cargando movimientos.')
        return
      }

      const movimientos = (movs ?? []) as GranjaMovimiento[]
      const teoricos = calcularTeorico(ubicacionesData, movimientos)

      let inventarioDiario: InventarioDiarioRow[] = []

      const { data: inv, error: errInventarioDiario } = await supabase
        .from('granja_inventario_diario')
        .select('ubicacion_id, conteo_manual, teorico_al_momento, diferencia')
        .eq('fecha', fecha)

      if (!errInventarioDiario) {
        inventarioDiario = (inv ?? []) as InventarioDiarioRow[]
      }

      const mapInventarioDiario = new Map<number, InventarioDiarioRow>()

      inventarioDiario.forEach((row) => {
        mapInventarioDiario.set(row.ubicacion_id, row)
      })

      const nuevoEstado: Record<number, EstadoUbicacion> = {}

      ubicacionesData.forEach((ubicacion) => {
        const teorico = teoricos[ubicacion.id] ?? 0
        const rowGuardado = mapInventarioDiario.get(ubicacion.id)

        const manualStr = rowGuardado ? String(rowGuardado.conteo_manual) : ''
        const manualNum = manualStr === '' ? 0 : Number(manualStr) || 0
        const diferencia = manualStr === '' ? 0 : manualNum - teorico

        nuevoEstado[ubicacion.id] = {
          teorico,
          manual: manualStr,
          diferencia,
        }
      })

      setEstado(nuevoEstado)
    } finally {
      setLoading(false)
    }
  }, [calcularTeorico, fecha])

  useEffect(() => {
    setFecha(hoyISO())
  }, [])

  useEffect(() => {
    if (fecha) {
      cargarDatos()
    }
  }, [fecha, cargarDatos])

  const handleManualChange = (ubicacionId: number, value: string) => {
    setEstado((prev) => {
      const copy = { ...prev }
      const teorico = copy[ubicacionId]?.teorico ?? 0
      const manualNum = value === '' ? 0 : Number(value) || 0
      const diferencia = value === '' ? 0 : manualNum - teorico

      copy[ubicacionId] = {
        teorico,
        manual: value,
        diferencia,
      }

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

    const hayConteos = Object.values(estado).some((v) => v.manual !== '')

    if (!hayConteos) {
      const ok = confirm('No hay conteos manuales ingresados. ¿Generar PDF de todos modos?')
      if (!ok) return
    }

    setImprimiendo(true)

    try {
      generarPdfInventarioDiario(fecha, ubicaciones, { ...estado })
    } finally {
      setImprimiendo(false)
    }
  }

  const guardarInventario = async () => {
    if (!fecha) {
      alert('Selecciona una fecha.')
      return
    }

    const registros = Object.entries(estado)
      .filter(([, value]) => value.manual !== '')
      .map(([ubicacionId, value]) => {
        const manualNum = Number(value.manual) || 0
        const teorico = value.teorico || 0

        return {
          fecha,
          ubicacion_id: Number(ubicacionId),
          conteo_manual: manualNum,
          teorico_al_momento: teorico,
          diferencia: manualNum - teorico,
        }
      })

    if (registros.length === 0) {
      alert('No hay conteos para guardar.')
      return
    }

    const estadoParaPdf = { ...estado }

    setGuardando(true)

    try {
      const { error } = await supabase
        .from('granja_inventario_diario')
        .upsert(registros, { onConflict: 'fecha,ubicacion_id' })

      if (error) {
        console.error('Error guardando inventario diario', error)
        alert('Ocurrió un error al guardar el inventario diario.')
        return
      }

      generarPdfInventarioDiario(fecha, ubicaciones, estadoParaPdf)

      alert('Inventario diario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const otrasUbicaciones = ubicaciones.filter((u) => !perteneceAUnGrupo(u.codigo))

  const renderCampoUbicacion = (ubicacion: Ubicacion) => {
    const data = estado[ubicacion.id] || {
      teorico: 0,
      manual: '',
      diferencia: 0,
    }

    const diferencia = data.diferencia

    const diffColor =
      diferencia === 0
        ? 'text-gray-600'
        : diferencia > 0
          ? 'text-emerald-700'
          : 'text-red-700'

    return (
      <div key={ubicacion.id} className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-right">
            {ubicacion.codigo}
          </div>
          <div className="text-[10px] text-gray-500 text-right">
            {ubicacion.nombre || ''}
          </div>
        </div>

        <div className="w-20 text-right text-[11px] text-gray-700">
          {data.teorico}
        </div>

        <input
          type="number"
          className="w-20 border rounded px-1 py-1 text-right text-[11px]"
          value={data.manual}
          onChange={(e) => handleManualChange(ubicacion.id, e.target.value)}
        />

        <div className={`w-16 text-right text-[11px] ${diffColor}`}>
          {diferencia}
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
          ⬅ Menú de Granja
        </Link>
      </div>

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

        {loading ? <span className="text-xs text-gray-600">Cargando…</span> : null}

        <button
          type="button"
          onClick={cargarDatos}
          disabled={loading || !fecha}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          Buscar
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

      <div className="mb-2 text-[11px] text-gray-600 flex justify-end gap-6 pr-6">
        <span className="w-20 text-right">Teórico</span>
        <span className="w-20 text-right">Conteo</span>
        <span className="w-16 text-right">Diferencia</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {GRUPOS.map((grupo) => {
          const ubicGrupo = ordenarPorGrupo(
            grupo,
            ubicaciones.filter((ubicacion) => grupo.match(ubicacion.codigo))
          )

          if (ubicGrupo.length === 0) return null

          return (
            <div key={grupo.titulo} className="border rounded-lg p-3 bg-white shadow-sm">
              <h2 className="font-semibold text-sm mb-2">{grupo.titulo}</h2>
              {ubicGrupo.map((ubicacion) => renderCampoUbicacion(ubicacion))}
            </div>
          )
        })}

        {otrasUbicaciones.length > 0 ? (
          <div className="border rounded-lg p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Otras ubicaciones</h2>

            {[...otrasUbicaciones]
              .sort((a, b) => a.codigo.localeCompare(b.codigo))
              .map((ubicacion) => renderCampoUbicacion(ubicacion))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
