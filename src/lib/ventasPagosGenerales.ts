import { supabase } from '@/lib/supabaseClient'
import { esCobroAutomaticoDeDetalle } from '@/lib/ventasSaldos'

const PAGINA = 1000

/** Obtiene todos los abonos sin venta asignada, sin truncarlos en el límite
 * habitual de 1000 registros por consulta de Supabase.
 */
export async function obtenerAbonosGeneralesPorCliente(
  clienteIds: ReadonlyArray<number>
): Promise<Record<number, number>> {
  const totales: Record<number, number> = {}
  const ids = [...new Set(clienteIds.filter((id) => Number.isInteger(id) && id > 0))]
  for (let pos = 0; pos < ids.length; pos += 100) {
    const bloque = ids.slice(pos, pos + 100)
    let desde = 0
    while (true) {
      const { data, error } = await supabase
        .from('pagos_venta')
        .select('id,cliente_id,monto')
        .is('venta_id', null)
        .in('cliente_id', bloque)
        .order('id', { ascending: true })
        .range(desde, desde + PAGINA - 1)
      if (error) throw new Error(`Error consultando abonos generales: ${error.message}`)
      for (const p of data || []) {
        const clienteId = Number(p.cliente_id)
        totales[clienteId] = (totales[clienteId] || 0) + Number(p.monto || 0)
      }
      if (!data || data.length < PAGINA) break
      desde += PAGINA
    }
  }
  return totales
}

/** Total de abonos vinculados por venta, con lectura paginada.
 * Incluye anticipos/abonos iniciales y pagos posteriores.
 */
export async function obtenerAbonosPorVenta(
  ventasIds: ReadonlyArray<number>
): Promise<Record<number, number>> {
  const totales: Record<number, number> = {}
  const ids = [...new Set(ventasIds.filter((id) => Number.isInteger(id) && id > 0))]
  for (let pos = 0; pos < ids.length; pos += 100) {
    const bloque = ids.slice(pos, pos + 100)
    let desde = 0
    while (true) {
      const { data, error } = await supabase
        .from('pagos_venta')
        .select('id,venta_id,monto,observaciones')
        .in('venta_id', bloque)
        .order('id', { ascending: true })
        .range(desde, desde + PAGINA - 1)
      if (error) throw new Error(`No fue posible consultar los abonos: ${error.message}`)
      for (const p of data || []) {
        if (esCobroAutomaticoDeDetalle(p.observaciones)) continue
        const ventaId = Number(p.venta_id)
        totales[ventaId] = (totales[ventaId] || 0) + Number(p.monto || 0)
      }
      if (!data || data.length < PAGINA) break
      desde += PAGINA
    }
  }
  return totales
}
