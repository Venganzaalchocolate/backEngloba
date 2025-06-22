const { User } = require('../models/indexModels');
const fs = require('fs');  // Importa el módulo fs
const OneTimeCode = require('../models/OneTimeCode');
const { ClientError, response, catchAsync } = require('../utils/indexUtils');
const { sendEmail, generateEmailHTML } = require('./emailControllerGoogle');
const { rgb, PDFDocument, StandardFonts } = require('pdf-lib');
const { uploadFileToDrive, getFileById, deleteFileById  } = require('./googleController');
const path = require('path'); 



const addSignatureBox = async (pdfDoc, text, o = {}, apafa = false) => {
  const {
    boxWidth  = 200,
    boxHeight = 40,
    margin    = 5,
    offsetX   = 50,
    offsetY   = 50,
    fontStart = 9,
    fontMin   = 5,
    imgPath   = './src/img/ImagotipoEngloba.png', // solo se usa si !apafa
    opacity   = 0.35,
  } = o;

  /* ── 1.  Página y fuente ────────────────────────────────────────────── */
  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /* ── 2.  Coordenadas del cajetín ────────────────────────────────────── */
  const x = page.getWidth() - boxWidth - offsetX;
  const y = offsetY;

  /* ── 3.  Marca de agua (solo si NO es apafa) ────────────────────────── */
  if (!apafa) {
    const imgBuf = fs.readFileSync(imgPath);
    const img = imgPath.toLowerCase().endsWith('.jpg')
      ? await pdfDoc.embedJpg(imgBuf)
      : await pdfDoc.embedPng(imgBuf);

    const { width: w0, height: h0 } = img.size();
    const s = Math.min(
      (boxWidth  - margin * 2) / w0,
      (boxHeight - margin * 2) / h0,
    );

    page.drawImage(img, {
      x: x + margin + (boxWidth  - margin * 2 - w0 * s) / 2,
      y: y + margin + (boxHeight - margin * 2 - h0 * s) / 2,
      width : w0 * s,
      height: h0 * s,
      opacity,
    });
  }

  /* ── 4.  Borde del cajetín ──────────────────────────────────────────── */
  page.drawRectangle({
    x, y, width: boxWidth, height: boxHeight,
    borderColor: rgb(1, 1, 1),
    borderWidth: 1,
  });

  /* ── 5.  Ajuste de texto (word-wrap + tamaño de fuente) ─────────────── */
  const innerW = boxWidth  - margin * 2;
  const innerH = boxHeight - margin * 2;
  const lineH  = s => s + 1;

  const wrapLines = (size) => {
    const out = [];
    text.split(/\r?\n/).forEach(p => {
      if (!p.trim()) return out.push('');
      let line = '';
      p.split(' ').forEach(word => {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= innerW) {
          line = test;
        } else {
          out.push(line);
          line = word;
        }
      });
      out.push(line);
    });
    return out;
  };

  let size  = fontStart;
  let lines = wrapLines(size);
  while (lines.length * lineH(size) > innerH && size > fontMin) {
    size -= 1;
    lines = wrapLines(size);
  }
  if (lines.length * lineH(size) > innerH) {
    throw new Error('Texto demasiado largo para el cajetín');
  }

  /* ── 6.  Dibujar texto ──────────────────────────────────────────────── */
  let ty = y + boxHeight - margin - size;
  lines.forEach(l => {
    page.drawText(l, {
      x: x + margin,
      y: ty,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    ty -= lineH(size);
  });

  return pdfDoc;
};

// Configuración por tipo de documento
const docTypeConfig = {
  payroll: { emailTitle: 'nómina', emailSubject: 'Tu código para firmar nómina' },
  contract: { emailTitle: 'contrato', emailSubject: 'Tu código para firmar contrato' },
  recibi  : { emailTitle: 'recibí'  , emailSubject: 'Tu código para firmar el recibí'}
};


async function generateReceiptPDF({
  worker,
  concept,
  logoPath = './src/img/ImagotipoEngloba.png',
  includeSignature = true,
  signatureOptions = {},
}) {
  if (!worker || !concept) {
    throw new Error('[generateReceiptPDF] Falta worker o concept');
  }
  
      console.log('llega')

  /* ── 1. Crear PDF ─────────────────────────────────────────────── */
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4 en puntos (72 dpi)
  const { width, height } = page.getSize();

  /* ── 2. Fuentes ──────────────────────────────────────────────── */
  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /* ── 3. Logo empresa ─────────────────────────────────────────── */
  try {
    const logoBuf = fs.readFileSync(logoPath);
    const logoImg = /\.jpe?g$/i.test(logoPath)
      ? await pdfDoc.embedJpg(logoBuf)
      : await pdfDoc.embedPng(logoBuf);

    const logoW = 120;                       // Ancho deseado (pt)
    const scale = logoW / logoImg.width;     // Mantener proporción
    const logoH = logoImg.height * scale;

    page.drawImage(logoImg, {
      x: width - logoW - 40, // 40 pt de margen derecho
      y: height - logoH - 40, // 40 pt de margen superior
      width : logoW,
      height: logoH,
    });
  } catch (err) {
    console.warn('[generateReceiptPDF] No se pudo cargar el logo:', err.message);
  }

  const marginX = 60;
  let cursorY   = height - 120; // Debajo del logo

  /* ── 4. Título del documento ─────────────────────────────────── */
  const title = 'RECIBÍ';
  const titleSize = 22;
  page.drawText(title, {
    x: marginX,
    y: cursorY,
    size: titleSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  cursorY -= titleSize + 30;

  /* ── 5. Cuerpo del recibí ────────────────────────────────────── */
  const bodyText =
    `Yo, ${worker.firstName} ${worker.lastName} (DNI ${worker.dni}), ` +
    `declaro haber recibido ${concept}.\n\n` +
    `En ${new Date().toLocaleDateString('es-ES')}.`;

  const bodySize = 12;
  const lineHeight = bodySize + 4;
  bodyText.split(/\n/).forEach(line => {
    page.drawText(line, {
      x: marginX,
      y: cursorY,
      size: bodySize,
      font: fontNormal,
      color: rgb(0, 0, 0),
    });
    cursorY -= lineHeight;
  });

  console.log('llega')
  /* ── 6. Caja de firma digital ────────────────────────────────── */
  if (includeSignature) {
    const signText =
      `Firmado digitalmente por:\n` +
      `Nombre: ${worker.firstName} ${worker.lastName}\n` +
      `DNI: ${worker.dni}\n` +
      `Fecha: ${new Date().toLocaleDateString('es-ES')}\n` +
      `Hora: ${new Date().toLocaleTimeString('es-ES')}`;

      console.log('llega')
    await addSignatureBox(
      pdfDoc,
      signText,
      {
        boxWidth : 220,
        boxHeight: 70,
        offsetX  : 40,
        offsetY  : 35,
        ...signatureOptions,
      },
      worker.apafa // Marca de agua solo si NO es apafa
    );
  }

  /* ── 7. Salvar PDF ───────────────────────────────────────────── */
  return pdfDoc.save(); // Devuelve Buffer
}
// Genera un código de 6 dígitos
const generarCodigoTemporal = () => ('' + Math.floor(Math.random() * 999999)).padStart(6, '0');

// Paso 1: Solicitar OTP
const requestSignature = async (req, res) => {
  const { userId, docType, docId, meta } = req.body;

  if (!userId || !docType || (docType !== 'recibi' && !docId)) {
  throw new ClientError('Parámetros insuficientes', 400);
}

  const config = docTypeConfig[docType];

  if (!config) {

    throw new ClientError('Tipo de documento no soportado', 400);
  }

  let user;
  try {
    user = await User.findById(userId);

  } catch (error) {
    console.error('[requestSignature] Error al encontrar el usuario:', error);
    throw new ClientError('Usuario no encontrado', 404);
  }

  const code = generarCodigoTemporal();
  const now = new Date();
  let otp;
  try {
    otp = await OneTimeCode.findOneAndUpdate(
      { userId },
      { $set: { code, createdAt: now, attempts: 0, docType, docId, meta: meta || {} } },
      { upsert: true, new: true }
    );

  } catch (error) {
    console.error('[requestSignature] Error al crear o actualizar OTP:', error);
    throw new ClientError('Error al crear OTP', 500);
  }

  const textoPlano = `Tu código de verificación para firmar ${config.emailTitle} es: ${code}. Válido 5 minutos.`;

  try {
    await sendEmail(
      user.email,
      config.emailSubject,
      textoPlano,
      generateEmailHTML({
        logoUrl: 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
        title: `Código para firma de ${config.emailTitle}`,
        greetingName: user.firstName || user.nombre,
        bodyText: 'Este es tu código de un solo uso.',
        highlightText: code,
        footerText: 'No compartas este código.'
      })
    );

  } catch (error) {
    console.error('[requestSignature] Error al enviar el email:', error);
    throw new ClientError('Error al enviar el email', 500);
  }

  response(res, 200, { fileId: otp._id });
};

// Paso 2: Verificar OTP y subir PDF firmado como nuevo archivo
// Paso 2: Verificar OTP y firmar / subir el PDF
const confirmSignature = async (req, res) => {
  const { userId, fileId, code } = req.body;

  /* ── A. Validación inicial ─────────────────────────────────────── */
  if (!userId || !fileId || !code) {
    throw new ClientError('Faltan parámetros', 400);
  }

  console.log(req.body)

  /* ── B. Obtener el OTP ─────────────────────────────────────────── */
  let otp;
  try {
    otp = await OneTimeCode.findById(fileId);

  } catch (err) {
    console.error('[confirmSignature] OTP no encontrado:', err);
    throw new ClientError('Código inválido o expirado', 403);
  }

  if (!otp || otp.userId.toString() !== userId) {
    throw new ClientError('Código inválido o expirado', 403);
  }

  /* ── C. Control de intentos ────────────────────────────────────── */
  if (otp.attempts >= 3) {
    await OneTimeCode.deleteOne({ _id: fileId });
    throw new ClientError('Máximo de intentos excedido', 403);
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    if (otp.attempts >= 3) await OneTimeCode.deleteOne({ _id: fileId });
    throw new ClientError('Código incorrecto', 403);
  }

  /* ── D. Obtener (o generar) el PDF original ───────────────────── */
  let originalBuffer;
  let mimeType   = 'application/pdf';
  let folderId   = null;               // carpeta destino en Drive
  let file;                            // sólo para payroll / contrato

  if (otp.docType === 'recibi') {
    console.log('pasaporrecibi')
    // 1. Generar recibí genérico
    const worker = await User.findById(userId, {
      dni: 1, firstName: 1, lastName: 1, apafa: 1
    });

    const concept = otp.meta?.concept || 'la documentación entregada';
console.log('concept')
    originalBuffer = await generateReceiptPDF({
      worker,
      concept,
      includeSignature: false   // la firma se añade después
    });

    console.log(originalBuffer)
    folderId = process.env.GOOGLE_DRIVE_FILES || null;
  } else {
    // 2. Descargar nómina / contrato desde Drive
    let stream;
    ({ file, stream } = await getFileById(otp.docId));

    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    originalBuffer = Buffer.concat(chunks);

    mimeType = file.mimeType;
    folderId = file.parents?.[0] || null;
  }

  /* ── E. Cargar PDF y añadir caja de firma ─────────────────────── */
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(originalBuffer);
  } catch (err) {
    console.log('[confirmSignature] Error al cargar PDF:', err)
    console.error('[confirmSignature] Error al cargar PDF:', err);
    throw new ClientError('Error al cargar el PDF', 500);
  }

  const fecha   = new Date();
  const userAux = await User.findById(userId, {
    dni: 1, firstName: 1, lastName: 1, apafa: 1
  });

  const signText = `Firmado digitalmente por:
Nombre: ${userAux.firstName} ${userAux.lastName}
DNI: ${userAux.dni}
Fecha: ${fecha.toLocaleDateString('es-ES')}
Hora: ${fecha.toLocaleTimeString('es-ES')}`;

console.log(signText)
  try {
    await addSignatureBox(
      pdfDoc,
      signText,
      { boxWidth: 220, boxHeight: 70, offsetX: 40, offsetY: 35 },
      userAux.apafa
    );
  } catch (err) {
    console.error('[confirmSignature] Error al firmar PDF:', err);
    throw new ClientError('Error al firmar el documento', 500);
  }

  
  const signedBuffer = await pdfDoc.save();

  /* ── F. Subir a Drive ──────────────────────────────────────────── */
  const signedName =
    otp.docType === 'recibi'
      ? `${userAux.dni}_${fecha.toISOString().slice(0,10)}_recibi_signed.pdf`
      : `${userAux.dni}_${otp.meta.month}_${otp.meta.year}_signed.pdf`;

  let uploaded;

  try {
    uploaded = await uploadFileToDrive(
      { buffer: signedBuffer, mimetype: mimeType },
      folderId,
      signedName
    );
  } catch (err) {
    console.error('[confirmSignature] Error al subir PDF:', err);
    throw new ClientError('Error al subir documento firmado', 500);
  }

  if (!uploaded) throw new ClientError('Error al subir documento firmado', 500);

  /* ── G. Borrar OTP (éxito) ─────────────────────────────────────── */
  await OneTimeCode.deleteOne({ _id: fileId });

  /* ── H. Actualizaciones específicas por tipo ───────────────────── */
  const dateInSpain = new Date(); // ya está en hora local servidor (ES)

  if (otp.docType === 'payroll') {
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, 'payrolls._id': otp.meta.id },
      {
        $set: {
          'payrolls.$.sign'        : uploaded.id,
          'payrolls.$.datetimeSign': dateInSpain
        }
      },
      { new: true }
    ).populate({ path: 'files.filesId', model: 'Filedrive' });

    if (!updatedUser) await deleteFileById(uploaded.id);

    return response(res, 200, { data: updatedUser });
  }

  if (otp.docType === 'contract') {
    return response(res, 200, {
      message: 'Contrato firmado correctamente',
      data   : { id: uploaded.id }
    });
  }

  if (otp.docType === 'recibi') {
    return response(res, 200, {
      message: 'Recibí firmado correctamente',
      data   : { id: uploaded.id }
    });
  }
};



module.exports = {
  requestSignature: catchAsync(requestSignature),
  confirmSignature: catchAsync(confirmSignature),
  addSignatureBox
};