
const { google }   = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { User } = require('../models/indexModels');
const { buildSesameOpsPlainText, buildSesameOpsHtmlEmail, buildSesamePlainText, buildSesameHtmlEmail, buildPlainText, buildHtmlEmail } = require('../templates/emailTemplates');

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
const TEST_TO  = 'comunicacion@engloba.org.es';  // <- ¡ojo! comprueba la ortografía
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

// prueba();
module.exports = {
  sendEmail,          // firma idéntica a tu antiguo SMTP
  generateEmailHTML,
  sendWelcomeEmail
};
