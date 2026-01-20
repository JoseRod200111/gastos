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

// ---------- Grupos de ubicaciones (mismo orden que inventario) ----------
const GRUPOS = [
  {
    titulo: 'GALERA 1',
    codigos: ['TR1', 'TR2', 'TR3', 'TR4', 'TR5', 'TR6', 'TR7', 'TR8'],
  },
  {
    titulo: 'GALERA 2',
    codigos: ['TR09', 'TR10', 'TR11', 'TR12', 'TR13', 'TR14', 'TR15', 'TR16'],
  },
  {
    titulo: 'GALERA 3',
    codigos: [
      'TR25',
      'TR26',
      'TR27',
      'TR28',
      'TR29',
      'TR30',
      'TR31',
      'TR32',
      'TR33',
      'TR34',
      'TR35',
      'TR36',
      'TR37',
      'TR38',
      'TR39',
      'TR40',
      'TR41',
      'TR42',
      'TR43',
      'TR44',
    ],
  },
  {
    titulo: 'GALERA 4',
    codigos: ['TR45', 'TR46', 'TR47', 'TR48', 'TR49'],
  },
  {
    titulo: 'LECHONERA 1',
    codigos: ['L1T1', 'L1T2', 'L1T3', 'L1T4', 'L1T5'],
  },
  {
    titulo: 'LECHONERA 2',
    codigos: ['L2T1', 'L2T2', 'L2T3', 'L2T4', 'L2T5'],
  },
  {
    titulo: 'LECHONERA 3',
    codigos: ['L3T1', 'L3T2', 'L3T3', 'L3T4', 'L3T5'],
  },
  {
    titulo: 'SITIO 2',
    codigos: ['S2TR1', 'S2TR2', 'S2TR3', 'S2TR4'],
  },
  {
    titulo: 'MATERNIDAD 1',
    codigos: ['M1J1', 'M1J2', 'M1J3', 'M1J4', 'M1J5', 'M1J6', 'M1J7', 'M1J8', 'M1J9', 'M1J10'],
  },
  {
    titulo: 'MATERNIDAD 2',
    codigos: [
      'M2J1',
      'M2J2',
      'M2J3',
      'M2J4',
      'M2J5',
      'M2J6',
      'M2J7',
      'M2J8',
      'M2J9',
      'M2J10',
      'M2J11',
      'M2J12',
      'M2J13',
      'M2J14',
      'M2J15',
      'M2J16',
      'M2J17',
      'M2J18',
      'M2J19',
      'M2J20',
      'M2J21',
    ],
  },
]

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
  const codigosEnGrupos = new Set(GRUPOS.flatMap((g) => g.codigos))
  const otrasUbicaciones = ubicaciones.filter(
    (u) => !codigosEnGrupos.has(u.codigo)
  )

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
    const ubisGrupo = ubicaciones.filter((u) =>
      grupo.codigos.includes(u.codigo)
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

  // fila de totales generales
  body.push([
    'TOTAL GENERAL',
    totalTeorico.toString(),
    totalManual.toString(),
    totalDiff.toString(),
  ])

  autoTable(doc, {
    startY: 38,
    head: [['Área', 'Teórico', 'Manual', 'Diferencia']],
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [22, 163, 74] }, // verde similar a la app
  })

  // nombre de archivo inventario_diario_YYYYMMDD_HHMMSS.pdf
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  const nombre =
    (() => {
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

// ---------- Componente principal ----------

export default function GranjaInventarioDiarioPage() {
  const [fecha, setFecha] = useState('')
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [estado, setEstado] = useState<Record<number, EstadoUbicacion>>({})
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const obtenerUsuario = async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id ?? null)
    }
    obtenerUsuario()
  }, [])

  const calcularDelta = (tipo: string, cantidad: number) => {
    if (tipo === 'ENTRADA_COMPRA' || tipo === 'ENTRADA_PARTO') return cantidad
    if (tipo === 'SALIDA_VENTA' || tipo === 'SALIDA_MUERTE') return -cantidad
    if (tipo === 'AJUSTE') return cantidad
    return 0
  }

  const cargarDatos = useCallback(async () => {
    if (!fecha) {
      setEstado({})
      return
    }

    setLoading(true)
    try {
      const fechaFinIso = new Date(`${fecha}T23:59:59`).toISOString()

      const [
        { data: ubicData, error: ubicError },
        { data: movData, error: movError },
        { data: invData, error: invError },
      ] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre, tipo')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_movimientos')
          .select('ubicacion_id, tipo, cantidad, fecha')
          .lte('fecha', fechaFinIso),
        supabase
          .from('granja_inventario_diario')
          .select('ubicacion_id, conteo_manual, teorico_al_momento, diferencia')
          .eq('fecha', fecha)
          .order('created_at', { ascending: false }),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (movError) console.error('Error cargando movimientos', movError)
      if (invError) console.error('Error cargando inventario diario', invError)

      const ubicList = (ubicData || []) as Ubicacion[]
      setUbicaciones(ubicList)

      const saldoPorUbic: Record<number, number> = {}

      ;(movData || []).forEach((m) => {
        const mov = m as Movimiento
        const delta = calcularDelta(mov.tipo, Number(mov.cantidad) || 0)
        saldoPorUbic[mov.ubicacion_id] =
          (saldoPorUbic[mov.ubicacion_id] || 0) + delta
      })

      const ultimaLectura: Record<number, InventarioDiarioRow> = {}
      ;(invData || []).forEach((r) => {
        const row = r as unknown as InventarioDiarioRow
        if (!ultimaLectura[row.ubicacion_id]) {
          ultimaLectura[row.ubicacion_id] = row
        }
      })

      const nuevoEstado: Record<number, EstadoUbicacion> = {}

      ubicList.forEach((u) => {
        const teorico = saldoPorUbic[u.id] || 0
        const lectura = ultimaLectura[u.id]

        if (lectura) {
          const manual = lectura.conteo_manual ?? 0
          nuevoEstado[u.id] = {
            teorico,
            manual: String(manual),
            diferencia:
              lectura.diferencia != null
                ? Number(lectura.diferencia)
                : manual - teorico,
          }
        } else {
          nuevoEstado[u.id] = {
            teorico,
            manual: '',
            diferencia: 0,
          }
        }
      })

      setEstado(nuevoEstado)
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const handleManualChange = (ubicacionId: number, valor: string) => {
    setEstado((prev) => {
      const actual = prev[ubicacionId] || { teorico: 0, manual: '', diferencia: 0 }
      const manualNum = valor === '' ? 0 : Number(valor)
      const diferencia = manualNum - (actual.teorico || 0)

      return {
        ...prev,
        [ubicacionId]: {
          ...actual,
          manual: valor,
          diferencia,
        },
      }
    })
  }

  const guardarInventario = async () => {
    if (!fecha) {
      alert('Debe seleccionar una fecha.')
      return
    }

    const registros = Object.entries(estado)
      .filter(([, v]) => v.manual !== '' && !Number.isNaN(Number(v.manual)))
      .map(([idStr, v]) => {
        const ubicacion_id = Number(idStr)
        const conteo_manual = Number(v.manual)
        return {
          fecha,
          ubicacion_id,
          conteo_manual,
          teorico_al_momento: v.teorico,
          diferencia: v.diferencia,
          hembras_manual: null,
          machos_manual: null,
          user_id: userId,
        }
      })

    if (registros.length === 0) {
      alert('No hay datos para guardar.')
      return
    }

    // snapshot del estado para el PDF, antes de que cambie nada
    const estadoParaPdf = { ...estado }

    setGuardando(true)
    try {
      const { error } = await supabase
        .from('granja_inventario_diario')
        .insert(registros)

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

  const codigosEnGrupos = new Set(GRUPOS.flatMap((g) => g.codigos))
  const otrasUbicaciones = ubicaciones.filter(
    (u) => !codigosEnGrupos.has(u.codigo)
  )

  const renderCampoUbicacion = (u: Ubicacion) => {
    const data = estado[u.id] || { teorico: 0, manual: '', diferencia: 0 }
    const diff = data.diferencia
    const diffColor =
      diff === 0 ? 'text-gray-600' : diff > 0 ? 'text-emerald-700' : 'text-red-700'

    return (
      <div key={u.id} className="flex items-center gap-2 mb-2">
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-right">
            {u.codigo}
          </div>
          <div className="text-[10px] text-gray-500 text-right">
            {u.nombre || ''}
          </div>
        </div>

        <div className="w-20 text-right text-[11px] text-gray-700">
          {data.teorico}
        </div>

        <input
          type="number"
          className="w-20 border rounded px-1 py-1 text-right text-[11px]"
          value={data.manual}
          onChange={(e) => handleManualChange(u.id, e.target.value)}
        />

        <div className={`w-16 text-right text-[11px] ${diffColor}`}>
          {diff}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* encabezado */}
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">
            Granja — Inventario diario
          </h1>
          <p className="text-xs text-gray-600">
            Registrar conteos manuales por ubicación y comparar contra el inventario teórico.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
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

        {loading && (
          <span className="text-xs text-gray-600">
            Cargando inventario…
          </span>
        )}

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
          const ubicGrupo = ubicaciones.filter((u) =>
            grupo.codigos.includes(u.codigo)
          )
          if (ubicGrupo.length === 0) return null

          return (
            <div
              key={grupo.titulo}
              className="border rounded-lg p-3 bg-white shadow-sm"
            >
              <h2 className="font-semibold text-sm mb-2">
                {grupo.titulo}
              </h2>
              {ubicGrupo.map((u) => renderCampoUbicacion(u))}
            </div>
          )
        })}

        {otrasUbicaciones.length > 0 && (
          <div className="border rounded-lg p-3 bg-white shadow-sm">
            <h2 className="font-semibold text-sm mb-2">Otras ubicaciones</h2>
            {otrasUbicaciones.map((u) => renderCampoUbicacion(u))}
          </div>
        )}
      </div>
    </div>
  )
}

