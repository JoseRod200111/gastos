'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

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
  estado: 'ACTIVO' | 'BAJA'
  salario_base: number
  empresa_id: number | null
  division_id: number | null
}

type Finiquito = {
  id: number
  empleado_id: number
  fecha_documento: string
  lugar: string
  tipo_finiquito: string
  empresa_nombre: string
  nombre_empleado: string
  dpi: string | null
  descripcion_personal: string
  fecha_ingreso: string
  fecha_salida: string
  motivo_baja: string
  forma_pago: string
  monto_total: number
  monto_letras: string
  observaciones: string | null
  estado: 'BORRADOR' | 'EMITIDO' | 'ANULADO'
  created_at: string
}

type FormState = {
  id: number | null
  empleado_id: string
  fecha_documento: string
  lugar: string
  tipo_finiquito: string
  empresa_nombre: string
  nombre_empleado: string
  dpi: string
  descripcion_personal: string
  fecha_ingreso: string
  fecha_salida: string
  motivo_baja: string
  forma_pago: string
  monto_total: string
  monto_letras: string
  observaciones: string
  estado: 'BORRADOR' | 'EMITIDO' | 'ANULADO'
}

const todayISO = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const emptyForm = (): FormState => ({
  id: null,
  empleado_id: '',
  fecha_documento: todayISO(),
  lugar: 'GUATEMALA',
  tipo_finiquito: 'RENUNCIA VOLUNTARIA',
  empresa_nombre: 'AGROINDUSTRIAS RYB SA',
  nombre_empleado: '',
  dpi: '',
  descripcion_personal: 'guatemalteco(a), mayor de edad',
  fecha_ingreso: '',
  fecha_salida: todayISO(),
  motivo_baja: 'RENUNCIA VOLUNTARIA',
  forma_pago: 'dinero en efectivo',
  monto_total: '',
  monto_letras: '',
  observaciones: '',
  estado: 'EMITIDO',
})

const toNum = (value: string | number | null | undefined) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: string | number | null | undefined) => {
  return `Q. ${toNum(value).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const escapeHtml = (value: string | number | null | undefined) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const RRHH_LOGO_URL = '/Logo%20Tech%209_Fondo%20Transparente.png'

const getRrhhLogoAbsoluteUrl = () => {
  if (typeof window === 'undefined') return RRHH_LOGO_URL
  return `${window.location.origin}${RRHH_LOGO_URL}`
}

const meses = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
]

const unidades = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
]

const decenas = [
  '',
  '',
  'VEINTE',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
]

const centenas = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
]

const numeroEnteroALetras = (numero: number): string => {
  const n = Math.floor(Math.abs(numero))
  if (n === 0) return 'CERO'
  if (n < 20) return unidades[n]
  if (n < 30) {
    if (n === 20) return 'VEINTE'
    return `VEINTI${unidades[n - 20].toLowerCase()}`.toUpperCase()
  }
  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`
  }
  if (n === 100) return 'CIEN'
  if (n < 1000) {
    const c = Math.floor(n / 100)
    const r = n % 100
    return r === 0 ? centenas[c] : `${centenas[c]} ${numeroEnteroALetras(r)}`
  }
  if (n < 1000000) {
    const miles = Math.floor(n / 1000)
    const r = n % 1000
    const prefijo = miles === 1 ? 'MIL' : `${numeroEnteroALetras(miles)} MIL`
    return r === 0 ? prefijo : `${prefijo} ${numeroEnteroALetras(r)}`
  }
  const millones = Math.floor(n / 1000000)
  const r = n % 1000000
  const prefijo = millones === 1 ? 'UN MILLÓN' : `${numeroEnteroALetras(millones)} MILLONES`
  return r === 0 ? prefijo : `${prefijo} ${numeroEnteroALetras(r)}`
}

const quetzalesALetras = (value: string | number | null | undefined) => {
  const monto = toNum(value)
  const entero = Math.floor(Math.abs(monto))
  const centavos = Math.round((Math.abs(monto) - entero) * 100)
  const base = `${numeroEnteroALetras(entero)} QUETZALES`
  if (centavos === 0) return `${base} EXACTOS`
  return `${base} CON ${String(centavos).padStart(2, '0')}/100`
}

const fechaNormal = (fecha: string) => {
  if (!fecha) return ''
  const [year, month, day] = fecha.split('-')
  return `${day}/${month}/${year}`
}

const fechaLarga = (fecha: string) => {
  if (!fecha) return ''
  const [year, month, day] = fecha.split('-').map(Number)
  return `${day} DE ${meses[month - 1]} DE ${year}`
}

const fechaLegal = (lugar: string, fecha: string) => {
  if (!fecha) return lugar.toUpperCase()
  const [year, month, day] = fecha.split('-').map(Number)
  return `${lugar.toUpperCase()}, ${numeroEnteroALetras(day)} (${day}) DE ${meses[month - 1]} DEL AÑO ${numeroEnteroALetras(year)} (${year})`
}

const buildFiniquitoHtml = (form: FormState) => {
  const logoUrl = getRrhhLogoAbsoluteUrl()
  const montoLetras = form.monto_letras.trim() || quetzalesALetras(form.monto_total)
  const dpi = form.dpi.trim() || 'SIN DPI REGISTRADO'

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Finiquito ${escapeHtml(form.nombre_empleado)}</title>
<style>
  @page { size: letter; margin: 1.55cm 1.75cm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12.5px; line-height: 1.42; }
  .doc { max-width: 760px; margin: 0 auto; }
  .logo-wrap { text-align: center; margin-bottom: 8px; }
  .logo { width: 78px; height: 78px; object-fit: contain; }
  h1 { text-align: center; font-size: 16px; margin: 0 0 12px 0; text-transform: uppercase; }
  h2 { text-align: center; font-size: 14px; margin: 0 0 12px 0; text-transform: uppercase; }
  .fecha { text-align: center; font-weight: 700; margin-bottom: 14px; text-transform: uppercase; }
  p { margin: 0 0 10px 0; text-align: justify; }
  .monto { text-align: center; font-size: 18px; font-weight: 700; margin: 12px 0 2px; }
  .letras { text-align: center; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; }
  ul { margin: 4px 0 10px 28px; padding: 0; }
  li { margin-bottom: 3px; }
  .firma { margin-top: 55px; text-align: center; }
  .linea { width: 330px; border-top: 1px solid #111; margin: 0 auto 8px; }
  .meta { margin-top: 6px; }
  .no-print { margin-bottom: 16px; text-align: right; }
  .no-print button { padding: 8px 12px; border: 0; border-radius: 4px; color: white; background: #1d4ed8; cursor: pointer; }
  @media print { .no-print { display: none; } body { print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc">
  <div class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <div class="logo-wrap"><img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo Tech Nine" /></div>
  <h1>Finiquito laboral por ${escapeHtml(form.tipo_finiquito)}</h1>
  <div class="fecha">${escapeHtml(fechaLegal(form.lugar, form.fecha_documento))}</div>
  <h2>Finiquito laboral, ${escapeHtml(form.tipo_finiquito)} y recibo de pago total</h2>

  <p>Yo, <strong>${escapeHtml(form.nombre_empleado)}</strong>, ${escapeHtml(form.descripcion_personal)}, me identifico con Documento Personal de Identificación -DPI- número <strong>${escapeHtml(dpi)}</strong>, por medio del presente documento <strong>HAGO CONSTAR:</strong></p>

  <p><strong>PRIMERO:</strong> Que ingresé a laborar para la entidad mercantil <strong>${escapeHtml(form.empresa_nombre)}</strong>, el día <strong>${escapeHtml(fechaLarga(form.fecha_ingreso))}</strong>, finalizando la relación laboral el día <strong>${escapeHtml(fechaLarga(form.fecha_salida))}</strong>, por <strong>${escapeHtml(form.motivo_baja)}</strong>, libre y espontánea, sin que haya mediado despido, presión, amenaza, engaño o coacción alguna por parte del patrono.</p>

  <p><strong>SEGUNDO:</strong> Que he recibido a mi entera y completa satisfacción, en ${escapeHtml(form.forma_pago)}, la cantidad total de:</p>
  <div class="monto">${escapeHtml(money(form.monto_total))}</div>
  <div class="letras">(${escapeHtml(montoLetras)})</div>

  <p><strong>TERCERO:</strong> Declaro expresamente que el monto recibido corresponde al <strong>PAGO TOTAL, DEFINITIVO Y SIN RESERVA ALGUNA</strong> de todos los derechos derivados de la relación laboral, incluyendo pero no limitándose a:</p>
  <ul>
    <li>Salarios ordinarios y extraordinarios devengados</li>
    <li>Vacaciones vencidas y/o proporcionales</li>
    <li>Aguinaldo proporcional</li>
    <li>Bono 14 proporcional</li>
    <li>Bonificaciones, comisiones, horas extras, si existieran</li>
    <li>Cualquier otra prestación laboral, legal o contractual</li>
    <li>Cualquier ajuste pendiente ante IGSS, SAT o Ministerio de Trabajo</li>
  </ul>

  <p><strong>CUARTO:</strong> Manifiesto que <strong>NO EXISTE</strong> saldo pendiente alguno a mi favor, por lo que declaro totalmente solvente a <strong>${escapeHtml(form.empresa_nombre)}</strong>.</p>

  <p><strong>QUINTO:</strong> En virtud de lo anterior, <strong>RENUNCIO DE FORMA EXPRESA, VOLUNTARIA, DEFINITIVA E IRREVOCABLE</strong> a iniciar, promover o continuar cualquier tipo de acción, reclamo o demanda, de carácter administrativo, judicial o extrajudicial, en contra de <strong>${escapeHtml(form.empresa_nombre)}</strong>, sus representantes legales, accionistas, administradores o empleados, ante el Ministerio de Trabajo, IGSS, juzgados laborales o cualquier otra autoridad, por hechos presentes o futuros, conocidos o desconocidos, derivados directa o indirectamente de la relación laboral.</p>

  <p><strong>SEXTO:</strong> Declaro bajo juramento que firmo el presente documento en pleno uso de mis facultades mentales, libre de error, dolo, violencia o intimidación, comprendiendo plenamente su contenido y alcance legal.</p>

  <p>Para los efectos legales correspondientes, firmo el presente <strong>FINIQUITO LABORAL POR ${escapeHtml(form.tipo_finiquito)} Y RECIBO DE PAGO TOTAL</strong>, en el lugar y fecha indicados.</p>

  <div class="firma">
    <div class="linea"></div>
    <div><strong>${escapeHtml(form.nombre_empleado)}</strong></div>
    <div class="meta">DPI No. ${escapeHtml(dpi)}</div>
    <div class="meta">Huella dactilar:</div>
  </div>
</div>
</body>
</html>`
}

export default function RrhhFiniquitosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [finiquitos, setFiniquitos] = useState<Finiquito[]>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busqueda, setBusqueda] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'TODOS' | 'ACTIVO' | 'BAJA'>('ACTIVO')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargarDatos = async () => {
    setLoading(true)
    setMensaje('')

    const [empleadosRes, finiquitosRes] = await Promise.all([
      supabase
        .from('rrhh_empleados')
        .select('id,codigo,nombre_completo,dpi,nit,telefono,direccion,fecha_ingreso,fecha_baja,motivo_baja,estado,salario_base,empresa_id,division_id')
        .order('nombre_completo', { ascending: true }),
      supabase
        .from('rrhh_finiquitos')
        .select('id,empleado_id,fecha_documento,lugar,tipo_finiquito,empresa_nombre,nombre_empleado,dpi,descripcion_personal,fecha_ingreso,fecha_salida,motivo_baja,forma_pago,monto_total,monto_letras,observaciones,estado,created_at')
        .order('created_at', { ascending: false }),
    ])

    if (empleadosRes.error) setMensaje(`Error cargando empleados: ${empleadosRes.error.message}`)
    if (finiquitosRes.error) setMensaje(`Error cargando finiquitos: ${finiquitosRes.error.message}`)

    setEmpleados((empleadosRes.data || []) as Empleado[])
    setFiniquitos((finiquitosRes.data || []) as Finiquito[])
    setLoading(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const empleadosMap = useMemo(() => {
    const map = new Map<number, Empleado>()
    empleados.forEach((empleado) => map.set(empleado.id, empleado))
    return map
  }, [empleados])

  const empleadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return empleados.filter((empleado) => {
      const estadoOk = estadoFiltro === 'TODOS' || empleado.estado === estadoFiltro
      const texto = `${empleado.codigo} ${empleado.nombre_completo} ${empleado.dpi || ''} ${empleado.nit || ''}`.toLowerCase()
      return estadoOk && (q === '' || texto.includes(q))
    })
  }, [busqueda, empleados, estadoFiltro])

  const finiquitosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return finiquitos.filter((finiquito) => {
      const empleado = empleadosMap.get(finiquito.empleado_id)
      const estadoEmpleado = empleado?.estado || 'BAJA'
      const estadoOk = estadoFiltro === 'TODOS' || estadoEmpleado === estadoFiltro
      const texto = `${finiquito.nombre_empleado} ${finiquito.dpi || ''} ${empleado?.codigo || ''}`.toLowerCase()
      return estadoOk && (q === '' || texto.includes(q))
    })
  }, [busqueda, empleadosMap, estadoFiltro, finiquitos])

  const seleccionarEmpleado = (empleadoId: string) => {
    const empleado = empleadosMap.get(Number(empleadoId))
    if (!empleado) {
      setForm({ ...emptyForm(), empleado_id: empleadoId })
      return
    }

    setForm({
      ...emptyForm(),
      empleado_id: String(empleado.id),
      nombre_empleado: empleado.nombre_completo,
      dpi: empleado.dpi || '',
      fecha_ingreso: empleado.fecha_ingreso || '',
      fecha_salida: empleado.fecha_baja || todayISO(),
      motivo_baja: empleado.motivo_baja || 'RENUNCIA VOLUNTARIA',
      tipo_finiquito: empleado.motivo_baja || 'RENUNCIA VOLUNTARIA',
      monto_letras: '',
    })
  }

  const editarFiniquito = (finiquito: Finiquito) => {
    setForm({
      id: finiquito.id,
      empleado_id: String(finiquito.empleado_id),
      fecha_documento: finiquito.fecha_documento,
      lugar: finiquito.lugar,
      tipo_finiquito: finiquito.tipo_finiquito,
      empresa_nombre: finiquito.empresa_nombre,
      nombre_empleado: finiquito.nombre_empleado,
      dpi: finiquito.dpi || '',
      descripcion_personal: finiquito.descripcion_personal,
      fecha_ingreso: finiquito.fecha_ingreso,
      fecha_salida: finiquito.fecha_salida,
      motivo_baja: finiquito.motivo_baja,
      forma_pago: finiquito.forma_pago,
      monto_total: String(finiquito.monto_total || ''),
      monto_letras: finiquito.monto_letras,
      observaciones: finiquito.observaciones || '',
      estado: finiquito.estado,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const generarLetras = () => {
    setForm((prev) => ({ ...prev, monto_letras: quetzalesALetras(prev.monto_total) }))
  }

  const imprimirFormulario = (source?: Finiquito) => {
    const data = source
      ? {
          id: source.id,
          empleado_id: String(source.empleado_id),
          fecha_documento: source.fecha_documento,
          lugar: source.lugar,
          tipo_finiquito: source.tipo_finiquito,
          empresa_nombre: source.empresa_nombre,
          nombre_empleado: source.nombre_empleado,
          dpi: source.dpi || '',
          descripcion_personal: source.descripcion_personal,
          fecha_ingreso: source.fecha_ingreso,
          fecha_salida: source.fecha_salida,
          motivo_baja: source.motivo_baja,
          forma_pago: source.forma_pago,
          monto_total: String(source.monto_total),
          monto_letras: source.monto_letras,
          observaciones: source.observaciones || '',
          estado: source.estado,
        }
      : form

    if (!data.nombre_empleado || !data.fecha_ingreso || !data.fecha_salida) {
      setMensaje('Completa empleado, fecha de ingreso y fecha de salida antes de imprimir.')
      return
    }

    const win = window.open('', '_blank')
    if (!win) {
      setMensaje('El navegador bloqueó la ventana de impresión. Permite pop-ups para este sitio.')
      return
    }

    win.document.write(buildFiniquitoHtml(data))
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const guardarFiniquito = async () => {
    setMensaje('')
    const empleadoId = Number(form.empleado_id)

    if (!empleadoId) {
      setMensaje('Selecciona un empleado.')
      return
    }

    if (!form.fecha_ingreso || !form.fecha_salida) {
      setMensaje('Fecha de ingreso y fecha de salida son obligatorias.')
      return
    }

    if (toNum(form.monto_total) < 0) {
      setMensaje('El monto no puede ser negativo.')
      return
    }

    setSaving(true)

    const sessionRes = await supabase.auth.getUser()
    const userId = sessionRes.data.user?.id || null
    const userEmail = sessionRes.data.user?.email || 'usuario'
    const montoLetras = form.monto_letras.trim() || quetzalesALetras(form.monto_total)

    const payload = {
      empleado_id: empleadoId,
      fecha_documento: form.fecha_documento,
      lugar: form.lugar.trim() || 'GUATEMALA',
      tipo_finiquito: form.tipo_finiquito.trim().toUpperCase() || 'RENUNCIA VOLUNTARIA',
      empresa_nombre: form.empresa_nombre.trim() || 'AGROINDUSTRIAS RYB SA',
      nombre_empleado: form.nombre_empleado.trim(),
      dpi: form.dpi.trim() || null,
      descripcion_personal: form.descripcion_personal.trim() || 'guatemalteco(a), mayor de edad',
      fecha_ingreso: form.fecha_ingreso,
      fecha_salida: form.fecha_salida,
      motivo_baja: form.motivo_baja.trim().toUpperCase() || 'RENUNCIA VOLUNTARIA',
      forma_pago: form.forma_pago.trim() || 'dinero en efectivo',
      monto_total: toNum(form.monto_total),
      monto_letras: montoLetras,
      observaciones: form.observaciones.trim() || null,
      estado: form.estado,
      user_id: userId,
      editado_por: userEmail,
      editado_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const guardarRes = form.id
      ? await supabase.from('rrhh_finiquitos').update(payload).eq('id', form.id).select('id').single()
      : await supabase.from('rrhh_finiquitos').insert(payload).select('id').single()

    if (guardarRes.error) {
      setMensaje(`Error guardando finiquito: ${guardarRes.error.message}`)
      setSaving(false)
      return
    }

    let observacionAuditoria = 'Finiquito guardado como borrador; el estado del empleado no cambió.'
    let mensajeFinal = 'Finiquito guardado como borrador. El empleado mantiene su estado actual.'

    if (form.estado === 'EMITIDO' || form.estado === 'ANULADO') {
      const empleadoUpdate = await supabase
        .from('rrhh_empleados')
        .update({
          estado: form.estado === 'ANULADO' ? 'ACTIVO' : 'BAJA',
          fecha_baja: form.estado === 'ANULADO' ? null : form.fecha_salida,
          motivo_baja: form.estado === 'ANULADO' ? null : payload.motivo_baja,
          editado_por: userEmail,
          editado_en: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', empleadoId)

      if (empleadoUpdate.error) {
        setMensaje(`Finiquito guardado, pero no se pudo actualizar el estado del empleado: ${empleadoUpdate.error.message}`)
        setSaving(false)
        await cargarDatos()
        return
      }

      observacionAuditoria = form.estado === 'ANULADO' ? 'Finiquito anulado; empleado reactivado.' : 'Finiquito emitido; empleado marcado como BAJA.'
      mensajeFinal = form.estado === 'ANULADO' ? 'Finiquito guardado como anulado y empleado reactivado.' : 'Finiquito guardado y empleado marcado como baja.'
    }

    await supabase.from('rrhh_auditoria').insert({
      tabla: 'rrhh_finiquitos',
      accion: form.id ? 'EDITAR_FINIQUITO' : 'CREAR_FINIQUITO',
      registro_id: String(guardarRes.data?.id || form.id || ''),
      empleado_id: empleadoId,
      usuario_id: userId,
      usuario_email: userEmail,
      detalle: payload,
      observaciones: observacionAuditoria,
    })

    setMensaje(mensajeFinal)
    setSaving(false)
    await cargarDatos()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          <img src={RRHH_LOGO_URL} alt="Logo Tech Nine" className="h-20" />
          <div>
            <h1 className="text-2xl font-bold">Recursos Humanos — Finiquitos</h1>
            <p className="text-sm text-slate-600">
              Genera el finiquito laboral, actualiza el estado del empleado y permite imprimirlo como PDF.
            </p>
          </div>
        </div>
        <Link href="/rrhh" className="px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800">
          Volver a RRHH
        </Link>
      </div>

      {mensaje && <div className="mb-4 border rounded p-3 text-sm bg-white">{mensaje}</div>}

      <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Datos del finiquito</h2>
            <button
              type="button"
              onClick={() => setForm(emptyForm())}
              className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300 text-sm"
            >
              Nuevo
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              Empleado
              <select
                value={form.empleado_id}
                onChange={(e) => seleccionarEmpleado(e.target.value)}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="">Selecciona empleado</option>
                {empleados.map((empleado) => (
                  <option key={empleado.id} value={empleado.id}>
                    {empleado.codigo} — {empleado.nombre_completo} ({empleado.estado})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              Estado del finiquito
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as FormState['estado'] })}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="BORRADOR">Borrador</option>
                <option value="EMITIDO">Emitido</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </label>

            <label className="text-sm">
              Nombre empleado
              <input
                value={form.nombre_empleado}
                onChange={(e) => setForm({ ...form, nombre_empleado: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              DPI
              <input
                value={form.dpi}
                onChange={(e) => setForm({ ...form, dpi: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Descripción personal
              <input
                value={form.descripcion_personal}
                onChange={(e) => setForm({ ...form, descripcion_personal: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Empresa / patrono
              <input
                value={form.empresa_nombre}
                onChange={(e) => setForm({ ...form, empresa_nombre: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Fecha documento
              <input
                type="date"
                value={form.fecha_documento}
                onChange={(e) => setForm({ ...form, fecha_documento: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Lugar
              <input
                value={form.lugar}
                onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Fecha ingreso
              <input
                type="date"
                value={form.fecha_ingreso}
                onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Fecha salida
              <input
                type="date"
                value={form.fecha_salida}
                onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Tipo de finiquito
              <input
                value={form.tipo_finiquito}
                onChange={(e) => setForm({ ...form, tipo_finiquito: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Motivo de baja
              <input
                value={form.motivo_baja}
                onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Forma de pago
              <input
                value={form.forma_pago}
                onChange={(e) => setForm({ ...form, forma_pago: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm">
              Monto total
              <input
                type="number"
                step="0.01"
                value={form.monto_total}
                onChange={(e) => setForm({ ...form, monto_total: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              />
            </label>

            <label className="text-sm md:col-span-2">
              Monto en letras
              <div className="flex gap-2 mt-1">
                <input
                  value={form.monto_letras}
                  onChange={(e) => setForm({ ...form, monto_letras: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="Se puede generar automáticamente"
                />
                <button
                  type="button"
                  onClick={generarLetras}
                  className="px-3 py-2 rounded bg-slate-700 text-white whitespace-nowrap"
                >
                  Generar letras
                </button>
              </div>
            </label>

            <label className="text-sm md:col-span-2">
              Observaciones internas
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                className="w-full border rounded p-2 mt-1 min-h-20"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={guardarFiniquito}
              disabled={saving}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-400"
            >
              {saving ? 'Guardando...' : 'Guardar y actualizar empleado'}
            </button>
            <button
              type="button"
              onClick={() => imprimirFormulario()}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Imprimir PDF
            </button>
          </div>

          <p className="text-xs text-slate-600 mt-3">
            Al guardar un finiquito emitido, el empleado pasa a estado BAJA con la fecha de salida indicada. Si el finiquito se guarda como anulado, el empleado se reactiva.
          </p>
        </section>

        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="font-semibold mb-3">Buscar empleados y finiquitos</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_180px] mb-4">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código, nombre, DPI o NIT"
              className="border rounded p-2"
            />
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as 'TODOS' | 'ACTIVO' | 'BAJA')}
              className="border rounded p-2"
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activos</option>
              <option value="BAJA">Baja</option>
            </select>
          </div>

          <div className="border rounded mb-5 overflow-auto max-h-72">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-200 sticky top-0">
                <tr>
                  <th className="border p-2 text-left">ID</th>
                  <th className="border p-2 text-left">Empleado</th>
                  <th className="border p-2 text-left">Estado</th>
                  <th className="border p-2 text-left">Acción</th>
                </tr>
              </thead>
              <tbody>
                {empleadosFiltrados.map((empleado) => (
                  <tr key={empleado.id}>
                    <td className="border p-2 font-semibold">{empleado.codigo}</td>
                    <td className="border p-2">{empleado.nombre_completo}</td>
                    <td className="border p-2">{empleado.estado}</td>
                    <td className="border p-2">
                      <button
                        type="button"
                        onClick={() => seleccionarEmpleado(String(empleado.id))}
                        className="px-2 py-1 rounded bg-slate-700 text-white"
                      >
                        Seleccionar
                      </button>
                    </td>
                  </tr>
                ))}
                {empleadosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border p-3 text-slate-600">
                      {loading ? 'Cargando...' : 'No hay empleados con los filtros aplicados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="font-semibold mb-3">Finiquitos registrados</h2>
          <div className="border rounded overflow-auto max-h-[420px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-200 sticky top-0">
                <tr>
                  <th className="border p-2 text-left">Fecha</th>
                  <th className="border p-2 text-left">Empleado</th>
                  <th className="border p-2 text-right">Monto</th>
                  <th className="border p-2 text-left">Estado</th>
                  <th className="border p-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {finiquitosFiltrados.map((finiquito) => (
                  <tr key={finiquito.id}>
                    <td className="border p-2">{fechaNormal(finiquito.fecha_salida)}</td>
                    <td className="border p-2">{finiquito.nombre_empleado}</td>
                    <td className="border p-2 text-right">{money(finiquito.monto_total)}</td>
                    <td className="border p-2">{finiquito.estado}</td>
                    <td className="border p-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => editarFiniquito(finiquito)}
                          className="px-2 py-1 rounded bg-slate-700 text-white"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => imprimirFormulario(finiquito)}
                          className="px-2 py-1 rounded bg-blue-600 text-white"
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {finiquitosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border p-3 text-slate-600">
                      No hay finiquitos registrados con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
