const { User } = require('../models/indexModels');
const fs = require('fs');  // Importa el módulo fs
const OneTimeCode = require('../models/OneTimeCode');
const { ClientError, response, catchAsync } = require('../utils/indexUtils');
const { sendEmail, generateEmailHTML } = require('./emailController');
const { rgb, PDFDocument, StandardFonts } = require('pdf-lib');
const { uploadFileToDrive, getFileById, deleteFileById  } = require('./googleController');

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
  contract: { emailTitle: 'contrato', emailSubject: 'Tu código para firmar contrato' }
};

// Genera un código de 6 dígitos
const generarCodigoTemporal = () => ('' + Math.floor(Math.random() * 999999)).padStart(6, '0');

// Paso 1: Solicitar OTP
const requestSignature = async (req, res) => {
  const { userId, docType, docId, meta } = req.body;

  if (!userId || !docType || !docId) {

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
const confirmSignature = async (req, res) => {
  const { userId, fileId, code } = req.body;


  if (!userId || !fileId || !code) {

    throw new ClientError('Faltan parámetros', 400);
  }

  let otp;
  try {
    otp = await OneTimeCode.findById(fileId);

  } catch (error) {
    console.error('[confirmSignature] Error al encontrar el OTP:', error);
    throw new ClientError('Código inválido o expirado', 403);
  }

  if (otp.userId.toString() !== userId) {

    throw new ClientError('Código inválido o expirado', 403);
  }

  if (otp.attempts >= 3) {

    await OneTimeCode.deleteOne({ _id: fileId });
    throw new ClientError('Máximo de intentos excedido', 403);
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();

    if (otp.attempts >= 3) {

      await OneTimeCode.deleteOne({ _id: fileId });
    }

    throw new ClientError('Código incorrecto', 403);
  }

  let file, stream;
  try {
    ({ file, stream } = await getFileById(otp.docId));

  } catch (error) {
    console.error('[confirmSignature] Error al descargar el documento:', error);
    throw new ClientError('No se pudo descargar el documento', 500);
  }

  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const originalBuffer = Buffer.concat(chunks);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(originalBuffer);

  } catch (error) {
    console.error('[confirmSignature] Error al cargar el PDF:', error);
    throw new ClientError('Error al cargar el PDF', 500);
  }

  const fecha = new Date();
  const userAux = await User.findById(userId, { dni: 1, firstName: 1, lastName: 1, apafa:1 });
  
  const text = `Firmado digitalmente por:
Nombre: ${userAux.firstName} ${userAux.lastName}
DNI: ${userAux.dni}
Fecha: ${fecha.toLocaleDateString('es-ES')}
Hora: ${fecha.toLocaleTimeString('es-ES')}`;

  try {
    await addSignatureBox(pdfDoc, text, {
      boxWidth: 220,
      boxHeight: 70,
      offsetX: 40,
      offsetY: 35
    }, userAux.apafa);

  } catch (error) {
    console.error('[confirmSignature] Error al firmar el documento:', error);
    throw new ClientError('Error al firmar el documento', 500);
  }

  const signedBuffer = await pdfDoc.save();

  const folderId = file.parents?.[0] || null;
  const signedName = `${userAux.dni}_${otp.meta.month}_${otp.meta.year}_signed.pdf`;
  let uploaded;
  try {
    uploaded = await uploadFileToDrive(
      { buffer: signedBuffer, mimetype: file.mimeType },
      folderId,
      signedName
    );

  } catch (error) {
    console.error('[confirmSignature] Error al subir el archivo firmado:', error);
    throw new ClientError('Error al subir documento firmado', 500);
  }

  await OneTimeCode.deleteOne({ _id: fileId });


  if (!uploaded) {

    throw new ClientError('Error al subir documento firmado', 500);
  }

  const dateInSpain = new Date();

  if (otp.docType === 'payroll') {


    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, 'payrolls._id': otp.meta.id },
      {
        $set: {
          'payrolls.$.sign': uploaded.id,
          'payrolls.$.datetimeSign': dateInSpain // Fecha y hora ajustada a la zona horaria de España
        }
      },
      { new: true }
    ).populate({ path: 'files.filesId', model: 'Filedrive' })

    if(!updatedUser) deleteFileById(uploaded.id)
    return response(res, 200, { data: updatedUser });
    
  } else if (otp.docType === 'contract') {
    return response(res, 200, { message: 'Contrato firmado correctamente', data: { id: uploaded.id } });
  }
};

module.exports = {
  requestSignature: catchAsync(requestSignature),
  confirmSignature: catchAsync(confirmSignature)
};