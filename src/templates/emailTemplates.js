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