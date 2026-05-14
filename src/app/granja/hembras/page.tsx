'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type Lote = {
  id: number
  codigo: string
  fecha?: string | null
  tipo_origen?: string | null
}

type Cerda = {
  id: number
  arete: string
  nombre: string
  estado: string
  ubicacion_id: number | null
  lote_id: number | null
  fecha_nacimiento: string | null
  peso_lb: number | null
  notas: string | null
  activa: boolean
  created_at?: string
  updated_at?: string
  granja_ubicaciones?: { codigo: string; nombre: string | null } | null
  granja_lotes?: { codigo: string } | null
}

const ESTADOS = [
  'VACIA',
  'SERVIDA',
  'PRENADA',
  'LACTANDO',
  'DESTETADA',
  'ABORTO',
  'MUERTA',
  'BAJA',
] as const

const toNumOrNull = (v: any) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default function GranjaHembrasPage() {
  const [loading, setLoading] = useState(false)

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cerdas, setCerdas] = useState<Cerda[]>([])

  // filtros
  const [fArete, setFArete] = useState('')
  const [fNombre, setFNombre] = useState('')
  const [fEstado, setFEstado] = useState<string>('TODOS')
  const [fUbic, setFUbic] = useState<string>('')

  // form crear/editar
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
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
  const [guardando, setGuardando] = useState(false)

  const ubicMap = useMemo(() => {
    const m = new Map<number, Ubicacion>()
    ubicaciones.forEach((u) => m.set(u.id, u))
    return m
  }, [ubicaciones])

  const loteMap = useMemo(() => {
    const m = new Map<number, Lote>()
    lotes.forEach((l) => m.set(l.id, l))
    return m
  }, [lotes])

  const resetForm = () => {
    setEditId(null)
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

  const cargarDatos = async () => {
    setLoading(true)
    try {
      const [uRes, lRes, cRes] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .order('id', { ascending: false })
          .limit(300),
        supabase
          .from('granja_cerdas')
          .select(
            `
            id, arete, nombre, estado, ubicacion_id, lote_id,
            fecha_nacimiento, peso_lb, notas, activa, created_at, updated_at,
            granja_ubicaciones ( codigo, nombre ),
            granja_lotes ( codigo )
          `
          )
          .order('arete', { ascending: true }),
      ])

      if (uRes.error) console.error('Error ubicaciones', uRes.error)
      if (lRes.error) console.error('Error lotes', lRes.error)
      if (cRes.error) console.error('Error cerdas', cRes.error)

      setUbicaciones((uRes.data as Ubicacion[]) || [])
      setLotes((lRes.data as Lote[]) || [])
      setCerdas((cRes.data as any as Cerda[]) || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cerdasFiltradas = useMemo(() => {
    const a = fArete.trim().toLowerCase()
    const n = fNombre.trim().toLowerCase()
    const est = fEstado
    const ub = fUbic ? Number(fUbic) : null

    return cerdas.filter((c) => {
      if (a && !c.arete.toLowerCase().includes(a)) return false
      if (n && !(c.nombre || '').toLowerCase().includes(n)) return false
      if (est !== 'TODOS' && c.estado !== est) return false
      if (ub && c.ubicacion_id !== ub) return false
      return true
    })
  }, [cerdas, fArete, fNombre, fEstado, fUbic])

  const activarEdicion = (c: Cerda) => {
    setEditId(c.id)
    setForm({
      arete: c.arete || '',
      nombre: c.nombre || '',
      estado: c.estado || 'VACIA',
      ubicacion_id: c.ubicacion_id ? String(c.ubicacion_id) : '',
      lote_id: c.lote_id ? String(c.lote_id) : '',
      fecha_nacimiento: c.fecha_nacimiento || '',
      peso_lb: c.peso_lb != null ? String(c.peso_lb) : '',
      notas: c.notas || '',
      activa: !!c.activa,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const guardar = async () => {
    const arete = form.arete.trim()
    const nombre = form.nombre.trim()
    if (!arete) {
      alert('El arete es obligatorio.')
      return
    }
    if (!nombre) {
      alert('El nombre es obligatorio.')
      return
    }
    if (!ESTADOS.includes(form.estado as any)) {
      alert('Estado inválido.')
      return
    }

    const ubicacionId = form.ubicacion_id ? Number(form.ubicacion_id) : null
    const loteId = form.lote_id ? Number(form.lote_id) : null
    const pesoLb = toNumOrNull(form.peso_lb)

    if (pesoLb !== null && pesoLb < 0) {
      alert('Peso (lb) debe ser >= 0')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        arete,
        nombre,
        estado: form.estado,
        ubicacion_id: ubicacionId,
        lote_id: loteId,
        fecha_nacimiento: form.fecha_nacimiento || null,
        peso_lb: pesoLb,
        notas: form.notas.trim() ? form.notas.trim() : null,
        activa: !!form.activa,
        updated_at: new Date().toISOString(),
      }

      if (editId) {
        const { error } = await supabase
          .from('granja_cerdas')
          .update(payload)
          .eq('id', editId)

        if (error) {
          console.error(error)
          alert('No se pudo actualizar la cerda.')
          return
        }
        alert('Cerda actualizada.')
      } else {
        const { error } = await supabase.from('granja_cerdas').insert(payload)
        if (error) {
          console.error(error)
          // típico: arete único
          alert(`No se pudo crear la cerda. ${error.message}`)
          return
        }
        alert('Cerda creada.')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  const nombreUbic = (id: number | null) => {
    if (!id) return '—'
    const u = ubicMap.get(id)
    if (!u) return String(id)
    return `${u.codigo}${u.nombre ? ` — ${u.nombre}` : ''}`
  }

  const nombreLote = (id: number | null) => {
    if (!id) return '—'
    const l = loteMap.get(id)
    return l ? l.codigo : String(id)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">Hembras — Cerdas</h1>
        {loading && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Registro y control de cerdas (arete único). Peso en <b>lb</b>. Desde aquí se conectan eventos
        como monta/inseminación, revisión 21 días, parto y destete.
      </p>

      <div className="flex justify-end mb-4">
        <Link
          href="/granja"
          className="text-sm px-3 py-2 rounded bg-slate-700 hover:bg-slate-800 text-white"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      {/* Form */}
      <div className="border rounded-lg p-4 bg-white shadow-sm mb-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">
            {editId ? `Editar cerda #${editId}` : 'Nueva cerda'}
          </h2>
          {editId && (
            <button
              onClick={resetForm}
              className="text-sm px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Arete (único)</label>
            <input
              className="border p-2 rounded w-full"
              value={form.arete}
              onChange={(e) => setForm({ ...form, arete: e.target.value })}
              placeholder="Ej: AR1077"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Nombre</label>
            <input
              className="border p-2 rounded w-full"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: CERDA 1077"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Estado</label>
            <select
              className="border p-2 rounded w-full"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
            >
              {ESTADOS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-600">Activa</label>
            <div className="border p-2 rounded w-full flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.activa}
                onChange={(e) => setForm({ ...form, activa: e.target.checked })}
              />
              <span className="text-sm">{form.activa ? 'Sí' : 'No'}</span>
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Ubicación</label>
            <select
              className="border p-2 rounded w-full"
              value={form.ubicacion_id}
              onChange={(e) => setForm({ ...form, ubicacion_id: e.target.value })}
            >
              <option value="">— Selecciona —</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Lote (opcional)</label>
            <select
              className="border p-2 rounded w-full"
              value={form.lote_id}
              onChange={(e) => setForm({ ...form, lote_id: e.target.value })}
            >
              <option value="">— Sin lote —</option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Fecha nacimiento (opcional)</label>
            <input
              type="date"
              className="border p-2 rounded w-full"
              value={form.fecha_nacimiento}
              onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Peso (lb) (opcional)</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={form.peso_lb}
              onChange={(e) => setForm({ ...form, peso_lb: e.target.value })}
              placeholder="Ej: 420"
            />
          </div>

          <div className="md:col-span-6">
            <label className="text-xs text-gray-600">Notas (opcional)</label>
            <textarea
              className="border p-2 rounded w-full"
              rows={2}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Observaciones generales de la cerda…"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={guardar}
            disabled={guardando}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
          >
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear cerda'}
          </button>
          <button
            onClick={resetForm}
            type="button"
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-sm"
          >
            Limpiar
          </button>
        </div>

        <div className="mt-3 text-[11px] text-gray-500">
          Nota: el arete es único. Estados <b>MUERTA</b> y <b>BAJA</b> son para historial; “activa”
          sirve para ocultar/mostrar en trabajo diario.
        </div>
      </div>

      {/* Filtros */}
      <div className="border rounded-lg p-4 bg-white shadow-sm mb-3">
        <h2 className="font-semibold mb-3">Búsqueda</h2>
        <div className="grid md:grid-cols-5 gap-2">
          <input
            className="border p-2 rounded"
            placeholder="Arete…"
            value={fArete}
            onChange={(e) => setFArete(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Nombre…"
            value={fNombre}
            onChange={(e) => setFNombre(e.target.value)}
          />
          <select
            className="border p-2 rounded"
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value)}
          >
            <option value="TODOS">Todos los estados</option>
            {ESTADOS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>

          <select
            className="border p-2 rounded"
            value={fUbic}
            onChange={(e) => setFUbic(e.target.value)}
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo} {u.nombre ? `— ${u.nombre}` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setFArete('')
              setFNombre('')
              setFEstado('TODOS')
              setFUbic('')
            }}
            className="bg-slate-200 hover:bg-slate-300 px-3 py-2 rounded"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200 sticky top-0">
            <tr>
              <th className="p-2 text-left">Arete</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Ubicación</th>
              <th className="p-2 text-left">Lote</th>
              <th className="p-2 text-right">Peso (lb)</th>
              <th className="p-2 text-center">Activa</th>
              <th className="p-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cerdasFiltradas.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-mono">{c.arete}</td>
                <td className="p-2">{c.nombre}</td>
                <td className="p-2">{c.estado}</td>
                <td className="p-2">{nombreUbic(c.ubicacion_id)}</td>
                <td className="p-2">{nombreLote(c.lote_id)}</td>
                <td className="p-2 text-right">
                  {c.peso_lb != null ? c.peso_lb : '—'}
                </td>
                <td className="p-2 text-center">{c.activa ? 'Sí' : 'No'}</td>
                <td className="p-2">
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button
                      onClick={() => activarEdicion(c)}
                      className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1 rounded text-xs"
                    >
                      Editar
                    </button>

                    {/* siguientes pages (los haremos después) */}
                    <Link
                      href={`/granja/hembras/eventos?cerda_id=${c.id}`}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Eventos
                    </Link>

                    <Link
                      href={`/granja/hembras/ficha?cerda_id=${c.id}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs"
                    >
                      Ficha
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {cerdasFiltradas.length === 0 && (
              <tr>
                <td className="p-3 text-gray-500" colSpan={8}>
                  No hay resultados con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">
        Siguiente paso: página de <b>Eventos</b> para registrar <b>MONTA / INSEMINACIÓN</b> y generar
        recordatorios (revisión 21 días y parto ~115 días).
      </div>
    </div>
  )
}