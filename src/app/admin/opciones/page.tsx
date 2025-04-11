'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AdminOpciones() {
  const [tipo, setTipo] = useState('empresas')
  const [items, setItems] = useState<any[]>([])
  const [nuevo, setNuevo] = useState('')

  const tablaNombre = {
    empresas: 'Empresa',
    divisiones: 'División',
    categorias: 'Categoría'
  }

  const cargarItems = async () => {
    const { data, error } = await supabase.from(tipo).select('*').order('nombre', { ascending: true })
    if (error) {
      alert('Error al cargar datos')
    } else {
      setItems(data || [])
    }
  }

  const agregarItem = async () => {
    if (!nuevo.trim()) return alert('El nombre no puede estar vacío')

    const { error } = await supabase.from(tipo).insert({ nombre: nuevo.trim().toUpperCase() })
    if (error) {
      alert('Error al guardar')
    } else {
      setNuevo('')
      cargarItems()
    }
  }

  const eliminarItem = async (id: number) => {
    const confirmar = confirm('¿Estás seguro de eliminar este valor?')
    if (!confirmar) return

    const { error } = await supabase.from(tipo).delete().eq('id', id)
    if (error) {
      alert('No se puede eliminar: está en uso.')
    } else {
      cargarItems()
    }
  }

  useEffect(() => {
    cargarItems()
  }, [tipo])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">⚙️ Administración de Opciones</h1>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border p-2 w-full md:w-1/3">
          <option value="empresas">Empresa</option>
          <option value="divisiones">División</option>
          <option value="categorias">Categoría</option>
        </select>

        <input
          type="text"
          value={nuevo}
          placeholder={`Nueva ${tablaNombre[tipo]}`}
          onChange={(e) => setNuevo(e.target.value)}
          className="border p-2 flex-grow"
        />
        <button
          onClick={agregarItem}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          ➕ Agregar
        </button>
      </div>

      <ul className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No hay valores aún.</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex justify-between items-center border px-4 py-2 rounded">
              <span>{item.nombre}</span>
              <button
                onClick={() => eliminarItem(item.id)}
                className="text-white bg-red-600 text-xs px-3 py-1 rounded"
              >
                Eliminar
              </button>
            </li>
          ))
        )}
      </ul>

      <button
        onClick={() => window.location.href = '/dashboard'}
        className="mt-4 bg-gray-700 text-white px-4 py-2 rounded"
      >
        ⬅ Volver al Menú Principal
      </button>
    </div>
  )
}
