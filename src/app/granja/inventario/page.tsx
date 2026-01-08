'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Ubicacion = {
  id: number
  codigo: string
  nombre: string | null
  activo: boolean
}

type StockRow = {
  ubicacion_id: number
  cantidad: number | null
}

type StockMap = Record<number, number>

export default function GranjaInventarioPage() {
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [stockTeorico, setStockTeorico] = useState<StockMap>({})
  const [valoresEditados, setValoresEditados] = useState<Record<number, string>>(
    {}
  )
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // ----------- helpers de agrupacion -----------

  const groupNameFor = (u: Ubicacion): string => {
    if (u.nombre && u.nombre.includes(' - ')) {
      return u.nombre.split(' - ')[0] || 'Otros'
    }
    if (u.nombre) return u.nombre
    // heuristica por codigo
    if (u.codigo.startsWith('TR')) return 'Galera'
    if (u.codigo.startsWith('M1')) return 'Maternidad 1'
    if (u.codigo.startsWith('M2')) return 'Maternidad 2'
    if (u.codigo.startsWith('L1')) return 'Lechonera 1'
    if (u.codigo.startsWith('L2')) return 'Lechonera 2'
    if (u.codigo.startsWith('L3')) return 'Lechonera 3'
    if (u.codigo.startsWith('S2')) return 'Sitio 2'
    return 'Otros'
  }

  const grupos = useMemo(() => {
    const g: Record<string, Ubicacion[]> = {}
    for (const u of ubicaciones) {
      const nombreGrupo = groupNameFor(u)
      if (!g[nombreGrupo]) g[nombreGrupo] = []
      g[nombreGrupo].push(u)
    }
    // ordenar ubicaciones dentro de cada grupo por codigo
    for (const key of Object.keys(g)) {
      g[key].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
    }
    return g
  }, [ubicaciones])

  // ----------- cargar datos -----------

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      // 1) ubicaciones activas
      const { data: ubicData, error: ubicError } = await supabase
        .from('granja_ubicaciones')
        .select('id, codigo, nombre, activo')
        .eq('activo', true)
        .order('codigo', { ascending: true })

      if (ubicError) {
        console.error('Error cargando ubicaciones', ubicError)
        return
      }

      const ubicList = (ubicData as Ubicacion[]) || []
      setUbicaciones(ubicList)

      if (ubicList.length === 0) {
        setStockTeorico({})
        setValoresEditados({})
        return
      }

      // 2) inventario teorico por movimientos
      const { data: movData, error: movError } = await supabase
        .from('granja_movimientos')
        .select('ubicacion_id, cantidad')

      if (movError) {
        console.error('Error cargando movimientos', movError)
        return
      }

      const mapa: StockMap = {}
      ;(movData as StockRow[]).forEach((row) => {
        const id = row.ubicacion_id
        const cant = Number(row.cantidad || 0)
        if (!mapa[id]) mapa[id] = 0
        mapa[id] += cant
      })

      setStockTeorico(mapa)

      // 3) valores editados iniciales (como strings en inputs)
      const inicial: Record<number, string> = {}
      for (const u of ubicList) {
        const cant = mapa[u.id] ?? 0
        inicial[u.id] = String(cant)
      }
      setValoresEditados(inicial)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  // ----------- cambios en inputs -----------

  const actualizarValor = (idUbicacion: number, valor: string) => {
    setValoresEditados((prev) => ({
      ...prev,
      [idUbicacion]: valor,
    }))
  }

  // ----------- guardar ajustes -----------

  const guardarInventario = async () => {
    if (guardando) return

    setGuardando(true)
    try {
      // obtener usuario actual para registrar quien ajusta
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? null

      const ajustes: {
        ubicacion_id: number
        tipo: string
        cantidad: number
        referencia_tabla: string
        referencia_id: number | null
        observaciones: string
        user_id: string | null
      }[] = []

      for (const u of ubicaciones) {
        const original = stockTeorico[u.id] ?? 0
        const texto = valoresEditados[u.id] ?? ''
        const nuevoNumero = texto.trim() === '' ? 0 : Number(texto)

        if (Number.isNaN(nuevoNumero)) {
          alert(
            `El valor para la ubicación ${u.codigo} no es un número válido.`
          )
          setGuardando(false)
          return
        }

        const diff = nuevoNumero - original
        if (diff !== 0) {
          ajustes.push({
            ubicacion_id: u.id,
            tipo: 'AJUSTE',
            cantidad: diff, // positivo agrega, negativo descuenta
            referencia_tabla: 'INVENTARIO_MANUAL',
            referencia_id: null,
            observaciones:
              'Ajuste manual desde pantalla de inventario de granja',
            user_id: userId,
          })
        }
      }

      if (ajustes.length === 0) {
        alert('No hay cambios que guardar.')
        setGuardando(false)
        return
      }

      const { error: insertError } = await supabase
        .from('granja_movimientos')
        .insert(ajustes)

      if (insertError) {
        console.error('Error registrando ajustes', insertError)
        alert('Ocurrió un error al guardar los ajustes de inventario.')
        setGuardando(false)
        return
      }

      alert('Inventario guardado correctamente.')
      await cargarDatos()
    } finally {
      setGuardando(false)
    }
  }

  // ----------- UI -----------

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* encabezado */}
      <div className="mb-6 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-10" />
        <div>
          <h1 className="text-2xl font-bold">Granja — Inventario</h1>
          <p className="text-xs text-gray-600">
            Ajuste manual del inventario por tramo o jaula. Cada cambio se
            registra como movimiento de tipo ajuste.
          </p>
        </div>
        <Link
          href="/granja"
          className="ml-auto inline-block bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded text-sm"
        >
          ⬅ Menú de Granja
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        {loading ? (
          <p className="text-xs text-gray-500">
            Cargando ubicaciones e inventario…
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            Ubicaciones activas: {ubicaciones.length}
          </p>
        )}

        <button
          onClick={guardarInventario}
          disabled={guardando || loading}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm"
        >
          {guardando ? 'Guardando…' : 'Guardar inventario'}
        </button>
      </div>

      {/* grid de tarjetas de inventario, parecido al diseño original */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grupos).map(([grupo, lista]) => (
          <div
            key={grupo}
            className="border rounded-lg bg-white shadow-sm p-3"
          >
            <h2 className="text-xs font-semibold mb-2 uppercase tracking-wide">
              {grupo}
            </h2>

            <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1 text-xs">
              {lista.map((u) => (
                <Fragment key={u.id}>
                  <div className="py-1 pr-1 text-right font-medium">
                    {u.codigo}
                  </div>
                  <input
                    type="number"
                    className="border rounded w-full px-2 py-1 text-right"
                    value={valoresEditados[u.id] ?? ''}
                    onChange={(e) =>
                      actualizarValor(u.id, e.target.value)
                    }
                  />
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
