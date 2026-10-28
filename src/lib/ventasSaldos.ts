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

/** totalAbonos corresponde exclusivamente a pagos aplicables al crédito.
 * Los movimientos automáticos de contado deben excluirse de esta cifra.
 */
export function calcularSaldoVenta(
  lineas: ReadonlyArray<LineaSaldoVenta>,
  totalAbonos: number,
  idsPendientes?: ReadonlySet<number>
): ResultadoSaldoVenta {
  const total = redondearCentavos(lineas.reduce((s, l) => s + Number(l.importe || 0), 0))
  const credito = redondearCentavos(lineas.reduce((s, l) =>
    s + (esMetodoPendiente(l.forma_pago_id, l.metodo, idsPendientes)
      ? Number(l.importe || 0) : 0), 0))
  const abonadoReal = redondearCentavos(Math.max(0, Number(totalAbonos || 0)))
  const abonado = redondearCentavos(Math.min(credito, abonadoReal))
  const saldo = redondearCentavos(Math.max(0, credito - abonado))
  // En una venta exclusivamente de contado, los pagos_venta pueden ser
  // asientos de caja ya representados en el método del detalle: no son
  // sobrepagos a crédito. Solo alertar si exceden incluso el total vendido.
  const excesoAbonos = redondearCentavos(Math.max(
    0, abonadoReal - (credito > 0 ? credito : total)
  ))
  // Nunca crear deuda por una discrepancia entre movimientos de contado.
  const requiereRevision = excesoAbonos > 0.009
  return {
    total,
    credito,
    abonado,
    pagado: redondearCentavos(Math.max(0, total - saldo)),
    saldo,
    excesoAbonos,
    requiereRevision,
    motivoRevision: requiereRevision
      ? 'Existen abonos superiores al crédito actualmente marcado como pendiente. Revisar historial sin crear deuda adicional.'
      : null,
  }
}

/** Distribuye abonos sin venta_id solo entre créditos reales, por antigüedad. */
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
