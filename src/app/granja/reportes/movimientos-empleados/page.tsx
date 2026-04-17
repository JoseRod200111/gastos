'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Seccion = 'TODOS' | 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES'

type MovItem = {
  ts: string // ISO
  seccion: 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES'
  accion: string
  usuario: string
  referencia: string
  detalle: string
}

const toISO = (d: any) => {
  if (!d) return ''
  try {
    return new Date(d).toISOString()
  } catch {
    return ''
  }
}

const clamp = (s: string) => (s || '').trim()

const inicioDia = (yyyyMMdd: string) => `${yyyyMMdd}T00:00:00.000Z`
const finDia = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

const fmtFecha = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 19)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

export default function MovimientosEmpleadosPage() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<MovItem[]>([])

  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    usuario: '',
    seccion: 'TODOS' as Seccion,
  })

  // defaults de fechas (últimos 7 días aprox)
  useEffect(() => {
    const today = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    const hasta = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const d2 = new Date(today)
    d2.setDate(d2.getDate() - 7)
    const desde = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`
    setFiltros((p) => ({ ...p, desde, hasta }))
  }, [])

  const filtraPorUsuario = (u: string, filtro: string) => {
    const f = clamp(filtro).toLowerCase()
    if (!f) return true
    return (u || '').toLowerCase().includes(f)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const desdeISO = filtros.desde ? inicioDia(filtros.desde) : ''
      const hastaISO = filtros.hasta ? finDia(filtros.hasta) : ''

      const want = filtros.seccion
      const filtroUsuario = clamp(filtros.usuario)

      const out: MovItem[] = []

      // =========================
      // GRANJA: granja_movimientos
      // =========================
      if (want === 'TODOS' || want === 'GRANJA') {
        let q = supabase
          .from('granja_movimientos')
          .select(
            'id, fecha, tipo, ubicacion_id, cantidad, referencia_tabla, referencia_id, user_id, observaciones, created_at'
          )
          .order('fecha', { ascending: false })
          .limit(500)

        if (desdeISO) q = q.gte('fecha', desdeISO)
        if (hastaISO) q = q.lte('fecha', hastaISO)

        const { data, error } = await q
        if (error) {
          console.error('Error granja_movimientos', error)
        } else {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (!filtraPorUsuario(usuario, filtroUsuario)) continue

            const ts = toISO(r.fecha || r.created_at) || String(r.fecha || r.created_at || '')
            out.push({
              ts,
              seccion: 'GRANJA',
              accion: String(r.tipo || 'MOVIMIENTO'),
              usuario,
              referencia: `${r.referencia_tabla || 'granja_movimientos'}${r.referencia_id ? `#${r.referencia_id}` : `#${r.id}`}`,
              detalle: `Ubicación ${r.ubicacion_id ?? '—'} · Cant ${r.cantidad ?? '—'}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
            })
          }
        }
      }

      // =========================
      // VEHÍCULOS: viajes / viaje_gastos / viaje_combustible
      // =========================
      if (want === 'TODOS' || want === 'VEHICULOS') {
        // viajes
        {
          let q = supabase
            .from('viajes')
            .select('id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, creado_en, editado_en, editado_por, conductor')
            .order('creado_en', { ascending: false })
            .limit(300)

          if (desdeISO) q = q.gte('creado_en', desdeISO)
          if (hastaISO) q = q.lte('creado_en', hastaISO)

          const { data, error } = await q
          if (error) {
            console.error('Error viajes', error)
          } else {
            for (const r of (data || []) as any[]) {
              const usuario = r.editado_por ? String(r.editado_por) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const tsRaw = r.editado_en || r.creado_en
              const ts = toISO(tsRaw) || String(tsRaw || '')
              const accion = r.editado_en ? 'VIAJE editado' : 'VIAJE creado'

              out.push({
                ts,
                seccion: 'VEHICULOS',
                accion,
                usuario,
                referencia: `viajes#${r.id}`,
                detalle: `Vehículo ${r.vehiculo_id ?? '—'} · ${r.origen || '—'} → ${r.destino || '—'} · ${r.fecha_inicio || '—'} / ${r.fecha_fin || '—'} · Conductor ${r.conductor || '—'}`,
              })
            }
          }
        }

        // viaje_gastos
        {
          let q = supabase
            .from('viaje_gastos')
            .select('id, viaje_id, fecha, descripcion, monto, proveedor, documento, creado_en, editado_en, editado_por')
            .order('creado_en', { ascending: false })
            .limit(400)

          if (desdeISO) q = q.gte('creado_en', desdeISO)
          if (hastaISO) q = q.lte('creado_en', hastaISO)

          const { data, error } = await q
          if (error) {
            console.error('Error viaje_gastos', error)
          } else {
            for (const r of (data || []) as any[]) {
              const usuario = r.editado_por ? String(r.editado_por) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const tsRaw = r.editado_en || r.creado_en
              const ts = toISO(tsRaw) || String(tsRaw || '')
              const accion = r.editado_en ? 'GASTO editado' : 'GASTO creado'

              out.push({
                ts,
                seccion: 'VEHICULOS',
                accion,
                usuario,
                referencia: `viaje_gastos#${r.id} (viaje ${r.viaje_id})`,
                detalle: `${r.fecha ? String(r.fecha).slice(0, 10) : '—'} · ${r.descripcion || '—'} · Q${Number(r.monto || 0).toFixed(2)}${r.proveedor ? ` · Prov: ${r.proveedor}` : ''}${r.documento ? ` · Doc: ${r.documento}` : ''}`,
              })
            }
          }
        }

        // viaje_combustible
        {
          let q = supabase
            .from('viaje_combustible')
            .select('id, viaje_id, fecha, estacion, volumen_gal, precio_galon, subtotal, documento, creado_en, editado_en, editado_por')
            .order('creado_en', { ascending: false })
            .limit(400)

          if (desdeISO) q = q.gte('creado_en', desdeISO)
          if (hastaISO) q = q.lte('creado_en', hastaISO)

          const { data, error } = await q
          if (error) {
            console.error('Error viaje_combustible', error)
          } else {
            for (const r of (data || []) as any[]) {
              const usuario = r.editado_por ? String(r.editado_por) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const tsRaw = r.editado_en || r.creado_en
              const ts = toISO(tsRaw) || String(tsRaw || '')
              const accion = r.editado_en ? 'COMBUSTIBLE editado' : 'COMBUSTIBLE creado'

              out.push({
                ts,
                seccion: 'VEHICULOS',
                accion,
                usuario,
                referencia: `viaje_combustible#${r.id} (viaje ${r.viaje_id})`,
                detalle: `${r.fecha ? String(r.fecha).slice(0, 10) : '—'} · ${r.estacion || '—'} · ${Number(r.volumen_gal || 0).toFixed(
                  2
                )} gal × Q${Number(r.precio_galon || 0).toFixed(2)} = Q${Number(r.subtotal || 0).toFixed(2)}${r.documento ? ` · Doc: ${r.documento}` : ''}`,
              })
            }
          }
        }
      }

      // =========================
      // VENTAS: ventas / pagos_venta
      // =========================
      if (want === 'TODOS' || want === 'VENTAS') {
        // ventas
        {
          let q = supabase
            .from('ventas')
            .select('id, fecha, cantidad, observaciones, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(400)

          if (filtros.desde) q = q.gte('created_at', inicioDia(filtros.desde))
          if (filtros.hasta) q = q.lte('created_at', finDia(filtros.hasta))

          const { data, error } = await q
          if (error) {
            console.error('Error ventas', error)
          } else {
            for (const r of (data || []) as any[]) {
              const usuario = r.user_id ? String(r.user_id) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const ts = toISO(r.created_at) || String(r.created_at || '')
              out.push({
                ts,
                seccion: 'VENTAS',
                accion: 'VENTA creada',
                usuario,
                referencia: `ventas#${r.id}`,
                detalle: `${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
              })
            }
          }
        }

        // pagos_venta
        {
          let q = supabase
            .from('pagos_venta')
            .select('id, cliente_id, venta_id, fecha, monto, documento, observaciones, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(400)

          if (filtros.desde) q = q.gte('created_at', inicioDia(filtros.desde))
          if (filtros.hasta) q = q.lte('created_at', finDia(filtros.hasta))

          const { data, error } = await q
          if (error) {
            console.error('Error pagos_venta', error)
          } else {
            for (const r of (data || []) as any[]) {
              const usuario = r.user_id ? String(r.user_id) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const ts = toISO(r.created_at) || String(r.created_at || '')
              out.push({
                ts,
                seccion: 'VENTAS',
                accion: 'PAGO registrado',
                usuario,
                referencia: `pagos_venta#${r.id}${r.venta_id ? ` (venta ${r.venta_id})` : ''}`,
                detalle: `${r.fecha || '—'} · Monto Q${Number(r.monto || 0).toFixed(2)}${r.documento ? ` · Doc: ${r.documento}` : ''}${
                  r.observaciones ? ` · ${r.observaciones}` : ''
                }`,
              })
            }
          }
        }
      }

      // =========================
      // EROGACIONES: erogaciones (creadas/ editadas)
      // =========================
      if (want === 'TODOS' || want === 'EROGACIONES') {
        let q = supabase
          .from('erogaciones')
          .select('id, fecha, cantidad, observaciones, user_id, created_at, editado_en, editado_por')
          .order('created_at', { ascending: false })
          .limit(500)

        if (filtros.desde) q = q.gte('created_at', inicioDia(filtros.desde))
        if (filtros.hasta) q = q.lte('created_at', finDia(filtros.hasta))

        const { data, error } = await q
        if (error) {
          console.error('Error erogaciones', error)
        } else {
          for (const r of (data || []) as any[]) {
            // creacion
            {
              const usuario = r.user_id ? String(r.user_id) : '—'
              if (filtraPorUsuario(usuario, filtroUsuario)) {
                const ts = toISO(r.created_at) || String(r.created_at || '')
                out.push({
                  ts,
                  seccion: 'EROGACIONES',
                  accion: 'EROGACIÓN creada',
                  usuario,
                  referencia: `erogaciones#${r.id}`,
                  detalle: `${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
                })
              }
            }

            // edición (si existe)
            if (r.editado_en) {
              const usuario = r.editado_por ? String(r.editado_por) : '—'
              if (!filtraPorUsuario(usuario, filtroUsuario)) continue

              const ts = toISO(r.editado_en) || String(r.editado_en || '')
              out.push({
                ts,
                seccion: 'EROGACIONES',
                accion: 'EROGACIÓN editada',
                usuario,
                referencia: `erogaciones#${r.id}`,
                detalle: `Editado · ${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
              })
            }
          }
        }
      }

      // Ordenar desc por ts
      out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
      setItems(out)
    } finally {
      setLoading(false)
    }
  }, [filtros.desde, filtros.hasta, filtros.usuario, filtros.seccion])

  useEffect(() => {
    if (filtros.desde && filtros.hasta) cargar()
  }, [cargar, filtros.desde, filtros.hasta])

  const itemsFiltrados = useMemo(() => {
    const sec = filtros.seccion
    return items.filter((x) => (sec === 'TODOS' ? true : x.seccion === sec))
  }, [items, filtros.seccion])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">👷 Reporte de movimientos de empleados</h1>
        <Link
          href="/granja/reportes"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Consolida actividad de granja, vehículos, ventas y erogaciones. Filtra por fecha, usuario y sección.
      </p>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <input
          type="date"
          className="border p-2"
          value={filtros.desde}
          onChange={(e) => setFiltros((p) => ({ ...p, desde: e.target.value }))}
        />
        <input
          type="date"
          className="border p-2"
          value={filtros.hasta}
          onChange={(e) => setFiltros((p) => ({ ...p, hasta: e.target.value }))}
        />

        <select
          className="border p-2"
          value={filtros.seccion}
          onChange={(e) => setFiltros((p) => ({ ...p, seccion: e.target.value as Seccion }))}
        >
          <option value="TODOS">Todas las secciones</option>
          <option value="GRANJA">Granja</option>
          <option value="VEHICULOS">Vehículos</option>
          <option value="VENTAS">Ventas</option>
          <option value="EROGACIONES">Erogaciones</option>
        </select>

        <input
          className="border p-2"
          placeholder="Usuario (uuid, nombre, email, etc.)"
          value={filtros.usuario}
          onChange={(e) => setFiltros((p) => ({ ...p, usuario: e.target.value }))}
        />

        <button
          onClick={cargar}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white px-4 py-2 rounded"
        >
          {loading ? 'Cargando…' : '🔎 Buscar'}
        </button>
      </div>

      {/* Tabla */}
      <div className="border rounded bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Fecha/Hora</th>
              <th className="p-2 text-left">Sección</th>
              <th className="p-2 text-left">Acción</th>
              <th className="p-2 text-left">Usuario</th>
              <th className="p-2 text-left">Referencia</th>
              <th className="p-2 text-left">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {itemsFiltrados.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={6}>
                  {loading ? 'Cargando…' : 'No hay movimientos con esos filtros.'}
                </td>
              </tr>
            ) : (
              itemsFiltrados.map((it, idx) => (
                <tr key={`${it.seccion}-${it.referencia}-${idx}`} className="border-t">
                  <td className="p-2 whitespace-nowrap">{fmtFecha(it.ts)}</td>
                  <td className="p-2">{it.seccion}</td>
                  <td className="p-2">{it.accion}</td>
                  <td className="p-2 break-all">{it.usuario}</td>
                  <td className="p-2 break-all">{it.referencia}</td>
                  <td className="p-2">{it.detalle}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Nota: “Usuario” viene de <b>user_id</b> (uuid) o <b>editado_por</b> (texto) según la tabla.
        Si quieres mostrar el email real del usuario, hay que crear una tabla “perfiles” (user_id → email/nombre)
        o usar una vista/función con permisos.
      </div>
    </div>
  )
}