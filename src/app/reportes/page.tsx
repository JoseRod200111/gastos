const descargarPDF = () => {
  if (!logoBase64) {
    alert('Espere un momento mientras se carga el logo...')
    return
  }

  const el = containerRef.current
  if (!el) return

  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) return

  const html = `
    <html>
      <head>
        <title>Comprobante</title>
        <style>
          body { font-family: Arial, sans-serif }
          .logo { height: 60px; display:block; margin:0 auto 12px }
          .box { border:1px solid #000; padding:14px; margin:10px 0; font-size:14px }
          table{ width:100%; border-collapse:collapse }
          th,td{ border:1px solid #000; padding:4px; text-align:center }
          .header{ font-weight:bold }
        </style>
      </head>
      <body>
        <img src="${logoBase64}" class="logo"/>
        ${erogaciones.map(e => `
          <div class="box">
            <div><span class="header">ID:</span> ${e.id} &nbsp; <span class="header">Fecha:</span> ${e.fecha}</div>
            <div><span class="header">Empresa:</span> ${e.empresas?.nombre || '-'} &nbsp;
                 <span class="header">División:</span> ${e.divisiones?.nombre || '-'}</div>
            <div><span class="header">Categoría:</span> ${e.categorias?.nombre || '-'}</div>
            <div><span class="header">Proveedor:</span> ${e.proveedores?.nombre || '-'} &nbsp;
                 <span class="header">NIT:</span> ${e.proveedores?.nit || '-'}</div>
            <div><span class="header">Total:</span> Q${e.cantidad?.toFixed(2)}</div>
            <div><span class="header">Observaciones:</span> ${e.observaciones || 'N/A'}</div>

            <table>
              <thead>
                <tr><th>Concepto</th><th>Cant.</th><th>P.Unit</th><th>Importe</th><th>Pago</th><th>Doc.</th></tr>
              </thead>
              <tbody>
                ${(detalles[e.id] || []).map(d => `
                  <tr>
                    <td>${d.concepto}</td>
                    <td>${d.cantidad}</td>
                    <td>Q${d.precio_unitario?.toFixed(2)}</td>
                    <td>Q${d.importe?.toFixed(2)}</td>
                    <td>${d.forma_pago?.metodo || '-'}</td>
                    <td>${d.documento || 'N/A'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>

            ${e.editado_en && e.editado_por
              ? `<div style="text-align:right;font-size:11px;margin-top:6px">
                   editado ${new Date(e.editado_en).toLocaleString()} por ${e.editado_por}
                 </div>` : ''}
          </div>`).join('')}
      </body>
    </html>
  `

  doc.open()
  doc.write(html)
  doc.close()

  iframe.onload = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }
}
