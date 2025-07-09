
const { google }   = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { User } = require('../models/indexModels');

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

  // 1) Construir MIME con MailComposer
  const mail = new MailComposer({ from, to, subject, text, html, attachments });
  const raw  = await mail.compile().build();                // Buffer RFC 5322

  // 2) Gmail exige base64url
  const encoded = raw.toString('base64')
                     .replace(/\+/g, '-')
                     .replace(/\//g, '_')
                     .replace(/=+$/, '');

  // 3) Enviar
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded }
  });
}


    //---------
    const TEST_TO  = 'comunicaicon@engloba.org.es';  // <- ¡ojo! comprueba la ortografía
const TEST_FN  = 'Equipo';                       // nombre para el saludo (firstName)

/* ────────────────────────────────────────────────────────────────────────────
   Plantillas
   ──────────────────────────────────────────────────────────────────────── */
function buildPlainText(name, corpEmail) {
  return `Hola ${name},\n\n` +
         `Bienvenido a tu nuevo correo electrónico de Asociación Engloba.\n\n` +
         `Esperamos que te sientas cómod@ en este nuevo entorno que te ofrecemos. ` +
         `Desde esta cuenta tendrás acceso al espacio de trabajo de nuestro equipo ` +
         `y a todas las ventajas de Google Workspace.\n\n` +
         `Tu nueva dirección es: ${corpEmail}\n\n` +
        `Accede a tu bandeja de entrada en https://mail.google.com\n\n` +
        `Tu dirección temporal es: Temporal123*` +
         `Departamento de Comunicación — Gustavo Lorca & Elisabeth D'Acosta`;
}

function buildHtmlEmail(name = '', corpEmail = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Bienvenido a Engloba</title>
  <style>
    body{margin:0;padding:0;background:#f4f6f9;color:#333;font-family:Arial,Helvetica,sans-serif;line-height:1.5}
    .container{max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.05)}
    .header{background:#50529f;color:#fff;text-align:center;padding:24px 16px}
    .header h1{margin:0;font-size:24px}
    .content{padding:32px 40px}
    .content p{margin:16px 0}
    h2{color:#50529f;font-size:18px;margin:24px 0 8px}
    .btn{display:inline-block;padding:12px 24px;margin:24px 0;background:#50529f;color:white;text-decoration:none;border-radius:4px;font-weight:bold}
    ul,ol{margin:8px 0 16px 24px}
    code{background:#eef1ff;padding:2px 4px;border-radius:4px;font-family:monospace}
    .footer{background:#f0f0f7;text-align:center;padding:20px;font-size:12px;color:#666}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>¡Bienvenid@, ${name}!</h1>
    </div>
    <div class="content">
      <p>Bienvenido a tu nuevo correo electrónico de <strong>Asociación Engloba</strong>. Esperamos que te sientas cómod@ en este nuevo entorno que te ofrecemos. Desde esta cuenta tendrás acceso al espacio de trabajo de nuestro equipo y a todas las ventajas de Google&nbsp;Workspace.</p>
      <p style="font-weight:bold">Tu nueva dirección es: ${corpEmail}</p>
      <p style="font-weight:bold">Tu contraseña temporal es: Temporal123*</p>
      <p style="text-align:center">
        <a href="https://mail.google.com/" class="btn">Acceder al gmail</a>
      </p>

      <h2>¿Qué tengo que hacer?</h2>
      <p>Si antes no accedías a ninguna cuenta <code>@engloba.org.es</code> no es necesario que hagas nada. Con tu nueva cuenta podrás enviar y recibir correos electrónicos y conectar con tus compañer@s.</p>

      <h2>¿Qué ocurre con mi mail anterior?</h2>
      <p>Las direcciones anteriores no se han perdido; simplemente se han trasladado a grupos o usuarios.</p>
      <p>Para ver los grupos a los que perteneces, visita <a href="https://groups.google.com/">Google&nbsp;Groups</a>.</p>
      <p>Si no estás segur@ de dónde encontrar tus correos archivados o necesitas acceso a otra dirección, ponte en contacto con nosotros y te ayudaremos.</p>

      <h2>¿Cómo puedo enviar mails desde la dirección anterior?</h2>
      <ol>
        <li>Abre Gmail en tu ordenador.</li>
        <li>Arriba a la derecha, haz clic en <em>Configuración ▸ Ver todos los ajustes</em>.</li>
        <li>Selecciona la pestaña <em>Cuentas e importación</em>.</li>
        <li>En la sección <em>Enviar como</em>, haz clic en <em>Añadir otra dirección de correo electrónico</em>.</li>
        <li>Introduce tu nombre y la dirección desde la que quieras enviar.</li>
        <li>Haz clic en <em>Siguiente paso ▸ Enviar verificación</em>.</li>
        <li>Entra en <a href="https://groups.google.com">Groups</a>, abre el grupo correspondiente y acepta la petición en <em>Conversaciones ▸ Pendiente</em>.</li>
      </ol>

      <h2>¿Llegan los mails a las direcciones antiguas?</h2>
      <p>Sí, los correos enviados a las direcciones de grupo llegarán automáticamente a todos los miembros correspondientes. Las direcciones asignadas a personas seguirán funcionando con normalidad.</p>

      <h2>¿Qué pasa con mis contactos?</h2>
      <p>Los contactos no se han transferido automáticamente. Escríbenos a <a href="mailto:web@engloba.org.es">web@engloba.org.es</a> y te explicaremos cómo importarlos.</p>

      <p>Sabemos que este cambio puede requerir un periodo de adaptación. Te invitamos a explorar la nueva plataforma y a aprovechar sus posibilidades. Por ejemplo, puedes crear una unidad de equipo en <a href="https://drive.google.com/">Google Drive</a> para gestionar documentos, plantillas, calendarios y más.</p>

      <p>¡Mucho éxito en esta nueva etapa!</p>
    </div>
    <div class="footer">
      Departamento de Comunicación — Gustavo Lorca · Elisabeth D'Acosta
    </div>
  </div>
</body>
</html>`;
}

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
// const emials=async () => {
// const subject = 'Tu nueva cuenta de Engloba y Google Workspace';

// const usuarios = await User.find({
//   employmentStatus: { $ne: 'ya no trabaja con nosotros' },
//   apafa: true,
// });

// for (const [index, user] of usuarios.entries()) {
//   const toPersonal = (user.email_personal || '').trim().toLowerCase();
//   if (!toPersonal) {
//     console.warn(`⚠︎ ${user._id} sin email_personal: omitido`);
//     continue;
//   }

//   const corpEmail = buildUserEmail(user);          // lo usarás dentro del cuerpo
//   const text = buildPlainText(user.firstName, corpEmail);
//   const html = buildHtmlEmail(user.firstName, corpEmail);

//   try {
//     await sendEmail(toPersonal, subject, text, html);
//     console.log(`✔︎ ${index + 1}/${usuarios.length} enviado a ${toPersonal}`);
//   } catch (err) {
//     console.error(`✘ Error enviando a ${toPersonal}:`, err.message);
//   }
// }

// }


// emials()
/* ────────────────────────────────────────────────────────────────────────────
   4. Exporta las dos utilidades
   ────────────────────────────────────────────────────────────────────────── */
module.exports = {
  sendEmail,          // firma idéntica a tu antiguo SMTP
  generateEmailHTML
};
