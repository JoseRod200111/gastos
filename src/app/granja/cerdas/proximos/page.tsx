'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Cerda = {
  id: number
  arete: string
  nombre: string | null
  estado: string
  paridad: number | null
  ubicacion_id: number | null
  activa: boolean
  granja_ubicaciones?: {
    codigo: string | null
    nombre: string | null
  } | null
}

type CerdaEvento = {
  id: number
  cerda_id: number
  fecha: string
  tipo: string
  resultado: string | null
  observaciones: string | null
  ubicacion_id: number | null
  created_at: string | null
}

type ProximoEvento = {
  id: string
  cerda_id: number
  arete: string
  nombre: string | null
  estado: string
  paridad: number
  ubicacion: string
  tipo: string
  origenEvento: string
  fechaBase: string
  fechaEsperada: string
  diasRestantes: number
  estadoTiempo: 'VENCIDO' | 'HOY' | 'PROXIMO' | 'FUTURO'
  prioridad: number
  descripcion: string
}

const DIAS_REVISION_CELO = 21
const DIAS_GESTACION = 115
const DIAS_DESTETE = 21
const DIAS_CELO_POST_DESTETE = 5

const TIPOS_SERVICIO = ['INSEMINACION', 'INSEMINACIÓN', 'MONTA', 'SERVICIO']
const TIPOS_PARTO = ['PARTO']
const TIPOS_DESTETE = ['DESTETE']
const TIPOS_REVISION = ['REVISION', 'REVISIÓN', 'REVISION_PARTO', 'REVISION DE PARTO']

const normalizar = (v: string | null | undefined) =>
  String(v || '')
    .trim()
    .toUpperCase()

const fechaISO = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const hoyLocal = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const parseFechaLocal = (fecha: string) => {
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setHours(0, 0, 0, 0)
  return date
}

const sumarDias = (fecha: string, dias: number) => {
  const d = parseFechaLocal(fecha)
  d.setDate(d.getDate() + dias)
  return fechaISO(d)
}

const diffDias = (fecha: string) => {
  const hoy = hoyLocal().getTime()
  const objetivo = parseFechaLocal(fecha).getTime()
  return Math.round((objetivo - hoy) / (1000 * 60 * 60 * 24))
}

const formatoFecha = (fecha?: string | null) => {
  if (!fecha) return '—'
  return String(fecha).slice(0, 10)
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

const clasificarTiempo = (dias: number): ProximoEvento['estadoTiempo'] => {
  if (dias < 0) return 'VENCIDO'
  if (dias === 0) return 'HOY'
  if (dias <= 7) return 'PROXIMO'
  return 'FUTURO'
}

const prioridadTiempo = (dias: number) => {
  if (dias < 0) return 0
  if (dias === 0) return 1
  if (dias <= 7) return 2
  if (dias <= 30) return 3
  return 4
}

const textoEstadoTiempo = (dias: number) => {
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día(s)`
  if (dias === 0) return 'Hoy'
  return `Faltan ${dias} día(s)`
}

export default function ProximosEventosCerdasPage() {
  const [cerdas, setCerdas] = useState<Cerda[]>([])
  const [eventos, setEventos] = useState<CerdaEvento[]>([])
  const [loading, setLoading] = useState(false)

  const [diasVista, setDiasVista] = useState('45')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarFuturosLejanos, setMostrarFuturosLejanos] = useState(false)

  const cargarDatos = useCallback(async () => {
    setLoading(true)

    try {
      const [cerdasRes, eventosRes] = await Promise.all([
        supabase
          .from('granja_cerdas')
          .select(
            `
            id,
            arete,
            nombre,
            estado,
            paridad,
            ubicacion_id,
            activa,
            granja_ubicaciones (
              codigo,
              nombre
            )
          `
          )
          .eq('activa', true)
          .order('arete', { ascending: true }),

        supabase
          .from('granja_cerda_eventos')
          .select(
            `
            id,
            cerda_id,
            fecha,
            tipo,
            resultado,
            observaciones,
            ubicacion_id,
            created_at
          `
          )
          .order('fecha', { ascending: false }),
      ])

      if (cerdasRes.error) {
        console.error(cerdasRes.error)
        alert(`Error cargando cerdas: ${cerdasRes.error.message}`)
        return
      }

      if (eventosRes.error) {
        console.error(eventosRes.error)
        alert(`Error cargando eventos: ${eventosRes.error.message}`)
        return
      }

      setCerdas((cerdasRes.data || []) as unknown as Cerda[])
      setEventos((eventosRes.data || []) as unknown as CerdaEvento[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const eventosPorCerda = useMemo(() => {
    const map = new Map<number, CerdaEvento[]>()

    eventos.forEach((ev) => {
      const cerdaId = Number(ev.cerda_id)
      if (!map.has(cerdaId)) map.set(cerdaId, [])
      map.get(cerdaId)?.push(ev)
    })

    map.forEach((lista) => {
      lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    })

    return map
  }, [eventos])

  const proximosEventos = useMemo(() => {
    const lista: ProximoEvento[] = []

    cerdas.forEach((cerda) => {
      const eventosCerda = eventosPorCerda.get(cerda.id) || []

      const ultimoServicio = eventosCerda.find((ev) =>
        TIPOS_SERVICIO.includes(normalizar(ev.tipo))
      )

      const ultimoParto = eventosCerda.find((ev) =>
        TIPOS_PARTO.includes(normalizar(ev.tipo))
      )

      const ultimoDestete = eventosCerda.find((ev) =>
        TIPOS_DESTETE.includes(normalizar(ev.tipo))
      )

      const revisionPosteriorServicio = ultimoServicio
        ? eventosCerda.find((ev) => {
            const tipo = normalizar(ev.tipo)
            return (
              TIPOS_REVISION.includes(tipo) &&
              formatoFecha(ev.fecha) >= formatoFecha(ultimoServicio.fecha)
            )
          })
        : null

      const partoPosteriorServicio = ultimoServicio
        ? eventosCerda.find((ev) => {
            const tipo = normalizar(ev.tipo)
            return (
              TIPOS_PARTO.includes(tipo) &&
              formatoFecha(ev.fecha) >= formatoFecha(ultimoServicio.fecha)
            )
          })
        : null

      const destetePosteriorParto = ultimoParto
        ? eventosCerda.find((ev) => {
            const tipo = normalizar(ev.tipo)
            return (
              TIPOS_DESTETE.includes(tipo) &&
              formatoFecha(ev.fecha) >= formatoFecha(ultimoParto.fecha)
            )
          })
        : null

      const ubicacion = ubicacionTexto(cerda.granja_ubicaciones)

      if (ultimoServicio && !revisionPosteriorServicio) {
        const fechaEsperada = sumarDias(ultimoServicio.fecha, DIAS_REVISION_CELO)
        const dias = diffDias(fechaEsperada)

        lista.push({
          id: `${cerda.id}-revision-${ultimoServicio.id}`,
          cerda_id: cerda.id,
          arete: cerda.arete,
          nombre: cerda.nombre,
          estado: cerda.estado,
          paridad: cerda.paridad ?? 0,
          ubicacion,
          tipo: 'Revisión 21 días',
          origenEvento: ultimoServicio.tipo,
          fechaBase: formatoFecha(ultimoServicio.fecha),
          fechaEsperada,
          diasRestantes: dias,
          estadoTiempo: clasificarTiempo(dias),
          prioridad: prioridadTiempo(dias),
          descripcion:
            'Revisar retorno a celo o confirmar que la cerda continúa en seguimiento reproductivo.',
        })
      }

      if (ultimoServicio && !partoPosteriorServicio) {
        const fechaEsperada = sumarDias(ultimoServicio.fecha, DIAS_GESTACION)
        const dias = diffDias(fechaEsperada)

        lista.push({
          id: `${cerda.id}-parto-${ultimoServicio.id}`,
          cerda_id: cerda.id,
          arete: cerda.arete,
          nombre: cerda.nombre,
          estado: cerda.estado,
          paridad: cerda.paridad ?? 0,
          ubicacion,
          tipo: 'Parto estimado',
          origenEvento: ultimoServicio.tipo,
          fechaBase: formatoFecha(ultimoServicio.fecha),
          fechaEsperada,
          diasRestantes: dias,
          estadoTiempo: clasificarTiempo(dias),
          prioridad: prioridadTiempo(dias),
          descripcion: 'Preparar seguimiento de parto según fecha estimada de gestación.',
        })
      }

      if (ultimoParto && !destetePosteriorParto) {
        const fechaEsperada = sumarDias(ultimoParto.fecha, DIAS_DESTETE)
        const dias = diffDias(fechaEsperada)

        lista.push({
          id: `${cerda.id}-destete-${ultimoParto.id}`,
          cerda_id: cerda.id,
          arete: cerda.arete,
          nombre: cerda.nombre,
          estado: cerda.estado,
          paridad: cerda.paridad ?? 0,
          ubicacion,
          tipo: 'Destete',
          origenEvento: ultimoParto.tipo,
          fechaBase: formatoFecha(ultimoParto.fecha),
          fechaEsperada,
          diasRestantes: dias,
          estadoTiempo: clasificarTiempo(dias),
          prioridad: prioridadTiempo(dias),
          descripcion: 'Programar destete según los días definidos para la granja.',
        })
      }

      if (ultimoDestete) {
        const servicioPosteriorDestete = eventosCerda.find((ev) => {
          const tipo = normalizar(ev.tipo)
          return (
            TIPOS_SERVICIO.includes(tipo) &&
            formatoFecha(ev.fecha) >= formatoFecha(ultimoDestete.fecha)
          )
        })

        if (!servicioPosteriorDestete) {
          const fechaEsperada = sumarDias(ultimoDestete.fecha, DIAS_CELO_POST_DESTETE)
          const dias = diffDias(fechaEsperada)

          lista.push({
            id: `${cerda.id}-celo-post-destete-${ultimoDestete.id}`,
            cerda_id: cerda.id,
            arete: cerda.arete,
            nombre: cerda.nombre,
            estado: cerda.estado,
            paridad: cerda.paridad ?? 0,
            ubicacion,
            tipo: 'Celo post-destete',
            origenEvento: ultimoDestete.tipo,
            fechaBase: formatoFecha(ultimoDestete.fecha),
            fechaEsperada,
            diasRestantes: dias,
            estadoTiempo: clasificarTiempo(dias),
            prioridad: prioridadTiempo(dias),
            descripcion: 'Monitorear posible retorno a celo posterior al destete.',
          })
        }
      }
    })

    return lista.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad
      return a.diasRestantes - b.diasRestantes
    })
  }, [cerdas, eventosPorCerda])

  const proximosFiltrados = useMemo(() => {
    const diasLimite = Number(diasVista) || 45
    const q = busqueda.trim().toLowerCase()

    return proximosEventos.filter((ev) => {
      if (!mostrarFuturosLejanos && ev.diasRestantes > diasLimite) return false
      if (tipoFiltro && ev.tipo !== tipoFiltro) return false
      if (estadoFiltro && ev.estadoTiempo !== estadoFiltro) return false

      if (!q) return true

      const texto = [
        ev.arete,
        ev.nombre,
        ev.estado,
        ev.ubicacion,
        ev.tipo,
        ev.origenEvento,
        ev.descripcion,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return texto.includes(q)
    })
  }, [
    proximosEventos,
    diasVista,
    tipoFiltro,
    estadoFiltro,
    busqueda,
    mostrarFuturosLejanos,
  ])

  const tiposDisponibles = useMemo(() => {
    return Array.from(new Set(proximosEventos.map((ev) => ev.tipo))).sort((a, b) =>
      a.localeCompare(b, 'es')
    )
  }, [proximosEventos])

  const totalVencidos = proximosFiltrados.filter((ev) => ev.estadoTiempo === 'VENCIDO').length
  const totalHoy = proximosFiltrados.filter((ev) => ev.estadoTiempo === 'HOY').length
  const totalSemana = proximosFiltrados.filter(
    (ev) => ev.diasRestantes >= 1 && ev.diasRestantes <= 7
  ).length
  const totalProximos = proximosFiltrados.length

  const colorEvento = (estado: ProximoEvento['estadoTiempo']) => {
    if (estado === 'VENCIDO') return 'bg-red-50 border-red-300 text-red-800'
    if (estado === 'HOY') return 'bg-orange-50 border-orange-300 text-orange-800'
    if (estado === 'PROXIMO') return 'bg-amber-50 border-amber-300 text-amber-800'
    return 'bg-white border-gray-300 text-gray-800'
  }

  const badgeColor = (estado: ProximoEvento['estadoTiempo']) => {
    if (estado === 'VENCIDO') return 'bg-red-600 text-white'
    if (estado === 'HOY') return 'bg-orange-600 text-white'
    if (estado === 'PROXIMO') return 'bg-amber-500 text-white'
    return 'bg-slate-600 text-white'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={150} height={60} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Próximos eventos de cerdas</h1>

        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Menú de Granja
        </Link>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Eventos mostrados</div>
          <div className="text-xl font-bold">{totalProximos}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Vencidos</div>
          <div className="text-xl font-bold text-red-700">{totalVencidos}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Para hoy</div>
          <div className="text-xl font-bold text-orange-700">{totalHoy}</div>
        </div>

        <div className="border rounded bg-white p-3">
          <div className="text-xs text-gray-600">Próximos 7 días</div>
          <div className="text-xl font-bold text-amber-700">{totalSemana}</div>
        </div>
      </div>

      <div className="border rounded-lg bg-white p-4 mb-4 shadow-sm">
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold mb-1">Buscar</label>
            <input
              className="border rounded p-2 w-full text-sm"
              placeholder="Arete, ubicación, evento..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Tipo</label>
            <select
              className="border rounded p-2 w-full text-sm"
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
            <label className="block text-xs font-semibold mb-1">Estado</label>
            <select
              className="border rounded p-2 w-full text-sm"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="VENCIDO">Vencidos</option>
              <option value="HOY">Hoy</option>
              <option value="PROXIMO">Próximos 7 días</option>
              <option value="FUTURO">Futuros</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Días a mostrar</label>
            <input
              type="number"
              min="1"
              className="border rounded p-2 w-full text-sm"
              value={diasVista}
              onChange={(e) => setDiasVista(e.target.value)}
            />
          </div>

          <button
            onClick={cargarDatos}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {loading ? 'Cargando…' : 'Buscar / Actualizar'}
          </button>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mostrarFuturosLejanos}
            onChange={(e) => setMostrarFuturosLejanos(e.target.checked)}
          />
          Mostrar también eventos fuera del rango de días
        </label>
      </div>

      <div className="border rounded-lg bg-white p-4 mb-4 text-xs text-gray-700">
        <b>Parámetros usados:</b> revisión 21 días, parto estimado 115 días,
        destete 21 días después del parto y celo post-destete 5 días después del destete.
      </div>

      <div className="grid gap-3">
        {proximosFiltrados.length === 0 ? (
          <div className="border rounded bg-white p-4 text-gray-500">
            No hay próximos eventos con los filtros aplicados.
          </div>
        ) : (
          proximosFiltrados.map((ev) => (
            <div
              key={ev.id}
              className={`border rounded-lg p-4 shadow-sm ${colorEvento(ev.estadoTiempo)}`}
            >
              <div className="flex flex-wrap gap-3 items-start">
                <div className="min-w-[160px]">
                  <div className="text-xs opacity-80">Cerda</div>
                  <div className="font-bold text-lg">{ev.arete}</div>
                  <div className="text-xs">
                    {ev.nombre || 'Sin nombre'} · {ev.estado} · Paridad {ev.paridad}
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <div className="text-xs opacity-80">Evento pendiente</div>
                  <div className="font-semibold">{ev.tipo}</div>
                  <div className="text-xs">{ev.descripcion}</div>
                </div>

                <div className="min-w-[150px]">
                  <div className="text-xs opacity-80">Fecha esperada</div>
                  <div className="font-semibold">{ev.fechaEsperada}</div>
                  <span className={`inline-block mt-1 px-2 py-1 rounded text-xs ${badgeColor(ev.estadoTiempo)}`}>
                    {textoEstadoTiempo(ev.diasRestantes)}
                  </span>
                </div>

                <div className="min-w-[180px]">
                  <div className="text-xs opacity-80">Base de cálculo</div>
                  <div className="text-sm">
                    {ev.origenEvento} del {ev.fechaBase}
                  </div>
                  <div className="text-xs">Ubicación: {ev.ubicacion}</div>
                </div>

                <div className="ml-auto flex gap-2">
                  <Link
                    href={`/granja/cerdas/reportes?cerda=${ev.cerda_id}`}
                    className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-xs"
                  >
                    Ver ficha
                  </Link>

                  <Link
                    href="/granja/cerdas/evento"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded text-xs"
                  >
                    Registrar evento
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}