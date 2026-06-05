// controllers/documentationReceiptTemplateController.js

const mongoose = require('mongoose');

const {
  Documentation,
  DocumentationReceiptTemplate,
} = require('../models/indexModels');

const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* ======================================================
   HELPERS GENERALES
   ====================================================== */

/**
 * Valida que un valor sea un ObjectId válido de MongoDB.
 *
 * Lo usamos antes de hacer consultas con IDs para evitar errores de Mongoose
 * y devolver un error controlado.
 */
const toId = (v, fieldName = 'id') => {
  if (!v || !mongoose.Types.ObjectId.isValid(v)) {
    throw new ClientError(`${fieldName} no es un ObjectId válido`, 400);
  }

  return new mongoose.Types.ObjectId(v);
};

/**
 * Convierte valores tipo true/false que puedan venir como string.
 *
 * Ejemplos:
 * - true       -> true
 * - 'true'    -> true
 * - false      -> false
 * - 'false'   -> false
 *
 * Si no reconoce el valor, devuelve undefined.
 */
const parseBool = (v) => {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
};

/**
 * Limpia textos básicos.
 *
 * Evita guardar null, undefined o strings con espacios innecesarios.
 */
const cleanText = (v) => String(v || '').trim();

/**
 * Normaliza respuestas de sí/no.
 *
 * La idea es que internamente guardemos siempre:
 * - yes
 * - no
 *
 * Aunque el front enviara "sí", "si", true, "1", etc.
 */
const normalizeAnswer = (answer) => {
  const value = String(answer || '').trim().toLowerCase();

  if (['yes', 'si', 'sí', 'true', '1'].includes(value)) return 'yes';
  if (['no', 'false', '0'].includes(value)) return 'no';

  return value;
};

/**
 * Genera una key segura para cada pregunta.
 *
 * Ejemplo:
 * "¿Has leído el documento?" -> "has_leido_el_documento"
 *
 * La key sirve para relacionar una respuesta con su pregunta.
 */
const normalizeQuestionKey = (key) =>
  String(key || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-\s]/g, '')
    .replace(/\s+/g, '_');

/**
 * Valida y normaliza todas las preguntas antes de guardarlas.
 *
 * Comprueba:
 * - que questions sea una lista,
 * - que cada pregunta tenga key válida,
 * - que cada pregunta tenga label,
 * - que no haya keys repetidas,
 * - que blocksSignatureIfAnswer sea yes/no/null.
 */
const normalizeQuestions = (questions = []) => {
  if (!Array.isArray(questions)) {
    throw new ClientError('questions debe ser una lista', 400);
  }

  const usedKeys = new Set();

  return questions.map((q, index) => {
    /**
     * Si el front no manda key, intentamos generarla desde el label.
     * Esto hace más cómodo el formulario de administración.
     */
    const key = normalizeQuestionKey(q.key || q.label);

    if (!key) {
      throw new ClientError(`La pregunta ${index + 1} no tiene key válida`, 400);
    }

    if (usedKeys.has(key)) {
      throw new ClientError(`La key "${key}" está repetida`, 400);
    }

    usedKeys.add(key);

    const label = cleanText(q.label);

    if (!label) {
      throw new ClientError(`La pregunta "${key}" no tiene label`, 400);
    }

    /**
     * Respuesta que bloquea la firma.
     *
     * Ejemplo:
     * Si blocksSignatureIfAnswer = 'no',
     * y el trabajador responde 'no',
     * no se permite continuar.
     */
    const blocksSignatureIfAnswer = q.blocksSignatureIfAnswer
      ? normalizeAnswer(q.blocksSignatureIfAnswer)
      : null;

    if (
      blocksSignatureIfAnswer &&
      !['yes', 'no'].includes(blocksSignatureIfAnswer)
    ) {
      throw new ClientError(
        `blocksSignatureIfAnswer inválido en la pregunta "${label}"`,
        400
      );
    }

    return {
      key,
      label,

      /**
       * Por ahora solo contemplamos preguntas de sí/no.
       * Lo dejamos como campo por si más adelante quieres meter otros tipos.
       */
      type: q.type || 'yesno',

      /**
       * Si no se indica lo contrario, la pregunta será obligatoria.
       */
      required: q.required !== false,

      /**
       * Texto que se incorporará al PDF si responde "sí".
       */
      yesText: cleanText(q.yesText),

      /**
       * Texto que se incorporará al PDF si responde "no".
       */
      noText: cleanText(q.noText),

      /**
       * Si esta respuesta bloquea la firma.
       * Puede ser:
       * - 'yes'
       * - 'no'
       * - null
       */
      blocksSignatureIfAnswer,

      /**
       * Mensaje que se mostrará si esa respuesta bloquea la firma.
       */
      blockMessage: cleanText(q.blockMessage),

      /**
       * Orden visual de las preguntas.
       */
      order: Number.isFinite(Number(q.order)) ? Number(q.order) : index + 1,
    };
  });
};

/**
 * Limpia y prepara el body antes de crear o actualizar una plantilla.
 *
 * partial = false:
 * - usado al crear/upsert completo,
 * - procesa todos los campos principales.
 *
 * partial = true:
 * - usado al actualizar,
 * - solo procesa los campos que vengan en req.body.
 */
const sanitizeTemplatePayload = (body = {}, partial = false) => {
  const payload = {};

  if (!partial || body.documentationId !== undefined) {
    payload.documentationId = toId(body.documentationId, 'documentationId');
  }

  if (!partial || body.active !== undefined) {
    payload.active = body.active !== false;
  }

  if (!partial || body.title !== undefined) {
    payload.title = cleanText(body.title) || 'Declaración responsable';
  }

  if (!partial || body.introText !== undefined) {
    payload.introText = cleanText(body.introText);
  }

  if (!partial || body.finalText !== undefined) {
    payload.finalText =
      cleanText(body.finalText) ||
      'Y para que así conste, firma digitalmente el presente recibí.';
  }

  if (!partial || body.questions !== undefined) {
    payload.questions = normalizeQuestions(body.questions || []);
  }

  return payload;
};

/* ======================================================
   HELPERS PARA EL FLUJO DE FIRMA
   Estos helpers los usará pdfSignController.
   ====================================================== */

/**
 * Busca la plantilla activa asociada a un documento.
 *
 * Si devuelve null, significa que ese documento NO tiene flujo nuevo
 * de preguntas y debe seguir funcionando con el recibí simple actual.
 */
const getActiveReceiptTemplateForDocumentation = async (documentationId) => {
  return DocumentationReceiptTemplate.findOne({
    documentationId: toId(documentationId, 'documentationId'),
    active: true,
  }).lean();
};

/**
 * Valida las respuestas del trabajador.
 *
 * Comprueba:
 * - que answers sea una lista,
 * - que estén respondidas las preguntas obligatorias,
 * - que las respuestas sean yes/no,
 * - que no haya respuestas que bloqueen la firma.
 *
 * Esta función debe usarse en backend aunque el front ya valide,
 * porque el front se puede manipular.
 */
const validateReceiptAnswers = ({ template, answers = [] }) => {
  /**
   * Si no hay plantilla, no hay nada que validar.
   * Esto mantiene el flujo antiguo intacto.
   */
  if (!template) return true;

  if (!Array.isArray(answers)) {
    throw new ClientError('answers debe ser una lista', 400);
  }

  const answerMap = new Map(
    answers.map((a) => [String(a.key), normalizeAnswer(a.answer)])
  );

  const questions = [...(template.questions || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

  for (const question of questions) {
    const answer = answerMap.get(question.key);

    if (question.required && !answer) {
      throw new ClientError(`Falta responder: ${question.label}`, 400);
    }

    if (answer && !['yes', 'no'].includes(answer)) {
      throw new ClientError(`Respuesta inválida en: ${question.label}`, 400);
    }

    if (
      question.blocksSignatureIfAnswer &&
      answer === question.blocksSignatureIfAnswer
    ) {
      throw new ClientError(
        question.blockMessage ||
          'No puedes firmar este documento con las respuestas indicadas.',
        400
      );
    }
  }

  return true;
};

/**
 * Crea una copia fija de las respuestas usadas.
 *
 * Esto es importante para auditoría:
 * aunque mañana cambies la plantilla, podrás saber qué pregunta se hizo,
 * qué respondió la persona y qué texto se aplicó en el PDF firmado.
 */
const buildReceiptAnswersSnapshot = ({ template, answers = [] }) => {
  if (!template) return [];

  const answerMap = new Map(
    answers.map((a) => [String(a.key), normalizeAnswer(a.answer)])
  );

  const questions = [...(template.questions || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

  return questions.map((question) => {
    const answer = answerMap.get(question.key);

    const textApplied =
      answer === 'yes'
        ? question.yesText || ''
        : answer === 'no'
          ? question.noText || ''
          : '';

    return {
      key: question.key,
      question: question.label,
      answer,
      textApplied,
    };
  });
};

/**
 * Construye el texto final que se meterá en el PDF de recibí.
 *
 * Usa:
 * - introText de la plantilla,
 * - yesText/noText según respuestas,
 * - finalText.
 *
 * Si no hay plantilla, devuelve el texto simple actual para mantener compatibilidad.
 */
const buildReceiptDescriptionFromAnswers = ({
  template,
  answers = [],
  documentName,
}) => {
  if (!template) {
    return `Conforme a recibido y leído ${documentName}.`;
  }

  const snapshot = buildReceiptAnswersSnapshot({ template, answers });

  const lines = [];

  if (template.introText) {
    lines.push(template.introText);
  } else {
    lines.push(
      `En relación con el documento "${documentName}", la persona trabajadora declara lo siguiente:`
    );
  }

  snapshot.forEach((item) => {
    if (item.textApplied) lines.push(item.textApplied);
  });

  if (template.finalText) {
    lines.push(template.finalText);
  }

  return lines.filter(Boolean).join('\n\n');
};

/* ======================================================
   ENDPOINTS API - ADMINISTRACIÓN
   ====================================================== */

/**
 * Lista plantillas de recibí.
 *
 * Uso típico:
 * pantalla de administración donde ves todas las plantillas.
 *
 * Filtros disponibles:
 * - q: búsqueda por título o nombre del documento,
 * - active: true/false,
 * - documentationId: buscar la plantilla de un documento,
 * - page,
 * - limit.
 */
const listDocumentationReceiptTemplates = async (req, res) => {
  const {
    q = '',
    active,
    documentationId,
    page = 1,
    limit = 20,
  } = req.body || {};

  const filter = {};

  const parsedActive = parseBool(active);
  if (parsedActive !== undefined) filter.active = parsedActive;

  if (documentationId) {
    filter.documentationId = toId(documentationId, 'documentationId');
  }

  /**
   * Si hay búsqueda por texto:
   * - busca en el título de la plantilla,
   * - y también busca documentos cuyo name coincida.
   */
  if (q) {
    const docs = await Documentation.find({
      name: { $regex: String(q).trim(), $options: 'i' },
    })
      .select('_id')
      .lean();

    filter.$or = [
      { title: { $regex: String(q).trim(), $options: 'i' } },
      { documentationId: { $in: docs.map((d) => d._id) } },
    ];
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    DocumentationReceiptTemplate.find(filter)
      .populate('documentationId', 'name model categoryFiles requiresSignature visible')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    DocumentationReceiptTemplate.countDocuments(filter),
  ]);

  response(res, 200, {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    pages: Math.ceil(total / safeLimit),
  });
};

/**
 * Obtiene una plantilla por su _id.
 *
 * Uso típico:
 * abrir una plantilla concreta para editarla.
 */
const getDocumentationReceiptTemplateById = async (req, res) => {
  const { templateId } = req.body || {};

  const item = await DocumentationReceiptTemplate.findById(
    toId(templateId, 'templateId')
  )
    .populate('documentationId', 'name model categoryFiles requiresSignature visible')
    .lean();

  if (!item) throw new ClientError('Plantilla no encontrada', 404);

  response(res, 200, item);
};

/**
 * Obtiene la plantilla asociada a un documento concreto.
 *
 * Uso típico:
 * desde la ficha de un documento de Documentation,
 * comprobar si tiene plantilla configurada.
 */
const getDocumentationReceiptTemplateByDocumentation = async (req, res) => {
  const { documentationId, onlyActive = false } = req.body || {};

  const filter = {
    documentationId: toId(documentationId, 'documentationId'),
  };

  if (onlyActive === true || onlyActive === 'true') {
    filter.active = true;
  }

  const item = await DocumentationReceiptTemplate.findOne(filter)
    .populate('documentationId', 'name model categoryFiles requiresSignature visible')
    .lean();

  /**
   * Devuelve null si no existe.
   * Esto es útil para que el front pueda saber que aún no hay plantilla.
   */
  response(res, 200, item || null);
};

/**
 * Devuelve las preguntas activas que debe responder el trabajador
 * antes de firmar un recibí.
 *
 * Importante:
 * NO devuelve yesText ni noText.
 *
 * Motivo:
 * el texto legal final debe construirlo el backend,
 * no el front.
 */
const getActiveReceiptQuestionsByDocumentation = async (req, res) => {
  const { documentationId } = req.body || {};

  const template = await getActiveReceiptTemplateForDocumentation(documentationId);

  if (!template) {
    return response(res, 200, {
      hasTemplate: false,
      template: null,
      questions: [],
    });
  }

  const questions = [...(template.questions || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type,
      required: q.required,
      order: q.order,
    }));

  response(res, 200, {
    hasTemplate: true,
    template: {
      _id: template._id,
      title: template.title,
      introText: template.introText,
    },
    questions,
  });
};

/**
 * Crea una plantilla nueva.
 *
 * Si el documento ya tiene plantilla, devuelve error.
 *
 * Para formularios donde no sabes si existe o no,
 * probablemente sea más cómodo usar upsertDocumentationReceiptTemplate.
 */
const createDocumentationReceiptTemplate = async (req, res) => {
  const payload = sanitizeTemplatePayload(req.body);

  const documentation = await Documentation.findById(payload.documentationId)
    .select('_id name requiresSignature')
    .lean();

  if (!documentation) {
    throw new ClientError('Documento de documentación no encontrado', 404);
  }

  const exists = await DocumentationReceiptTemplate.findOne({
    documentationId: payload.documentationId,
  }).lean();

  if (exists) {
    throw new ClientError(
      'Este documento ya tiene una plantilla de recibí. Usa actualizar.',
      409
    );
  }

  const created = await DocumentationReceiptTemplate.create(payload);

  response(res, 201, created);
};

/**
 * Crea o actualiza una plantilla según documentationId.
 *
 * Si no existe plantilla para ese documento:
 * - la crea.
 *
 * Si ya existe:
 * - la actualiza.
 *
 * Es el endpoint más cómodo para el panel de administración.
 */
const upsertDocumentationReceiptTemplate = async (req, res) => {
  const payload = sanitizeTemplatePayload(req.body);

  const documentation = await Documentation.findById(payload.documentationId)
    .select('_id name requiresSignature')
    .lean();

  if (!documentation) {
    throw new ClientError('Documento de documentación no encontrado', 404);
  }

  const updated = await DocumentationReceiptTemplate.findOneAndUpdate(
    { documentationId: payload.documentationId },
    { $set: payload },
    { new: true, upsert: true, runValidators: true }
  ).populate('documentationId', 'name model categoryFiles requiresSignature visible');

  response(res, 200, updated);
};

/**
 * Actualiza una plantilla existente por su templateId.
 *
 * No permite cambiar documentationId para evitar mover accidentalmente
 * una plantilla de un documento a otro.
 */
const updateDocumentationReceiptTemplate = async (req, res) => {
  const { templateId } = req.body || {};

  const payload = sanitizeTemplatePayload(req.body, true);

  /**
   * Bloqueamos el cambio de documentationId en updates parciales.
   * Si quieres cambiar de documento, mejor borrar y crear otra plantilla.
   */
  delete payload.documentationId;

  const updated = await DocumentationReceiptTemplate.findByIdAndUpdate(
    toId(templateId, 'templateId'),
    { $set: payload },
    { new: true, runValidators: true }
  ).populate('documentationId', 'name model categoryFiles requiresSignature visible');

  if (!updated) throw new ClientError('Plantilla no encontrada', 404);

  response(res, 200, updated);
};

/**
 * Activa o desactiva una plantilla.
 *
 * Si active = false:
 * - el documento deja de usar preguntas,
 * - vuelve al recibí simple actual,
 * - no se pierden auditorías ni recibís antiguos.
 */
const toggleDocumentationReceiptTemplate = async (req, res) => {
  const { templateId, active } = req.body || {};

  const parsedActive = parseBool(active);

  if (parsedActive === undefined) {
    throw new ClientError('Debes indicar active true/false', 400);
  }

  const updated = await DocumentationReceiptTemplate.findByIdAndUpdate(
    toId(templateId, 'templateId'),
    { $set: { active: parsedActive } },
    { new: true, runValidators: true }
  ).populate('documentationId', 'name model categoryFiles requiresSignature visible');

  if (!updated) throw new ClientError('Plantilla no encontrada', 404);

  response(res, 200, updated);
};

/**
 * Elimina una plantilla.
 *
 * Importante:
 * solo elimina la configuración futura.
 *
 * No elimina:
 * - recibís ya firmados,
 * - auditorías,
 * - archivos de Drive,
 * - eventos de firma.
 */
const deleteDocumentationReceiptTemplate = async (req, res) => {
  const { templateId } = req.body || {};

  const deleted = await DocumentationReceiptTemplate.findByIdAndDelete(
    toId(templateId, 'templateId')
  );

  if (!deleted) throw new ClientError('Plantilla no encontrada', 404);

  response(res, 200, {
    message: 'Plantilla eliminada correctamente',
    deletedId: deleted._id,
  });
};

/* ======================================================
   ENDPOINT API - VALIDACIÓN PREVIA DE RESPUESTAS
   ====================================================== */

/**
 * Valida las respuestas antes de pedir el código OTP.
 *
 * Uso recomendado en front:
 *
 * 1. El trabajador pulsa firmar.
 * 2. El front llama a getActiveReceiptQuestionsByDocumentation.
 * 3. Si hay preguntas, las muestra.
 * 4. El trabajador responde.
 * 5. El front llama a postValidateReceiptAnswers.
 * 6. Si todo está bien, entonces llama a requestSignature.
 *
 * Aunque exista este endpoint, también hay que validar dentro de requestSignature,
 * porque el usuario podría saltarse la validación del front.
 */
const postValidateReceiptAnswers = async (req, res) => {
  const { documentationId, answers = [] } = req.body || {};

  const template = await getActiveReceiptTemplateForDocumentation(documentationId);

  /**
   * Si el documento no tiene plantilla activa,
   * significa que puede seguir con el recibí simple.
   */
  if (!template) {
    return response(res, 200, {
      hasTemplate: false,
      valid: true,
      snapshot: [],
      description: null,
    });
  }

  validateReceiptAnswers({ template, answers });

  const documentation = await Documentation.findById(documentationId)
    .select('name')
    .lean();

  const snapshot = buildReceiptAnswersSnapshot({ template, answers });

  const description = buildReceiptDescriptionFromAnswers({
    template,
    answers,
    documentName: documentation?.name || 'Documento',
  });

  response(res, 200, {
    hasTemplate: true,
    valid: true,
    snapshot,
    description,
  });
};

/* ======================================================
   EXPORTS
   ====================================================== */

module.exports = {
  /**
   * Endpoints para rutas Express.
   */
  listDocumentationReceiptTemplates: catchAsync(listDocumentationReceiptTemplates),
  getDocumentationReceiptTemplateById: catchAsync(getDocumentationReceiptTemplateById),
  getDocumentationReceiptTemplateByDocumentation: catchAsync(getDocumentationReceiptTemplateByDocumentation),
  getActiveReceiptQuestionsByDocumentation: catchAsync(getActiveReceiptQuestionsByDocumentation),
  createDocumentationReceiptTemplate: catchAsync(createDocumentationReceiptTemplate),
  upsertDocumentationReceiptTemplate: catchAsync(upsertDocumentationReceiptTemplate),
  updateDocumentationReceiptTemplate: catchAsync(updateDocumentationReceiptTemplate),
  toggleDocumentationReceiptTemplate: catchAsync(toggleDocumentationReceiptTemplate),
  deleteDocumentationReceiptTemplate: catchAsync(deleteDocumentationReceiptTemplate),
  postValidateReceiptAnswers: catchAsync(postValidateReceiptAnswers),

  /**
   * Helpers para usar desde pdfSignController.
   *
   * No llevan catchAsync porque no son endpoints directos.
   */
  getActiveReceiptTemplateForDocumentation,
  validateReceiptAnswers,
  buildReceiptAnswersSnapshot,
  buildReceiptDescriptionFromAnswers,
};