'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

type RowData = {
  id: number | string
  [key: string]: unknown
}

type OptionItem = {
  id: number | string
  label: string
}

type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox'

type FieldConfig = {
  name: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  options?: OptionItem[]
  optionsKey?: 'empresas' | 'divisiones'
}

type TableConfig = {
  key: string
  table: string
  title: string
  description: string
  orderBy: string
  fields: FieldConfig[]
  columns: string[]
}

const TABLE_CONFIGS: TableConfig[] = [
  {
    key: 'empresas',
    table: 'empresas',
    title: 'Empresas',
    description: 'Empresas usadas en erogaciones, ventas, vehículos y granja.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Ej: AGROINDUSTRIAS RYB SA',
      },
    ],
    columns: ['nombre'],
  },
  {
    key: 'divisiones',
    table: 'divisiones',
    title: 'Divisiones',
    description: 'Divisiones o áreas internas de la empresa.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Ej: Planta, Granja, Transporte...',
      },
    ],
    columns: ['nombre'],
  },
  {
    key: 'categorias',
    table: 'categorias',
    title: 'Categorías',
    description: 'Categorías usadas principalmente en erogaciones.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Ej: Combustible, Mantenimiento...',
      },
    ],
    columns: ['nombre'],
  },
  {
    key: 'forma_pago',
    table: 'forma_pago',
    title: 'Formas de pago',
    description: 'Métodos de pago usados en compras, ventas, pagos y gastos.',
    orderBy: 'metodo',
    fields: [
      {
        name: 'metodo',
        label: 'Método',
        type: 'text',
        required: true,
        placeholder: 'Ej: Efectivo, Cheque, Depósito...',
      },
    ],
    columns: ['metodo'],
  },
  {
    key: 'proveedores',
    table: 'proveedores',
    title: 'Proveedores',
    description: 'Proveedores usados en erogaciones y compras de granja.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Nombre del proveedor',
      },
      {
        name: 'nit',
        label: 'NIT',
        type: 'text',
        placeholder: 'NIT del proveedor',
      },
      {
        name: 'direccion',
        label: 'Dirección',
        type: 'text',
        placeholder: 'Dirección',
      },
      {
        name: 'contacto_nombre',
        label: 'Contacto',
        type: 'text',
        placeholder: 'Nombre de contacto',
      },
      {
        name: 'telefono',
        label: 'Teléfono',
        type: 'text',
        placeholder: 'Teléfono',
      },
    ],
    columns: ['nombre', 'nit', 'direccion', 'contacto_nombre', 'telefono'],
  },
  {
    key: 'clientes',
    table: 'clientes',
    title: 'Clientes',
    description: 'Clientes usados en ventas de planta y ventas de cerdos.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Nombre del cliente',
      },
      {
        name: 'nit',
        label: 'NIT',
        type: 'text',
        placeholder: 'NIT del cliente',
      },
      {
        name: 'direccion',
        label: 'Dirección',
        type: 'text',
        placeholder: 'Dirección',
      },
      {
        name: 'telefono',
        label: 'Teléfono',
        type: 'text',
        placeholder: 'Teléfono',
      },
    ],
    columns: ['nombre', 'nit', 'direccion', 'telefono'],
  },
  {
    key: 'productos',
    table: 'productos',
    title: 'Productos',
    description: 'Productos usados en inventario, compras y ventas.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Nombre del producto',
      },
      {
        name: 'sku',
        label: 'SKU',
        type: 'text',
        placeholder: 'Código interno',
      },
      {
        name: 'unidad',
        label: 'Unidad',
        type: 'text',
        placeholder: 'Ej: unidad, lb, kg, galón...',
      },
      {
        name: 'control_inventario',
        label: 'Controlar inventario',
        type: 'checkbox',
      },
    ],
    columns: ['nombre', 'sku', 'unidad', 'control_inventario'],
  },
  {
    key: 'granja_ubicaciones',
    table: 'granja_ubicaciones',
    title: 'Ubicaciones de granja',
    description: 'Tramos, jaulas y ubicaciones usadas en inventario de granja.',
    orderBy: 'codigo',
    fields: [
      {
        name: 'codigo',
        label: 'Código',
        type: 'text',
        required: true,
        placeholder: 'Ej: TR8, G1J01, M2J13...',
      },
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        placeholder: 'Nombre descriptivo',
      },
      {
        name: 'tipo',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: [
          { id: 'TRAMO', label: 'TRAMO' },
          { id: 'JAULA', label: 'JAULA' },
          { id: 'OTRO', label: 'OTRO' },
        ],
      },
      {
        name: 'empresa_id',
        label: 'Empresa',
        type: 'select',
        optionsKey: 'empresas',
      },
      {
        name: 'division_id',
        label: 'División',
        type: 'select',
        optionsKey: 'divisiones',
      },
      {
        name: 'activo',
        label: 'Activa',
        type: 'checkbox',
      },
      {
        name: 'observaciones',
        label: 'Observaciones',
        type: 'textarea',
      },
    ],
    columns: ['codigo', 'nombre', 'tipo', 'empresa_id', 'division_id', 'activo'],
  },
  {
    key: 'granja_lotes',
    table: 'granja_lotes',
    title: 'Lotes de granja',
    description: 'Lotes de compra o parto usados en movimientos de granja.',
    orderBy: 'codigo',
    fields: [
      {
        name: 'codigo',
        label: 'Código',
        type: 'text',
        required: true,
        placeholder: 'Ej: LOTE-001',
      },
      {
        name: 'tipo_origen',
        label: 'Tipo de origen',
        type: 'select',
        required: true,
        options: [
          { id: 'COMPRA', label: 'COMPRA' },
          { id: 'PARTO', label: 'PARTO' },
        ],
      },
      {
        name: 'fecha',
        label: 'Fecha',
        type: 'date',
        required: true,
      },
      {
        name: 'observaciones',
        label: 'Observaciones',
        type: 'textarea',
      },
    ],
    columns: ['codigo', 'tipo_origen', 'fecha', 'observaciones'],
  },
  {
    key: 'vehiculos',
    table: 'vehiculos',
    title: 'Vehículos',
    description: 'Vehículos usados en el módulo de viajes.',
    orderBy: 'placa',
    fields: [
      {
        name: 'placa',
        label: 'Placa',
        type: 'text',
        required: true,
        placeholder: 'Placa del vehículo',
      },
      {
        name: 'alias',
        label: 'Alias',
        type: 'text',
        placeholder: 'Ej: Camión 1',
      },
      {
        name: 'marca',
        label: 'Marca',
        type: 'text',
      },
      {
        name: 'modelo',
        label: 'Modelo',
        type: 'text',
      },
      {
        name: 'anio',
        label: 'Año',
        type: 'number',
      },
      {
        name: 'grupo',
        label: 'Grupo',
        type: 'text',
      },
      {
        name: 'capacidad_tanque_gal',
        label: 'Capacidad tanque gal',
        type: 'number',
      },
      {
        name: 'sensor_tipo',
        label: 'Tipo de sensor',
        type: 'text',
      },
      {
        name: 'sensores',
        label: 'Cantidad sensores',
        type: 'number',
      },
      {
        name: 'empresa_id',
        label: 'Empresa',
        type: 'select',
        optionsKey: 'empresas',
      },
      {
        name: 'division_id',
        label: 'División',
        type: 'select',
        optionsKey: 'divisiones',
      },
    ],
    columns: ['placa', 'alias', 'marca', 'modelo', 'anio', 'empresa_id', 'division_id'],
  },
  {
    key: 'conductores',
    table: 'conductores',
    title: 'Conductores',
    description: 'Conductores usados en viajes de vehículos.',
    orderBy: 'nombre',
    fields: [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        placeholder: 'Nombre del conductor',
      },
      {
        name: 'dpi',
        label: 'DPI',
        type: 'text',
      },
      {
        name: 'telefono',
        label: 'Teléfono',
        type: 'text',
      },
      {
        name: 'salario_diario',
        label: 'Salario diario',
        type: 'number',
      },
      {
        name: 'activo',
        label: 'Activo',
        type: 'checkbox',
      },
    ],
    columns: ['nombre', 'dpi', 'telefono', 'salario_diario', 'activo'],
  },
]

const getToday = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getInitialValue = (field: FieldConfig) => {
  if (field.type === 'checkbox') return true
  if (field.type === 'date') return ''
  return ''
}

const buildEmptyForm = (config: TableConfig) => {
  const form: Record<string, unknown> = {}

  config.fields.forEach((field) => {
    form[field.name] = getInitialValue(field)
  })

  return form
}

const valueToString = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value)
}

const displayValue = (
  value: unknown,
  fieldName: string,
  optionMaps: Record<string, Map<string, string>>
) => {
  if (value === null || value === undefined || value === '') return '—'

  if (typeof value === 'boolean') return value ? 'Sí' : 'No'

  if (fieldName === 'empresa_id') {
    return optionMaps.empresas.get(String(value)) || String(value)
  }

  if (fieldName === 'division_id') {
    return optionMaps.divisiones.get(String(value)) || String(value)
  }

  return String(value)
}

const normalizeSearch = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

export default function EmpresasPage() {
  const [selectedKey, setSelectedKey] = useState('empresas')
  const [items, setItems] = useState<RowData[]>([])
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [editingId, setEditingId] = useState<number | string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [empresasOptions, setEmpresasOptions] = useState<OptionItem[]>([])
  const [divisionesOptions, setDivisionesOptions] = useState<OptionItem[]>([])

  const selectedConfig = useMemo(() => {
    return TABLE_CONFIGS.find((config) => config.key === selectedKey) || TABLE_CONFIGS[0]
  }, [selectedKey])

  const optionSets = useMemo(
    () => ({
      empresas: empresasOptions,
      divisiones: divisionesOptions,
    }),
    [empresasOptions, divisionesOptions]
  )

  const optionMaps = useMemo(() => {
    return {
      empresas: new Map(empresasOptions.map((item) => [String(item.id), item.label])),
      divisiones: new Map(divisionesOptions.map((item) => [String(item.id), item.label])),
    }
  }, [empresasOptions, divisionesOptions])

  const loadOptions = useCallback(async () => {
    const [empresasRes, divisionesRes] = await Promise.all([
      supabase.from('empresas').select('id,nombre').order('nombre', { ascending: true }),
      supabase.from('divisiones').select('id,nombre').order('nombre', { ascending: true }),
    ])

    if (!empresasRes.error) {
      setEmpresasOptions(
        (empresasRes.data || []).map((item) => ({
          id: item.id,
          label: item.nombre,
        }))
      )
    }

    if (!divisionesRes.error) {
      setDivisionesOptions(
        (divisionesRes.data || []).map((item) => ({
          id: item.id,
          label: item.nombre,
        }))
      )
    }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from(selectedConfig.table)
        .select('*')
        .order(selectedConfig.orderBy, { ascending: true })

      if (error) {
        console.error(error)
        alert(`No se pudieron cargar los datos: ${error.message}`)
        return
      }

      setItems((data || []) as RowData[])
    } finally {
      setLoading(false)
    }
  }, [selectedConfig.table, selectedConfig.orderBy])

  useEffect(() => {
    setForm(buildEmptyForm(selectedConfig))
    setEditingId(null)
    setSearch('')
    loadItems()
  }, [selectedConfig, loadItems])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search)

    if (!q) return items

    return items.filter((item) => {
      const text = selectedConfig.columns
        .map((column) => displayValue(item[column], column, optionMaps))
        .join(' ')
        .toLowerCase()

      return text.includes(q)
    })
  }, [items, search, selectedConfig.columns, optionMaps])

  const handleFieldChange = (field: FieldConfig, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      [field.name]: value,
    }))
  }

  const resetForm = () => {
    setForm(buildEmptyForm(selectedConfig))
    setEditingId(null)
  }

  const preparePayload = () => {
    const payload: Record<string, unknown> = {}

    selectedConfig.fields.forEach((field) => {
      const rawValue = form[field.name]

      if (field.type === 'checkbox') {
        payload[field.name] = Boolean(rawValue)
        return
      }

      if (field.type === 'number') {
        const clean = valueToString(rawValue).trim()
        payload[field.name] = clean === '' ? null : Number(clean)
        return
      }

      if (field.type === 'select') {
        const clean = valueToString(rawValue).trim()

        if (clean === '') {
          payload[field.name] = null
          return
        }

        const isNumericRelation =
          field.name.endsWith('_id') || field.name === 'anio' || field.name === 'sensores'

        payload[field.name] = isNumericRelation ? Number(clean) : clean
        return
      }

      if (field.type === 'date') {
        const clean = valueToString(rawValue).trim()
        payload[field.name] = clean === '' ? null : clean
        return
      }

      const clean = valueToString(rawValue).trim()
      payload[field.name] = clean === '' ? null : clean
    })

    if (selectedConfig.table === 'vehiculos' && editingId) {
      payload.editado_en = new Date().toISOString()
    }

    if (selectedConfig.table === 'conductores' && editingId) {
      payload.editado_en = new Date().toISOString()
    }

    return payload
  }

  const validateForm = () => {
    for (const field of selectedConfig.fields) {
      if (!field.required) continue

      const value = form[field.name]

      if (field.type === 'checkbox') continue

      if (valueToString(value).trim() === '') {
        return `El campo "${field.label}" es obligatorio.`
      }
    }

    return null
  }

  const saveItem = async () => {
    const validationError = validateForm()

    if (validationError) {
      alert(validationError)
      return
    }

    setSaving(true)

    try {
      const payload = preparePayload()

      if (editingId) {
        const { error } = await supabase
          .from(selectedConfig.table)
          .update(payload)
          .eq('id', editingId)

        if (error) {
          console.error(error)
          alert(`No se pudo actualizar: ${error.message}`)
          return
        }

        alert('Registro actualizado correctamente.')
      } else {
        const { error } = await supabase.from(selectedConfig.table).insert(payload)

        if (error) {
          console.error(error)
          alert(`No se pudo agregar: ${error.message}`)
          return
        }

        alert('Registro agregado correctamente.')
      }

      resetForm()
      await loadItems()
      await loadOptions()
    } finally {
      setSaving(false)
    }
  }

  const editItem = (item: RowData) => {
    const nextForm: Record<string, unknown> = {}

    selectedConfig.fields.forEach((field) => {
      const value = item[field.name]

      if (field.type === 'checkbox') {
        nextForm[field.name] = Boolean(value)
      } else if (field.type === 'date') {
        nextForm[field.name] = value ? String(value).slice(0, 10) : ''
      } else {
        nextForm[field.name] = value ?? ''
      }
    })

    setEditingId(item.id)
    setForm(nextForm)
  }

  const deleteItem = async (item: RowData) => {
    const label =
      valueToString(item.nombre) ||
      valueToString(item.metodo) ||
      valueToString(item.codigo) ||
      valueToString(item.placa) ||
      `ID ${item.id}`

    const confirmed = confirm(
      `¿Seguro que deseas eliminar "${label}"?\n\nSi este registro ya está siendo usado en compras, ventas, inventario o granja, la base de datos puede impedir eliminarlo.`
    )

    if (!confirmed) return

    const { error } = await supabase.from(selectedConfig.table).delete().eq('id', item.id)

    if (error) {
      console.error(error)
      alert(
        `No se pudo eliminar: ${error.message}\n\nProbablemente este registro ya está relacionado con otros datos. En ese caso, conviene editarlo o desactivarlo si tiene campo "activo".`
      )
      return
    }

    alert('Registro eliminado correctamente.')

    if (editingId === item.id) {
      resetForm()
    }

    await loadItems()
    await loadOptions()
  }

  const getOptionsForField = (field: FieldConfig) => {
    if (field.options) return field.options

    if (field.optionsKey) {
      return optionSets[field.optionsKey]
    }

    return []
  }

  const renderField = (field: FieldConfig) => {
    const value = form[field.name]

    if (field.type === 'textarea') {
      return (
        <textarea
          className="border rounded p-2 w-full min-h-[80px]"
          value={valueToString(value)}
          onChange={(e) => handleFieldChange(field, e.target.value)}
          placeholder={field.placeholder || ''}
        />
      )
    }

    if (field.type === 'checkbox') {
      return (
        <label className="flex items-center gap-2 border rounded p-2 h-[42px]">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(field, e.target.checked)}
          />
          <span>{Boolean(value) ? 'Sí' : 'No'}</span>
        </label>
      )
    }

    if (field.type === 'select') {
      const options = getOptionsForField(field)

      return (
        <select
          className="border rounded p-2 w-full"
          value={valueToString(value)}
          onChange={(e) => handleFieldChange(field, e.target.value)}
        >
          <option value="">— Selecciona —</option>
          {options.map((option) => (
            <option key={String(option.id)} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        type={field.type}
        className="border rounded p-2 w-full"
        value={valueToString(value)}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        placeholder={field.placeholder || ''}
      />
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-center mb-4">
        <Image src="/logo.png" alt="Logo Empresa" width={140} height={60} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Administración de opciones</h1>
          <p className="text-sm text-gray-600">
            Agrega, edita y elimina catálogos usados por el sistema.
          </p>
        </div>

        <div className="ml-auto flex gap-2">
          <Link
            href="/dashboard"
            className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded text-sm"
          >
            ← Volver a Erogaciones
          </Link>

          <Link
            href="/menu"
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded text-sm"
          >
            Menú principal
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Catálogos</h2>

          <div className="grid gap-2">
            {TABLE_CONFIGS.map((config) => (
              <button
                key={config.key}
                type="button"
                onClick={() => setSelectedKey(config.key)}
                className={`text-left border rounded px-3 py-2 text-sm ${
                  selectedKey === config.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold">{config.title}</div>
                <div
                  className={`text-xs ${
                    selectedKey === config.key ? 'text-blue-50' : 'text-gray-500'
                  }`}
                >
                  {config.table}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="border rounded-lg bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedConfig.title}</h2>
                <p className="text-sm text-gray-600">{selectedConfig.description}</p>
              </div>

              {editingId ? (
                <div className="ml-auto text-sm bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded">
                  Editando ID: <b>{editingId}</b>
                </div>
              ) : (
                <div className="ml-auto text-sm bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded">
                  Nuevo registro
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {selectedConfig.fields.map((field) => (
                <div
                  key={field.name}
                  className={field.type === 'textarea' ? 'md:col-span-2' : ''}
                >
                  <label className="block text-xs font-semibold mb-1">
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                  </label>

                  {renderField(field)}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={saveItem}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 rounded"
              >
                {saving
                  ? 'Guardando...'
                  : editingId
                    ? 'Guardar cambios'
                    : 'Agregar'}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 py-2 rounded"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div>
                <h2 className="font-semibold">Registros</h2>
                <p className="text-xs text-gray-500">
                  Mostrando {filteredItems.length} de {items.length}
                </p>
              </div>

              <input
                className="ml-auto border rounded p-2 text-sm min-w-[260px]"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <button
                type="button"
                onClick={loadItems}
                disabled={loading}
                className="bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
              >
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>

            <div className="border rounded overflow-auto max-h-[560px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-200 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    {selectedConfig.columns.map((column) => (
                      <th key={column} className="p-2 text-left">
                        {column}
                      </th>
                    ))}
                    <th className="p-2 text-left">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={selectedConfig.columns.length + 2}
                        className="p-3 text-gray-500"
                      >
                        No hay registros para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={String(item.id)}
                        className={`border-t ${
                          editingId === item.id ? 'bg-amber-50' : ''
                        }`}
                      >
                        <td className="p-2 font-semibold">{String(item.id)}</td>

                        {selectedConfig.columns.map((column) => (
                          <td key={column} className="p-2">
                            {displayValue(item[column], column, optionMaps)}
                          </td>
                        ))}

                        <td className="p-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editItem(item)}
                              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded text-xs"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteItem(item)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500 mt-3">
              Si un registro ya está relacionado con ventas, erogaciones, inventario,
              vehículos o granja, Supabase puede impedir eliminarlo. En ese caso,
              edítalo o desactívalo si tiene campo activo.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
