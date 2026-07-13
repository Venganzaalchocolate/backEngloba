// controllers/documentationReceiptTemplateController.js

const mongoose = require('mongoose');

const {
  Documentation,
  DocumentationReceiptTemplate,
} = require('../models/indexModels');

const { catchAsync, response, ClientError } = require('../utils/indexUtils');

/* ======================================================
   HELPERS
   ====================================================== */

const toId = (value, fieldName = 'id') => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ClientError(`${fieldName} no es un ObjectId válido`, 400);
  }

  return new mongoose.Types.ObjectId(value);
};

const parseBool = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;

  return undefined;
};

const cleanText = (value) => String(value || '').trim();

const normalizeAnswer = (answer) => {
  const value = cleanText(answer).toLowerCase();

  if (['yes', 'si', 'sí', 'true', '1'].includes(value)) return 'yes';
  if (['no', 'false', '0'].includes(value)) return 'no';

  return value;
};

const normalizeQuestionKey = (key) =>
  cleanText(key)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-\s]/g, '')
    .replace(/\s+/g, '_');

const normalizeBlocks = (blocks = []) => {
  if (!Array.isArray(blocks)) {
    throw new ClientError('blocks debe ser una lista', 400);
  }

  const usedKeys = new Set();

  return blocks.map((block, index) => {
    const type = cleanText(
      block?.type || 'yesno'
    ).toLowerCase();

    const order = Number.isFinite(Number(block?.order))
      ? Number(block.order)
      : index + 1;

    if (!['yesno', 'text', 'note'].includes(type)) {
      throw new ClientError(
        `Tipo de bloque inválido en la posición ${index + 1}`,
        400
      );
    }

    /*
     * Texto informativo o nota.
     */
    if (type === 'text' || type === 'note') {
      const label = cleanText(block.label);
      const content = cleanText(block.content);

      if (type === 'text' && !label) {
        throw new ClientError(
          `El bloque de texto ${index + 1} no tiene título`,
          400
        );
      }

      if (!content) {
        throw new ClientError(
          `El bloque ${index + 1} no tiene contenido`,
          400
        );
      }

      return {
        type,
        label: type === 'text' ? label : '',
        content,
        order,
      };
    }

    /*
     * Pregunta Sí/No.
     */
    const key = normalizeQuestionKey(
      block.key || block.label
    );

    const label = cleanText(block.label);

    if (!key) {
      throw new ClientError(
        `La pregunta ${index + 1} no tiene key válida`,
        400
      );
    }

    if (!label) {
      throw new ClientError(
        `La pregunta ${index + 1} no tiene texto`,
        400
      );
    }

    if (usedKeys.has(key)) {
      throw new ClientError(
        `La key "${key}" está repetida`,
        400
      );
    }

    usedKeys.add(key);

    const blocksSignatureIfAnswer =
      block.blocksSignatureIfAnswer
        ? normalizeAnswer(
            block.blocksSignatureIfAnswer
          )
        : null;

    if (
      blocksSignatureIfAnswer &&
      !['yes', 'no'].includes(
        blocksSignatureIfAnswer
      )
    ) {
      throw new ClientError(
        `Respuesta de bloqueo inválida en "${label}"`,
        400
      );
    }

    const parsedRequired = parseBool(
      block.required
    );

    return {
      type: 'yesno',
      key,
      label,
      required:
        parsedRequired === undefined
          ? block.required !== 'no'
          : parsedRequired,
      yesText: cleanText(block.yesText),
      noText: cleanText(block.noText),
      blocksSignatureIfAnswer,
      blockMessage: cleanText(
        block.blockMessage
      ),
      order,
    };
  });
};

const getTemplateBlocks = (template) => {
  if (!template) return [];

  const blocks = template.blocks?.length
    ? template.blocks
    : (template.questions || []).map((question) => ({
        ...question,
        type: 'yesno',
      }));

  return [...blocks].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );
};

const blocksToQuestions = (blocks = []) =>
  blocks
    .filter((block) => block.type === 'yesno')
    .map((block) => ({
      key: block.key,
      label: block.label,
      type: 'yesno',
      required: block.required !== false,
      yesText: block.yesText || '',
      noText: block.noText || '',
      blocksSignatureIfAnswer:
        block.blocksSignatureIfAnswer || null,
      blockMessage: block.blockMessage || '',
      order: block.order || 0,
    }));

/* ======================================================
   NORMALIZACIÓN DEL BODY
   ====================================================== */

const sanitizeTemplatePayload = (body = {}, partial = false) => {
  const payload = {};

  if (!partial || body.documentationId !== undefined) {
    payload.documentationId = toId(
      body.documentationId,
      'documentationId'
    );
  }

  if (!partial || body.active !== undefined) {
    const parsedActive = parseBool(body.active);

    payload.active =
      parsedActive === undefined
        ? body.active !== false
        : parsedActive;
  }

  if (!partial || body.title !== undefined) {
    payload.title =
      cleanText(body.title) || 'Declaración responsable';
  }

  if (!partial || body.introText !== undefined) {
    payload.introText = cleanText(body.introText);
  }

  if (!partial || body.finalText !== undefined) {
    payload.finalText =
      cleanText(body.finalText) ||
      'Y para que así conste, firma digitalmente el presente documento.';
  }

  if (
    !partial ||
    body.blocks !== undefined ||
    body.questions !== undefined
  ) {
    const sourceBlocks =
      body.blocks !== undefined
        ? body.blocks
        : (body.questions || []).map((question) => ({
            ...question,
            type: 'yesno',
          }));

    const blocks = normalizeBlocks(sourceBlocks);

    payload.blocks = blocks;

    // Compatibilidad temporal con el sistema antiguo.
    payload.questions = blocksToQuestions(blocks);
  }

  return payload;
};

/* ======================================================
   HELPERS PARA FIRMA
   ====================================================== */

const getActiveReceiptTemplateForDocumentation = async (
  documentationId
) => {
  const template = await DocumentationReceiptTemplate.findOne({
    documentationId: toId(
      documentationId,
      'documentationId'
    ),
    active: true,
  }).lean();

  if (!template) return null;

  return {
    ...template,
    blocks: getTemplateBlocks(template),
  };
};

const validateReceiptAnswers = ({
  template,
  answers = [],
}) => {
  if (!template) return true;

  if (!Array.isArray(answers)) {
    throw new ClientError('answers debe ser una lista', 400);
  }

  const answerMap = new Map(
    answers.map((item) => [
      String(item.key),
      normalizeAnswer(item.answer),
    ])
  );

  const questions = getTemplateBlocks(template).filter(
    (block) => block.type === 'yesno'
  );

  for (const question of questions) {
    const answer = answerMap.get(question.key);

    if (question.required && !answer) {
      throw new ClientError(
        `Falta responder: ${question.label}`,
        400
      );
    }

    if (answer && !['yes', 'no'].includes(answer)) {
      throw new ClientError(
        `Respuesta inválida en: ${question.label}`,
        400
      );
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

const buildReceiptAnswersSnapshot = ({
  template,
  answers = [],
}) => {
  if (!template) return [];

  const answerMap = new Map(
    answers.map((item) => [
      String(item.key),
      normalizeAnswer(item.answer),
    ])
  );

  const questions = getTemplateBlocks(template).filter(
    (block) => block.type === 'yesno'
  );

  return questions
    .map((question) => {
      const answer = answerMap.get(question.key);

      if (!answer) return null;

      return {
        key: question.key,
        question: question.label,
        answer,
        textApplied:
          answer === 'yes'
            ? question.yesText || ''
            : question.noText || '',
      };
    })
    .filter(Boolean);
};

const buildReceiptDescriptionFromAnswers = ({
  template,
  answers = [],
  documentName,
}) => {
  if (!template) {
    return `Conforme a recibido y leído ${documentName}.`;
  }

  const snapshot = buildReceiptAnswersSnapshot({
    template,
    answers,
  });

  const answersByKey = new Map(
    snapshot.map((item) => [item.key, item])
  );

  const lines = [];

  if (template.introText) {
    lines.push(template.introText);
  } else {
    lines.push(
      `En relación con el documento "${documentName}", la persona trabajadora declara lo siguiente:`
    );
  }

  for (const block of getTemplateBlocks(template)) {
    if (block.type === 'text') {
      if (block.content) lines.push(block.content);
      continue;
    }

    if (block.type === 'note') {
      if (block.content) {
        lines.push(`Nota: ${block.content}`);
      }

      continue;
    }

    const answer = answersByKey.get(block.key);

    if (answer?.textApplied) {
      lines.push(answer.textApplied);
    }
  }

  if (template.finalText) {
    lines.push(template.finalText);
  }

  return lines.filter(Boolean).join('\n\n');
};

/* ======================================================
   LISTADO
   ====================================================== */

const listDocumentationReceiptTemplates = async (
  req,
  res
) => {
  const {
    q = '',
    active,
    documentationId,
    page = 1,
    limit = 20,
  } = req.body || {};

  const filter = {};

  const parsedActive = parseBool(active);

  if (parsedActive !== undefined) {
    filter.active = parsedActive;
  }

  if (documentationId) {
    filter.documentationId = toId(
      documentationId,
      'documentationId'
    );
  }

  if (q) {
    const search = cleanText(q);

    const documents = await Documentation.find({
      name: {
        $regex: search,
        $options: 'i',
      },
    })
      .select('_id')
      .lean();

    filter.$or = [
      {
        title: {
          $regex: search,
          $options: 'i',
        },
      },
      {
        documentationId: {
          $in: documents.map((document) => document._id),
        },
      },
    ];
  }

  const safePage = Math.max(Number(page) || 1, 1);

  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    DocumentationReceiptTemplate.find(filter)
      .populate(
        'documentationId',
        'name model categoryFiles requiresSignature visible'
      )
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    DocumentationReceiptTemplate.countDocuments(filter),
  ]);

  response(res, 200, {
    items: items.map((item) => ({
      ...item,
      blocks: getTemplateBlocks(item),
    })),
    page: safePage,
    limit: safeLimit,
    total,
    pages: Math.ceil(total / safeLimit),
  });
};

/* ======================================================
   OBTENER PLANTILLA
   ====================================================== */

const getDocumentationReceiptTemplateById = async (
  req,
  res
) => {
  const { templateId } = req.body || {};

  const item = await DocumentationReceiptTemplate.findById(
    toId(templateId, 'templateId')
  )
    .populate(
      'documentationId',
      'name model categoryFiles requiresSignature visible'
    )
    .lean();

  if (!item) {
    throw new ClientError('Plantilla no encontrada', 404);
  }

  response(res, 200, {
    ...item,
    blocks: getTemplateBlocks(item),
  });
};

const getDocumentationReceiptTemplateByDocumentation =
  async (req, res) => {
    const {
      documentationId,
      onlyActive = false,
    } = req.body || {};

    const filter = {
      documentationId: toId(
        documentationId,
        'documentationId'
      ),
    };

    if (
      onlyActive === true ||
      onlyActive === 'true'
    ) {
      filter.active = true;
    }

    const item =
      await DocumentationReceiptTemplate.findOne(filter)
        .populate(
          'documentationId',
          'name model categoryFiles requiresSignature visible'
        )
        .lean();

    if (!item) {
      return response(res, 200, null);
    }

    response(res, 200, {
      ...item,
      blocks: getTemplateBlocks(item),
    });
  };

/* ======================================================
   OBTENER BLOQUES PARA FIRMA
   ====================================================== */

const getActiveReceiptQuestionsByDocumentation = async (
  req,
  res
) => {
  const { documentationId } = req.body || {};

  const template =
    await getActiveReceiptTemplateForDocumentation(
      documentationId
    );

  if (!template) {
    return response(res, 200, {
      hasTemplate: false,
      template: null,
      blocks: [],
      questions: [],
    });
  }

  const blocks = getTemplateBlocks(template).map(
    (block) => {
      if (
        block.type === 'text' ||
        block.type === 'note'
      ) {
        return {
          type: block.type,
          label: block.label || '',
          content: block.content,
          order: block.order,
        };
      }

      return {
        type: 'yesno',
        key: block.key,
        label: block.label,
        required: block.required,
        order: block.order,
      };
    }
  );

  response(res, 200, {
    hasTemplate: true,

    template: {
      _id: template._id,
      title: template.title,
      introText: template.introText,
      finalText: template.finalText,
    },

    blocks,

    questions: blocks.filter(
      (block) => block.type === 'yesno'
    ),
  });
};

/* ======================================================
   CREAR
   ====================================================== */

const createDocumentationReceiptTemplate = async (
  req,
  res
) => {
  const payload = sanitizeTemplatePayload(req.body);

  const documentation = await Documentation.findById(
    payload.documentationId
  )
    .select('_id name requiresSignature')
    .lean();

  if (!documentation) {
    throw new ClientError(
      'Documento de documentación no encontrado',
      404
    );
  }

  const exists =
    await DocumentationReceiptTemplate.findOne({
      documentationId: payload.documentationId,
    }).lean();

  if (exists) {
    throw new ClientError(
      'Este documento ya tiene una plantilla de recibí. Usa actualizar.',
      409
    );
  }

  const created =
    await DocumentationReceiptTemplate.create(payload);

  await created.populate(
    'documentationId',
    'name model categoryFiles requiresSignature visible'
  );

  const item = created.toObject();

  response(res, 201, {
    ...item,
    blocks: getTemplateBlocks(item),
  });
};

/* ======================================================
   CREAR O ACTUALIZAR
   ====================================================== */

const upsertDocumentationReceiptTemplate = async (
  req,
  res
) => {
  const payload = sanitizeTemplatePayload(req.body);

  const documentation = await Documentation.findById(
    payload.documentationId
  )
    .select('_id name requiresSignature')
    .lean();

  if (!documentation) {
    throw new ClientError(
      'Documento de documentación no encontrado',
      404
    );
  }

  const updated =
    await DocumentationReceiptTemplate.findOneAndUpdate(
      {
        documentationId: payload.documentationId,
      },
      {
        $set: payload,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    ).populate(
      'documentationId',
      'name model categoryFiles requiresSignature visible'
    );

  const item = updated.toObject();

  response(res, 200, {
    ...item,
    blocks: getTemplateBlocks(item),
  });
};

/* ======================================================
   ACTUALIZAR
   ====================================================== */

const updateDocumentationReceiptTemplate = async (
  req,
  res
) => {
  const { templateId } = req.body || {};

  const payload = sanitizeTemplatePayload(
    req.body,
    true
  );

  delete payload.documentationId;

  const updated =
    await DocumentationReceiptTemplate.findByIdAndUpdate(
      toId(templateId, 'templateId'),
      {
        $set: payload,
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate(
      'documentationId',
      'name model categoryFiles requiresSignature visible'
    );

  if (!updated) {
    throw new ClientError('Plantilla no encontrada', 404);
  }

  const item = updated.toObject();

  response(res, 200, {
    ...item,
    blocks: getTemplateBlocks(item),
  });
};

/* ======================================================
   ACTIVAR O DESACTIVAR
   ====================================================== */

const toggleDocumentationReceiptTemplate = async (
  req,
  res
) => {
  const { templateId, active } = req.body || {};

  const parsedActive = parseBool(active);

  if (parsedActive === undefined) {
    throw new ClientError(
      'Debes indicar active true/false',
      400
    );
  }

  const updated =
    await DocumentationReceiptTemplate.findByIdAndUpdate(
      toId(templateId, 'templateId'),
      {
        $set: {
          active: parsedActive,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate(
      'documentationId',
      'name model categoryFiles requiresSignature visible'
    );

  if (!updated) {
    throw new ClientError('Plantilla no encontrada', 404);
  }

  const item = updated.toObject();

  response(res, 200, {
    ...item,
    blocks: getTemplateBlocks(item),
  });
};

/* ======================================================
   ELIMINAR
   ====================================================== */

const deleteDocumentationReceiptTemplate = async (
  req,
  res
) => {
  const { templateId } = req.body || {};

  const deleted =
    await DocumentationReceiptTemplate.findByIdAndDelete(
      toId(templateId, 'templateId')
    );

  if (!deleted) {
    throw new ClientError('Plantilla no encontrada', 404);
  }

  response(res, 200, {
    message: 'Plantilla eliminada correctamente',
    deletedId: deleted._id,
  });
};

/* ======================================================
   VALIDAR RESPUESTAS
   ====================================================== */

const postValidateReceiptAnswers = async (
  req,
  res
) => {
  const {
    documentationId,
    answers = [],
  } = req.body || {};

  const template =
    await getActiveReceiptTemplateForDocumentation(
      documentationId
    );

  if (!template) {
    return response(res, 200, {
      hasTemplate: false,
      valid: true,
      snapshot: [],
      description: null,
    });
  }

  validateReceiptAnswers({
    template,
    answers,
  });

  const documentation = await Documentation.findById(
    documentationId
  )
    .select('name')
    .lean();

  const snapshot = buildReceiptAnswersSnapshot({
    template,
    answers,
  });

  const description =
    buildReceiptDescriptionFromAnswers({
      template,
      answers,
      documentName:
        documentation?.name || 'Documento',
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
  listDocumentationReceiptTemplates: catchAsync(listDocumentationReceiptTemplates),
  getDocumentationReceiptTemplateById: catchAsync(getDocumentationReceiptTemplateById),
  getDocumentationReceiptTemplateByDocumentation: catchAsync(getDocumentationReceiptTemplateByDocumentation),
  getActiveReceiptQuestionsByDocumentation: catchAsync( getActiveReceiptQuestionsByDocumentation ),
  createDocumentationReceiptTemplate: catchAsync(createDocumentationReceiptTemplate),
  upsertDocumentationReceiptTemplate: catchAsync(upsertDocumentationReceiptTemplate),
  updateDocumentationReceiptTemplate: catchAsync(updateDocumentationReceiptTemplate),
  toggleDocumentationReceiptTemplate: catchAsync(toggleDocumentationReceiptTemplate),
  deleteDocumentationReceiptTemplate: catchAsync(deleteDocumentationReceiptTemplate),
  postValidateReceiptAnswers: catchAsync(postValidateReceiptAnswers),
  getActiveReceiptTemplateForDocumentation,
  getTemplateBlocks,
  validateReceiptAnswers,
  buildReceiptAnswersSnapshot,
  buildReceiptDescriptionFromAnswers,
};