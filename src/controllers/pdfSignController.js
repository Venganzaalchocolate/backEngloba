
// controllers/pdfSignController.js
const fs = require("fs");
const path = require("path");
const { rgb, PDFDocument, StandardFonts } = require("pdf-lib");
const { User, Documentation } = require("../models/indexModels");
const OneTimeCode = require("../models/OneTimeCode");
const { ClientError, response, catchAsync } = require("../utils/indexUtils");
const { sendEmail, generateEmailHTML } = require("./emailControllerGoogle");
const { uploadFileToDrive, getFileById, deleteFileById } = require("./googleController");
const { attachGeneratedOfficialFileToUser } = require("./fileController");
const {
  registerDocumentationAuditSignRequest,
  registerDocumentationAuditSignComplete,
  canUserSignDocumentationReceipt,
} = require("./userDocumentationAuditController");

let createCanvas;
try { ({ createCanvas } = require("canvas")); } catch { createCanvas = null; }

const RECIBI_LOGO_PATH = "./src/img/logotipoEngloba.jpg";
const SIGN_WATERMARK_PATH = "./src/img/ImagotipoEngloba.png";
const COLOR_PRIMARY = hexToRgb("#4f5ca8");
const COLOR_SOFT = hexToRgb("#ececf8");
const COLOR_SOFT_BORDER = hexToRgb("#d5d8ef");
const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_MUTED = hexToRgb("#6f7395");
const COLOR_WHITE = rgb(1, 1, 1);

/** Convierte un color HEX a rgb() de pdf-lib. */
function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  const n = parseInt(clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Limpia texto para usarlo en nombres de archivo. */
const sanitizeFileName = (text = "") =>
  String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");

/** Construye el nombre final del PDF de recibí firmado. */
const buildRecibiFileName = ({ documentName, dni, date = new Date() }) => {
  const safeName = sanitizeFileName(documentName || "documento");
  const safeDni = sanitizeFileName(dni || "sin_dni");
  return `${safeName}_${safeDni}_${date.toISOString().slice(0, 10)}_recibi_signed.pdf`;
};

/** Genera un código OTP de 6 dígitos. */
const generarCodigoTemporal = () => ("" + Math.floor(Math.random() * 999999)).padStart(6, "0");

/** Comprueba si el usuario tiene firma manuscrita guardada. */
const hasUserSignature = (user) => Array.isArray(user?.signature?.strokes) && user.signature.strokes.length > 0;

/** Hace wrap de texto en líneas según ancho máximo. */
const wrapTextLines = (text, font, size, maxWidth) => {
  if (!text) return [""];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/** Dibuja texto multilínea con wrap y devuelve la nueva Y. */
const drawWrappedText = ({ page, text, x, y, maxWidth, font, size, color, lineGap = 4 }) => {
  const lines = wrapTextLines(text, font, size, maxWidth);
  let currentY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size + lineGap;
  }
  return currentY;
};

/** Dibuja una caja simple con color y borde. */
const drawBox = ({ page, x, y, width, height, color, borderColor, borderWidth = 1 }) => {
  page.drawRectangle({ x, y, width, height, color, borderColor, borderWidth });
};

/** Embebe una imagen en el PDF detectando si es JPG o PNG por extensión. */
const embedImageByPath = async (pdfDoc, imgPath) => {
  const abs = path.resolve(imgPath);
  const buf = fs.readFileSync(abs);
  const lower = imgPath.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? pdfDoc.embedJpg(buf) : pdfDoc.embedPng(buf);
};

/** Convierte un stream en Buffer. */
const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

/** Renderiza strokes de signature_pad a PNG para incrustarlos luego en PDF. */
const renderStrokesToPngBuffer = (strokes, opts = {}) => {
  if (!createCanvas || !Array.isArray(strokes) || !strokes.length) return null;
  const { width = 900, height = 250, padding = 6, lineWidth = 6, lineColor = "#111", background = "transparent" } = opts;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else ctx.clearRect(0, 0, width, height);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const pts = Array.isArray(s?.points) ? s.points : [];
    for (const p of pts) {
      if (typeof p?.x !== "number" || typeof p?.y !== "number") continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!isFinite(minX)) return null;

  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const dstW = Math.max(1, width - padding * 2);
  const dstH = Math.max(1, height - padding * 2);
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const offX = (width - srcW * scale) / 2;
  const offY = (height - srcH * scale) / 2;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of strokes) {
    const pts = Array.isArray(s?.points) ? s.points : [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x = offX + (p.x - minX) * scale;
      const y = offY + (p.y - minY) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return canvas.toBuffer("image/png");
};

/** Dibuja el cajetín genérico de firma que usan nóminas y otros PDFs. */
const addSignatureBox = async (pdfDoc, text, o = {}, apafa = false) => {
  const { boxWidth = 200, boxHeight = 40, margin = 5, offsetX = 50, offsetY = 50, fontStart = 9, fontMin = 5, imgPath = SIGN_WATERMARK_PATH, opacity = 0.35 } = o;
  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const x = page.getWidth() - boxWidth - offsetX;
  const y = offsetY;

  if (!apafa) {
    try {
      const img = await embedImageByPath(pdfDoc, imgPath);
      const w0 = img.width || img.size().width;
      const h0 = img.height || img.size().height;
      const s = Math.min((boxWidth - margin * 2) / w0, (boxHeight - margin * 2) / h0);
      page.drawImage(img, {
        x: x + margin + (boxWidth - margin * 2 - w0 * s) / 2,
        y: y + margin + (boxHeight - margin * 2 - h0 * s) / 2,
        width: w0 * s,
        height: h0 * s,
        opacity,
      });
    } catch {}
  }

  page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, borderColor: COLOR_WHITE, borderWidth: 1 });
  const safeText = typeof text === "string" ? text.trim() : "";
  if (!safeText) return { x, y, boxWidth, boxHeight, margin, font };

  const innerW = boxWidth - margin * 2;
  const innerH = boxHeight - margin * 2;
  const lineH = (s) => s + 1;
  const wrapLines = (size) => {
    const out = [];
    safeText.split(/\r?\n/).forEach((p) => {
      if (!p.trim()) return out.push("");
      let line = "";
      p.split(" ").forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= innerW) line = test;
        else {
          out.push(line);
          line = word;
        }
      });
      out.push(line);
    });
    return out;
  };

  let size = fontStart;
  let lines = wrapLines(size);
  while (lines.length * lineH(size) > innerH && size > fontMin) {
    size -= 1;
    lines = wrapLines(size);
  }
  if (lines.length * lineH(size) > innerH) throw new Error("Texto demasiado largo para el cajetín");

  let ty = y + boxHeight - margin - size;
  lines.forEach((l) => {
    page.drawText(l, { x: x + margin, y: ty, size, font, color: COLOR_TEXT });
    ty -= lineH(size);
  });

  return { x, y, boxWidth, boxHeight, margin, font };
};

/** Dibuja la firma genérica en PDFs existentes sin cambiar el comportamiento de nóminas. */
const addSignatureToPdf = async (pdfDoc, userAux, opts = {}) => {
  const { boxWidth = 260, boxHeight = 95, offsetX = 40, offsetY = 10, margin = 4, imgPath = SIGN_WATERMARK_PATH, opacity = 0.2, textAreaH = 16, gap = 1, textSize = 7.5, textColor = COLOR_TEXT, pngW = 1200, pngH = 420, lineWidth = 6 } = opts;
  const fecha = new Date();
  const line1 = `Firmado por: ${userAux.firstName} ${userAux.lastName} · DNI: ${userAux.dni}`;
  const line2 = `${fecha.toLocaleDateString("es-ES")} ${fecha.toLocaleTimeString("es-ES")}`;

  if (!hasUserSignature(userAux)) {
    const signText = `Firmado digitalmente por:\nNombre: ${userAux.firstName} ${userAux.lastName}\nDNI: ${userAux.dni}\nFecha: ${fecha.toLocaleDateString("es-ES")}\nHora: ${fecha.toLocaleTimeString("es-ES")}`;
    await addSignatureBox(pdfDoc, signText, { boxWidth, boxHeight, offsetX, offsetY, margin, imgPath, opacity }, userAux.apafa);
    return pdfDoc;
  }

  const { x, y, boxWidth: bw, boxHeight: bh } = await addSignatureBox(pdfDoc, "", { boxWidth, boxHeight, offsetX, offsetY, margin, imgPath, opacity }, userAux.apafa);
  const [page] = pdfDoc.getPages();
  const innerW = Math.max(1, bw - margin * 2);
  const innerH = Math.max(1, bh - margin * 2);
  const reservedTextH = Math.min(textAreaH, Math.floor(innerH * 0.45));
  const sigAreaH = Math.max(1, innerH - reservedTextH - gap);

  const pngBuf = renderStrokesToPngBuffer(userAux.signature.strokes, { width: pngW, height: pngH, padding: 18, lineWidth, lineColor: "#111", background: "transparent" });
  if (!pngBuf) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(line1, { x: x + margin, y: y + margin + 10, size: textSize, font, color: textColor });
    page.drawText(line2, { x: x + margin, y: y + margin, size: textSize, font, color: textColor });
    return pdfDoc;
  }

  const png = await pdfDoc.embedPng(pngBuf);
  const imgW0 = png.width;
  const imgH0 = png.height;
  const s = Math.min(innerW / imgW0, sigAreaH / imgH0);
  const drawW = imgW0 * s;
  const drawH = imgH0 * s;
  const sigX = x + margin + (innerW - drawW) / 2;
  const baseY = y + margin;
  const sigY = baseY + reservedTextH + gap + (sigAreaH - drawH) / 2;

  page.drawImage(png, { x: sigX, y: sigY, width: drawW, height: drawH, opacity: 1 });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fitTextSize = (txt, maxW, start) => {
    let size = start;
    while (size > 6 && font.widthOfTextAtSize(txt, size) > maxW) size -= 0.5;
    return size;
  };

  const t1Size = fitTextSize(line1, innerW, textSize);
  const t2Size = fitTextSize(line2, innerW, textSize);
  const t2Y = baseY + 2;
  const t1Y = t2Y + t2Size + 2;

  page.drawText(line1, { x: x + margin, y: t1Y, size: t1Size, font, color: textColor });
  page.drawText(line2, { x: x + margin, y: t2Y, size: t2Size, font, color: textColor });
  return pdfDoc;
};

/** Genera la base visual del PDF de recibí. */
const generateRecibiPdf = async ({ userAux, documentName, description, fechaRecibi = new Date() }) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const marginX = 55;
  const contentW = width - marginX * 2;

  try {
    const logo = await embedImageByPath(pdfDoc, RECIBI_LOGO_PATH);
    const logoW = 125;
    const logoH = logo.height * logoW / logo.width;
    page.drawImage(logo, { x: marginX, y: height - 95, width: logoW, height: logoH, opacity: 0.95 });
  } catch {}

  let infoY = height - 45;
  ["Asociación Engloba", "Paraje la Solana, 1", "Chirivel (Almería) 04825", "G04747614", "rrhh@engloba.org.es"].forEach((line) => {
    page.drawText(line, { x: width - 190, y: infoY, size: 10, font: fontBold, color: COLOR_PRIMARY });
    infoY -= 13;
  });

  page.drawLine({ start: { x: marginX, y: height - 104 }, end: { x: width - marginX, y: height - 104 }, thickness: 1, color: COLOR_SOFT_BORDER });

  const title = "RECIBÍ";
  const titleSize = 22;
  page.drawText(title, { x: (width - fontBold.widthOfTextAtSize(title, titleSize)) / 2, y: height - 162, size: titleSize, font: fontBold, color: COLOR_PRIMARY });

  drawBox({ page, x: marginX, y: 580, width: contentW, height: 78, color: COLOR_SOFT, borderColor: COLOR_SOFT });
  const fullName = [userAux.firstName, userAux.lastName].filter(Boolean).join(" ").trim() || "—";
  let rowY = 638;
  [["Nombre y apellidos:", fullName], ["DNI:", userAux.dni || "—"], ["Fecha:", fechaRecibi.toLocaleDateString("es-ES")], ["Hora:", fechaRecibi.toLocaleTimeString("es-ES")]].forEach(([label, value]) => {
    page.drawText(label, { x: marginX + 14, y: rowY, size: 10.5, font: fontBold, color: COLOR_PRIMARY });
    page.drawText(String(value), { x: marginX + 18 + fontBold.widthOfTextAtSize(label, 10.5), y: rowY, size: 10.5, font, color: COLOR_TEXT });
    rowY -= 14;
  });

  drawBox({ page, x: marginX, y: 505, width: contentW, height: 54, color: COLOR_WHITE, borderColor: COLOR_SOFT_BORDER, borderWidth: 1.2 });
  const docLabel = "Documento recibido:";
  const docLabelX = marginX + 14;
  const docLabelY = 530;
  const docLabelW = fontBold.widthOfTextAtSize(docLabel, 10.5);
  page.drawText(docLabel, { x: docLabelX, y: docLabelY, size: 10.5, font: fontBold, color: COLOR_PRIMARY });
  drawWrappedText({ page, text: documentName || "Documento", x: docLabelX + docLabelW + 6, y: docLabelY, maxWidth: contentW - (docLabelW + 30), font, size: 10.5, color: COLOR_TEXT, lineGap: 2 });

  page.drawText("EXPONE:", { x: marginX, y: 470, size: 12, font: fontBold, color: COLOR_PRIMARY });
  let textY = 438;
  [`La persona arriba identificada declara haber recibido el documento "${documentName}".`, description || `Conforme a recibido y leído ${documentName}.`, "Y para que así conste, firma digitalmente el presente recibí."].forEach((paragraph) => {
    textY = drawWrappedText({ page, text: paragraph, x: marginX, y: textY, maxWidth: contentW, font, size: 11, color: COLOR_TEXT, lineGap: 5 });
    textY -= 14;
  });

  drawBox({ page, x: marginX, y: 130, width: contentW, height: 115, color: COLOR_SOFT, borderColor: COLOR_SOFT });
  page.drawText("En prueba de conformidad, se firma este documento en la fecha indicada.", { x: marginX + 14, y: 216, size: 10.5, font, color: COLOR_PRIMARY });
  page.drawLine({ start: { x: marginX + 14, y: 204 }, end: { x: width - marginX - 14, y: 204 }, thickness: 1, color: COLOR_WHITE });
  page.drawText("Firma electrónica de recepción", { x: marginX + 14, y: 178, size: 11, font: fontBold, color: COLOR_PRIMARY });

  page.drawLine({ start: { x: marginX, y: 58 }, end: { x: width - marginX, y: 58 }, thickness: 1, color: COLOR_SOFT_BORDER });
  page.drawText("Página 1 de 1", { x: width - 95, y: 42, size: 9, font, color: COLOR_MUTED });

  return pdfDoc;
};

/** Dibuja la firma específica de recibís dentro del bloque inferior del propio diseño. */
const addSignatureToRecibiPdf = async (pdfDoc, userAux) => {
  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const x = 300;
  const y = 136;
  const boxWidth = 230;
  const boxHeight = 64;
  const margin = 8;

  const fecha = new Date();
  const line1 = `${userAux.firstName || ""} ${userAux.lastName || ""}`.trim();
  const line2 = `${fecha.toLocaleDateString("es-ES")} ${fecha.toLocaleTimeString("es-ES")}`;

  page.drawRectangle({
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    borderColor: COLOR_WHITE,
    borderWidth: 1,
    color: COLOR_WHITE,
    opacity: 0.22,
  });

  if (hasUserSignature(userAux)) {
    const pngBuf = renderStrokesToPngBuffer(userAux.signature.strokes, {
      width: 1400,
      height: 420,
      padding: 10,
      lineWidth: 7,
      lineColor: "#111",
      background: "transparent",
    });

    if (pngBuf) {
      const png = await pdfDoc.embedPng(pngBuf);
      const innerW = boxWidth - margin * 2;
      const innerH = 34;
      const scale = Math.min(innerW / png.width, innerH / png.height);
      const drawW = png.width * scale;
      const drawH = png.height * scale;

      page.drawImage(png, {
        x: x + (boxWidth - drawW) / 2,
        y: y + 24,
        width: drawW,
        height: drawH,
      });
    }
  }

  page.drawText(line1, {
    x: x + margin,
    y: y + 10,
    size: 8,
    font: fontBold,
    color: COLOR_PRIMARY,
  });

  page.drawText(line2, {
    x: x + margin,
    y: y + 1,
    size: 7.5,
    font,
    color: COLOR_TEXT,
  });

  return pdfDoc;
};

/** Devuelve el asunto y texto del OTP según el tipo de documento. */
const docTypeConfig = {
  payroll: { emailTitle: "nómina", emailSubject: "Tu código para firmar nómina" },
  contract: { emailTitle: "contrato", emailSubject: "Tu código para firmar contrato" },
  recibi: { emailTitle: "recibí", emailSubject: "Tu código para firmar el recibí" },
};

/** Solicita OTP para firma de documento y lo envía por email. */
const requestSignature = async (req, res) => {
  const { userId, docType, docId, meta } = req.body;
  if (!userId || !docType || !docId) throw new ClientError("Parámetros insuficientes", 400);

  const config = docTypeConfig[docType];
  if (!config) throw new ClientError("Tipo de documento no soportado", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const otp = await OneTimeCode.findOneAndUpdate(
    { userId, docType, docId },
    { $set: { code: generarCodigoTemporal(), createdAt: new Date(), attempts: 0, docType, docId, meta: meta || {} } },
    { upsert: true, new: true }
  );

  if (docType === "recibi") {
    await registerDocumentationAuditSignRequest({ userId, documentationId: docId, meta: { otpId: otp._id } });
  }

  const textoPlano = `Tu código de verificación para firmar ${config.emailTitle} es: ${otp.code}. Válido 5 minutos.`;
  await sendEmail(
    user.email,
    config.emailSubject,
    textoPlano,
    generateEmailHTML({
      logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
      title: `Código para firma de ${config.emailTitle}`,
      greetingName: user.firstName || user.nombre,
      bodyText: "Este es tu código de un solo uso.",
      highlightText: otp.code,
      footerText: "No compartas este código.",
    })
  );

  return response(res, 200, { fileId: otp._id });
};

/** Valida OTP, genera o carga el PDF, añade firma, lo sube y actualiza el recurso correspondiente. */
const confirmSignature = async (req, res) => {
  const { userId, fileId, code } = req.body;
  if (!userId || !fileId || !code) throw new ClientError("Faltan parámetros", 400);

  const otp = await OneTimeCode.findById(fileId);
  if (!otp || otp.userId.toString() !== userId) throw new ClientError("Código inválido o expirado", 403);

  if (otp.attempts >= 3) {
    await OneTimeCode.deleteOne({ _id: fileId });
    throw new ClientError("Máximo de intentos excedido", 403);
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    if (otp.attempts >= 3) await OneTimeCode.deleteOne({ _id: fileId });
    throw new ClientError("Código incorrecto", 403);
  }

  const userAux = await User.findById(userId, { dni: 1, firstName: 1, lastName: 1, apafa: 1, signature: 1 });
  if (!userAux) throw new ClientError("Usuario no encontrado", 404);

  let originalBuffer, mimeType = "application/pdf", folderId = null, file, generatedFileName = null, documentationAux = null;

  if (otp.docType === "recibi") {
    documentationAux = await Documentation.findById(otp.docId, { name: 1, requiresSignature: 1, modeloPDF: 1, categoryFiles: 1 });
    if (!documentationAux) throw new ClientError("Documento de documentación no encontrado", 404);
    if (!documentationAux.requiresSignature) throw new ClientError("Este documento no requiere firma de recibí", 400);

    const canSignResult = await canUserSignDocumentationReceipt({ userId, documentationId: otp.docId });
    if (!canSignResult?.canSign) throw new ClientError("No puedes firmar el recibí sin haber descargado antes el documento oficial.", 400);

    const fechaRecibi = new Date();
    const documentName = documentationAux.name;
    const description = otp.meta?.description || `Conforme a recibido y leído ${documentName}.`;
    const pdfDocRecibi = await generateRecibiPdf({ userAux, documentName, description, fechaRecibi });

    originalBuffer = Buffer.from(await pdfDocRecibi.save());
    mimeType = "application/pdf";
    folderId = process.env.GOOGLE_DRIVE_RECIBIS;
    generatedFileName = buildRecibiFileName({ documentName, dni: userAux.dni, date: fechaRecibi });
  } else {
    const { file: driveFile, stream } = await getFileById(otp.docId);
    file = driveFile;
    originalBuffer = await streamToBuffer(stream);
    mimeType = file?.mimeType || "application/pdf";
    folderId = file?.parents?.[0] || null;
  }

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(originalBuffer);
  } catch (err) {
    console.error("[confirmSignature] Error al cargar PDF:", err?.message || err);
    throw new ClientError("El PDF original no se pudo leer (posiblemente corrupto).", 400);
  }

  try {
    if (otp.docType === "recibi") await addSignatureToRecibiPdf(pdfDoc, userAux);
    else {
      await addSignatureToPdf(pdfDoc, userAux, {
        boxWidth: 220,
        boxHeight: 70,
        offsetX: 40,
        offsetY: 35,
        imgPath: SIGN_WATERMARK_PATH,
        opacity: 0.35,
        margin: 6,
      });
    }
  } catch (e) {
    console.error("[confirmSignature] Error al pintar firma:", e?.message || e);
    throw new ClientError("Error al firmar el documento", 500);
  }

  const signedBuffer = await pdfDoc.save();
  const fecha = new Date();
  const signedName = otp.docType === "payroll"
    ? `${userAux.dni}_${otp.meta.month}_${otp.meta.year}_signed.pdf`
    : otp.docType === "recibi"
      ? generatedFileName
      : `${userAux.dni}_${fecha.toISOString().slice(0, 10)}_${otp.docType}_signed.pdf`;

  let uploaded;
  try {
    uploaded = await uploadFileToDrive({ buffer: signedBuffer, mimetype: mimeType }, folderId, signedName);
  } catch (err) {
    console.error("[confirmSignature] Error al subir PDF:", err?.message || err);
    throw new ClientError("Error al subir documento firmado", 500);
  }

  if (!uploaded?.id) throw new ClientError("Error al subir documento firmado", 500);
  await OneTimeCode.deleteOne({ _id: fileId });
  const dateInSpain = new Date();

  if (otp.docType === "payroll") {
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "payrolls._id": otp.meta.id },
      { $set: { "payrolls.$.sign": uploaded.id, "payrolls.$.datetimeSign": dateInSpain } },
      { new: true }
    ).populate({ path: "files.filesId", model: "Filedrive" });

    if (!updatedUser) {
      await deleteFileById(uploaded.id).catch(() => {});
      throw new ClientError("No se pudo actualizar la nómina firmada en el usuario", 500);
    }

    return response(res, 200, { data: updatedUser });
  }

  if (otp.docType === "recibi") {
    const attachResult = await attachGeneratedOfficialFileToUser({
      userId,
      documentationId: otp.docId,
      driveId: uploaded.id,
      description: documentationAux?.name || "Recibí firmado",
      date: dateInSpain,
      category: documentationAux?.categoryFiles || "Oficial",
    });

    await registerDocumentationAuditSignComplete({
      userId,
      documentationId: otp.docId,
      fileId: attachResult.newFile._id,
      driveId: uploaded.id,
      signedAt: dateInSpain,
      meta: { fileName: signedName },
    });

    return response(res, 200, { message: "Recibí firmado correctamente", data: attachResult.updatedUser });
  }

  if (otp.docType === "contract") return response(res, 200, { message: "Contrato firmado correctamente", data: { id: uploaded.id } });
  return response(res, 200, { message: "Documento firmado correctamente", data: { id: uploaded.id } });
};

module.exports = {
  requestSignature: catchAsync(requestSignature),
  confirmSignature: catchAsync(confirmSignature),
  addSignatureBox,
};

