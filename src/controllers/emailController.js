const nodemailer = require('nodemailer');

const user=process.env.EMAIL
const pass=process.env.EMAIL_PASS
const host=process.env.EMAIL_HOST
const port=process.env.EMAIL_PORT

/**
 * Genera una plantilla HTML básica para correos.
 *
 * @param {Object} options - Parámetros para personalizar la plantilla.
 * @param {string} [options.logoUrl] - URL del logo que se mostrará arriba a la derecha.
 * @param {string} [options.title] - Título o encabezado principal del correo.
 * @param {string} [options.greetingName] - Nombre de la persona a la que se dirige el email.
 * @param {string} [options.bodyText] - Texto principal del mensaje (puede contener HTML).
 * @param {string} [options.highlightText] - Texto que quieres resaltar (por ejemplo, un código).
 * @param {string} [options.footerText] - Texto del pie de página.
 * @returns {string} - Devuelve el HTML completo en forma de string.
 */
function generateEmailHTML({
  logoUrl = "",
  title = "Notificación",
  greetingName = "",
  bodyText = "",
  highlightText = "",
  footerText = ""
} = {}) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <style>
        /* Estilos básicos (puedes adaptarlos a tus necesidades) */
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #333;
          background-color: #f5f5f5;
        }
        .header {
          text-align: left;
          padding: 10px 20px;
          background-color: #50529f;
          border-bottom: 1px solid #ddd;
          color:white;
        }
        .header img {
          height: 50px; /* Ajusta el tamaño del logo */
        }
        .content {
          margin: 20px;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 5px;
        }
        .content h1 {
          color: #333;
          margin-bottom: 10px;
        }
        .highlight {
          background-color: #eaf4ff;
          border-left: 4px solid  #50529f;
          padding: 10px;
          margin: 10px 0;
          font-weight: bold;
          font-size: 1.2em;
        }
        .footer {
          text-align: center;
          color: #888;
          font-size: 0.9em;
          margin: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        Asociación Engloba
      </div>
      <div class="content">
        <h1>${title}</h1>
        ${
          greetingName
            ? `<p>Hola ${greetingName},</p>`
            : ""
        }
        <p>${bodyText}</p>
        ${
          highlightText
            ? `<div class="highlight">${highlightText}</div>`
            : ""
        }
      </div>
      ${
        footerText
          ? `<div class="footer">${footerText}</div>`
          : ""
      }
    </body>
  </html>
  `;
}


async function sendEmail(to,subject,text,html) {
  try {
    // 1) Crea el transporte SMTP usando la configuración de Arsys
    const transporter = nodemailer.createTransport({
      host,   // SMTP de Arsys
      port,                          // Puerto SSL
      secure: true,                       // Requerido para el puerto 465 (SSL/TLS)
      auth: {
        user,    // Tu cuenta de correo completa
        pass             // Contraseña de la cuenta
      }
    });

    // 2) Define los detalles del correo
    const info = await transporter.sendMail({
      from: user, // Remitente
      to,              // Destinatario
      subject,
      text,
      html
    });

  } catch (error) {
    console.log(error)
    console.error('Error al enviar correo');
  }
}

// // Ejemplo de uso
//sendEmail('comunicacion@engloba.org.es', 'prueba', 'Cambio de contraseña', '<div>pepe</div>');


module.exports = {
    sendEmail,
    generateEmailHTML
  };