'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function VerErogaciones() {
  const [erogaciones, setErogaciones] = useState<any[]>([])
  const [detalles, setDetalles] = useState<{ [key: number]: any[] }>({})
  const [empresas, setEmpresas] = useState<any[]>([])
  const [divisiones, setDivisiones] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])
  const [userEmail, setUserEmail] = useState('')

  const [filtros, setFiltros] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    desde: '',
    hasta: '',
    id: ''
  })

  useEffect(() => {
    cargarOpciones()
    cargarDatos()
  }, [])

  const cargarOpciones = async () => {
    const [empresas, divisiones, categorias, formasPago] = await Promise.all([
      supabase.from('empresas').select('*'),
      supabase.from('divisiones').select('*'),
      supabase.from('categorias').select('*'),
      supabase.from('forma_pago').select('*')
    ])
    setEmpresas(empresas.data || [])
    setDivisiones(divisiones.data || [])
    setCategorias(categorias.data || [])
    setFormasPago(formasPago.data || [])

    const { data } = await supabase.auth.getUser()
    setUserEmail(data?.user?.email || '')
  }

  const cargarDatos = async () => {
    let query = supabase
      .from('erogaciones')
      .select('id, fecha, cantidad, observaciones, empresa_id, division_id, categoria_id, empresas(nombre), divisiones(nombre), categorias(nombre)')
      .order('fecha', { ascending: false })

    if (filtros.id) query = query.eq('id', filtros.id)
    if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id)
    if (filtros.division_id) query = query.eq('division_id', filtros.division_id)
    if (filtros.categoria_id) query = query.eq('categoria_id', filtros.categoria_id)
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)

    const { data, error } = await query

    if (!error && data) {
      setErogaciones(data)
      for (const e of data) {
        const { data: det } = await supabase
          .from('detalle_compra')
          .select('concepto, cantidad, precio_unitario, importe, forma_pago_id, documento')
          .eq('erogacion_id', e.id)
        setDetalles(prev => ({ ...prev, [e.id]: det || [] }))
      }
    }
  }

  const handleInputChange = (id: number, field: string, value: any) => {
    setErogaciones(prev =>
      prev.map(e =>
        e.id === id ? { ...e, [field]: field === 'cantidad' ? parseFloat(value) : value } : e
      )
    )
  }

  const guardarCambios = async (erogacion: any) => {
    const { error } = await supabase
      .from('erogaciones')
      .update({
        fecha: erogacion.fecha,
        cantidad: erogacion.cantidad,
        observaciones: erogacion.observaciones,
        empresa_id: erogacion.empresa_id,
        division_id: erogacion.division_id,
        categoria_id: erogacion.categoria_id,
        editado_por: userEmail,
        editado_en: new Date().toISOString()
      })
      .eq('id', erogacion.id)

    if (error) {
      alert('Error al guardar los cambios')
    } else {
      alert('Cambios guardados correctamente')
      cargarDatos()
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta erogación?')) return
    await supabase.from('erogaciones').delete().eq('id', id)
    cargarDatos()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  const getMetodoPago = (id: number) => {
    const metodo = formasPago.find(f => f.id === id)
    return metodo?.metodo || id
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="Logo" className="h-16" />
      </div>

      <h1 className="text-2xl font-bold mb-4">📋 Erogaciones Registradas</h1>

      {/* ... el resto del código permanece igual ... */}
    </div>
  )
}
