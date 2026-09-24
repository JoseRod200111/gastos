'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
}

type Periodo = {
  id: number
  anio: number
  mes: number
  quincena: number
  fecha_inicio: string
  fecha_fin: string
}

type FichaGuardada = {
  id: number
  periodo_id: number
  empleado_id: number
  salario_base: number
  salario_diario: number
  hora_normal: number
  dias_trabajados: number
  horas_extra: number
  valor_hora_extra: number
  salario_ordinario: number
  monto_horas_extra: number
  bono_produccion_diario: number
  bono_produccion_total: number
  bonificacion_ley: number
  otros_bonos: number
  igss: number
  irtra: number
  anticipos: number
  prestamos: number
  descuentos_ventas: number
  descuentos_manual: number
  total_devengado: number
  total_descuentos: number
  liquido_pagar: number
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'
  fecha_pago: string | null
  observaciones: string | null
  user_id: string | null
  created_at: string
  updated_at: string
  editado_por: string | null
  editado_en: string | null
}

type Row = FichaGuardada & {
  empleado_codigo: string
  empleado_nombre: string
  periodo_texto: string
  periodo_archivo: string
  anio: number
  mes: number
  quincena: number
  fecha_inicio: string
  fecha_fin: string
}

type AutoTableDoc = jsPDF & {
  lastAutoTable?: { finalY: number }
}

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

const safeFilePart = (value: string | number | null | undefined) => {
  const cleaned = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || 'sin_nombre'
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'N/A'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const getLogoDataUrl = async () => {
  const response = await fetch('/Logo%20Tech%209_Fondo%20Transparente.png')
  const blob = await response.blob()

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const addHeader = async (doc: jsPDF, titulo: string) => {
  try {
    const logo = await getLogoDataUrl()
    doc.addImage(logo, 'PNG', 14, 8, 28, 20)
  } catch {
    doc.setFontSize(9)
    doc.text('TECH NINE', 14, 15)
  }

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, 105, 18, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Generado: ${new Date().toLocaleString()}`, 196, 12, { align: 'right' })
}

const nombreArchivoFicha = (row: Row) => {
  return `ficha_planilla_ID${row.id}_${safeFilePart(row.empleado_nombre)}_${safeFilePart(row.empleado_codigo)}_${row.periodo_archivo}.pdf`
}

export default function FichasPlanillaPage() {
  const now = new Date()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [anio, setAnio] = useState(String(now.getFullYear()))
  const [mes, setMes] = useState('')
  const [quincena, setQuincena] = useState('')
  const [estado, setEstado] = useState('TODOS')

  const cargar = async () => {
    setLoading(true)
    setMensaje('')

    try {
      const [planillaRes, empleadosRes, periodosRes] = await Promise.all([
        supabase
          .from('rrhh_planilla_empleado')
          .select('*')
          .order('id', { ascending: false })
          .range(0, 2999),
        supabase
          .from('rrhh_empleados')
          .select('id,codigo,nombre_completo'),
        supabase
          .from('rrhh_periodos_planilla')
          .select('id,anio,mes,quincena,fecha_inicio,fecha_fin')
          .order('fecha_inicio', { ascending: false }),
      ])

      if (planillaRes.error) throw new Error(`Error cargando fichas: ${planillaRes.error.message}`)
      if (empleadosRes.error) throw new Error(`Error cargando empleados: ${empleadosRes.error.message}`)
      if (periodosRes.error) throw new Error(`Error cargando períodos: ${periodosRes.error.message}`)

      const empMap = new Map<number, Empleado>()
      ;((empleadosRes.data || []) as Empleado[]).forEach((e) => empMap.set(Number(e.id), e))

      const periodoMap = new Map<number, Periodo>()
      ;((periodosRes.data || []) as Periodo[]).forEach((p) => periodoMap.set(Number(p.id), p))

      const mapped = ((planillaRes.data || []) as FichaGuardada[])
        .map((f) => {
          const emp = empMap.get(Number(f.empleado_id))
          const per = periodoMap.get(Number(f.periodo_id))
          if (!emp || !per) return null

          return {
            ...f,
            empleado_codigo: emp.codigo,
            empleado_nombre: emp.nombre_completo,
            periodo_texto: `${per.anio}-${String(per.mes).padStart(2, '0')} Q${per.quincena} (${formatDate(per.fecha_inicio)} a ${formatDate(per.fecha_fin)})`,
            periodo_archivo: `${per.anio}_${String(per.mes).padStart(2, '0')}_Q${per.quincena}`,
            anio: per.anio,
            mes: per.mes,
            quincena: per.quincena,
            fecha_inicio: per.fecha_inicio,
            fecha_fin: per.fecha_fin,
          }
        })
        .filter((r): r is Row => r !== null)

      setRows(mapped)
    } catch (err) {
      console.error(err)
      setMensaje(err instanceof Error ? err.message : 'Error cargando fichas de planilla.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rowsFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return rows.filter((r) => {
      const texto = `${r.id} ${r.empleado_id} ${r.empleado_codigo} ${r.empleado_nombre} ${r.periodo_texto} ${r.editado_por || ''}`.toLowerCase()
      if (q && !texto.includes(q)) return false
      if (anio && String(r.anio) !== anio) return false
      if (mes && String(r.mes) !== mes) return false
      if (quincena && String(r.quincena) !== quincena) return false
      if (estado !== 'TODOS' && r.estado !== estado) return false
      return true
    })
  }, [rows, busqueda, anio, mes, quincena, estado])

  const imprimirFicha = async (row: Row) => {
    const doc = new jsPDF('p', 'mm', 'letter') as AutoTableDoc
    await addHeader(doc, 'FICHA DE PAGO QUINCENAL')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${row.empleado_codigo} - ${row.empleado_nombre}`, 14, 38)
    doc.setFont('helvetica', 'normal')
    doc.text(`Ficha planilla ID: ${row.id}`, 14, 45)
    doc.text(`Período: ${row.periodo_texto}`, 14, 52)
    doc.text(`Estado: ${row.estado}`, 105, 59)
    doc.text(`Fecha de pago: ${row.fecha_pago || 'Pendiente'}`, 150, 59)

    autoTable(doc, {
      startY: 66,
      head: [['Concepto', 'Cantidad / base', 'Monto']],
      body: [
        ['Salario base mensual', '', money(row.salario_base)],
        ['Salario diario', 'Salario / 30', money(row.salario_diario)],
        ['Días trabajados', String(row.dias_trabajados), money(row.salario_ordinario)],
        ['Horas extra', `${row.horas_extra} h x ${money(row.valor_hora_extra)}`, money(row.monto_horas_extra)],
        ['Bono producción', `${money(row.bono_produccion_diario)} x ${row.dias_trabajados} días`, money(row.bono_produccion_total)],
        ['Bonificación de ley', '', money(row.bonificacion_ley)],
        ['Otros bonos', '', money(row.otros_bonos)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59] },
    })

    const afterDev = (doc.lastAutoTable?.finalY || 66) + 6

    autoTable(doc, {
      startY: afterDev,
      head: [['Descuento', 'Monto']],
      body: [
        ['IGSS', money(row.igss)],
        ['IRTRA', money(row.irtra)],
        ['Anticipos', money(row.anticipos)],
        ['Préstamos', money(row.prestamos)],
        ['Ventas descontadas', money(row.descuentos_ventas)],
        ['Otros descuentos', money(row.descuentos_manual)],
      ].filter((r) => toNum(String(r[1]).replace('Q', '')) !== 0),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80] },
    })

    const afterDisc = (doc.lastAutoTable?.finalY || afterDev) + 8

    autoTable(doc, {
      startY: afterDisc,
      body: [
        ['Total devengado', money(row.total_devengado)],
        ['Total descuentos', money(row.total_descuentos)],
        ['Líquido a recibir', money(row.liquido_pagar)],
      ],
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })

    const yFirma = Math.max((doc.lastAutoTable?.finalY || afterDisc) + 24, 205)
    doc.setFontSize(9)
    doc.text('Recibí conforme:', 14, yFirma)
    doc.line(14, yFirma + 18, 85, yFirma + 18)
    doc.text('Firma del empleado', 31, yFirma + 24)
    doc.line(120, yFirma + 18, 190, yFirma + 18)
    doc.text('Firma / autorización', 139, yFirma + 24)

    if (row.observaciones) {
      doc.setFontSize(8)
      doc.text(`Observaciones: ${row.observaciones}`, 14, yFirma + 36, { maxWidth: 180 })
    }

    doc.save(nombreArchivoFicha(row))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/Logo%20Tech%209_Fondo%20Transparente.png" alt="Logo Empresa" className="h-14" />
      </div>

      <h1 className="text-2xl font-bold mb-1">Buscar fichas de planilla</h1>
      <p className="text-sm text-gray-600 mb-4">
        Consulta fichas guardadas, filtra por empleado, período, estado o ID, y descarga nuevamente el PDF.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/rrhh/planilla" className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm">
          Volver a planilla
        </Link>
        <Link href="/rrhh" className="bg-slate-500 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm">
          Volver a RRHH
        </Link>
        <button
          type="button"
          onClick={cargar}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-2 rounded text-sm"
        >
          {loading ? 'Cargando...' : 'Recargar'}
        </button>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-yellow-50">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white mb-4">
        <h2 className="font-semibold mb-3">Filtros</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-sm md:col-span-2">
            Buscar
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="mt-1 border rounded px-3 py-2 w-full"
              placeholder="ID ficha, empleado, código, usuario..."
            />
          </label>

          <label className="text-sm">
            Año
            <input
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              className="mt-1 border rounded px-3 py-2 w-full"
              placeholder="2026"
            />
          </label>

          <label className="text-sm">
            Mes
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Todos</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Quincena
            <select value={quincena} onChange={(e) => setQuincena(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Todas</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>

          <label className="text-sm">
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="TODOS">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADO">Pagado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 mb-4">
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Fichas mostradas</div>
          <div className="text-xl font-bold">{rowsFiltradas.length}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Total líquido</div>
          <div className="text-xl font-bold">{money(rowsFiltradas.reduce((acc, r) => acc + toNum(r.liquido_pagar), 0))}</div>
        </div>
        <div className="border rounded p-3 bg-white">
          <div className="text-xs text-gray-500">Filtro actual</div>
          <div className="font-semibold">{anio || 'Todos los años'} {mes ? `- Mes ${mes}` : ''} {quincena ? `- Q${quincena}` : ''}</div>
        </div>
      </section>

      <section className="border rounded-lg bg-white overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="border px-2 py-2 text-left">Ficha ID</th>
              <th className="border px-2 py-2 text-left">Empleado</th>
              <th className="border px-2 py-2 text-left">Período</th>
              <th className="border px-2 py-2 text-right">Devengado</th>
              <th className="border px-2 py-2 text-right">Descuentos</th>
              <th className="border px-2 py-2 text-right">Líquido</th>
              <th className="border px-2 py-2 text-left">Estado</th>
              <th className="border px-2 py-2 text-left">Guardado/Editado</th>
              <th className="border px-2 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row) => (
              <tr key={row.id}>
                <td className="border px-2 py-2 font-semibold">#{row.id}</td>
                <td className="border px-2 py-2">
                  <div className="font-semibold">{row.empleado_codigo}</div>
                  <div>{row.empleado_nombre}</div>
                </td>
                <td className="border px-2 py-2">{row.periodo_texto}</td>
                <td className="border px-2 py-2 text-right">{money(row.total_devengado)}</td>
                <td className="border px-2 py-2 text-right text-red-700">{money(row.total_descuentos)}</td>
                <td className="border px-2 py-2 text-right font-bold">{money(row.liquido_pagar)}</td>
                <td className="border px-2 py-2">{row.estado}</td>
                <td className="border px-2 py-2 text-xs">
                  <div>Creado: {formatDateTime(row.created_at)}</div>
                  <div>Editado: {formatDateTime(row.editado_en || row.updated_at)}</div>
                  <div>{row.editado_por || 'N/A'}</div>
                </td>
                <td className="border px-2 py-2">
                  <button
                    type="button"
                    onClick={() => imprimirFicha(row)}
                    className="bg-slate-700 hover:bg-slate-800 text-white rounded px-3 py-1 text-xs"
                  >
                    Descargar PDF
                  </button>
                </td>
              </tr>
            ))}

            {rowsFiltradas.length === 0 && (
              <tr>
                <td colSpan={9} className="border px-3 py-6 text-center text-gray-500">
                  No hay fichas guardadas con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
