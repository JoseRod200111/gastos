'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Catalogo = { id: number; nombre: string }
type MetodoPago = { id: number; metodo: string }

type Proveedor = {
  id: number
  nombre: string
  nit?: string | null
  direccion?: string | null
  contacto_nombre?: string | null
  telefono?: string | null
}

type Producto = {
  id: number
  nombre: string
  sku: string | null
  unidad: string | null
  control_inventario: boolean
}

type DetalleForm = {
  producto_id?: string
  concepto: string
  cantidad: number
  precio_unitario: number
  forma_pago_id: string
  documento: string
}

type DetallePdf = {
  concepto: string
  cantidad: number
  precio_unitario: number
  importe: number
  forma_pago: string
  documento: string
}

type ErogacionPdfData = {
  id: number
  fecha: string
  empresa: string
  division: string
  categoria: string
  proveedor: string
  nit: string
  total: number
  observaciones: string
  detalles: DetallePdf[]
}

const DETALLE_INICIAL: DetalleForm = {
  producto_id: '',
  concepto: '',
  cantidad: 0,
  precio_unitario: 0,
  forma_pago_id: '',
  documento: '',
}

const toNum = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const fmtQ = (value: number) => `Q${toNum(value).toFixed(2)}`

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png')
    const blob = await res.blob()

    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function generarPDFErogacion(data: ErogacionPdfData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const logo = await fetchLogoDataUrl()

  let y = 10

  if (logo) {
    doc.addImage(logo, 'PNG', pageWidth / 2 - 22, y, 44, 18)
    y += 23
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 20, 20)
  doc.text('Comprobante de Erogación', pageWidth / 2, y, { align: 'center' })

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(`Generado: ${new Date().toLocaleString()}`, pageWidth / 2, y, {
    align: 'center',
  })

  y += 9

  const observaciones = data.observaciones?.trim() || 'N/A'
  const obsLines = doc.splitTextToSize(observaciones, contentWidth - 34)

  const tableEstimate = 18 + Math.max(data.detalles.length, 1) * 8
  const headerBlockHeight = 47 + obsLines.length * 4
  const cardHeight = Math.min(
    pageHeight - y - 18,
    headerBlockHeight + tableEstimate + 10
  )

  doc.setDrawColor(180, 180, 180)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, 'FD')

  doc.setFillColor(31, 41, 55)
  doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(`Erogación #${data.id}`, margin + 4, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Fecha: ${data.fecha}`, pageWidth - margin - 4, y + 7, {
    align: 'right',
  })

  let bodyY = y + 17
  const leftX = margin + 4
  const midX = margin + contentWidth / 2 + 2
  const lineGap = 5

  doc.setTextColor(25, 25, 25)
  doc.setFontSize(9)

  doc.setFont('helvetica', 'bold')
  doc.text('Empresa:', leftX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(data.empresa || '—', contentWidth / 2 - 18), leftX + 18, bodyY)

  doc.setFont('helvetica', 'bold')
  doc.text('División:', midX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(data.division || '—', contentWidth / 2 - 18), midX + 17, bodyY)

  bodyY += lineGap

  doc.setFont('helvetica', 'bold')
  doc.text('Categoría:', leftX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(data.categoria || '—', contentWidth / 2 - 21), leftX + 21, bodyY)

  doc.setFont('helvetica', 'bold')
  doc.text('Proveedor:', midX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(data.proveedor || '—', contentWidth / 2 - 21), midX + 20, bodyY)

  bodyY += lineGap

  doc.setFont('helvetica', 'bold')
  doc.text('NIT:', leftX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(data.nit || '—', leftX + 9, bodyY)

  doc.setFont('helvetica', 'bold')
  doc.text('Total:', midX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(fmtQ(data.total), midX + 12, bodyY)

  bodyY += lineGap

  doc.setFont('helvetica', 'bold')
  doc.text('Observaciones:', leftX, bodyY)
  doc.setFont('helvetica', 'normal')
  doc.text(obsLines, leftX + 28, bodyY)

  bodyY += Math.max(1, obsLines.length) * 4.2 + 3

  autoTable(doc, {
    startY: bodyY,
    theme: 'grid',
    margin: { left: margin + 3, right: margin + 3 },
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      halign: 'center',
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 19, halign: 'right' },
      3: { cellWidth: 19, halign: 'right' },
      4: { cellWidth: 30, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
    },
    head: [['Concepto', 'Cant.', 'P.Unit', 'Importe', 'Pago', 'Doc.']],
    body:
      data.detalles.length > 0
        ? data.detalles.map((d) => [
            d.concepto || '—',
            String(toNum(d.cantidad)),
            fmtQ(d.precio_unitario),
            fmtQ(d.importe),
            d.forma_pago || '—',
            d.documento || 'N/A',
          ])
        : [['Sin detalles', '', '', '', '', '']],
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(`Página 1 de 1`, pageWidth - 12, pageHeight - 6, {
    align: 'right',
  })

  const filename = `erogacion_${data.id}_${data.fecha}.pdf`
  doc.save(filename)
}

export default function NuevaErogacion() {
  const router = useRouter()

  const [empresas, setEmpresas] = useState<Catalogo[]>([])
  const [divisiones, setDivisiones] = useState<Catalogo[]>([])
  const [categorias, setCategorias] = useState<Catalogo[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])

  const [form, setForm] = useState({
    empresa_id: '',
    division_id: '',
    categoria_id: '',
    proveedor_id: '',
    fecha: '',
    cantidad: 0,
    observaciones: '',
  })

  const [detalles, setDetalles] = useState<DetalleForm[]>([{ ...DETALLE_INICIAL }])

  const [showNuevoProv, setShowNuevoProv] = useState(false)
  const [nuevoProv, setNuevoProv] = useState({
    nombre: '',
    nit: '',
    direccion: '',
    contacto_nombre: '',
    telefono: '',
  })

  const [ultimoId, setUltimoId] = useState<number | null>(null)
  const [ultimoPdfData, setUltimoPdfData] = useState<ErogacionPdfData | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [emp, div, cat, met, prov, prods] = await Promise.all([
        supabase.from('empresas').select('*').order('nombre', { ascending: true }),
        supabase.from('divisiones').select('*').order('nombre', { ascending: true }),
        supabase.from('categorias').select('*').order('nombre', { ascending: true }),
        supabase.from('forma_pago').select('*').order('metodo', { ascending: true }),
        supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
        supabase
          .from('productos')
          .select('id,nombre,sku,unidad,control_inventario')
          .order('nombre', { ascending: true }),
      ])

      setEmpresas((emp.data as Catalogo[]) || [])
      setDivisiones((div.data as Catalogo[]) || [])
      setCategorias((cat.data as Catalogo[]) || [])
      setMetodosPago((met.data as MetodoPago[]) || [])
      setProveedores((prov.data as Proveedor[]) || [])
      setProductos((prods.data as Producto[]) || [])
    })()
  }, [])

  const total = useMemo(
    () =>
      detalles.reduce(
        (s, d) => s + Number(d.cantidad || 0) * Number(d.precio_unitario || 0),
        0
      ),
    [detalles]
  )

  useEffect(() => {
    setForm((f) => ({ ...f, cantidad: total }))
  }, [total])

  const empresaSeleccionada = empresas.find((x) => String(x.id) === String(form.empresa_id))
  const divisionSeleccionada = divisiones.find((x) => String(x.id) === String(form.division_id))
  const categoriaSeleccionada = categorias.find((x) => String(x.id) === String(form.categoria_id))
  const proveedorSeleccionado = proveedores.find((x) => String(x.id) === String(form.proveedor_id))

  const handleDetalleChange = (
    i: number,
    field: keyof DetalleForm,
    val: string
  ) => {
    setDetalles((prev) => {
      const copy = [...prev]
      let v: string | number = val

      if (field === 'cantidad' || field === 'precio_unitario') {
        v = parseFloat(val || '0')
      }

      if (field === 'producto_id') {
        const prod = productos.find((p) => String(p.id) === String(val))
        if (prod && !copy[i].concepto.trim()) {
          copy[i].concepto = prod.nombre
        }
      }

      copy[i] = { ...copy[i], [field]: v }
      return copy
    })
  }

  const addDetalle = () => setDetalles((d) => [...d, { ...DETALLE_INICIAL }])

  const copiar = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt)
    } catch {}
  }

  const guardarNuevoProveedor = async () => {
    if (!nuevoProv.nombre.trim()) return alert('El nombre del proveedor es obligatorio')

    const { data, error } = await supabase
      .from('proveedores')
      .insert({
        nombre: nuevoProv.nombre.trim().toUpperCase(),
        nit: nuevoProv.nit || null,
        direccion: nuevoProv.direccion || null,
        contacto_nombre: nuevoProv.contacto_nombre || null,
        telefono: nuevoProv.telefono || null,
      })
      .select()
      .single()

    if (error) return alert(`Error al guardar proveedor: ${error.message}`)

    setProveedores((p) => [...p, data as Proveedor])
    setForm((f) => ({ ...f, proveedor_id: String((data as Proveedor).id) }))
    setShowNuevoProv(false)
    setNuevoProv({ nombre: '', nit: '', direccion: '', contacto_nombre: '', telefono: '' })
  }

  const validarDetalles = () => {
    for (let i = 0; i < detalles.length; i++) {
      const d = detalles[i]

      if (!d.concepto.trim()) {
        return `Ingresa el concepto del artículo ${i + 1}.`
      }

      if (Number(d.cantidad || 0) <= 0) {
        return `Ingresa una cantidad válida en el artículo ${i + 1}.`
      }

      if (Number(d.precio_unitario || 0) <= 0) {
        return `Ingresa un precio unitario válido en el artículo ${i + 1}.`
      }

      if (!d.forma_pago_id) {
        return `Selecciona método de pago en el artículo ${i + 1}.`
      }
    }

    return null
  }

  const construirPdfData = (erogacionId: number): ErogacionPdfData => {
    const detallesPdf: DetallePdf[] = detalles.map((d) => {
      const metodo = metodosPago.find((m) => String(m.id) === String(d.forma_pago_id))

      return {
        concepto: d.concepto,
        cantidad: Number(d.cantidad || 0),
        precio_unitario: Number(d.precio_unitario || 0),
        importe: Number(d.cantidad || 0) * Number(d.precio_unitario || 0),
        forma_pago: metodo?.metodo || '—',
        documento: d.documento || 'N/A',
      }
    })

    return {
      id: erogacionId,
      fecha: form.fecha,
      empresa: empresaSeleccionada?.nombre || '—',
      division: divisionSeleccionada?.nombre || '—',
      categoria: categoriaSeleccionada?.nombre || '—',
      proveedor: proveedorSeleccionado?.nombre || '—',
      nit: proveedorSeleccionado?.nit || '—',
      total: Number(total || 0),
      observaciones: form.observaciones || 'N/A',
      detalles: detallesPdf,
    }
  }

  const descargarUltimoPdf = async () => {
    if (!ultimoPdfData) return

    setGenerandoPdf(true)

    try {
      await generarPDFErogacion(ultimoPdfData)
    } finally {
      setGenerandoPdf(false)
    }
  }

  const guardarErogacion = async () => {
    try {
      if (!form.proveedor_id) return alert('Selecciona o crea un proveedor')
      if (!form.fecha) return alert('Selecciona la fecha')
      if (detalles.length === 0) return alert('Agrega al menos un artículo')

      const errorDetalles = validarDetalles()
      if (errorDetalles) return alert(errorDetalles)

      setGuardando(true)
      setUltimoId(null)
      setUltimoPdfData(null)

      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw new Error(`auth: ${userErr.message}`)

      const userId = userData?.user?.id ?? null

      if (!userId) {
        return alert('No hay sesión activa. Inicia sesión para registrar erogaciones.')
      }

      const { data: erog, error: errCab } = await supabase
        .from('erogaciones')
        .insert([
          {
            empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
            division_id: form.division_id ? Number(form.division_id) : null,
            categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
            proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null,
            fecha: form.fecha,
            observaciones: form.observaciones || null,
            cantidad: Number(total || 0),
            user_id: userId,
            editado_por: null,
            editado_en: null,
          },
        ])
        .select('id')
        .single()

      if (errCab) throw new Error(`cabecera: ${errCab.message}`)

      const erogacionId = (erog as { id: number }).id

      const payload = detalles.map((d) => ({
        erogacion_id: erogacionId,
        producto_id: d.producto_id ? Number(d.producto_id) : null,
        concepto: d.concepto.trim(),
        cantidad: Number(d.cantidad || 0),
        precio_unitario: Number(d.precio_unitario || 0),
        forma_pago_id: d.forma_pago_id ? Number(d.forma_pago_id) : null,
        documento: d.documento || null,
      }))

      const { error: errDet } = await supabase.from('detalle_compra').insert(payload)
      if (errDet) throw new Error(`detalle: ${errDet.message}`)

      const pdfData = construirPdfData(erogacionId)

      setUltimoId(erogacionId)
      setUltimoPdfData(pdfData)

      setDetalles([{ ...DETALLE_INICIAL }])
      setForm((f) => ({
        ...f,
        cantidad: 0,
        observaciones: '',
      }))

      alert(`Erogación creada correctamente. ID: ${erogacionId}`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      alert(`Error al guardar: ${message}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-center mb-6">
        <Image src="/logo.png" alt="Logo" width={160} height={64} priority />
      </div>

      <h1 className="text-2xl font-bold mb-4">Nueva Erogación</h1>

      {ultimoId !== null && (
        <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">¡Erogación creada!</span>
            <span>
              ID: <span className="font-mono font-semibold">#{ultimoId}</span>
            </span>
            <button
              onClick={() => copiar(String(ultimoId))}
              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
            >
              Copiar ID
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={descargarUltimoPdf}
              disabled={generandoPdf || !ultimoPdfData}
              className="rounded bg-green-700 px-3 py-1 text-white hover:bg-green-800 disabled:opacity-60"
            >
              {generandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
            </button>

            <button
              onClick={() => router.push('/erogacion/ver')}
              className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-700"
            >
              Ver erogaciones
            </button>

            <button
              onClick={() => setUltimoId(null)}
              className="rounded bg-gray-700 px-3 py-1 text-white hover:bg-gray-800"
            >
              Seguir cargando
            </button>

            <button
              onClick={() => router.push('/menu')}
              className="rounded bg-slate-600 px-3 py-1 text-white hover:bg-slate-700"
            >
              Volver al menú
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <select
          className="border p-2"
          value={form.empresa_id}
          onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
        >
          <option value="">Selecciona Empresa</option>
          {empresas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>

        <select
          className="border p-2"
          value={form.division_id}
          onChange={(e) => setForm({ ...form, division_id: e.target.value })}
        >
          <option value="">Selecciona División</option>
          {divisiones.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>

        <select
          className="border p-2"
          value={form.categoria_id}
          onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
        >
          <option value="">Selecciona Categoría</option>
          {categorias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <select
            className="border p-2 flex-grow"
            value={form.proveedor_id}
            onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
          >
            <option value="">Selecciona Proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNuevoProv(!showNuevoProv)}
            className="whitespace-nowrap rounded bg-green-600 px-3 text-sm text-white"
          >
            {showNuevoProv ? 'Cancelar' : '➕ Nuevo'}
          </button>
        </div>

        {showNuevoProv && (
          <div className="space-y-2 rounded border bg-gray-50 p-3">
            <h3 className="text-sm font-semibold">Nuevo Proveedor</h3>

            <input
              className="w-full border p-2"
              placeholder="Nombre"
              value={nuevoProv.nombre}
              onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })}
            />

            <input
              className="w-full border p-2"
              placeholder="NIT"
              value={nuevoProv.nit}
              onChange={(e) => setNuevoProv({ ...nuevoProv, nit: e.target.value })}
            />

            <input
              className="w-full border p-2"
              placeholder="Dirección"
              value={nuevoProv.direccion}
              onChange={(e) => setNuevoProv({ ...nuevoProv, direccion: e.target.value })}
            />

            <input
              className="w-full border p-2"
              placeholder="Contacto"
              value={nuevoProv.contacto_nombre}
              onChange={(e) =>
                setNuevoProv({ ...nuevoProv, contacto_nombre: e.target.value })
              }
            />

            <input
              className="w-full border p-2"
              placeholder="Teléfono"
              value={nuevoProv.telefono}
              onChange={(e) => setNuevoProv({ ...nuevoProv, telefono: e.target.value })}
            />

            <button
              onClick={guardarNuevoProveedor}
              className="w-full rounded bg-blue-600 py-2 text-white"
            >
              Guardar Proveedor
            </button>
          </div>
        )}

        <input
          type="date"
          className="border p-2"
          value={form.fecha}
          onChange={(e) => setForm({ ...form, fecha: e.target.value })}
        />

        <textarea
          className="border p-2"
          placeholder="Observaciones generales"
          value={form.observaciones}
          onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
        />
      </div>

      <h2 className="mt-6 mb-2 text-xl font-semibold">Artículos de Compra</h2>

      <p className="mb-2 text-xs text-gray-600">
        Puedes crear productos desde{' '}
        <a
          className="text-blue-600 underline"
          href="/inventario"
          target="_blank"
          rel="noreferrer"
        >
          Inventario
        </a>
        .
      </p>

      <div className="mb-1 hidden grid-cols-6 gap-2 text-xs font-semibold text-gray-600 md:grid">
        <div>Producto</div>
        <div>Concepto</div>
        <div className="text-right">Cant.</div>
        <div className="text-right">Precio unitario (Q)</div>
        <div>Método de pago</div>
        <div>Documento</div>
      </div>

      {detalles.map((d, i) => (
        <div key={i} className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-6">
          <select
            className="border p-2"
            value={d.producto_id || ''}
            onChange={(e) => handleDetalleChange(i, 'producto_id', e.target.value)}
          >
            <option value="">— Sin producto (no inventario) —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.sku ? `${p.sku} — ` : '') + p.nombre}
              </option>
            ))}
          </select>

          <input
            className="border p-2"
            placeholder="Concepto"
            value={d.concepto}
            onChange={(e) => handleDetalleChange(i, 'concepto', e.target.value)}
          />

          <input
            className="border p-2 text-right"
            type="number"
            min="0"
            placeholder="0"
            value={d.cantidad}
            onChange={(e) => handleDetalleChange(i, 'cantidad', e.target.value)}
            aria-label="Cantidad"
          />

          <input
            className="border p-2 text-right"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={d.precio_unitario}
            onChange={(e) => handleDetalleChange(i, 'precio_unitario', e.target.value)}
            aria-label="Precio unitario (Q)"
          />

          <select
            className="border p-2"
            value={d.forma_pago_id}
            onChange={(e) => handleDetalleChange(i, 'forma_pago_id', e.target.value)}
          >
            <option value="">Método de pago</option>
            {metodosPago.map((m) => (
              <option key={m.id} value={m.id}>
                {m.metodo}
              </option>
            ))}
          </select>

          <input
            className="border p-2"
            placeholder="Documento"
            value={d.documento}
            onChange={(e) => handleDetalleChange(i, 'documento', e.target.value)}
          />
        </div>
      ))}

      <button onClick={addDetalle} className="mb-4 rounded bg-green-600 px-4 py-2 text-white">
        + Agregar otro artículo
      </button>

      <div className="mb-4 text-lg font-semibold">
        Total Calculado: Q{(total || 0).toFixed(2)}
      </div>

      <div className="flex justify-between gap-2">
        <button
          onClick={guardarErogacion}
          disabled={guardando}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar Erogación'}
        </button>

        <button
          onClick={() => router.push('/menu')}
          className="rounded bg-gray-700 px-4 py-2 text-white"
        >
          ⬅ Volver al Menú Principal
        </button>
      </div>
    </div>
  )
}
