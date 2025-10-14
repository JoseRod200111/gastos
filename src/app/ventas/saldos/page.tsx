'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type Row = {
  cliente_id: number
  nombre: string
  nit: string|null
  total_pendiente: number
  total_abonado: number
  saldo: number
}

export default function SaldosClientes() {
  const [rows, setRows] = useState<Row[]>([])
  const [soloConDeuda, setSoloConDeuda] = useState(true)
  const [q, setQ] = useState('')

  const cargar = async () => {
    let { data, error } = await supabase
      .from('v_saldos_clientes')
      .select('*')
    if (error) { console.error(error); return }
    let r = (data as Row[]) || []
    if (soloConDeuda) r = r.filter(x => Number(x.saldo||0) > 0.0001)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      r = r.filter(x => x.nombre.toLowerCase().includes(s) || (x.nit||'').toLowerCase().includes(s))
    }
    setRows(r.sort((a,b)=>Number(b.saldo)-Number(a.saldo)))
  }

  useEffect(()=>{ cargar() }, [])
  useEffect(()=>{ cargar() }, [soloConDeuda]) // recargar al cambiar toggle

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo" width={160} height={64}/>
      </div>

      <h1 className="text-2xl font-bold mb-4">📒 Saldos por Cliente</h1>

      <div className="flex items-center gap-3 mb-4">
        <input className="border p-2 flex-1" placeholder="Buscar por cliente o NIT"
               value={q} onChange={e=>setQ(e.target.value)}/>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloConDeuda} onChange={e=>setSoloConDeuda(e.target.checked)}/>
          Solo con deuda
        </label>
        <button onClick={cargar} className="bg-blue-600 text-white px-4 py-2 rounded">🔄 Actualizar</button>
      </div>

      <table className="w-full text-sm border">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2 text-left">Cliente</th>
            <th className="p-2">NIT</th>
            <th className="p-2">Pendiente</th>
            <th className="p-2">Abonado</th>
            <th className="p-2">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter(r => !q.trim() || r.nombre.toLowerCase().includes(q.toLowerCase()) || (r.nit||'').toLowerCase().includes(q.toLowerCase()))
            .map(r=>(
            <tr key={r.cliente_id} className="border-t">
              <td className="p-2">{r.nombre}</td>
              <td className="p-2">{r.nit || '—'}</td>
              <td className="p-2">Q{Number(r.total_pendiente||0).toFixed(2)}</td>
              <td className="p-2">Q{Number(r.total_abonado||0).toFixed(2)}</td>
              <td className="p-2 font-semibold">Q{Number(r.saldo||0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 text-right">
        <a href="/ventas/cobros" className="bg-green-600 text-white px-4 py-2 rounded">➕ Registrar Pago</a>
      </div>
    </div>
  )
}
