'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AdminOpciones() {
  const [tipo, setTipo] = useState<'empresas' | 'divisiones' | 'categorias' | 'proveedores' | 'forma_pago'>('empresas')
  const [items, setItems] = useState<any[]>([])
  const [nuevo, setNuevo] = useState('')

  // formulario “nuevo proveedor”
  const [proveedor, setProveedor] = useState({
    nombre: '',
    nit: '',
    direccion: '',
    contacto_nombre: '',
    telefono: ''
  })

  const tablaNombre: Record<string, string> = {
    empresas: 'Empresa',
    divisiones: 'División',
    categorias: 'Categoría',
    proveedores: 'Proveedor',
    forma_pago: 'Método de pago'
  }

  const isProveedor = tipo === 'proveedores'
  const isFormaPago = tipo === 'forma_pago'

  const cargarItems = async () => {
    // columnas y orden por tipo
    const columnas =
      isProveedor ? '*' : isFormaPago ? 'id,metodo' : 'id,nombre'
    const ordenCol = isFormaPago ? 'metodo' : 'nombre'

    const { data, error } = await supabase
      .from(tipo)
      .select(columnas)
      .order(ordenCol, { ascending: true })

    if (error) {
      console.error(error)
      alert('Error al cargar datos')
      return
    }
    setItems(data || [])
  }

  const agregarItem = async () => {
    if (isProveedor) {
      const { nombre, nit, direccion, contacto_nombre, telefono } = proveedor
      if (!nombre.trim() || !nit.trim()) {
        alert('Nombre y NIT son obligatorios')
        return
      }
      const { error } = await supabase.from('proveedores').insert({
        nombre: nombre.trim().toUpperCase(),
        nit: nit.trim(),
        direccion: direccion.trim(),
        contacto_nombre: contacto_nombre.trim(),
        telefono: telefono.trim()
      })
      if (error) {
        console.error(error)
        alert('Error al guardar proveedor')
        return
      }
      setProveedor({ nombre: '', nit: '', direccion: '', contacto_nombre: '', telefono: '' })
      cargarItems()
      return
    }

    if (!nuevo.trim()) {
      alert('El nombre no puede estar vacío')
      return
    }

    if (isFormaPago) {
      const { error } = await supabase.from('forma_pago').insert({ metodo: nuevo.trim() })
      if (error) {
        console.error(error)
        alert('Error al guardar método de pago')
        return
      }
    } else {
      const { error } = await supabase.from(tipo).insert({ nombre: nuevo.trim().toUpperCase() })
      if (error) {
        console.error(error)
        alert('Error al guardar')
        return
      }
    }

    setNuevo('')
    cargarItems()
  }

  const eliminarItem = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return
    const { error } = await supabase.from(tipo).delete().eq('id', id)
    if (error) {
      console.error(error)
      // Muy probablemente por FK en uso
      alert('No se puede eliminar: está en uso.')
      return
    }
    cargarItems()
  }

  useEffect(() => {
    cargarItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-center mb-4">
        <img src="/logo.png" alt="Logo Empresa" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">⚙️ Administración de Opciones</h1>

      {/* Selector de catálogo + alta rápida */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as any)}
          className="border p-2 w-full md:w-1/3"
        >
          <option value="empresas">Empresa</option>
          <option value="divisiones">División</option>
          <option value="categorias">Categoría</option>
          <option value="proveedores">Proveedor</option>
          <option value="forma_pago">Método de pago</option>
        </select>

        {/* Alta genérica (no proveedores) */}
        {!isProveedor && (
          <>
            <input
              type="text"
              value={nuevo}
              placeholder={isFormaPago ? 'Nuevo método de pago' : `Nueva ${tablaNombre[tipo]}`}
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
        )}
      </div>

      {/* Alta de proveedores (form completo) */}
      {isProveedor && (
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

      {/* Lista */}
      <ul className="space-y-2 mb-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No hay valores aún.</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex justify-between items-center border px-4 py-2 rounded">
              <span>
                {isProveedor
                  ? `${item.nombre} — NIT: ${item.nit}`
                  : isFormaPago
                  ? item.metodo
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
        onClick={() => (window.location.href = '/menu')}
        className="mt-4 bg-gray-700 text-white px-4 py-2 rounded"
      >
        ⬅ Volver al Menú Principal
      </button>
    </div>
  )
}
