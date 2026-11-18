'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Empleado = { id: number; codigo: string; nombre_completo: string }
type Periodo = {
  id: number; anio: number; mes: number; quincena: number
  fecha_inicio: string; fecha_fin: string; estado: string
}
type Ficha = {
  id: number; empleado_id: number; periodo_id: number; estado: string
  prestamos: number; descuentos_ventas: number
}
type Padre = { empleado_id: number; fecha: string; estado: string }
type Tipo = 'PRESTAMO' | 'VENTA_EMPLEADO'
type Cuota = {
  id: number; tipo: Tipo; empleado_id: number; periodo_id: number | null
  monto: number; numero_cuota: number; fecha_deuda: string
  estado_padre: string; evidencia_cobro: boolean
}
type Caso = Cuota & {
  empleado?: Empleado; origen?: Periodo; fichaOrigen?: Ficha
  fichaDestino?: Ficha; apta: boolean; situacion: string
}

const numero = (n: unknown) => Number.isFinite(Number(n)) ? Number(n) : 0
const dinero = (n: number) => `Q${numero(n).toLocaleString('es-GT', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`
const periodoTexto = (p?: Periodo) => p
  ? `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena}`
  : 'Sin período'
const padreUnico = (valor: Padre | Padre[] | null): Padre | undefined =>
  Array.isArray(valor) ? valor[0] : (valor || undefined)
const fechaGT = () => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find(p => p.type === tipo)?.value || ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

export default function CuotasPendientesPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [periodoId, setPeriodoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloPendientesAnteriores, setSoloPendientesAnteriores] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [seleccion, setSeleccion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const [e, p, v, pr, f] = await Promise.all([
        supabase.from('rrhh_empleados')
          .select('id,codigo,nombre_completo').order('codigo').range(0, 999),
        supabase.from('rrhh_periodos_planilla')
          .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
          .order('fecha_inicio', { ascending: false }).range(0, 999),
        supabase.from('rrhh_descuentos_ventas_cuotas')
          .select('id,numero_cuota,monto,estado,periodo_id,aplicado_en,pago_venta_id,aplicado_monto_ventas,aplicado_monto_granja,rrhh_descuentos_ventas!inner(empleado_id,estado,fecha)')
          .eq('estado', 'PENDIENTE').range(0, 999),
        supabase.from('rrhh_prestamo_cuotas')
          .select('id,numero_cuota,monto,estado,periodo_id,rrhh_prestamos!inner(empleado_id,estado,fecha)')
          .eq('estado', 'PENDIENTE').range(0, 999),
        supabase.from('rrhh_planilla_empleado')
          .select('id,empleado_id,periodo_id,estado,prestamos,descuentos_ventas')
          .range(0, 999),
      ])
      const respuestas = [
        ['Empleados', e], ['Períodos', p], ['Ventas a empleados', v],
        ['Préstamos', pr], ['Fichas de planilla', f],
      ] as const
      for (const [nombre, respuesta] of respuestas) {
        if (respuesta.error) throw new Error(`${nombre}: ${respuesta.error.message}`)
        if ((respuesta.data || []).length >= 1000) {
          throw new Error(`${nombre}: se alcanzó el límite de 1000 registros. No se muestran cifras parciales.`)
        }
      }
      const cuotasVentas: Cuota[] = (v.data || []).map(reg => {
        const padre = padreUnico(reg.rrhh_descuentos_ventas as Padre | Padre[] | null)
        return {
          id: numero(reg.id), tipo: 'VENTA_EMPLEADO',
          empleado_id: numero(padre?.empleado_id),
          periodo_id: reg.periodo_id == null ? null : numero(reg.periodo_id),
          numero_cuota: numero(reg.numero_cuota), monto: numero(reg.monto),
          fecha_deuda: padre?.fecha || '', estado_padre: padre?.estado || '',
          evidencia_cobro: Boolean(reg.aplicado_en || reg.pago_venta_id ||
            numero(reg.aplicado_monto_ventas) || numero(reg.aplicado_monto_granja)),
        }
      })
      const cuotasPrestamos: Cuota[] = (pr.data || []).map(reg => {
        const padre = padreUnico(reg.rrhh_prestamos as Padre | Padre[] | null)
        return {
          id: numero(reg.id), tipo: 'PRESTAMO',
          empleado_id: numero(padre?.empleado_id),
          periodo_id: reg.periodo_id == null ? null : numero(reg.periodo_id),
          numero_cuota: numero(reg.numero_cuota), monto: numero(reg.monto),
          fecha_deuda: padre?.fecha || '', estado_padre: padre?.estado || '',
          evidencia_cobro: false,
        }
      })
      const listaPeriodos = (p.data || []) as Periodo[]
      setEmpleados((e.data || []) as Empleado[])
      setPeriodos(listaPeriodos)
      setFichas((f.data || []) as Ficha[])
      setCuotas([...cuotasPrestamos, ...cuotasVentas])
      setPeriodoId(anterior => anterior && listaPeriodos.some(x => String(x.id) === anterior)
        ? anterior
        : String(listaPeriodos.find(x => x.estado === 'ABIERTO' && x.fecha_fin >= fechaGT())?.id ||
          listaPeriodos[0]?.id || ''))
      setCargado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la información.')
      setCargado(false)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const destino = periodos.find(p => String(p.id) === periodoId)
  const destinoValido = Boolean(destino && destino.estado === 'ABIERTO' &&
    destino.fecha_fin >= fechaGT())

  const casos = useMemo((): Caso[] => {
    const emps = new Map(empleados.map(e => [e.id, e]))
    const pers = new Map(periodos.map(p => [p.id, p]))
    const fichasMap = new Map(fichas.map(f => [`${f.empleado_id}:${f.periodo_id}`, f]))
    return cuotas.map(c => {
      const origen = c.periodo_id === null ? undefined : pers.get(c.periodo_id)
      const fichaOrigen = c.periodo_id === null ? undefined : fichasMap.get(`${c.empleado_id}:${c.periodo_id}`)
      const fichaDestino = destino ? fichasMap.get(`${c.empleado_id}:${destino.id}`) : undefined
      const padreValido = c.estado_padre === (c.tipo === 'PRESTAMO' ? 'ACTIVO' : 'PENDIENTE')
      const anterior = Boolean(destino && (!origen || origen.fecha_inicio < destino.fecha_inicio))
      const apta = Boolean(destino && destinoValido && anterior && padreValido &&
        !c.evidencia_cobro && c.monto > 0 && c.fecha_deuda <= destino.fecha_fin &&
        !fichaOrigen && !fichaDestino)
      let situacion = 'Programada para la quincena seleccionada o posterior'
      if (!padreValido || c.evidencia_cobro) situacion = 'Revisar aplicación o estado de deuda'
      else if (fichaOrigen?.estado === 'PAGADO') situacion = 'Ficha pagada: conciliar antes de cobrar'
      else if (anterior && (fichaOrigen || fichaDestino)) situacion = 'Necesita ajuste de borradores / fichas'
      else if (apta) situacion = 'Puede reprogramarse, si NO se descontó realmente'
      else if (anterior) situacion = 'No disponible para este período'
      return { ...c, empleado: emps.get(c.empleado_id), origen,
        fichaOrigen, fichaDestino, apta, situacion }
    }).sort((a, b) =>
      (a.empleado?.codigo || '').localeCompare(b.empleado?.codigo || '') ||
      (a.origen?.fecha_inicio || '').localeCompare(b.origen?.fecha_inicio || '') ||
      a.id - b.id)
  }, [empleados, periodos, fichas, cuotas, destino, destinoValido])

  const aptas = casos.filter(c => c.apta)
  const conFichaPagada = casos.filter(c => c.fichaOrigen?.estado === 'PAGADO')
  const requierenFicha = casos.filter(c => c.situacion === 'Necesita ajuste de borradores / fichas')
  const seleccionada = casos.find(c => `${c.tipo}:${c.id}` === seleccion)
  const visibles = casos.filter(c => {
    const texto = busqueda.trim().toLocaleLowerCase('es')
    const coincide = !texto || `${c.empleado?.codigo} ${c.empleado?.nombre_completo} ${c.id} ${c.tipo}`
      .toLocaleLowerCase('es').includes(texto)
    const mostrar = !soloPendientesAnteriores ||
      c.apta || c.situacion.includes('fichas') || c.situacion.includes('Ficha pagada') ||
      c.situacion.includes('Revisar') || c.situacion.includes('No disponible')
    return coincide && mostrar
  })
  const sumar = (items: Caso[]) => dinero(items.reduce((s, c) => s + c.monto, 0))

  const reprogramar = async () => {
    const c = seleccionada
    if (!c || !c.apta || !destino) { setError('La cuota no es apta. Actualiza antes de intentar.'); return }
    if (!confirmado || motivo.trim().length < 12) {
      setError('Confirma que NO se descontó y escribe un motivo de al menos 12 caracteres.')
      return
    }
    if (!window.confirm(`¿Confirmas que NO se descontó esta cuota del salario?\n\n` +
      `${c.empleado?.codigo} - ${c.empleado?.nombre_completo}\n` +
      `${c.tipo} #${c.id}: ${dinero(c.monto)}\n` +
      `${periodoTexto(c.origen)} → ${periodoTexto(destino)}\n\n` +
      'No se cobrará ni se marcará el salario como pagado.')) return
    setProcesando(true)
    setError('')
    setExito('')
    try {
      const { data, error: rpcError } = await supabase.rpc('rrhh_reprogramar_cuota_sin_ficha', {
        p_tipo: c.tipo,
        p_cuota_id: c.id,
        p_periodo_destino: destino.id,
        p_motivo: motivo.trim(),
      })
      if (rpcError) throw new Error(rpcError.message)
      if (!data || data.ok !== true) throw new Error('La función no confirmó el traslado. Verifica su estado antes de repetir.')
      const mensaje = `La cuota #${c.id} (${c.tipo}) fue trasladada a ${periodoTexto(destino)}. No se registró ningún pago.`
      setSeleccion('')
      setMotivo('')
      setConfirmado(false)
      await cargar()
      setExito(mensaje)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la reprogramación.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-sm text-slate-900">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">RRHH — Gestión de cuotas pendientes</h1>
          <p className="text-slate-600">Préstamos y ventas a empleados · cuotas por quincena</p>
        </div>
        <div className="flex gap-2">
          <Link href="/rrhh/planilla" className="rounded bg-slate-800 text-white px-3 py-2">Volver a Planilla</Link>
          <button type="button" disabled={cargando || procesando} onClick={() => void cargar()}
            className="rounded bg-blue-700 text-white px-3 py-2 disabled:opacity-50">
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>
      <div className="border border-amber-300 bg-amber-50 rounded p-3 mb-4">
        <strong>Importante:</strong> reprogramar únicamente cuotas que efectivamente NO fueron retenidas.
        Las fichas pagadas requieren conciliación aparte; aquí no se confirman pagos ni se altera una ficha.
      </div>
      <section className="border rounded p-4 mb-4 flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1 font-semibold">Quincena destino
          <select className="border rounded p-2 font-normal bg-white" value={periodoId}
            onChange={e => { setPeriodoId(e.target.value); setSeleccion(''); setError('') }}>
            {periodos.map(p => <option key={p.id} value={p.id}>
              {periodoTexto(p)} · {p.estado} · #{p.id}
            </option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">Buscar empleado o cuota
          <input className="border rounded p-2 font-normal" placeholder="Código, nombre o número"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={soloPendientesAnteriores}
            onChange={e => setSoloPendientesAnteriores(e.target.checked)} />
          Solo cuotas que requieren atención
        </label>
      </section>
      {!destinoValido && cargado && <p className="text-amber-900 mb-3">
        Selecciona una quincena ABIERTA y vigente para habilitar reprogramaciones.
      </p>}
      {error && <p role="alert" className="border border-red-300 bg-red-50 text-red-800 p-3 rounded mb-3">{error}</p>}
      {exito && <p role="status" className="border border-green-300 bg-green-50 text-green-800 p-3 rounded mb-3">{exito}</p>}
      {cargado && <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="border rounded p-3">
            <p className="text-slate-600">Posibles reprogramaciones sin ficha</p>
            <p className="text-xl font-bold">{aptas.length} · {sumar(aptas)}</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-slate-600">Requieren ajustar fichas</p>
            <p className="text-xl font-bold">{requierenFicha.length} · {sumar(requierenFicha)}</p>
          </div>
          <div className="border rounded p-3">
            <p className="text-slate-600">Con ficha pagada por conciliar</p>
            <p className="text-xl font-bold">{conFichaPagada.length} · {sumar(conFichaPagada)}</p>
          </div>
        </div>
        <p className="mb-2 text-slate-600">Mostrando {visibles.length} de {casos.length} cuotas registradas como pendientes.</p>
        <div className="border rounded overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100"><tr>
              {['Empleado', 'Tipo', 'Cuota', 'Monto', 'Período origen', 'Ficha', 'Situación', 'Acción'].map(t =>
                <th key={t} className="p-2 border-b whitespace-nowrap">{t}</th>)}
            </tr></thead>
            <tbody>
              {visibles.map(c => <tr key={`${c.tipo}-${c.id}`} className="border-b align-top">
                <td className="p-2"><strong>{c.empleado?.codigo || c.empleado_id}</strong>
                  <div className="text-xs">{c.empleado?.nombre_completo || ''}</div></td>
                <td className="p-2">{c.tipo === 'PRESTAMO' ? 'Préstamo' : 'Venta a empleado'}</td>
                <td className="p-2">#{c.id} · {c.numero_cuota}</td>
                <td className="p-2 font-semibold whitespace-nowrap">{dinero(c.monto)}</td>
                <td className="p-2 whitespace-nowrap">{periodoTexto(c.origen)}</td>
                <td className="p-2">{c.fichaOrigen ? `#${c.fichaOrigen.id} · ${c.fichaOrigen.estado}` : 'Sin ficha'}</td>
                <td className="p-2">{c.situacion}</td>
                <td className="p-2">{c.apta
                  ? <button type="button" disabled={procesando}
                      className="bg-blue-700 text-white rounded px-3 py-1 disabled:opacity-50"
                      onClick={() => { setSeleccion(`${c.tipo}:${c.id}`); setMotivo(''); setConfirmado(false); setError('') }}>
                      Reprogramar
                    </button>
                  : <span className="text-xs text-slate-500">No disponible</span>}</td>
              </tr>)}
              {visibles.length === 0 && <tr><td colSpan={8} className="p-4 text-slate-500 text-center">
                No hay cuotas para estos filtros.
              </td></tr>}
            </tbody>
          </table>
        </div>
        {seleccionada && <section className="mt-5 border border-blue-300 bg-blue-50 rounded p-4">
          <div className="flex justify-between gap-3 items-center">
            <h2 className="text-lg font-bold">Reprogramar una cuota</h2>
            <button type="button" disabled={procesando} onClick={() => setSeleccion('')}
              className="border rounded px-3 py-1 bg-white">Cerrar</button>
          </div>
          <p className="mt-2"><strong>{seleccionada.empleado?.codigo} — {seleccionada.empleado?.nombre_completo}</strong>
            {' '}· {seleccionada.tipo} #{seleccionada.id} · <strong>{dinero(seleccionada.monto)}</strong></p>
          <p className="text-slate-700">Origen: {periodoTexto(seleccionada.origen)} · Destino: {periodoTexto(destino)}</p>
          <label className="block mt-3 font-semibold">Motivo obligatorio (mínimo 12 caracteres)
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500} rows={2}
              className="mt-1 border rounded w-full p-2 bg-white font-normal"
              placeholder="Ejemplo: Se confirmó que esta cuota no fue retenida en la quincena original" />
          </label>
          <label className="flex gap-2 items-start mt-3">
            <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} className="mt-1" />
            <span><strong>Confirmo que revisé el pago del salario y esta cuota NO fue descontada.</strong>
              {' '}Si ya se descontó, no debe trasladarse porque podría cobrarse dos veces.</span>
          </label>
          <button type="button" onClick={() => void reprogramar()}
            disabled={procesando || !confirmado || motivo.trim().length < 12 || !seleccionada.apta}
            className="mt-3 bg-blue-800 text-white rounded px-4 py-2 disabled:opacity-50">
            {procesando ? 'Procesando…' : 'Confirmar reprogramación'}
          </button>
          <p className="text-xs text-slate-600 mt-2">Esta acción solo cambia la quincena asignada a la cuota.
            No registra pagos ni modifica salarios guardados.</p>
        </section>}
      </>}
    </main>
  )
}
