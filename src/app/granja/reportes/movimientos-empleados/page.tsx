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

type ProductoRow = {
  id: number
  nombre: string | null
  sku: string | null
  unidad: string | null
  control_inventario: boolean | null
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

const fmtFecha = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 19)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

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

function num(n: any) {
  const x = Number(n)
  return Number.isFinite(x) ? x : 0
}

function moneyQ(v: any) {
  return `Q${num(v).toFixed(2)}`
}

function compactTxt(v: any, max = 220) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return '—'
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function labelInventarioTipo(tipo: string) {
  const t = String(tipo || '').toUpperCase()
  if (t === 'ENTRADA') return 'ENTRADA (aumenta)'
  if (t === 'SALIDA') return 'SALIDA (disminuye)'
  if (t === 'AJUSTE') return 'AJUSTE (+/-)'
  return t || 'MOVIMIENTO'
}

function signedCantidad(tipo: string, cantidad: any) {
  const c = num(cantidad)
  const t = String(tipo || '').toUpperCase()
  if (t === 'ENTRADA') return `+${c}`
  if (t === 'SALIDA') return `-${c}`
  return `${c}`
}

function prettySnapshot(tableNameRaw: string, actionRaw: string, snapshot: any) {
  const table = String(tableNameRaw || '').split('.').pop() || ''
  const action = String(actionRaw || '').toUpperCase()
  const s = snapshot || {}

  // EROGACIONES (cabecera)
  if (table === 'erogaciones') {
    const id = s.id ?? '—'
    const fecha = s.fecha ?? '—'
    const total = moneyQ(s.cantidad ?? 0)
    const obs = s.observaciones ? ` · ${compactTxt(s.observaciones, 80)}` : ''
    const prov = s.proveedor_id ? ` · Proveedor#${s.proveedor_id}` : ''
    const emp = s.empresa_id ? ` · Empresa#${s.empresa_id}` : ''
    const div = s.division_id ? ` · División#${s.division_id}` : ''
    return `${action} erogación #${id} · ${fecha} · Total ${total}${emp}${div}${prov}${obs}`
  }

  // DETALLE COMPRA (afecta inventario planta)
  if (table === 'detalle_compra') {
    const id = s.id ?? '—'
    const erogId = s.erogacion_id ?? '—'
    const concepto = compactTxt(s.concepto, 70)
    const cant = num(s.cantidad)
    const pu = moneyQ(s.precio_unitario)
    const imp = moneyQ(s.importe ?? cant * num(s.precio_unitario))
    const prod = s.producto_id ? ` · Producto#${s.producto_id}` : ''
    const doc = s.documento ? ` · Doc: ${compactTxt(s.documento, 40)}` : ''
    return `${action} detalle_compra #${id} (erogación#${erogId}) · ${concepto} · Cant ${cant} · P.Unit ${pu} · Importe ${imp}${prod}${doc}`
  }

  // VENTAS (cabecera)
  if (table === 'ventas') {
    const id = s.id ?? '—'
    const fecha = s.fecha ?? '—'
    const total = moneyQ(s.cantidad ?? 0)
    const obs = s.observaciones ? ` · ${compactTxt(s.observaciones, 80)}` : ''
    const cli = s.cliente_id ? ` · Cliente#${s.cliente_id}` : ''
    const emp = s.empresa_id ? ` · Empresa#${s.empresa_id}` : ''
    const div = s.division_id ? ` · División#${s.division_id}` : ''
    return `${action} venta #${id} · ${fecha} · Total ${total}${emp}${div}${cli}${obs}`
  }

  // DETALLE VENTA (afecta inventario planta)
  if (table === 'detalle_venta') {
    const id = s.id ?? '—'
    const ventaId = s.venta_id ?? '—'
    const concepto = compactTxt(s.concepto, 70)
    const cant = num(s.cantidad)
    const pu = moneyQ(s.precio_unitario)
    const imp = moneyQ(s.importe ?? cant * num(s.precio_unitario))
    const prod = s.producto_id ? ` · Producto#${s.producto_id}` : ''
    const doc = s.documento ? ` · Doc: ${compactTxt(s.documento, 40)}` : ''
    return `${action} detalle_venta #${id} (venta#${ventaId}) · ${concepto} · Cant ${cant} · P.Unit ${pu} · Importe ${imp}${prod}${doc}`
  }

  // GRANJA movimientos
  if (table === 'granja_movimientos') {
    const id = s.id ?? '—'
    const tipo = s.tipo ?? 'MOVIMIENTO'
    const ub = s.ubicacion_id ?? '—'
    const cant = s.cantidad ?? '—'
    const ref = s.referencia_tabla ? `${s.referencia_tabla}${s.referencia_id ? `#${s.referencia_id}` : ''}` : ''
    return `${action} granja_movimientos #${id} · ${tipo} · Ubicación ${ub} · Cant ${cant}${ref ? ` · Ref ${ref}` : ''}`
  }

  // VIAJES / GASTOS / COMBUSTIBLE (vehículos)
  if (table === 'viajes' || table === 'viaje_gastos' || table === 'viaje_combustible') {
    const id = s.id ?? '—'
    return `${action} ${table} #${id} · ${compactTxt(JSON.stringify(s), 160)}`
  }

  return compactTxt(`${action} ${table}: ${JSON.stringify(s)}`, 200)
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
    usuario_id: '', // dropdown (uuid)
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
      const { data, error } = await supabase.from('profiles').select('id, email').order('email', { ascending: true })
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
    for (const p of profiles) m.set(p.id, p.email || p.id)
    return m
  }, [profiles])

  const userLabel = (uid: string) => {
    if (!uid || uid === '—') return '—'
    return emailById.get(uid) || uid
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const desdeISO = filtros.desde ? inicioDia(filtros.desde) : ''
      const hastaISO = filtros.hasta ? finDia(filtros.hasta) : ''
      const sec = filtros.seccion
      const uid = clamp(filtros.usuario_id)

      const out: MovItem[] = []
      const wantAll = sec === 'TODOS'

      // ==========================================================
      // 1) AUDIT LOG (INSERT/UPDATE/DELETE) - si existe / tiene permisos
      // ==========================================================
      {
        let q = supabase
          .from('audit_log')
          .select('at, table_name, action, record_id, section, actor, actor_text, snapshot')
          .order('at', { ascending: false })
          .limit(1200)

        if (desdeISO) q = q.gte('at', desdeISO)
        if (hastaISO) q = q.lte('at', hastaISO)

        // filtro sección (incluye inventario planta si tu trigger lo marca así)
        if (sec !== 'TODOS') q = q.eq('section', sec)

        if (uid) q = q.eq('actor', uid)

        const { data, error } = await q
        if (error) {
          // no romper; solo avisar en consola
          console.warn('audit_log no disponible o sin permisos', error)
        } else {
          for (const r of (data || []) as any[]) {
            const seccion = (r.section || 'GRANJA') as MovItem['seccion']
            const usuario = r.actor ? String(r.actor) : r.actor_text ? String(r.actor_text) : '—'
            const tableShort = String(r.table_name || '').split('.').pop() || '—'
            const ref = `${tableShort}#${r.record_id || '—'}`

            out.push({
              ts: String(r.at),
              seccion,
              accion: `${String(r.action || '').toUpperCase()} (${tableShort})`,
              usuario,
              usuario_label: userLabel(usuario),
              referencia: ref,
              detalle: prettySnapshot(r.table_name, r.action, r.snapshot),
            })
          }
        }
      }

      // ==========================================================
      // 2) DIRECTO: GRANJA (granja_movimientos)
      // ==========================================================
      if (wantAll || sec === 'GRANJA') {
        let q = supabase
          .from('granja_movimientos')
          .select('id, fecha, tipo, ubicacion_id, cantidad, referencia_tabla, referencia_id, user_id, observaciones, created_at')
          .order('fecha', { ascending: false })
          .limit(700)

        if (desdeISO) q = q.gte('fecha', desdeISO)
        if (hastaISO) q = q.lte('fecha', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (uid && usuario !== uid) continue

            const ref = `${r.referencia_tabla || 'granja_movimientos'}${r.referencia_id ? `#${r.referencia_id}` : `#${r.id}`}`
            const det = `Tipo ${r.tipo || 'MOVIMIENTO'} · Ubicación ${r.ubicacion_id ?? '—'} · Cant ${r.cantidad ?? '—'}${
              r.observaciones ? ` · ${compactTxt(r.observaciones, 120)}` : ''
            }`

            out.push({
              ts: String(r.fecha || r.created_at),
              seccion: 'GRANJA',
              accion: String(r.tipo || 'MOVIMIENTO'),
              usuario,
              usuario_label: userLabel(usuario),
              referencia: ref,
              detalle: det,
            })
          }
        }
      }

      // ==========================================================
      // 3) DIRECTO: VEHICULOS (viajes, etc) - editado_por texto
      // ==========================================================
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
            out.push({
              ts,
              seccion: 'VEHICULOS',
              accion: r.editado_en ? 'UPDATE (viajes)' : 'INSERT (viajes)',
              usuario,
              usuario_label: usuario, // es texto, no uuid
              referencia: `viajes#${r.id}`,
              detalle: `Vehículo ${r.vehiculo_id ?? '—'} · ${r.origen || '—'} → ${r.destino || '—'} · ${r.fecha_inicio || '—'} / ${r.fecha_fin || '—'}${
                r.conductor ? ` · Conductor: ${compactTxt(r.conductor, 40)}` : ''
              }`,
            })
          }
        }
      }

      // ==========================================================
      // 4) DIRECTO: VENTAS (cabecera)
      // ==========================================================
      if (wantAll || sec === 'VENTAS') {
        let q = supabase
          .from('ventas')
          .select('id, fecha, cantidad, observaciones, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(800)

        if (desdeISO) q = q.gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (uid && usuario !== uid) continue
            out.push({
              ts: String(r.created_at || ''),
              seccion: 'VENTAS',
              accion: 'INSERT (ventas)',
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `ventas#${r.id}`,
              detalle: `${r.fecha || '—'} · Total ${moneyQ(r.cantidad || 0)}${r.observaciones ? ` · ${compactTxt(r.observaciones, 120)}` : ''}`,
            })
          }
        }
      }

      // ==========================================================
      // 5) DIRECTO: EROGACIONES (cabecera + edición si existe)
      // ==========================================================
      if (wantAll || sec === 'EROGACIONES') {
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
                seccion: 'EROGACIONES',
                accion: 'INSERT (erogaciones)',
                usuario: usuarioCre,
                usuario_label: userLabel(usuarioCre),
                referencia: `erogaciones#${r.id}`,
                detalle: `${r.fecha || '—'} · Total ${moneyQ(r.cantidad || 0)}${r.observaciones ? ` · ${compactTxt(r.observaciones, 120)}` : ''}`,
              })
            }

            if (r.editado_en) {
              const usuarioEd = r.editado_por ? String(r.editado_por) : r.user_id ? String(r.user_id) : '—'
              if (uid && usuarioEd !== uid) continue
              out.push({
                ts: String(r.editado_en),
                seccion: 'EROGACIONES',
                accion: 'UPDATE (erogaciones)',
                usuario: usuarioEd,
                usuario_label: userLabel(usuarioEd),
                referencia: `erogaciones#${r.id}`,
                detalle: `Editado · ${r.fecha || '—'} · Total ${moneyQ(r.cantidad || 0)}${r.observaciones ? ` · ${compactTxt(r.observaciones, 120)}` : ''}`,
              })
            }
          }
        }
      }

      // ==========================================================
      // 6) INVENTARIO PLANTA: inventario_movimientos (entrada/salida/ajuste)
      //     (sección nueva: agrupa inventario_movimientos + deduce usuario si puede)
      // ==========================================================
      if (wantAll || sec === 'INVENTARIO_PLANTA') {
        // 6.1 Traer movimientos
        let qMov = supabase
          .from('inventario_movimientos')
          .select('id, producto_id, tipo, cantidad, erogacion_detalle_id, venta_detalle_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1200)

        if (desdeISO) qMov = qMov.gte('created_at', desdeISO)
        if (hastaISO) qMov = qMov.lte('created_at', hastaISO)

        const { data: movs, error: movErr } = await qMov
        if (!movErr) {
          const rows = (movs || []) as any[]

          const prodIds = Array.from(new Set(rows.map((r) => r.producto_id).filter(Boolean))).map((x) => Number(x))
          const detCompraIds = Array.from(new Set(rows.map((r) => r.erogacion_detalle_id).filter(Boolean))).map((x) => Number(x))
          const detVentaIds = Array.from(new Set(rows.map((r) => r.venta_detalle_id).filter(Boolean))).map((x) => Number(x))

          // 6.2 Productos
          const prodMap = new Map<number, ProductoRow>()
          if (prodIds.length) {
            const { data: prods } = await supabase
              .from('productos')
              .select('id, nombre, sku, unidad, control_inventario')
              .in('id', prodIds)
            for (const p of (prods || []) as any[]) prodMap.set(Number(p.id), p as ProductoRow)
          }

          // 6.3 Resolver usuario para erogación (detalle_compra -> erogaciones.user_id)
          const erogByDetCompra = new Map<number, { erogacion_id: number; user_id: string | null; fecha: string | null }>()
          if (detCompraIds.length) {
            const { data: dets } = await supabase.from('detalle_compra').select('id, erogacion_id').in('id', detCompraIds)
            const detList = (dets || []) as any[]
            const erogIds = Array.from(new Set(detList.map((d) => d.erogacion_id).filter(Boolean))).map((x) => Number(x))
            let erogMap = new Map<number, { user_id: string | null; fecha: string | null }>()
            if (erogIds.length) {
              const { data: erogs } = await supabase.from('erogaciones').select('id, user_id, fecha').in('id', erogIds)
              for (const e of (erogs || []) as any[]) erogMap.set(Number(e.id), { user_id: e.user_id ?? null, fecha: e.fecha ?? null })
            }
            for (const d of detList) {
              const e = erogMap.get(Number(d.erogacion_id)) || { user_id: null, fecha: null }
              erogByDetCompra.set(Number(d.id), { erogacion_id: Number(d.erogacion_id), user_id: e.user_id, fecha: e.fecha })
            }
          }

          // 6.4 Resolver usuario para venta (detalle_venta -> ventas.user_id)
          const ventaByDetVenta = new Map<number, { venta_id: number; user_id: string | null; fecha: string | null }>()
          if (detVentaIds.length) {
            const { data: dets } = await supabase.from('detalle_venta').select('id, venta_id').in('id', detVentaIds)
            const detList = (dets || []) as any[]
            const ventaIds = Array.from(new Set(detList.map((d) => d.venta_id).filter(Boolean))).map((x) => Number(x))
            let ventaMap = new Map<number, { user_id: string | null; fecha: string | null }>()
            if (ventaIds.length) {
              const { data: ventas } = await supabase.from('ventas').select('id, user_id, fecha').in('id', ventaIds)
              for (const v of (ventas || []) as any[]) ventaMap.set(Number(v.id), { user_id: v.user_id ?? null, fecha: v.fecha ?? null })
            }
            for (const d of detList) {
              const v = ventaMap.get(Number(d.venta_id)) || { user_id: null, fecha: null }
              ventaByDetVenta.set(Number(d.id), { venta_id: Number(d.venta_id), user_id: v.user_id, fecha: v.fecha })
            }
          }

          // 6.5 Construir items
          for (const r of rows) {
            const tipo = String(r.tipo || '').toUpperCase()
            const prod = r.producto_id ? prodMap.get(Number(r.producto_id)) : null
            const prodTxt = prod
              ? `${prod.nombre || `Producto#${prod.id}`}${prod.sku ? ` (SKU ${prod.sku})` : ''}${prod.unidad ? ` · ${prod.unidad}` : ''}`
              : r.producto_id
              ? `Producto#${r.producto_id}`
              : '—'

            let usuario = '—'
            let ref = `inventario_movimientos#${r.id}`
            let contexto = ''

            if (r.erogacion_detalle_id) {
              const info = erogByDetCompra.get(Number(r.erogacion_detalle_id))
              usuario = info?.user_id ? String(info.user_id) : '—'
              ref = `erogaciones#${info?.erogacion_id ?? '—'} · detalle_compra#${r.erogacion_detalle_id}`
              contexto = info?.fecha ? ` · Fecha erogación: ${info.fecha}` : ''
            } else if (r.venta_detalle_id) {
              const info = ventaByDetVenta.get(Number(r.venta_detalle_id))
              usuario = info?.user_id ? String(info.user_id) : '—'
              ref = `ventas#${info?.venta_id ?? '—'} · detalle_venta#${r.venta_detalle_id}`
              contexto = info?.fecha ? ` · Fecha venta: ${info.fecha}` : ''
            } else {
              ref = `inventario_movimientos#${r.id} (ajuste manual)`
            }

            if (uid && usuario !== uid) continue

            const det = `${labelInventarioTipo(tipo)} · ${prodTxt} · Cant ${signedCantidad(tipo, r.cantidad)}${contexto}`

            out.push({
              ts: String(r.created_at || ''),
              seccion: 'INVENTARIO_PLANTA',
              accion: `MOVIMIENTO (${tipo || '—'})`,
              usuario,
              usuario_label: userLabel(usuario),
              referencia: ref,
              detalle: det,
            })
          }
        }
      }

      out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
      setItems(out)
    } finally {
      setLoading(false)
    }
  }, [filtros.desde, filtros.hasta, filtros.seccion, filtros.usuario_id, emailById])

  useEffect(() => {
    if (filtros.desde && filtros.hasta) cargar()
  }, [cargar, filtros.desde, filtros.hasta])

  const itemsFiltrados = useMemo(() => {
    const sec = filtros.seccion
    if (sec === 'TODOS') return items
    return items.filter((x) => x.seccion === sec)
  }, [items, filtros.seccion])

  const generarPDF = async () => {
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
        body: itemsFiltrados.slice(0, 1400).map((it) => [fmtFecha(it.ts), it.seccion, it.accion, it.usuario_label, it.referencia, it.detalle]),
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 28 },
          2: { cellWidth: 34 },
          3: { cellWidth: 55 },
          4: { cellWidth: 60 },
          5: { cellWidth: 85 },
        },
      })

      const now = new Date()
      const name = `reporte_movimientos_empleados_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
        now.getHours()
      )}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
      doc.save(name)
    } finally {
      setGenerando(false)
    }
  }

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
          <option value="INVENTARIO_PLANTA">Inventario planta</option>
          <option value="VEHICULOS">Vehículos</option>
          <option value="VENTAS">Ventas</option>
          <option value="EROGACIONES">Erogaciones</option>
        </select>

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
                <tr key={`${it.seccion}-${it.referencia}-${idx}`} className="border-t align-top">
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
    </div>
  )
}
