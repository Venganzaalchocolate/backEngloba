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

Dudas → comunicacion@engloba.org.es

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

Cualquier duda → comunicacion@engloba.org.es

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
        <a href="mailto:comunicacion@engloba.org.es" style="color:#4f529f;font-weight:bold">comunicacion@engloba.org.es</a>.
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
    timeOff = null,             // 👈 NUEVO: resumen de vacaciones/asuntos propios
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

  // Texto del chip según tipo de solicitud
  const TYPE_LABELS = {
    datos: 'Cambio de datos',
    mixta: 'Datos + Documentación',
    documentos: 'Documentación',
    vacation: 'Vacaciones',
    personal: 'Asuntos propios',
  };

  const tTxt = TYPE_LABELS[requestType] || 'Solicitud';

  const when = submittedAt ? new Date(submittedAt).toLocaleString('es-ES') : '';

  // Colores de chip según tipo
  const chipColor =
    requestType === 'datos'
      ? COLORS.verde
      : requestType === 'mixta'
      ? COLORS.yema
      : requestType === 'vacation'
      ? COLORS.verde
      : requestType === 'personal'
      ? COLORS.naranja
      : COLORS.morado;

  const renderChanges = (arr = []) => {
    if (!arr.length) return '';
    return `
      <h3>Cambios solicitados</h3>
      <ul class="list">
        ${arr
          .map(
            (c) => `
          <li>
            <span class="label">${c?.label || 'Campo'}</span>
            <span class="arrow">→</span>
            <span class="val">${c?.from ?? '—'}</span>
            <span class="sep">→</span>
            <span class="val to">${c?.to ?? '—'}</span>
          </li>
        `
          )
          .join('')}
      </ul>
    `;
  };

  const renderDocs = (arr = []) => {
    if (!arr.length) return '';
    return `
      <h3>Documentos adjuntos</h3>
      <ul class="list">
        ${arr
          .map(
            (d) => `
          <li>
            <span class="label">${d?.name || 'Documento'}</span>
            ${d?.kind ? `<span class="pill">${d.kind}</span>` : ''}
            ${d?.date ? `<span class="meta">· ${d.date}</span>` : ''}
            ${d?.description ? `<div class="desc">${d.description}</div>` : ''}
          </li>
        `
          )
          .join('')}
      </ul>
    `;
  };

  // 🔹 Bloque específico para vacaciones / asuntos propios
  const renderTimeOff = (t) => {
    if (!t) return '';
    const rangeText =
      t.range && t.daysCount > 1
        ? ` (${t.range})`
        : t.range && t.daysCount === 1
        ? ` (${t.range})`
        : '';
    return `
      <h3>${t.kindLabel}</h3>
      <p style="margin-bottom:10px;">
        Días solicitados: <strong>${t.daysCount}</strong>${rangeText}
      </p>
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

  /* Línea de "Solicitud" */
  .tag{display:inline-block;white-space:nowrap}
  .tag strong,.chip,.meta{display:inline-block;vertical-align:middle}
  .tag strong{margin-right:6px}

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

  .pill{
    display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;
    background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;font-size:12px;font-weight:700
  }
  .desc{font-size:14px;color:#444;margin-top:4px}

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

      ${renderTimeOff(timeOff)}
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
    signatureTutorialUrl = 'https://drive.google.com/file/d/1GdrepisAPPiW9eAl8-S2t3-knKceC6ia/view?usp=sharing',
    appUrl = 'https://app.engloba.org.es'
  } = {}
) {
  return (
`Hola ${name},

¡Bienvenid@ a Asociación Engloba!

— Tu cuenta de acceso —
• Correo corporativo: ${corpEmail}
• Contraseña (solo la primera vez que inicies sesión): Temporal123*
• Acceso a Gmail: https://mail.google.com

— Primeros pasos —
1) Cierra sesión en Gmail si tienes otra cuenta abierta.
2) Entra en Gmail con tu cuenta (${corpEmail}).
3) Cambia tu contraseña cuando el sistema te lo pida.
4) Activa la verificación en dos pasos:
   https://myaccount.google.com/security

— Acceso a tu panel de empleado —
Además del correo corporativo, tendrás acceso a tu panel de empleado en la aplicación interna de Asociación Engloba:

${appUrl}

Dentro del panel “Mis Datos” podrás consultar y gestionar tu información personal, documentación, nóminas, vacaciones/asuntos propios y firma.

— Documentación y firma en la plataforma —
Si tienes documentación pendiente, deberás revisarla desde tu panel de empleado.

Es especialmente importante que firmes, cuanto antes, los documentos de Prevención de Riesgos Laborales:

• Información PRL - puesto de trabajo (Deben tener un botón que ponga FIRMAR)
• Consentimiento / renuncia del reconocimiento médico (Deben tener un botón que ponga FIRMAR)

Estos documentos se firman directamente desde la plataforma de Engloba.

IMPORTANTE:
Antes de firmar cualquier documento, primero debes subir la rúbrica de tu firma desde:

Mis Datos → Firma

Pasos:
1) Entra en la app: ${appUrl}
2) Ve a “Mis Datos”
3) Abre el apartado “Firma”
4) Dibuja tu firma y pulsa “Guardar”
5) Después vuelve al apartado de documentación y firma los documentos pendientes

Si no guardas antes tu firma, la plataforma no podrá generar correctamente la firma de los documentos.

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
    signatureTutorialUrl = 'https://drive.google.com/file/d/1GdrepisAPPiW9eAl8-S2t3-knKceC6ia/view?usp=sharing',
    appUrl = 'https://app.engloba.org.es'
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

        <!-- BLOQUE PANEL DE EMPLEADO / DOCUMENTACIÓN / FIRMA -->
    <div style="padding:8px 24px 24px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#333333">
        Acceso a tu panel de empleado
      </h2>

      <p style="margin:8px 0 0;font-size:16px;color:#666666">
        Además del correo corporativo, tendrás acceso a tu <b>panel de empleado</b> en la aplicación interna de
        <b>Asociación Engloba</b>.
      </p>

      <p style="margin:12px 0 0;font-size:16px;color:#666666">
        Desde el apartado <b>“Mis Datos”</b> podrás consultar y gestionar tu información personal,
        documentación, nóminas, vacaciones/asuntos propios y firma.
      </p>

      <div style="text-align:center;margin:20px 0 8px">
        <a href="${appUrl}" target="_blank" class="btn-primary">
          Acceder a la app ▸
        </a>
      </div>

     <div style="background:#f8f9ff;border:1px solid #e4e7ff;border-radius:10px;padding:18px;margin:20px 0 0">
  <h2 style="margin:0 0 10px;font-size:18px;color:#4f529f">
    Documentación y firma en la plataforma
  </h2>

  <p style="margin:8px 0 0;font-size:15px;color:#555555">
    Si tienes documentación pendiente, deberás revisarla desde tu panel de empleado.
  </p>

<p style="margin:10px 0 0;font-size:15px;color:#555555">
  Es especialmente importante que revises el apartado de documentación y firmes los siguientes documentos de
  <b>Prevención de Riesgos Laborales</b>. Ambos deberán aparecer con el botón
  <span style="
    display:inline-block;
    background:#4f529f;
    color:#ffffff;
    font-size:12px;
    font-weight:700;
    padding:4px 10px;
    border-radius:4px;
    margin:0 3px;
  ">Firmar</span>
  en la plataforma:
</p>

<ul style="margin:10px 0 0 20px;font-size:15px;color:#555555;line-height:1.6">
  <li><b>Información PRL - puesto de trabajo</b></li>
  <li><b>Consentimiento / renuncia del reconocimiento médico</b></li>
</ul>

<p style="margin:12px 0 0;font-size:15px;color:#555555">
  Para completarlos, entra en cada documento y pulsa el botón
  <span style="
    display:inline-block;
    background:#4f529f;
    color:#ffffff;
    font-size:12px;
    font-weight:700;
    padding:4px 10px;
    border-radius:4px;
    margin:0 3px;
  ">Firmar</span>.
</p>

  <p style="margin:12px 0 0;font-size:15px;color:#555555">
    Estos documentos se firman directamente desde la plataforma de Engloba.
  </p>
</div>
      <div style="background:#fff8e8;border:1px solid #f5dc98;border-radius:10px;padding:18px;margin:18px 0 0">
        <h2 style="margin:0 0 10px;font-size:18px;color:#8a5a00">
          Importante: sube primero la rúbrica de tu firma
        </h2>

        <p style="margin:8px 0 0;font-size:15px;color:#6f4b00">
          Antes de firmar cualquier documento, primero debes subir la rúbrica de tu firma desde:
        </p>

        <p style="margin:10px 0;font-size:15px;color:#333333">
          <b>Mis Datos → Firma</b>
        </p>

        <ol style="margin:10px 0 0 20px;font-size:15px;color:#555555;line-height:1.6">
          <li>Entra en la app de Asociación Engloba.</li>
          <li>Ve al apartado <b>“Mis Datos”</b>.</li>
          <li>Abre el panel <b>“Firma”</b>.</li>
          <li>Dibuja tu firma y pulsa <b>“Guardar”</b>.</li>
          <li>Después vuelve al apartado de documentación y firma los documentos pendientes.</li>
        </ol>

        <p style="margin:12px 0 0;font-size:14px;color:#6f4b00">
          Si no guardas antes tu firma, la plataforma no podrá generar correctamente la firma de los documentos.
        </p>
      </div>
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


// Helper común
function getMonthLabelEs(month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (Number.isNaN(m) || Number.isNaN(y)) return `${month}/${year}`;
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year:  'numeric'
  });
}

// --- NOTIFICACIÓN: nómina subida a la APP (TEXTO PLANO) ---
export function buildPayrollAppNotificationPlainText(
  name = '',
  month,
  year,
  appUrl = 'https://app.engloba.org.es'
) {
  const monthLabel = getMonthLabelEs(month, year);

  return (
`Hola ${name},

Te informamos de que ya está disponible en la aplicación interna tu nómina correspondiente a ${monthLabel}.

Puedes consultarla accediendo a tu ficha personal en la app:

${appUrl}

Si detectas algún error o tienes alguna duda sobre el contenido de tu nómina, por favor contacta con el departamento de rrhh@engloba.org.es.

Un saludo,
Asociación Engloba`
  );
}

// --- NOTIFICACIÓN: nómina subida a la APP (HTML) ---
export function buildPayrollAppNotificationHtmlEmail(
  name = '',
  month,
  year,
  {
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    appUrl  = 'https://app.engloba.org.es'
  } = {}
) {
  const monthLabel = getMonthLabelEs(month, year);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Nueva nómina disponible</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:#ededed;
      font-family:'Roboto',Arial,Helvetica,sans-serif;
      color:#333;
      line-height:1.5;
    }
    .card{
      max-width:640px;
      margin:40px auto;
      background:#ffffff;
      border-radius:12px;
      overflow:hidden;
      box-shadow:0 8px 24px rgba(0,0,0,.08);
    }
    .header{
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
      color:#ffffff;
      text-align:center;
      padding:24px 20px;
    }
    .logo{
      max-width:140px;
      height:auto;
      margin:0 auto 8px;
      display:block;
    }
    .header h1{
      margin:0;
      font-size:22px;
    }
    .content{
      padding:28px 26px 24px;
      font-size:15px;
    }
    .content p{margin:12px 0}
    .btn{
      display:inline-block;
      margin:20px 0 4px;
      padding:12px 24px;
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
      color:#ffffff !important;
      text-decoration:none;
      border-radius:40px;
      font-weight:700;
      font-size:15px;
    }
    .footer{
      padding:16px;
      text-align:center;
      font-size:13px;
      color:#777;
      background:#f4f5fb;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
      <h1>Nueva nómina disponible</h1>
    </div>
    <div class="content">
      <p>Hola ${name},</p>
      <p>Te informamos de que ya está disponible en la aplicación interna tu nómina correspondiente a <strong>${monthLabel}</strong> para ser firmada.</p>
      <p>Puedes consultarla accediendo a tu ficha personal en la app de Asociación Engloba:</p>
      <p style="text-align:center;">
        <a href="${appUrl}" target="_blank" class="btn">Acceder a la app ▸</a>
      </p>
      <p>Si detectas algún error o tienes dudas sobre el contenido de tu nómina, contacta con el departamento de Recursos Humanos.</p>
      <p>Un saludo,<br><strong>Asociación Engloba</strong></p>
    </div>
    <div class="footer">
      Este mensaje se ha generado automáticamente desde el sistema de nóminas.
    </div>
  </div>
</body>
</html>`;
}

// --- NOTIFICACIÓN: nómina adjunta (TEXTO PLANO) ---
export function buildPayrollAttachmentPlainText(
  name = '',
  month,
  year
) {
  const monthLabel = getMonthLabelEs(month, year);

  return (
`Hola ${name},

Te enviamos adjunta tu nómina correspondiente a ${monthLabel} en formato PDF.

Por favor, revisa la información y guarda este documento en un lugar seguro. 
Si detectas algún error o necesitas alguna aclaración, ponte en contacto con el departamento de Recursos Humanos.

Un saludo,
Asociación Engloba`
  );
}

// --- NOTIFICACIÓN: nómina adjunta (HTML) ---
export function buildPayrollAttachmentHtmlEmail(
  name = '',
  month,
  year,
  {
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png'
  } = {}
) {
  const monthLabel = getMonthLabelEs(month, year);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Nómina adjunta</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:#ededed;
      font-family:'Roboto',Arial,Helvetica,sans-serif;
      color:#333;
      line-height:1.5;
    }
    .card{
      max-width:640px;
      margin:40px auto;
      background:#ffffff;
      border-radius:12px;
      overflow:hidden;
      box-shadow:0 8px 24px rgba(0,0,0,.08);
    }
    .header{
      background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
      color:#ffffff;
      text-align:center;
      padding:24px 20px;
    }
    .logo{
      max-width:140px;
      height:auto;
      margin:0 auto 8px;
      display:block;
    }
    .header h1{
      margin:0;
      font-size:22px;
    }
    .content{
      padding:28px 26px 24px;
      font-size:15px;
    }
    .content p{margin:12px 0}
    .footer{
      padding:16px;
      text-align:center;
      font-size:13px;
      color:#777;
      background:#f4f5fb;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
      <h1>Nómina adjunta</h1>
    </div>
    <div class="content">
      <p>Hola ${name},</p>
      <p>Te enviamos adjunta tu nómina correspondiente a <strong>${monthLabel}</strong> en formato PDF.</p>
      <p>Te recomendamos revisarla con calma y conservar este documento en un lugar seguro.</p>
      <p>Si detectas algún error o necesitas alguna aclaración, ponte en contacto con el departamento de Recursos Humanos.</p>
      <p>Un saludo,<br><strong>Asociación Engloba</strong></p>
    </div>
    <div class="footer">
      Este mensaje se ha generado automáticamente desde el sistema de nóminas.
    </div>
  </div>
</body>
</html>`;
}

// ===================================================
// FELICITACIÓN NAVIDAD · EMPLEADOS (PLAIN + HTML)
// ===================================================

export function buildChristmasEmployeesPlainText(
  name = '',
  {
    year = new Date().getFullYear() + 1,
    supportEmail = 'comunicacion@engloba.org.es',
  } = {}
) {
  const who = name ? capitalizeWords(name) : 'equipo';

  return (
`Hola ${who},

Con la llegada de estas fechas, queremos parar un momento para mirar atrás y, sobre todo, daros las gracias. Porque si algo define a Asociación Engloba no son solo los proyectos, los centros o los resultados: es la manera en la que cada día acompañamos, sostenemos y construimos oportunidades reales para las personas con las que trabajamos.

Este año ha tenido días intensos, retos que han exigido paciencia, coordinación y mucha energía, y también momentos que nos recuerdan por qué estamos aquí: una persona que encuentra empleo, un joven que recupera confianza, una familia que vuelve a respirar un poco más tranquila, un trámite que se desbloquea, un equipo que se apoya cuando las cosas aprietan, una intervención a tiempo, un “gracias” que llega justo cuando hacía falta.

En Engloba, el trabajo no se mide solo por tareas, turnos o informes. Se mide en algo más difícil de cuantificar: la presencia, la mirada, la constancia, el cuidado, la profesionalidad y la humanidad con la que hacéis vuestro trabajo. Y eso —lo que ponéis cada día— es lo que marca la diferencia.

Por eso, hoy queremos reconocer y agradecer:
- El compromiso con el bienestar y los derechos de las personas a las que acompañamos.
- La responsabilidad con la que sostenéis el día a día, incluso cuando no se ve.
- La coordinación entre equipos y recursos, que hace posible que todo encaje.
- La sensibilidad para acompañar procesos complejos, muchas veces con historias difíciles detrás.
- El compañerismo, que convierte el trabajo en equipo en algo real.

Sabemos que esta época del año también puede remover emociones: para algunas personas es una celebración; para otras, es nostalgia, cansancio o simplemente una etapa de cerrar ciclo. Sea como sea, queremos enviaros un mensaje claro: vuestra labor importa. No solo por lo que conseguís, sino por cómo lo conseguís.

De parte de todo el equipo de coordinación/dirección (y de la entidad en su conjunto), os deseamos una Feliz Navidad y un ${year} lleno de salud, estabilidad, buenas noticias y motivos para seguir creyendo en lo que hacemos.

Gracias por ser Engloba.

Un abrazo grande,
[Nombre y cargo / Equipo de Dirección o Coordinación]
Asociación Engloba

Contacto: ${supportEmail}`
  );
}


/* ─────────────────────────────────────────────────────────────
   Plantilla: Navidad empleados (HTML con cabecera imagen)
   ──────────────────────────────────────────────────────────── */
export function buildChristmasEmployeesHtmlEmail(
  name = '',
  {
    headerImageUrl = 'http://engloba.org.es/wp-content/uploads/2025/12/felicitacion.png',
    year = new Date().getFullYear() + 1,
    supportEmail = 'comunicacion@engloba.org.es',

    // Puedes tocar estos 3 si quieres afinar marca
    brandPrimary = '#4f529f',
    brandSecondary = '#8f96d0',
    surfaceTint = '#eef0ff',
  } = {}
) {
  const who = name ? capitalizeWords(name) : 'equipo';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Feliz Navidad</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
</head>

<body style="margin:0;padding:0;background:#f3f4f8;-webkit-text-size-adjust:100%;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Gracias por vuestro trabajo y por ser parte de Asociación Engloba. Felices fiestas.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f8;padding:26px 12px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 38px rgba(0,0,0,.12);">

          <!-- Hero image -->
          <tr>
            <td style="padding:0;background:#ffffff;">
              ${headerImageUrl ? `
              <img
                src="${headerImageUrl}"
                alt="Te deseamos Felices Fiestas - Asociación Engloba"
                width="680"
                style="display:block;width:100%;max-width:680px;height:auto;border:0;outline:none;text-decoration:none;"
              />` : ''}
            </td>
          </tr>

          <!-- Top ribbon -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background:linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%);padding:18px 22px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="font-family:Roboto,Arial,Helvetica,sans-serif;color:#ffffff;">
                          <div style="font-size:20px;line-height:1.2;font-weight:700;margin:0;">
                            Felices Fiestas, ${who} 💚
                          </div>
                          <div style="font-size:14px;line-height:1.55;opacity:.92;margin-top:6px;">
                            Gracias por todo lo que hacemos juntos/as en Asociación Engloba
                          </div>
                        </td>
                        <td align="right" style="font-family:Roboto,Arial,Helvetica,sans-serif;">
                          <span style="display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);color:#fff;
                          padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.2px;">
                            Fiestas ${year - 1}/${year}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:26px 28px 10px 28px;">
              <div style="font-family:Roboto,Arial,Helvetica,sans-serif;color:#111827;font-size:16px;line-height:1.85;">
                <p style="margin:0 0 14px 0;">Hola equipo,</p>

                <p style="margin:0 0 14px 0;">
                  Con la llegada de estas fechas, queremos parar un momento para mirar atrás y, sobre todo,
                  <strong>daros las gracias</strong>. Porque si algo define a Asociación Engloba es la manera en la que cada día <strong>acompañamos, sostenemos y construimos
                  oportunidades reales</strong> para las personas con las que trabajamos.
                </p>

                <p style="margin:0 0 16px 0;">
                  Este año ha tenido días intensos, retos que han exigido paciencia, coordinación y mucha energía, y también
                  momentos que nos recuerdan por qué estamos aquí: una persona que encuentra empleo, un joven que recupera confianza,
                  una familia que vuelve a respirar un poco más tranquila, un trámite que se desbloquea, un equipo que se apoya cuando
                  las cosas aprietan, una intervención a tiempo, un “gracias” que llega justo cuando hacía falta.
                </p>

                <!-- Premium highlight -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 18px 0;">
                  <tr>
                    <td style="background:${surfaceTint};border:1px solid rgba(79,82,159,.18);border-radius:14px;padding:16px 16px;">
                      <div style="font-size:14.8px;line-height:1.75;color:#241a35;">
                        En Engloba, el trabajo no se mide solo por tareas, turnos o informes. Se mide en algo más difícil de cuantificar:
                        <strong>la presencia, la mirada, la constancia, el cuidado, la profesionalidad y la humanidad</strong> con la que hacéis vuestro trabajo.
                        <strong>Y eso marca la diferencia.</strong>
                      </div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 10px 0;">Por eso, hoy queremos reconocer y agradecer:</p>

                <!-- Bullets (email-safe) -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 14px 0;">
                  ${[
                    'El <strong>compromiso</strong> con el bienestar y los derechos de las personas a las que acompañamos.',
                    'La <strong>responsabilidad</strong> con la que sostenéis el día a día, incluso cuando no se ve.',
                    'La <strong>coordinación</strong> entre equipos y recursos, que hace posible que todo encaje.',
                    'La <strong>sensibilidad</strong> para acompañar procesos complejos, muchas veces con historias difíciles detrás.',
                    'El <strong>compañerismo</strong>, que convierte el trabajo en equipo en algo real.'
                  ].map(item => `
                    <tr>
                      <td style="width:28px;vertical-align:top;padding:6px 0;">✨</td>
                      <td style="vertical-align:top;padding:6px 0;color:#111827;">${item}</td>
                    </tr>
                  `).join('')}
                </table>

                <p style="margin:0 0 14px 0;">
                  Sabemos que esta época del año también puede remover emociones: para algunas personas es una celebración; para otras,
                  es nostalgia, cansancio o simplemente una etapa de cerrar ciclo. Sea como sea, queremos enviaros un mensaje claro:
                  <strong>vuestra labor importa</strong>. No solo por lo que conseguís, sino por cómo lo conseguís.
                </p>

                <!-- Signature block -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 6px 0;">
                  <tr>
                    <td style="border-top:1px solid #eef0f3;padding-top:14px;">
                      <div style="color:#111827;">
                        De parte de todo el equipo de coordinación/dirección (y de la entidad en su conjunto), os deseamos una
                        <strong>Feliz Navidad</strong> y un <strong>${year}</strong> lleno de salud, estabilidad, buenas noticias y motivos para seguir creyendo en lo que hacemos.
                        <br /><br />
                        Gracias por ser Engloba.
                        <br /><br />
                        Un abrazo grande,<br />
                        <strong>Asociación Engloba</strong><br />
                      </div>
                    </td>
                  </tr>
                </table>

              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 18px;background:linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%);">
              <div style="font-family:Roboto,Arial,Helvetica,sans-serif;color:#ffffff;text-align:center;">
                <div style="font-size:13px;line-height:1.6;opacity:.95;">
                  Contacto: <a href="mailto:${supportEmail}" style="color:#ffffff;text-decoration:none;font-weight:700;">${supportEmail}</a>
                </div>
                <div style="font-size:12px;line-height:1.6;opacity:.85;margin-top:6px;">
                  Este mensaje está dirigido al equipo interno de Asociación Engloba.
                </div>
              </div>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <div style="font-family:Roboto,Arial,Helvetica,sans-serif;color:#9ca3af;font-size:12px;margin-top:10px;text-align:center;">
          © ${new Date().getFullYear()} Asociación Engloba
        </div>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ===============================
// PLAN DE IGUALDAD + PLAN LGTBIQ+
// ===============================

export function buildEqualityLgtbiqSurveyPlainText(
  name = '',
  {
    planIgualdadUrl = 'https://forms.gle/tGVQgcFgbURv1HLq5',
    planLgtbiqUrl = 'https://forms.gle/YcSN4Hkt8PGMiNQk7',
    supportEmail = 'comunicacion@engloba.org.es',
  } = {}
) {
  const who = name?.trim() ? name.trim() : 'equipo';

  return (
`Hola ${who},

Buenos días.

Como parte de nuestros procesos de mejora, estamos trabajando en la elaboración y actualización del Plan de Igualdad y del Plan LGTBIQ+ de Asociación Engloba.

Queremos contar con tu participación: tu experiencia y tu mirada nos ayudan a detectar necesidades reales, priorizar medidas y seguir construyendo un entorno de trabajo seguro, respetuoso e inclusivo.

Te pedimos que completes estos dos formularios (aprox. 2 minutos cada uno):

• Plan de Igualdad:
  ${planIgualdadUrl}

• Plan LGTBIQ+:
  ${planLgtbiqUrl}

Gracias por tu colaboración.

Un saludo,
Asociación Engloba

Contacto: ${supportEmail}`
  );
}

export function buildEqualityLgtbiqSurveyHtmlEmail(
  name = '',
  {
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    planIgualdadUrl = 'https://forms.gle/tGVQgcFgbURv1HLq5',
    planLgtbiqUrl = 'https://forms.gle/YcSN4Hkt8PGMiNQk7',
    supportEmail = 'comunicacion@engloba.org.es',
  } = {}
) {
  const who = name?.trim() ? name.trim() : 'equipo';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Planes de Igualdad y LGTBIQ+ · Tu opinión cuenta</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f3f4f8;font-family:'Roboto',Arial,sans-serif;color:#111827;line-height:1.6;-webkit-text-size-adjust:100%}
  .card{max-width:680px;margin:36px auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 14px 38px rgba(0,0,0,.12)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#bec3f4 100%);padding:22px 20px;text-align:center;color:#fff}
  .logo{max-width:170px;height:auto;margin:0 auto 6px;display:block}
  .title{font-size:20px;line-height:1.25;font-weight:800;margin-top:4px}
  .subtitle{font-size:13.5px;opacity:.92;margin-top:6px}
  .content{padding:26px 28px 10px 28px;font-size:16px}
  .content p{margin:0 0 14px 0}
  .highlight{
    background:#eef0ff;border:1px solid rgba(79,82,159,.18);
    border-radius:14px;padding:14px 14px;margin:16px 0 18px 0;color:#241a35
  }
  .meta{font-size:14px;color:#4b5563;margin-top:8px}
  .btn-td{border-radius:40px;background:#4f529f}
  .btn-a{
    display:inline-block;padding:12px 22px;border-radius:40px;font-weight:800;
    color:#ffffff !important;text-decoration:none !important;
    background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
  }
  .btns-row{margin:14px 0 6px;text-align:center}
  a.link{color:#4f529f;font-weight:800;text-decoration:none}
  .footer{
    padding:14px 18px;background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
    color:#fff;text-align:center;font-size:12.5px
  }
</style>
</head>
<body>
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Participa en la elaboración y mejora de los Planes de Igualdad y LGTBIQ+ (2 min).
  </div>

  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo" />` : ''}
      <div class="title">Planes de Igualdad y LGTBIQ+ · Tu opinión cuenta</div>
      <div class="subtitle">Mejora interna · Participación del equipo</div>
    </div>

    <div class="content">
      <p>Hola ${who},</p>

      <p>
        Como parte de nuestros procesos de mejora, estamos trabajando en la <strong>elaboración y actualización</strong>
        del <strong>Plan de Igualdad</strong> y del <strong>Plan LGTBIQ+</strong> de <strong>Asociación Engloba</strong>.
      </p>

      <div class="highlight">
        Tu participación es importante: tu experiencia y tu mirada nos ayudan a <strong>detectar necesidades reales</strong>,
        <strong>priorizar medidas</strong> y seguir construyendo un entorno de trabajo <strong>seguro, respetuoso e inclusivo</strong>.
        <div class="meta">⏱️ Tiempo estimado: ~2 minutos por formulario.</div>
      </div>

      <p>Por favor, completa los formularios desde estos botones:</p>

      <div class="btns-row">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:10px auto 6px;">
          <tr><td class="btn-td">
            <a class="btn-a" href="${planIgualdadUrl}" target="_blank" rel="noopener">Plan de Igualdad ▸</a>
          </td></tr>
        </table>

        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:6px auto 2px;">
          <tr><td class="btn-td">
            <a class="btn-a" href="${planLgtbiqUrl}" target="_blank" rel="noopener">Plan LGTBIQ+ ▸</a>
          </td></tr>
        </table>

        <div class="meta" style="margin-top:10px;">
          Si algún botón no se abre, copia y pega los enlaces:
          <br/>
          <a class="link" href="${planIgualdadUrl}" target="_blank" rel="noopener">${planIgualdadUrl}</a>
          <br/>
          <a class="link" href="${planLgtbiqUrl}" target="_blank" rel="noopener">${planLgtbiqUrl}</a>
        </div>
      </div>

      <p style="margin-top:16px;">
        Gracias por tu colaboración.
      </p>

      <p style="margin-top:10px;">
        Un saludo,<br/>
        <strong>Asociación Engloba</strong>
      </p>

      <p class="meta">
        Contacto: <a class="link" href="mailto:${supportEmail}">${supportEmail}</a>
      </p>
    </div>

    <div class="footer">
      Este mensaje está dirigido al equipo interno de Asociación Engloba.
    </div>
  </div>
</body>
</html>`;
}

export function buildSignatureUpdatePlainText(
  name = "",
  {
    appUrl = "https://app.engloba.org.es",
    supportEmail = "comunicacion@engloba.org.es",
  } = {}
) {
  const who = name?.trim() ? name.trim() : "equipo";

  return (
`Hola ${who},

Buenos días.

Hemos actualizado el sistema de firma de nóminas en la app.

A partir de ahora, para poder firmar tus nóminas necesitas registrar tu firma una sola vez desde:
Mi datos → Firma

Pasos:
1) Entra en la app: ${appUrl}
2) Ve a “Mi Datos”
3) Abre el apartado “Firma”
4) Dibuja tu firma y guarda

Una vez guardada, podrás firmar tus nóminas directamente desde el apartado “Nóminas”.

Si al intentar firmar te aparece un aviso de “no hay firma guardada”, significa que todavía no la has registrado.

Cualquier duda o incidencia: ${supportEmail}

Un saludo,
Asociación Engloba`
  );
}

export function buildSignatureUpdateHtmlEmail(
  name = "",
  {
    logoUrl = "https://app.engloba.org.es/graphic/logotipo_blanco.png",
    appUrl = "https://app.engloba.org.es",
    supportEmail = "comunicacion@engloba.org.es",
  } = {}
) {
  const who = name?.trim() ? name.trim() : "equipo";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Firma digital en la app · Acción requerida</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#ededed;font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.55;-webkit-text-size-adjust:100%}
  .card{max-width:680px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:28px 20px}
  .header h1{font-size:22px;margin:6px 0 0;font-weight:800}
  .logo{max-width:140px;height:auto;margin-bottom:8px}
  .content{padding:30px 34px;font-size:16px}
  .content p{margin:14px 0}
  .block{background:#f8f9ff;border:1px solid #e7e9ff;border-radius:10px;padding:14px 16px;margin:12px 0 16px}
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.2px;margin-left:8px;vertical-align:middle}
  .kbd{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;background:#f1f1f1;border-radius:6px;padding:2px 6px;border:1px solid #e5e5e5}
  .refreshBox{background:#fff8e8;border:1px solid #f3d38a;color:#6f4b00;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .refreshBox > strong{display:block;margin-bottom:6px;color:#8a5a00}
  .btns-row{margin:16px 0 6px;text-align:center}
  .btn-td{border-radius:40px;background:#4f529f}
  .btn-a{
    display:inline-block;padding:12px 22px;border-radius:40px;font-weight:800;
    color:#ffffff !important;text-decoration:none !important;
    background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);
  }
  .hint{font-size:14px;color:#555;margin-top:8px}
  a.link{color:#4f529f;font-weight:800;text-decoration:none}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ""}
      <h1>Nueva firma en la app <span class="tag">Acción requerida</span></h1>
      <div style="opacity:.9;font-size:14px;margin-top:6px">Firma necesaria para firmar nóminas</div>
    </div>

    <div class="content">
      <p>Hola ${who},</p>

      <p>Hemos actualizado el sistema de firma de nóminas en la aplicación.</p>

      <div class="block">
        <p style="margin:0 0 10px 0;">
          A partir de ahora, para poder firmar tus nóminas necesitas <strong>registrar tu firma una sola vez</strong> desde:
        </p>
        <p style="margin:0;">
          <span class="kbd">Mi datos → Firma</span>
        </p>
      </div>

      <p style="margin-top:10px;"><strong>Pasos:</strong></p>
      <div class="block">
        <p style="margin:0 0 8px 0;">1) Entra en la app: <a class="link" href="${appUrl}" target="_blank" rel="noopener">${appUrl}</a></p>
        <p style="margin:0 0 8px 0;">2) Ve a <strong>Mi datos</strong></p>
        <p style="margin:0 0 8px 0;">3) Abre el apartado <strong>Firma</strong></p>
        <p style="margin:0;">4) Dibuja tu firma y pulsa <strong>Guardar</strong></p>
      </div>

      <p>Una vez guardada, podrás firmar tus nóminas desde el apartado <strong>Nóminas</strong>.</p>

      <p class="hint">
        Si al intentar firmar te aparece un aviso de “no hay firma guardada”, significa que todavía no la has registrado.
      </p>

      <div class="refreshBox">
        <strong>⚠️ Importante al entrar en la aplicación</strong>
        <p style="margin:0;">
          Por favor, pulsad <strong>F5 varias veces</strong> al acceder para asegurar que se cargan los últimos cambios.
          En algunos casos, el navegador mantiene en caché una versión anterior y eso puede provocar fallos o que no se vean correctamente las actualizaciones.
        </p>
      </div>

      <div class="btns-row">
        <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:10px auto;">
          <tr><td class="btn-td">
            <a class="btn-a" href="${appUrl}" target="_blank" rel="noopener">Abrir la app ▸</a>
          </td></tr>
        </table>

        <p class="hint">Soporte: <a class="link" href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>

      <p>Un saludo,<br><strong>Asociación Engloba</strong></p>
    </div>

    <div class="footer">
      Este mensaje se ha generado automáticamente desde el sistema de nóminas.
    </div>
  </div>
</body>
</html>`;
}

function formatDateEs(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value || '');
  return d.toLocaleDateString('es-ES');
}

function buildCentersListPlainText(centers = []) {
  if (!Array.isArray(centers) || !centers.length) return 'No consta centro asociado.';
  if (centers.length === 1) return `Centro afectado: ${centers[0]}`;
  return `Centros afectados:\n${centers.map((c) => `• ${c}`).join('\n')}`;
}

function buildCentersListHtml(centers = []) {
  if (!Array.isArray(centers) || !centers.length) {
    return `<p style="margin:0;">No consta centro asociado.</p>`;
  }

  if (centers.length === 1) {
    return `<p style="margin:0;"><strong>Centro afectado:</strong> ${centers[0]}</p>`;
  }

  return `
    <p style="margin:0 0 8px 0;"><strong>Centros afectados:</strong></p>
    <ul style="margin:0 0 0 18px;padding:0;">
      ${centers.map((c) => `<li style="margin:6px 0;">${c}</li>`).join('')}
    </ul>
  `;
}

export function buildSesameInactiveByLeavePlainText(
  approverName = '',
  {
    workerName = '',
    workerDni = '',
    workerEmail = '',
    leaveTypeName = '',
    startLeaveDate = '',
    expectedEndLeaveDate = '',
    actualEndLeaveDate = '',
    centers = [],
    notes = '',
    supportEmail = 'web@engloba.org.es',
  } = {}
) {
  const start = formatDateEs(startLeaveDate);
  const expectedEnd = formatDateEs(expectedEndLeaveDate);
  const actualEnd = formatDateEs(actualEndLeaveDate);
  const tutorialUrl = 'https://drive.google.com/file/d/1vMfnWRBPknLo2QkHJUPkttrss7BcBJkr/view?usp=sharing';

  return (
`Hola ${approverName || 'equipo'},

Te informamos de que el/la trabajador/a ${workerName}${workerDni ? ` (DNI ${workerDni})` : ''} ha sido puesto/a en estado inactivo en Sesame al haberse registrado una baja/excedencia activa en la app interna de Asociación Engloba.

DATOS DEL TRABAJADOR/A
• Nombre: ${workerName || '-'}
• DNI: ${workerDni || '-'}
• Correo corporativo: ${workerEmail || '-'}

DATOS DE LA BAJA / EXCEDENCIA
• Tipo: ${leaveTypeName || '-'}
• Fecha de inicio: ${start || '-'}
• Fecha prevista de fin: ${expectedEnd || '-'}
• Fecha fin efectiva: ${actualEnd || '-'}

${buildCentersListPlainText(centers)}

${notes ? `OBSERVACIONES\n${notes}\n` : ''}

MINITUTORIAL
Hay disponible un minitutorial para saber cómo crear, editar y finalizar una baja o excedencia en la app:
${tutorialUrl}

Mientras esta baja/excedencia permanezca abierta en la app, el perfil del trabajador/a figurará como inactivo en Sesame.

IMPORTANTE
Cuando la persona deje de estar de baja/excedencia, será necesario registrar la finalización de la baja/excedencia en la app. Solo así podrá reactivarse automáticamente de nuevo en Sesame.

Para cualquier duda o incidencia, puedes escribir a ${supportEmail}.

Un saludo,
Asociación Engloba`
  );
}

export function buildSesameInactiveByLeaveHtmlEmail(
  approverName = '',
  {
    workerName = '',
    workerDni = '',
    workerEmail = '',
    leaveTypeName = '',
    startLeaveDate = '',
    expectedEndLeaveDate = '',
    actualEndLeaveDate = '',
    centers = [],
    notes = '',
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    supportEmail = 'web@engloba.org.es',
  } = {}
) {
  const start = formatDateEs(startLeaveDate);
  const expectedEnd = formatDateEs(expectedEndLeaveDate);
  const actualEnd = formatDateEs(actualEndLeaveDate);
  const tutorialUrl = 'https://drive.google.com/file/d/1vMfnWRBPknLo2QkHJUPkttrss7BcBJkr/view?usp=sharing';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trabajador/a inactivo/a en Sesame por baja o excedencia</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#ededed;font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.55;-webkit-text-size-adjust:100%}
  .card{max-width:680px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:28px 20px}
  .header h1{font-size:22px;margin:6px 0 0;font-weight:800}
  .logo{max-width:140px;height:auto;margin-bottom:8px}
  .content{padding:30px 34px;font-size:16px}
  .content p{margin:14px 0}
  .block{background:#f8f9ff;border:1px solid #e7e9ff;border-radius:10px;padding:14px 16px;margin:12px 0 18px}
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.2px;margin-left:8px;vertical-align:middle}
  .hint{font-size:14px;color:#555;margin-top:8px}
  a.link{color:#4f529f;font-weight:800;text-decoration:none}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
  .table{width:100%;border-collapse:collapse;margin-top:6px}
  .table td{padding:8px 0;vertical-align:top;border-bottom:1px solid #eceef8}
  .table td:first-child{width:210px;font-weight:700;color:#4f529f;padding-right:12px}
  .noteBox{background:#fff8e8;border:1px solid #f3d38a;color:#6f4b00;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .importantBox{background:#fff3f3;border:1px solid #efb1b1;color:#7a1f1f;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .tutorialBox{background:#eef6ff;border:1px solid #bfdcff;color:#23466b;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
      <h1>Trabajador/a inactivo/a en Sesame <span class="tag">Baja / Excedencia</span></h1>
      <div style="opacity:.9;font-size:14px;margin-top:6px">Notificación automática a responsables de centro</div>
    </div>

    <div class="content">
      <p>Hola ${approverName || 'equipo'},</p>

      <p>
        Te informamos de que el/la trabajador/a <strong>${workerName || '-'}</strong>${workerDni ? ` (${workerDni})` : ''}
        ha sido puesto/a en <strong>estado inactivo en Sesame</strong> al haberse registrado una baja/excedencia activa en la app interna de Asociación Engloba.
      </p>

      <div class="block">
        <table class="table" role="presentation">
          <tr>
            <td>Nombre</td>
            <td>${workerName || '-'}</td>
          </tr>
          <tr>
            <td>DNI</td>
            <td>${workerDni || '-'}</td>
          </tr>
          <tr>
            <td>Correo corporativo</td>
            <td>${workerEmail || '-'}</td>
          </tr>
          <tr>
            <td>Tipo de baja/excedencia</td>
            <td>${leaveTypeName || '-'}</td>
          </tr>
          <tr>
            <td>Fecha de inicio</td>
            <td>${start || '-'}</td>
          </tr>
          <tr>
            <td>Fecha prevista de fin</td>
            <td>${expectedEnd || '-'}</td>
          </tr>
          <tr>
            <td>Fecha fin efectiva</td>
            <td>${actualEnd || '-'}</td>
          </tr>
        </table>
      </div>

      <div class="block">
        ${buildCentersListHtml(centers)}
      </div>

      ${
        notes
          ? `<div class="noteBox">
              <strong>Observaciones</strong>
              <p style="margin:8px 0 0 0;">${notes}</p>
            </div>`
          : ''
      }

      <div class="tutorialBox">
        <strong>Minitutorial</strong>
        <p style="margin:8px 0 0 0;">
          Hay disponible un minitutorial para saber cómo crear, editar y finalizar una baja o excedencia en la app.
        </p>
        <p style="margin:8px 0 0 0;">
          <a class="link" href="${tutorialUrl}" target="_blank" rel="noopener noreferrer">Ver vídeo explicativo</a>
        </p>
      </div>

      <p class="hint">
        Mientras esta baja/excedencia permanezca abierta en la app, el perfil del trabajador/a figurará como inactivo en Sesame.
      </p>

      <div class="importantBox">
        <strong>Importante</strong>
        <p style="margin:8px 0 0 0;">
          Cuando la persona deje de estar de baja/excedencia, será necesario registrar la finalización de la baja/excedencia en la app.
          Solo así podrá reactivarse automáticamente de nuevo en Sesame.
        </p>
      </div>

      <p>
        Para cualquier duda o incidencia, puedes escribir a
        <a class="link" href="mailto:${supportEmail}">${supportEmail}</a>.
      </p>

      <p>Un saludo,<br><strong>Asociación Engloba</strong></p>
    </div>

    <div class="footer">
      Este mensaje se ha generado automáticamente desde la gestión interna de bajas y excedencias.
    </div>
  </div>
</body>
</html>`;
}

export function buildLeaveExpectedEndReminderPlainText(
  approverName = '',
  {
    workerName = '',
    workerDni = '',
    workerEmail = '',
    leaveTypeName = '',
    startLeaveDate = '',
    expectedEndLeaveDate = '',
    actualEndLeaveDate = '',
    centers = [],
    notes = '',
    supportEmail = 'web@engloba.org.es',
  } = {}
) {
  const start = formatDateEs(startLeaveDate);
  const expectedEnd = formatDateEs(expectedEndLeaveDate);
  const actualEnd = formatDateEs(actualEndLeaveDate);
  const tutorialUrl = 'https://drive.google.com/file/d/1vMfnWRBPknLo2QkHJUPkttrss7BcBJkr/view?usp=sharing';

  return (
`Hola ${approverName || 'equipo'},

Te informamos de que la baja/excedencia del trabajador/a ${workerName}${workerDni ? ` (DNI ${workerDni})` : ''} tiene registrada como fecha prevista de finalización el día ${expectedEnd || '-'}.

Como a día de hoy no consta una fecha de fin efectiva en la app, os pedimos que reviséis si esta situación sigue siendo correcta o si ya corresponde registrar la finalización de la baja/excedencia.

DATOS DEL TRABAJADOR/A
• Nombre: ${workerName || '-'}
• DNI: ${workerDni || '-'}
• Correo corporativo: ${workerEmail || '-'}

DATOS DE LA BAJA / EXCEDENCIA
• Tipo: ${leaveTypeName || '-'}
• Fecha de inicio: ${start || '-'}
• Fecha prevista de fin: ${expectedEnd || '-'}
• Fecha fin efectiva registrada: ${actualEnd || 'No registrada'}

${buildCentersListPlainText(centers)}

${notes ? `OBSERVACIONES\n${notes}\n` : ''}

MINITUTORIAL
Hay disponible un minitutorial para saber cómo crear, editar y finalizar una baja o excedencia en la app:
${tutorialUrl}

IMPORTANTE
Si la persona ya no se encuentra de baja/excedencia, será necesario registrar la finalización de la baja/excedencia en la app.
Solo así podrá reactivarse automáticamente en Sesame cuando corresponda.

Si la baja/excedencia continúa, no es necesario hacer ningún cambio en este momento, pero conviene revisar que la información siga siendo correcta.

Para cualquier duda o incidencia, puedes escribir a ${supportEmail}.

Un saludo,
Asociación Engloba`
  );
}

export function buildLeaveExpectedEndReminderHtmlEmail(
  approverName = '',
  {
    workerName = '',
    workerDni = '',
    workerEmail = '',
    leaveTypeName = '',
    startLeaveDate = '',
    expectedEndLeaveDate = '',
    actualEndLeaveDate = '',
    centers = [],
    notes = '',
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    supportEmail = 'web@engloba.org.es',
  } = {}
) {
  const start = formatDateEs(startLeaveDate);
  const expectedEnd = formatDateEs(expectedEndLeaveDate);
  const actualEnd = formatDateEs(actualEndLeaveDate);
  const tutorialUrl = 'https://drive.google.com/file/d/1vMfnWRBPknLo2QkHJUPkttrss7BcBJkr/view?usp=sharing';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión de fecha prevista de fin de baja o excedencia</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#ededed;font-family:'Roboto',Arial,sans-serif;color:#333;line-height:1.55;-webkit-text-size-adjust:100%}
  .card{max-width:680px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:28px 20px}
  .header h1{font-size:22px;margin:6px 0 0;font-weight:800}
  .logo{max-width:140px;height:auto;margin-bottom:8px}
  .content{padding:30px 34px;font-size:16px}
  .content p{margin:14px 0}
  .block{background:#f8f9ff;border:1px solid #e7e9ff;border-radius:10px;padding:14px 16px;margin:12px 0 18px}
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.2px;margin-left:8px;vertical-align:middle}
  .hint{font-size:14px;color:#555;margin-top:8px}
  a.link{color:#4f529f;font-weight:800;text-decoration:none}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
  .table{width:100%;border-collapse:collapse;margin-top:6px}
  .table td{padding:8px 0;vertical-align:top;border-bottom:1px solid #eceef8}
  .table td:first-child{width:210px;font-weight:700;color:#4f529f;padding-right:12px}
  .noteBox{background:#fff8e8;border:1px solid #f3d38a;color:#6f4b00;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .importantBox{background:#fff3f3;border:1px solid #efb1b1;color:#7a1f1f;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .softBox{background:#eef6ff;border:1px solid #bfdcff;color:#23466b;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
  .tutorialBox{background:#eef6ff;border:1px solid #bfdcff;color:#23466b;border-radius:10px;padding:14px 16px;margin:14px 0 18px}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
      <h1>Revisión de baja/excedencia <span class="tag">Fecha prevista de fin</span></h1>
      <div style="opacity:.9;font-size:14px;margin-top:6px">Notificación automática a responsables de centro</div>
    </div>

    <div class="content">
      <p>Hola ${approverName || 'equipo'},</p>

      <p>
        Te informamos de que la baja/excedencia del trabajador/a <strong>${workerName || '-'}</strong>${workerDni ? ` (${workerDni})` : ''}
        tiene registrada como <strong>fecha prevista de finalización</strong> el día <strong>${expectedEnd || '-'}</strong>.
      </p>

      <p>
        Como a día de hoy no consta una fecha de fin efectiva en la app, os pedimos que reviséis si esta situación sigue siendo correcta
        o si ya corresponde registrar la finalización de la baja/excedencia.
      </p>

      <div class="block">
        <table class="table" role="presentation">
          <tr>
            <td>Nombre</td>
            <td>${workerName || '-'}</td>
          </tr>
          <tr>
            <td>DNI</td>
            <td>${workerDni || '-'}</td>
          </tr>
          <tr>
            <td>Correo corporativo</td>
            <td>${workerEmail || '-'}</td>
          </tr>
          <tr>
            <td>Tipo de baja/excedencia</td>
            <td>${leaveTypeName || '-'}</td>
          </tr>
          <tr>
            <td>Fecha de inicio</td>
            <td>${start || '-'}</td>
          </tr>
          <tr>
            <td>Fecha prevista de fin</td>
            <td>${expectedEnd || '-'}</td>
          </tr>
          <tr>
            <td>Fecha fin efectiva registrada</td>
            <td>${actualEnd || 'No registrada'}</td>
          </tr>
        </table>
      </div>

      <div class="block">
        ${buildCentersListHtml(centers)}
      </div>

      ${
        notes
          ? `<div class="noteBox">
              <strong>Observaciones</strong>
              <p style="margin:8px 0 0 0;">${notes}</p>
            </div>`
          : ''
      }

      <div class="tutorialBox">
        <strong>Minitutorial</strong>
        <p style="margin:8px 0 0 0;">
          Hay disponible un minitutorial para saber cómo crear, editar y finalizar una baja o excedencia en la app.
        </p>
        <p style="margin:8px 0 0 0;">
          <a class="link" href="${tutorialUrl}" target="_blank" rel="noopener noreferrer">Ver vídeo explicativo</a>
        </p>
      </div>

      <div class="importantBox">
        <strong>Importante</strong>
        <p style="margin:8px 0 0 0;">
          Si la persona ya no se encuentra de baja/excedencia, será necesario registrar la finalización de la baja/excedencia en la app.
          Solo así podrá reactivarse automáticamente en Sesame cuando corresponda.
        </p>
      </div>

      <div class="softBox">
        <strong>Revisión recomendada</strong>
        <p style="margin:8px 0 0 0;">
          Si la baja/excedencia continúa, no es necesario hacer ningún cambio en este momento, pero conviene revisar que la información registrada siga siendo correcta.
        </p>
      </div>

      <p>
        Para cualquier duda o incidencia, puedes escribir a
        <a class="link" href="mailto:${supportEmail}">${supportEmail}</a>.
      </p>

      <p>Un saludo,<br><strong>Asociación Engloba</strong></p>
    </div>

    <div class="footer">
      Este mensaje se ha generado automáticamente desde la gestión interna de bajas y excedencias.
    </div>
  </div>
</body>
</html>`;
}

export function buildPrlNewHiringPlainText({
  workerName = "",
  workerDni = "",
  workerEmail = "",
  workerPhone = "",
  dispositiveName = "",
  programName = "",
  provinceName = "",
  startDate = "",
  positionName = "",
} = {}) {
  return `Hola,

Se ha registrado una nueva contratación que requiere revisión/seguimiento desde Prevención de Riesgos Laborales.

Trabajador/a:
- Nombre: ${workerName}
- DNI/NIE: ${workerDni}
- Email: ${workerEmail || "No indicado"}
- Teléfono: ${workerPhone || "No indicado"}

Contratación:
- Puesto: ${positionName || "No indicado"}
- Fecha de alta: ${startDate || "No indicada"}
- Dispositivo: ${dispositiveName || "No indicado"}
- Programa: ${programName || "No indicado"}
- Provincia: ${provinceName || "No indicada"}

Un saludo.`;
}

export function buildPrlNewHiringHtmlEmail({
  workerName = "",
  workerDni = "",
  workerEmail = "",
  workerPhone = "",
  dispositiveName = "",
  programName = "",
  provinceName = "",
  startDate = "",
  positionName = "",
  logoUrl = "https://app.engloba.org.es/graphic/logotipo_blanco.png",
} = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Nueva contratación · PRL</title>
<style>
  body{margin:0;padding:0;background:#f2f2f2;font-family:Arial,sans-serif;color:#333}
  .card{max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;padding:26px 24px;text-align:center}
  .logo{max-width:120px;margin-bottom:8px}
  .header h1{margin:0;font-size:23px}
  .content{padding:28px 34px;font-size:15px;line-height:1.55}
  .block{background:#f8f9ff;border:1px solid #e5e7ff;border-radius:10px;padding:16px;margin:14px 0}
  .label{font-weight:bold;color:#4f529f}
  .footer{background:#f4f5fb;text-align:center;padding:16px;font-size:13px;color:#777}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Asociación Engloba">` : ""}
      <h1>Nueva contratación · Prevención de Riesgos Laborales</h1>
    </div>

    <div class="content">
      <p>Se ha registrado una nueva contratación que requiere revisión/seguimiento desde el área de Prevención de Riesgos Laborales.</p>

      <div class="block">
        <p><span class="label">Trabajador/a:</span> ${workerName || "No indicado"}</p>
        <p><span class="label">DNI/NIE:</span> ${workerDni || "No indicado"}</p>
        <p><span class="label">Email:</span> ${workerEmail || "No indicado"}</p>
        <p><span class="label">Teléfono:</span> ${workerPhone || "No indicado"}</p>
      </div>

      <div class="block">
        <p><span class="label">Puesto:</span> ${positionName || "No indicado"}</p>
        <p><span class="label">Fecha de alta:</span> ${startDate || "No indicada"}</p>
        <p><span class="label">Dispositivo:</span> ${dispositiveName || "No indicado"}</p>
        <p><span class="label">Programa:</span> ${programName || "No indicado"}</p>
        <p><span class="label">Provincia:</span> ${provinceName || "No indicada"}</p>
      </div>

      <p>Este correo se ha generado automáticamente desde la aplicación de Engloba.</p>
    </div>

    <div class="footer">
      Asociación Engloba · Prevención de Riesgos Laborales
    </div>
  </div>
</body>
</html>`;
}

//BORRAR
// ===================================================
// CONTROL DE GASTOS · INSTALACIÓN / ACTUALIZACIÓN
// ===================================================

export function buildExpenseControlInstallPlainText(
  name = 'equipo',
  {
    supportEmail = 'comunicacion@engloba.org.es',
    includeCacheWarning = false,
  } = {}
) {
  return (
`Hola ${name || 'equipo'},

Buenos días.

Os escribimos para informaros de la actualización de la aplicación de Control de Gastos.

INSTALACIÓN DE LA APLICACIÓN

Por favor, seguid estos pasos:

1) Eliminar la carpeta actual de Control de Gastos.
   Podéis borrarla completa. No se pierden datos.

2) Entrar en Drive:
   Unidades Compartidas → Aplicación control de gastos

3) Descargar el archivo:
   Aplicación Control Gastos.zip

4) Descomprimirlo en el escritorio o en otra carpeta que os resulte cómoda.

5) Ejecutar el archivo cg.exe.
   Si no aparece la extensión .exe, es el archivo que indica "Aplicación".

6) Si aparece el mensaje "Windows protegió su PC":
   Haced clic en "Más información" y después en "Ejecutar de todas formas".

7) Sugerencia:
   Podéis crear un acceso directo en el escritorio arrastrando CG.exe con el botón derecho del ratón y seleccionando "Crear acceso directo aquí".

NOVEDADES DE LA VERSIÓN

Subida de facturas y pagos en PDF:
Al crear un registro de gasto, ahora aparecerán los campos "Factura", "Pago" y un botón de "Seleccionar".

Servirá para subir los documentos correspondientes, siempre en formato PDF.

BENEFICIO

Esta mejora facilitará el trabajo del área de administración y ayudará a evitar que se pierdan facturas que después hay que volver a solicitar.

CONSEJO PRÁCTICO

Al escanear las facturas, guardadlas de forma ordenada en una carpeta de vuestro ordenador para que sean fáciles de identificar.

Tip:
Si configuráis el navegador para que os pregunte dónde guardar cada archivo, podréis cambiarle el nombre antes de descargarlo y os será más fácil encontrarlo.

RESOLUCIÓN DE PROBLEMAS

- Si no os deja instalar por el "Control de aplicaciones":
  Hay que desactivarlo temporalmente.

- Si la aplicación no conecta al servidor:
  Poneos en contacto con el departamento de Comunicación.

${includeCacheWarning ? `IMPORTANTE:
Por favor, pulsad F5 varias veces al entrar en la aplicación para asegurar que se cargan los últimos cambios.
En algunos casos el navegador conserva en caché una versión anterior y eso puede provocar fallos o que no se vean correctamente las actualizaciones.

` : ''}Para cualquier duda, podéis escribirnos a ${supportEmail}.

Un saludo,
Departamento de Comunicación`
  );
}

export function buildExpenseControlInstallHtmlEmail(
  name = 'equipo',
  {
    logoUrl = 'https://app.engloba.org.es/graphic/logotipo_blanco.png',
    supportEmail = 'comunicacion@engloba.org.es',
    includeCacheWarning = false,
  } = {}
) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Actualización de la aplicación de Control de Gastos</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f0f2f7;font-family:'Roboto',Arial,sans-serif;color:#2a2a2a;line-height:1.6}
  .card{max-width:720px;margin:36px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.08)}
  .header{background:linear-gradient(90deg,#4f529f 0%,#8f96d0 100%);color:#fff;text-align:center;padding:30px 24px}
  .logo{max-width:130px;height:auto;margin:0 auto 10px;display:block}
  .header h1{font-size:24px;margin:0}
  .header p{font-size:14px;opacity:.92;margin-top:8px}
  .content{padding:30px 34px;font-size:16px}
  .content p{margin:14px 0}
  h2{color:#4f529f;font-size:18px;margin:26px 0 12px}
  ol,ul{margin:10px 0 16px 22px}
  li{margin:8px 0}
  .block{background:#f8f9ff;border:1px solid #e4e7ff;border-radius:12px;padding:16px 18px;margin:12px 0 20px}
  .warning{background:#fff8e8;border:1px solid #f5dc98;border-radius:12px;padding:16px 18px;margin:16px 0}
  .error{background:#fff1f1;border:1px solid #f1c7c7;border-radius:12px;padding:16px 18px;margin:16px 0}
  .tag{display:inline-block;background:#eef0ff;color:#4f529f;border:1px solid #dfe2ff;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;margin-left:6px}
  .kbd{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f3f3f3;border:1px solid #e5e5e5;border-radius:6px;padding:2px 6px}
  .footer{background:#bec3f4;text-align:center;padding:18px 16px;font-size:13px;color:#333}
  a{color:#4f529f;font-weight:700;text-decoration:none}
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Asociación Engloba" class="logo">` : ''}
      <h1>Instalación de la aplicación de Control de Gastos</h1>
      <p>Actualización de herramienta y subida de facturas/pagos en PDF</p>
    </div>

    <div class="content">
      <p>Hola ${name || 'equipo'},</p>

      <p>Os escribimos para informaros de la actualización de la aplicación de <strong>Control de Gastos</strong>.</p>

      <h2>📞 Instalación de la aplicación</h2>
      <div class="block">
        <ol>
          <li>Eliminar la carpeta actual de <strong>Control de Gastos</strong>. Podéis borrarla completa, <strong>no se pierden datos</strong>.</li>
          <li>Entrar en Drive: <span class="kbd">Unidades Compartidas → Aplicación control de gastos</span>.</li>
          <li>Descargar el archivo <strong>“Aplicación Control Gastos.zip”</strong>.</li>
          <li>Descomprimirlo en el escritorio o en otra carpeta que os resulte cómoda.</li>
          <li>Ejecutar <strong>cg.exe</strong>. Si no aparece la extensión <em>.exe</em>, es el archivo que indica <strong>“Aplicación”</strong>.</li>
          <li>Si aparece el mensaje <strong>“Windows protegió su PC”</strong>, haced clic en <strong>“Más información”</strong> y después en <strong>“Ejecutar de todas formas”</strong>.</li>
          <li>Podéis crear un acceso directo en el escritorio arrastrando <strong>CG.exe</strong> con el botón derecho y seleccionando <strong>“Crear acceso directo aquí”</strong>.</li>
        </ol>
      </div>

      <h2>✨ Novedades de la versión</h2>
      <div class="block">
        <p><strong>📝 Subida de facturas y pagos en PDF</strong></p>
        <p>Al crear un registro de gasto, ahora aparecerán los campos <strong>“Factura”</strong>, <strong>“Pago”</strong> y un botón de <strong>“Seleccionar”</strong>.</p>
        <p>Servirá para subir los documentos correspondientes, siempre en <strong>formato PDF</strong>.</p>
      </div>

      <h2>💼 Beneficio</h2>
      <div class="block">
        <p>Esta mejora facilitará el trabajo del área de administración y ayudará a evitar que se pierdan facturas que después hay que volver a solicitar.</p>
      </div>

      <h2>💡 Consejo práctico</h2>
      <div class="warning">
        <p>Al escanear las facturas, guardadlas de forma ordenada en una carpeta de vuestro ordenador para que sean fáciles de identificar.</p>
        <p><strong>Tip:</strong> si configuráis el navegador para que os pregunte dónde guardar cada archivo, podréis cambiarle el nombre antes de descargarlo y os será más fácil encontrarlo.</p>
      </div>

      <h2>⚠️ Resolución de problemas</h2>
      <div class="error">
        <ul>
          <li><strong>Si no os deja instalar por el “Control de aplicaciones”:</strong> hay que desactivarlo temporalmente.</li>
          <li><strong>Si la aplicación no conecta al servidor:</strong> poneos en contacto con el departamento de Comunicación.</li>
        </ul>
      </div>

      ${includeCacheWarning ? `
      <div class="warning">
        <p><strong>Importante:</strong> pulsad F5 varias veces al entrar en la aplicación para asegurar que se cargan los últimos cambios.</p>
        <p>En algunos casos el navegador conserva en caché una versión anterior y eso puede provocar fallos o que no se vean correctamente las actualizaciones.</p>
      </div>` : ''}

      <p>Para cualquier duda, podéis escribirnos a <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>

      <p>Un saludo,<br></p>
    </div>

    <div class="footer">
      Asociación Engloba · Gustavo
    </div>
  </div>
</body>
</html>`;
}
//FIN BORRAR