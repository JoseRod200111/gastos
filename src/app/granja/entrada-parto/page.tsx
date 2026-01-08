'use client'

import { useCallback, useEffect, useState } from 'react'
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
  fecha: string
  tipo_origen: string
}

type Parto = {
  id: number
  fecha: string
  ubicacion_id: number
  lote_id: number | null
  cerda_id: string
  nacidos_vivos: number
  nacidos_muertos: number
  momias: number
  peso_camda_kg: number | null
  hembras: number
  machos: number
}

export default function GranjaEntradaPartoPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [partosRecientes, setPartosRecientes] = useState<Parto[]>([])
  const [cerdas, setCerdas] = useState<string[]>([]) // lista para dropdown
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState({
    fecha: '',
    ubicacion_id: '',
    lote_id: '',
    nuevo_lote_codigo: '',
    cerda_seleccion: 'NUEVA',
    cerda_id: '',
    nacidos_vivos: '',
    nacidos_muertos: '',
    momias: '',
    peso_camda_kg: '',
    hembras: '',
    machos: '',
    observaciones: '',
  })

  const resetForm = () =>
    setForm({
      fecha: '',
      ubicacion_id: '',
      lote_id: '',
      nuevo_lote_codigo: '',
      cerda_seleccion: 'NUEVA',
      cerda_id: '',
      nacidos_vivos: '',
      nacidos_muertos: '',
      momias: '',
      peso_camda_kg: '',
      hembras: '',
      machos: '',
      observaciones: '',
    })

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: ubicData, error: ubicError },
        { data: loteData, error: loteError },
        { data: partoData, error: partoError },
      ] = await Promise.all([
        supabase
          .from('granja_ubicaciones')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('codigo', { ascending: true }),
        supabase
          .from('granja_lotes')
          .select('id, codigo, fecha, tipo_origen')
          .eq('tipo_origen', 'PARTO')
          .order('fecha', { ascending: false })
          .limit(50),
        supabase
          .from('granja_partos')
          .select(
            'id, fecha, ubicacion_id, lote_id, cerda_id, nacidos_vivos, nacidos_muertos, momias, peso_camda_kg, hembras, machos'
          )
          .order('fecha', { ascending: false })
          .limit(20),
      ])

      if (ubicError) console.error('Error cargando ubicaciones', ubicError)
      if (loteError) console.error('Error cargando lotes', loteError)
      if (partoError) console.error('Error cargando partos', partoError)

      if (ubicData) setUbicaciones(ubicData as Ubicacion[])
      if (loteData) setLotes(loteData as Lote[])
      if (partoData) {
        const lista = partoData as Parto[]
        setPartosRecientes(lista)

        // generar lista de cerdas para el dropdown (distintas y ordenadas)
        const distinct = Array.from(
          new Set(
            lista
              .map((p) => p.cerda_id)
              .filter((c) => c && c.trim().length > 0)
          )
        ).sort()
        setCerdas(distinct)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const findUbicacion = (id: number) =>
    ubicaciones.find((u) => u.id === id)

  const findLote = (id: number | null) =>
    lotes.find((l) => l.id === id)

  const manejarCambioCerda = (value: string) => {
    if (value === 'NUEVA') {
      setForm((f) => ({
        ...f,
        cerda_seleccion: 'NUEVA',
        cerda_id: '',
      }))
    } else {
      setForm((f) => ({
        ...f,
        cerda_seleccion: value,
        cerda_id: value,
      }))
    }
  }

  const guardarParto = async () => {
    if (!form.fecha || !form.ubicacion_id) {
      alert('Fecha y ubicación son obligatorias.')
      return
    }

    const cerdaFinal =
      form.cerda_seleccion === 'NUEVA'
        ? form.cerda_id.trim()
        : form.cerda_seleccion

    if (!cerdaFinal) {
      alert('Debe indicar la cerda.')
      return
    }

    if (!form.nacidos_vivos) {
      alert('Debe indicar nacidos vivos.')
      return
    }

    setGuardando(true)
    try {
      // 1) determinar / crear lote (evitando 409 por duplicado)
      let loteId: number | null = form.lote_id ? Number(form.lote_id) : null

      if (!loteId) {
        const codigoBase =
          form.nuevo_lote_codigo.trim() ||
          `P-${form.fecha.replace(/-/g, '')}`

        // buscar si ya existe un lote con este código
        const {
          data: loteExistente,
          error: loteExistError,
        } = await supabase
          .from('granja_lotes')
          .select('id')
          .eq('codigo', codigoBase)
          .maybeSingle()

        if (loteExistError) {
          console.error('Error buscando lote', loteExistError)
          alert('No se pudo buscar el lote.')
          return
        }

        if (loteExistente) {
          loteId = loteExistente.id
        } else {
          const {
            data: loteInsertado,
            error: loteInsertError,
          } = await supabase
            .from('granja_lotes')
            .insert({
              codigo: codigoBase,
              tipo_origen: 'PARTO',
              fecha: form.fecha,
              observaciones: form.observaciones || null,
            })
            .select('id')
            .single()

          if (loteInsertError || !loteInsertado) {
            console.error('Error creando lote', loteInsertError)
            alert('No se pudo crear el lote.')
            return
          }

          loteId = loteInsertado.id
        }
      }

      const nacV = Number(form.nacidos_vivos) || 0
      const nacM = Number(form.nacidos_muertos) || 0
      const mom = Number(form.momias) || 0
      const totalCerdos = nacV + nacM + mom

      const hembras = form.hembras ? Number(form.hembras) : 0
      const machos = form.machos ? Number(form.machos) : 0

      // 2) insertar parto
      const {
        data: partoInsertado,
        error: partoErr,
      } = await supabase
        .from('granja_partos')
        .insert({
          fecha: form.fecha,
          ubicacion_id: Number(form.ubicacion_id),
          lote_id: loteId,
          cerda_id: cerdaFinal,
          nacidos_vivos: nacV,
          nacidos_muertos: nacM,
          momias: mom,
          peso_camda_kg: form.peso_camda_kg
            ? Number(form.peso_camda_kg)
            : null,
          hembras,
          machos,
          observaciones: form.observaciones || null,
        })
        .select('id')
        .single()

      if (partoErr || !partoInsertado) {
        console.error('Error guardando parto', partoErr)
        alert('No se pudo guardar el parto.')
        return
      }

      // 3) movimiento de inventario (entrada por parto)
      const { error: movErr } = await supabase
        .from('granja_movimientos')
        .insert({
          ubicacion_id: Number(form.ubicacion_id),
          tipo: 'ENTRADA_PARTO',
          lote_id: loteId,
          cantidad: totalCerdos,
          hembras,
          machos,
          peso_total_kg: form.peso_camda_kg
            ? Number(form.peso_camda_kg)
            : null,
          referencia_tabla: 'granja_partos',
          referencia_id: partoInsertado.id,
          observaciones: 'Entrada de cerdos por parto',
        })

      if (movErr) {
        console.error('Error registrando movimiento', movErr)
        alert(
          'Parto guardado, pero hubo un error registrando el movimiento de inventario.'
        )
      } else {
        alert('Parto registrado correctamente.')
      }

      resetForm()
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">
            Granja — Entrada por parto
          </h1>
          <p className="text-xs text-gray-600">
            Registrar camadas y actualizar el inventario por ubicación.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* -------- formulario -------- */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Nuevo parto</h2>

          {loading && (
            <p className="text-xs text-gray-500 mb-2">
              Cargando catálogos…
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Fecha
              </label>
              <input
                type="date"
                className="border rounded w-full p-2 text-sm"
                value={form.fecha}
                onChange={(e) =>
                  setForm({ ...form, fecha: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Ubicación (tramo o jaula)
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.ubicacion_id}
                onChange={(e) =>
                  setForm({ ...form, ubicacion_id: e.target.value })
                }
              >
                <option value="">Seleccione una ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                    {u.nombre ? ` — ${u.nombre}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* lote existente */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Lote existente
              </label>
              <select
                className="border rounded w-full p-2 text-sm"
                value={form.lote_id}
                onChange={(e) =>
                  setForm({ ...form, lote_id: e.target.value })
                }
              >
                <option value="">Crear nuevo lote</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} ({l.fecha})
                  </option>
                ))}
              </select>
            </div>

            {/* nuevo lote */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Código de nuevo lote
              </label>
              <input
                className="border rounded w-full p-2 text-sm"
                placeholder="Si se deja vacío se genera P-AAAAMMDD"
                value={form.nuevo_lote_codigo}
                onChange={(e) =>
                  setForm({ ...form, nuevo_lote_codigo: e.target.value })
                }
              />
            </div>

            {/* cerda */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Cerda (arete o código)
              </label>
              <select
                className="border rounded w-full p-2 text-sm mb-1"
                value={form.cerda_seleccion}
                onChange={(e) => manejarCambioCerda(e.target.value)}
              >
                <option value="NUEVA">Escribir nueva cerda</option>
                {cerdas.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {form.cerda_seleccion === 'NUEVA' && (
                <input
                  className="border rounded w-full p-2 text-sm"
                  placeholder="Código de la cerda"
                  value={form.cerda_id}
                  onChange={(e) =>
                    setForm({ ...form, cerda_id: e.target.value })
                  }
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Nacidos vivos
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.nacidos_vivos}
                onChange={(e) =>
                  setForm({ ...form, nacidos_vivos: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Nacidos muertos
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.nacidos_muertos}
                onChange={(e) =>
                  setForm({ ...form, nacidos_muertos: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Momias
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.momias}
                onChange={(e) =>
                  setForm({ ...form, momias: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Peso camada (kg)
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.peso_camda_kg}
                onChange={(e) =>
                  setForm({ ...form, peso_camda_kg: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Hembras
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.hembras}
                onChange={(e) =>
                  setForm({ ...form, hembras: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">
                Machos
              </label>
              <input
                type="number"
                className="border rounded w-full p-2 text-sm"
                value={form.machos}
                onChange={(e) =>
                  setForm({ ...form, machos: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1">
                Observaciones
              </label>
              <textarea
                className="border rounded w-full p-2 text-sm"
                rows={3}
                value={form.observaciones}
                onChange={(e) =>
                  setForm({ ...form, observaciones: e.target.value })
                }
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={guardarParto}
              disabled={guardando}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {guardando ? 'Guardando…' : 'Guardar parto'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 px-4 py-2 rounded text-sm"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* -------- partos recientes -------- */}
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Partos recientes</h2>
          {partosRecientes.length === 0 ? (
            <p className="text-sm text-gray-600">
              Aún no hay partos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Ubicación</th>
                    <th className="p-2 text-left">Lote</th>
                    <th className="p-2 text-left">Cerda</th>
                    <th className="p-2 text-right">Vivos</th>
                    <th className="p-2 text-right">Muertos</th>
                    <th className="p-2 text-right">Momias</th>
                  </tr>
                </thead>
                <tbody>
                  {partosRecientes.map((p) => {
                    const u = findUbicacion(p.ubicacion_id)
                    const l = findLote(p.lote_id)
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">
                          {p.fecha || '—'}
                        </td>
                        <td className="p-2">
                          {u
                            ? `${u.codigo}${
                                u.nombre ? ` — ${u.nombre}` : ''
                              }`
                            : p.ubicacion_id}
                        </td>
                        <td className="p-2">
                          {l ? l.codigo : '—'}
                        </td>
                        <td className="p-2">{p.cerda_id}</td>
                        <td className="p-2 text-right">
                          {p.nacidos_vivos}
                        </td>
                        <td className="p-2 text-right">
                          {p.nacidos_muertos}
                        </td>
                        <td className="p-2 text-right">
                          {p.momias}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
