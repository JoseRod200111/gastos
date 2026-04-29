'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type ProductoRel = {
  nombre: string | null
  sku: string | null
  unidad: string | null
} | null

type Movimiento = {
  id: number
  producto_id: number
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  cantidad: number
  created_at: string
  grupo_manual_id: number | null
  observaciones: string | null
  user_id: string | null
  erogacion_detalle_id: number | null
  venta_detalle_id: number | null
  productos?: ProductoRel
}

type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
}

type GrupoManual = {
  id: number
  created_at: string
  user_id: string | null
  observaciones: string | null
}

type Profile = {
  id: string
  email: string | null
}

function asObj<T>(rel: any): T | null {
  if (rel == null) return null
  if (Array.isArray(rel)) return (rel[0] ?? null) as T | null
  return rel as T
}

function qNum(n: any) {
  return Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fechaHora(valor: string | null | undefined) {
  if (!valor) return '—'

  try {
    return new Date(valor).toLocaleString('es-GT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return valor
  }
}

function usuarioCorto(id: string | null | undefined) {
  if (!id) return '—'
  return `${id.slice(0, 8)}...`
}

export default function ReporteMovimientosManualesPage() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [grupos, setGrupos] = useState<Record<number, GrupoManual>>({})
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})

  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    producto_id: '',
    tipo: '',
    grupo_manual_id: '',
    movimiento_id: '',
    usuario: '',
    texto: '',
  })

  useEffect(() => {
    cargarCatalogos()
    cargarReporte()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarCatalogos() {
    const { data, error } = await supabase
      .from('productos')
      .select('id,nombre,sku,unidad')
      .order('nombre', { ascending: true })

    if (!error) setProductos(data || [])
  }

  async function cargarReporte() {
    setLoading(true)
    setMsg('')

    try {
      let query = supabase
        .from('inventario_movimientos')
        .select(`
          id,
          producto_id,
          tipo,
          cantidad,
          created_at,
          grupo_manual_id,
          observaciones,
          user_id,
          erogacion_detalle_id,
          venta_detalle_id,
          productos (
            nombre,
            sku,
            unidad
          )
        `)
        .is('erogacion_detalle_id', null)
        .is('venta_detalle_id', null)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (filtros.movimiento_id.trim()) {
        query = query.eq('id', Number(filtros.movimiento_id))
      }

      if (filtros.producto_id.trim()) {
        query = query.eq('producto_id', Number(filtros.producto_id))
      }

      if (filtros.tipo.trim()) {
        query = query.eq('tipo', filtros.tipo)
      }

      if (filtros.grupo_manual_id.trim()) {
        query = query.eq('grupo_manual_id', Number(filtros.grupo_manual_id))
      }

      if (filtros.desde) {
        query = query.gte('created_at', `${filtros.desde}T00:00:00`)
      }

      if (filtros.hasta) {
        query = query.lte('created_at', `${filtros.hasta}T23:59:59`)
      }

      const { data, error } = await query

      if (error) throw error

      const normalizados: Movimiento[] = (data || []).map((row: any) => ({
        id: Number(row.id),
        producto_id: Number(row.producto_id),
        tipo: row.tipo,
        cantidad: Number(row.cantidad || 0),
        created_at: row.created_at,
        grupo_manual_id: row.grupo_manual_id == null ? null : Number(row.grupo_manual_id),
        observaciones: row.observaciones ?? null,
        user_id: row.user_id ?? null,
        erogacion_detalle_id: row.erogacion_detalle_id ?? null,
        venta_detalle_id: row.venta_detalle_id ?? null,
        productos: asObj<ProductoRel>(row.productos),
      }))

      setMovimientos(normalizados)
      await cargarGruposYUsuarios(normalizados)
    } catch (err: any) {
      console.error(err)
      setMsg(err.message ?? 'Error al cargar reporte.')
      setMovimientos([])
    } finally {
      setLoading(false)
    }
  }

  async function cargarGruposYUsuarios(movs: Movimiento[]) {
    const grupoIds = Array.from(
      new Set(
        movs
          .map((m) => m.grupo_manual_id)
          .filter((id): id is number => id !== null && id !== undefined)
      )
    )

    const gruposMap: Record<number, GrupoManual> = {}

    if (grupoIds.length > 0) {
      const { data: gruposData, error: gruposErr } = await supabase
        .from('inventario_movimiento_grupos')
        .select('id, created_at, user_id, observaciones')
        .in('id', grupoIds)

      if (!gruposErr) {
        for (const g of gruposData || []) {
          gruposMap[Number(g.id)] = {
            id: Number(g.id),
            created_at: g.created_at,
            user_id: g.user_id ?? null,
            observaciones: g.observaciones ?? null,
          }
        }
      }
    }

    setGrupos(gruposMap)

    const userIds = Array.from(
      new Set(
        [
          ...movs.map((m) => m.user_id),
          ...Object.values(gruposMap).map((g) => g.user_id),
        ].filter((id): id is string => Boolean(id))
      )
    )

    const profilesMap: Record<string, Profile> = {}

    if (userIds.length > 0) {
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id,email')
        .in('id', userIds)

      if (!profilesErr) {
        for (const p of profilesData || []) {
          profilesMap[p.id] = {
            id: p.id,
            email: p.email ?? null,
          }
        }
      }
    }

    setProfiles(profilesMap)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setFiltros((prev) => ({ ...prev, [name]: value }))
  }

  function limpiarFiltros() {
    setFiltros({
      desde: '',
      hasta: '',
      producto_id: '',
      tipo: '',
      grupo_manual_id: '',
      movimiento_id: '',
      usuario: '',
      texto: '',
    })
  }

  function usuarioMovimiento(m: Movimiento) {
    const grupo = m.grupo_manual_id ? grupos[m.grupo_manual_id] : null
    const uid = m.user_id || grupo?.user_id || null
    return profiles[uid || '']?.email || usuarioCorto(uid)
  }

  function obsGrupo(m: Movimiento) {
    if (!m.grupo_manual_id) return '—'
    return grupos[m.grupo_manual_id]?.observaciones || '—'
  }

  const movimientosFiltrados = useMemo(() => {
    const usuarioFiltro = filtros.usuario.trim().toLowerCase()
    const textoFiltro = filtros.texto.trim().toLowerCase()

    return movimientos.filter((m) => {
      const producto = m.productos?.nombre || ''
      const sku = m.productos?.sku || ''
      const unidad = m.productos?.unidad || ''
      const usuario = usuarioMovimiento(m)
      const obsMov = m.observaciones || ''
      const obsG = obsGrupo(m)

      if (usuarioFiltro && !usuario.toLowerCase().includes(usuarioFiltro)) {
        return false
      }

      if (textoFiltro) {
        const combinado = [
          m.id,
          m.grupo_manual_id,
          producto,
          sku,
          unidad,
          m.tipo,
          m.cantidad,
          usuario,
          obsMov,
          obsG,
        ]
          .join(' ')
          .toLowerCase()

        if (!combinado.includes(textoFiltro)) return false
      }

      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos, filtros.usuario, filtros.texto, grupos, profiles])

  const resumen = useMemo(() => {
    const entradas = movimientosFiltrados
      .filter((m) => m.tipo === 'ENTRADA')
      .reduce((sum, m) => sum + Number(m.cantidad || 0), 0)

    const salidas = movimientosFiltrados
      .filter((m) => m.tipo === 'SALIDA')
      .reduce((sum, m) => sum + Number(m.cantidad || 0), 0)

    return {
      cantidadMovimientos: movimientosFiltrados.length,
      entradas,
      salidas,
      neto: entradas - salidas,
    }
  }, [movimientosFiltrados])

  function imprimirReporte() {
    setTimeout(() => {
      window.print()
    }, 100)
  }

  return (
    <div className="p-4 max-w-7xl mx-auto reporte-print-area">
      <style>{`
        @page {
          size: letter landscape;
          margin: 5mm;
        }

        .only-print {
          display: none;
        }

        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }

          .no-print {
            display: none !important;
          }

          .only-print {
            display: block !important;
          }

          .reporte-print-area {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-title {
            text-align: center !important;
            margin: 0 0 5px 0 !important;
            padding: 0 !important;
          }

          .print-title h1 {
            font-size: 16px !important;
            line-height: 1.1 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-title p {
            font-size: 9px !important;
            margin: 2px 0 0 0 !important;
            padding: 0 !important;
          }

          .screen-summary {
            display: none !important;
          }

          .print-summary-compact {
            display: table !important;
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 0 0 6px 0 !important;
            font-size: 9px !important;
          }

          .print-summary-compact th,
          .print-summary-compact td {
            border: 1px solid #222 !important;
            padding: 3px 5px !important;
            text-align: center !important;
            line-height: 1.15 !important;
          }

          .print-summary-compact th {
            background: #f1f1f1 !important;
            font-weight: 700 !important;
          }

          .print-summary-compact .entrada {
            color: #008a3d !important;
            font-weight: 700 !important;
          }

          .print-summary-compact .salida {
            color: #c00000 !important;
            font-weight: 700 !important;
          }

          .print-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-card-header {
            margin: 0 0 4px 0 !important;
            padding: 0 !important;
          }

          .print-card h2 {
            font-size: 11px !important;
            line-height: 1.1 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .overflow-x-auto {
            overflow: visible !important;
          }

          .print-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 7.8px !important;
            line-height: 1.18 !important;
          }

          .print-table th,
          .print-table td {
            padding: 2.5px 2px !important;
            border: 1px solid #222 !important;
            vertical-align: top !important;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
            white-space: normal !important;
          }

          .print-table th {
            background: #f1f1f1 !important;
            font-weight: 700 !important;
          }

          .print-table th:nth-child(1),
          .print-table td:nth-child(1) {
            width: 5%;
          }

          .print-table th:nth-child(2),
          .print-table td:nth-child(2) {
            width: 4%;
          }

          .print-table th:nth-child(3),
          .print-table td:nth-child(3) {
            width: 10%;
          }

          .print-table th:nth-child(4),
          .print-table td:nth-child(4) {
            width: 14%;
          }

          .print-table th:nth-child(5),
          .print-table td:nth-child(5) {
            width: 18%;
          }

          .print-table th:nth-child(6),
          .print-table td:nth-child(6) {
            width: 5%;
          }

          .print-table th:nth-child(7),
          .print-table td:nth-child(7) {
            width: 6%;
          }

          .print-table th:nth-child(8),
          .print-table td:nth-child(8) {
            width: 7%;
          }

          .print-table th:nth-child(9),
          .print-table td:nth-child(9) {
            width: 7%;
            text-align: right !important;
          }

          .print-table th:nth-child(10),
          .print-table td:nth-child(10) {
            width: 12%;
          }

          .print-table th:nth-child(11),
          .print-table td:nth-child(11) {
            width: 12%;
          }

          .print-table tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .tipo-entrada {
            color: #008a3d !important;
            font-weight: 700 !important;
          }

          .tipo-salida {
            color: #c00000 !important;
            font-weight: 700 !important;
          }

          .tipo-ajuste {
            color: #222 !important;
            font-weight: 700 !important;
          }
        }
      `}</style>

      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-10" />
          <div>
            <h1 className="text-2xl font-bold">Reporte de Movimientos Manuales</h1>
            <p className="text-sm text-gray-500">
              Consulta movimientos manuales de inventario por fecha, producto, usuario, grupo o ID.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventario"
            className="bg-gray-700 text-white px-4 py-2 rounded"
          >
            ⟵ Volver a Inventario
          </Link>

          <Link
            href="/menu"
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            Menú Principal
          </Link>
        </div>
      </div>

      <div className="only-print print-title">
        <h1>Reporte de Movimientos Manuales de Inventario</h1>
        <p>Generado: {fechaHora(new Date().toISOString())}</p>
      </div>

      {msg && (
        <div className="mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded no-print">
          {msg}
        </div>
      )}

      <section className="border rounded p-4 mb-5 bg-white no-print">
        <h2 className="font-semibold mb-3">Filtros de búsqueda</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="date"
            name="desde"
            value={filtros.desde}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <input
            type="date"
            name="hasta"
            value={filtros.hasta}
            onChange={handleChange}
            className="border p-2 rounded"
          />

          <select
            name="producto_id"
            value={filtros.producto_id}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="">Todos los productos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>

          <select
            name="tipo"
            value={filtros.tipo}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="">Todos los tipos</option>
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
            <option value="AJUSTE">AJUSTE</option>
          </select>

          <input
            name="grupo_manual_id"
            value={filtros.grupo_manual_id}
            onChange={handleChange}
            placeholder="Grupo manual ID"
            className="border p-2 rounded"
            inputMode="numeric"
          />

          <input
            name="movimiento_id"
            value={filtros.movimiento_id}
            onChange={handleChange}
            placeholder="ID movimiento"
            className="border p-2 rounded"
            inputMode="numeric"
          />

          <input
            name="usuario"
            value={filtros.usuario}
            onChange={handleChange}
            placeholder="Usuario / correo"
            className="border p-2 rounded"
          />

          <input
            name="texto"
            value={filtros.texto}
            onChange={handleChange}
            placeholder="Buscar texto general"
            className="border p-2 rounded"
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={cargarReporte}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Buscar
          </button>

          <button
            onClick={() => {
              limpiarFiltros()
              setTimeout(() => cargarReporte(), 0)
            }}
            disabled={loading}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Limpiar
          </button>

          <button
            onClick={imprimirReporte}
            disabled={loading}
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            Imprimir reporte
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5 screen-summary">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Movimientos</div>
          <div className="text-lg font-semibold">{resumen.cantidadMovimientos}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total entradas</div>
          <div className="text-lg font-semibold text-green-700">{qNum(resumen.entradas)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total salidas</div>
          <div className="text-lg font-semibold text-red-700">{qNum(resumen.salidas)}</div>
        </div>

        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Neto</div>
          <div className="text-lg font-semibold">{qNum(resumen.neto)}</div>
        </div>
      </section>

      <table className="only-print print-summary-compact">
        <thead>
          <tr>
            <th>Movimientos</th>
            <th>Total entradas</th>
            <th>Total salidas</th>
            <th>Neto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{resumen.cantidadMovimientos}</td>
            <td className="entrada">{qNum(resumen.entradas)}</td>
            <td className="salida">{qNum(resumen.salidas)}</td>
            <td>{qNum(resumen.neto)}</td>
          </tr>
        </tbody>
      </table>

      <section className="border rounded p-4 bg-white print-card">
        <div className="flex items-center justify-between mb-3 print-card-header">
          <h2 className="font-semibold">Datos del reporte</h2>
          <span className="text-xs text-gray-500 no-print">
            {loading ? 'Cargando...' : `${movimientosFiltrados.length} resultado(s)`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm print-table">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border text-left">ID Mov.</th>
                <th className="p-2 border text-left">Grupo</th>
                <th className="p-2 border text-left">Fecha y hora</th>
                <th className="p-2 border text-left">Usuario</th>
                <th className="p-2 border text-left">Producto</th>
                <th className="p-2 border text-left">SKU</th>
                <th className="p-2 border text-left">Unidad</th>
                <th className="p-2 border text-left">Tipo</th>
                <th className="p-2 border text-right">Cantidad</th>
                <th className="p-2 border text-left">Obs. movimiento</th>
                <th className="p-2 border text-left">Obs. grupo</th>
              </tr>
            </thead>

            <tbody>
              {movimientosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-4 text-center text-gray-500">
                    No hay movimientos con esos filtros.
                  </td>
                </tr>
              ) : (
                movimientosFiltrados.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 border">#{m.id}</td>

                    <td className="p-2 border">
                      {m.grupo_manual_id ? `#${m.grupo_manual_id}` : '—'}
                    </td>

                    <td className="p-2 border">{fechaHora(m.created_at)}</td>

                    <td className="p-2 border">{usuarioMovimiento(m)}</td>

                    <td className="p-2 border">{m.productos?.nombre || '—'}</td>

                    <td className="p-2 border">{m.productos?.sku || '—'}</td>

                    <td className="p-2 border">{m.productos?.unidad || '—'}</td>

                    <td className="p-2 border">
                      <span
                        className={
                          m.tipo === 'ENTRADA'
                            ? 'tipo-entrada text-green-700 font-semibold'
                            : m.tipo === 'SALIDA'
                              ? 'tipo-salida text-red-700 font-semibold'
                              : 'tipo-ajuste font-semibold'
                        }
                      >
                        {m.tipo}
                      </span>
                    </td>

                    <td className="p-2 border text-right">{qNum(m.cantidad)}</td>

                    <td className="p-2 border">{m.observaciones || '—'}</td>

                    <td className="p-2 border">{obsGrupo(m)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
