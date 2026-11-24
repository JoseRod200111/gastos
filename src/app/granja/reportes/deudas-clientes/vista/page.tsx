'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  agruparVentasDeuda, aNumero, codigoFolioMT, formatoQuetzales, normalizarVentaDeuda,
  sumarOperaciones, type OperacionDeuda, type VentaGranjaDeuda,
} from '@/lib/granjaDeudasMt'

export const dynamic = 'force-dynamic'

type FormaPago = { id: number; metodo: string }
type EstadoVista = 'PENDIENTES' | 'SIN_SALDO' | 'TODAS'
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

  // ETAPA 1: este formulario conserva el comportamiento anterior por ID individual.
  // No simular aquí abonos al grupo MT: requieren una función SQL atómica y auditable.
  const [modo, setModo] = useState<'AUTO' | 'UNA'>('AUTO')
  const [ventaId, setVentaId] = useState('')
  const [fecha, setFecha] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [monto, setMonto] = useState('0')
  const [documento, setDocumento] = useState('')
  const [observaciones, setObservaciones] = useState('')

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

  // Conservado sin alteraciones de criterio: las mejoras de abono MT y trazabilidad
  // se harán mediante una transacción en Supabase en la siguiente etapa.
  const aplicarPagoAVenta = async (v: VentaGranjaDeuda, pago: number) => {
    const nuevoPagado = Math.round((aNumero(v.pagado) + pago) * 100) / 100
    const nuevaDeuda = Math.round(Math.max(0, aNumero(v.total) - nuevoPagado) * 100) / 100
    const { error } = await supabase.from('granja_ventas_cerdos')
      .update({ pagado: nuevoPagado, deuda: nuevaDeuda }).eq('id', v.id)
    if (error) throw error
  }

  const registrarAbono = async () => {
    if (!clienteId) { alert('Cliente inválido.'); return }
    const m = aNumero(monto)
    if (m <= 0) { alert('Monto inválido.'); return }
    if (!metodoPagoId) { alert('Selecciona un método de pago.'); return }
    if (!pendientes.length) { alert('Este cliente no tiene deudas pendientes.'); return }
    setRegistrando(true)
    try {
      let restante = m
      if (modo === 'UNA') {
        const vid = Number(ventaId || 0)
        if (!vid) { alert('Selecciona un ID de venta individual.'); return }
        const v = pendientes.find((x) => x.id === vid)
        if (!v) { alert('No se encontró la venta.'); return }
        const pagar = Math.min(restante, aNumero(v.deuda))
        if (pagar <= 0) { alert('Esa venta no tiene saldo.'); return }
        await aplicarPagoAVenta(v, pagar)
        restante -= pagar
      } else {
        for (const v of pendientes) {
          if (restante <= 0) break
          const pagar = Math.min(restante, aNumero(v.deuda))
          if (pagar <= 0) continue
          await aplicarPagoAVenta(v, pagar)
          restante -= pagar
        }
      }
      alert('Abono registrado con el procedimiento anterior (por ID individual).')
      setMonto('0'); setDocumento(''); setObservaciones(''); setVentaId('')
      await cargar()
    } catch (e) {
      console.error(e)
      alert('Error registrando abono. Revisa los saldos antes de reintentar.')
      await cargar()
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
       
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold mb-1">Modo de abono (procedimiento actual)</div>
            <label className="mr-4"><input type="radio" checked={modo === 'AUTO'} onChange={() => setModo('AUTO')}/>{' '}Automático (deuda más antigua primero)</label>
            <label><input type="radio" checked={modo === 'UNA'} onChange={() => setModo('UNA')}/>{' '}Solo un ID individual</label>
          </div>
          <div><div className="text-xs font-semibold mb-1">Fecha</div><input type="date" className="border p-2 w-full" value={fecha} onChange={(e) => setFecha(e.target.value)}/></div>
          <div><div className="text-xs font-semibold mb-1">Método</div>
            <select className="border p-2 w-full" value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)}>
              <option value="">— Selecciona —</option>{formasPago.map((fp) => <option key={fp.id} value={fp.id}>{fp.metodo}</option>)}
            </select>
          </div>
          {modo === 'UNA' && <div className="md:col-span-2"><div className="text-xs font-semibold mb-1">ID individual de venta</div>
            <select className="border p-2 w-full" value={ventaId} onChange={(e) => setVentaId(e.target.value)}>
              <option value="">— Selecciona un ID individual —</option>
              {pendientes.map((v) => <option key={v.id} value={v.id}>
                {v.multi_folio ? `${codigoFolioMT(v.multi_folio)} · ` : ''}#{v.id} | {v.fecha} | saldo {formatoQuetzales(v.deuda)}
              </option>)}
            </select>
          </div>}
          <div><div className="text-xs font-semibold mb-1">Monto</div><input className="border p-2 w-full" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"/></div>
          <div className="md:col-span-2"><div className="text-xs font-semibold mb-1">Documento</div><input className="border p-2 w-full" value={documento} onChange={(e) => setDocumento(e.target.value)}/></div>
          <div className="md:col-span-4"><div className="text-xs font-semibold mb-1">Observaciones</div><input className="border p-2 w-full" value={observaciones} onChange={(e) => setObservaciones(e.target.value)}/></div>
        </div>
        <div className="mt-3"><button onClick={registrarAbono} disabled={registrando || loading || !!errorCarga} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm">
          {registrando ? 'Registrando…' : '💾 Registrar abono'}
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
    </div>
  )
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
