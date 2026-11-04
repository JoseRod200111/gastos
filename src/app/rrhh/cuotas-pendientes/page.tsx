
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

// Solo lectura: no ejecuta RPC, INSERT, UPDATE ni DELETE.

type Empleado = {
  id: number
  codigo: string
  nombre_completo: string
}

type Periodo = {
  id: number
  anio: number
  mes: number
  quincena: number
  fecha_inicio: string
  fecha_fin: string
  estado: string
}

type Ficha = {
  id: number
  empleado_id: number
  periodo_id: number
  estado: string
  fecha_pago: string | null
  descuentos_ventas: number
  prestamos: number
}

type VentaPadre = {
  empleado_id: number
  estado: string
  fecha: string
}

type PrestamoPadre = {
  empleado_id: number
  estado: string
  fecha: string
}

type Cuota = {
  id: number
  tipo: 'VENTA_EMPLEADO' | 'PRESTAMO'
  empleado_id: number
  periodo_id: number | null
  monto: number
  numero_cuota: number
  fecha_origen: string
  estado_padre: string
  evidencia_pago: boolean
}

type EstadoRevision =
  | 'CON_FICHA_PAGADA_COINCIDE'
  | 'CON_FICHA_PAGADA_DIFIERE'
  | 'ATRASADA'
  | 'ACTUAL'
  | 'FUTURA'
  | 'REVISAR'

type Caso = Cuota & {
  empleado?: Empleado
  periodo?: Periodo
  ficha?: Ficha
  importeGrupo: number
  descuentoFicha: number
  estadoRevision: EstadoRevision
}

const n = (valor: unknown): number => {
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : 0
}

const moneda = (valor: number): string =>
  `Q${n(valor).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const nombrePeriodo = (p?: Periodo): string =>
  p
    ? `${p.anio}-${String(p.mes).padStart(2, '0')} Q${p.quincena}`
    : 'Sin período'

const normalizarRelacion = <T,>(
  valor: T | T[] | null | undefined
): T | undefined =>
  Array.isArray(valor) ? valor[0] : (valor ?? undefined)

export default function CuotasPendientesSoloLectura() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [cuotas, setCuotas] = useState<Cuota[]>([])
  const [periodoId, setPeriodoId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloAtrasadas, setSoloAtrasadas] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    setCargado(false)

    try {
      const [e, p, v, pr, f] = await Promise.all([
        supabase
          .from('rrhh_empleados')
          .select('id,codigo,nombre_completo')
          .order('codigo')
          .range(0, 999),

        supabase
          .from('rrhh_periodos_planilla')
          .select('id,anio,mes,quincena,fecha_inicio,fecha_fin,estado')
          .order('fecha_inicio', { ascending: false })
          .range(0, 999),

        supabase
          .from('rrhh_descuentos_ventas_cuotas')
          .select('id,numero_cuota,monto,estado,periodo_id,aplicado_en,pago_venta_id,aplicado_monto_ventas,aplicado_monto_granja,rrhh_descuentos_ventas!inner(empleado_id,estado,fecha)')
          .eq('estado', 'PENDIENTE')
          .range(0, 999),

        supabase
          .from('rrhh_prestamo_cuotas')
          .select('id,numero_cuota,monto,estado,periodo_id,rrhh_prestamos!inner(empleado_id,estado,fecha)')
          .eq('estado', 'PENDIENTE')
          .range(0, 999),

        supabase
          .from('rrhh_planilla_empleado')
          .select('id,empleado_id,periodo_id,estado,fecha_pago,descuentos_ventas,prestamos')
          .range(0, 999),
      ])

      const consultas = [
        { nombre: 'empleados', respuesta: e },
        { nombre: 'períodos', respuesta: p },
        { nombre: 'cuotas de ventas', respuesta: v },
        { nombre: 'cuotas de préstamos', respuesta: pr },
        { nombre: 'fichas', respuesta: f },
      ]

      for (const consulta of consultas) {
        if (consulta.respuesta.error) {
          throw new Error(
            `${consulta.nombre}: ${consulta.respuesta.error.message}`
          )
        }

        if ((consulta.respuesta.data || []).length >= 1000) {
          throw new Error(
            `La consulta de ${consulta.nombre} alcanzó 1000 registros. Se detuvo para evitar un listado parcial.`
          )
        }
      }

      const listaVenta: Cuota[] = (v.data || []).map((registro) => {
        const padre = normalizarRelacion(
          registro.rrhh_descuentos_ventas as
            | VentaPadre
            | VentaPadre[]
            | null
        )

        return {
          id: n(registro.id),
          tipo: 'VENTA_EMPLEADO',
          empleado_id: n(padre?.empleado_id),
          periodo_id:
            registro.periodo_id === null
              ? null
              : n(registro.periodo_id),
          numero_cuota: n(registro.numero_cuota),
          monto: n(registro.monto),
          fecha_origen: padre?.fecha || '',
          estado_padre: padre?.estado || '',
          evidencia_pago: Boolean(
            registro.aplicado_en ||
            registro.pago_venta_id ||
            n(registro.aplicado_monto_ventas) ||
            n(registro.aplicado_monto_granja)
          ),
        }
      })

      const listaPrestamo: Cuota[] = (pr.data || []).map((registro) => {
        const padre = normalizarRelacion(
          registro.rrhh_prestamos as
            | PrestamoPadre
            | PrestamoPadre[]
            | null
        )

        return {
          id: n(registro.id),
          tipo: 'PRESTAMO',
          empleado_id: n(padre?.empleado_id),
          periodo_id:
            registro.periodo_id === null
              ? null
              : n(registro.periodo_id),
          numero_cuota: n(registro.numero_cuota),
          monto: n(registro.monto),
          fecha_origen: padre?.fecha || '',
          estado_padre: padre?.estado || '',
          evidencia_pago: false,
        }
      })

      const listaPeriodos = (p.data || []) as Periodo[]

      setEmpleados((e.data || []) as Empleado[])
      setPeriodos(listaPeriodos)
      setFichas((f.data || []) as Ficha[])
      setCuotas([...listaVenta, ...listaPrestamo])

      setPeriodoId((anterior) =>
        anterior &&
        listaPeriodos.some((x) => String(x.id) === anterior)
          ? anterior
          : String(
              listaPeriodos.find((x) => x.estado === 'ABIERTO')?.id ||
              listaPeriodos[0]?.id ||
              ''
            )
      )

      setCargado(true)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudieron consultar las cuotas.'
      )
      setCuotas([])
      setCargado(false)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const periodoSeleccionado = periodos.find(
    (p) => String(p.id) === periodoId
  )

  const casos = useMemo((): Caso[] => {
    const mapaEmpleados = new Map(
      empleados.map((e) => [e.id, e])
    )

    const mapaPeriodos = new Map(
      periodos.map((p) => [p.id, p])
    )

    const mapaFichas = new Map(
      fichas.map((f) => [
        `${f.periodo_id}:${f.empleado_id}`,
        f,
      ])
    )

    const grupoPendientes = new Map<string, number>()

    for (const cuota of cuotas) {
      const clave =
        `${cuota.empleado_id}:${cuota.periodo_id ?? 'SIN_PERIODO'}:${cuota.tipo}`

      grupoPendientes.set(
        clave,
        n(grupoPendientes.get(clave)) + cuota.monto
      )
    }

    return cuotas.map((c) => {
      const periodo =
        c.periodo_id === null
          ? undefined
          : mapaPeriodos.get(c.periodo_id)

      const ficha =
        c.periodo_id === null
          ? undefined
          : mapaFichas.get(
              `${c.periodo_id}:${c.empleado_id}`
            )

      const descuentoFicha = ficha
        ? n(
            c.tipo === 'VENTA_EMPLEADO'
              ? ficha.descuentos_ventas
              : ficha.prestamos
          )
        : 0

      const importeGrupo = n(
        grupoPendientes.get(
          `${c.empleado_id}:${c.periodo_id ?? 'SIN_PERIODO'}:${c.tipo}`
        )
      )

      let estadoRevision: EstadoRevision = 'ACTUAL'

      if (
        c.evidencia_pago ||
        c.estado_padre !==
          (c.tipo === 'VENTA_EMPLEADO' ? 'PENDIENTE' : 'ACTIVO')
      ) {
        estadoRevision = 'REVISAR'
      } else if (
        periodoSeleccionado &&
        periodo &&
        periodo.fecha_inicio > periodoSeleccionado.fecha_inicio
      ) {
        estadoRevision = 'FUTURA'
      } else if (
        periodoSeleccionado &&
        !periodo &&
        c.fecha_origen > periodoSeleccionado.fecha_fin
      ) {
        estadoRevision = 'FUTURA'
      } else if (ficha?.estado === 'PAGADO') {
        estadoRevision =
          Math.abs(descuentoFicha - importeGrupo) < 0.01
            ? 'CON_FICHA_PAGADA_COINCIDE'
            : 'CON_FICHA_PAGADA_DIFIERE'
      } else if (
        !periodo ||
        (
          periodoSeleccionado &&
          periodo.fecha_inicio < periodoSeleccionado.fecha_inicio
        )
      ) {
        estadoRevision = 'ATRASADA'
      }

      return {
        ...c,
        empleado: mapaEmpleados.get(c.empleado_id),
        periodo,
        ficha,
        descuentoFicha,
        importeGrupo,
        estadoRevision,
      }
    }).sort(
      (a, b) =>
        (a.empleado?.codigo || '').localeCompare(
          b.empleado?.codigo || ''
        ) ||
        (a.periodo?.fecha_inicio || '').localeCompare(
          b.periodo?.fecha_inicio || ''
        ) ||
        a.tipo.localeCompare(b.tipo) ||
        a.id - b.id
    )
  }, [
    empleados,
    periodos,
    fichas,
    cuotas,
    periodoSeleccionado,
  ])

  const visibles = useMemo(() => {
    const texto = busqueda.toLocaleLowerCase('es').trim()

    return casos.filter((c) => {
      if (
        soloAtrasadas &&
        (
          c.estadoRevision === 'ACTUAL' ||
          c.estadoRevision === 'FUTURA'
        )
      ) {
        return false
      }

      return (
        !texto ||
        `${c.empleado?.codigo || ''} ${c.empleado?.nombre_completo || ''} ${c.id} ${c.tipo}`
          .toLocaleLowerCase('es')
          .includes(texto)
      )
    })
  }, [casos, busqueda, soloAtrasadas])

  const totales = useMemo(() => ({
    vencidas: casos.filter(
      (c) => c.estadoRevision === 'ATRASADA'
    ),
    historicas: casos.filter(
      (c) => c.estadoRevision.startsWith('CON_FICHA_PAGADA')
    ),
    revisar: casos.filter(
      (c) => c.estadoRevision === 'REVISAR'
    ),
  }), [casos])

  const etiquetas: Record<EstadoRevision, string> = {
    CON_FICHA_PAGADA_COINCIDE:
      'Ficha PAGADA: importes coinciden; confirmar retención y aplicación antes de actuar',
    CON_FICHA_PAGADA_DIFIERE:
      'Ficha PAGADA: importes diferentes; revisar',
    ATRASADA:
      'Vencida sin pago confirmado: revisar/reprogramar',
    ACTUAL:
      'Programada en período seleccionado',
    FUTURA:
      'Programada para período posterior',
    REVISAR:
      'Indicador de aplicación previa o estado distinto: auditar',
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-sm text-slate-900">
      <header className="flex flex-wrap justify-between gap-3 items-start mb-5">
        <div>
          <h1 className="text-2xl font-bold">
            RRHH — Cuotas pendientes y vencidas
          </h1>
          <p className="text-slate-600 mt-1">
            Etapa de auditoría. Solo lectura: no aplica descuentos
            ni cambia planillas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/rrhh/planilla"
            className="rounded bg-slate-800 px-3 py-2 text-white"
          >
            Volver a Planilla
          </Link>

          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50"
          >
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <div className="rounded border border-amber-300 bg-amber-50 p-3 mb-4">
        <strong>No confirmar cuotas desde este listado.</strong>
        {' '}Una ficha histórica PAGADA puede mostrar un descuento
        sin que exista su aplicación. Primero se debe confirmar la
        retención real y consultar las aplicaciones en Supabase.
        La pantalla no lee la tabla de aplicaciones protegida.
        Los importes mostrados NO son automáticamente dinero por cobrar.
      </div>

      <section className="rounded border p-4 mb-4 flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">
            Período de referencia
          </span>
          <select
            className="border rounded p-2 bg-white"
            value={periodoId}
            onChange={(e) => setPeriodoId(e.target.value)}
          >
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {nombrePeriodo(p)} · {p.estado} · #{p.id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">
            Buscar empleado o cuota
          </span>
          <input
            className="border rounded p-2 min-w-60"
            placeholder="Código, nombre o número"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>

        <label className="flex gap-2 items-center pb-2">
          <input
            type="checkbox"
            checked={soloAtrasadas}
            onChange={(e) => setSoloAtrasadas(e.target.checked)}
          />
          Solo atrasadas / por conciliar
        </label>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 text-red-800 p-3 mb-4"
        >
          {error}
        </div>
      )}

      {cargado && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded border p-3">
              <p className="text-slate-600">
                Atrasadas sin ficha pagada
              </p>
              <p className="font-bold text-xl">
                {totales.vencidas.length} ·{' '}
                {moneda(
                  totales.vencidas.reduce(
                    (s, c) => s + c.monto, 0
                  )
                )}
              </p>
            </div>

            <div className="rounded border p-3">
              <p className="text-slate-600">
                Cuotas de fichas PAGADAS por comprobar
              </p>
              <p className="font-bold text-xl">
                {totales.historicas.length} ·{' '}
                {moneda(
                  totales.historicas.reduce(
                    (s, c) => s + c.monto, 0
                  )
                )}
              </p>
            </div>

            <div className="rounded border p-3">
              <p className="text-slate-600">
                Otras inconsistencias
              </p>
              <p className="font-bold text-xl">
                {totales.revisar.length} ·{' '}
                {moneda(
                  totales.revisar.reduce(
                    (s, c) => s + c.monto, 0
                  )
                )}
              </p>
            </div>
          </div>

          <p className="mb-3 text-slate-600">
            Mostrando {visibles.length} cuotas de {casos.length}
            {' '}cuotas pendientes registradas. Este listado no
            altera sus estados.
          </p>

          <div className="overflow-x-auto border rounded">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {[
                    'Empleado',
                    'Tipo',
                    'Cuota',
                    'Origen',
                    'Ficha original',
                    'Descuento en ficha / suma pendientes',
                    'Revisión',
                  ].map((titulo) => (
                    <th
                      key={titulo}
                      className="p-2 border-b whitespace-nowrap"
                    >
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibles.map((c) => (
                  <tr
                    key={`${c.tipo}-${c.id}`}
                    className="border-b align-top"
                  >
                    <td className="p-2">
                      <strong>
                        {c.empleado?.codigo || c.empleado_id}
                      </strong>
                      <div className="text-xs">
                        {c.empleado?.nombre_completo || ''}
                      </div>
                    </td>

                    <td className="p-2 whitespace-nowrap">
                      {c.tipo === 'PRESTAMO'
                        ? 'Préstamo'
                        : 'Venta empleado'}
                    </td>

                    <td className="p-2 whitespace-nowrap">
                      #{c.id} · {moneda(c.monto)}
                    </td>

                    <td className="p-2 whitespace-nowrap">
                      {nombrePeriodo(c.periodo)}
                    </td>

                    <td className="p-2 whitespace-nowrap">
                      {c.ficha
                        ? `#${c.ficha.id} · ${c.ficha.estado}`
                        : 'Sin ficha'}
                    </td>

                    <td className="p-2 whitespace-nowrap">
                      {c.ficha
                        ? `${moneda(c.descuentoFicha)} / ${moneda(c.importeGrupo)}`
                        : '—'}
                    </td>

                    <td className="p-2">
                      {etiquetas[c.estadoRevision]}
                    </td>
                  </tr>
                ))}

                {visibles.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-4 text-center text-slate-500"
                    >
                      No hay cuotas en este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
