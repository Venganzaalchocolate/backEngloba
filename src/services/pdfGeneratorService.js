// services/pdfGeneratorService.js
const fs = require("fs");
const path = require("path");
const { rgb, PDFDocument, StandardFonts } = require("pdf-lib");
const { formatDateTimeSpain, formatDateSpain, formatTimeSpain } = require("../utils/utils");

let createCanvas;
try { ({ createCanvas } = require("canvas")); } catch { createCanvas = null; }

const RECIBI_LOGO_PATH = path.resolve(__dirname, "../img/logotipoEngloba.jpg");
const SIGN_WATERMARK_PATH = path.resolve(__dirname, "../img/ImagotipoEngloba.png");

const COLOR_PRIMARY = hexToRgb("#4f5ca8");
const COLOR_SOFT = hexToRgb("#ececf8");
const COLOR_SOFT_BORDER = hexToRgb("#d5d8ef");
const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_MUTED = hexToRgb("#6f7395");
const COLOR_WHITE = rgb(1, 1, 1);

const PRL_RECIBI_EXTRA_TEXT = `La empresa, en cumplimiento de las obligaciones expresadas en los artículos 18 y 20 de la Ley 31/1995 de Prevención de Riesgos Laborales, “información, consulta y participación de los trabajadores” y “medidas de emergencia”, le ha entregado la información sobre los riesgos para la Seguridad y la Salud, las medidas y actividades de protección y prevención aplicables y las medidas de emergencia y primeros auxilios que afectan a su puesto de trabajo.

Se le recuerda que, entre las obligaciones de los trabajadores en materia de Prevención de Riesgos definidas por la Ley, están las siguientes:

• Velar por su propia Seguridad y Salud en el trabajo y por la de aquellas otras personas a las que pueda afectar su actividad profesional.
• Usar adecuadamente máquinas, aparatos, herramientas, sustancias peligrosas y equipos de transporte.
• Utilizar correctamente los medios y equipos de protección facilitados por la empresa de acuerdo con las instrucciones recibidas.
• No poner fuera de funcionamiento y utilizar correctamente los dispositivos de seguridad.
• Informar de inmediato a sus superiores ante cualquier situación que entrañe riesgo para la Seguridad y Salud.`;



/* ======================================================
   Convierte un color HEX a rgb de pdf-lib
====================================================== */

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "");
  const n = parseInt(clean, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* ======================================================
   Limpia textos para generar nombres de archivo seguros
====================================================== */

const sanitizeFileName = (text = "") =>
  String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");

/* ======================================================
   Genera el nombre final del recibí firmado
====================================================== */

const buildRecibiFileName = ({ documentName, dni, date = new Date() }) => {
  const safeName = sanitizeFileName(documentName || "documento");
  const safeDni = sanitizeFileName(dni || "sin_dni");
  return `${safeName}_${safeDni}_${date.toISOString().slice(0, 10)}_recibi_signed.pdf`;
};

/* ======================================================
   Comprueba si el usuario tiene rúbrica dibujada
====================================================== */

const hasUserSignature = (user) => Array.isArray(user?.signature?.strokes) && user.signature.strokes.length > 0;

/* ======================================================
   Parte un texto en líneas según el ancho disponible
====================================================== */

const wrapTextLines = (text, font, size, maxWidth) => {
  if (!text) return [""];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;

    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
};

/* ======================================================
   Pinta texto con salto de línea manual
====================================================== */

const drawWrappedText = ({ page, text, x, y, maxWidth, font, size, color, lineGap = 4 }) => {
  const lines = wrapTextLines(text, font, size, maxWidth);
  let currentY = y;

  for (const line of lines) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size + lineGap;
  }

  return currentY;
};

const drawWrappedParagraphText = ({
  page,
  text,
  x,
  y,
  maxWidth,
  font,
  size,
  color,
  lineGap = 2,
  paragraphGap = 4,
}) => {
  const paragraphs = String(text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let currentY = y;

  for (const paragraph of paragraphs) {
    const lines = wrapTextLines(paragraph, font, size, maxWidth);

    for (const line of lines) {
      page.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size + lineGap;
    }

    currentY -= paragraphGap;
  }

  return currentY;
};

/* ======================================================
   Pinta texto con salto y límite opcional de líneas
====================================================== */

const drawWrappedTextBlock = ({
  page,
  text,
  x,
  y,
  maxWidth,
  font,
  size,
  color,
  lineGap = 4,
  maxLines = null,
}) => {
  const lines = wrapTextLines(text, font, size, maxWidth);
  const safeLines = maxLines ? lines.slice(0, maxLines) : lines;
  let currentY = y;

  for (const line of safeLines) {
    page.drawText(line, { x, y: currentY, size, font, color });
    currentY -= size + lineGap;
  }

  return currentY;
};

/* ======================================================
   Pinta una caja rectangular
====================================================== */

const drawBox = ({ page, x, y, width, height, color, borderColor, borderWidth = 1 }) => {
  page.drawRectangle({ x, y, width, height, color, borderColor, borderWidth });
};

/* ======================================================
   Inserta imagen JPG o PNG desde ruta local
====================================================== */

const embedImageByPath = async (pdfDoc, imgPath) => {
  const buf = fs.readFileSync(imgPath);
  const lower = imgPath.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? pdfDoc.embedJpg(buf) : pdfDoc.embedPng(buf);
};

/* ======================================================
   Renderiza la rúbrica guardada en strokes a PNG
====================================================== */

const renderStrokesToPngBuffer = (strokes, opts = {}) => {
  if (!createCanvas || !Array.isArray(strokes) || !strokes.length) return null;

  const {
    width = 700,
    height = 220,
    padding = 6,
    lineWidth = 5,
    lineColor = "#111",
    background = "transparent",
  } = opts;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

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

/* ======================================================
   Pinta cajetín genérico de firma sobre PDF existente
====================================================== */

const addSignatureBox = async (pdfDoc, text, o = {}, apafa = false) => {
  const {
    boxWidth = 200,
    boxHeight = 40,
    margin = 5,
    offsetX = 50,
    offsetY = 50,
    fontStart = 9,
    fontMin = 5,
    imgPath = SIGN_WATERMARK_PATH,
    opacity = 0.35,
  } = o;

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

/* ======================================================
   Firma genérica para nóminas, contratos u otros PDFs
====================================================== */

const addSignatureToPdf = async (pdfDoc, userAux, opts = {}) => {
  const {
    boxWidth = 260,
    boxHeight = 95,
    offsetX = 40,
    offsetY = 10,
    margin = 4,
    imgPath = SIGN_WATERMARK_PATH,
    opacity = 0.2,
    textAreaH = 16,
    gap = 1,
    textSize = 7.5,
    textColor = COLOR_TEXT,
    pngW = 900,
    pngH = 300,
    lineWidth = 5,
  } = opts;

  const fecha = new Date();
  const line1 = `Firmado por: ${userAux.firstName} ${userAux.lastName} · DNI: ${userAux.dni}`;
  const line2 = formatDateTimeSpain(fecha);

  if (!hasUserSignature(userAux)) {
    const signText = `Firmado digitalmente por:
Nombre: ${userAux.firstName} ${userAux.lastName}
DNI: ${userAux.dni}
Fecha: ${formatDateSpain(fecha)}
Hora: ${formatTimeSpain(fecha)}`;

    await addSignatureBox(pdfDoc, signText, {
      boxWidth,
      boxHeight,
      offsetX,
      offsetY,
      margin,
      imgPath,
      opacity,
    }, userAux.apafa);

    return pdfDoc;
  }

  const { x, y, boxWidth: bw, boxHeight: bh } = await addSignatureBox(pdfDoc, "", {
    boxWidth,
    boxHeight,
    offsetX,
    offsetY,
    margin,
    imgPath,
    opacity,
  }, userAux.apafa);

  const [page] = pdfDoc.getPages();
  const innerW = Math.max(1, bw - margin * 2);
  const innerH = Math.max(1, bh - margin * 2);
  const reservedTextH = Math.min(textAreaH, Math.floor(innerH * 0.45));
  const sigAreaH = Math.max(1, innerH - reservedTextH - gap);

  const pngBuf = renderStrokesToPngBuffer(userAux.signature.strokes, {
    width: pngW,
    height: pngH,
    padding: 18,
    lineWidth,
    lineColor: "#111",
    background: "transparent",
  });

  if (!pngBuf) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(line1, { x: x + margin, y: y + margin + 10, size: textSize, font, color: textColor });
    page.drawText(line2, { x: x + margin, y: y + margin, size: textSize, font, color: textColor });
    return pdfDoc;
  }

  const png = await pdfDoc.embedPng(pngBuf);
  const s = Math.min(innerW / png.width, sigAreaH / png.height);
  const drawW = png.width * s;
  const drawH = png.height * s;
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

/* ======================================================
   Pinta pie de página para recibí simple
====================================================== */

const drawRecibiFooter = async ({ pdfDoc, page, pageNumber, totalPages, marginX = 55 }) => {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width } = page.getSize();

  page.drawLine({
    start: { x: marginX, y: 58 },
    end: { x: width - marginX, y: 58 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: width - 95,
    y: 42,
    size: 9,
    font,
    color: COLOR_MUTED,
  });
};

/* ======================================================
   Añade página adicional al recibí simple
====================================================== */

const addRecibiTextPage = async ({ pdfDoc, title = "INFORMACIÓN ADICIONAL" }) => {
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const marginX = 55;

  try {
    const logo = await embedImageByPath(pdfDoc, RECIBI_LOGO_PATH);
    const logoW = 105;
    const logoH = logo.height * logoW / logo.width;
    page.drawImage(logo, { x: marginX, y: height - 82, width: logoW, height: logoH, opacity: 0.95 });
  } catch {}

  let infoY = height - 38;

  ["Asociación Engloba", "Paraje la Solana, 1", "Chirivel (Almería) 04825", "G04747614", "rrhh@engloba.org.es"].forEach((line) => {
    page.drawText(line, { x: width - 190, y: infoY, size: 9, font: fontBold, color: COLOR_PRIMARY });
    infoY -= 12;
  });

  page.drawLine({
    start: { x: marginX, y: height - 96 },
    end: { x: width - marginX, y: height - 96 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  page.drawText(title, {
    x: marginX,
    y: height - 140,
    size: 12,
    font: fontBold,
    color: COLOR_PRIMARY,
  });

  return { page, y: height - 170 };
};

/* ======================================================
   Genera el recibí simple.
   Si includePrlExtraText es true, añade texto PRL
   antes del bloque de firma.
====================================================== */

const generateRecibiPdf = async ({
  userAux,
  documentName,
  description,
  fechaRecibi = new Date(),
  includePrlExtraText = false,
}) => {
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

  page.drawLine({
    start: { x: marginX, y: height - 104 },
    end: { x: width - marginX, y: height - 104 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  const title = "RECIBÍ";
  const titleSize = 22;

  page.drawText(title, {
    x: (width - fontBold.widthOfTextAtSize(title, titleSize)) / 2,
    y: height - 162,
    size: titleSize,
    font: fontBold,
    color: COLOR_PRIMARY,
  });

  drawBox({ page, x: marginX, y: 580, width: contentW, height: 78, color: COLOR_SOFT, borderColor: COLOR_SOFT });

  const fullName = [userAux.firstName, userAux.lastName].filter(Boolean).join(" ").trim() || "—";
  let rowY = 638;

  [
    ["Nombre y apellidos:", fullName],
    ["DNI:", userAux.dni || "—"],
    ["Fecha:", formatDateSpain(fechaRecibi)],
["Hora:", formatTimeSpain(fechaRecibi)],
  ].forEach(([label, value]) => {
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

  drawWrappedText({
    page,
    text: documentName || "Documento",
    x: docLabelX + docLabelW + 6,
    y: docLabelY,
    maxWidth: contentW - (docLabelW + 30),
    font,
    size: 10.5,
    color: COLOR_TEXT,
    lineGap: 2,
  });

  page.drawText("EXPONE:", { x: marginX, y: 470, size: 12, font: fontBold, color: COLOR_PRIMARY });

  let textY = 438;

  [
    `La persona arriba identificada declara haber recibido el documento "${documentName}".`,
    description || `Conforme a recibido y leído ${documentName}.`,
    "Y para que así conste, firma digitalmente el presente recibí.",
  ].forEach((paragraph) => {
    textY = drawWrappedText({ page, text: paragraph, x: marginX, y: textY, maxWidth: contentW, font, size: 11, color: COLOR_TEXT, lineGap: 5 });
    textY -= 14;
  });

const extraTextBeforeSignature = includePrlExtraText ? PRL_RECIBI_EXTRA_TEXT : "";
let signaturePage = page;

if (extraTextBeforeSignature) {
  const prlTitleY = textY - 2;

  page.drawText("INFORMACIÓN DE PREVENCIÓN DE RIESGOS LABORALES", {
    x: marginX,
    y: prlTitleY,
    size: 8.5,
    font: fontBold,
    color: COLOR_PRIMARY,
  });

  page.drawLine({
    start: { x: marginX, y: prlTitleY - 5 },
    end: { x: width - marginX, y: prlTitleY - 5 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  drawWrappedParagraphText({
    page,
    text: extraTextBeforeSignature,
    x: marginX,
    y: prlTitleY - 16,
    maxWidth: contentW,
    font,
    size: 7,
    color: COLOR_TEXT,
    lineGap: 1.5,
    paragraphGap: 3,
  });
}

  const signatureBoxY = includePrlExtraText ? 92 : 130;
const signatureTextY = includePrlExtraText ? 178 : 216;
const signatureLineY = includePrlExtraText ? 166 : 204;
const signatureLabelY = includePrlExtraText ? 140 : 178;

drawBox({
  page: signaturePage,
  x: marginX,
  y: signatureBoxY,
  width: contentW,
  height: 115,
  color: COLOR_SOFT,
  borderColor: COLOR_SOFT,
});

signaturePage.drawText("En prueba de conformidad, se firma este documento en la fecha indicada.", {
  x: marginX + 14,
  y: signatureTextY,
  size: 10,
  font,
  color: COLOR_PRIMARY,
});

signaturePage.drawLine({
  start: { x: marginX + 14, y: signatureLineY },
  end: { x: width - marginX - 14, y: signatureLineY },
  thickness: 1,
  color: COLOR_WHITE,
});

signaturePage.drawText("Firma electrónica de recepción", {
  x: marginX + 14,
  y: signatureLabelY,
  size: 10.5,
  font: fontBold,
  color: COLOR_PRIMARY,
});

  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    await drawRecibiFooter({
      pdfDoc,
      page: pages[i],
      pageNumber: i + 1,
      totalPages: pages.length,
      marginX,
    });
  }

  return pdfDoc;
};

/* ======================================================
   Añade la firma concreta del recibí en la última página
====================================================== */

const addSignatureToRecibiPdf = async (pdfDoc, userAux, opts = {}) => {
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1];

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const x = opts.x ?? 300;
  const y = opts.y ?? 136;
  const boxWidth = opts.boxWidth ?? 230;
  const boxHeight = opts.boxHeight ?? 64;
  const margin = opts.margin ?? 8;

  const fecha = new Date();
  const line1 = `${userAux.firstName || ""} ${userAux.lastName || ""}`.trim();
const line2 = formatDateTimeSpain(fecha);

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
      width: 700,
      height: 220,
      padding: 10,
      lineWidth: 5,
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

/* ======================================================
   Pinta cabecera para recibís generados por plantilla
====================================================== */

const drawTemplateHeader = async ({ pdfDoc, page, isPreview }) => {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  try {
    const logo = await embedImageByPath(pdfDoc, RECIBI_LOGO_PATH);
    const logoW = 88;
    const logoH = logo.height * logoW / logo.width;
    page.drawImage(logo, { x: 45, y: height - 68, width: logoW, height: logoH, opacity: 0.95 });
  } catch {}

  let infoY = height - 34;

  ["Asociación Engloba", "Paraje la Solana, 1", "Chirivel (Almería) 04825", "G04747614", "rrhh@engloba.org.es"].forEach((line) => {
    page.drawText(line, { x: width - 175, y: infoY, size: 9, font: fontBold, color: COLOR_PRIMARY });
    infoY -= 12;
  });

  page.drawLine({
    start: { x: 45, y: height - 88 },
    end: { x: width - 45, y: height - 88 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  if (isPreview) {
    page.drawText("DOCUMENTO DE PRUEBA - SIN VALIDEZ", {
      x: 45,
      y: height - 102,
      size: 9,
      font,
      color: COLOR_MUTED,
    });
  }
};

/* ======================================================
   Pinta pie para recibís generados por plantilla
====================================================== */

const drawTemplateFooter = async ({ pdfDoc, page, pageNumber, totalPages }) => {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const { width } = page.getSize();

  page.drawLine({
    start: { x: 45, y: 42 },
    end: { x: width - 45, y: 42 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: width - 105,
    y: 26,
    size: 8.5,
    font,
    color: COLOR_MUTED,
  });
};

/* ======================================================
   Crea nueva página para recibí por plantilla
====================================================== */

const addTemplatePage = async ({ pdfDoc, isPreview }) => {
  const page = pdfDoc.addPage([595.28, 841.89]);
  await drawTemplateHeader({ pdfDoc, page, isPreview });
  return { page, y: isPreview ? 710 : 725 };
};

/* ======================================================
   Asegura espacio vertical en recibí por plantilla
====================================================== */

const ensureTemplateSpace = async ({ pdfDoc, page, y, needed = 20, isPreview }) => {
  if (y - needed >= 80) return { page, y };
  return addTemplatePage({ pdfDoc, isPreview });
};

/* ======================================================
   Pinta texto con paginación para recibí por plantilla
====================================================== */

const drawTemplateText = async ({
  pdfDoc,
  page,
  text,
  x,
  y,
  maxWidth,
  font,
  size = 10,
  color = COLOR_TEXT,
  lineGap = 4,
  paragraphGap = 8,
  isPreview = false,
}) => {
  const paragraphs = String(text || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  let currentPage = page;
  let currentY = y;

  for (const paragraph of paragraphs) {
    const lines = wrapTextLines(paragraph, font, size, maxWidth);

    for (const line of lines) {
      const checked = await ensureTemplateSpace({
        pdfDoc,
        page: currentPage,
        y: currentY,
        needed: size + lineGap,
        isPreview,
      });

      currentPage = checked.page;
      currentY = checked.y;

      currentPage.drawText(line, { x, y: currentY, size, font, color });
      currentY -= size + lineGap;
    }

    currentY -= paragraphGap;
  }

  return { page: currentPage, y: currentY };
};

/* ======================================================
   Pinta título de sección para recibí por plantilla
====================================================== */

const drawTemplateSectionTitle = async ({ pdfDoc, page, title, x, y, fontBold, isPreview }) => {
  const checked = await ensureTemplateSpace({ pdfDoc, page, y, needed: 30, isPreview });
  page = checked.page;
  y = checked.y;

  page.drawText(title, { x, y, size: 11.5, font: fontBold, color: COLOR_PRIMARY });

  page.drawLine({
    start: { x, y: y - 6 },
    end: { x: 550, y: y - 6 },
    thickness: 1,
    color: COLOR_SOFT_BORDER,
  });

  return { page, y: y - 22 };
};

/* ======================================================
   Pinta datos del trabajador en recibí por plantilla
====================================================== */

const drawTemplateInfoBox = async ({
  page,
  userAux,
  documentName,
  fechaRecibi,
  font,
  fontBold,
  employeeContext = {},
}) => {
  const x = 45;
  const y = 555;
  const width = 505;
  const height = 132;

  drawBox({ page, x, y, width, height, color: COLOR_SOFT, borderColor: COLOR_SOFT });

  const fullName = [userAux.firstName, userAux.lastName].filter(Boolean).join(" ").trim() || "—";

  const rows = [
    ["Nombre y apellidos:", fullName],
    ["DNI:", userAux.dni || "—"],
    ["Fecha y hora:", `${formatDateSpain(fechaRecibi)} ${formatTimeSpain(fechaRecibi)}`],
    ["Dispositivo:", employeeContext.dispositiveName || "—"],
    ["Puesto de trabajo:", employeeContext.positionName || "—"],
    ["Centro de trabajo:", employeeContext.workplaceName || "—"],
    ["Documento asociado:", documentName || "Documento"],
  ];

  let rowY = y + height - 22;

  rows.forEach(([label, value]) => {
    page.drawText(label, {
      x: x + 14,
      y: rowY,
      size: 9.2,
      font: fontBold,
      color: COLOR_PRIMARY,
    });

    const labelW = fontBold.widthOfTextAtSize(label, 9.2);

    drawWrappedTextBlock({
      page,
      text: String(value),
      x: x + 18 + labelW,
      y: rowY,
      maxWidth: width - labelW - 42,
      font,
      size: 9.2,
      color: COLOR_TEXT,
      lineGap: 2,
      maxLines: 2,
    });

    rowY -= label === "Documento asociado:" ? 24 : 16;
  });
};

/* ======================================================
   Genera recibí desde plantilla con preguntas/respuestas
====================================================== */

const generateReceiptTemplatePdf = async ({
  userAux,
  documentName,
  template,
  answersSnapshot = [],
  fechaRecibi = new Date(),
  isPreview = false,
  employeeContext = {},
}) => {
  const pdfDoc = await PDFDocument.create();
  let { page, y } = await addTemplatePage({ pdfDoc, isPreview });

  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const marginX = 45;
  const contentW = width - marginX * 2;
  const title = (template?.title || "Declaración de recepción").toUpperCase();
  const titleSize = title.length > 70 ? 12.5 : title.length > 48 ? 13.5 : 15;
  let titleY = height - 132;

  const titleLines = wrapTextLines(title, fontBold, titleSize, contentW);

  titleLines.slice(0, 3).forEach((line) => {
    page.drawText(line, {
      x: marginX,
      y: titleY,
      size: titleSize,
      font: fontBold,
      color: COLOR_PRIMARY,
    });

    titleY -= titleSize + 5;
  });

  await drawTemplateInfoBox({
    page,
    userAux,
    documentName,
    fechaRecibi,
    font,
    fontBold,
    employeeContext,
  });

  y = 520;

  let result = await drawTemplateSectionTitle({ pdfDoc, page, title: "DECLARA", x: marginX, y, fontBold, isPreview });
  page = result.page;
  y = result.y;

  if (template?.introText) {
    result = await drawTemplateText({
      pdfDoc,
      page,
      text: template.introText,
      x: marginX,
      y,
      maxWidth: contentW,
      font,
      size: 10,
      lineGap: 4,
      paragraphGap: 8,
      isPreview,
    });

    page = result.page;
    y = result.y;
  }

  const validAnswers = (answersSnapshot || []).filter((a) => a?.textApplied);

  for (let i = 0; i < validAnswers.length; i++) {
    const item = validAnswers[i];

    result = await ensureTemplateSpace({ pdfDoc, page, y, needed: 110, isPreview });
    page = result.page;
    y = result.y;

    result = await drawTemplateText({
      pdfDoc,
      page,
      text: `${i + 1}. ${item.question || "Pregunta"}`,
      x: marginX,
      y,
      maxWidth: contentW,
      font: fontBold,
      size: 10,
      color: COLOR_PRIMARY,
      lineGap: 4,
      paragraphGap: 4,
      isPreview,
    });

    page = result.page;
    y = result.y;

    result = await drawTemplateText({
      pdfDoc,
      page,
      text: `Respuesta: ${item.answer === "yes" ? "Sí" : "No"}`,
      x: marginX + 12,
      y,
      maxWidth: contentW - 12,
      font: fontBold,
      size: 9.5,
      color: COLOR_MUTED,
      lineGap: 3,
      paragraphGap: 4,
      isPreview,
    });

    page = result.page;
    y = result.y;

    result = await drawTemplateText({
      pdfDoc,
      page,
      text: item.textApplied,
      x: marginX + 12,
      y,
      maxWidth: contentW - 12,
      font,
      size: 10,
      color: COLOR_TEXT,
      lineGap: 4,
      paragraphGap: 10,
      isPreview,
    });

    page = result.page;
    y = result.y;
  }

  if (template?.finalText) {
    result = await drawTemplateSectionTitle({ pdfDoc, page, title: "CIERRE", x: marginX, y, fontBold, isPreview });
    page = result.page;
    y = result.y;

    result = await drawTemplateText({
      pdfDoc,
      page,
      text: template.finalText,
      x: marginX,
      y,
      maxWidth: contentW,
      font,
      size: 10,
      lineGap: 4,
      paragraphGap: 8,
      isPreview,
    });

    page = result.page;
    y = result.y;
  }

  result = await ensureTemplateSpace({ pdfDoc, page, y, needed: 145, isPreview });
  page = result.page;

  const signatureY = 85;

  drawBox({
    page,
    x: marginX,
    y: signatureY - 12,
    width: contentW,
    height: 118,
    color: COLOR_SOFT,
    borderColor: COLOR_SOFT,
  });

  page.drawText("En prueba de conformidad, se firma este documento en la fecha indicada.", {
    x: marginX + 14,
    y: signatureY + 78,
    size: 9.5,
    font,
    color: COLOR_PRIMARY,
  });

  page.drawLine({
    start: { x: marginX + 14, y: signatureY + 66 },
    end: { x: width - marginX - 14, y: signatureY + 66 },
    thickness: 1,
    color: COLOR_WHITE,
  });

  page.drawText("Firma electrónica de recepción", {
    x: marginX + 14,
    y: signatureY + 40,
    size: 10.5,
    font: fontBold,
    color: COLOR_PRIMARY,
  });

  await addSignatureToRecibiPdf(pdfDoc, userAux, {
    x: 300,
    y: signatureY - 6,
    boxWidth: 230,
    boxHeight: 64,
  });

  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    await drawTemplateFooter({
      pdfDoc,
      page: pages[i],
      pageNumber: i + 1,
      totalPages: pages.length,
    });
  }

  return pdfDoc;
};

module.exports = {
  sanitizeFileName,
  buildRecibiFileName,
  addSignatureBox,
  addSignatureToPdf,
  generateRecibiPdf,
  addSignatureToRecibiPdf,
  generateReceiptTemplatePdf,
  
};