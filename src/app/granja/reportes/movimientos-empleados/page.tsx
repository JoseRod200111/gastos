'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Seccion = 'TODOS' | 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES'

type Profile = {
  id: string // uuid
  email: string | null
}

type MovItem = {
  ts: string
  seccion: 'GRANJA' | 'VEHICULOS' | 'VENTAS' | 'EROGACIONES'
  accion: string
  usuario: string
  usuario_label: string
  referencia: string
  detalle: string
  fuente: 'AUDIT' | 'DIRECTO'
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const fmtFecha = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso).slice(0, 19)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
    for (const p of profiles) {
      m.set(p.id, p.email || p.id)
    }
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

      // =========================
      // 1) AUDIT LOG (INSERT/UPDATE/DELETE)
      // =========================
      // Si no existe audit_log o no tienes permisos, simplemente no trae.
      {
        let q = supabase
          .from('audit_log')
          .select('at, table_name, action, record_id, section, actor, actor_text, snapshot')
          .order('at', { ascending: false })
          .limit(1000)

        if (desdeISO) q = q.gte('at', desdeISO)
        if (hastaISO) q = q.lte('at', hastaISO)
        if (sec !== 'TODOS') q = q.eq('section', sec)
        if (uid) q = q.eq('actor', uid)

        const { data, error } = await q
        if (error) {
          // no bloquea el reporte
          console.warn('audit_log no disponible o sin permisos', error)
        } else {
          for (const r of (data || []) as any[]) {
            const seccion = (r.section || 'GRANJA') as MovItem['seccion']
            const usuario = r.actor ? String(r.actor) : (r.actor_text ? String(r.actor_text) : '—')

            out.push({
              ts: String(r.at),
              seccion,
              accion: `${r.action} (${String(r.table_name || '').split('.').pop()})`,
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `${String(r.table_name || '').split('.').pop()}#${r.record_id || '—'}`,
              detalle: r.snapshot ? JSON.stringify(r.snapshot).slice(0, 180) : '—',
              fuente: 'AUDIT',
            })
          }
        }
      }

      // =========================
      // 2) DIRECTO (por si aún no está audit)
      // =========================
      // Aquí corregimos "erogaciones usuario —": usamos user_id o editado_por
      const wantAll = sec === 'TODOS'

      // GRANJA: granja_movimientos
      if (wantAll || sec === 'GRANJA') {
        let q = supabase
          .from('granja_movimientos')
          .select('id, fecha, tipo, ubicacion_id, cantidad, referencia_tabla, referencia_id, user_id, observaciones, created_at')
          .order('fecha', { ascending: false })
          .limit(500)

        if (desdeISO) q = q.gte('fecha', desdeISO)
        if (hastaISO) q = q.lte('fecha', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            const usuario = r.user_id ? String(r.user_id) : '—'
            if (uid && usuario !== uid) continue
            out.push({
              ts: String(r.fecha || r.created_at),
              seccion: 'GRANJA',
              accion: String(r.tipo || 'MOVIMIENTO'),
              usuario,
              usuario_label: userLabel(usuario),
              referencia: `${r.referencia_tabla || 'granja_movimientos'}${r.referencia_id ? `#${r.referencia_id}` : `#${r.id}`}`,
              detalle: `Ubicación ${r.ubicacion_id ?? '—'} · Cant ${r.cantidad ?? '—'}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
              fuente: 'DIRECTO',
            })
          }
        }
      }

      // VEHICULOS: viajes/viaje_gastos/viaje_combustible (estos usan editado_por texto, no uuid)
      if (wantAll || sec === 'VEHICULOS') {
        // viajes (solo creado/edición; deletes se ven en audit)
        {
          let q = supabase
            .from('viajes')
            .select('id, vehiculo_id, fecha_inicio, fecha_fin, origen, destino, creado_en, editado_en, editado_por, conductor')
            .order('creado_en', { ascending: false })
            .limit(300)

          if (desdeISO) q = q.gte('creado_en', desdeISO)
          if (hastaISO) q = q.lte('creado_en', hastaISO)

          const { data, error } = await q
          if (!error) {
            for (const r of (data || []) as any[]) {
              // aquí usuario es texto, el dropdown es uuid: no filtramos por uid en vehículos si no hay actor uuid
              const usuario = r.editado_por ? String(r.editado_por) : '—'
              const ts = String(r.editado_en || r.creado_en || '')
              out.push({
                ts,
                seccion: 'VEHICULOS',
                accion: r.editado_en ? 'UPDATE (viajes)' : 'INSERT (viajes)',
                usuario,
                usuario_label: usuario,
                referencia: `viajes#${r.id}`,
                detalle: `Vehículo ${r.vehiculo_id ?? '—'} · ${r.origen || '—'} → ${r.destino || '—'} · ${r.fecha_inicio || '—'} / ${r.fecha_fin || '—'}`,
                fuente: 'DIRECTO',
              })
            }
          }
        }
      }

      // VENTAS
      if (wantAll || sec === 'VENTAS') {
        let q = supabase
          .from('ventas')
          .select('id, fecha, cantidad, observaciones, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(500)

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
              detalle: `${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
              fuente: 'DIRECTO',
            })
          }
        }
      }

      // EROGACIONES (aquí arreglamos el usuario)
      if (wantAll || sec === 'EROGACIONES') {
        let q = supabase
          .from('erogaciones')
          .select('id, fecha, cantidad, observaciones, user_id, created_at, editado_en, editado_por')
          .order('created_at', { ascending: false })
          .limit(800)

        if (desdeISO) q = q.gte('created_at', desdeISO)
        if (hastaISO) q = q.lte('created_at', hastaISO)

        const { data, error } = await q
        if (!error) {
          for (const r of (data || []) as any[]) {
            // CREACIÓN: usa user_id si existe, si no, muestra editado_por si existe, si no "—"
            const usuarioCre = r.user_id ? String(r.user_id) : (r.editado_por ? String(r.editado_por) : '—')
            if (uid && usuarioCre !== uid) {
              // si filtras por usuario, y no coincide, saltamos
              // (nota: si tu editado_por contiene email, no coincidirá con uid; para eso está audit/profiles)
            } else {
              out.push({
                ts: String(r.created_at || ''),
                seccion: 'EROGACIONES',
                accion: 'INSERT (erogaciones)',
                usuario: usuarioCre,
                usuario_label: userLabel(usuarioCre),
                referencia: `erogaciones#${r.id}`,
                detalle: `${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
                fuente: 'DIRECTO',
              })
            }

            // EDICIÓN (si existe)
            if (r.editado_en) {
              const usuarioEd = r.editado_por ? String(r.editado_por) : (r.user_id ? String(r.user_id) : '—')
              if (uid && usuarioEd !== uid) continue
              out.push({
                ts: String(r.editado_en),
                seccion: 'EROGACIONES',
                accion: 'UPDATE (erogaciones)',
                usuario: usuarioEd,
                usuario_label: userLabel(usuarioEd),
                referencia: `erogaciones#${r.id}`,
                detalle: `Editado · ${r.fecha || '—'} · Total Q${Number(r.cantidad || 0).toFixed(2)}${r.observaciones ? ` · ${r.observaciones}` : ''}`,
                fuente: 'DIRECTO',
              })
            }
          }
        }
      }

      // ordenar desc por fecha
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
      doc.text(`Desde: ${filtros.desde || '—'}   Hasta: ${filtros.hasta || '—'}   Sección: ${filtros.seccion}   Usuario: ${filtroUsuarioTxt}`, 10, 25)

      autoTable(doc, {
        startY: 30,
        head: [['Fecha/Hora', 'Sección', 'Acción', 'Usuario', 'Referencia', 'Detalle', 'Fuente']],
        body: itemsFiltrados.slice(0, 1200).map((it) => [
          fmtFecha(it.ts),
          it.seccion,
          it.accion,
          it.usuario_label,
          it.referencia,
          it.detalle,
          it.fuente,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 20 },
          2: { cellWidth: 28 },
          3: { cellWidth: 45 },
          4: { cellWidth: 40 },
          5: { cellWidth: 110 },
          6: { cellWidth: 18 },
        },
      })

      const now = new Date()
      const name = `reporte_movimientos_empleados_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.pdf`
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

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">👷 Movimientos de empleados</h1>
        <Link
          href="/granja/reportes"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
        >
          ⬅ Volver
        </Link>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Incluye registros directos y, si está activo, <b>audit_log</b> (INSERT/UPDATE/DELETE).
      </p>

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
        </select>

        {/* ✅ dropdown usuarios */}
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
              <th className="p-2 text-left">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {itemsFiltrados.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan={7}>
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
                  <td className="p-2">{it.fuente}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Si ves “—” en usuario de erogaciones es porque el registro tiene <b>user_id</b> nulo y/o <b>editado_por</b> vacío.
        Con <b>profiles</b> se muestran emails para user_id.
        Para ver eliminaciones sí o sí necesitas <b>audit_log</b>.
      </div>
    </div>
  )
}
