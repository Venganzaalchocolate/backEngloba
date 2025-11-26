function capitalizeWords(str = '') {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

export function buildSesameOpsPlainText(name = '', supportEmail = 'web@engloba.org.es') {
  return (
`Hola ${name},

Buenos días.

Después de los primeros días de toma de contacto, compartimos los problemas más comunes y cómo resolverlos.

📍 Conexiones en remoto
- Hubo fichajes “remoto” por direcciones de centros mal definidas. Ya se ajustaron.
- Todo el personal debe fichar dentro de su centro. Fuera del centro contará como “remoto”.
- Si se ficha desde el PC del centro debe aparecer como “local”.
- Si detectas un caso presencial marcado como “remoto”, avísanos para revisarlo.

🏖️ Vacaciones
- Anotar los DÍAS RESTANTES de vacaciones por trabajador:
  Empleados → Ausencias y Vacaciones → Vacaciones → icono lápiz → ajustar.
- Después, asignar los días de vacaciones correspondientes a cada empleado.

📝 Asuntos propios
- Se anotan desde Ausencias y Vacaciones:
  Selecciona el día en calendario → “Asignar Ausencia” → “Permiso” → tipo “Asuntos Propios”.

🧭 Tipos de ausencia diversos
- Para casos que no sean baja/excedencia puedes usar otros tipos.
- Si no existe el que necesitas (p. ej., reducción de jornada al X%): contáctanos y lo creamos.

🛠️ Errores en los fichajes
- Olvidos de entrada/salida o fichajes en otro lugar pueden ocurrir.
- Los trabajadores pueden solicitar modificaciones; llegan a la app y podéis gestionarlas desde ahí.

Poco a poco nos haremos con la aplicación. Para cualquier consulta, seguimos por aquí.

Un saludo,
Gustavo Lorca

Soporte: ${supportEmail}
Acceso web: https://app.sesametime.com
Android: https://play.google.com/store/apps/details?id=es.sesametime.mobile.v2
iOS: https://apps.apple.com/app/id1499352325`
  );
}


/* ─────────────────────────────────────────────────────────────
   Plantilla: Incidencias comunes y cómo resolverlas (Sesame)
   HTML con iconos y botones
   ──────────────────────────────────────────────────────────── */
export function buildSesameOpsHtmlEmail(
  name = '',
  {
    logoUrl = '',
    supportEmail = 'web@engloba.org.es'
  } = {}
) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Sesame HR · Incidencias comunes y cómo resolverlas</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  /* Reset básico */
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
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.2px;margin-left:8px;vertical-align:middle}
  .block{background:#f8f9ff;border:1px solid #e7e9ff;border-radius:10px;padding:14px 16px;margin:10px 0 18px}
  .kbd{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
       background:#f1f1f1;border-radius:6px;padding:2px 6px;border:1px solid #e5e5e5}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px}
  .btn-td{border-radius:40px;background:#4f529f}
  .btn-a{
    display:inline-block;padding:12px 22px;border-radius:40px;font-weight:700;
    color:#ffffff !important;text-decoration:none !important;
    background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
  }
  .btns-row{margin:16px 0 6px;text-align:center}
  .hint{font-size:14px;color:#555;margin-top:6px}
  a.link{color:#4f529f;font-weight:700;text-decoration:none}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : ''}
      <h1>Incidencias comunes y cómo resolverlas</h1>
      <div style="opacity:.9;font-size:14px;margin-top:6px">Sesame | Control horario y vacaciones</div>
    </div>

    <div class="content">
      <p>Hola Equipo</p>
      <p>Tras los primeros días de uso, compartimos los <strong>casos más comunes</strong> y las acciones recomendadas.</p>

      <h2>📍 Conexiones en remoto <span class="tag">Fichaje</span></h2>
      <div class="block">
        <ul>
          <li>Se detectaron fichajes “remoto” por direcciones de centros mal definidas. <strong>Ya están ajustadas</strong>.</li>
          <li>El personal debe fichar <strong>dentro de su centro</strong>; fuera contará como <em>remoto</em>.</li>
          <li>Si fichas con el <strong>PC del centro</strong>, debe aparecer como <em>local</em>.</li>
          <li>Si alguien presencial figura como “remoto”, <a class="link" href="mailto:${supportEmail}">avísanos</a> para revisarlo.</li>
        </ul>
      </div>

      <h2>🏖️ Vacaciones <span class="tag">Ausencias</span></h2>
      <div class="block">
        <ul>
          <li>Registrar los <strong>días RESTANTES</strong> de cada trabajador:
            <span class="kbd">Empleados → Ausencias y Vacaciones → Vacaciones → ✎</span></li>
          <li>Después, <strong>asignar</strong> los días de vacaciones correspondientes.</li>
        </ul>
      </div>

      <h2>📝 Asuntos propios <span class="tag">Permisos</span></h2>
      <div class="block">
        <ul>
          <li>Desde <span class="kbd">Ausencias y Vacaciones</span>, selecciona el día en el calendario →
            “<em>Asignar Ausencia</em>” → “<em>Permiso</em>” → tipo “<em>Asuntos Propios</em>”.</li>
        </ul>
      </div>

      <h2>🧭 Tipos de ausencia diversos</h2>
      <div class="block">
        <ul>
          <li>Para casos que no sean baja/excedencia hay otros tipos disponibles.</li>
          <li>Si no existe el que necesitas (p. ej., <em>reducción de jornada al X%</em>), <a class="link" href="mailto:${supportEmail}">contáctanos</a> y lo añadimos.</li>
        </ul>
      </div>

      <h2>🛠️ Errores en los fichajes</h2>
      <div class="block">
        <ul>
          <li>Puede haber olvidos de entrada/salida o fichajes desde otra ubicación.</li>
          <li>Los trabajadores pueden <strong>solicitar modificaciones</strong>; llegarán a la app y podréis gestionarlas desde ahí.</li>
        </ul>
      </div>

      <p class="hint">Poco a poco nos haremos con la aplicación. Para cualquier consulta, estamos disponibles.</p>
      <p>Un saludo,<br><strong>Gustavo Lorca</strong></p>

      <!-- Botones -->
      <div class="btns-row">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px auto">
          <tr><td class="btn-td">
            <a class="btn-a" href="https://app.sesametime.com" target="_blank">Abrir Sesame Web ▸</a>
          </td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:6px auto">
          <tr><td class="btn-td">
            <a class="btn-a" href="https://play.google.com/store/apps/details?id=es.sesametime.mobile.v2" target="_blank">Android ▸ Google Play</a>
          </td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:6px auto">
          <tr><td class="btn-td">
            <a class="btn-a" href="https://apps.apple.com/app/id1499352325" target="_blank">iOS ▸ App Store</a>
          </td></tr>
        </table>
        <p class="hint">Soporte: <a class="link" href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    </div>

    <div class="footer">
      Departamento de Comunicación — Gustavo Lorca · Elisabeth D'Acosta
    </div>
  </div>
</body>
</html>`;
}

export function buildSesamePlainText(name, corpEmail) {
  return (
`Hola ${name},

¡Estrenamos Sesame | Control horario y vacaciones!

TU CUENTA
• Correo corporativo: ${corpEmail}

¿DÓNDE FICHAR?
• App móvil “Sesame HR” → Android: https://play.google.com/store/apps/details?id=es.sesametime.mobile.v2
                               iOS:     https://apps.apple.com/app/id1499352325
• Versión web: https://app.sesametime.com

PRIMEROS PASOS
1) Recibirás hoy mismo un correo automático de Sesame.
   Pulsa «Crear contraseña» y elige la tuya.
2) Inicia sesión en la app o en la web con ${corpEmail}.
3) Concede permisos de ubicación y notificaciones.
4) Desde «Solicitudes» podrás pedir vacaciones y ausencias.

CÓMO FICHAR
— En la app —
  1) Abre Sesame HR y toca el botón verde «Fichar».
  2) Elige Entrada o Salida.
  3) Espera el aviso «Fichaje registrado».

— En la web —
  1) Entra en https://app.sesametime.com
  2) Haz clic en el círculo verde «Fichar» arriba a la derecha.
  3) Verás el registro y tu saldo actualizado.

Dudas → comunicaicon@engloba.org.es

Departamento de Comunicación — Gustavo Lorca & Elisabeth D'Acosta`
  );
}


export function buildSesameHtmlEmail(name = '', corpEmail = '', logoUrl = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Activa tu cuenta en Sesame HR</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:rgb(237,237,237);font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.5}
  .card{max-width:640px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:32px 24px}
  .header h1{font-size:26px;margin:0}
  .logo{max-width:120px;height:auto;margin-bottom:8px}
  .content{padding:36px 40px;font-size:16px}
  .content p{margin:18px 0}
  h2{color:#4f529f;font-size:20px;margin:32px 0 12px}
  .footer{background:#bec3f4;text-align:center;padding:24px 16px;font-size:13px}
  .btn-td{border-radius:40px;background:#4f529f}
  .btn-a{
    display:inline-block;padding:14px 28px;border-radius:40px;font-weight:700;
    color:#ffffff !important;text-decoration:none !important;
    background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
  }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo Engloba" class="logo">` : ''}
      <h1>¡Activa tu cuenta en Sesame!</h1>
    </div>

    <div class="content">
      <p>Hola ${name},</p>

      <p>Estamos implantando <strong>Sesame | Control horario y vacaciones</strong>.
         Con esta herramienta podrás fichar tu jornada, solicitar vacaciones y gestionar ausencias desde cualquier lugar.</p>

      <h2>Tu cuenta</h2>
      <p><strong>Correo corporativo:</strong> ${corpEmail}</p>

      <h2>¿Dónde fichar?</h2>
      <p>Descarga la app <strong>Sesame HR</strong> o usa la versión web:</p>

      <!-- Botones App -->
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:12px auto">
        <tr><td class="btn-td">
          <a class="btn-a" href="https://play.google.com/store/apps/details?id=es.sesametime.mobile.v2" target="_blank">Android ▸ Google Play</a>
        </td></tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 12px">
        <tr><td class="btn-td">
          <a class="btn-a" href="https://apps.apple.com/app/id1499352325" target="_blank">iOS ▸ App Store</a>
        </td></tr>
      </table>
      <p style="text-align:center;margin-bottom:24px">
        <a href="https://app.sesametime.com" target="_blank" style="color:#4f529f;font-weight:bold;text-decoration:none">Acceso web a Sesame</a>
      </p>

      <h2>Primeros pasos</h2>
      <ol style="margin-left:18px">
        <li>Recibirás un correo automático de Sesame. Haz clic en <em>Crear contraseña</em>.</li>
        <li>Inicia sesión en la app o en la web con <strong>${corpEmail}</strong>.</li>
        <li>Concede permisos de <em>ubicación</em> y <em>notificaciones</em> cuando la app lo solicite.</li>
        <li>Desde «<em>Solicitudes</em>» podrás pedir vacaciones y ausencias.</li>
      </ol>

      <h2>Cómo fichar</h2>

      <p><strong>En la app</strong></p>
      <ol style="margin-left:18px">
        <li>Abre Sesame HR y toca el botón verde <em>Fichar</em>.</li>
        <li>Elige <em>Entrada</em> o <em>Salida</em>.</li>
        <li>Espera la confirmación «Fichaje registrado».</li>
      </ol>

      <p><strong>En la versión web</strong></p>
      <ol style="margin-left:18px">
        <li>Accede a <a href="https://app.sesametime.com" target="_blank" style="color:#4f529f;font-weight:bold">app.sesametime.com</a>.</li>
        <li>Haz clic en el círculo verde <em>Fichar</em> (parte superior).</li>
        <li>Comprueba que el reloj y tu saldo de horas se actualizan.</li>
      </ol>

      <p>¿Dudas? Escríbenos a&nbsp;
        <a href="mailto:web@engloba.org.es" style="color:#4f529f;font-weight:bold">web@engloba.org.es</a>.
      </p>

      <p>¡Gracias por tu colaboración!</p>
    </div>

    <div class="footer">
      Departamento de Comunicación — Gustavo Lorca · Elisabeth D'Acosta
    </div>
  </div>
</body>
</html>`;
}

export function buildPlainText(name, corpEmail) {
  return (
`Hola ${name},

¡Bienvenid@ a Asociación Engloba!

— Credenciales —
• Dirección: ${corpEmail}
• Contraseña temporal: Temporal123*

— Google Groups —
Tu cuenta ya forma parte del grupo de tu dispositivo. Revísalo en https://groups.google.com

— Primeros pasos —
1) Inicia sesión en https://mail.google.com
2) Cambia tu contraseña
3) Activa la verificación en dos pasos: https://myaccount.google.com/security

Cualquier duda → comunicaicon@engloba.org.es

Departamento de Comunicación — Gustavo Lorca & Elisabeth D'Acosta`
  );
}

export function buildHtmlEmail(name = '', corpEmail = '', logoUrl = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Bienvenida Engloba</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:rgb(237,237,237);               /* gris claro */
      font-family:'Roboto',Arial,Helvetica,sans-serif;
      color:#333;
      line-height:1.5
    }
    /* TARJETA ------------------------------------------------------------ */
    .container{
      max-width:640px;
      margin:40px auto;
      background:#ffffff;
      border-radius:12px;
      overflow:hidden;
      box-shadow:0 8px 24px rgba(0,0,0,.08)
    }
    /* CABECERA ----------------------------------------------------------- */
    .header{
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%); /* morado → malva oscuro */
      color:#ffffff;
      text-align:center;
      padding:32px 24px
    }
    .header h1{font-size:28px;letter-spacing:.5px;margin:0}
    .logo{max-width:120px;height:auto;margin-bottom:8px}
    /* CONTENIDO ---------------------------------------------------------- */
    .content{padding:36px 40px;font-size:16px}
    .content p{margin:18px 0}
    h2{color:#4f529f;font-size:20px;margin:32px 0 12px}          /* morado */
    .emoji{font-size:20px;margin-right:6px}
    /* BOTÓN -------------------------------------------------------------- */
    .btn{
      display:inline-block;
      margin:32px 0;
      padding:14px 28px;
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
      color:#ffffff;
      text-decoration:none;
      border-radius:40px;
      font-weight:700;
      transition:opacity .3s
    }
    .btn:hover{opacity:.88}
    /* FOOTER ------------------------------------------------------------- */
    .footer{
      background:#bec3f4;                       /* malva suave */
      text-align:center;
      padding:24px 16px;
      font-size:13px;
      color:#333
    }
    /* DARK MODE ---------------------------------------------------------- */
    @media(prefers-color-scheme:dark){
      body{background:#1e1f2b;color:#e8e8e8}
      .container{background:#252636}
      .footer{background:#1b1c27;color:#aaa}
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo Engloba" class="logo">` : ''}
      <h1>¡Bienvenid@, ${name}!</h1>
    </div>

    <div class="content">
      <p>Desde hoy formas parte de <strong>Asociación Engloba</strong>. Con tu nueva cuenta tendrás acceso al espacio de trabajo del equipo y a todas las herramientas de Google&nbsp;Workspace.</p>
      
      <h2><span class="emoji">🔑</span> Credenciales</h2>
      <p><strong>Dirección:</strong> ${corpEmail}<br>
         <strong>Contraseña temporal:</strong> <code>Temporal123*</code></p>

      <h2><span class="emoji">👥</span> Google Groups</h2>
      <p>Tu cuenta ya se ha añadido al grupo de tu dispositivo. Compruébalo en&nbsp;
        <a href="https://groups.google.com/" target="_blank" style="color:#4f529f;font-weight:bold">Google Groups</a>.
      </p>

      <h2><span class="emoji">🚀</span> Primeros pasos</h2>
      <ol style="margin-left:18px">
        <li>Inicia sesión en <a href="https://mail.google.com/" target="_blank" style="color:#4f529f;font-weight:bold">Gmail</a> con la contraseña temporal.</li>
        <li>Cambia tu contraseña cuando el sistema te lo solicite.</li>
        <li>Activa la <strong>verificación en dos pasos</strong> en&nbsp;
          <a href="https://myaccount.google.com/security" target="_blank" style="color:#4f529f;font-weight:bold">tu página de seguridad de Google</a>.
        </li>
      </ol>

      <p style="text-align:center">
        <a href="https://mail.google.com/"
         target="_blank"
         style="
           display:inline-block;
           padding:14px 28px;
           font-family:'Roboto',Arial,Helvetica,sans-serif;
           font-size:16px;
           line-height:20px;
           color:#ffffff !important;
           text-decoration:none !important;
           background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
           border-radius:40px;">
        Acceder a Gmail
      </a>
      </p>

      <p>¿Necesitas ayuda? Escribe a 
        <a href="mailto:comunicaicon@engloba.org.es" style="color:#4f529f;font-weight:bold">comunicaicon@engloba.org.es</a>.
      </p>

      <p>¡Nos alegra tenerte en el equipo!</p>
    </div>

    <div class="footer">
      Departamento de Comunicación — Gustavo Lorca · Elisabeth D'Acosta
    </div>
  </div>
</body>
</html>`;
}

/* ──────────────────────────────────────────────────────────────────
   Notificación a responsable: nueva solicitud de trabajador
   - Texto plano
   - HTML "bonito" con cabecera morada y botón de acción
   Parámetros esperados en ambas funciones (objeto options):
   {
     approverName: 'María Pérez',
     workerFullName: 'Juan López',
     dni: '12345678A',
     deviceName: 'Hogar Sevilla 1',
     requestType: 'datos' | 'documentos',   // o 'mixta'
     submittedAt: '2025-03-01T12:34:00Z',    // opcional
     note: 'Comentario opcional del trabajador',
     changes: [                              // opcional
       { label: 'Teléfono personal', from: '600000000', to: '699999999' },
       { label: 'Email personal', from: 'a@b.com', to: 'c@d.com' },
     ],
     documents: [                            // opcional
       { name: 'CURRICULUM', kind: 'Oficial', date: '2025-02-20', description: '' },
       { name: 'Certificado curso PRL', kind: 'Varios', date: '2025-02-01', description: '20h' },
     ],
     actionUrl: 'https://tuapp.interno/solicitudes/abc123', // botón CTA
     logoUrl: 'https://tudominio/logo.png',  // opcional (HTML)
     supportEmail: 'soporte@tudominio.com'   // opcional
   }
   ────────────────────────────────────────────────────────────────── */

export function buildChangeRequestNotificationPlainText(opts = {}) {
  const {
    approverName = '',
    workerFullName = '',
    dni = '',
    deviceName = '',
    requestType = 'documentos',
    submittedAt,
    note,
    changes = [],
    documents = [],
    actionUrl = '',
    supportEmail = 'soporte@tudominio.com',
  } = opts;

  const t = requestType === 'datos' ? 'cambio de datos'
          : requestType === 'mixta' ? 'cambio de datos y documentación'
          : 'documentación';

  const when = submittedAt ? new Date(submittedAt).toLocaleString('es-ES') : null;

  const lines = [];
  if (Array.isArray(changes) && changes.length) {
    lines.push('\nCambios solicitados:');
    for (const c of changes) {
      lines.push(`• ${c?.label || 'Campo'}: ${c?.from ?? '—'} → ${c?.to ?? '—'}`);
    }
  }
  if (Array.isArray(documents) && documents.length) {
    lines.push('\nDocumentos adjuntos:');
    for (const d of documents) {
      const fecha = d?.date ? ` · Fecha: ${d.date}` : '';
      const tipo  = d?.kind ? ` · Tipo: ${d.kind}` : '';
      const desc  = d?.description ? ` · ${d.description}` : '';
      lines.push(`• ${d?.name || 'Documento'}${tipo}${fecha}${desc}`);
    }
  }

  return (
`Hola ${approverName || 'equipo'},

El/la trabajador/a ${workerFullName} (DNI ${dni}), que actualmente trabaja en el dispositivo «${deviceName}», ha enviado una solicitud de ${t}.${when ? `\nFecha de envío: ${when}.` : ''}

${note ? `Nota del trabajador: ${note}\n` : ''}${lines.length ? lines.join('\n') + '\n\n' : '\n'}
${actionUrl ? `Revisar solicitud: ${actionUrl}\n` : ''} 
Para cualquier duda, escribe a ${supportEmail}.

Un saludo.`
  );
}


/* ─────────────────────────────────────────────────────────────
   HTML bonito con chip de tipo, lista de cambios/docs y botón
   ──────────────────────────────────────────────────────────── */
export function buildChangeRequestNotificationHtml(opts = {}) {
  const {
    approverName = '',
    workerFullName = '',
    dni = '',
    deviceName = '',
    requestType = 'documentos',
    submittedAt,
    note,
    changes = [],
    documents = [],
    actionUrl = '',
    logoUrl = '',
    supportEmail = 'soporte@tudominio.com',
  } = opts;

  // Paleta corporativa
  const COLORS = {
    morado: '#4f529f',       // principal
    malva: '#bec3f4',
    chicle: '#e08fa7',
    verde: '#94aa51',
    yema: '#f5b136',
    naranja: '#f3853a',
    rosa: '#eddcf2',
    crema: '#f5dc98',
  };

  const tTxt = requestType === 'datos' ? 'Cambio de datos'
           : requestType === 'mixta' ? 'Datos + Documentación'
           : 'Documentación';

  const when = submittedAt ? new Date(submittedAt).toLocaleString('es-ES') : '';

  // Colores de chip según tipo
  const chipColor = requestType === 'datos' ? COLORS.verde
                   : requestType === 'mixta' ? COLORS.yema
                   : COLORS.morado;

  const renderChanges = (arr = []) => {
    if (!arr.length) return '';
    return `
      <h3>Cambios solicitados</h3>
      <ul class="list">
        ${arr.map(c => `
          <li>
            <span class="label">${c?.label || 'Campo'}</span>
            <span class="arrow">→</span>
            <span class="val">${c?.from ?? '—'}</span>
            <span class="sep">→</span>
            <span class="val to">${c?.to ?? '—'}</span>
          </li>
        `).join('')}
      </ul>
    `;
  };

  const renderDocs = (arr = []) => {
    if (!arr.length) return '';
    return `
      <h3>Documentos adjuntos</h3>
      <ul class="list">
        ${arr.map(d => `
          <li>
            <span class="label">${d?.name || 'Documento'}</span>
            ${d?.kind ? `<span class="pill">${d.kind}</span>` : ''}
            ${d?.date ? `<span class="meta">· ${d.date}</span>` : ''}
            ${d?.description ? `<div class="desc">${d.description}</div>` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Nueva solicitud de ${workerFullName}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  /* Reset básico */
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f0f2f7;font-family:'Roboto',Arial,sans-serif;color:#2a2a2a;line-height:1.55}

  /* Card */
  .card{max-width:720px;margin:36px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.08)}

  /* Header con colores corporativos */
  .header{
    background:linear-gradient(90deg, #4f529f 0%, #bec3f4 100%);
    color:#fff;padding:28px 24px;text-align:center
  }
  .logo{max-width:120px;margin:0 auto 8px;display:block}
  .title{font-size:22px;font-weight:700;margin-top:2px}

  .content{padding:28px 32px}
  .hello{margin-bottom:10px}

  /* Summary usando malva muy claro */
  .summary{
    background:rgba(190,195,244,0.20);
    border:1px solid rgba(79,82,159,0.18);
    border-radius:12px;padding:14px 16px;margin:12px 0 18px
  }
  .row{margin:6px 0}

  /* Línea de "Solicitud" – mayor compatibilidad email (sin flex) */
  .tag{display:inline-block;white-space:nowrap}
  .tag strong,.chip,.meta{display:inline-block;vertical-align:middle}
  .tag strong{margin-right:6px}

  /* Chip corregido (sin margen que lo desalineaba) */
  .chip{
    padding:6px 10px;border-radius:999px;background:${chipColor};
    color:#fff;font-weight:700;font-size:12px;letter-spacing:.2px;line-height:1
  }
  .meta{font-size:13px;color:#555;margin-left:10px}

  h3{color:#4f529f;font-size:16px;margin:18px 0 10px}
  .list{margin:0 0 10px 18px}
  .list li{margin:8px 0}
  .label{font-weight:700}
  .arrow,.sep{opacity:.65;margin:0 6px}
  .val{font-family:ui-monospace,Menlo,Consolas,monospace;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:1px 6px}
  .val.to{background:#eef0ff;border-color:#dfe2ff}

  /* Píldoras y detalles con morado/malva */
  .pill{
    display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;
    background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;font-size:12px;font-weight:700
  }
  .desc{font-size:14px;color:#444;margin-top:4px}

  /* Botón con gradiente corporativo */
  .btns{margin:18px 0 6px;text-align:center}
  .btn{
    display:inline-block;padding:12px 22px;border-radius:40px;font-weight:700;
    color:#fff !important;text-decoration:none !important;
    background:linear-gradient(90deg,#4f529f 0%,#bec3f4 100%)
  }

  .footer{background:#e9ebff;text-align:center;padding:16px;font-size:13px;color:#444}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Logo">` : ''}
      <div class="title">Nueva solicitud del trabajador</div>
    </div>

    <div class="content">
      <p class="hello">Hola ${approverName || 'equipo'},</p>
      <div class="summary">
        <div class="row"><strong>Trabajador/a:</strong> ${workerFullName}</div>
        <div class="row"><strong>DNI:</strong> ${dni}</div>
        <div class="row"><strong>Dispositivo:</strong> ${deviceName}</div>
        <div class="row tag">
          <strong>Solicitud:</strong>
          <span class="chip">${tTxt}</span>
          ${when ? `<span class="meta">Enviada: ${when}</span>` : ''}
        </div>
        ${note ? `<div class="row"><strong>Nota del trabajador:</strong> ${note}</div>` : ''}
      </div>

      ${renderChanges(changes)}
      ${renderDocs(documents)}

      <div class="btns">
        ${actionUrl ? `<a class="btn" href="${actionUrl}" target="_blank" rel="noopener">Revisar solicitud ▸</a>` : ''}
        <div style="margin-top:10px;font-size:13px;color:#555">
          Soporte: <a href="mailto:${supportEmail}" style="color:#4f529f;text-decoration:none;font-weight:700">${supportEmail}</a>
        </div>
      </div>
    </div>

    <div class="footer">
      Este mensaje se generó automáticamente desde el panel de solicitudes.
    </div>
  </div>
</body>
</html>`;
}

export function buildMissingDniPlainText(name = '', phone = '', supportEmail = 'comunicacion@engloba.org.es') {
  return (
`Hola ${name},

Hace un tiempo nos enviaste tu currículum a Asociación Engloba.

Desde entonces hemos actualizado nuestro sistema de gestión y ahora necesitamos que todos los candidatos dispongan de un número de DNI o NIE asociado a su ficha.

Si sigues interesado/a en participar en nuestros procesos de selección, por favor vuelve a enviar tu currículum a través del siguiente enlace, usando el mismo número de teléfono (${phone}) con tus datos actualizados:

https://engloba.org.es/trabajaconnosotros

Muchas gracias por tu colaboración y disculpa las molestias.

Un cordial saludo,  
Equipo de Recursos Humanos  
Asociación Engloba  
${supportEmail}`
  );
}


export function buildMissingDniHtmlEmail(name = '', phone = '', {
  logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
  supportEmail = 'comunicacion@engloba.org.es'
} = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Actualiza tu currículum en Asociación Engloba</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f3f4f8;font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.6}
  .card{max-width:640px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:28px 24px}
  .header h1{font-size:24px;margin:6px 0 0}
  .logo{max-width:120px;height:auto;margin-bottom:8px}
  .content{padding:36px 40px;font-size:16px}
  .content p{margin:18px 0}
  .btn{display:inline-block;padding:12px 24px;border-radius:40px;background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
       color:#fff;text-decoration:none;font-weight:700}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo Engloba" class="logo" />` : ''}
      <h1>Actualiza tu currículum</h1>
    </div>
    <div class="content">
      <p>Buenos días,  ${capitalizeWords(name)}:</p>

      <p>Hace un tiempo nos enviaste tu currículum a <strong>Asociación Engloba</strong>.</p>

      <p>Desde entonces hemos mejorado nuestro sistema de gestión y ahora necesitamos que todos los candidatos incluyan su <strong>DNI o NIE</strong> en la ficha personal.</p>

      <p>Si aún estás interesado/a en participar en nuestros procesos de selección, por favor vuelve a enviar tu currículum actualizado usando el mismo número de teléfono <strong>${phone}</strong>:</p>

      <p style="text-align:center;margin:24px 0;">
        <a href="https://app.engloba.org.es/trabajaconnosotros" target="_blank" class="btn" style="color:#fff;text-decoration:none;font-weight:700">Actualizar currículum ▸</a>
      </p>

      <p>Gracias por tu colaboración y disculpa las molestias.</p>

      <p>Un cordial saludo,<br><strong>Equipo de Recursos Humanos</strong><br>Asociación Engloba</p>

      <p style="font-size:14px;color:#555;margin-top:16px;">
        Contacto: <a href="mailto:${supportEmail}" style="color:#4f529f;text-decoration:none;">${supportEmail}</a>
      </p>
    </div>

    <div class="footer">
      © ${new Date().getFullYear()} Asociación Engloba
    </div>
  </div>
</body>
</html>`;
}

// BIENVENIDA NUEVOS TRABAJADORES
// ===============================

export function buildWelcomeWorkerPlainText(
  name = '',
  corpEmail = '',
  {
    supportEmail = 'comunicacion@engloba.org.es',
    signatureTutorialUrl = 'https://drive.google.com/file/d/1GdrepisAPPiW9eAl8-S2t3-knKceC6ia/view?usp=sharing'
  } = {}
) {
  return (
`Hola ${name},

¡Bienvenid@ a Asociación Engloba!

— Tu cuenta de acceso —
• Correo corporativo: ${corpEmail}
• Contraseña (solo la primera vez que incies sesión): Temporal123*
• Acceso a Gmail: https://mail.google.com


— Primeros pasos —
1) Entra en Gmail con tu cuenta (${corpEmail}).
2) Cambia tu contraseña cuando el sistema te lo pida.
3) Activa la verificación en dos pasos:
   https://myaccount.google.com/security

— Firma de correo electrónico —
Para mantener la imagen corporativa unificada, configura tu firma en Gmail.

1) Sigue el vídeo tutorial:
   ${signatureTutorialUrl}

2) Usa Mozilla Firefox para abrir el archivo de firma:
   https://www.mozilla.org/es-ES/firefox/new/

3) Descarga la firma del área en la que trabajas
   (Desarrollo Comunitario, Igualdad, Infancia y Juventud,
   LGTBIQ+, Mayores, Discapacidad, Migraciones, etc.).

4) Ábrela con Firefox, pulsa Ctrl + A y luego Ctrl + C.

5) En Gmail:
   Configuración → Ver toda la configuración → Firma
   • Crea una firma nueva y pega el contenido (Ctrl + V).
   • Guarda los cambios y márcala como predeterminada.

Si tienes dudas, escribe a: ${supportEmail}

Nos alegra tenerte en el equipo.

Un saludo,
Departamento de Comunicación
Asociación Engloba`
  );
}


export function buildWelcomeWorkerHtmlEmail(
  name = '',
  corpEmail = '',
  {
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    supportEmail = 'comunicacion@engloba.org.es',
    signatureTutorialUrl = 'https://drive.google.com/file/d/1GdrepisAPPiW9eAl8-S2t3-knKceC6ia/view?usp=sharing'
  } = {}
) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Bienvenida Engloba</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:#ededed;
      font-family:'Roboto',Arial,Helvetica,sans-serif;
      color:#333;
      line-height:1.5;
      -webkit-text-size-adjust:100%;
    }
    .container{
      max-width:640px;
      margin:40px auto;
      background:#ffffff;
      border-radius:8px;
      overflow:hidden;
      box-shadow:0 8px 24px rgba(0,0,0,.08);
    }
    .header{
      background:#50529f;
      color:#ffffff;
      text-align:center;
      padding:24px;
    }
    .logo{
      width:180px;
      height:auto;
      margin:0 auto 8px;
      display:block;
    }
    .content{
      padding:32px 24px 8px;
      font-size:16px;
    }
    .content p{margin:12px 0 0;color:#666666;}
    h1{
      margin:0;
      font-size:26px;
      color:#333333;
    }
    h2{
      margin:24px 0 8px;
      font-size:18px;
      color:#4f529f;
    }
    ol{
      margin:8px 0 0 20px;
      font-size:15px;
      color:#555555;
      line-height:1.6;
    }
    a.link{
      color:#4f529f;
      text-decoration:none;
      font-weight:600;
    }
    .btn-primary{
      display:inline-block;
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
      color:#ffffff !important;
      text-decoration:none;
      font-size:15px;
      padding:13px 26px;
      border-radius:40px;
      font-weight:700;
    }
    .block{
      background:#f5f7fa;
      padding:24px;
    }
    .block-inner{
      padding:8px 0 0;
    }
    .area-table td{
      padding:6px 0;
    }
    .btn-area{
      display:inline-block;
      color:#ffffff !important;
      text-decoration:none;
      font-size:14px;
      padding:12px 18px;
      border-radius:4px;
    }
    .footer{
      padding:20px;
      text-align:center;
      font-size:14px;
      color:#888888;
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- CABECERA -->
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
    </div>

    <!-- BLOQUE BIENVENIDA -->
    <div class="content">
      <h1>¡Bienvenid@ a Asociación Engloba, ${name}!</h1>
      <p>
        Desde el Departamento de Comunicación queremos darte la bienvenida a
        <b>Asociación Engloba</b>. A partir de ahora formarás parte de nuestro equipo y tendrás acceso
        al espacio de trabajo corporativo a través de <b>Google&nbsp;Workspace</b>.
      </p>

      <h2>Tus datos de acceso</h2>
      <p>
        <b>Correo corporativo:</b> ${corpEmail}<br>
        <b>Contraseña (solo la primera vez que inicies sesión):</b> Temporal123*<br>
        <b>Acceso a Gmail:</b>
        <a href="https://mail.google.com" target="_blank" class="link">
          https://mail.google.com
        </a>
      </p>

      <h2>Primeros pasos</h2>
      <ol>
        <li>Cierra sesión en gmail (si tienes una abierta).</li>
        <li>Accede a <b>Gmail</b> con tu cuenta corporativa (<b>${corpEmail}</b>).</li>
        <li>Cambia tu contraseña cuando el sistema te lo solicite.</li>
        <li>
          Activa la <b>verificación en dos pasos</b> desde
          <a href="https://myaccount.google.com/security" target="_blank" class="link">
            tu página de seguridad de Google
          </a>.
        </li>
      </ol>
    </div>

    <!-- BOTÓN ACCESO GMAIL -->
    <div style="padding:4px 24px 24px;text-align:center">
      <a href="https://mail.google.com" target="_blank" class="btn-primary">
        Acceder a Gmail ▸
      </a>
    </div>

    <!-- BLOQUE FIRMA: INTRO -->
    <div style="padding:8px 24px 8px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#333333">
        Configura tu firma de correo corporativa
      </h2>
      <p style="margin:8px 0 0;font-size:16px;color:#666666">
        Para mantener una <b>imagen corporativa unificada</b>, es muy importante que añadas la
        <b>firma de Asociación Engloba</b> a tu correo.
      </p>
      <p style="margin:8px 0 0;font-size:16px;color:#666666">
        Hemos preparado un <span style="background:#cc0000;color:#ffffff;padding:0 4px"><b>video tutorial</b></span>
        con todos los pasos:
      </p>
      <p style="margin:8px 0 0;font-size:16px;font-weight:bold">
        <a href="${signatureTutorialUrl}"
           target="_blank"
           style="color:#ffffff !important;text-decoration:none;background:#cc0000;padding:2px 4px;border-radius:3px;">
          ${signatureTutorialUrl}
        </a>
      </p>
      <p style="margin:8px 0 0;font-size:14px;color:#666666">
        <b>Importante:</b> el proceso debe hacerse con
        <a href="https://www.mozilla.org/es-ES/firefox/new/" target="_blank" class="link">
          Mozilla Firefox
        </a>, ya que en algunos casos <b>Chrome</b> no aplica bien las firmas.
      </p>
    </div>

    <!-- BLOQUE FIRMA: BOTONES ÁREAS -->
    <div style="padding:8px 24px 24px">
      <p style="margin:0 0 8px;font-size:15px;color:#555555">
        Descarga la firma del área en la que trabajas y sigue las instrucciones del vídeo (todos los archivos se deben abrir con el navegador firefox):
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="area-table">
        <tbody>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#f0843a"
                 href="https://drive.google.com/file/d/1H9TETP15Z36IN30UHbgDs4LKFEUGTh_e/view?usp=drive_link"
                 target="_blank">
                Descargar firma Desarrollo Comunitario
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#2d3272"
                 href="https://drive.google.com/file/d/1d4fyoNK5c2PK8HlhISAtRPR7co2TuUro/view?usp=drive_link"
                 target="_blank">
                Descargar firma Igualdad
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#7881c1"
                 href="https://drive.google.com/file/d/1clRROeKWr3H_p0kkQCXeGEbluPM79g0y/view?usp=drive_link"
                 target="_blank">
                Descargar firma Infancia y Juventud
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#c9839a"
                 href="https://drive.google.com/file/d/1y8COiP1ctXzYUwxOxn9UOQPpq2ygDNmi/view?usp=drive_link"
                 target="_blank">
                Descargar firma LGTBIQ+
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#94aa51"
                 href="https://drive.google.com/file/d/1rauASCtUmH_4OqEnSAinBG2yPGH5c6M_/view?usp=drive_link"
                 target="_blank">
                Descargar firma Mayores
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#d4556a"
                 href="https://drive.google.com/file/d/1mbAOZDGi7ezaqrEXqimOxUT9o8tZKayi/view?usp=drive_link"
                 target="_blank">
                Descargar firma Discapacidad
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <a class="btn-area"
                 style="background:#26aecc"
                 href="https://drive.google.com/file/d/1IvcWdpxeyyzu-RN3DcyubStBu3fcTZll/view?usp=sharing"
                 target="_blank">
                Descargar firma Migraciones
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <p style="margin:16px 0 0;font-size:13px;color:#999999">
        *Si los enlaces no se abren, descarga los archivos adjuntos al ordenador y ábrelos con doble clic.<br>
        (Cuando abras la firma, ábrela con Firefox y copia el contenido desde allí).
      </p>
    </div>

    <!-- INSTRUCCIONES FINALES FIRMA EN GMAIL -->
    <div class="block">
      <h2 style="margin:0 0 10px;font-size:18px;color:#333333">
        Cómo añadir la firma en Gmail
      </h2>
      <div class="block-inner">
        <ol>
          <li>Haz doble clic en el archivo <i>.html</i> de la firma. Se abrirá en Firefox.</li>
          <li>Pulsa <b>Ctrl + A</b> para seleccionar todo y luego <b>Ctrl + C</b> para copiar.</li>
          <li>En Gmail ve a <b>Configuración &gt; Ver toda la configuración &gt; Firma</b>.</li>
          <li>Haz clic en <b>Crear</b>, pon un nombre (por ejemplo, el área en la que trabajas) y pega con <b>Ctrl + V</b>.</li>
          <li>Guarda los cambios y selecciona esa firma como predeterminada para tu cuenta.</li>
        </ol>
        <p style="margin:10px 0 0;font-size:14px;color:#666666">
          <b>Tip:</b> Al redactar un correo, también puedes cambiar de firma desde el menú “Insertar firma”.
        </p>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      ¡Nos alegra tenerte en el equipo!<br>
      <b>Departamento de Comunicación · Asociación Engloba</b><br>
      <span style="font-size:13px;">
        Soporte: <a href="mailto:${supportEmail}" style="color:#4f529f;text-decoration:none;">${supportEmail}</a>
      </span>
    </div>

  </div>
</body>
</html>`;
}
