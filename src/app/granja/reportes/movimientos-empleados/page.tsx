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

type TipoGranja =
  | 'TODOS'
  | 'ENTRADA_COMPRA'
  | 'ENTRADA_PARTO'
  | 'SALIDA_VENTA'
  | 'SALIDA_MUERTE'
  | 'AJUSTE'

type Profile = {
  id: string
  email: string | null
}

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
}

type MovItem = {
  ts: string
  seccion: 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES' | 'INVENTARIO_PLANTA'
  accion: string
  usuario: string
  usuario_label: string
  referencia: string
  detalle: string
  ubicacion_id?: number | null
  ubicacion_codigo?: string | null
  ubicacion_nombre?: string | null
  tipo_granja?: string | null
  cantidad?: number | null
  impacto?: number | null
  origen?: string | null
}

type ResumenUbicacion = {
  ubicacion: string
  entradas: number
  salidas: number
  ajustes: number
  neto: number
  movimientos: number
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const fmtFecha = (iso: string) => {
  if (!iso) return '—'

  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) {
    return String(iso).slice(0, 19)
  }

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

const inicioDia = (yyyyMMdd: string) => `${yyyyMMdd}T00:00:00.000Z`
const finDia = (yyyyMMdd: string) => `${yyyyMMdd}T23:59:59.999Z`

const clamp = (s: string) => (s || '').trim()

function moneyQ(n: unknown) {
  const x = Number(n || 0)

  if (Number.isNaN(x)) {
    return 'Q0.00'
  }

  return `Q${x.toFixed(2)}`
}

function num(n: unknown) {
  const x = Number(n)

  if (Number.isNaN(x)) {
    return '—'
  }

  return String(x)
}

function safeJsonParse(v: unknown) {
  try {
    if (v == null) return null
    if (typeof v === 'object') return v
    if (typeof v === 'string') return JSON.parse(v)
    return null
  } catch {
    return null
  }
}

function impactoGranja(tipo: string | null | undefined, cantidad: number | null | undefined) {
  const cant = Math.abs(Number(cantidad || 0))

  if (tipo === 'ENTRADA_COMPRA' || tipo === 'ENTRADA_PARTO') return cant
  if (tipo === 'SALIDA_VENTA' || tipo === 'SALIDA_MUERTE') return -cant
  if (tipo === 'AJUSTE') return Number(cantidad || 0)

  return Number(cantidad || 0)
}

function formatoImpacto(v: number | null | undefined) {
  const n = Number(v || 0)

  if (n > 0) return `+${n}`
  return String(n)
}

function prettySnapshot(table: string, action: string, snapshotAny: unknown): string {
  const t = String(table || '').split('.').pop() || String(table || '')
  const s = safeJsonParse(snapshotAny)

  if (!s) return '—'

  const fecha = s.fecha || s.created_at || s.at || null
  const obs = s.observaciones || s.descripcion || s.motivo || null

  if (t === 'erogaciones') {
    const total = s.cantidad ?? s.total ?? s.monto ?? null

    const bits = [
      fecha ? `Fecha ${String(fecha).slice(0, 10)}` : null,
      total != null ? `Total ${moneyQ(total)}` : null,
      s.proveedor_id ? `ProveedorID ${s.proveedor_id}` : null,
      s.empresa_id ? `EmpresaID ${s.empresa_id}` : null,
      s.division_id ? `DivisiónID ${s.division_id}` : null,
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

  if (t === 'granja_movimientos') {
    const bits = [
      s.tipo ? `Tipo ${s.tipo}` : null,
      s.ubicacion_id ? `UbicaciónID ${s.ubicacion_id}` : null,
      s.cantidad != null ? `Cant ${num(s.cantidad)}` : null,
      s.lote_id ? `LoteID ${s.lote_id}` : null,
      s.referencia_tabla ? `Ref ${s.referencia_tabla}` : null,
      s.referencia_id ? `#${s.referencia_id}` : null,
      obs ? `Obs: ${String(obs)}` : null,
    ].filter(Boolean)

    return bits.length ? bits.join(' · ') : `${action} granja_movimientos`
  }

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

  const keys = Object.keys(s).slice(0, 10)

  const mini = keys
    .map((k) => {
      const v = s[k]

      if (v == null) return null

      const value = typeof v === 'object' ? '[obj]' : String(v)

      return `${k}:${value}`
    })
    .filter(Boolean)
    .join(' · ')

  return mini || '—'
}

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

export default function MovimientosEmpleadosPage() {
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [items, setItems] = useState<MovItem[]>([])

  const [filtros, setFiltros] = useState({
    desde: '',
    hasta: '',
    seccion: 'GRANJA' as Seccion,
    usuario_id: '',
    ubicacion_id: '',
    tipo_granja: 'TODOS' as TipoGranja,
    texto: '',
  })

  useEffect(() => {
    const hasta = hoyISO()
    const d = new Date()
    d.setDate(d.getDate() - 7)

    const desde = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    setFiltros((prev) => ({
      ...prev,
      desde,
      hasta,
    }))
  }, [])

  useEffect(() => {
    ;(async () => {
      const profilesRes = await supabase
        .from('profiles')
        .select('id, email')
        .order('email', { ascending: true })

      if (!profilesRes.error) {
        setProfiles((profilesRes.data ?? []) as Profile[])
      }

      const ubicacionesRes = await supabase
        .from('granja_ubicaciones')
        .select('id,codigo,nombre')
        .order('codigo', { ascending: true })

      if (!ubicacionesRes.error) {
        setUbicaciones((ubicacionesRes.data ?? []) as Ubicacion[])
      }
    })()
  }, [])

  const ubicacionById = useMemo(() => {
    const map = new Map<number, Ubicacion>()

    ubicaciones.forEach((u) => {
      map.set(u.id, u)
    })

    return map
  }, [ubicaciones])

  const emailById = useMemo(() => {
    const map = new Map<string, string>()

    profiles.forEach((profile) => {
      map.set(profile.id, profile.email || profile.id)
    })

    return map
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
      const seccion = filtros.seccion
      const usuarioId = clamp(filtros.usuario_id)
      const texto = clamp(filtros.texto).toLowerCase()

      const salida: MovItem[] = []

      const quiereTodo = seccion === 'TODOS'

      if (quiereTodo || seccion === 'GRANJA') {
        let query = supabase
          .from('granja_movimientos')
          .select(
            `
            id,
            fecha,
            tipo,
            ubicacion_id,
            cantidad,
            lote_id,
            referencia_tabla,
            referencia_id,
            user_id,
            observaciones,
            created_at,
            granja_ubicaciones (
              codigo,
              nombre
            )
          `
          )
          .order('fecha', { ascending: false })
          .limit(2000)

        if (desdeISO) query = query.gte('fecha', desdeISO)
        if (hastaISO) query = query.lte('fecha', hastaISO)
        if (filtros.ubicacion_id) query = query.eq('ubicacion_id', Number(filtros.ubicacion_id))
        if (filtros.tipo_granja !== 'TODOS') query = query.eq('tipo', filtros.tipo_granja)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            const usuario = row.user_id ? String(row.user_id) : '—'

            if (usuarioId && usuario !== usuarioId) continue

            const ubicacionRelacion = Array.isArray(row.granja_ubicaciones)
              ? row.granja_ubicaciones[0]
              : row.granja_ubicaciones

            const ubicacion = ubicacionById.get(Number(row.ubicacion_id))

            const codigo =
              ubicacionRelacion?.codigo ||
              ubicacion?.codigo ||
              `Ubicación ${row.ubicacion_id}`

            const nombre = ubicacionRelacion?.nombre || ubicacion?.nombre || ''

            const cantidad = Number(row.cantidad || 0)
            const impacto = impactoGranja(String(row.tipo || ''), cantidad)

            const referenciaTabla = row.referencia_tabla || 'granja_movimientos'
            const referenciaId = row.referencia_id ? `#${row.referencia_id}` : `#${row.id}`

            const detalle = [
              `${codigo}${nombre ? ` — ${nombre}` : ''}`,
              `Tipo ${row.tipo || '—'}`,
              `Cantidad ${cantidad}`,
              `Impacto ${formatoImpacto(impacto)}`,
              row.lote_id != null ? `LoteID ${row.lote_id}` : null,
              row.observaciones ? `Obs: ${row.observaciones}` : null,
            ]
              .filter(Boolean)
              .join(' · ')

            const item: MovItem = {
              ts: String(row.fecha || row.created_at || ''),
              seccion: 'GRANJA',
              accion: String(row.tipo || 'MOVIMIENTO'),
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `${referenciaTabla}${referenciaId}`,
              detalle,
              ubicacion_id: Number(row.ubicacion_id),
              ubicacion_codigo: codigo,
              ubicacion_nombre: nombre,
              tipo_granja: String(row.tipo || ''),
              cantidad,
              impacto,
              origen: referenciaTabla,
            }

            salida.push(item)
          }
        } else {
          console.error('Error cargando granja_movimientos', error)
        }
      }

      if (quiereTodo || seccion === 'VEHICULOS') {
        let query = supabase
          .from('viajes')
          .select('id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, creado_en, editado_en, editado_por, conductor')
          .order('creado_en', { ascending: false })
          .limit(500)

        if (desdeISO) query = query.gte('creado_en', desdeISO)
        if (hastaISO) query = query.lte('creado_en', hastaISO)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            const usuario = row.editado_por ? String(row.editado_por) : '—'
            const ts = String(row.editado_en || row.creado_en || '')

            salida.push({
              ts,
              seccion: 'VEHICULOS',
              accion: row.editado_en ? 'UPDATE (viajes)' : 'INSERT (viajes)',
              usuario,
              usuario_label: usuario,
              referencia: `viajes#${row.id}`,
              detalle: `Vehículo ${row.vehiculo_id ?? '—'} · ${row.origen || '—'} → ${row.destino || '—'} · ${row.fecha_inicio || '—'} / ${row.fecha_fin || '—'} · Conductor ${row.conductor || '—'}`,
            })
          }
        }
      }

      if (quiereTodo || seccion === 'VENTAS' || seccion === 'INVENTARIO_PLANTA') {
        let query = supabase
          .from('ventas')
          .select('id, fecha, cantidad, observaciones, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(800)

        if (desdeISO) query = query.gte('created_at', desdeISO)
        if (hastaISO) query = query.lte('created_at', hastaISO)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            const usuario = row.user_id ? String(row.user_id) : '—'
            if (usuarioId && usuario !== usuarioId) continue

            salida.push({
              ts: String(row.created_at || ''),
              seccion: seccion === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'VENTAS',
              accion: 'INSERT (ventas)',
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `ventas#${row.id}`,
              detalle: `${row.fecha || '—'} · Total ${moneyQ(row.cantidad)}${row.observaciones ? ` · Obs: ${row.observaciones}` : ''}`,
            })
          }
        }
      }

      if (quiereTodo || seccion === 'EROGACIONES' || seccion === 'INVENTARIO_PLANTA') {
        let query = supabase
          .from('erogaciones')
          .select('id, fecha, cantidad, observaciones, user_id, created_at, editado_en, editado_por')
          .order('created_at', { ascending: false })
          .limit(1000)

        if (desdeISO) query = query.gte('created_at', desdeISO)
        if (hastaISO) query = query.lte('created_at', hastaISO)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            const usuarioCreacion = row.user_id ? String(row.user_id) : row.editado_por ? String(row.editado_por) : '—'

            if (!usuarioId || usuarioCreacion === usuarioId) {
              salida.push({
                ts: String(row.created_at || ''),
                seccion: seccion === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'EROGACIONES',
                accion: 'INSERT (erogaciones)',
                usuario: usuarioCreacion,
                usuario_label: userLabel(usuarioCreacion),
                referencia: `erogaciones#${row.id}`,
                detalle: `${row.fecha || '—'} · Total ${moneyQ(row.cantidad)}${row.observaciones ? ` · Obs: ${row.observaciones}` : ''}`,
              })
            }

            if (row.editado_en) {
              const usuarioEdicion = row.editado_por ? String(row.editado_por) : row.user_id ? String(row.user_id) : '—'
              if (usuarioId && usuarioEdicion !== usuarioId) continue

              salida.push({
                ts: String(row.editado_en),
                seccion: seccion === 'INVENTARIO_PLANTA' ? 'INVENTARIO_PLANTA' : 'EROGACIONES',
                accion: 'UPDATE (erogaciones)',
                usuario: usuarioEdicion,
                usuario_label: userLabel(usuarioEdicion),
                referencia: `erogaciones#${row.id}`,
                detalle: `Editado · ${row.fecha || '—'} · Total ${moneyQ(row.cantidad)}${row.observaciones ? ` · Obs: ${row.observaciones}` : ''}`,
              })
            }
          }
        }
      }

      if (quiereTodo || seccion === 'INVENTARIO_PLANTA') {
        let query = supabase
          .from('inventario_movimientos')
          .select('id, producto_id, tipo, cantidad, erogacion_detalle_id, venta_detalle_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1200)

        if (desdeISO) query = query.gte('created_at', desdeISO)
        if (hastaISO) query = query.lte('created_at', hastaISO)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            if (usuarioId) continue

            const detalle = [
              `ProductoID ${row.producto_id ?? '—'}`,
              row.tipo ? `Tipo ${row.tipo}` : null,
              row.cantidad != null ? `Cant ${num(row.cantidad)}` : null,
              row.erogacion_detalle_id ? `ErogDet #${row.erogacion_detalle_id}` : null,
              row.venta_detalle_id ? `VentaDet #${row.venta_detalle_id}` : null,
            ]
              .filter(Boolean)
              .join(' · ')

            salida.push({
              ts: String(row.created_at || ''),
              seccion: 'INVENTARIO_PLANTA',
              accion: 'MOVIMIENTO (inventario_movimientos)',
              usuario: '—',
              usuario_label: '—',
              referencia: `inventario_movimientos#${row.id}`,
              detalle: detalle || '—',
            })
          }
        }
      }

      if (quiereTodo || seccion !== 'GRANJA') {
        let query = supabase
          .from('audit_log')
          .select('at, table_name, action, record_id, section, actor, actor_text, snapshot')
          .order('at', { ascending: false })
          .limit(1500)

        if (desdeISO) query = query.gte('at', desdeISO)
        if (hastaISO) query = query.lte('at', hastaISO)

        if (seccion !== 'TODOS' && seccion !== 'INVENTARIO_PLANTA') {
          query = query.eq('section', seccion)
        }

        if (usuarioId) query = query.eq('actor', usuarioId)

        const { data, error } = await query

        if (!error) {
          for (const row of (data ?? []) as any[]) {
            const tableName = String(row.table_name || '').split('.').pop() || String(row.table_name || '')
            const action = String(row.action || '').toUpperCase()
            const seccionRaw = String(row.section || 'GRANJA').toUpperCase()

            const seccionFinal =
              seccionRaw === 'VEHICULOS'
                ? 'VEHICULOS'
                : seccionRaw === 'VENTAS'
                  ? 'VENTAS'
                  : seccionRaw === 'EROGACIONES'
                    ? 'EROGACIONES'
                    : seccionRaw === 'INVENTARIO_PLANTA'
                      ? 'INVENTARIO_PLANTA'
                      : 'GRANJA'

            const usuario = row.actor ? String(row.actor) : row.actor_text ? String(row.actor_text) : '—'

            salida.push({
              ts: String(row.at),
              seccion: seccionFinal,
              accion: `${action} (${tableName})`,
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `${tableName}#${row.record_id || '—'}`,
              detalle: prettySnapshot(tableName, action, row.snapshot),
            })
          }
        }
      }

      const sinDuplicados = new Map<string, MovItem>()

      salida.forEach((item) => {
        const key = `${item.seccion}|${item.accion}|${item.referencia}|${item.ts}|${item.detalle}`

        if (!sinDuplicados.has(key)) {
          sinDuplicados.set(key, item)
        }
      })

      let lista = Array.from(sinDuplicados.values())

      if (texto) {
        lista = lista.filter((item) => {
          const cadena = [
            item.seccion,
            item.accion,
            item.usuario_label,
            item.referencia,
            item.detalle,
            item.ubicacion_codigo,
            item.ubicacion_nombre,
            item.tipo_granja,
            item.origen,
          ]
            .join(' ')
            .toLowerCase()

          return cadena.includes(texto)
        })
      }

      lista.sort((a, b) => {
        if (a.ts < b.ts) return 1
        if (a.ts > b.ts) return -1
        return 0
      })

      setItems(lista)
    } finally {
      setLoading(false)
    }
  }, [
    filtros.desde,
    filtros.hasta,
    filtros.seccion,
    filtros.tipo_granja,
    filtros.ubicacion_id,
    filtros.usuario_id,
    filtros.texto,
    ubicacionById,
    userLabel,
  ])

  useEffect(() => {
    if (filtros.desde && filtros.hasta) {
      cargar()
    }
  }, [cargar, filtros.desde, filtros.hasta])

  const resumenGranja = useMemo(() => {
    const map = new Map<string, ResumenUbicacion>()

    items
      .filter((item) => item.seccion === 'GRANJA')
      .forEach((item) => {
        const codigo = item.ubicacion_codigo || `Ubicación ${item.ubicacion_id ?? '—'}`
        const impacto = Number(item.impacto || 0)

        const actual =
          map.get(codigo) ||
          ({
            ubicacion: codigo,
            entradas: 0,
            salidas: 0,
            ajustes: 0,
            neto: 0,
            movimientos: 0,
          } as ResumenUbicacion)

        if (item.tipo_granja === 'AJUSTE') {
          actual.ajustes += impacto
        } else if (impacto > 0) {
          actual.entradas += impacto
        } else if (impacto < 0) {
          actual.salidas += Math.abs(impacto)
        }

        actual.neto += impacto
        actual.movimientos += 1

        map.set(codigo, actual)
      })

    return Array.from(map.values()).sort((a, b) => a.ubicacion.localeCompare(b.ubicacion))
  }, [items])

  const totalEntradas = useMemo(() => {
    return resumenGranja.reduce((sum, row) => sum + row.entradas, 0)
  }, [resumenGranja])

  const totalSalidas = useMemo(() => {
    return resumenGranja.reduce((sum, row) => sum + row.salidas, 0)
  }, [resumenGranja])

  const totalAjustes = useMemo(() => {
    return resumenGranja.reduce((sum, row) => sum + row.ajustes, 0)
  }, [resumenGranja])

  const totalNeto = useMemo(() => {
    return resumenGranja.reduce((sum, row) => sum + row.neto, 0)
  }, [resumenGranja])

  const generarPDF = useCallback(async () => {
    setGenerando(true)

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()

      if (logo) {
        doc.addImage(logo, 'PNG', 10, 8, 30, 12)
      }

      doc.setFontSize(14)
      doc.text('Reporte de movimientos de empleados', 45, 15)

      doc.setFontSize(9)

      const usuarioTxt = filtros.usuario_id ? userLabel(filtros.usuario_id) : 'Todos'
      const ubicacionTxt = filtros.ubicacion_id
        ? ubicacionById.get(Number(filtros.ubicacion_id))?.codigo || filtros.ubicacion_id
        : 'Todas'

      doc.text(
        `Desde: ${filtros.desde || '—'}   Hasta: ${filtros.hasta || '—'}   Sección: ${filtros.seccion}   Usuario: ${usuarioTxt}   Ubicación: ${ubicacionTxt}   Tipo: ${filtros.tipo_granja}`,
        10,
        25
      )

      autoTable(doc, {
        startY: 30,
        head: [['Fecha/Hora', 'Sección', 'Ubicación', 'Acción', 'Impacto', 'Usuario', 'Referencia', 'Detalle']],
        body: items.slice(0, 1400).map((item) => [
          fmtFecha(item.ts),
          item.seccion,
          item.ubicacion_codigo || '—',
          item.accion,
          item.seccion === 'GRANJA' ? formatoImpacto(item.impacto) : '—',
          item.usuario_label,
          item.referencia,
          item.detalle,
        ]),
        styles: { fontSize: 7, cellPadding: 1.5, valign: 'top' },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 25 },
          2: { cellWidth: 22 },
          3: { cellWidth: 35 },
          4: { cellWidth: 18 },
          5: { cellWidth: 45 },
          6: { cellWidth: 45 },
          7: { cellWidth: 75 },
        },
      })

      const now = new Date()
      const name = `reporte_movimientos_empleados_${now.getFullYear()}${pad(
        now.getMonth() + 1
      )}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(
        now.getSeconds()
      )}.pdf`

      doc.save(name)
    } finally {
      setGenerando(false)
    }
  }, [filtros, items, ubicacionById, userLabel])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={180} height={72} />
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Movimientos de empleados</h1>
          <p className="text-sm text-gray-600">
            Busca cambios por fecha, usuario, tramo, tipo de movimiento y referencia.
          </p>
        </div>

        <Link
          href="/granja/reportes"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ← Volver
        </Link>
      </div>

      <section className="border rounded bg-white p-4 mb-4">
        <h2 className="font-semibold mb-3">Filtros de búsqueda</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              className="border p-2 w-full rounded"
              value={filtros.desde}
              onChange={(e) => setFiltros((prev) => ({ ...prev, desde: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              className="border p-2 w-full rounded"
              value={filtros.hasta}
              onChange={(e) => setFiltros((prev) => ({ ...prev, hasta: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Sección</label>
            <select
              className="border p-2 w-full rounded"
              value={filtros.seccion}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  seccion: e.target.value as Seccion,
                }))
              }
            >
              <option value="TODOS">Todas</option>
              <option value="GRANJA">Granja</option>
              <option value="VEHICULOS">Vehículos</option>
              <option value="VENTAS">Ventas</option>
              <option value="EROGACIONES">Erogaciones</option>
              <option value="INVENTARIO_PLANTA">Inventario planta</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Usuario</label>
            <select
              className="border p-2 w-full rounded"
              value={filtros.usuario_id}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  usuario_id: e.target.value,
                }))
              }
            >
              <option value="">Todos los usuarios</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.email || profile.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Tramo / ubicación</label>
            <select
              className="border p-2 w-full rounded"
              value={filtros.ubicacion_id}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  ubicacion_id: e.target.value,
                  seccion: prev.seccion === 'TODOS' ? 'GRANJA' : prev.seccion,
                }))
              }
            >
              <option value="">Todas</option>
              {ubicaciones.map((ubicacion) => (
                <option key={ubicacion.id} value={String(ubicacion.id)}>
                  {ubicacion.codigo} {ubicacion.nombre ? `— ${ubicacion.nombre}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo granja</label>
            <select
              className="border p-2 w-full rounded"
              value={filtros.tipo_granja}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  tipo_granja: e.target.value as TipoGranja,
                  seccion: prev.seccion === 'TODOS' ? 'GRANJA' : prev.seccion,
                }))
              }
            >
              <option value="TODOS">Todos</option>
              <option value="ENTRADA_COMPRA">Entrada compra</option>
              <option value="ENTRADA_PARTO">Entrada parto</option>
              <option value="SALIDA_VENTA">Salida venta</option>
              <option value="SALIDA_MUERTE">Salida muerte</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">
              Buscar texto, referencia, documento u observación
            </label>
            <input
              className="border p-2 w-full rounded"
              placeholder="Ej: TR08, venta, muerte, baja..."
              value={filtros.texto}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  texto: e.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={cargar}
            disabled={loading}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {loading ? 'Cargando…' : 'Buscar'}
          </button>

          <button
            onClick={generarPDF}
            disabled={generando || items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded"
          >
            {generando ? 'Generando…' : 'Imprimir PDF'}
          </button>
        </div>
      </section>

      {filtros.seccion === 'GRANJA' || filtros.seccion === 'TODOS' ? (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="border rounded bg-white p-3">
            <div className="text-xs text-gray-600">Entradas</div>
            <div className="text-xl font-bold text-emerald-700">+{totalEntradas}</div>
          </div>

          <div className="border rounded bg-white p-3">
            <div className="text-xs text-gray-600">Salidas</div>
            <div className="text-xl font-bold text-red-700">-{totalSalidas}</div>
          </div>

          <div className="border rounded bg-white p-3">
            <div className="text-xs text-gray-600">Ajustes</div>
            <div className="text-xl font-bold">{formatoImpacto(totalAjustes)}</div>
          </div>

          <div className="border rounded bg-white p-3">
            <div className="text-xs text-gray-600">Cambio neto</div>
            <div
              className={`text-xl font-bold ${
                totalNeto > 0 ? 'text-emerald-700' : totalNeto < 0 ? 'text-red-700' : ''
              }`}
            >
              {formatoImpacto(totalNeto)}
            </div>
          </div>
        </section>
      ) : null}

      {resumenGranja.length > 0 ? (
        <section className="border rounded bg-white overflow-auto mb-4">
          <div className="p-3 border-b bg-gray-50 font-semibold text-sm">
            Resumen por tramo / ubicación
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Ubicación</th>
                <th className="p-2 text-right">Entradas</th>
                <th className="p-2 text-right">Salidas</th>
                <th className="p-2 text-right">Ajustes</th>
                <th className="p-2 text-right">Cambio neto</th>
                <th className="p-2 text-right">Movimientos</th>
              </tr>
            </thead>

            <tbody>
              {resumenGranja.map((row) => (
                <tr key={row.ubicacion} className="border-t">
                  <td className="p-2 font-medium">{row.ubicacion}</td>
                  <td className="p-2 text-right text-emerald-700">+{row.entradas}</td>
                  <td className="p-2 text-right text-red-700">-{row.salidas}</td>
                  <td className="p-2 text-right">{formatoImpacto(row.ajustes)}</td>
                  <td
                    className={`p-2 text-right font-semibold ${
                      row.neto > 0 ? 'text-emerald-700' : row.neto < 0 ? 'text-red-700' : ''
                    }`}
                  >
                    {formatoImpacto(row.neto)}
                  </td>
                  <td className="p-2 text-right">{row.movimientos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="border rounded bg-white overflow-auto">
        <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
          <div className="font-semibold text-sm">Detalle de movimientos</div>
          <div className="text-xs text-gray-600">
            {loading ? 'Cargando…' : `Mostrando ${items.length} movimiento(s)`}
          </div>
        </div>

        <table className="w-full text-sm min-w-[1100px]">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 text-left">Fecha/Hora</th>
              <th className="p-2 text-left">Sección</th>
              <th className="p-2 text-left">Tramo / ubicación</th>
              <th className="p-2 text-left">Movimiento</th>
              <th className="p-2 text-right">Cantidad</th>
              <th className="p-2 text-right">Impacto</th>
              <th className="p-2 text-left">Usuario</th>
              <th className="p-2 text-left">Referencia</th>
              <th className="p-2 text-left">Detalle</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={9}>
                  {loading ? 'Cargando…' : 'No hay movimientos con esos filtros.'}
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                const impacto = Number(item.impacto || 0)

                return (
                  <tr key={`${item.seccion}-${item.referencia}-${index}`} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmtFecha(item.ts)}</td>
                    <td className="p-2">{item.seccion}</td>
                    <td className="p-2 font-medium">
                      {item.ubicacion_codigo || '—'}
                      {item.ubicacion_nombre ? (
                        <div className="text-[11px] text-gray-500">
                          {item.ubicacion_nombre}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2">{item.accion}</td>
                    <td className="p-2 text-right">
                      {item.cantidad != null ? item.cantidad : '—'}
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        impacto > 0 ? 'text-emerald-700' : impacto < 0 ? 'text-red-700' : ''
                      }`}
                    >
                      {item.seccion === 'GRANJA' ? formatoImpacto(item.impacto) : '—'}
                    </td>
                    <td className="p-2 break-all">{item.usuario_label}</td>
                    <td className="p-2 break-all">{item.referencia}</td>
                    <td className="p-2">{item.detalle}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-gray-500 mt-3">
        Para investigar diferencias entre inventario e inventario diario, usa sección “Granja”, selecciona el tramo
        específico y el rango de fechas. La columna “Impacto” indica cuánto subió o bajó el inventario teórico.
      </p>
    </div>
  )
}
