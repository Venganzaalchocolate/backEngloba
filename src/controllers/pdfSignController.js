// controllers/pdfSignController.js
const { User } = require("../models/indexModels");
const fs = require("fs");
const OneTimeCode = require("../models/OneTimeCode");
const { ClientError, response, catchAsync } = require("../utils/indexUtils");
const { sendEmail, generateEmailHTML } = require("./emailControllerGoogle");
const { rgb, PDFDocument, StandardFonts } = require("pdf-lib");
const { uploadFileToDrive, getFileById, deleteFileById } = require("./googleController");
const path = require("path");

// 👇 para renderizar strokes a PNG en Node
let createCanvas;
try {
  ({ createCanvas } = require("canvas"));
} catch (e) {
  // si no está instalado, no rompemos: haremos fallback a cajetín texto
  createCanvas = null;
}

/* ============================================================================
 *  CAJETÍN BASE (logo + borde + texto)
 * ========================================================================== */
const addSignatureBox = async (pdfDoc, text, o = {}, apafa = false) => {
  const {
    boxWidth = 200,
    boxHeight = 40,
    margin = 5,
    offsetX = 50,
    offsetY = 50,
    fontStart = 9,
    fontMin = 5,
    imgPath = "./src/img/ImagotipoEngloba.png",
    opacity = 0.35,
  } = o;

  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const x = page.getWidth() - boxWidth - offsetX;
  const y = offsetY;

  // watermark (solo si NO apafa)
  if (!apafa) {
    try {
      const imgBuf = fs.readFileSync(imgPath);
      const img = imgPath.toLowerCase().endsWith(".jpg")
        ? await pdfDoc.embedJpg(imgBuf)
        : await pdfDoc.embedPng(imgBuf);

      const { width: w0, height: h0 } = img.size();
      const s = Math.min(
        (boxWidth - margin * 2) / w0,
        (boxHeight - margin * 2) / h0
      );

      page.drawImage(img, {
        x: x + margin + (boxWidth - margin * 2 - w0 * s) / 2,
        y: y + margin + (boxHeight - margin * 2 - h0 * s) / 2,
        width: w0 * s,
        height: h0 * s,
        opacity,
      });
    } catch { }
  }

  // borde
  page.drawRectangle({
    x, y, width: boxWidth, height: boxHeight,
    borderColor: rgb(1, 1, 1),
    borderWidth: 1,
  });

  // ✅ si no hay texto, devolvemos coords y listo (para usar firma PNG + texto aparte)
  const safeText = typeof text === "string" ? text.trim() : "";
  if (!safeText) {
    return { x, y, boxWidth, boxHeight, margin, font };
  }

  // (lo tuyo de wrap) …
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
        else { out.push(line); line = word; }
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
  if (lines.length * lineH(size) > innerH) {
    throw new Error("Texto demasiado largo para el cajetín");
  }

  let ty = y + boxHeight - margin - size;
  lines.forEach((l) => {
    page.drawText(l, { x: x + margin, y: ty, size, font, color: rgb(0, 0, 0) });
    ty -= lineH(size);
  });

  return { x, y, boxWidth, boxHeight, margin, font };
};

/* ============================================================================
 *  FIRMA GUARDADA (strokes) -> PNG
 *  Renderiza strokes (signature_pad) a PNG con Node-canvas
 * ========================================================================== */
const renderStrokesToPngBuffer = (strokes, opts = {}) => {
  if (!createCanvas) return null;
  if (!Array.isArray(strokes) || strokes.length === 0) return null;

  const {
    width = 900,
    height = 250,
    padding = 6,
    lineWidth = 6,
    lineColor = "#111",
    background = "transparent",
  } = opts;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // fondo
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // bounding box strokes
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

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

  // dibujar
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



/* ============================================================================
 *  PINTAR FIRMA EN EL CAJETÍN:
 *   - Siempre dibuja el cajetín con logo/borde
 *   - Si hay firma guardada => PNG dentro
 *   - Si no => texto como antes
 * ========================================================================== */
const hasUserSignature = (user) =>
  Array.isArray(user?.signature?.strokes) && user.signature.strokes.length > 0;

const addSignatureToPdf = async (pdfDoc, userAux, opts = {}) => {
  const {
    boxWidth = 260,
    boxHeight = 95,
    offsetX = 40,
    offsetY = 10,
    margin = 4,
    imgPath = "./src/img/ImagotipoEngloba.png",
    opacity = 0.20,

    // layout
    textAreaH = 16,     // reserva para texto abajo
    gap = 1,            // separación firma <-> texto
    textSize = 7.5,
    textColor = rgb(0, 0, 0),

    // render png (calidad)
    pngW = 1200,
    pngH = 420,
    lineWidth = 6,
  } = opts;

  const fecha = new Date();

  const line1 = `Firmado por: ${userAux.firstName} ${userAux.lastName} · DNI: ${userAux.dni}`;
  const line2 = `${fecha.toLocaleDateString("es-ES")} ${fecha.toLocaleTimeString("es-ES")}`;

  // Si NO hay firma guardada -> comportamiento clásico con texto dentro del cajetín
  if (!hasUserSignature(userAux)) {
    const signText = `Firmado digitalmente por:
Nombre: ${userAux.firstName} ${userAux.lastName}
DNI: ${userAux.dni}
Fecha: ${fecha.toLocaleDateString("es-ES")}
Hora: ${fecha.toLocaleTimeString("es-ES")}`;

    await addSignatureBox(
      pdfDoc,
      signText,
      { boxWidth, boxHeight, offsetX, offsetY, margin, imgPath, opacity },
      userAux.apafa
    );
    return pdfDoc;
  }

  // 1) Dibuja cajetín + watermark (sin texto dentro)
  const { x, y, boxWidth: bw, boxHeight: bh } = await addSignatureBox(
    pdfDoc,
    "",
    { boxWidth, boxHeight, offsetX, offsetY, margin, imgPath, opacity },
    userAux.apafa
  );

  const [page] = pdfDoc.getPages();

  // 2) Área interior
  const innerW = Math.max(1, bw - margin * 2);
  const innerH = Math.max(1, bh - margin * 2);

  // 3) Reservar texto abajo
  const reservedTextH = Math.min(textAreaH, Math.floor(innerH * 0.45)); // límite por seguridad
  const sigAreaH = Math.max(1, innerH - reservedTextH - gap);

  // 4) Render PNG desde strokes
  const pngBuf = renderStrokesToPngBuffer(userAux.signature.strokes, {
    width: pngW,
    height: pngH,
    padding: 18,
    lineWidth,
    lineColor: "#111",
    background: "transparent",
  });

  // Fallback extremo si no hay canvas o falla el render
  if (!pngBuf) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(line1, {
      x: x + margin,
      y: y + margin + 10,
      size: textSize,
      font,
      color: textColor,
    });
    page.drawText(line2, {
      x: x + margin,
      y: y + margin,
      size: textSize,
      font,
      color: textColor,
    });
    return pdfDoc;
  }

  const png = await pdfDoc.embedPng(pngBuf);

  // 5) Escala para que sea lo MÁS grande posible, sin recortar:
  //    encaja en innerW x sigAreaH
  const imgW0 = png.width;
  const imgH0 = png.height;

  const s = Math.min(innerW / imgW0, sigAreaH / imgH0);

  const drawW = imgW0 * s;
  const drawH = imgH0 * s;

  // Centrar en área de firma
  const sigX = x + margin + (innerW - drawW) / 2;

  // la firma va arriba del cajetín (dentro), dejando sitio abajo para el texto
  // baseY del área interior = y + margin
  const baseY = y + margin;

  // el texto está abajo, así que la firma se coloca encima:
  const sigY = baseY + reservedTextH + gap + (sigAreaH - drawH) / 2;

  page.drawImage(png, {
    x: sigX,
    y: sigY,
    width: drawW,
    height: drawH,
    opacity: 1,
  });

  // 6) Texto abajo (siempre visible)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // si el texto es largo, lo “encogemos” un poco para que quepa en una línea
  const fitTextSize = (txt, maxW, start) => {
    let size = start;
    while (size > 6 && font.widthOfTextAtSize(txt, size) > maxW) size -= 0.5;
    return size;
  };

  const t1Size = fitTextSize(line1, innerW, textSize);
  const t2Size = fitTextSize(line2, innerW, textSize);

  // colocación: 2 líneas abajo
  const t2Y = baseY + 2;               // muy abajo
  const t1Y = t2Y + t2Size + 2;        // encima

  page.drawText(line1, {
    x: x + margin,
    y: t1Y,
    size: t1Size,
    font,
    color: textColor,
  });
  page.drawText(line2, {
    x: x + margin,
    y: t2Y,
    size: t2Size,
    font,
    color: textColor,
  });

  return pdfDoc;
};

/* ============================================================================
 *  CONFIG
 * ========================================================================== */
const docTypeConfig = {
  payroll: { emailTitle: "nómina", emailSubject: "Tu código para firmar nómina" },
  contract: { emailTitle: "contrato", emailSubject: "Tu código para firmar contrato" },
  recibi: { emailTitle: "recibí", emailSubject: "Tu código para firmar el recibí" },
};

const generarCodigoTemporal = () =>
  ("" + Math.floor(Math.random() * 999999)).padStart(6, "0");

/* ============================================================================
 *  REQUEST OTP
 * ========================================================================== */
const requestSignature = async (req, res) => {
  const { userId, docType, docId, meta } = req.body;

  if (!userId || !docType || (docType !== "recibi" && !docId)) {
    throw new ClientError("Parámetros insuficientes", 400);
  }

  const config = docTypeConfig[docType];
  if (!config) throw new ClientError("Tipo de documento no soportado", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  const code = generarCodigoTemporal();
  const now = new Date();

  const otp = await OneTimeCode.findOneAndUpdate(
    { userId },
    { $set: { code, createdAt: now, attempts: 0, docType, docId, meta: meta || {} } },
    { upsert: true, new: true }
  );

  const textoPlano = `Tu código de verificación para firmar ${config.emailTitle} es: ${code}. Válido 5 minutos.`;

  await sendEmail(
    user.email,
    config.emailSubject,
    textoPlano,
    generateEmailHTML({
      logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
      title: `Código para firma de ${config.emailTitle}`,
      greetingName: user.firstName || user.nombre,
      bodyText: "Este es tu código de un solo uso.",
      highlightText: code,
      footerText: "No compartas este código.",
    })
  );

  return response(res, 200, { fileId: otp._id });
};

/* ============================================================================
 *  CONFIRM OTP + SIGN PDF
 * ========================================================================== */
const confirmSignature = async (req, res) => {
  const { userId, fileId, code } = req.body;

  if (!userId || !fileId || !code) {
    throw new ClientError("Faltan parámetros", 400);
  }

  const otp = await OneTimeCode.findById(fileId);
  if (!otp || otp.userId.toString() !== userId) {
    throw new ClientError("Código inválido o expirado", 403);
  }

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

  // ── D. Obtener PDF original ─────────────────────────
  let originalBuffer;
  let mimeType = "application/pdf";
  let folderId = null;
  let file; // metadata drive (payroll/contract)

  if (otp.docType === "recibi") {
    // aquí mantienes tu lógica si la usas, pero ahora mismo tu flujo real es payroll
    throw new ClientError("Recibí no implementado en este controlador (según tu flujo actual)", 400);
  } else {
    const { file: driveFile, stream } = await getFileById(otp.docId);
    file = driveFile;

    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    originalBuffer = Buffer.concat(chunks);

    mimeType = file?.mimeType || "application/pdf";
    folderId = file?.parents?.[0] || null;
  }

  // ── E. Cargar PDF ───────────────────────────────────
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(originalBuffer);
  } catch (err) {
    console.error("[confirmSignature] Error al cargar PDF:", err?.message || err);
    throw new ClientError("El PDF original no se pudo leer (posiblemente corrupto).", 400);
  }

  // ── F. Pintar firma: si hay firma guardada => imagen, si no => cajetín texto ──
  const userAux = await User.findById(userId, {
    dni: 1,
    firstName: 1,
    lastName: 1,
    apafa: 1,
    signature: 1, // 👈 importante
  });
  if (!userAux) throw new ClientError("Usuario no encontrado", 404);

  try {
    await addSignatureToPdf(pdfDoc, userAux, {
      boxWidth: 220,
      boxHeight: 70,
      offsetX: 40,
      offsetY: 35,
      imgPath: "./src/img/ImagotipoEngloba.png",
      opacity: 0.35,
      margin: 6,
    });
  } catch (e) {
    console.error("[confirmSignature] Error al pintar firma:", e?.message || e);
    throw new ClientError("Error al firmar el documento", 500);
  }

  const signedBuffer = await pdfDoc.save();

  // ── G. Subir a Drive ─────────────────────────────────
  const fecha = new Date();
  const signedName =
    otp.docType === "payroll"
      ? `${userAux.dni}_${otp.meta.month}_${otp.meta.year}_signed.pdf`
      : `${userAux.dni}_${fecha.toISOString().slice(0, 10)}_${otp.docType}_signed.pdf`;

  let uploaded;
  try {
    uploaded = await uploadFileToDrive({ buffer: signedBuffer, mimetype: mimeType }, folderId, signedName);
  } catch (err) {
    console.error("[confirmSignature] Error al subir PDF:", err?.message || err);
    throw new ClientError("Error al subir documento firmado", 500);
  }

  if (!uploaded?.id) throw new ClientError("Error al subir documento firmado", 500);

  // ── H. borrar OTP ────────────────────────────────────
  await OneTimeCode.deleteOne({ _id: fileId });

  // ── I. Actualizaciones por tipo ──────────────────────
  const dateInSpain = new Date();

  if (otp.docType === "payroll") {
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "payrolls._id": otp.meta.id },
      {
        $set: {
          "payrolls.$.sign": uploaded.id,
          "payrolls.$.datetimeSign": dateInSpain,
        },
      },
      { new: true }
    ).populate({ path: "files.filesId", model: "Filedrive" });

    if (!updatedUser) {
      await deleteFileById(uploaded.id).catch(() => { });
      throw new ClientError("No se pudo actualizar la nómina firmada en el usuario", 500);
    }

    return response(res, 200, { data: updatedUser });
  }

  if (otp.docType === "contract") {
    return response(res, 200, { message: "Contrato firmado correctamente", data: { id: uploaded.id } });
  }

  return response(res, 200, { message: "Documento firmado correctamente", data: { id: uploaded.id } });
};

module.exports = {
  requestSignature: catchAsync(requestSignature),
  confirmSignature: catchAsync(confirmSignature),
  addSignatureBox,
};