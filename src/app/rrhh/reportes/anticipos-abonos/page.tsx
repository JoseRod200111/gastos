'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'

type Empleado = { id: number; codigo: string; nombre_completo: string }
type Anticipo = { id: number; empleado_id: number; erogacion_id: number | null; fecha: string; monto: number; saldo: number; abonado: number; estado_control: string }
type Abono = { id: number; anticipo_id: number; ficha_id: number; monto: number; fecha_aplicacion: string; registrado_en: string; usuario_id: string | null; origen: string; observaciones: string | null }
type Ficha = { id: number; periodo_id: number; fecha_pago: string | null }
type Periodo = { id: number; anio: number; mes: number; quincena: number }
type Perfil = { id: string; email: string | null }
const money = (n: number) => `Q${Number(n || 0).toFixed(2)}`
function fechaHora(s: string) {
  return new Date(s).toLocaleString('es-GT', {timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
}
async function todos(tabla:string, campos:string) {
  const rows: Record<string, unknown>[] = []
  for (let i=0;i<10000;i+=1000) {
    const {data,error} = await supabase.from(tabla).select(campos).range(i,i+999)
    if (error) throw new Error(`Error consultando ${tabla}: ${error.message}`)
    const nuevos = (data ?? []) as unknown as Record<string, unknown>[]
    rows.push(...nuevos)
    if(nuevos.length<1000) break
  }
  return rows
}

export default function HistorialAnticiposPage() {
  const [empleados,setEmpleados]=useState<Empleado[]>([])
  const [anticipos,setAnticipos]=useState<Anticipo[]>([])
  const [abonos,setAbonos]=useState<Abono[]>([])
  const [fichas,setFichas]=useState<Ficha[]>([])
  const [periodos,setPeriodos]=useState<Periodo[]>([])
  const [perfiles,setPerfiles]=useState<Perfil[]>([])
  const [busqueda,setBusqueda]=useState('')
  const [desde,setDesde]=useState('')
  const [hasta,setHasta]=useState('')
  const [origen,setOrigen]=useState('TODOS')
  const [mensaje,setMensaje]=useState('')
  const [cargando,setCargando]=useState(false)
  const [pdf,setPdf]=useState(false)

  const cargar=async()=>{
    setCargando(true);setMensaje('')
    try {
      const [e,a,m,f,p,u]=await Promise.all([
        todos('rrhh_empleados','id,codigo,nombre_completo'),
        todos('rrhh_v_anticipos_control','id,empleado_id,erogacion_id,fecha,monto,saldo,abonado,estado_control'),
        todos('rrhh_anticipo_aplicaciones','id,anticipo_id,ficha_id,monto,fecha_aplicacion,registrado_en,usuario_id,origen,observaciones'),
        todos('rrhh_planilla_empleado','id,periodo_id,fecha_pago'),
        todos('rrhh_periodos_planilla','id,anio,mes,quincena'),
        todos('profiles','id,email'),
      ])
      setEmpleados(e as Empleado[]);setAnticipos(a as Anticipo[]);setAbonos(m as Abono[])
      setFichas(f as Ficha[]);setPeriodos(p as Periodo[]);setPerfiles(u as Perfil[])
    } catch (err) {setMensaje(err instanceof Error?err.message:'Error cargando movimientos.')} finally {setCargando(false)}
  }
  useEffect(()=>{void cargar()},[])
  const empMap=useMemo(()=>new Map(empleados.map(e=>[e.id,e])),[empleados])
  const antMap=useMemo(()=>new Map(anticipos.map(a=>[a.id,a])),[anticipos])
  const fichaMap=useMemo(()=>new Map(fichas.map(f=>[f.id,f])),[fichas])
  const periodoMap=useMemo(()=>new Map(periodos.map(p=>[p.id,p])),[periodos])
  const perfilMap=useMemo(()=>new Map(perfiles.map(p=>[p.id,p.email||p.id])),[perfiles])
  const filas=useMemo(()=>abonos.map(ab=>{
    const ant=antMap.get(ab.anticipo_id)
    const emp=ant?empMap.get(ant.empleado_id):undefined
    const ficha=fichaMap.get(ab.ficha_id)
    const periodo=ficha?periodoMap.get(ficha.periodo_id):undefined
    return { ...ab,empleado:`${emp?.codigo||'N/A'} - ${emp?.nombre_completo||'No encontrado'}`,anticipo:ant,
      periodo:periodo?`${periodo.anio}-${String(periodo.mes).padStart(2,'0')} Q${periodo.quincena}`:'—',
      usuario:ab.usuario_id?perfilMap.get(ab.usuario_id)||ab.usuario_id:'No identificado (SQL o conciliación)',
    }
  }).filter(r=>{
    const q=busqueda.trim().toLowerCase()
    const texto=`${r.empleado} ${r.anticipo_id} ${r.anticipo?.erogacion_id||''} ${r.ficha_id} ${r.usuario} ${r.observaciones||''}`.toLowerCase()
    return (!q||texto.includes(q))&&(!desde||r.fecha_aplicacion>=desde)&&(!hasta||r.fecha_aplicacion<=hasta)&&(origen==='TODOS'||r.origen===origen)
  }).sort((a,b)=>b.registrado_en.localeCompare(a.registrado_en)),[abonos,antMap,empMap,fichaMap,periodoMap,perfilMap,busqueda,desde,hasta,origen])
  const total=filas.reduce((s,r)=>s+Number(r.monto),0)
  const generar=async()=>{
    if(!filas.length)return
    setPdf(true)
    try{
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'letter'})
      doc.setFontSize(14);doc.text('Historial verificable de abonos a anticipos',14,16)
      doc.setFontSize(9);doc.text(`Filtro: ${busqueda||'Todos'}  ·  Monto total: ${money(total)}  ·  Registros: ${filas.length}`,14,23)
      autoTable(doc,{startY:29,head:[['Fecha aplicada','Registro (Guatemala)','Empleado','Anticipo / Erog.','Ficha','Monto','Origen / Usuario']],
        body:filas.map(r=>[r.fecha_aplicacion,fechaHora(r.registrado_en),r.empleado,`#${r.anticipo_id} / ${r.anticipo?.erogacion_id?'E'+r.anticipo.erogacion_id:'RRHH'}`,`#${r.ficha_id} ${r.periodo}`,money(r.monto),`${r.origen} · ${r.usuario}`]),
        styles:{fontSize:7},headStyles:{fillColor:[30,41,59]}})
      doc.save(`abonos_anticipos_detallados_${new Date().toISOString().slice(0,10)}.pdf`)
    } catch(err){setMensaje(err instanceof Error?err.message:'Error PDF.')} finally{setPdf(false)}
  }
  return <main className="max-w-7xl mx-auto p-6">
    <h1 className="text-2xl font-bold">Historial real de abonos a anticipos</h1>
    <p className="text-sm text-gray-600 my-2">Cada fila es un movimiento individual registrado. Fecha aplicada y fecha/hora de registro son datos distintos; las conciliaciones históricas se identifican claramente. No inventa pagos a partir de estados.</p>
    <div className="flex flex-wrap gap-2 my-4"><Link href="/rrhh" className="p-2 bg-slate-700 text-white rounded">Volver a RRHH</Link><Link href="/rrhh/anticipos" className="p-2 bg-orange-600 text-white rounded">Control de anticipos</Link><button onClick={cargar} disabled={cargando} className="bg-blue-600 text-white px-3 rounded">{cargando?'Cargando...':'Recargar'}</button><button onClick={generar} disabled={pdf||!filas.length} className="bg-green-700 text-white px-3 rounded disabled:opacity-50">{pdf?'Generando...':'Reporte PDF'}</button></div>
    {mensaje&&<p className="border p-3 my-3">{mensaje}</p>}
    <div className="grid md:grid-cols-4 gap-3 border rounded p-4 mb-3">
      <label className="text-sm">Empleado, código, ID, erogación o usuario<input className="border p-2 block w-full" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="TC022, 1853..."/></label>
      <label className="text-sm">Abono desde<input type="date" className="border p-2 block w-full" value={desde} onChange={e=>setDesde(e.target.value)}/></label>
      <label className="text-sm">Abono hasta<input type="date" className="border p-2 block w-full" value={hasta} onChange={e=>setHasta(e.target.value)}/></label>
      <label className="text-sm">Origen<select className="border p-2 block w-full" value={origen} onChange={e=>setOrigen(e.target.value)}><option value="TODOS">Todos</option><option value="PLANILLA">Planilla</option><option value="CONCILIACION">Conciliación histórica</option></select></label>
    </div>
    <div className="grid grid-cols-2 gap-3 my-3"><div className="border rounded p-3">Movimientos: <b>{filas.length}</b></div><div className="border rounded p-3">Total aplicado: <b>{money(total)}</b></div></div>
    <div className="overflow-x-auto border rounded"><table className="w-full border-collapse text-sm"><thead className="bg-slate-200"><tr>{['Fecha aplicada','Fecha/hora registro GT','Empleado','Anticipo / Erogación','Monto original','Abono','Saldo','Ficha / período','Usuario','Origen / Observaciones'].map(h=><th key={h} className="border p-2 text-left">{h}</th>)}</tr></thead><tbody>
      {filas.map(r=><tr key={r.id}><td className="border p-2">{r.fecha_aplicacion}</td><td className="border p-2">{fechaHora(r.registrado_en)}</td><td className="border p-2">{r.empleado}</td><td className="border p-2">#{r.anticipo_id}<div className="text-gray-500">{r.anticipo?.erogacion_id?`Erogación #${r.anticipo.erogacion_id}`:'Registrado en RRHH'}</div></td><td className="border p-2 text-right">{money(r.anticipo?.monto||0)}</td><td className="border p-2 text-right font-semibold">{money(r.monto)}</td><td className="border p-2 text-right">{money(r.anticipo?.saldo||0)}</td><td className="border p-2">#{r.ficha_id} · {r.periodo}</td><td className="border p-2">{r.usuario}</td><td className="border p-2">{r.origen}<div className="text-gray-500">{r.observaciones||'—'}</div></td></tr>)}
      {!filas.length&&<tr><td colSpan={10} className="text-center p-5">No existen movimientos de abono que coincidan con el filtro. Consultá Control de anticipos para ver deudas sin pagos.</td></tr>}
    </tbody></table></div>
  </main>
}
