-- VIEW de existencias por producto
create or replace view public.inventario_existencias as
select
  p.id                as producto_id,
  p.nombre,
  p.sku,
  p.unidad,
  p.control_inventario,
  coalesce(
    sum(
      case m.tipo
        when 'ENTRADA' then m.cantidad
        when 'SALIDA'  then -m.cantidad
        else 0
      end
    ), 0
  )::numeric as existencia
from public.productos p
left join public.inventario_movimientos m
  on m.producto_id = p.id
group by p.id;

-- Opcional pero recomendado: SKU único si decides usarlo como código principal
create unique index if not exists idx_productos_sku_unique on public.productos (sku) where sku is not null;

-- Permisos (asumiendo que ya tienes RLS/Policies para authenticated en tablas base)
grant select on public.inventario_existencias to anon, authenticated;
