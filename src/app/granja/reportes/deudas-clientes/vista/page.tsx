'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  agruparVentasDeuda, aCentavos, codigoFolioMT, formatoQuetzales, normalizarVentaDeuda,
  sumarOperaciones, type OperacionDeuda, type VentaGranjaDeuda,
} from '@/lib/granjaDeudasMt'

export const dynamic = 'force-dynamic'

type FormaPago = { id: number; metodo: string }
type EstadoVista = 'PENDIENTES' | 'SIN_SALDO' | 'TODAS'
type ModoAbono = 'AUTO' | 'OPERACION' | 'TRAMO'
type AbonoRegistrado = {
  id: number; fecha: string; monto: number; modo: ModoAbono
  venta_referencia_id: number | null; metodo_pago_id: number
  documento: string | null; observaciones: string | null
  registrado_en: string; usuario_id: string
}
type AplicacionAbono = {
  id: number; abono_id: number; venta_id: number; monto: number
  saldo_antes: number; saldo_despues: number
}

const PAGO_MINIMO = 0.009
const TAMANIO_PAGINA = 800

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

function coincidenBusqueda(grupos: OperacionDeuda[], busqueda: string): OperacionDeuda[] {
  const texto = busqueda.trim()
  if (!texto) return grupos
  const mtExplicito = texto.match(/^MT\s*0*([1-9]\d*)$/i)
  if (mtExplicito) return grupos.filter((g) => g.multi_folio === Number(mtExplicito[1]) || g.etiqueta.toUpperCase() === texto.toUpperCase())
  const idExplicito = texto.match(/^#\s*([1-9]\d*)$/)
  if (idExplicito) return grupos.filter((g) => g.tramos.some((v) => v.id === Number(idExplicito[1])))
  if (/^\d+$/.test(texto)) {
    const folio = Number(texto)
    const encontrados = grupos.filter((g) => g.multi_folio === folio)
    if (encontrados.length > 0) return encontrados
    return grupos.filter((g) => g.tramos.some((v) => v.id === folio))
  }
  const normalizado = texto.toLocaleLowerCase('es')
  return grupos.filter((g) =>
    g.etiqueta.toLocaleLowerCase('es').includes(normalizado) ||
    g.tramos.some((v) => String(v.id).includes(normalizado) ||
      (v.granja_ubicaciones?.codigo || '').toLocaleLowerCase('es').includes(normalizado))
  )
}

function VistaDeudasClienteInner() {
  const sp = useSearchParams()
  const clienteId = Number(sp.get('cliente_id') || 0)
  const [ventas, setVentas] = useState<VentaGranjaDeuda[]>([])
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [loading, setLoading] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [estadoVista, setEstadoVista] = useState<EstadoVista>('PENDIENTES')
  const [expandidos, setExpandidos] = useState<string[]>([])
  const [historial, setHistorial] = useState<AbonoRegistrado[]>([])
  const [aplicaciones, setAplicaciones] = useState<AplicacionAbono[]>([])
  const [historialError, setHistorialError] = useState('')
  const [historialCargando, setHistorialCargando] = useState(false)
  const [limiteHistorial, setLimiteHistorial] = useState(50)
  const [historialExpandido, setHistorialExpandido] = useState<number[]>([])
  const solicitudRef = useRef<string | null>(null)
  const [mensajeAbono, setMensajeAbono] = useState('')


  // ETAPA 2: cada abono se realiza en una unica transaccion SQL auditable.
  const [modo, setModo] = useState<ModoAbono>('AUTO')
  const [operacionClave, setOperacionClave] = useState('')
  const [ventaId, setVentaId] = useState('')
  const [fecha, setFecha] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [monto, setMonto] = useState('0')
  const [documento, setDocumento] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const cambiarSolicitud = () => { solicitudRef.current = null; setMensajeAbono('') }

  useEffect(() => {
    const hoy = new Date()
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
    setFecha(`${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`)
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('forma_pago').select('id, metodo').order('id', { ascending: true })
      setFormasPago((data || []) as FormaPago[])
    })()
  }, [])

  const cargar = useCallback(async () => {
    if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
      setVentas([])
      setErrorCarga('Identificador de cliente inválido.')
      return
    }
    setLoading(true)
    setErrorCarga('')
    try {
      const resultado: VentaGranjaDeuda[] = []
      // Supabase/PostgREST limita el número de filas por respuesta: paginar para
      // incluir todos los tramos, incluso si algunos ya están completamente pagados.
      for (let inicio = 0; ; inicio += TAMANIO_PAGINA) {
        const { data, error } = await supabase
          .from('granja_ventas_cerdos')
          .select(`id, fecha, cliente_id, ubicacion_id, total, pagado, deuda,
            observaciones, multi_id, multi_folio,
            clientes ( nombre, nit ), granja_ubicaciones ( codigo, nombre )`)
          .eq('cliente_id', clienteId)
          .order('id', { ascending: true })
          .range(inicio, inicio + TAMANIO_PAGINA - 1)
        if (error) throw error
        const pagina = ((data || []) as unknown as Record<string, unknown>[]).map(normalizarVentaDeuda)
        resultado.push(...pagina)
        if (pagina.length < TAMANIO_PAGINA) break
      }
      setVentas(resultado)
    } catch (e) {
      console.error('Error cargando deudas de Granja', e)
      setErrorCarga('No fue posible cargar todas las ventas del cliente. No se muestran importes parciales.')
      setVentas([])
    } finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { void cargar() }, [cargar])

  const grupos = useMemo(() => agruparVentasDeuda(ventas), [ventas])
  const gruposPendientes = useMemo(() => grupos.filter((g) => g.deuda > PAGO_MINIMO), [grupos])
  const totales = useMemo(() => sumarOperaciones(gruposPendientes), [gruposPendientes])
  const pendientes = useMemo(() => ventas.filter((v) => v.deuda > PAGO_MINIMO)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id), [ventas])
  const gruposMostrados = useMemo(() => coincidenBusqueda(grupos, buscar).filter((g) =>
    estadoVista === 'TODAS' || (estadoVista === 'PENDIENTES' ? g.deuda > PAGO_MINIMO : g.deuda <= PAGO_MINIMO)
  ), [grupos, buscar, estadoVista])
  const clienteNombre = ventas[0]?.clientes?.nombre || (clienteId ? `Cliente #${clienteId}` : '—')
  const clienteNit = ventas[0]?.clientes?.nit || '—'

  const cargarHistorial = useCallback(async () => {
    if (!Number.isSafeInteger(clienteId) || clienteId <= 0) return
    setHistorialCargando(true)
    setHistorialError('')
    try {
      const { data, error } = await supabase.from('granja_abonos_clientes')
        .select('id,fecha,monto,modo,venta_referencia_id,metodo_pago_id,documento,observaciones,registrado_en,usuario_id')
        .eq('cliente_id', clienteId).order('id', { ascending: false })
        .range(0, limiteHistorial - 1)
      if (error) throw error
      const abonos = (data || []) as AbonoRegistrado[]
      const ids = abonos.map((a) => a.id)
      let lineas: AplicacionAbono[] = []
      if (ids.length) {
        const { data: det, error: errDet } = await supabase.from('granja_abono_aplicaciones')
          .select('id,abono_id,venta_id,monto,saldo_antes,saldo_despues')
          .in('abono_id', ids).order('id', { ascending: true })
        if (errDet) throw errDet
        lineas = (det || []) as AplicacionAbono[]
      }
      setHistorial(abonos)
      setAplicaciones(lineas)
    } catch (err) {
      console.error('Error cargando historial de abonos', err)
      setHistorial([])
      setAplicaciones([])
      setHistorialError('No está disponible el historial de abonos. Instala primero el SQL de la Etapa 2 y verifica tu sesión.')
    } finally {
      setHistorialCargando(false)
    }
  }, [clienteId, limiteHistorial])

  useEffect(() => { void cargarHistorial() }, [cargarHistorial])

  const operacionSeleccionada = gruposPendientes.find((g) => g.clave === operacionClave)
  const tramoSeleccionado = pendientes.find((v) => String(v.id) === ventaId)
  const disponibleSeleccionado = modo === 'AUTO'
    ? pendientes.reduce((acum, v) => acum + aCentavos(v.deuda), 0) / 100
    : modo === 'OPERACION' ? (operacionSeleccionada?.deuda ?? 0) : (tramoSeleccionado?.deuda ?? 0)

  const registrarAbono = async () => {
    if (registrando || loading || historialCargando) return
    if (!Number.isSafeInteger(clienteId) || clienteId<=0) { alert('Cliente inválido.'); return }
    if (errorCarga || historialError) { alert('Primero verifica que se hayan cargado las ventas y que el SQL de Etapa 2 esté instalado.'); return }
    const textoMonto = monto.trim()
    const m = Number(textoMonto)
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(textoMonto) || !Number.isFinite(m) || m<=0) {
      alert('Introduce un monto válido con hasta dos decimales.'); return
    }
    const centavos = aCentavos(m)
    if (centavos <= 0 || centavos > aCentavos(disponibleSeleccionado)) {
      alert(`El monto debe ser mayor que cero y no superar ${formatoQuetzales(disponibleSeleccionado)}.`); return
    }
    const metodo = formasPago.find((fp) => fp.id === Number(metodoPagoId))
    if (!metodo || metodo.metodo.toLowerCase().includes('pendiente')) {
      alert('Selecciona un método de pago real, no Pendiente.'); return
    }
    if (!fecha) { alert('Selecciona la fecha real del abono.'); return }
    const idReferencia = modo === 'OPERACION'
      ? (operacionSeleccionada?.tramos[0]?.id ?? null)
      : modo === 'TRAMO' ? (tramoSeleccionado?.id ?? null) : null
    if (modo !== 'AUTO' && !idReferencia) { alert('Selecciona una operación o un ID individual.'); return }
    const etiqueta = modo === 'AUTO' ? 'las deudas más antiguas del cliente'
      : modo === 'OPERACION' ? `la operación ${operacionSeleccionada?.etiqueta}` : `la venta #${idReferencia}`
    if (!window.confirm(`Registrar abono de ${formatoQuetzales(m)} a ${etiqueta}?\n\nSe aplicará en una sola transacción y quedará en el historial.`)) return
    setRegistrando(true)
    setMensajeAbono('')
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error('Inicia sesión para registrar un abono.')
      if (!solicitudRef.current) solicitudRef.current = crypto.randomUUID()
      const { data, error } = await supabase.rpc('granja_registrar_abono_cliente', {
        p_solicitud_id: solicitudRef.current,
        p_cliente_id: clienteId,
        p_modo: modo,
        p_venta_id: idReferencia,
        p_fecha: fecha,
        p_monto: centavos / 100,
        p_metodo_pago_id: metodo.id,
        p_documento: documento.trim() || null,
        p_observaciones: observaciones.trim() || null,
      })
      if (error) throw error
      const resultado = data as { abono_id: number; monto: number; tramos: number; repetido: boolean } | null
      if (!resultado || !resultado.abono_id) throw new Error('Respuesta de abono incompleta. Comprueba el historial antes de reintentar.')
      solicitudRef.current = null
      setMensajeAbono(`Abono #${resultado.abono_id} ${resultado.repetido ? 'ya registrado (sin duplicarlo)' : 'registrado'}: ${formatoQuetzales(resultado.monto)} distribuidos en ${resultado.tramos} tramo(s).`)
      setMonto('0'); setDocumento(''); setObservaciones(''); setOperacionClave(''); setVentaId('')
      await Promise.all([cargar(), cargarHistorial()])
    } catch (e) {
      console.error('No se pudo confirmar el abono', e)
      const mensaje = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Error desconocido')
      alert(`No se confirmó el abono: ${mensaje}\n\nRevisa el historial antes de volver a intentar. Si fue un error de conexión, el reintento con los mismos datos no generará un abono duplicado.`)
      await Promise.all([cargar(), cargarHistorial()])
    } finally { setRegistrando(false) }
  }

  const generarPDF = async () => {
    setGenerando(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const logo = await fetchLogoDataUrl()
      if (logo) doc.addImage(logo, 'PNG', 80, 10, 50, 18)
      doc.setFontSize(14)
      doc.text('Deudas por Venta — Granja', 14, 35)
      doc.setFontSize(10)
      doc.text(`Cliente: ${clienteNombre}`, 14, 41)
      doc.text(`NIT: ${clienteNit}`, 14, 46)
      autoTable(doc, {
        startY: 52,
        head: [['Operaciones con saldo', 'Valor']],
        body: [
          ['Crédito', formatoQuetzales(totales.credito)],
          ['Abonado', formatoQuetzales(totales.abonado)],
          ['Saldo', formatoQuetzales(totales.saldo)],
          ['Operaciones pendientes', String(gruposPendientes.length)],
        ],
        styles: { fontSize: 9 },
      })
      const y = (doc as any).lastAutoTable.finalY + 6
      const filasPDF: string[][] = []
      for (const grupo of gruposMostrados) {
        filasPDF.push([grupo.etiqueta, grupo.fecha,
          formatoQuetzales(grupo.total), formatoQuetzales(grupo.pagado), formatoQuetzales(grupo.deuda)])
        if (grupo.esMulti) {
          for (const tramo of grupo.tramos) {
            const codigo = tramo.granja_ubicaciones?.codigo || `Ubicación ${tramo.ubicacion_id ?? '—'}`
            filasPDF.push([`   ID #${tramo.id} · ${codigo}`, tramo.fecha,
              formatoQuetzales(tramo.total), formatoQuetzales(tramo.pagado), formatoQuetzales(tramo.deuda)])
          }
        }
      }
      autoTable(doc, {
        startY: y,
        head: [['Venta / tramos', 'Fecha', 'Crédito', 'Abonado', 'Saldo']],
        body: filasPDF,
        styles: { fontSize: 8 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      })
      if (historial.length>0) {
        const fin = (doc as any).lastAutoTable.finalY + 8
        doc.setFontSize(10)
        if (fin>270) { doc.addPage(); doc.text('Historial de abonos desde Etapa 2',14,18) }
        else doc.text('Historial de abonos desde Etapa 2',14,fin)
        autoTable(doc, {
          startY: fin>270 ? 23 : fin+4,
          head: [['Abono','Fecha','Documento','Importe','IDs aplicados']],
          body: historial.map((abono) => [
            `#${abono.id}`,abono.fecha,abono.documento || '—',formatoQuetzales(abono.monto),
            aplicaciones.filter((a) => a.abono_id===abono.id).map((a) => `#${a.venta_id}`).join(', '),
          ]),
          styles: { fontSize: 7 },
        })
      }
      const ahora = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      doc.save(`deudas_granja_cliente_${clienteId}_${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}.pdf`)
    } catch (e) {
      console.error(e)
      alert('No fue posible generar el PDF.')
    } finally { setGenerando(false) }
  }

  // La vista individual nunca debe mostrar abonos ni saldos sin un cliente
  // identificado. La pantalla de selección está en la ruta superior.
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
    return <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4"><Image src="/logo.png" alt="Logo" width={180} height={72}/></div>
      <h1 className="text-2xl font-bold mb-3">Deudas de clientes — Granja</h1>
      <div role="alert" className="border border-amber-300 rounded p-4 bg-amber-50 text-amber-900 text-sm mb-4">
        Para consultar ventas, tramos y abonos, primero selecciona un cliente.
      </div>
      <Link href="/granja/reportes/deudas-clientes" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
        Ir a seleccionar cliente
      </Link>
    </div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4"><Image src="/logo.png" alt="Logo" width={180} height={72}/></div>
      <h1 className="text-2xl font-bold mb-1">📄 Deudas por Venta — Granja</h1>
      <p className="text-sm text-gray-600 mb-3">Cliente: <b>{clienteNombre}</b></p>

      <div className="mb-4 flex items-center gap-3">
        <Link href="/granja/reportes/deudas-clientes" className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm">⬅ Volver a Deudas</Link>
        <button onClick={generarPDF} className="bg-emerald-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60" disabled={generando || loading || !!errorCarga || gruposMostrados.length === 0}>
          {generando ? 'Generando…' : '📄 Reporte PDF'}
        </button>
        <button type="button" onClick={() => void cargar()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60" disabled={loading}>Actualizar</button>
      </div>

      {errorCarga && <div role="alert" className="mb-4 p-3 border border-red-400 text-red-700 bg-red-50 rounded text-sm">{errorCarga}</div>}
      <div className="border rounded p-4 bg-white mb-4">
        <div className="font-semibold mb-3">➕ Registrar abono</div>
       
        {historialError && <p role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-300 p-2 rounded">{historialError}</p>}
        {mensajeAbono && <p role="status" className="mb-3 text-sm text-green-800 bg-green-50 border border-green-300 p-2 rounded">{mensajeAbono}</p>}
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Aplicar abono a</div>
            <label className="mr-4 inline-block"><input type="radio" disabled={registrando} checked={modo==='AUTO'} onChange={() => { cambiarSolicitud(); setModo('AUTO') }}/>{' '}Cliente (más antigua primero)</label>
            <label className="mr-4 inline-block"><input type="radio" disabled={registrando} checked={modo==='OPERACION'} onChange={() => { cambiarSolicitud(); setModo('OPERACION') }}/>{' '}Operación MT / venta</label>
            <label className="inline-block"><input type="radio" disabled={registrando} checked={modo==='TRAMO'} onChange={() => { cambiarSolicitud(); setModo('TRAMO') }}/>{' '}ID individual</label>
          </div>
          <div><label className="text-xs font-semibold mb-1 block" htmlFor="fecha-abono">Fecha real</label><input id="fecha-abono" disabled={registrando} type="date" className="border p-2 w-full" value={fecha} onChange={(e) => { cambiarSolicitud(); setFecha(e.target.value) }}/></div>
          <div><label className="text-xs font-semibold mb-1 block" htmlFor="metodo-abono">Método de pago</label>
            <select id="metodo-abono" disabled={registrando} className="border p-2 w-full" value={metodoPagoId} onChange={(e) => { cambiarSolicitud(); setMetodoPagoId(e.target.value) }}>
              <option value="">— Selecciona —</option>{formasPago.filter(fp => !fp.metodo.toLowerCase().includes('pendiente')).map((fp) => <option key={fp.id} value={fp.id}>{fp.metodo}</option>)}
            </select>
          </div>
          {modo === 'OPERACION' && <div className="md:col-span-4"><label className="text-xs font-semibold mb-1 block" htmlFor="operacion-abono">Operación MT o venta normal</label>
            <select id="operacion-abono" disabled={registrando} className="border p-2 w-full" value={operacionClave} onChange={(e) => { cambiarSolicitud(); setOperacionClave(e.target.value) }}>
              <option value="">— Selecciona una operación con saldo —</option>
              {gruposPendientes.map((g) => <option key={g.clave} value={g.clave}>{g.etiqueta} · {g.fecha} · {g.tramos.length} tramo(s) · saldo {formatoQuetzales(g.deuda)}</option>)}
            </select>
          </div>}
          {modo === 'TRAMO' && <div className="md:col-span-4"><label className="text-xs font-semibold mb-1 block" htmlFor="tramo-abono">ID individual</label>
            <select id="tramo-abono" disabled={registrando} className="border p-2 w-full" value={ventaId} onChange={(e) => { cambiarSolicitud(); setVentaId(e.target.value) }}>
              <option value="">— Selecciona una venta individual —</option>
              {pendientes.map((v) => <option key={v.id} value={v.id}>
                {v.multi_folio ? `${codigoFolioMT(v.multi_folio)} · ` : ''}#{v.id} · {v.fecha} · saldo {formatoQuetzales(v.deuda)}
              </option>)}
            </select>
          </div>}
          <div><label className="text-xs font-semibold mb-1 block" htmlFor="monto-abono">Monto (Q)</label><input id="monto-abono" disabled={registrando} type="number" min="0.01" step="0.01" className="border p-2 w-full" value={monto} onChange={(e) => { cambiarSolicitud(); setMonto(e.target.value) }}/></div>
          <div className="md:col-span-2"><label className="text-xs font-semibold mb-1 block" htmlFor="documento-abono">Documento / referencia</label><input id="documento-abono" disabled={registrando} maxLength={200} className="border p-2 w-full" value={documento} onChange={(e) => { cambiarSolicitud(); setDocumento(e.target.value) }}/></div>
          <div className="md:col-span-4"><label className="text-xs font-semibold mb-1 block" htmlFor="observacion-abono">Observaciones</label><input id="observacion-abono" disabled={registrando} maxLength={2000} className="border p-2 w-full" value={observaciones} onChange={(e) => { cambiarSolicitud(); setObservaciones(e.target.value) }}/></div>
        </div>
        <div className="mt-2 text-xs text-gray-700">Saldo disponible de la selección: <b>{formatoQuetzales(disponibleSeleccionado)}</b></div>
        <div className="mt-3"><button onClick={() => void registrarAbono()} disabled={registrando || loading || historialCargando || !!errorCarga || !!historialError || disponibleSeleccionado <= 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm">
          {registrando ? 'Registrando…' : '💾 Confirmar y registrar abono'}
        </button></div>
        <div className="mt-4 border rounded p-3 bg-gray-50 text-sm">
          <p className="text-xs text-gray-600 mb-1">Totales de operaciones con saldo pendiente (incluyen tramos de la misma venta MT ya pagados):</p>
          <div>Total crédito: {formatoQuetzales(totales.credito)}</div>
          <div>Total abonado: {formatoQuetzales(totales.abonado)}</div>
          <div><b>Total saldo: {formatoQuetzales(totales.saldo)}</b></div>
          <div className="text-xs text-gray-500 mt-1">{gruposPendientes.length} operaciones pendientes; {ventas.length} filas de venta consultadas.</div>
        </div>
      </div>

      <div className="border rounded bg-white">
        <div className="flex flex-wrap gap-3 items-end p-3 border-b">
          <div className="flex-1 min-w-[190px]"><label htmlFor="buscar-operacion" className="block text-xs font-semibold mb-1">Buscar MT (MT351 o 351), ID o tramo</label>
            <input id="buscar-operacion" className="border rounded p-2 w-full text-sm" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="MT351, 351, #535 o ubicación"/>
          </div>
          <div><label htmlFor="estado-operacion" className="block text-xs font-semibold mb-1">Mostrar operaciones</label>
            <select id="estado-operacion" className="border rounded p-2 text-sm" value={estadoVista} onChange={(e) => setEstadoVista(e.target.value as EstadoVista)}>
              <option value="PENDIENTES">Con saldo pendiente</option><option value="SIN_SALDO">Sin saldo</option><option value="TODAS">Todas</option>
            </select>
          </div>
          <div className="text-xs text-gray-600 pb-2">{gruposMostrados.length} operaciones mostradas</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-200"><tr>
              <th className="p-2 text-left">Venta / MT</th><th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-right">Crédito</th><th className="p-2 text-right">Abonado</th><th className="p-2 text-right">Saldo</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td className="p-4 text-gray-500" colSpan={5}>Cargando ventas y tramos…</td></tr>
                : gruposMostrados.length === 0 ? <tr><td className="p-4 text-gray-500" colSpan={5}>{errorCarga || 'No hay operaciones para estos filtros.'}</td></tr>
                : gruposMostrados.map((g) => {
                  const expandido = expandidos.includes(g.clave)
                  return (
                    <FragmentoGrupoDeuda key={g.clave} grupo={g} expandido={expandido}
                      onToggle={() => setExpandidos((prev) => prev.includes(g.clave) ? prev.filter((x) => x !== g.clave) : [...prev, g.clave])}/>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="border rounded bg-white mt-5 p-3">
        <h2 className="font-semibold text-lg mb-1">Historial de abonos registrados</h2>
       
        {historialCargando && <p className="text-sm text-gray-600">Cargando historial…</p>}
        {!historialCargando && historialError && <p role="alert" className="text-sm text-red-700">{historialError}</p>}
        {!historialCargando && !historialError && historial.length===0 && <p className="text-sm text-gray-500">No hay abonos nuevos registrados con este procedimiento.</p>}
        {!historialError && historial.length>0 && <div className="overflow-auto"><table className="w-full text-xs md:text-sm">
          <thead className="bg-gray-200"><tr><th className="p-2 text-left">Abono</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Aplicado a</th><th className="p-2 text-left">Método</th><th className="p-2 text-left">Documento</th><th className="p-2 text-right">Monto</th></tr></thead>
          <tbody>{historial.map((a) => {
            const ap = aplicaciones.filter((v) => v.abono_id===a.id)
            const abierto = historialExpandido.includes(a.id)
            return <ReactFragmentoHistorial key={a.id} abono={a} aplicaciones={ap} abierto={abierto}
              metodo={formasPago.find((f) => f.id===a.metodo_pago_id)?.metodo || `Método #${a.metodo_pago_id}`}
              onToggle={() => setHistorialExpandido((prev) => prev.includes(a.id) ? prev.filter((x) => x!==a.id) : [...prev,a.id])}/>
          })}</tbody>
        </table></div>}
        {!historialError && historial.length===limiteHistorial && <button className="mt-3 px-3 py-2 bg-slate-700 text-white rounded text-xs disabled:opacity-50" disabled={historialCargando} onClick={() => setLimiteHistorial(v => v+50)}>Ver otros 50 abonos anteriores</button>}
      </section>
    </div>
  )
}

function ReactFragmentoHistorial({ abono, aplicaciones, abierto, metodo, onToggle }: {
  abono: AbonoRegistrado; aplicaciones: AplicacionAbono[]; abierto: boolean
  metodo: string; onToggle: () => void
}) {
  const destino = abono.modo==='AUTO' ? 'Cliente (FIFO)' : abono.modo==='TRAMO'
    ? `ID #${abono.venta_referencia_id}` : `Operación (ID base #${abono.venta_referencia_id})`
  return <>
    <tr className="border-t">
      <td className="p-2"><button onClick={onToggle} type="button" aria-expanded={abierto} className="text-indigo-700 hover:underline font-semibold">{abierto?'▾':'▸'} #{abono.id}</button></td>
      <td className="p-2">{abono.fecha}</td><td className="p-2">{destino}</td>
      <td className="p-2">{metodo}</td><td className="p-2">{abono.documento || '—'}</td>
      <td className="p-2 text-right font-semibold">{formatoQuetzales(abono.monto)}</td>
    </tr>
    {abierto && <tr className="bg-slate-50 border-t"><td colSpan={6} className="p-3 text-xs">
      <p className="mb-1">Registrado: {new Date(abono.registrado_en).toLocaleString('es-GT')} · Usuario: {abono.usuario_id.slice(0,8)}…</p>
      {abono.observaciones && <p className="mb-2">Observaciones: {abono.observaciones}</p>}
      <div className="font-semibold mb-1">Distribución por ID:</div>
      {aplicaciones.map((v) => <div key={v.id} className="py-1">Venta #{v.venta_id}: {formatoQuetzales(v.monto)} · saldo {formatoQuetzales(v.saldo_antes)} → {formatoQuetzales(v.saldo_despues)}</div>)}
      {aplicaciones.length===0 && <p>No se pudieron consultar los detalles de este abono.</p>}
    </td></tr>}
  </>
}

function FragmentoGrupoDeuda({ grupo, expandido, onToggle }: {
  grupo: OperacionDeuda; expandido: boolean; onToggle: () => void
}) {
  return <>
    <tr className="border-t bg-white">
      <td className="p-2">
        {grupo.esMulti ? <button type="button" className="text-indigo-700 hover:underline font-semibold text-left" onClick={onToggle} aria-expanded={expandido}>
          {expandido ? '▾' : '▸'} {grupo.etiqueta} <span className="text-gray-500 font-normal">({grupo.tramos.length} tramos)</span>
        </button> : <span className="font-semibold">{grupo.etiqueta}</span>}
        {grupo.multi_id && <div className="text-[10px] text-gray-500">Grupo: {grupo.multi_id.slice(0, 8)}…</div>}
      </td>
      <td className="p-2">{grupo.fecha}</td>
      <td className="p-2 text-right">{formatoQuetzales(grupo.total)}</td>
      <td className="p-2 text-right">{formatoQuetzales(grupo.pagado)}</td>
      <td className="p-2 text-right font-semibold">{formatoQuetzales(grupo.deuda)}</td>
    </tr>
    {grupo.esMulti && expandido && grupo.tramos.map((tramo) => <tr key={`${grupo.clave}-${tramo.id}`} className="border-t bg-slate-50 text-xs">
      <td className="p-2 pl-8">ID #{tramo.id} · {tramo.granja_ubicaciones?.codigo || `Ubicación #${tramo.ubicacion_id ?? '—'}`}</td>
      <td className="p-2">{tramo.fecha}</td>
      <td className="p-2 text-right">{formatoQuetzales(tramo.total)}</td>
      <td className="p-2 text-right">{formatoQuetzales(tramo.pagado)}</td>
      <td className="p-2 text-right">{formatoQuetzales(tramo.deuda)}</td>
    </tr>)}
  </>
}

export default function GranjaDeudasClienteVistaPage() {
  return <Suspense fallback={<div className="p-6 max-w-6xl mx-auto text-sm text-gray-600">Cargando…</div>}>
    <VistaDeudasClienteInner />
  </Suspense>
}
