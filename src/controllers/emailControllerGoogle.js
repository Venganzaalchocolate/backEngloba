
const { google }   = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { User, Periods, UserChangeRequest, Dispositive , Program, UserCv } = require('../models/indexModels');
const { buildSesameOpsPlainText, buildSesameOpsHtmlEmail, buildSesamePlainText, buildSesameHtmlEmail, buildPlainText, buildHtmlEmail, buildChangeRequestNotificationHtml, buildChangeRequestNotificationPlainText, buildMissingDniPlainText, buildMissingDniHtmlEmail } = require('../templates/emailTemplates');
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
   2. Plantilla HTML (exactamente la que tenías)
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



function buildUserEmail(user) {
  if(user.email=='comunicacion@engloba.org.es') return 'comunicacion@engloba.org.es';
  if(user.email=='web@engloba.org.es') return 'web@engloba.org.es';
  if(!user) return '';
  const first = (user.firstName || '').trim().toLowerCase();
  const last = (user.lastName || '').trim().toLowerCase();
  const normalizedFirst = first
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const normalizedLast = last
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return `${normalizedFirst}.${normalizedLast}@${DOMAIN}`;
}





async function sendWelcomeEmail(user) {
  if (!user) throw new Error('user es obligatorio');
  const toPersonal = (user.email_personal || '').trim().toLowerCase();
  if (!toPersonal) throw new Error('El usuario no tiene email_personal');


  const subject     = 'Tu nueva cuenta de Engloba y Google Workspace';
  const text        = buildPlainText(user.firstName, user.email);
  const html        = buildHtmlEmail(user.firstName, user.email);

  await sendEmail([toPersonal,user.email], subject, text, html);
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
          { email: 1, email_personal: 1 }
        ).lean();
        recipients = Array.from(new Set(
          managers.flatMap(u => [u.email, u.email_personal]
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
  const requestType = hasChanges && hasDocs ? 'mixta' : hasChanges ? 'datos' : 'documentos';

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
    actionUrl,
    logoUrl,
    supportEmail
  };
}


// prueba();
module.exports = {
  sendEmail,          // firma idéntica a tu antiguo SMTP
  generateEmailHTML,
  sendWelcomeEmail,
  notifyDeviceManagersOfChangeRequest
};
