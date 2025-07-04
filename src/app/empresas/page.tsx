'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AdminOpciones() {
  const [tipo, setTipo] = useState('empresas')
  const [items, setItems] = useState<any[]>([])
  const [nuevo, setNuevo] = useState('')
  const [proveedor, setProveedor] = useState({
    nombre: '',
    nit: '',
    direccion: '',
    contacto_nombre: '',
    telefono: ''
  })

  const tablaNombre: any = {
    empresas: 'Empresa',
    divisiones: 'División',
    categorias: 'Categoría',
    proveedores: 'Proveedor'
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
    if (tipo === 'proveedores') {
      const { nombre, nit, direccion, contacto_nombre, telefono } = proveedor
      if (!nombre.trim() || !nit.trim()) return alert('Nombre y NIT son obligatorios')

      const { error } = await supabase.from('proveedores').insert({
        nombre: nombre.trim().toUpperCase(),
        nit: nit.trim(),
        direccion: direccion.trim(),
        contacto_nombre: contacto_nombre.trim(),
        telefono: telefono.trim()
      })

      if (error) {
        alert('Error al guardar proveedor')
      } else {
        setProveedor({ nombre: '', nit: '', direccion: '', contacto_nombre: '', telefono: '' })
        cargarItems()
      }
    } else {
      if (!nuevo.trim()) return alert('El nombre no puede estar vacío')

      const { error } = await supabase.from(tipo).insert({ nombre: nuevo.trim().toUpperCase() })

      if (error) {
        alert('Error al guardar')
      } else {
        setNuevo('')
        cargarItems()
      }
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
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">⚙️ Administración de Opciones</h1>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border p-2 w-full md:w-1/3">
          <option value="empresas">Empresa</option>
          <option value="divisiones">División</option>
          <option value="categorias">Categoría</option>
          <option value="proveedores">Proveedor</option>
        </select>

        {tipo !== 'proveedores' ? (
          <>
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
          </>
        ) : null}
      </div>

      {tipo === 'proveedores' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <input
            type="text"
            value={proveedor.nombre}
            onChange={e => setProveedor(p => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre del Proveedor *"
            className="border p-2"
          />
          <input
            type="text"
            value={proveedor.nit}
            onChange={e => setProveedor(p => ({ ...p, nit: e.target.value }))}
            placeholder="NIT *"
            className="border p-2"
          />
          <input
            type="text"
            value={proveedor.direccion}
            onChange={e => setProveedor(p => ({ ...p, direccion: e.target.value }))}
            placeholder="Dirección"
            className="border p-2"
          />
          <input
            type="text"
            value={proveedor.contacto_nombre}
            onChange={e => setProveedor(p => ({ ...p, contacto_nombre: e.target.value }))}
            placeholder="Nombre Contacto"
            className="border p-2"
          />
          <input
            type="text"
            value={proveedor.telefono}
            onChange={e => setProveedor(p => ({ ...p, telefono: e.target.value }))}
            placeholder="Teléfono"
            className="border p-2"
          />
          <div className="md:col-span-2">
            <button
              onClick={agregarItem}
              className="bg-blue-600 text-white px-4 py-2 rounded w-full"
            >
              ➕ Agregar Proveedor
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No hay valores aún.</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex justify-between items-center border px-4 py-2 rounded">
              <span>
                {tipo === 'proveedores'
                  ? `${item.nombre} — NIT: ${item.nit}`
                  : item.nombre}
              </span>
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
