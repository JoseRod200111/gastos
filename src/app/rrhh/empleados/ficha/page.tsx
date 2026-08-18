'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'

type EstadoEmpleado = 'ACTIVO' | 'BAJA'

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
  dpi: string | null
  nit: string | null
  telefono: string | null
  direccion: string | null
  fecha_ingreso: string
  fecha_baja: string | null
  motivo_baja: string | null
  estado: EstadoEmpleado
  salario_base: number
  bono_produccion_diario: number
  cliente_id: number | null
  empresa_id: number | null
  division_id: number | null
  observaciones: string | null
  created_at: string | null
  updated_at: string | null
  editado_por: string | null
  editado_en: string | null
}

type Cliente = {
  id: number
  nombre: string
  nit: string | null
}

type Empresa = {
  id: number
  nombre: string
}

type Division = {
  id: number
  nombre: string
}

type Area = {
  id: number
  codigo: string
  nombre: string
  activo: boolean
}

type Distribucion = {
  id: number
  empleado_id: number
  area_id: number
  porcentaje: number
}

type Auditoria = {
  id: number
  fecha: string
  empleado_id: number | null
  accion: string
  usuario_email: string | null
  observaciones: string | null
}

type AutoTableDoc = jsPDF & {
  lastAutoTable?: { finalY: number }
}

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => `Q${toNum(value).toFixed(2)}`

const safe = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  return value.slice(0, 10)
}

const cleanFilePart = (value: string) => {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'empleado'
  )
}

const getLogoDataUrl = async () => {
  const response = await fetch(RRHH_LOGO_URL)
  const blob = await response.blob()

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const addPdfHeader = async (doc: jsPDF, titulo: string, subtitulo?: string) => {
  try {
    const logo = await getLogoDataUrl()
    doc.addImage(logo, 'PNG', 14, 8, 25, 18)
  } catch {
    doc.setFontSize(9)
    doc.text('TECH NINE', 14, 15)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(titulo, 105, 18, { align: 'center' })

  if (subtitulo) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(subtitulo, 105, 24, { align: 'center' })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Generado: ${new Date().toLocaleString()}`, 196, 12, { align: 'right' })
}

const addPdfFooter = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Tech Nine', 14, pageHeight - 10)
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' })
  }
}

export default function RrhhFichaEmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([])
  const [auditoria, setAuditoria] = useState<Auditoria[]>([])

  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'ACTIVO' | 'BAJA' | 'TODOS'>('ACTIVO')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [divisionFiltro, setDivisionFiltro] = useState('')
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [areaFiltro, setAreaFiltro] = useState('')
  const [ingresoDesde, setIngresoDesde] = useState('')
  const [ingresoHasta, setIngresoHasta] = useState('')
  const [salarioDesde, setSalarioDesde] = useState('')
  const [salarioHasta, setSalarioHasta] = useState('')
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)

  const cargarTodo = async () => {
    setLoading(true)
    setMensaje('')

    const [empleadosRes, clientesRes, empresasRes, divisionesRes, areasRes, distRes, auditRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select(
          'id,codigo,nombre_completo,dpi,nit,telefono,direccion,fecha_ingreso,fecha_baja,motivo_baja,estado,salario_base,bono_produccion_diario,cliente_id,empresa_id,division_id,observaciones,created_at,updated_at,editado_por,editado_en'
        )
        .order('nombre_completo', { ascending: true }),
      supabase.from('clientes').select('id,nombre,nit').order('nombre', { ascending: true }),
      supabase.from('empresas').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('divisiones').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('rrhh_areas').select('id,codigo,nombre,activo').order('nombre', { ascending: true }),
      supabase.from('rrhh_empleado_distribucion').select('id,empleado_id,area_id,porcentaje'),
      supabase
        .from('rrhh_auditoria')
        .select('id,fecha,empleado_id,accion,usuario_email,observaciones')
        .order('fecha', { ascending: false })
        .limit(500),
    ])

    if (empleadosRes.error) setMensaje(`Error cargando empleados: ${empleadosRes.error.message}`)
    if (clientesRes.error) setMensaje(`Error cargando clientes: ${clientesRes.error.message}`)
    if (empresasRes.error) setMensaje(`Error cargando empresas: ${empresasRes.error.message}`)
    if (divisionesRes.error) setMensaje(`Error cargando divisiones: ${divisionesRes.error.message}`)
    if (areasRes.error) setMensaje(`Error cargando áreas: ${areasRes.error.message}`)
    if (distRes.error) setMensaje(`Error cargando distribución: ${distRes.error.message}`)
    if (auditRes.error) setMensaje(`Error cargando auditoría: ${auditRes.error.message}`)

    const empleadosData = (empleadosRes.data || []) as Empleado[]
    setEmpleados(empleadosData)
    setClientes((clientesRes.data || []) as Cliente[])
    setEmpresas((empresasRes.data || []) as Empresa[])
    setDivisiones((divisionesRes.data || []) as Division[])
    setAreas((areasRes.data || []) as Area[])
    setDistribuciones((distRes.data || []) as Distribucion[])
    setAuditoria((auditRes.data || []) as Auditoria[])

    setSeleccionadoId((prev) => {
      if (prev && empleadosData.some((e) => e.id === prev)) return prev
      return empleadosData[0]?.id ?? null
    })

    setLoading(false)
  }

  useEffect(() => {
    cargarTodo()
  }, [])

  const clientesMap = useMemo(() => {
    const map = new Map<number, Cliente>()
    clientes.forEach((cliente) => map.set(cliente.id, cliente))
    return map
  }, [clientes])

  const empresasMap = useMemo(() => {
    const map = new Map<number, Empresa>()
    empresas.forEach((empresa) => map.set(empresa.id, empresa))
    return map
  }, [empresas])

  const divisionesMap = useMemo(() => {
    const map = new Map<number, Division>()
    divisiones.forEach((division) => map.set(division.id, division))
    return map
  }, [divisiones])

  const areasMap = useMemo(() => {
    const map = new Map<number, Area>()
    areas.forEach((area) => map.set(area.id, area))
    return map
  }, [areas])

  const distribucionPorEmpleado = useMemo(() => {
    const map = new Map<number, Distribucion[]>()
    distribuciones.forEach((dist) => {
      const current = map.get(dist.empleado_id) || []
      current.push(dist)
      map.set(dist.empleado_id, current)
    })
    return map
  }, [distribuciones])

  const auditoriaPorEmpleado = useMemo(() => {
    const map = new Map<number, Auditoria[]>()
    auditoria.forEach((item) => {
      if (!item.empleado_id) return
      const current = map.get(item.empleado_id) || []
      current.push(item)
      map.set(item.empleado_id, current)
    })
    return map
  }, [auditoria])

  const empleadoTexto = (empleado: Empleado) => {
    const cliente = empleado.cliente_id ? clientesMap.get(empleado.cliente_id) : null
    const empresa = empleado.empresa_id ? empresasMap.get(empleado.empresa_id) : null
    const division = empleado.division_id ? divisionesMap.get(empleado.division_id) : null
    const dist = distribucionPorEmpleado.get(empleado.id) || []
    const areasTexto = dist
      .map((item) => areasMap.get(item.area_id)?.nombre || '')
      .filter(Boolean)
      .join(' ')

    return `${empleado.codigo} ${empleado.nombre_completo} ${empleado.dpi || ''} ${empleado.nit || ''} ${empleado.telefono || ''} ${empleado.direccion || ''} ${cliente?.nombre || ''} ${empresa?.nombre || ''} ${division?.nombre || ''} ${areasTexto}`.toLowerCase()
  }

  const empleadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const salarioMin = salarioDesde === '' ? null : toNum(salarioDesde)
    const salarioMax = salarioHasta === '' ? null : toNum(salarioHasta)

    return empleados.filter((empleado) => {
      if (estadoFiltro !== 'TODOS' && empleado.estado !== estadoFiltro) return false
      if (empresaFiltro && String(empleado.empresa_id || '') !== empresaFiltro) return false
      if (divisionFiltro && String(empleado.division_id || '') !== divisionFiltro) return false
      if (clienteFiltro && String(empleado.cliente_id || '') !== clienteFiltro) return false
      if (ingresoDesde && empleado.fecha_ingreso < ingresoDesde) return false
      if (ingresoHasta && empleado.fecha_ingreso > ingresoHasta) return false
      if (salarioMin !== null && toNum(empleado.salario_base) < salarioMin) return false
      if (salarioMax !== null && toNum(empleado.salario_base) > salarioMax) return false

      if (areaFiltro) {
        const dist = distribucionPorEmpleado.get(empleado.id) || []
        const tieneArea = dist.some((item) => String(item.area_id) === areaFiltro && toNum(item.porcentaje) > 0)
        if (!tieneArea) return false
      }

      if (q && !empleadoTexto(empleado).includes(q)) return false

      return true
    })
  }, [
    areaFiltro,
    busqueda,
    clienteFiltro,
    distribucionPorEmpleado,
    empleados,
    estadoFiltro,
    empresaFiltro,
    ingresoDesde,
    ingresoHasta,
    salarioDesde,
    salarioHasta,
    divisionFiltro,
  ])

  const empleadoSeleccionado = useMemo(() => {
    if (!seleccionadoId) return empleadosFiltrados[0] || null
    return empleados.find((empleado) => empleado.id === seleccionadoId) || empleadosFiltrados[0] || null
  }, [empleados, empleadosFiltrados, seleccionadoId])

  const limpiarFiltros = () => {
    setBusqueda('')
    setEstadoFiltro('ACTIVO')
    setEmpresaFiltro('')
    setDivisionFiltro('')
    setClienteFiltro('')
    setAreaFiltro('')
    setIngresoDesde('')
    setIngresoHasta('')
    setSalarioDesde('')
    setSalarioHasta('')
  }

  const getDistribucionEmpleado = (empleadoId: number) => {
    return distribucionPorEmpleado.get(empleadoId) || []
  }

  const getAuditoriaEmpleado = (empleadoId: number) => {
    return (auditoriaPorEmpleado.get(empleadoId) || []).slice(0, 8)
  }

  const areaLabel = (dist: Distribucion) => {
    const area = areasMap.get(dist.area_id)
    return area ? `${area.codigo} - ${area.nombre}` : `Área ${dist.area_id}`
  }

  const generarPdfEmpleado = async (empleado: Empleado) => {
    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF('p', 'mm', 'letter') as AutoTableDoc
      const cliente = empleado.cliente_id ? clientesMap.get(empleado.cliente_id) : null
      const empresa = empleado.empresa_id ? empresasMap.get(empleado.empresa_id) : null
      const division = empleado.division_id ? divisionesMap.get(empleado.division_id) : null
      const distEmpleado = getDistribucionEmpleado(empleado.id)
      const auditEmpleado = getAuditoriaEmpleado(empleado.id)
      const salarioDiario = toNum(empleado.salario_base) / 30
      const horaNormal = salarioDiario / 8
      const horaExtra = horaNormal * 1.5

      await addPdfHeader(doc, 'Ficha de empleado', `${empleado.codigo} - ${empleado.nombre_completo}`)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Datos generales', 14, 38)

      autoTable(doc, {
        startY: 42,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        body: [
          ['ID / código', safe(empleado.codigo), 'Estado', empleado.estado === 'ACTIVO' ? 'Activo' : 'Baja'],
          ['Nombre completo', safe(empleado.nombre_completo), 'Fecha ingreso', formatDate(empleado.fecha_ingreso)],
          ['DPI', safe(empleado.dpi), 'NIT', safe(empleado.nit)],
          ['Teléfono', safe(empleado.telefono), 'Cliente relacionado', cliente?.nombre || '—'],
          ['Dirección', safe(empleado.direccion), 'Empresa / división', `${empresa?.nombre || '—'} / ${division?.nombre || '—'}`],
          ['Fecha baja', formatDate(empleado.fecha_baja), 'Motivo baja', safe(empleado.motivo_baja)],
        ],
      })

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 78) + 8,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
        head: [['Concepto', 'Valor']],
        body: [
          ['Salario base mensual', money(empleado.salario_base)],
          ['Salario diario estimado', money(salarioDiario)],
          ['Hora normal estimada', money(horaNormal)],
          ['Hora extra 1.5 estimada', money(horaExtra)],
          ['Bono producción diario', money(empleado.bono_produccion_diario)],
        ],
      })

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 120) + 8,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        head: [['Distribución contable por área', 'Porcentaje']],
        body:
          distEmpleado.length > 0
            ? distEmpleado.map((dist) => [areaLabel(dist), `${toNum(dist.porcentaje).toFixed(2)}%`])
            : [['Sin distribución asignada', '0.00%']],
      })

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 150) + 8,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
        head: [['Campo', 'Información']],
        body: [
          ['Observaciones', safe(empleado.observaciones)],
          ['Creado en', formatDate(empleado.created_at)],
          ['Última actualización', formatDate(empleado.updated_at)],
          ['Editado por', safe(empleado.editado_por)],
        ],
      })

      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 180) + 8,
        theme: 'striped',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        head: [['Fecha', 'Acción', 'Usuario', 'Observación']],
        body:
          auditEmpleado.length > 0
            ? auditEmpleado.map((item) => [
                formatDate(item.fecha),
                safe(item.accion),
                safe(item.usuario_email),
                safe(item.observaciones),
              ])
            : [['—', 'Sin movimientos de auditoría recientes', '—', '—']],
      })

      addPdfFooter(doc)
      doc.save(`ficha_empleado_${cleanFilePart(empleado.codigo)}_${cleanFilePart(empleado.nombre_completo)}.pdf`)
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'Error generando ficha PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  const generarPdfListado = async () => {
    setGenerandoPdf(true)
    setMensaje('')

    try {
      const doc = new jsPDF('l', 'mm', 'letter') as AutoTableDoc
      await addPdfHeader(doc, 'Listado de fichas de empleados', `${empleadosFiltrados.length} empleado(s) filtrado(s)`)

      const filtrosTexto = [
        `Estado: ${estadoFiltro}`,
        busqueda ? `Búsqueda: ${busqueda}` : '',
        empresaFiltro ? `Empresa: ${empresasMap.get(Number(empresaFiltro))?.nombre || empresaFiltro}` : '',
        divisionFiltro ? `División: ${divisionesMap.get(Number(divisionFiltro))?.nombre || divisionFiltro}` : '',
        clienteFiltro ? `Cliente: ${clientesMap.get(Number(clienteFiltro))?.nombre || clienteFiltro}` : '',
        areaFiltro ? `Área: ${areasMap.get(Number(areaFiltro))?.nombre || areaFiltro}` : '',
        ingresoDesde ? `Ingreso desde: ${ingresoDesde}` : '',
        ingresoHasta ? `Ingreso hasta: ${ingresoHasta}` : '',
      ].filter(Boolean)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(filtrosTexto.join(' | ') || 'Sin filtros adicionales', 14, 36)

      autoTable(doc, {
        startY: 42,
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.8 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        head: [['ID', 'Empleado', 'Estado', 'Ingreso', 'DPI', 'Teléfono', 'Empresa', 'División', 'Cliente', 'Salario', 'Bono diario']],
        body: empleadosFiltrados.map((empleado) => {
          const cliente = empleado.cliente_id ? clientesMap.get(empleado.cliente_id) : null
          const empresa = empleado.empresa_id ? empresasMap.get(empleado.empresa_id) : null
          const division = empleado.division_id ? divisionesMap.get(empleado.division_id) : null

          return [
            empleado.codigo,
            empleado.nombre_completo,
            empleado.estado === 'ACTIVO' ? 'Activo' : 'Baja',
            formatDate(empleado.fecha_ingreso),
            safe(empleado.dpi),
            safe(empleado.telefono),
            empresa?.nombre || '—',
            division?.nombre || '—',
            cliente?.nombre || '—',
            money(empleado.salario_base),
            money(empleado.bono_produccion_diario),
          ]
        }),
      })

      addPdfFooter(doc)
      doc.save(`listado_fichas_empleados_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'Error generando listado PDF.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start gap-4 mb-5">
        <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-12" />

        <div>
          <h1 className="text-2xl font-bold">Recursos Humanos — Ficha de empleados</h1>
          <p className="text-sm text-gray-600">
            Consulta, filtra e imprime la ficha individual de cada empleado.
          </p>
        </div>

        <div className="ml-auto flex gap-2">
          <Link href="/rrhh" className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded text-sm">
            Volver a RRHH
          </Link>
          <Link href="/menu" className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm">
            Volver al menú
          </Link>
        </div>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-slate-50">{mensaje}</div>}

      <section className="border rounded-lg p-4 bg-white shadow-sm mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Filtros de búsqueda</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cargarTodo}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
            <button type="button" onClick={limpiarFiltros} className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded text-sm">
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="border rounded px-3 py-2 md:col-span-2"
            placeholder="Buscar por ID, nombre, DPI, NIT, teléfono, cliente o área"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />

          <select className="border rounded px-3 py-2" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as 'ACTIVO' | 'BAJA' | 'TODOS')}>
            <option value="ACTIVO">Activos</option>
            <option value="BAJA">Dados de baja</option>
            <option value="TODOS">Todos</option>
          </select>

          <select className="border rounded px-3 py-2" value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresa.nombre}
              </option>
            ))}
          </select>

          <select className="border rounded px-3 py-2" value={divisionFiltro} onChange={(e) => setDivisionFiltro(e.target.value)}>
            <option value="">Todas las divisiones</option>
            {divisiones.map((division) => (
              <option key={division.id} value={division.id}>
                {division.nombre}
              </option>
            ))}
          </select>

          <select className="border rounded px-3 py-2" value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
            <option value="">Todos los clientes vinculados</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </select>

          <select className="border rounded px-3 py-2" value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)}>
            <option value="">Todas las áreas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.codigo} - {area.nombre}
              </option>
            ))}
          </select>

          <div>
            <label className="block text-xs font-semibold mb-1">Ingreso desde</label>
            <input type="date" className="w-full border rounded px-3 py-2" value={ingresoDesde} onChange={(e) => setIngresoDesde(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Ingreso hasta</label>
            <input type="date" className="w-full border rounded px-3 py-2" value={ingresoHasta} onChange={(e) => setIngresoHasta(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Salario desde</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={salarioDesde} onChange={(e) => setSalarioDesde(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Salario hasta</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={salarioHasta} onChange={(e) => setSalarioHasta(e.target.value)} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Empleados encontrados: {empleadosFiltrados.length}</h2>
            <button
              type="button"
              onClick={generarPdfListado}
              disabled={generandoPdf || empleadosFiltrados.length === 0}
              className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
            >
              {generandoPdf ? 'Generando...' : 'PDF listado filtrado'}
            </button>
          </div>

          <div className="max-h-[680px] overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-200 sticky top-0">
                <tr>
                  <th className="p-2 text-left">ID</th>
                  <th className="p-2 text-left">Empleado</th>
                  <th className="p-2 text-left">Empresa / división</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Salario</th>
                  <th className="p-2 text-left">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {empleadosFiltrados.map((empleado) => {
                  const cliente = empleado.cliente_id ? clientesMap.get(empleado.cliente_id) : null
                  const empresa = empleado.empresa_id ? empresasMap.get(empleado.empresa_id) : null
                  const division = empleado.division_id ? divisionesMap.get(empleado.division_id) : null
                  const seleccionado = empleadoSeleccionado?.id === empleado.id

                  return (
                    <tr key={empleado.id} className={seleccionado ? 'border-t align-top bg-emerald-50' : 'border-t align-top'}>
                      <td className="p-2 font-semibold">{empleado.codigo}</td>
                      <td className="p-2">
                        <div className="font-semibold">{empleado.nombre_completo}</div>
                        <div className="text-xs text-gray-600">Ingreso: {formatDate(empleado.fecha_ingreso)}</div>
                        {empleado.dpi && <div className="text-xs text-gray-600">DPI: {empleado.dpi}</div>}
                      </td>
                      <td className="p-2">
                        <div>{empresa?.nombre || '—'}</div>
                        <div className="text-xs text-gray-600">{division?.nombre || '—'}</div>
                      </td>
                      <td className="p-2">{cliente?.nombre || '—'}</td>
                      <td className="p-2">
                        <span className={empleado.estado === 'ACTIVO' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                          {empleado.estado === 'ACTIVO' ? 'Activo' : 'Baja'}
                        </span>
                        {empleado.fecha_baja && <div className="text-xs text-gray-600">{formatDate(empleado.fecha_baja)}</div>}
                      </td>
                      <td className="p-2">
                        <div>{money(empleado.salario_base)}</div>
                        <div className="text-xs text-gray-600">Bono: {money(empleado.bono_produccion_diario)}</div>
                      </td>
                      <td className="p-2">
                        <div className="grid gap-1">
                          <button
                            type="button"
                            onClick={() => setSeleccionadoId(empleado.id)}
                            className="bg-teal-700 hover:bg-teal-800 text-white px-3 py-1 rounded text-xs"
                          >
                            Ver ficha
                          </button>
                          <button
                            type="button"
                            onClick={() => generarPdfEmpleado(empleado)}
                            disabled={generandoPdf}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1 rounded text-xs"
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {empleadosFiltrados.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-600" colSpan={7}>
                      No hay empleados con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Ficha seleccionada</h2>
            {empleadoSeleccionado && (
              <button
                type="button"
                onClick={() => generarPdfEmpleado(empleadoSeleccionado)}
                disabled={generandoPdf}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-2 rounded text-sm"
              >
                {generandoPdf ? 'Generando...' : 'Imprimir PDF'}
              </button>
            )}
          </div>

          {!empleadoSeleccionado ? (
            <p className="text-sm text-gray-600">Seleccione un empleado para ver su ficha.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="border rounded p-3 bg-slate-50">
                <div className="text-xs text-gray-600">ID / código</div>
                <div className="text-lg font-bold">{empleadoSeleccionado.codigo}</div>
                <div className="font-semibold">{empleadoSeleccionado.nombre_completo}</div>
                <div className={empleadoSeleccionado.estado === 'ACTIVO' ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                  {empleadoSeleccionado.estado === 'ACTIVO' ? 'Activo' : 'Dado de baja'}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Datos personales</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="font-semibold">DPI:</span> {safe(empleadoSeleccionado.dpi)}</div>
                  <div><span className="font-semibold">NIT:</span> {safe(empleadoSeleccionado.nit)}</div>
                  <div><span className="font-semibold">Teléfono:</span> {safe(empleadoSeleccionado.telefono)}</div>
                  <div><span className="font-semibold">Ingreso:</span> {formatDate(empleadoSeleccionado.fecha_ingreso)}</div>
                  <div className="col-span-2"><span className="font-semibold">Dirección:</span> {safe(empleadoSeleccionado.direccion)}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Datos laborales</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="font-semibold">Empresa:</span> {empleadoSeleccionado.empresa_id ? empresasMap.get(empleadoSeleccionado.empresa_id)?.nombre || '—' : '—'}</div>
                  <div><span className="font-semibold">División:</span> {empleadoSeleccionado.division_id ? divisionesMap.get(empleadoSeleccionado.division_id)?.nombre || '—' : '—'}</div>
                  <div><span className="font-semibold">Cliente:</span> {empleadoSeleccionado.cliente_id ? clientesMap.get(empleadoSeleccionado.cliente_id)?.nombre || '—' : '—'}</div>
                  <div><span className="font-semibold">Salario:</span> {money(empleadoSeleccionado.salario_base)}</div>
                  <div><span className="font-semibold">Salario diario:</span> {money(toNum(empleadoSeleccionado.salario_base) / 30)}</div>
                  <div><span className="font-semibold">Bono diario:</span> {money(empleadoSeleccionado.bono_produccion_diario)}</div>
                  <div><span className="font-semibold">Fecha baja:</span> {formatDate(empleadoSeleccionado.fecha_baja)}</div>
                  <div><span className="font-semibold">Motivo baja:</span> {safe(empleadoSeleccionado.motivo_baja)}</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Distribución contable</h3>
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {getDistribucionEmpleado(empleadoSeleccionado.id).length > 0 ? (
                        getDistribucionEmpleado(empleadoSeleccionado.id).map((dist) => (
                          <tr key={dist.id} className="border-t first:border-t-0">
                            <td className="p-2">{areaLabel(dist)}</td>
                            <td className="p-2 text-right font-semibold">{toNum(dist.porcentaje).toFixed(2)}%</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td className="p-2 text-gray-600">Sin distribución asignada.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Observaciones y auditoría</h3>
                <div className="text-xs border rounded p-2 mb-2 bg-slate-50">
                  {safe(empleadoSeleccionado.observaciones)}
                </div>
                <div className="space-y-1 text-xs">
                  {getAuditoriaEmpleado(empleadoSeleccionado.id).length > 0 ? (
                    getAuditoriaEmpleado(empleadoSeleccionado.id).map((item) => (
                      <div key={item.id} className="border rounded p-2">
                        <div className="font-semibold">{formatDate(item.fecha)} — {item.accion}</div>
                        <div>{safe(item.observaciones)}</div>
                        <div className="text-gray-600">{safe(item.usuario_email)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-600">Sin auditoría reciente.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
