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
  datos: any
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
  notas: string
  activa: boolean
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

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const formatFecha = (fecha?: string | null) => {
  if (!fecha) return '—'
  return String(fecha).slice(0, 10)
}

const ubicacionTexto = (u?: { codigo: string | null; nombre: string | null } | null) => {
  if (!u) return '—'
  return `${u.codigo || ''}${u.nombre ? ` — ${u.nombre}` : ''}` || '—'
}

function generarFichaCerdaPdf(cerda: Cerda, eventos: CerdaEvento[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.text('FICHA INDIVIDUAL DE CERDA', 14, 16)

  doc.setFontSize(10)
  doc.text(`Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 23)

  autoTable(doc, {
    startY: 30,
    head: [['Campo', 'Información']],
    body: [
      ['Arete', cerda.arete || '—'],
      ['Nombre', cerda.nombre || '—'],
      ['Estado', cerda.estado || '—'],
      ['Activa', cerda.activa ? 'Sí' : 'No'],
      ['Ubicación actual', ubicacionTexto(cerda.granja_ubicaciones)],
      ['Lote', cerda.granja_lotes?.codigo || '—'],
      ['Fecha nacimiento', formatFecha(cerda.fecha_nacimiento)],
      ['Peso lb', cerda.peso_lb !== null && cerda.peso_lb !== undefined ? String(cerda.peso_lb) : '—'],
      ['Fecha de registro', formatFecha(cerda.created_at)],
      ['Última actualización', formatFecha(cerda.updated_at)],
      ['Notas', cerda.notas || '—'],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [220, 220, 220] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { cellWidth: 135 },
    },
    margin: { left: 14, right: 14 },
  })

  let y = (doc as any).lastAutoTable.finalY + 10

  doc.setFontSize(13)
  doc.text('Historial de eventos', 14, y)

  const bodyEventos = eventos.map((ev) => [
    formatFecha(ev.fecha),
    ev.tipo || '—',
    ev.resultado || '—',
    ubicacionTexto(ev.granja_ubicaciones),
    ev.observaciones || '—',
  ])

  autoTable(doc, {
    startY: y + 5,
    head: [['Fecha', 'Tipo', 'Resultado', 'Ubicación', 'Observaciones']],
    body: bodyEventos.length > 0 ? bodyEventos : [['—', 'Sin eventos registrados', '—', '—', '—']],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { cellWidth: 48 },
      4: { cellWidth: 52 },
    },
  })

  const name = `ficha_cerda_${cerda.arete || cerda.id}_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.pdf`

  doc.save(name)
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

  const [cerdaSeleccionadaId, setCerdaSeleccionadaId] = useState<number | null>(null)

  const [form, setForm] = useState<FormCerda>({
    arete: '',
    nombre: '',
    estado: 'VACIA',
    ubicacion_id: '',
    lote_id: '',
    fecha_nacimiento: '',
    peso_lb: '',
    notas: '',
    activa: true,
  })

  const cerdaSeleccionada = useMemo(() => {
    if (!cerdaSeleccionadaId) return null
    return cerdas.find((c) => Number(c.id) === Number(cerdaSeleccionadaId)) || null
  }, [cerdas, cerdaSeleccionadaId])

  const eventosCerdaSeleccionada = useMemo(() => {
    if (!cerdaSeleccionadaId) return []

    return eventos
      .filter((ev) => Number(ev.cerda_id) === Number(cerdaSeleccionadaId))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  }, [eventos, cerdaSeleccionadaId])

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

        supabase
          .from('granja_lotes')
          .select('id, codigo')
          .order('codigo', { ascending: true }),

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

      if (lotesRes.error) {
        console.error(lotesRes.error)
      }

      if (eventosRes.error) {
        console.error(eventosRes.error)
        alert(`Error cargando eventos: ${eventosRes.error.message}`)
        return
      }

      setCerdas((cerdasRes.data || []) as any)
      setUbicaciones((ubicacionesRes.data || []) as Ubicacion[])
      setLotes((lotesRes.data || []) as Lote[])
      setEventos((eventosRes.data || []) as any)
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
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return texto.includes(q)
    })
  }, [cerdas, busqueda, filtroEstado, mostrarInactivas])

  const llenarFormulario = (cerda: Cerda) => {
    setCerdaSeleccionadaId(cerda.id)

    setForm({
      arete: cerda.arete || '',
      nombre: cerda.nombre || '',
      estado: cerda.estado || 'VACIA',
      ubicacion_id: cerda.ubicacion_id ? String(cerda.ubicacion_id) : '',
      lote_id: cerda.lote_id ? String(cerda.lote_id) : '',
      fecha_nacimiento: cerda.fecha_nacimiento ? String(cerda.fecha_nacimiento).slice(0, 10) : '',
      peso_lb: cerda.peso_lb !== null && cerda.peso_lb !== undefined ? String(cerda.peso_lb) : '',
      notas: cerda.notas || '',
      activa: Boolean(cerda.activa),
    })
  }

  const limpiarSeleccion = () => {
    setCerdaSeleccionadaId(null)

    setForm({
      arete: '',
      nombre: '',
      estado: 'VACIA',
      ubicacion_id: '',
      lote_id: '',
      fecha_nacimiento: '',
      peso_lb: '',
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
        datos: {
          cambios: payload,
        },
        observaciones: 'Edición manual desde página de reportes de cerdas.',
        user_id: userId,
      })

      if (eventoError) {
        console.error(eventoError)
      }

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
        .update({
          activa: false,
          estado: 'BAJA',
          updated_at: new Date().toISOString(),
        })
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
        datos: {
          arete: cerdaSeleccionada.arete,
        },
        observaciones: motivo || 'Baja manual desde reportes',
        user_id: userId,
      })

      if (eventoError) {
        console.error(eventoError)
      }

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

    generarFichaCerdaPdf(cerdaSeleccionada, eventosCerdaSeleccionada)
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

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold mb-1">
                Buscar
              </label>
              <input
                className="border rounded p-2 w-full text-sm"
                placeholder="Arete, nombre, estado, ubicación, lote..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Estado
              </label>
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
                  <th className="p-2 text-left">Ubicación</th>
                  <th className="p-2 text-left">Activa</th>
                  <th className="p-2 text-left">Acción</th>
                </tr>
              </thead>

              <tbody>
                {cerdasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-gray-500">
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
                      <td className="p-2 text-xs">
                        {ubicacionTexto(cerda.granja_ubicaciones)}
                      </td>
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
              <span className="text-xs text-gray-500">
                ID: {cerdaSeleccionada.id}
              </span>
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
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, arete: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Nombre</label>
                    <input
                      className="border rounded p-2 w-full"
                      value={form.nombre}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Estado</label>
                    <select
                      className="border rounded p-2 w-full"
                      value={form.estado}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, estado: e.target.value }))
                      }
                    >
                      {ESTADOS_CERDA.map((estado) => (
                        <option key={estado} value={estado}>
                          {estado}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Activa</label>
                    <select
                      className="border rounded p-2 w-full"
                      value={form.activa ? 'SI' : 'NO'}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          activa: e.target.value === 'SI',
                        }))
                      }
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
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, ubicacion_id: e.target.value }))
                    }
                  >
                    <option value="">— Sin ubicación —</option>
                    {ubicaciones.map((ubicacion) => (
                      <option key={ubicacion.id} value={ubicacion.id}>
                        {ubicacion.codigo}
                        {ubicacion.nombre ? ` — ${ubicacion.nombre}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Lote</label>
                  <select
                    className="border rounded p-2 w-full"
                    value={form.lote_id}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lote_id: e.target.value }))
                    }
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
                    <label className="block text-xs font-semibold mb-1">
                      Fecha nacimiento
                    </label>
                    <input
                      type="date"
                      className="border rounded p-2 w-full"
                      value={form.fecha_nacimiento}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          fecha_nacimiento: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Peso lb</label>
                    <input
                      type="number"
                      className="border rounded p-2 w-full"
                      value={form.peso_lb}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, peso_lb: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Notas</label>
                  <textarea
                    className="border rounded p-2 w-full min-h-[80px]"
                    value={form.notas}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, notas: e.target.value }))
                    }
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
                <h3 className="font-semibold mb-2">Historial de eventos</h3>

                <div className="border rounded overflow-auto max-h-[300px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-200 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Fecha</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Resultado</th>
                        <th className="p-2 text-left">Ubicación</th>
                        <th className="p-2 text-left">Obs.</th>
                      </tr>
                    </thead>

                    <tbody>
                      {eventosCerdaSeleccionada.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-gray-500">
                            Esta cerda no tiene eventos registrados.
                          </td>
                        </tr>
                      ) : (
                        eventosCerdaSeleccionada.map((ev) => (
                          <tr key={ev.id} className="border-t">
                            <td className="p-2">{formatFecha(ev.fecha)}</td>
                            <td className="p-2">{ev.tipo}</td>
                            <td className="p-2">{ev.resultado || '—'}</td>
                            <td className="p-2">
                              {ubicacionTexto(ev.granja_ubicaciones)}
                            </td>
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