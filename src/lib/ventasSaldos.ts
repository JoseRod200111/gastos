/**
 * Regla única para saldos de ventas. El método de pago es el origen del
 * crédito; un registro en pagos_venta documenta dinero recibido, NO crea deuda.
 *
 * Una venta puede tener líneas de contado y líneas a crédito. Solamente la
 * suma de las líneas marcadas Pendiente de Pago forma el crédito original.
 * Los abonos vinculados (y los generales una vez distribuidos) reducen ese
 * crédito, pero nunca incrementan la deuda de una venta de contado.
 */
export const redondearCentavos = (valor: number) =>
  Math.round((valor + Number.EPSILON) * 100) / 100

export function esMetodoPendiente(
  formaPagoId: number | null,
  nombreMetodo: string | null | undefined,
  idsPendientes?: ReadonlySet<number>
): boolean {
  if (formaPagoId !== null && idsPendientes?.has(formaPagoId)) return true
  return String(nombreMetodo ?? '').toLocaleLowerCase('es').includes('pendiente')
}

export type LineaSaldoVenta = {
  importe: number
  forma_pago_id: number | null
  metodo?: string | null
}

export type ResultadoSaldoVenta = {
  total: number
  credito: number
  abonado: number
  pagado: number
  saldo: number
  excesoAbonos: number
  requiereRevision: boolean
  motivoRevision: string | null
}

export function calcularSaldoVenta(
  lineas: ReadonlyArray<LineaSaldoVenta>,
  totalAbonos: number,
  idsPendientes?: ReadonlySet<number>
): ResultadoSaldoVenta {
  const total = redondearCentavos(lineas.reduce((s, l) => s + Number(l.importe || 0), 0))
  const credito = redondearCentavos(lineas.reduce((s, l) =>
    s + (esMetodoPendiente(l.forma_pago_id, l.metodo, idsPendientes)
      ? Number(l.importe || 0) : 0), 0))
  const totalRecibido = redondearCentavos(Math.max(0, Number(totalAbonos || 0)))
  const hayLineaContado = total > credito
  const contadoConPagoParcial = credito === 0 && totalRecibido > 0 && totalRecibido < total
  const ventaMixtaAmbigua = credito > 0 && hayLineaContado && totalRecibido > 0 && totalRecibido < total
  const requiereRevision = contadoConPagoParcial || ventaMixtaAmbigua
  const motivoRevision = contadoConPagoParcial
    ? 'Los detalles indican pago de contado, pero los abonos registrados no cubren la venta.'
    : ventaMixtaAmbigua
      ? 'La venta mezcla líneas de contado y crédito y tiene abonos: verificar que no se descuente dos veces el pago de contado.'
      : null
  // Una venta de contado con solo un pago parcial documentado es ambigua.
  // NO declarar saldo cero ni inventar un cobro. Exponer provisionalmente
  // la diferencia, identificándola claramente para conciliación humana.
  const creditoEnRevision = contadoConPagoParcial ? total : credito
  const abonado = redondearCentavos(Math.min(creditoEnRevision, totalRecibido))
  const saldo = redondearCentavos(Math.max(0, creditoEnRevision - abonado))
  return {
    total,
    credito: creditoEnRevision,
    abonado,
    pagado: redondearCentavos(Math.max(0, total - saldo)),
    saldo,
    excesoAbonos: redondearCentavos(Math.max(0, totalRecibido - creditoEnRevision)),
    requiereRevision,
    motivoRevision,
  }
}

/** Distribuye abonos sin venta_id de la deuda más antigua a la más reciente.
 * Nunca asigna un abono general a ventas totalmente de contado.
 * No escribe datos: solo evita que el mismo abono se reste a varias ventas.
 */
export function distribuirAbonosGenerales(
  ventas: ReadonlyArray<{ venta_id: number; fecha: string; credito: number; abonado: number }>,
  montoGeneral: number
): Record<number, number> {
  const adicionales: Record<number, number> = {}
  let restante = redondearCentavos(Math.max(0, Number(montoGeneral || 0)))
  const ordenadas = [...ventas].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.venta_id - b.venta_id)
  for (const v of ordenadas) {
    if (restante <= 0) break
    const sinCobrar = redondearCentavos(Math.max(0, v.credito - v.abonado))
    const monto = redondearCentavos(Math.min(restante, sinCobrar))
    if (monto <= 0) continue
    adicionales[v.venta_id] = monto
    restante = redondearCentavos(restante - monto)
  }
  return adicionales
}
