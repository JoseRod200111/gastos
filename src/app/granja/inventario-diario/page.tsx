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
}

type GranjaMovimiento = {
  ubicacion_id: number
  tipo: 'ENTRADA_COMPRA' | 'ENTRADA_PARTO' | 'SALIDA_VENTA' | 'SALIDA_MUERTE' | 'AJUSTE'
  cantidad: number
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

const GRUPOS: GrupoConfig[] = [
  { titulo: 'GALERA 1', match: c => isTRBetween(c, 1, 8), sortKey: u => parseTR(u.codigo) ?? 999999 },
  { titulo: 'GALERA 2', match: c => isTRBetween(c, 9, 24), sortKey: u => parseTR(u.codigo) ?? 999999 },
  { titulo: 'GALERA 3', match: c => isTRBetween(c, 25, 44), sortKey: u => parseTR(u.codigo) ?? 999999 },
  { titulo: 'GALERA 4', match: c => isTRBetween(c, 45, 49), sortKey: u => parseTR(u.codigo) ?? 999999 },

  { titulo: 'LECHONERA 1', match: c => ['L1T1','L1T2','L1T3','L1T4','L1T5'].includes(c), sortKey: u => ['L1T1','L1T2','L1T3','L1T4','L1T5'].indexOf(u.codigo) },
  { titulo: 'LECHONERA 2', match: c => ['L2T1','L2T2','L2T3','L2T4','L2T5'].includes(c), sortKey: u => ['L2T1','L2T2','L2T3','L2T4','L2T5'].indexOf(u.codigo) },
  { titulo: 'LECHONERA 3', match: c => ['L3T1','L3T2','L3T3','L3T4','L3T5'].includes(c), sortKey: u => ['L3T1','L3T2','L3T3','L3T4','L3T5'].indexOf(u.codigo) },

  { titulo: 'SITIO 2', match: c => ['S2TR1','S2TR2','S2TR3','S2TR4'].includes(c), sortKey: u => ['S2TR1','S2TR2','S2TR3','S2TR4'].indexOf(u.codigo) },

  { titulo: 'MATERNIDAD 1', match: c => parseM1(c) !== null, sortKey: u => parseM1(u.codigo) ?? 999999 },

  // ✅ todo M2* dentro (M2Jxx y extras)
  {
    titulo: 'MATERNIDAD 2',
    match: c => c.toUpperCase().startsWith('M2'),
    sortKey: u => {
      const n = parseM2(u.codigo)
      if (n !== null) return n
      return 100000
    },
  },
]

const perteneceAUnGrupo = (codigo: string) => GRUPOS.some(g => g.match(codigo))

const ordenarPorGrupo = (grupo: GrupoConfig, arr: Ubicacion[]) => {
  const isM2 = grupo.titulo === 'MATERNIDAD 2'
  return [...arr].sort((a, b) => {
    const ka = grupo.sortKey(a)
    const kb = grupo.sortKey(b)

    if (typeof ka === 'number' && typeof kb === 'number' && ka !== kb) return ka - kb
    if (isM2) return a.codigo.localeCompare(b.codigo)
    return a.codigo.localeCompare(b.codigo)
  })
}

// ---------- PDF ----------
function generarPdfInventarioDiario(fecha: string, ubicaciones: Ubicacion[], estado: Record<number, EstadoUbicacion>) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Inventario diario de cerdos', 14, 18)
  doc.setFontSize(11)
  doc.text(`Fecha: ${fecha}`, 14, 26)

  const ahora = new Date()
  doc.setFontSize(9)
  doc.text(`Generado: ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`, 14, 32)

  const otras = ubicaciones.filter(u => !perteneceAUnGrupo(u.codigo))

  const resumen: Array<{ area: string; teorico: number; manual: number; diferencia: number }> = []
  let totT = 0, totM = 0, totD = 0

  const acum = (area: string, ubis: Ubicacion[]) => {
    let t = 0, m = 0, d = 0
    ubis.forEach(u => {
      const e = estado[u.id]
      if (!e || e.manual === '') return
      const teo = e.teorico || 0
      const man = Number(e.manual) || 0
      t += teo
      m += man
      d += (man - teo)
    })
    if (t === 0 && m === 0 && d === 0) return
    resumen.push({ area, teorico: t, manual: m, diferencia: d })
    totT += t; totM += m; totD += d
  }

  GRUPOS.forEach(g => {
    const ubis = ordenarPorGrupo(g, ubicaciones.filter(u => g.match(u.codigo)))
    if (ubis.length) acum(g.titulo, ubis)
  })
  if (otras.length) acum('OTRAS UBICACIONES', otras)

  const body = resumen.map(r => [r.area, String(r.teorico), String(r.manual), String(r.diferencia)])
  body.push(['TOTAL GENERAL', String(totT), String(totM), String(totD)])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Manual', 'Diferencia']],
    body,
    styles: { fontSize: 9 },
  })

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const name = `inventario_diario_${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}.pdf`
  doc.save(name)
}

export default function InventarioDiarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [estado, setEstado] = useState<Record<number, EstadoUbicacion>>({})
  const [fecha, setFecha] = useState('')
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const calcularTeorico = useCallback((ubis: Ubicacion[], movs: GranjaMovimiento[]) => {
    const teos: Record<number, number> = {}
    ubis.forEach(u => (teos[u.id] = 0))

    movs.forEach(m => {
      const prev = teos[m.ubicacion_id] ?? 0
      // ✅ inventario teórico por ubicación
      if (m.tipo === 'ENTRADA_COMPRA' || m.tipo === 'ENTRADA_PARTO') teos[m.ubicacion_id] = prev + (m.cantidad || 0)
      else if (m.tipo === 'SALIDA_VENTA' || m.tipo === 'SALIDA_MUERTE') teos[m.ubicacion_id] = prev - (m.cantidad || 0)
      else if (m.tipo === 'AJUSTE') teos[m.ubicacion_id] = prev + (m.cantidad || 0)
    })

    return teos
  }, [])

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const { data: ubis, error: errU } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, tipo')
        .order('codigo', { ascending: true })

      if (errU) {
        console.error(errU)
        alert('No se pudieron cargar las ubicaciones.')
        return
      }

      const ubicacionesData = (ubis || []) as Ubicacion[]
      setUbicaciones(ubicacionesData)

      // ✅ AQUÍ estaba el 400: ahora usamos granja_movimientos
      const { data: movs, error: errM } = await supabase
        .from('granja_movimientos')
        .select('ubicacion_id, tipo, cantidad, fecha')
        .order('fecha', { ascending: true })

      if (errM) {
        console.error('Error cargando movimientos', errM)
        alert('Error cargando movimientos.')
        return
      }

      const movimientos = (movs || []) as GranjaMovimiento[]
      const teoricos = calcularTeorico(ubicacionesData, movimientos)

      // cargar inventario diario del día (si existe)
      let invDia: InventarioDiarioRow[] = []
      if (fecha) {
        const { data: inv, error: errInv } = await supabase
          .from('granja_inventario_diario')
          .select('ubicacion_id, conteo_manual, teorico_al_momento, diferencia')
          .eq('fecha', fecha)

        if (!errInv) invDia = (inv || []) as InventarioDiarioRow[]
      }

      const mapDia = new Map<number, InventarioDiarioRow>()
      invDia.forEach(r => mapDia.set(r.ubicacion_id, r))

      const nuevoEstado: Record<number, EstadoUbicacion> = {}
      ubicacionesData.forEach(u => {
        const teo = teoricos[u.id] ?? 0
        const row = mapDia.get(u.id)
        const manualStr = row ? String(row.conteo_manual) : ''
        const manualNum = row ? Number(row.conteo_manual) || 0 : 0
        const diff = manualStr === '' ? 0 : manualNum - teo

        nuevoEstado[u.id] = { teorico: teo, manual: manualStr, diferencia: diff }
      })

      setEstado(nuevoEstado)
    } finally {
      setLoading(false)
    }
  }, [calcularTeorico, fecha])

  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    setFecha(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`)
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleManualChange = (ubicacionId: number, value: string) => {
    setEstado(prev => {
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

    const estadoParaPdf = { ...estado }

    setGuardando(true)
    try {
      // ✅ mejor: upsert (necesita UNIQUE(fecha, ubicacion_id))
      const { error } = await supabase
        .from('granja_inventario_diario')
        .upsert(registros, { onConflict: 'fecha,ubicacion_id' })

      // Si no tienes UNIQUE y te falla el upsert, dime y lo cambiamos a:
      // await supabase.from('granja_inventario_diario').delete().eq('fecha', fecha)
      // await supabase.from('granja_inventario_diario').insert(registros)

      if (error) {
        console.error(error)
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

  const otrasUbicaciones = ubicaciones.filter(u => !perteneceAUnGrupo(u.codigo))

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
          onChange={e => handleManualChange(u.id, e.target.value)}
        />

        <div className={`w-16 text-right text-[11px] ${diffColor}`}>{diff}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario diario</h1>
          <p className="text-xs text-gray-600">Registrar conteos manuales por ubicación y comparar contra inventario teórico.</p>
        </div>
        <Link href="/granja" className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1">Fecha</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>

        {loading && <span className="text-xs text-gray-600">Cargando…</span>}

        <button
          type="button"
          onClick={guardarInventario}
          disabled={guardando || !fecha}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
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
        {GRUPOS.map(grupo => {
          const ubicGrupo = ordenarPorGrupo(grupo, ubicaciones.filter(u => grupo.match(u.codigo)))
          if (ubicGrupo.length === 0) return null
          return (
            <div key={grupo.titulo} className="border rounded-lg p-3 bg-white shadow-sm">
              <h2 className="font-semibold text-sm mb-2">{grupo.titulo}</h2>
              {ubicGrupo.map(u => renderCampoUbicacion(u))}
            </div>
          )
        })}

        {otrasUbicaciones.length > 0 && (
          <div className="border rounded-lg p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Otras ubicaciones</h2>
            {[...otrasUbicaciones].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(u => renderCampoUbicacion(u))}
          </div>
        )}
      </div>
    </div>
  )
}
