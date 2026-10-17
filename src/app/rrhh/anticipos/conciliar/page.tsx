'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Empleado = { id: number; codigo: string; nombre_completo: string }
type Erogacion = { id: number; fecha: string; cantidad: number; observaciones: string | null }
type Detalle = { id: number; concepto: string; importe: number }

const money = (n: number) => `Q${Number(n || 0).toFixed(2)}`

export default function ConciliarAnticipoPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [empleadoId, setEmpleadoId] = useState('')
  const [erogacionId, setErogacionId] = useState('')
  const [erogacion, setErogacion] = useState<Erogacion | null>(null)
  const [detalles, setDetalles] = useState<Detalle[]>([])
  const [vinculado, setVinculado] = useState<{ id: number; empleado_id: number } | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('rrhh_empleados').select('id,codigo,nombre_completo').order('nombre_completo')
      .then(({ data, error }) => {
        if (error) setMensaje(error.message)
        else setEmpleados((data || []) as Empleado[])
      })
  }, [])

  const buscar = async () => {
    setMensaje('')
    setErogacion(null)
    setDetalles([])
    setVinculado(null)
    const id = Number(erogacionId)
    if (!Number.isInteger(id) || id <= 0) return setMensaje('Ingresa un ID de erogación válido.')
    setCargando(true)
    try {
      const [resE, resD, resA] = await Promise.all([
        supabase.from('erogaciones').select('id,fecha,cantidad,observaciones').eq('id', id).maybeSingle(),
        supabase.from('detalle_compra').select('id,concepto,importe').eq('erogacion_id', id),
        supabase.from('rrhh_v_anticipos_control').select('id,empleado_id').eq('erogacion_id', id).maybeSingle(),
      ])
      if (resE.error) throw new Error(resE.error.message)
      if (resD.error) throw new Error(resD.error.message)
      if (resA.error) throw new Error(resA.error.message)
      if (!resE.data) throw new Error(`No existe la erogación #${id}.`)
      setErogacion(resE.data as Erogacion)
      setDetalles((resD.data || []) as Detalle[])
      if (resA.data) setVinculado(resA.data as { id: number; empleado_id: number })
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'Error cargando erogación.')
    } finally {
      setCargando(false)
    }
  }

  const validar = !!erogacion && detalles.length > 0 && detalles.every((d) =>
    d.concepto.toUpperCase().includes('ANTICIPO') && Number(d.importe) > 0
  ) && Math.abs(detalles.reduce((s, d) => s + Number(d.importe), 0) - Number(erogacion.cantidad)) < 0.01

  const vincular = async () => {
    if (!validar || !empleadoId || !erogacion || vinculado) return
    const emp = empleados.find((e) => e.id === Number(empleadoId))
    if (!emp) return
    if (!window.confirm(`¿Vincular la erogación #${erogacion.id} (${money(erogacion.cantidad)}) al empleado ${emp.codigo} - ${emp.nombre_completo}? No se descontará todavía de planilla.`)) return
    setGuardando(true)
    setMensaje('')
    try {
      const { data, error } = await supabase.rpc('rrhh_vincular_erogacion_anticipo', {
        p_erogacion_id: erogacion.id,
        p_empleado_id: emp.id,
        p_ficha_historica_id: null,
        p_monto_historico: 0,
        p_observaciones: 'Vinculado desde control de anticipos de RRHH',
      })
      if (error) throw new Error(error.message)
      setVinculado({ id: Number(data), empleado_id: emp.id })
      setMensaje(`Erogación #${erogacion.id} vinculada al anticipo RRHH #${data}. Queda pendiente hasta su aplicación en planilla.`)
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo vincular.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Vincular erogación con anticipo RRHH</h1>
      <p className="text-sm text-gray-600 mb-4">Relaciona una erogación ya registrada con el empleado, sin duplicar gastos ni marcarla pagada. Esta pantalla no sirve para asignar pagos históricos.</p>
      <div className="flex gap-3 mb-5"><Link href="/rrhh/anticipos" className="rounded bg-slate-700 text-white p-2">Volver a anticipos</Link><Link href="/rrhh/reportes/anticipos-abonos" className="rounded bg-teal-700 text-white p-2">Ver historial de abonos</Link></div>
      <section className="border rounded p-4 mb-4 bg-white">
        <label className="block mb-2 font-semibold">ID de la erogación</label>
        <div className="flex gap-2 mb-4">
          <input type="number" min="1" className="border p-2 w-56" placeholder="Ejemplo: 1857" value={erogacionId} onChange={(e) => setErogacionId(e.target.value)} />
          <button disabled={cargando} onClick={buscar} className="bg-blue-600 text-white rounded px-4">{cargando ? 'Buscando...' : 'Buscar erogación'}</button>
        </div>
        {erogacion && <>
          <div className="text-sm mb-2"><b>Erogación #{erogacion.id}</b> · {erogacion.fecha} · Total {money(erogacion.cantidad)}</div>
          <table className="w-full text-sm border-collapse mb-3"><thead><tr className="bg-slate-200"><th className="p-2 border text-left">Concepto</th><th className="p-2 border text-right">Monto</th></tr></thead><tbody>{detalles.map((d) => <tr key={d.id}><td className="border p-2">{d.concepto}</td><td className="border p-2 text-right">{money(d.importe)}</td></tr>)}</tbody></table>
          {!validar && <p className="text-red-700 text-sm mb-2">La erogación debe contener solamente conceptos ANTICIPO y coincidir con el total registrado.</p>}
          {vinculado ? <p className="text-teal-800 text-sm font-semibold">Ya vinculada: anticipo RRHH #{vinculado.id}, empleado ID {vinculado.empleado_id}. No se duplicará.</p> : <>
            <label className="block mb-2 font-semibold">Empleado receptor del anticipo</label>
            <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="border p-2 w-full max-w-md mb-4">
              <option value="">Seleccione el empleado</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.codigo} - {e.nombre_completo}</option>)}
            </select>
            <div><button disabled={!validar || !empleadoId || guardando} onClick={vincular} className="rounded bg-green-700 text-white px-4 py-2 disabled:opacity-50">{guardando ? 'Vinculando...' : 'Vincular como pendiente'}</button></div>
          </>}
        </>}
      </section>
      {mensaje && <p className="border rounded p-3 text-sm bg-slate-50">{mensaje}</p>}
    </main>
  )
}
