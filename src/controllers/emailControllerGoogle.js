
const { google }   = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { User, Periods, UserChangeRequest, Dispositive , Program, UserCv } = require('../models/indexModels');
const { buildSesameOpsPlainText, buildSesameOpsHtmlEmail, buildSesamePlainText, buildSesameHtmlEmail, buildPlainText, buildHtmlEmail, buildChangeRequestNotificationHtml, buildChangeRequestNotificationPlainText, buildMissingDniPlainText, buildMissingDniHtmlEmail, buildWelcomeWorkerPlainText, buildWelcomeWorkerHtmlEmail, buildPayrollAppNotificationPlainText, buildPayrollAppNotificationHtmlEmail, buildChristmasEmployeesPlainText, buildChristmasEmployeesHtmlEmail, buildEqualityLgtbiqSurveyPlainText, buildEqualityLgtbiqSurveyHtmlEmail, buildMiniTutorialsOpsPlainText, buildMiniTutorialsOpsHtmlEmail, buildSignatureUpdateHtmlEmail, buildSignatureUpdatePlainText } = require('../templates/emailTemplates');
const { default: mongoose } = require('mongoose');

/* ────────────────────────────────────────────────────────────────────────────
   1. Autenticación: cliente Gmail “impersonando” al remitente
   ────────────────────────────────────────────────────────────────────────── */
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);
const { client_email, private_key } = credentials;

function getGmailClient(asUser) {
  const auth = new google.auth.JWT({
    email:   client_email,
    key:     private_key,
    scopes:  ['https://www.googleapis.com/auth/gmail.send'],
    subject: asUser                      // cuenta del dominio que enviará
  });
  return google.gmail({ version: 'v1', auth });
}

/* ────────────────────────────────────────────────────────────────────────────
   2. Plantilla HTML 
   ────────────────────────────────────────────────────────────────────────── */
function generateEmailHTML({
  logoUrl      = '',
  title        = 'Notificación',
  greetingName = '',
  bodyText     = '',
  highlightText= '',
  footerText   = ''
} = {}) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:0;color:#333;background:#f5f5f5}
        .header{padding:10px 20px;background:#50529f;color:#fff;text-align:left}
        .content{margin:20px;padding:20px;background:#fff;border-radius:5px}
        .content h1{margin:0 0 10px}
        .highlight{background:#eaf4ff;border-left:4px solid #50529f;padding:10px;margin:10px 0;font-weight:bold;font-size:1.2em;white-space:pre-line}
        .footer{text-align:center;color:#888;font-size:.9em;margin:20px}
      </style>
    </head>
    <body>
      <div class="header">Asociación Engloba</div>
      <div class="content">
        <h1>${title}</h1>
        ${greetingName ? `<p>Hola ${greetingName},</p>` : ''}
        <p>${bodyText}</p>
        ${highlightText ? `<div class="highlight">${highlightText}</div>` : ''}
      </div>
      ${footerText ? `<div class="footer">${footerText}</div>` : ''}
    </body>
  </html>`;
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Envío (misma firma: to, subject, text, html [, attachments])
   ────────────────────────────────────────────────────────────────────────── */
async function sendEmail(to, subject, text, html, attachments = []) {
  const from  = process.env.DEFAULT_SENDER || 'archi@engloba.org.es';
  const gmail = getGmailClient(from);

  // 1) Si viene un array ⇒ lo convertimos a "a@b.com, c@d.com, …"
  const toHeader = Array.isArray(to) ? to.join(', ') : to;

  // 2) Construir MIME
  const mail = new MailComposer({
    from,
    to: toHeader,          // ← ahora puede ser lista
    subject,
    text,
    html,
    attachments
  });
  const raw = await mail.compile().build();

  // 3) Codificar a base64url
  const encoded = raw.toString('base64')
                     .replace(/\+/g, '-')
                     .replace(/\//g, '_')
                     .replace(/=+$/, '');

  // 4) Enviar
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded }
  });
}


    //---------
const TEST_TO  = null;  // <- ¡ojo! comprueba la ortografía
const TEST_FN  = 'Equipo';                       // nombre para el saludo (firstName)


const DOMAIN='engloba.org.es'
/* ────────────────────────────────────────────────────────────────────────────
   Envío
   ──────────────────────────────────────────────────────────────────────── */
function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina tildes
    .replace(/\s+/g, '')             // elimina espacios y guiones
    .replace(/[^a-z0-9]/g, '');      // solo alfanuméricos
}









async function sendWelcomeEmail(user, emailCorp='', delayMs = 5 * 60 * 1000) {
    if (!user) {
    console.error('[sendWelcomeEmailDelayed] user es obligatorio');
    return;
  }

  const toPersonal = (user.email_personal || '').trim().toLowerCase();
  if (!toPersonal) {
    console.error('[sendWelcomeEmailDelayed] El usuario no tiene email_personal');
    return;
  }

  const name    = `${user.firstName} ${user.lastName}`;
  const subject = 'Tu nueva cuenta de Engloba';
  const text    = buildWelcomeWorkerPlainText(name, emailCorp);
  const html    = buildWelcomeWorkerHtmlEmail(name, emailCorp);

  const recipients = [toPersonal, emailCorp].filter(Boolean);

  setTimeout(async () => {
    try {
      await sendEmail(recipients, subject, text, html);
    } catch (err) {
      console.error(
        '[sendWelcomeEmailDelayed] Error enviando email de bienvenida:',
        err?.message || err
      );
    }
  }, delayMs);
}


/* ────────────────────────────────────────────────────────────────────────────
   Plantilla SESAME · TEXTO PLANO
   ──────────────────────────────────────────────────────────────────────── */

// ──────────────────────────────────────────────────────────────
// Utilidad: normaliza DNI (mayúsculas, sin espacios)
// ──────────────────────────────────────────────────────────────
const normalizeDni = (s = '') =>
  String(s).toUpperCase().replace(/\s+/g, '').trim();

// ──────────────────────────────────────────────────────────────
// (Opcional) Ajuste recomendado en sendSesameEmail
// ──────────────────────────────────────────────────────────────
async function sendSesameEmail(user) {
  if (!user) throw new Error('user es obligatorio');
  const toPersonal = (user.email_personal || '').trim().toLowerCase();

  const subject = 'Activa tu cuenta en Sesame | Control horario';
  const text    = buildSesamePlainText(user.firstName, user.email);
  const html    = buildSesameHtmlEmail(user.firstName, user.email);

  // siempre array; si existe corporativo, lo usamos; si además hay personal, lo añadimos
  const recipients = [];
  if (user.email) recipients.push(user.email.trim().toLowerCase());
  if (toPersonal && toPersonal !== (user.email || '').trim().toLowerCase()) {
    recipients.push(toPersonal);
  }
  if (!recipients.length) throw new Error('El usuario no tiene ningún email');

  await sendEmail(recipients, subject, text, html);
}

// ──────────────────────────────────────────────────────────────
/**
 * Envía el email a todos los usuarios cuyo DNI esté en la lista.
 * @param {string[]} dniArray Lista de DNIs.
 * @param {{ dryRun?: boolean, delayMs?: number }} options
 */
// ──────────────────────────────────────────────────────────────
async function sendSesameToDniList(
  dniArray,
  { dryRun = true, delayMs = 250, logger = console.log, errorLogger = console.error } = {}
) {
  const normalizeDni = (s = '') => String(s).toUpperCase().replace(/\s+/g, '').trim();
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  const dniSet = new Set(dniArray.map(normalizeDni));

  let users = await User.find({ dni: { $in: Array.from(dniSet) } });
  if (!users.length) {
    const or = Array.from(dniSet).map(d => ({ dni: new RegExp(`^${d}$`, 'i') }));
    users = await User.find({ $or: or });
  }

  const uniqueById = new Map();
  for (const u of users) uniqueById.set(String(u._id), u);
  const queue = Array.from(uniqueById.values());

  const results = { total: queue.length, sent: 0, skipped: 0, errors: [] };

  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    const idx = `${i + 1}/${queue.length}`;
    const targetsPreview = [u.email, u.email_personal].filter(Boolean).join(', ') || 'SIN EMAIL';

    try {
      if (dryRun) {
        logger(`[${ts()}] [DRY RUN ${idx}] ${u.firstName} (${u.dni}) → ${targetsPreview}`);
      } else {
        await sendSesameEmail(u); // debe lanzar si no hay emails válidos
        logger(`✅ [${ts()}] [${idx}] Enviado a ${u.firstName} (${u.dni}) → ${targetsPreview}`);
      }
      results.sent += 1;
    } catch (err) {
      errorLogger(`❌ [${ts()}] [${idx}] Error con ${u.firstName} (${u.dni}): ${err.message}`);
      results.errors.push({
        id: String(u._id),
        dni: u.dni,
        email: u.email,
        email_personal: u.email_personal,
        error: err.message,
      });
      results.skipped += 1;
    }

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  logger(`— Resumen: procesados ${results.total} | OK ${results.sent} | Errores ${results.skipped}`);
  return results;
}


// Envía SOLO al buzón comunicacion@engloba.org.es
async function sendOpsToComunicacion({ logoUrl = '', supportEmail = 'web@engloba.org.es' } = {}) {
  const target = 'comunicacion@engloba.org.es';

  // (Opcional) busca el usuario para personalizar el nombre si existe
  const user = await User.findOne({ email: new RegExp(`^${target}$`, 'i') });
  const name = user?.firstName || 'equipo';

  const subject = 'Sesame HR · Incidencias comunes y cómo resolverlas';
  const text    = buildSesameOpsPlainText(name, supportEmail);
  const html    = buildSesameOpsHtmlEmail(name, { logoUrl, supportEmail });

  // Fuerza el envío únicamente a ese correo
  await sendEmail([target], subject, text, html);
}
// const prueba=async()=>{
//   sendOpsToComunicacion();
// }

async function notifyDeviceManagersOfChangeRequest({
  requestId,
  actionUrl = '',
  logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
  supportEmail = 'comunicacion@engloba.org.es',
  testEmail = null,
  throwOnError = false,
  logger = console
} = {}) {

  const logWarn  = (msg) => (logger?.warn  || console.warn)(msg);
  const logError = (msg) => (logger?.error || console.error)(msg);

  // 🔹 pequeño helper para fechas en es-ES (solo día)
  const formatEsDate = (d) =>
    d ? new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }) : undefined;

  try {
    if (!requestId) throw new Error('requestId es obligatorio');

    // 1) Solicitud + trabajador
    // ⬇️ IMPORTANTE: populate para poder leer originDocumentation.name
    const reqDoc = await UserChangeRequest.findById(requestId)
      .populate({ path: 'uploads.originDocumentation', select: 'name' })
      .lean();
    if (!reqDoc) throw new Error('Solicitud no encontrada');

    const worker = await User.findById(reqDoc.userId).lean();
    if (!worker) throw new Error('Trabajador no encontrado');

    // 2) Periodos activos (puede haber 1 o 2 si parcial)
const now = new Date();
const periods = await Periods.find({
  idUser: worker._id,
  active: true,
  $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }]
}, { dispositiveId: 1, device: 1 }).lean(); // ← incluimos device (legacy) como fallback

// 3) Contexto de dispositivos desde colección Dispositive (nuevo modelo)
//    - Primero recogemos los dispositiveId “nuevos” de Periods
let dispIds = Array.from(new Set(
  periods.map(p => p.dispositiveId).filter(Boolean).map(String)
));

// Fallback: si no hay nuevos, intenta resolver legacy `device` → program/dev name
let deviceContexts = [];

if (dispIds.length) {
  // Dispositivos + su programa
  const dispositives = await Dispositive.find(
    { _id: { $in: dispIds.map(id => mongoose.Types.ObjectId.createFromHexString(id)) } },
    { _id: 1, name: 1, program: 1, responsible: 1, coordinators: 1 }
  ).lean();

  const programIds = Array.from(new Set(dispositives.map(d => String(d.program)).filter(Boolean)));
  const programs = await Program.find(
    { _id: { $in: programIds.map(id => mongoose.Types.ObjectId.createFromHexString(id)) } },
    { _id: 1, name: 1, acronym: 1 }
  ).lean();
  const progMap = new Map(programs.map(p => [String(p._id), { name: p.name, acronym: p.acronym }]));

  deviceContexts = dispositives.map(d => ({
    programName:   progMap.get(String(d.program))?.name || '',
    programAcronym:progMap.get(String(d.program))?.acronym || '',
    deviceId:      String(d._id),
    deviceName:    d.name,
    responsibleIds:(d.responsible || []).map(String),
    coordinatorIds:(d.coordinators || []).map(String),
  }));
} else {
  // LEGACY (solo si aún tienes Periods con `device` y nada en `dispositiveId`)
  const legacyIds = Array.from(new Set(
    periods.map(p => p.device).filter(Boolean).map(String)
  ));

  if (legacyIds.length) {
    const programs = await Program.find(
      { 'devices._id': { $in: legacyIds.map(id => mongoose.Types.ObjectId.createFromHexString(id)) } },
      { name: 1, acronym: 1, devices: 1 }
    ).lean();

    const wanted = new Set(legacyIds);
    for (const prg of programs) {
      for (const dev of prg.devices || []) {
        if (!wanted.has(String(dev._id))) continue;
        deviceContexts.push({
          programName: prg.name,
          programAcronym: prg.acronym,
          deviceId: String(dev._id),          // legacy id (solo para mostrar)
          deviceName: dev.name,
          responsibleIds: (dev.responsible || []).map(String),
          coordinatorIds: (dev.coordinators || []).map(String),
        });
      }
    }
  }
}

    // 4) Destinatarios
    let recipients = [];
    if (testEmail) {
      recipients = [String(testEmail).trim().toLowerCase()];
    } else {
      const managerIds = Array.from(
        new Set(deviceContexts.flatMap(d => [...d.responsibleIds, ...d.coordinatorIds]))
      );
      if (managerIds.length) {
        const managers = await User.find(
          { _id: { $in: managerIds } },
          { email: 1 }
        ).lean();
        recipients = Array.from(new Set(
          managers.flatMap(u => [u.email]
            .filter(Boolean)
            .map(e => e.trim().toLowerCase()))
        ));
      }
      if (!recipients.length && process.env.FALLBACK_APPROVER_EMAIL) {
        recipients = [process.env.FALLBACK_APPROVER_EMAIL.trim().toLowerCase()];
      }
    }

    if (!recipients.length) {
      const msg = 'No hay destinatarios para la notificación.';
      if (throwOnError) throw new Error(msg);
      logWarn(`[notifyDeviceManagersOfChangeRequest] ${msg}`);
      return { ok: false, reason: msg };
    }

    // 5) Asunto
    const subjectBase =
      `Nueva solicitud de ${worker.firstName || ''} ${worker.lastName || ''} ` +
      `(${(worker.dni || '').toUpperCase()}) · ${devicesShort(deviceContexts)}`;
    const subject = testEmail ? `[PRUEBA] ${subjectBase}` : subjectBase;

    // 5.1) 🔸 Construimos los documentos para el email
    const documentsForEmail = (reqDoc.uploads || []).map(u => {
      const isOfficial = u.type === 'user-official-doc';
      // Regla:
      // - si oficial -> usar Documentation.name
      // - si no, usar labelFile
      // - si falta, caer a originalName como último recurso
      const displayName = isOfficial
        ? (u.originDocumentation?.name || u.labelFile || u.originalName)
        : (u.labelFile || u.originalName);

      return {
        name: displayName,
        kind: isOfficial ? 'Oficial' : 'Adjunto',
        date: formatEsDate(u.date),
        description: u.description,
      };
    });

    // 6) Contenido
    const payload = buildBasicPayload(reqDoc, worker, deviceContexts, actionUrl, logoUrl, supportEmail);
    // ⬇️ Sobrescribimos/inyectamos los documentos ya formateados
    payload.documents = documentsForEmail;

    const text = buildChangeRequestNotificationPlainText(payload);
    const html = buildChangeRequestNotificationHtml(payload);

    // 7) Enviar
    await sendEmail(recipients, subject, text, html);

    return { ok: true, recipients, subject };
  } catch (err) {
    if (throwOnError) throw err;
    logError(`[notifyDeviceManagersOfChangeRequest] ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/* ── helpers locales ────────────────────────────────────────── */

function devicesShort(ctxs = []) {
  if (!ctxs.length) return 'sin dispositivo';
  return ctxs
    .map(c => (c.programAcronym ? `${c.programAcronym} — ${c.deviceName}` : c.deviceName))
    .join(', ');
}

function buildBasicPayload(reqDoc, worker, deviceContexts, actionUrl, logoUrl, supportEmail) {
  const workerFullName = `${worker.firstName || ''} ${worker.lastName || ''}`.trim();
  const dni = (worker.dni || '').toUpperCase();

  const hasChanges = Array.isArray(reqDoc.changes) && reqDoc.changes.length > 0;
  const hasDocs    = Array.isArray(reqDoc.uploads) && reqDoc.uploads.length > 0;
  const hasTimeOff =
    reqDoc.timeOff &&
    Array.isArray(reqDoc.timeOff.entries) &&
    reqDoc.timeOff.entries.length > 0;

  let requestType;

  if (hasTimeOff && !hasChanges && !hasDocs) {
    // SOLO vacaciones / asuntos propios
    requestType = reqDoc.timeOff.kind;   // "vacation" | "personal"
  } else if (hasChanges && hasDocs) {
    requestType = 'mixta';
  } else if (hasChanges) {
    requestType = 'datos';
  } else if (hasDocs) {
    requestType = 'documentos';
  } else {
    requestType = 'documentos'; // fallback antiguo
  }

  // (opcional) resumen de días para usarlo en la plantilla
  let timeOffSummary = null;
  if (hasTimeOff) {
    const kindLabel =
      reqDoc.timeOff.kind === 'vacation' ? 'Vacaciones' : 'Asuntos propios';

    const dates = reqDoc.timeOff.entries
      .map(e => e?.date ? new Date(e.date) : null)
      .filter(d => d && !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);

    const uniqueDates = Array.from(
      new Set(dates.map(d => d.toISOString().slice(0, 10)))
    );

    const daysCount = uniqueDates.length;
    let range = '';
    if (daysCount === 1) {
      range = uniqueDates[0];
    } else if (daysCount > 1) {
      range = `${uniqueDates[0]} - ${uniqueDates[uniqueDates.length - 1]}`;
    }

    timeOffSummary = {
      kind: reqDoc.timeOff.kind,   // "vacation" | "personal"
      kindLabel,
      daysCount,
      range,
    };
  }

  const labelFor = (path) => ({
    firstName: "Nombre",
    lastName: "Apellidos",
    dni: "DNI",
    birthday: "Fecha de nacimiento",
    email_personal: "Email personal",
    socialSecurityNumber: "Nº Seguridad Social",
    bankAccountNumber: "Cuenta bancaria",
    phone: "Teléfono personal",
    "phoneJob.number": "Teléfono laboral",
    "phoneJob.extension": "Extensión laboral",
    gender: "Género",
    fostered: "Extutelado",
    apafa: "Apafa",
    consetmentDataProtection: "Consentimiento PD",
    "disability.percentage": "% Discapacidad",
    "disability.notes": "Notas discapacidad",
    studies: "Estudios",
  }[path] || path || 'Campo');

  const changes = (reqDoc.changes || []).map(c => ({
    label: c?.label || labelFor(c?.path),
    from:  c?.from ?? '—',
    to:    c?.to ?? '—'
  }));

  const documents = (reqDoc.uploads || []).map(u => ({
    name: u?.labelFile || u?.description || u?.originalName || 'Documento',
    kind: u?.originDocumentation ? 'Oficial' : (u?.category || 'Varios'),
    date: u?.date ? new Date(u.date).toISOString().slice(0,10) : undefined,
    description: u?.originDocumentation ? '' : (u?.description || '')
  }));

  const deviceName = (deviceContexts || [])
    .map(d => d.programAcronym ? `${d.programAcronym} — ${d.deviceName}` : d.deviceName)
    .join(', ') || '—';

  return {
    approverName: '',
    workerFullName,
    dni,
    deviceName,
    requestType,
    submittedAt: reqDoc.submittedAt,
    note: reqDoc.note || '',
    changes,
    documents,
    timeOff: timeOffSummary,   // ← nuevo
    actionUrl,
    logoUrl,
    supportEmail
  };
}




function getGmailClient(asUser, scopes = ['https://www.googleapis.com/auth/gmail.modify']) {
  const auth = new google.auth.JWT({
    email:  client_email,
    key:    private_key,
    scopes,               // ← ahora configurable
    subject: asUser
  });
  return google.gmail({ version: 'v1', auth });
}
async function moveAllToTrash(userEmail = 'archi@engloba.org.es', {
  query = 'in:anywhere -in:trash',
  batchSize = 1000,
  delayMs = 300
} = {}) {
  const gmail = getGmailClient(userEmail, ['https://www.googleapis.com/auth/gmail.modify']);

  let nextPageToken = undefined;
  let totalTrashed = 0;

  while (true) {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken: nextPageToken
    });

    const ids = (data.messages || []).map(m => m.id);
    if (!ids.length) break;

    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: chunk, addLabelIds: ['TRASH'] }
      });
      totalTrashed += chunk.length;
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }

    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }

  return { ok: true, totalTrashed };
}

async function moveMailToTrashByDate(
  userEmail = 'archi@engloba.org.es',
  {
    after = '2025/10/01',
    before = '2025/10/02',
    delayMs = 300,
    batchSize = 1000,
  } = {}
) {
  const gmail = getGmailClient(userEmail, ['https://www.googleapis.com/auth/gmail.modify']);
  const query = `after:${after} before:${before} -in:trash`; // filtra y evita ya borrados

  let nextPageToken = undefined;
  let totalTrashed = 0;

  while (true) {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken: nextPageToken
    });

    const ids = (data.messages || []).map(m => m.id);
    if (!ids.length) break;

    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: chunk, addLabelIds: ['TRASH'] }
      });
      totalTrashed += chunk.length;
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }

    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }

  return { ok: true, totalTrashed, query };
}
// 2) Paso seguro: mover todo a papelera primero:
// moveAllToTrash('archi@engloba.org.es', { query: 'in:anywhere -in:trash' })
//   .then(res => console.log('En papelera:', res))
//   .catch(err => console.error(err));

// prueba();
// moveMailToTrashByDate('comunicacion@engloba.org.es', {
//   after: '2000/01/01',
//   before: '2024/05/01'
// });

// ──────────────────────────────────────────────────────────────
// NAVIDAD · Envío masivo (solo corporativo) + modo PREVIEW
// ──────────────────────────────────────────────────────────────
async function sendChristmasEmployeesEmail({
  previewOnly = true,
  previewToList = ['comunicacion@engloba.org.es', 'web@engloba.org.es'],
  query = {},                 // para envío real masivo (ej: { employmentStatus: "activo" })
  delayMs = 250,
  logger = console.log,
  errorLogger = console.error,
} = {}) {
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  // --- 1) Obtener usuarios ---
  // Preview: buscamos SOLO esos 2 correos, para personalizar nombre/apellidos
  // Real: usamos query genérica
  const findQuery = previewOnly
    ? { email: { $in: previewToList.map(e => String(e).trim().toLowerCase()) } }
    : query;

  const users = await User.find(findQuery, { email: 1, firstName: 1, lastName: 1 }).lean();

  // --- 2) Normalizar corporativos ---
  const corpEmails = Array.from(
    new Set(
      users
        .map(u => (u?.email || '').trim().toLowerCase())
        .filter(e => e && e.includes('@'))
    )
  );

  if (!corpEmails.length) {
    logger(`[${ts()}] No hay correos corporativos para el envío.`);
    return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
  }

  // --- 3) Config común ---
  const subject = 'Feliz Navidad y gracias por todo lo que hacemos juntos/as';

  logger(`[${ts()}] Navidad: usuarios encontrados: ${users.length}`);
  logger(`[${ts()}] Navidad: correos corporativos únicos: ${corpEmails.length}`);
  logger(`[${ts()}] Modo: ${previewOnly ? `PREVIEW (${previewToList.join(', ')})` : 'REAL (envío masivo)'}`);

  const results = { ok: true, total: corpEmails.length, sent: 0, skipped: 0, errors: [], recipients: corpEmails };

  // --- 4) Enviar 1 a 1 (personalizado) ---
  for (let i = 0; i < corpEmails.length; i++) {
    const to = corpEmails[i];
    const idx = `${i + 1}/${corpEmails.length}`;

    // buscar el user para personalizar nombre
    const u = users.find(x => (x?.email || '').trim().toLowerCase() === to);
    const fullName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    const displayName = fullName || 'equipo';

    const text = buildChristmasEmployeesPlainText(displayName, {
      supportEmail: 'comunicacion@engloba.org.es',
      year: 2026,
    });

    const html = buildChristmasEmployeesHtmlEmail(displayName, {
      supportEmail: 'comunicacion@engloba.org.es',
      headerImageUrl: 'http://engloba.org.es/wp-content/uploads/2025/12/felicitacion-1.png',
      year: 2026,
    });

    try {
      await sendEmail([to], subject, text, html);
      results.sent += 1;
      logger(`✅ [${ts()}] [${idx}] Enviado → ${to} (${displayName})`);
    } catch (err) {
      results.skipped += 1;
      const msg = err?.message || String(err);
      results.errors.push({ to, error: msg });
      errorLogger(`❌ [${ts()}] [${idx}] Error → ${to}: ${msg}`);
    }

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  logger(`— Resumen Navidad: total ${results.total} | OK ${results.sent} | Errores ${results.skipped}`);
  return results;
}

// Atajo: preview (solo a comunicacion)
// Enviar solo a comunicacion + web (personalizado)
// sendChristmasEmployeesEmail({
//   previewOnly: true,
//     previewToList: ['diego@engloba.org.es'],
// });
// previewChristmasEmployeesEmail()

// ──────────────────────────────────────────────────────────────
// PLANES IGUALDAD + LGTBIQ+ · ENVÍO MASIVO PERSONALIZADO + PREVIEW
// ──────────────────────────────────────────────────────────────
async function sendEqualityLgtbiqSurveyEmail({
  previewOnly = true,
  previewToList = ['comunicacion@engloba.org.es'], // 👈 PRUEBA SOLO AQUÍ
  query = {},                                      // 👈 en real: filtra empleados (ej: { employmentStatus: "activo" })
  delayMs = 250,
  logger = console.log,
  errorLogger = console.error,

  // Config contenido
  subject = 'Planes de Igualdad y LGTBIQ+ · Tu opinión cuenta (2 min)',
  logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
  supportEmail = 'web@engloba.org.es',
  planIgualdadUrl = 'https://forms.gle/tGVQgcFgbURv1HLq5',
  planLgtbiqUrl = 'https://forms.gle/YcSN4Hkt8PGMiNQk7',
} = {}) {
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 1) Buscar usuarios objetivo
  // Preview: buscamos SOLO esos correos para sacar nombre/apellidos si existe
  // Real: usamos query genérica
  const findQuery = previewOnly
    ? { email: { $in: previewToList.map(e => String(e).trim().toLowerCase()) } }
    : query;

  const users = await User.find(findQuery, { email: 1, firstName: 1, lastName: 1 }).lean();

  // 2) Lista de correos
  const recipients = previewOnly
    ? previewToList.map(e => String(e).trim().toLowerCase())
    : Array.from(new Set(
        users
          .map(u => (u?.email || '').trim().toLowerCase())
          .filter(e => e && e.includes('@'))
      ));

  if (!recipients.length) {
    logger(`[${ts()}] Planes: No hay destinatarios para el envío.`);
    return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
  }

  logger(`[${ts()}] Planes: usuarios encontrados: ${users.length}`);
  logger(`[${ts()}] Planes: correos destinatarios: ${recipients.length}`);
  logger(`[${ts()}] Modo: ${previewOnly ? `PREVIEW (${previewToList.join(', ')})` : 'REAL (envío masivo)'}`);

  const results = { ok: true, total: recipients.length, sent: 0, skipped: 0, errors: [], recipients };

  // 3) Envío 1 a 1 (personalizado)
  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const idx = `${i + 1}/${recipients.length}`;

    // buscar el user para personalizar nombre
    const u = users.find(x => (x?.email || '').trim().toLowerCase() === to);
    const fullName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    const displayName = fullName || (previewOnly ? 'equipo' : 'equipo');

    const text = buildEqualityLgtbiqSurveyPlainText(displayName, {
      planIgualdadUrl,
      planLgtbiqUrl,
      supportEmail,
    });

    const html = buildEqualityLgtbiqSurveyHtmlEmail(displayName, {
      logoUrl,
      planIgualdadUrl,
      planLgtbiqUrl,
      supportEmail,
    });

    try {
      await sendEmail([to], subject, text, html);
      results.sent += 1;
      logger(`✅ [${ts()}] [${idx}] Enviado → ${to} (${displayName})`);
    } catch (err) {
      results.skipped += 1;
      const msg = err?.message || String(err);
      results.errors.push({ to, error: msg });
      errorLogger(`❌ [${ts()}] [${idx}] Error → ${to}: ${msg}`);
    }

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  logger(`— Resumen Planes: total ${results.total} | OK ${results.sent} | Errores ${results.skipped}`);
  return results;
}











// ✅ Envío masivo: aviso “Nueva firma”
// - Solo a usuarios NO APAFA
// - Solo si tienen email corporativo (user.email)
// - Solo si tienen un Period activo HOY (active:true y (endDate null/undefined o >= hoy) y startDate <= hoy)
// - NO usa email_personal
// - Envío 1 a 1 con delay, con modo dryRun/preview
//
// Requiere que importes tus templates nuevos:
///  buildSignatureUpdatePlainText, buildSignatureUpdateHtmlEmail
//
// y que tengas sendEmail() disponible en este mismo fichero.

const DEFAULT_APP_URL = "https://app.engloba.org.es";

async function sendSignatureUpdateToActiveWorkers({
  previewOnly = true,                      // true = solo previewToList
  previewToList = ["comunicacion@engloba.org.es"],

  delayMs = 250,
  logger = console.log,
  errorLogger = console.error,

  // contenido
  subject = "Acción requerida · Registra tu firma en la app para firmar nóminas",
  logoUrl = "https://app.engloba.org.es/graphic/logotipo_blanco.png",
  supportEmail = "comunicacion@engloba.org.es",
  appUrl = DEFAULT_APP_URL,

  // para excluir ciertos correos (opc.)
  excludeEmails = [],

  // opcional: filtra por roles/estado si quieres (por defecto no hace falta)
  // extraUserQuery = {},

} = {}) {
  const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  const normEmail = (e) => String(e || "").trim().toLowerCase();
  const excluded = new Set((excludeEmails || []).map(normEmail));

  // 1) construir lista de destinatarios
  let recipients = [];

  if (previewOnly) {
    recipients = Array.from(
      new Set((previewToList || []).map(normEmail).filter(Boolean))
    );
    if (!recipients.length) {
      logger(`[${ts()}] Firma: preview sin destinatarios.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }
  } else {
    // --- Query Periods activos HOY ---
    const now = new Date();

    const activePeriods = await Periods.find(
      {
        active: true,
        startDate: { $lte: now },
        $or: [
          { endDate: { $exists: false } },
          { endDate: null },
          { endDate: { $gte: now } },
        ],
      },
      { idUser: 1 }
    ).lean();

    const userIds = Array.from(
      new Set((activePeriods || []).map((p) => String(p.idUser)).filter(Boolean))
    );

    if (!userIds.length) {
      logger(`[${ts()}] Firma: no hay Periods activos hoy.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }

    // --- Users válidos: NO apafa + email corporativo ---
    const users = await User.find(
      {
        _id: { $in: userIds },
        apafa: { $ne: true },
        email: { $exists: true, $ne: "" },
        // ...extraUserQuery,
      },
      { email: 1 }
    ).lean();

    recipients = Array.from(
      new Set(
        (users || [])
          .map((u) => normEmail(u.email))
          .filter((e) => e && e.includes("@") && !excluded.has(e))
      )
    );

    if (!recipients.length) {
      logger(`[${ts()}] Firma: no hay destinatarios tras filtros (apafa/email/period).`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }
  }

  // 2) preparar mapa para personalizar nombre (si se puede)
  //    (en preview puede existir el user; en real también)
  const usersForNames = await User.find(
    { email: { $in: recipients } },
    { email: 1, firstName: 1, lastName: 1 }
  ).lean();

  const nameByEmail = new Map(
    (usersForNames || []).map((u) => [
      normEmail(u.email),
      `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    ])
  );

  logger(`[${ts()}] Firma: modo ${previewOnly ? "PREVIEW" : "REAL"} | destinatarios: ${recipients.length}`);

  const results = { ok: true, total: recipients.length, sent: 0, skipped: 0, errors: [], recipients };

  // 3) envío 1 a 1
  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const idx = `${i + 1}/${recipients.length}`;

    const displayName = nameByEmail.get(to) || "equipo";

    // 🔻 Estas 2 funciones son las que te pasé antes
    const text = buildSignatureUpdatePlainText(displayName, { appUrl, supportEmail });
    const html = buildSignatureUpdateHtmlEmail(displayName, { logoUrl, appUrl, supportEmail });

    try {
      await sendEmail([to], subject, text, html);
      results.sent += 1;
      logger(`✅ [${ts()}] [${idx}] Enviado → ${to} (${displayName})`);
    } catch (err) {
      results.skipped += 1;
      const msg = err?.message || String(err);
      results.errors.push({ to, error: msg });
      errorLogger(`❌ [${ts()}] [${idx}] Error → ${to}: ${msg}`);
    }

    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  logger(`— Resumen Firma: total ${results.total} | OK ${results.sent} | Errores ${results.skipped}`);
  return results;
}

const prueba=async()=>{
  await sendSignatureUpdateToActiveWorkers({
  previewOnly: true,
  previewToList: ["comunicacion@engloba.org.es", "web@engloba.org.es"],
});
}
// prueba()


async function sendCenterContactReminderToActiveDeviceManagers({
  previewOnly = true,
  previewToList = ['comunicacion@engloba.org.es', 'web@engloba.org.es'],

  delayMs = 250,
  logger = console.log,
  errorLogger = console.error,

  subject = 'Acción requerida: completar dirección y teléfono del centro antes del 11 de marzo',
  logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
  supportEmail = 'paqui@engloba.org.es',
  appUrl = 'https://app.engloba.org.es',
  deadline = 'miércoles 11 de marzo de 2026',

  excludeEmails = [],
} = {}) {
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const excluded = new Set((excludeEmails || []).map(normEmail));

  let recipients = [];
  let usersForNames = [];

  if (previewOnly) {
    recipients = Array.from(
      new Set((previewToList || []).map(normEmail).filter(Boolean))
    );

    if (!recipients.length) {
      logger(`[${ts()}] Recordatorio centros: preview sin destinatarios.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }

    usersForNames = await User.find(
      { email: { $in: recipients } },
      { email: 1, firstName: 1, lastName: 1 }
    ).lean();
  } else {
    // 1) Dispositivos activos
    const activeDispositives = await Dispositive.find(
      { active: { $ne: false } }, // incluye true y también docs antiguos sin campo
      { name: 1, responsible: 1, coordinators: 1 }
    ).lean();

    if (!activeDispositives.length) {
      logger(`[${ts()}] Recordatorio centros: no hay dispositivos activos.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }

    // 2) IDs de responsables/coordinadores
    const managerIds = Array.from(
      new Set(
        activeDispositives.flatMap(d => [
          ...((d.responsible || []).map(String)),
          ...((d.coordinators || []).map(String)),
        ])
      )
    );

    if (!managerIds.length) {
      logger(`[${ts()}] Recordatorio centros: no hay responsables/coordinadores en dispositivos activos.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }

    // 3) Usuarios con email corporativo
    usersForNames = await User.find(
      {
        _id: { $in: managerIds },
        email: { $exists: true, $ne: '' },
      },
      { email: 1, firstName: 1, lastName: 1 }
    ).lean();

    recipients = Array.from(
      new Set(
        (usersForNames || [])
          .map(u => normEmail(u.email))
          .filter(e => e && e.includes('@') && !excluded.has(e))
      )
    );

    if (!recipients.length) {
      logger(`[${ts()}] Recordatorio centros: no hay correos válidos tras filtros.`);
      return { ok: false, total: 0, sent: 0, skipped: 0, recipients: [] };
    }
  }

  const nameByEmail = new Map(
    (usersForNames || []).map(u => [
      normEmail(u.email),
      `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    ])
  );

  const buildText = (name = 'equipo') => `Hola ${name},

Buenos días.

Os escribimos para recordaros que es necesario revisar y completar, dentro del módulo "Programas y dispositivos", los datos de contacto de cada centro.

En concreto, debéis añadir:
- La dirección completa del centro
- El teléfono del centro, si lo hubiese

Es importante que esta información quede cumplimentada antes del ${deadline}, ya que necesitamos extraer estos datos para remitirlos a la administración.

Ruta:
Programas y dispositivos → seleccionar dispositivo → completar dirección y teléfono

Por favor, revisad vuestro/s dispositivo/s cuanto antes para que la información quede correctamente registrada dentro del plazo.

Si detectáis cualquier incidencia o tenéis dudas, podéis escribirnos a ${supportEmail}.

Muchas gracias por vuestra colaboración.

Un saludo,
Departamento de Comunicación y Desarrollo Tecnológico
Asociación Engloba`;

  const buildHtml = (name = 'equipo') => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Acción requerida · Completar dirección y teléfono del centro</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#ededed;font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.55;-webkit-text-size-adjust:100%}
  .card{max-width:680px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:28px 20px}
  .header h1{font-size:24px;margin:6px 0 0}
  .logo{max-width:120px;height:auto;margin-bottom:8px}
  .content{padding:32px 36px;font-size:16px}
  .content p{margin:16px 0}
  h2{color:#4f529f;font-size:18px;margin:26px 0 10px}
  ul{margin:8px 0 16px 22px}
  li{margin:6px 0}
  .block{background:#f8f9ff;border:1px solid #e7e9ff;border-radius:10px;padding:14px 16px;margin:10px 0 18px}
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.2px;margin-left:8px;vertical-align:middle}
  .kbd{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;background:#f1f1f1;border-radius:6px;padding:2px 6px;border:1px solid #e5e5e5}
  .deadline{background:#fff4f4;border:1px solid #f1c7c7;color:#8a2d2d;border-radius:10px;padding:12px 14px;font-weight:700;margin:14px 0 18px}
  .btn-td{border-radius:40px;background:#4f529f}
  .btn-a{display:inline-block;padding:12px 22px;border-radius:40px;font-weight:700;color:#ffffff !important;text-decoration:none !important;background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%)}
  .btns-row{margin:16px 0 6px;text-align:center}
  .hint{font-size:14px;color:#555;margin-top:6px}
  a.link{color:#4f529f;font-weight:700;text-decoration:none}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo Engloba" class="logo">` : ''}
      <h1>Completar datos del centro</h1>
      <div style="opacity:.9;font-size:14px;margin-top:6px">Programas y dispositivos</div>
    </div>

    <div class="content">
      <p>Hola ${name},</p>

      <p>
        Os escribimos para recordaros que es necesario <strong>revisar y completar los datos de contacto de cada centro</strong>
        dentro del módulo <strong>Programas y dispositivos</strong>.
      </p>

      <div class="deadline">
        Fecha límite: antes del ${deadline}
      </div>

      <h2>📍 Datos que debéis comprobar <span class="tag">Obligatorio</span></h2>
      <div class="block">
        <ul>
          <li><strong>Dirección completa del centro</strong></li>
          <li><strong>Teléfono del centro</strong>, si lo hubiese</li>
        </ul>
      </div>

      <h2>🧭 Dónde hacerlo</h2>
      <div class="block">
        <p style="margin:0;">
          <span class="kbd">Programas y dispositivos → seleccionar dispositivo → completar dirección y teléfono</span>
        </p>
      </div>

      <h2>📄 ¿Por qué es importante?</h2>
      <div class="block">
        <p style="margin:0;">
          Necesitamos que esta información esté correctamente registrada para poder <strong>extraer los datos y remitirlos a la administración</strong>.
        </p>
      </div>

      <p>
        Por favor, revisad vuestro/s dispositivo/s cuanto antes para que toda la información quede completada dentro del plazo.
      </p>

      <div class="btns-row">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px auto">
          <tr>
            <td class="btn-td">
              <a class="btn-a" href="${appUrl}" target="_blank" rel="noopener">Abrir aplicación ▸</a>
            </td>
          </tr>
        </table>
        <p class="hint">
          Soporte: <a class="link" href="mailto:${supportEmail}">${supportEmail}</a>
        </p>
      </div>

      <p>Muchas gracias por vuestra colaboración.</p>

      <p>
        Un saludo,<br>
        <strong>Departamento de Comunicación y Desarrollo Tecnológico</strong><br>
        Asociación Engloba
      </p>
    </div>

    <div class="footer">
      Este aviso se envía para facilitar la actualización de datos de los dispositivos.
    </div>
  </div>
</body>
</html>`;

  logger(
    `[${ts()}] Recordatorio centros: modo ${previewOnly ? 'PREVIEW' : 'REAL'} | destinatarios: ${recipients.length}`
  );

  const results = {
    ok: true,
    total: recipients.length,
    sent: 0,
    skipped: 0,
    errors: [],
    recipients,
  };

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const idx = `${i + 1}/${recipients.length}`;
    const displayName = nameByEmail.get(to) || 'equipo';

    const text = buildText(displayName);
    const html = buildHtml(displayName);

    try {
      await sendEmail([to], subject, text, html);
      results.sent += 1;
      logger(`✅ [${ts()}] [${idx}] Enviado → ${to} (${displayName})`);
    } catch (err) {
      results.skipped += 1;
      const msg = err?.message || String(err);
      results.errors.push({ to, error: msg });
      errorLogger(`❌ [${ts()}] [${idx}] Error → ${to}: ${msg}`);
    }

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  logger(`— Resumen Recordatorio centros: total ${results.total} | OK ${results.sent} | Errores ${results.skipped}`);
  return results;
}

const prueba2 = async () => {
  await sendCenterContactReminderToActiveDeviceManagers({
    previewOnly: true,
    previewToList: ['paqui@engloba.org.es'],
  });
};
// prueba2()
module.exports = {
  sendEmail,          // firma idéntica a tu antiguo SMTP
  generateEmailHTML,
  sendWelcomeEmail,
  notifyDeviceManagersOfChangeRequest,
};
