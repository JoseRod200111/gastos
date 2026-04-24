'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Seccion =
  | 'TODOS'
  | 'GRANJA'
  | 'VEHICULOS'
  | 'VENTAS'
  | 'EROGACIONES'
  | 'INVENTARIO_PLANTA'

type Profile = {
  id: string // uuid
  email: string | null
}

type MovItem = {
  ts: string
  seccion: 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES' | 'INVENTARIO_PLANTA'
  accion: string
  usuario: string
  usuario_label: string
  referencia: string
  detalle: string
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

const fmtFecha = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

// IMPORTANTE: en tu proyecto, muchas columnas de timestamps son "with time zone".
// Para filtrar bien por día sin complicarnos con TZ, usamos ISO con Z.
const inicioDia = (yyyyMMdd: string) => `${yyyyMMdd}T00:00:00.000Z`
const finDia = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

const clamp = (s: string) => (s || '').trim()

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function safeJsonParse(v: any) {
  try {
    if (v == null) return null
    if (typeof v === 'object') return v
    if (typeof v === 'string') return JSON.parse(v)
    return null
  } catch {
    return null
  }
}

function moneyQ(n: any) {
  const x = Number(n || 0)
  if (Number.isNaN(x)) return 'Q0.00'
  return `Q${x.toFixed(2)}`
}

function num(n: any) {
  const x = Number(n)
  if (Number.isNaN(x)) return '—'
  return String(x)
}

function prettySnapshot(table: string, action: string, snapshotAny: any): string {
  const t = String(table || '').split('.').pop() || String(table || '')
  const s = safeJsonParse(snapshotAny)
  if (!s) return '—'

  // helpers de campos comunes
  const fecha = s.fecha || s.created_at || s.at || null
  const obs = s.observaciones || s.descripcion || s.motivo || null

  // === EROGACIONES ===
  if (t === 'erogaciones') {
    const total = s.cantidad ?? s.total ?? s.monto ?? null
    const prov = s.proveedor_id ? `ProveedorID ${s.proveedor_id}` : null
    const emp = s.empresa_id ? `EmpresaID ${s.empresa_id}` : null
    const div = s.division_id ? `DivisiónID ${s.division_id}` : null
    const bits = [
      fecha ? `Fecha ${String(fecha).slice(0, 10)}` : null,
      total != null ? `Total ${moneyQ(total)}` : null,
      emp,
      div,
      prov,
      obs ? `Obs: ${String(obs)}` : null,
      s.editado_por ? `Editado por: ${s.editado_por}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} erogaciones`
  }

  if (t === 'detalle_compra') {
    const bits = [
      s.erogacion_id ? `Erogación #${s.erogacion_id}` : null,
      s.concepto ? `Concepto: ${s.concepto}` : null,
      s.producto_id ? `ProductoID ${s.producto_id}` : null,
      s.cantidad != null ? `Cant ${num(s.cantidad)}` : null,
      s.precio_unitario != null ? `P.Unit ${moneyQ(s.precio_unitario)}` : null,
      s.importe != null ? `Importe ${moneyQ(s.importe)}` : null,
      s.forma_pago_id ? `PagoID ${s.forma_pago_id}` : null,
      s.documento ? `Doc: ${s.documento}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} detalle_compra`
  }

  // === VENTAS (módulo original) ===
  if (t === 'ventas') {
    const total = s.cantidad ?? s.total ?? null
    const bits = [
      fecha ? `Fecha ${String(fecha).slice(0, 10)}` : null,
      total != null ? `Total ${moneyQ(total)}` : null,
      s.cliente_id ? `ClienteID ${s.cliente_id}` : null,
      s.empresa_id ? `EmpresaID ${s.empresa_id}` : null,
      s.division_id ? `DivisiónID ${s.division_id}` : null,
      obs ? `Obs: ${String(obs)}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} ventas`
  }

  if (t === 'detalle_venta') {
    const bits = [
      s.venta_id ? `Venta #${s.venta_id}` : null,
      s.concepto ? `Concepto: ${s.concepto}` : null,
      s.producto_id ? `ProductoID ${s.producto_id}` : null,
      s.cantidad != null ? `Cant ${num(s.cantidad)}` : null,
      s.precio_unitario != null ? `P.Unit ${moneyQ(s.precio_unitario)}` : null,
      s.importe != null ? `Importe ${moneyQ(s.importe)}` : null,
      s.forma_pago_id ? `PagoID ${s.forma_pago_id}` : null,
      s.documento ? `Doc: ${s.documento}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} detalle_venta`
  }

  // === INVENTARIO PLANTA (inventario_movimientos) ===
  if (t === 'inventario_movimientos') {
    const bits = [
      s.producto_id ? `ProductoID ${s.producto_id}` : null,
      s.tipo ? `Tipo ${s.tipo}` : null,
      s.cantidad != null ? `Cant ${num(s.cantidad)}` : null,
      s.erogacion_detalle_id ? `ErogDet #${s.erogacion_detalle_id}` : null,
      s.venta_detalle_id ? `VentaDet #${s.venta_detalle_id}` : null,
      s.created_at ? `Creado ${fmtFecha(s.created_at)}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} inventario_movimientos`
  }

  // === GRANJA ===
  if (t === 'granja_movimientos') {
    const bits = [
      s.tipo ? `Tipo ${s.tipo}` : null,
      s.ubicacion_id ? `Ubicación ${s.ubicacion_id}` : null,
      s.cantidad != null ? `Cant ${num(s.cantidad)}` : null,
      s.lote_id ? `LoteID ${s.lote_id}` : null,
      s.peso_total_kg != null ? `Peso(kg) ${num(s.peso_total_kg)}` : null,
      s.referencia_tabla ? `Ref ${s.referencia_tabla}` : null,
      s.referencia_id ? `#${s.referencia_id}` : null,
      obs ? `Obs: ${String(obs)}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} granja_movimientos`
  }

  // === VEHICULOS ===
  if (t === 'viajes') {
    const bits = [
      s.vehiculo_id ? `VehículoID ${s.vehiculo_id}` : null,
      s.origen ? `Origen ${s.origen}` : null,
      s.destino ? `Destino ${s.destino}` : null,
      s.fecha_inicio ? `Inicio ${s.fecha_inicio}` : null,
      s.fecha_fin ? `Fin ${s.fecha_fin}` : null,
      s.conductor ? `Conductor ${s.conductor}` : null,
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : `${action} viajes`
  }

  // fallback corto (evita JSON enorme)
  const keys = Object.keys(s).slice(0, 10)
  const mini = keys
    .map((k) => {
      const v = s[k]
      if (v == null) return null
      const vv = typeof v === 'object' ? '[obj]' : String(v)
      return `${k}:${vv}`
    })
    .filter(Boolean)
    .join(' · ')
  return mini || '—'
}

export default function MovimientosEmpleadosPage() {
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [items, setItems] = useState<MovItem[]>([])

  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    seccion: 'TODOS' as Seccion,
    usuario_id: '',
  })

  // defaults fechas
  useEffect(() => {
    const today = new Date()
    const hasta = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const d2 = new Date(today)
    d2.setDate(d2.getDate() - 7)
    const desde = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`
    setFiltros((p) => ({ ...p, desde, hasta }))
  }, [])

  // cargar profiles (dropdown de usuarios)
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .order('email', { ascending: true })

      if (error) {
        console.error('profiles error', error)
        setProfiles([])
        return
      }
      setProfiles((data || []) as Profile[])
    })()
  }, [])

  const emailById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of profiles) {
      m.set(p.id, p.email || p.id)
    }
    return m
  }, [profiles])

  const userLabel = useCallback(
    (uid: string) => {
      if (!uid || uid === '—') return '—'
      return emailById.get(uid) || uid
    },
    [emailById]
  )

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const desdeISO = filtros.desde ? inicioDia(filtros.desde) : ''
      const hastaISO = filtros.hasta ? finDia(filtros.hasta) : ''
      const sec = filtros.seccion
      const uid = clamp(filtros.usuario_id)

      const out: MovItem[] = []

      // =========================
      // 1) AUDIT LOG (INSERT/UPDATE/DELETE)
      // =========================
      {
        let q = supabase
          .from('audit_log')
          .select('at, table_name, action, record_id, section, actor, actor_text, snapshot')
          .order('at', { ascending: false })
          .limit(1500)

        if (desdeISO) q = q.gte('at', desdeISO)
        if (hastaISO) q = q.lte('at', hastaISO)

        // si se filtra por sección específica, lo aplicamos aquí
        // OJO: INVENTARIO_PLANTA es "virtual", audit_log probablemente trae VENTAS/EROGACIONES/INVENTARIO_PLANTA si tú lo guardas así.
        if (sec !== 'TODOS' && sec !== 'INVENTARIO_PLANTA') q = q.eq('section', sec)

        if (uid) q = q.eq('actor', uid)

        const { data, error } = await q
        if (error) {
          console.warn('audit_log no disponible o sin permisos', error)
        } else {
          for (const r of (data || []) as any[]) {
            const tableName = String(r.table_name || '').split('.').pop() || String(r.table_name || '')
            const accionBase = String(r.action || '').toUpperCase()
            const seccionRaw = String(r.section || 'GRANJA').toUpperCase()

            // Mapear a secciones conocidas (si llega raro, cae en GRANJA)
            const seccion =
              seccionRaw === 'VEHICULOS'
                ? 'VEHICULOS'
                : seccionRaw === 'VENTAS'
                  ? 'VENTAS'
                  : seccionRaw === 'EROGACIONES'
                    ? 'EROGACIONES'
                    : seccionRaw === 'INVENTARIO_PLANTA'
                      ? 'INVENTARIO_PLANTA'
                      : 'GRANJA'

            const usuario = r.actor ? String(r.actor) : r.actor_text ? String(r.actor_text) : '—'
            const usuarioLabel = userLabel(usuario)

            const detalle = prettySnapshot(tableName, accionBase, r.snapshot)

            out.push({
              ts: String(r.at),
              seccion,
              accion: `${accionBase} (${tableName})`,
              usuario,
              usuario_label: usuarioLabel,
              referencia: `${tableName}#${r.record_id || '—'}`,
              detalle,
            })
          }
        }
      }

      // =========================
      // 2) DIRECTO (si audit_log falta o no cubre todo)
      // =========================
      const wantAll = sec === 'TODOS'

      // GRANJA: granja_movimientos
      if (wantAll || sec === 'GRANJA') {
        let q = supabase
          .from('granja_movimientos')
          .select('id, fecha, tipo, ubicacion_id, cantidad, lote_id, referencia_tabla, referencia_id, user_id, observaciones, created_at')
          .order('fecha', { ascending: false })
          .limit(700)

        if (desdeISO) q = q.gte('fecha', desdeISO)
        if (hastaISO) q = q.lte('fecha', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (uid && usuario !== uid) continue

            const refTabla = r.referencia_tabla || 'granja_movimientos'
            const refId = r.referencia_id ? `#${r.referencia_id}` : `#${r.id}`
            const detalle = [
              r.tipo ? `Tipo ${r.tipo}` : null,
              r.ubicacion_id != null ? `Ubicación ${r.ubicacion_id}` : null,
              r.lote_id != null ? `LoteID ${r.lote_id}` : null,
              r.cantidad != null ? `Cant ${num(r.cantidad)}` : null,
              r.observaciones ? `Obs: ${r.observaciones}` : null,
            ]
              .filter(Boolean)
              .join(' · ')

            out.push({
              ts: String(r.fecha || r.created_at || ''),
              seccion: 'GRANJA',
              accion: String(r.tipo || 'MOVIMIENTO'),
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `${refTabla}${refId}`,
              detalle: detalle || '—',
            })
          }
        }
      }

      // VEHICULOS: viajes (editado_por texto)
      if (wantAll || sec === 'VEHICULOS') {
        let q = supabase
          .from('viajes')
          .select('id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, creado_en, editado_en, editado_por, conductor')
          .order('creado_en', { ascending: false })
          .limit(400)

        if (desdeISO) q = q.gte('creado_en', desdeISO)
        if (hastaISO) q = q.lte('creado_en', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.editado_por ? String(r.editado_por) : '—'
            const ts = String(r.editado_en || r.creado_en || '')

            // Si el filtro usuario es UUID, aquí no aplica (vehículos usa texto).
            // Si quieres filtrar vehículos por email/texto, hay que hacerlo diferente.
            if (uid) {
              // si uid parece uuid, no filtramos aquí para no ocultar todo por error
              // (mantiene comportamiento actual)
            }

            out.push({
              ts,
              seccion: 'VEHICULOS',
              accion: r.editado_en ? 'UPDATE (viajes)' : 'INSERT (viajes)',
              usuario,
              usuario_label: usuario,
              referencia: `viajes#${r.id}`,
              detalle: `Vehículo ${r.vehiculo_id ?? '—'} · ${r.origen || '—'} → ${r.destino || '—'} · ${r.fecha_inicio || '—'} / ${r.fecha_fin || '—'} · Conductor ${r.conductor || '—'}`,
            })
          }
        }
      }

      // VENTAS (módulo original)
      if (wantAll || sec === 'VENTAS' || sec === 'INVENTARIO_PLANTA') {
        let q = supabase
          .from('ventas')
          .select('id, fecha, cantidad, observaciones, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(700)

        if (desdeISO) q = q.gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (uid && usuario !== uid) continue

            out.push({
              ts: String(r.created_at || ''),
              seccion: sec === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'VENTAS',
              accion: 'INSERT (ventas)',
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `ventas#${r.id}`,
              detalle: `${r.fecha || '—'} · Total ${moneyQ(r.cantidad)}${r.observaciones ? ` · Obs: ${r.observaciones}` : ''}`,
            })
          }
        }
      }

      // EROGACIONES (módulo original)
      if (wantAll || sec === 'EROGACIONES' || sec === 'INVENTARIO_PLANTA') {
        let q = supabase
          .from('erogaciones')
          .select('id, fecha, cantidad, observaciones, user_id, created_at, editado_en, editado_por')
          .order('created_at', { ascending: false })
          .limit(1000)

        if (desdeISO) q = q.gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuarioCre = r.user_id ? String(r.user_id) : r.editado_por ? String(r.editado_por) : '—'

            if (!uid || usuarioCre === uid) {
              out.push({
                ts: String(r.created_at || ''),
                seccion: sec === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'EROGACIONES',
                accion: 'INSERT (erogaciones)',
                usuario: usuarioCre,
                usuario_label: userLabel(usuarioCre),
                referencia: `erogaciones#${r.id}`,
                detalle: `${r.fecha || '—'} · Total ${moneyQ(r.cantidad)}${r.observaciones ? ` · Obs: ${r.observaciones}` : ''}`,
              })
            }

            if (r.editado_en) {
              const usuarioEd = r.editado_por ? String(r.editado_por) : r.user_id ? String(r.user_id) : '—'
              if (uid && usuarioEd !== uid) continue

              out.push({
                ts: String(r.editado_en),
                seccion: sec === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'EROGACIONES',
                accion: 'UPDATE (erogaciones)',
                usuario: usuarioEd,
                usuario_label: userLabel(usuarioEd),
                referencia: `erogaciones#${r.id}`,
                detalle: `Editado · ${r.fecha || '—'} · Total ${moneyQ(r.cantidad)}${r.observaciones ? ` · Obs: ${r.observaciones}` : ''}`,
              })
            }
          }
        }
      }

      // INVENTARIO PLANTA: inventario_movimientos (módulo inventario / planta)
      if (wantAll || sec === 'INVENTARIO_PLANTA') {
        let q = supabase
          .from('inventario_movimientos')
          .select('id, producto_id, tipo, cantidad, erogacion_detalle_id, venta_detalle_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1200)

        if (desdeISO) q = q.gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            // inventario_movimientos no guarda user directamente, entonces lo marcamos como —
            // (si quieres usuario real, hay que poblarlo vía audit_log o un trigger)
            const usuario = '—'
            if (uid) {
              // si filtran por usuario específico, estos no tienen user -> los omitimos para no confundir
              continue
            }

            const detalle = [
              `ProductoID ${r.producto_id ?? '—'}`,
              r.tipo ? `Tipo ${r.tipo}` : null,
              r.cantidad != null ? `Cant ${num(r.cantidad)}` : null,
              r.erogacion_detalle_id ? `ErogDet #${r.erogacion_detalle_id}` : null,
              r.venta_detalle_id ? `VentaDet #${r.venta_detalle_id}` : null,
            ]
              .filter(Boolean)
              .join(' · ')

            out.push({
              ts: String(r.created_at || ''),
              seccion: 'INVENTARIO_PLANTA',
              accion: 'MOVIMIENTO (inventario_movimientos)',
              usuario,
              usuario_label: '—',
              referencia: `inventario_movimientos#${r.id}`,
              detalle: detalle || '—',
            })
          }
        }
      }

      out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
      setItems(out)
    } finally {
      setLoading(false)
    }
  }, [filtros.desde, filtros.hasta, filtros.seccion, filtros.usuario_id, userLabel])

  useEffect(() => {
    if (filtros.desde && filtros.hasta) cargar()
  }, [cargar, filtros.desde, filtros.hasta])

  const itemsFiltrados = useMemo(() => {
    const sec = filtros.seccion
    if (sec === 'TODOS') return items

    if (sec === 'INVENTARIO_PLANTA') {
      return items.filter(
        (x) => x.seccion === 'INVENTARIO_PLANTA' || x.seccion === 'VENTAS' || x.seccion === 'EROGACIONES'
      )
    }

    return items.filter((x) => x.seccion === sec)
  }, [items, filtros.seccion])

  const generarPDF = useCallback(async () => {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 10, 8, 30, 12)

      doc.setFontSize(14)
      doc.text('Reporte de movimientos de empleados', 45, 15)

      doc.setFontSize(10)
      const filtroUsuarioTxt = filtros.usuario_id ? userLabel(filtros.usuario_id) : 'Todos'
      doc.text(
        `Desde: ${filtros.desde || '—'}   Hasta: ${filtros.hasta || '—'}   Sección: ${filtros.seccion}   Usuario: ${filtroUsuarioTxt}`,
        10,
        25
      )

      autoTable(doc, {
        startY: 30,
        head: [['Fecha/Hora', 'Sección', 'Acción', 'Usuario', 'Referencia', 'Detalle']],
        body: itemsFiltrados.slice(0, 1400).map((it) => [
          fmtFecha(it.ts),
          it.seccion,
          it.accion,
          it.usuario_label,
          it.referencia,
          it.detalle,
        ]),
        styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 28 },
          2: { cellWidth: 32 },
          3: { cellWidth: 55 },
          4: { cellWidth: 50 },
          5: { cellWidth: 85 },
        },
      })

      const now = new Date()
      const name = `reporte_movimientos_empleados_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
      doc.save(name)
    } finally {
      setGenerando(false)
    }
  }, [filtros.desde, filtros.hasta, filtros.seccion, filtros.usuario_id, itemsFiltrados, userLabel])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">👷 Movimientos de empleados</h1>
        <Link
          href="/granja/reportes"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver
        </Link>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
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
          <option value="TODOS">Todas</option>
          <option value="GRANJA">Granja</option>
          <option value="VEHICULOS">Vehículos</option>
          <option value="VENTAS">Ventas</option>
          <option value="EROGACIONES">Erogaciones</option>
          <option value="INVENTARIO_PLANTA">Inventario planta</option>
        </select>

        {/* dropdown usuarios */}
        <select
          className="border p-2"
          value={filtros.usuario_id}
          onChange={(e) => setFiltros((p) => ({ ...p, usuario_id: e.target.value }))}
        >
          <option value="">Todos los usuarios</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.email || p.id}
            </option>
          ))}
        </select>

        <button
          onClick={cargar}
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white px-4 py-2 rounded"
        >
          {loading ? 'Cargando…' : '🔎 Buscar'}
        </button>

        <button
          onClick={generarPDF}
          disabled={generando || itemsFiltrados.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
        >
          {generando ? 'Generando…' : '📄 Imprimir PDF'}
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
                  <td className="p-2 break-all">{it.usuario_label}</td>
                  <td className="p-2 break-all">{it.referencia}</td>
                  <td className="p-2">{it.detalle}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Nota: “Inventario planta” agrupa movimientos del inventario (inventario_movimientos) + eventos de Ventas/Erogaciones
        que afectan inventarios. Para ver eliminaciones/ediciones completas se recomienda tener audit_log activo.
      </p>
    </div>
  )
}
