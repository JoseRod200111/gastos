/**
 * Granja - agrupación de operaciones comerciales para estados de cuenta.
 * Solo lectura: no crea, mueve ni aplica pagos.
 * Nunca se agrupan ventas por proximidad horaria, precio ni nombre de cliente.
 */

export type VentaGranjaDeuda = {
  id: number
  fecha: string
  cliente_id: number
  total: number
  pagado: number
  deuda: number
  observaciones: string | null
  multi_id: string | null
  multi_folio: number | null
  ubicacion_id?: number | null
  clientes?: { nombre: string | null; nit: string | null } | null
  granja_ubicaciones?: { codigo: string | null; nombre: string | null } | null
}

export type OperacionDeuda = {
  clave: string
  etiqueta: string
  fecha: string
  cliente_id: number
  multi_id: string | null
  multi_folio: number | null
  esMulti: boolean
  total: number
  pagado: number
  deuda: number
  tramos: VentaGranjaDeuda[]
}

export const aNumero = (valor: unknown): number => {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}
export const aCentavos = (valor: unknown) => Math.round(aNumero(valor) * 100)
export const aQuetzales = (centavos: number) => centavos / 100
export const formatoQuetzales = (importe: number) => `Q${aNumero(importe).toFixed(2)}`

function relacion<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor ?? null
}

export function normalizarVentaDeuda(entrada: Record<string, unknown>): VentaGranjaDeuda {
  const cliente = relacion(entrada.clientes as VentaGranjaDeuda['clientes'] | VentaGranjaDeuda['clientes'][])
  const ubicacion = relacion(entrada.granja_ubicaciones as VentaGranjaDeuda['granja_ubicaciones'] | VentaGranjaDeuda['granja_ubicaciones'][])
  const folio = entrada.multi_folio == null ? null : Number(entrada.multi_folio)
  return {
    id: Number(entrada.id),
    fecha: String(entrada.fecha || ''),
    cliente_id: Number(entrada.cliente_id),
    total: aNumero(entrada.total),
    pagado: aNumero(entrada.pagado),
    deuda: aNumero(entrada.deuda),
    observaciones: entrada.observaciones == null ? null : String(entrada.observaciones),
    multi_id: entrada.multi_id ? String(entrada.multi_id).trim() || null : null,
    multi_folio: folio !== null && Number.isSafeInteger(folio) && folio > 0 ? folio : null,
    ubicacion_id: entrada.ubicacion_id == null ? null : Number(entrada.ubicacion_id),
    clientes: cliente || null,
    granja_ubicaciones: ubicacion || null,
  }
}

function codigoLegado(observaciones: string | null): string | null {
  const coincidencia = (observaciones || '').match(/MULTI:([a-zA-Z0-9_-]+)/i)
  return coincidencia ? coincidencia[1].toUpperCase() : null
}

export function codigoFolioMT(folio: number): string {
  return `MT${String(folio).padStart(3, '0')}`
}

function identidad(v: VentaGranjaDeuda): { clave: string; etiqueta: string; esMulti: boolean } {
  const fecha = v.fecha
  const cliente = v.cliente_id
  const legado = codigoLegado(v.observaciones)
  const folio = v.multi_folio
  const uuid = v.multi_id
  const nombre = folio !== null
    ? codigoFolioMT(folio)
    : legado
      ? (/^MT\d+$/.test(legado) ? legado : `LEGADO-${legado.slice(0, 10)}`)
      : uuid
        ? `MULTI-${uuid.slice(0, 8).toUpperCase()}`
        : `#${v.id}`

  // El UUID tiene prioridad. El folio y la fecha impiden mezclar datos inconsistentes.
  if (uuid) return { clave: `UUID:${cliente}:${fecha}:${uuid}:${folio ?? 'SIN_FOLIO'}`, etiqueta: nombre, esMulti: true }
  // En registros sin UUID, únicamente coinciden folio + cliente + fecha.
  if (folio !== null) return { clave: `FOLIO:${cliente}:${fecha}:${folio}`, etiqueta: nombre, esMulti: true }
  // Legado: coincidir con token MULTI exacto + cliente + fecha, no por heurísticas.
  if (legado) return { clave: `LEGADO:${cliente}:${fecha}:${legado}`, etiqueta: nombre, esMulti: true }
  return { clave: `VENTA:${v.id}`, etiqueta: nombre, esMulti: false }
}

export function agruparVentasDeuda(ventas: VentaGranjaDeuda[]): OperacionDeuda[] {
  const mapa = new Map<string, OperacionDeuda>()
  const acumulados = new Map<string, { total: number; pagado: number; deuda: number }>()
  for (const venta of ventas) {
    const { clave, etiqueta, esMulti } = identidad(venta)
    let grupo = mapa.get(clave)
    if (!grupo) {
      grupo = {
        clave, etiqueta, fecha: venta.fecha, cliente_id: venta.cliente_id,
        multi_id: venta.multi_id, multi_folio: venta.multi_folio, esMulti,
        total: 0, pagado: 0, deuda: 0, tramos: [],
      }
      mapa.set(clave, grupo)
      acumulados.set(clave, { total: 0, pagado: 0, deuda: 0 })
    }
    grupo.tramos.push(venta)
    const suma = acumulados.get(clave)!
    suma.total += aCentavos(venta.total)
    suma.pagado += aCentavos(venta.pagado)
    suma.deuda += aCentavos(venta.deuda)
  }
  const grupos = Array.from(mapa.values())
  for (const grupo of grupos) {
    const sumas = acumulados.get(grupo.clave)!
    grupo.total = aQuetzales(sumas.total)
    grupo.pagado = aQuetzales(sumas.pagado)
    grupo.deuda = aQuetzales(sumas.deuda)
    grupo.tramos.sort((a, b) =>
      (a.granja_ubicaciones?.codigo || '').localeCompare(b.granja_ubicaciones?.codigo || '', 'es', { numeric: true }) || a.id - b.id
    )
  }
  grupos.sort((a, b) => a.fecha.localeCompare(b.fecha) ||
    Math.min(...a.tramos.map((v) => v.id)) - Math.min(...b.tramos.map((v) => v.id)))
  return grupos
}

export function sumarOperaciones(grupos: OperacionDeuda[]) {
  const totales = grupos.reduce((acc, grupo) => {
    acc.credito += aCentavos(grupo.total)
    acc.abonado += aCentavos(grupo.pagado)
    acc.saldo += aCentavos(grupo.deuda)
    return acc
  }, { credito: 0, abonado: 0, saldo: 0 })
  return {
    credito: aQuetzales(totales.credito),
    abonado: aQuetzales(totales.abonado),
    saldo: aQuetzales(totales.saldo),
  }
}
