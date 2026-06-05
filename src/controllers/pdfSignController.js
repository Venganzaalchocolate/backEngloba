// controllers/pdfSignController.js
const { PDFDocument } = require("pdf-lib");
const {
  User,
  Documentation,
  Periods,
  Dispositive,
  Jobs,
} = require("../models/indexModels");

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

const {
  sanitizeFileName,
  buildRecibiFileName,
  addSignatureBox,
  addSignatureToPdf,
  generateRecibiPdf,
  addSignatureToRecibiPdf,
  generateReceiptTemplatePdf,
} = require("../services/pdfGeneratorService");

const {
  getActiveReceiptTemplateForDocumentation,
  validateReceiptAnswers,
  buildReceiptAnswersSnapshot,
} = require("./documentationReceiptTemplateController");

/* ======================================================
   CONFIGURACIÓN GENERAL
====================================================== */

const docTypeConfig = {
  payroll: { emailTitle: "nómina", emailSubject: "Tu código para firmar nómina" },
  contract: { emailTitle: "contrato", emailSubject: "Tu código para firmar contrato" },
  recibi: { emailTitle: "recibí", emailSubject: "Tu código para firmar el recibí" },
};

/* ======================================================
   Genera un código temporal de 6 dígitos para la firma
====================================================== */

const generarCodigoTemporal = () => ("" + Math.floor(Math.random() * 999999)).padStart(6, "0");

/* ======================================================
   Convierte un stream de Drive a Buffer
====================================================== */

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

/* ======================================================
   Busca el nombre de una subcategoría de puesto
   El puesto del periodo siempre apunta a Jobs.subcategories._id
====================================================== */

const findSubcategoryName = (jobs = [], positionId) => {
  if (!positionId) return null;

  const cleanId = String(positionId);

  for (const job of jobs) {
    const sub = (job.subcategories || []).find((s) => String(s._id) === cleanId);
    if (sub?.name) return sub.name;
  }

  return null;
};

/* ======================================================
   Obtiene contexto laboral actual del trabajador:
   dispositivo, puesto de trabajo y centro de trabajo.
   Solo usa el periodo activo vigente en este momento.
====================================================== */

const getEmployeeReceiptContext = async ({ userId, email }) => {
  let user = null;

  if (userId) user = await User.findById(userId).select("_id email").lean();
  if (!user && email) user = await User.findOne({ email }).select("_id email").lean();

  if (!user?._id) {
    return {
      dispositiveName: "—",
      positionName: "—",
      workplaceName: "—",
    };
  }

  const now = new Date();

  const period = await Periods.findOne({
    idUser: user._id,
    active: true,
    startDate: { $lte: now },
    $or: [
      { endDate: null },
      { endDate: { $exists: false } },
      { endDate: { $gte: now } },
    ],
  })
    .sort({ startDate: -1 })
    .lean();

  if (!period) {
    return {
      dispositiveName: "—",
      positionName: "—",
      workplaceName: "—",
    };
  }

  const [dispositive, jobs] = await Promise.all([
    period.dispositiveId
      ? Dispositive.findById(period.dispositiveId)
        .select("name workplaces")
        .populate("workplaces", "name active")
        .lean()
      : null,
    Jobs.find({ "subcategories._id": period.position }).select("name subcategories").lean(),
  ]);

  const positionName = findSubcategoryName(jobs, period.position) || "—";

  let workplaceName = "—";

  if (Array.isArray(dispositive?.workplaces) && dispositive.workplaces.length) {
    const activeWorkplace = dispositive.workplaces.find((w) => w.active !== false) || dispositive.workplaces[0];
    workplaceName = activeWorkplace?.name || "—";
  }

  return {
    dispositiveName: dispositive?.name || "—",
    positionName,
    workplaceName,
  };
};

/* ======================================================
   Solicita código OTP para firmar.
   Si el documento es un recibí con plantilla activa,
   valida y guarda las respuestas en meta.
====================================================== */

const requestSignature = async (req, res) => {
  const { userId, docType, docId, meta } = req.body || {};
  if (!userId || !docType || !docId) throw new ClientError("Parámetros insuficientes", 400);

  const config = docTypeConfig[docType];
  if (!config) throw new ClientError("Tipo de documento no soportado", 400);

  const user = await User.findById(userId);
  if (!user) throw new ClientError("Usuario no encontrado", 404);

  let cleanMeta = meta || {};

  if (docType === "recibi") {
    const template = await getActiveReceiptTemplateForDocumentation(docId);

    if (template) {
      validateReceiptAnswers({
        template,
        answers: cleanMeta.answers || [],
      });

      cleanMeta.answersSnapshot = buildReceiptAnswersSnapshot({
        template,
        answers: cleanMeta.answers || [],
      });
    }
  }

  const otp = await OneTimeCode.findOneAndUpdate(
    { userId, docType, docId },
    {
      $set: {
        code: generarCodigoTemporal(),
        createdAt: new Date(),
        attempts: 0,
        docType,
        docId,
        meta: cleanMeta,
      },
    },
    { upsert: true, new: true }
  );

  if (docType === "recibi") {
    await registerDocumentationAuditSignRequest({
      userId,
      documentationId: docId,
      meta: {
        otpId: otp._id,
        hasAnswers: Array.isArray(cleanMeta.answers) && cleanMeta.answers.length > 0,
      },
    });
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

/* ======================================================
   Confirma el código OTP y genera/sube el documento firmado.
   - payroll/contract: firma sobre PDF existente.
   - recibi sin plantilla: genera recibí normal.
   - recibi con plantilla: genera recibí personalizado.
====================================================== */

const confirmSignature = async (req, res) => {
  const { userId, fileId, code } = req.body || {};
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

  const userAux = await User.findById(userId, {
    dni: 1,
    firstName: 1,
    lastName: 1,
    apafa: 1,
    signature: 1,
  });

  if (!userAux) throw new ClientError("Usuario no encontrado", 404);

  let signedBuffer;
  let mimeType = "application/pdf";
  let folderId = null;
  let generatedFileName = null;
  let documentationAux = null;
  let answersSnapshot = [];

  if (otp.docType === "recibi") {
    documentationAux = await Documentation.findById(otp.docId, {
      name: 1,
      requiresSignature: 1,
      modeloPDF: 1,
      categoryFiles: 1,
    });

    if (!documentationAux) throw new ClientError("Documento de documentación no encontrado", 404);
    if (!documentationAux.requiresSignature) throw new ClientError("Este documento no requiere firma de recibí", 400);

    const fechaRecibi = new Date();
    const documentName = documentationAux.name;
    const template = await getActiveReceiptTemplateForDocumentation(otp.docId);

    if (!template) {
      const canSignResult = await canUserSignDocumentationReceipt({
        userId,
        documentationId: otp.docId,
      });

      if (!canSignResult?.canSign) {
        throw new ClientError("No puedes firmar el recibí sin haber descargado antes el documento oficial.", 400);
      }
    }

    let pdfDocRecibi;

    if (template) {
      validateReceiptAnswers({
        template,
        answers: otp.meta?.answers || [],
      });

      answersSnapshot = buildReceiptAnswersSnapshot({
        template,
        answers: otp.meta?.answers || [],
      });

      const employeeContext = await getEmployeeReceiptContext({ userId });

      pdfDocRecibi = await generateReceiptTemplatePdf({
        userAux,
        documentName,
        template,
        answersSnapshot,
        fechaRecibi,
        isPreview: false,
        employeeContext,
      });
    } else {
      const description = otp.meta?.description || `Conforme a recibido y leído ${documentName}.`;

      pdfDocRecibi = await generateRecibiPdf({
        userAux,
        documentName,
        description,
        fechaRecibi,
        includePrlExtraText: documentationAux?.categoryFiles === "PRL",
      });

      await addSignatureToRecibiPdf(pdfDocRecibi, userAux, {
        y: documentationAux?.categoryFiles === "PRL" ? 98 : 136,
      });
    }

    signedBuffer = Buffer.from(await pdfDocRecibi.save());
    mimeType = "application/pdf";
    folderId = process.env.GOOGLE_DRIVE_RECIBIS;
    generatedFileName = buildRecibiFileName({
      documentName,
      dni: userAux.dni,
      date: fechaRecibi,
    });
  } else {
    const { file: driveFile, stream } = await getFileById(otp.docId);
    const originalBuffer = await streamToBuffer(stream);
    mimeType = driveFile?.mimeType || "application/pdf";
    folderId = driveFile?.parents?.[0] || null;

    let pdfDoc;

    try {
      pdfDoc = await PDFDocument.load(originalBuffer);
    } catch (err) {
      console.error("[confirmSignature] Error al cargar PDF:", err?.message || err);
      throw new ClientError("El PDF original no se pudo leer (posiblemente corrupto).", 400);
    }

    try {
      await addSignatureToPdf(pdfDoc, userAux, {
        boxWidth: 220,
        boxHeight: 70,
        offsetX: 40,
        offsetY: 35,
        opacity: 0.35,
        margin: 6,
      });
    } catch (e) {
      console.error("[confirmSignature] Error al pintar firma:", e?.message || e);
      throw new ClientError("Error al firmar el documento", 500);
    }

    signedBuffer = Buffer.from(await pdfDoc.save());
  }

  const fecha = new Date();

  const signedName =
    otp.docType === "payroll"
      ? `${userAux.dni}_${otp.meta.month}_${otp.meta.year}_signed.pdf`
      : otp.docType === "recibi"
        ? generatedFileName
        : `${userAux.dni}_${fecha.toISOString().slice(0, 10)}_${otp.docType}_signed.pdf`;

  let uploaded;

  try {
    uploaded = await uploadFileToDrive(
      { buffer: signedBuffer, mimetype: mimeType },
      folderId,
      signedName
    );
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
      {
        $set: {
          "payrolls.$.sign": uploaded.id,
          "payrolls.$.datetimeSign": dateInSpain,
        },
      },
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
      meta: {
        fileName: signedName,
        answersSnapshot,
      },
    });

    return response(res, 200, {
      message: "Recibí firmado correctamente",
      data: attachResult.updatedUser,
    });
  }

  if (otp.docType === "contract") {
    return response(res, 200, {
      message: "Contrato firmado correctamente",
      data: { id: uploaded.id },
    });
  }

  return response(res, 200, {
    message: "Documento firmado correctamente",
    data: { id: uploaded.id },
  });
};

/* ======================================================
   Genera una vista previa PDF de una plantilla de recibí.
   Usa como usuario de prueba a hermes.conrad@engloba.org.es.
====================================================== */

const previewReceiptTemplate = async (req, res) => {
  const { documentationId, answers } = req.body || {};
  if (!documentationId) throw new ClientError("Falta documentationId", 400);

  const template = await getActiveReceiptTemplateForDocumentation(documentationId);
  if (!template) throw new ClientError("Este documento no tiene plantilla activa", 404);

  const documentationAux = await Documentation.findById(documentationId, { name: 1 }).lean();
  if (!documentationAux) throw new ClientError("Documento de documentación no encontrado", 404);

  const fakeAnswers = Array.isArray(answers) && answers.length
    ? answers
    : (template.questions || []).map((q) => ({
        key: q.key,
        answer: q.blocksSignatureIfAnswer === "yes" ? "no" : "yes",
      }));

  validateReceiptAnswers({
    template,
    answers: fakeAnswers,
  });

  const answersSnapshot = buildReceiptAnswersSnapshot({
    template,
    answers: fakeAnswers,
  });

  const previewUser = await User.findOne({ email: "hermes.conrad@engloba.org.es" })
    .select("dni firstName lastName apafa signature email")
    .lean();

  const userAux = previewUser || {
    firstName: "Hermes",
    lastName: "Conrad",
    dni: "00000000T",
    apafa: false,
    signature: { strokes: [] },
  };

  const employeeContext = await getEmployeeReceiptContext({
    userId: previewUser?._id,
    email: "hermes.conrad@engloba.org.es",
  });

  const fechaRecibi = new Date();

  const pdfDoc = await generateReceiptTemplatePdf({
    userAux,
    documentName: documentationAux.name,
    template,
    answersSnapshot,
    fechaRecibi,
    isPreview: true,
    employeeContext,
  });

  const buffer = Buffer.from(await pdfDoc.save());
  const fileName = `preview_recibi_${sanitizeFileName(documentationAux.name)}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
};

module.exports = {
  requestSignature: catchAsync(requestSignature),
  confirmSignature: catchAsync(confirmSignature),
  previewReceiptTemplate: catchAsync(previewReceiptTemplate),
  addSignatureBox,
};