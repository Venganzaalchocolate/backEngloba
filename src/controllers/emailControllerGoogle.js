
const { google }   = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');

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

/* ────────────────────────────────────────────────────────────────────────────
   4. Exporta las dos utilidades
   ────────────────────────────────────────────────────────────────────────── */
module.exports = {
  sendEmail,          // firma idéntica a tu antiguo SMTP
  generateEmailHTML
};
