'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function NuevaErogacion() {
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])

  const [form, setForm] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    fecha: '',
    cantidad: '',
    observaciones: ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const cargarOpciones = async () => {
    const { data: empresas } = await supabase.from('empresas').select('*')
    const { data: divisiones } = await supabase.from('divisiones').select('*')
    const { data: categorias } = await supabase.from('categorias').select('*')
    setEmpresas(empresas || [])
    setDivisiones(divisiones || [])
    setCategorias(categorias || [])
  }

  const guardarErogacion = async () => {
    const { data: session } = await supabase.auth.getSession()
    const user_id = session?.session?.user?.id

    const { error } = await supabase.from('erogaciones').insert([
      {
        ...form,
        user_id,
        fecha: form.fecha || new Date().toISOString().split('T')[0]
      }
    ])

    if (error) {
      alert('Error al guardar')
      console.error(error)
    } else {
      alert('Erogación guardada correctamente')

// Limpiar el formulario
setForm({
  empresa_id: '',
  division_id: '',
  categoria_id: '',
  fecha: '',
  cantidad: '',
  observaciones: ''
})

      
    }
  }

  useEffect(() => {
    cargarOpciones()
  }, [])

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      <div className="space-y-4">
        <select name="empresa_id" value={form.empresa_id} onChange={handleChange} className="w-full border p-2">
          <option value="">Selecciona Empresa</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>

        <select name="division_id" value={form.division_id} onChange={handleChange} className="w-full border p-2">
          <option value="">Selecciona División</option>
          {divisiones.map((d) => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>

        <select name="categoria_id" value={form.categoria_id} onChange={handleChange} className="w-full border p-2">
          <option value="">Selecciona Categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        <input
          type="date"
          name="fecha"
          value={form.fecha}
          onChange={handleChange}
          className="w-full border p-2"
        />

        <input
          type="text"
          name="cantidad"
          placeholder="Cantidad total"
          value={form.cantidad}
          onChange={handleChange}
          className="w-full border p-2"
        />

        <input
          type="text"
          name="observaciones"
          placeholder="Observaciones"
          value={form.observaciones}
          onChange={handleChange}
          className="w-full border p-2"
        />

<div className="flex justify-between mt-6">
  <button
    onClick={guardarErogacion}
    className="bg-blue-600 text-white px-4 py-2 rounded"
  >
    Guardar Erogación
  </button>

  <button
    onClick={() => window.location.href = '/dashboard'}
    className="bg-gray-700 text-white px-4 py-2 rounded"
  >
    ⬅ Volver al Menú Principal
  </button>
</div>


      </div>
    </div>
  )
}
