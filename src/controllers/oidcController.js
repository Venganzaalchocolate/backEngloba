const crypto = require("crypto");

const { User, OidcRecord } = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const { getOidcProvider } = require("../services/oidcProviderService");

const OIDC_BROWSER_COOKIE = "engloba_oidc_session";

/* =========================================================
   HELPERS
   ========================================================= */

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const createToken = () =>
  crypto.randomBytes(48).toString("base64url");

const shortHash = (value) => {
  if (!value) return null;

  return hashToken(String(value)).slice(0, 12);
};

const getCookie = (req, name) => {
  const cookies = String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  const cookie = cookies.find((item) =>
    item.startsWith(`${name}=`)
  );

  if (!cookie) return null;

  return decodeURIComponent(cookie.slice(name.length + 1));
};

const getRequestInfo = (req) => ({
  method: req.method,
  path: req.originalUrl || req.url,
  host: req.get("host"),
  referer: req.get("referer") || null,
  userAgent: req.get("user-agent") || null,
  hasCookieHeader: Boolean(req.headers.cookie),
});

const logOidcError = (action, error, extra = {}) => {
  console.dir(
    {
      action,
      ...extra,
      message: error?.message || String(error),
      name: error?.name || null,
      status: error?.status || null,
      details: error?.details || null,
      stack: error?.stack || null,
    },
    { depth: null }
  );
};

/* =========================================================
   TICKET DE SALIDA DESDE LA APP
   ========================================================= */

/*
  Crea un ticket opaco, de un solo uso y válido durante dos minutos.
  Lo usa la ruta protegida de la app para abrir Moodle.
*/
const createMoodleLaunchForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  console.dir(
    {
      action: "oidc-launch-create-start",
      userId: String(userId),
    },
    { depth: null }
  );

  const user = await User.findById(userId)
    .select("_id employmentStatus")
    .lean();

  if (!user) {
    console.dir(
      {
        action: "oidc-launch-create-user-not-found",
        userId: String(userId),
      },
      { depth: null }
    );

    throw new ClientError("Usuario no encontrado", 404);
  }

  if (user.employmentStatus !== "activo") {
    console.dir(
      {
        action: "oidc-launch-create-user-not-active",
        userId: String(user._id),
        employmentStatus: user.employmentStatus,
      },
      { depth: null }
    );

    throw new ClientError(
      "Solo las personas trabajadoras activas pueden acceder a Formación",
      403
    );
  }

  const issuer = String(process.env.OIDC_ISSUER || "").replace(/\/+$/, "");

  if (!issuer) {
    throw new Error("Falta OIDC_ISSUER en .env");
  }

  const ticket = createToken();
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

  await OidcRecord.create({
    type: "launch",
    id: hashToken(ticket),
    userId: user._id,
    expiresAt,
  });

  const url = `${issuer}/launch?ticket=${encodeURIComponent(ticket)}`;

  console.dir(
    {
      action: "oidc-launch-created",
      userId: String(user._id),
      ticketHash: shortHash(ticket),
      expiresAt,
      issuer,
    },
    { depth: null }
  );

  return {
    userId: String(user._id),
    url,
    expiresAt,
  };
};

/*
  La app llama a este endpoint usando su Bearer JWT habitual.
  Devuelve una URL temporal que se abrirá en una pestaña nueva.
*/
const postMoodleLaunch = async (req, res) => {
  console.dir(
    {
      action: "oidc-launch-api-request",
      ...getRequestInfo(req),
      authenticatedUserId: req.user?._id ? String(req.user._id) : null,
    },
    { depth: null }
  );

  const data = await createMoodleLaunchForUser(req.user?._id);

  response(res, 200, {
    url: data.url,
  });
};

/* =========================================================
   APERTURA DE MOODLE
   ========================================================= */

/*
  Se abre desde la nueva pestaña creada por la app.
  Consume el ticket y crea una cookie HttpOnly temporal en BackEngloba.
  Después redirige a Moodle, que inicia el flujo OIDC.
*/
const getOidcLaunch = async (req, res) => {
  const ticket = String(req.query.ticket || "").trim();

  console.dir(
    {
      action: "oidc-launch-request",
      ...getRequestInfo(req),
      hasTicket: Boolean(ticket),
      ticketHash: shortHash(ticket),
    },
    { depth: null }
  );

  if (!ticket) {
    throw new ClientError("Ticket de acceso no válido", 400);
  }

  const now = new Date();

  const launch = await OidcRecord.findOneAndUpdate(
    {
      type: "launch",
      id: hashToken(ticket),
      usedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        usedAt: now,
      },
    },
    {
      new: true,
    }
  ).lean();

  if (!launch) {
    console.dir(
      {
        action: "oidc-launch-ticket-rejected",
        ticketHash: shortHash(ticket),
        reason: "expired-used-or-not-found",
      },
      { depth: null }
    );

    throw new ClientError(
      "El enlace de acceso ha expirado o ya fue utilizado",
      403
    );
  }

  const browserToken = createToken();
  const browserExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OidcRecord.create({
    type: "browser",
    id: hashToken(browserToken),
    userId: launch.userId,
    expiresAt: browserExpiresAt,
  });

  const issuer = String(process.env.OIDC_ISSUER || "");
  const moodleUrl = String(process.env.MOODLE_PUBLIC_URL || "").replace(
    /\/+$/,
    ""
  );

  if (!moodleUrl) {
    throw new Error("Falta MOODLE_PUBLIC_URL en .env");
  }

  const redirectUrl = `${moodleUrl}/auth/oidc/`;

  res.cookie(OIDC_BROWSER_COOKIE, browserToken, {
    httpOnly: true,
    secure: issuer.startsWith("https://"),
    sameSite: "lax",
    path: "/oidc",
    maxAge: 10 * 60 * 1000,
  });

  console.dir(
    {
      action: "oidc-launch-browser-session-created",
      userId: String(launch.userId),
      ticketHash: shortHash(ticket),
      browserTokenHash: shortHash(browserToken),
      browserExpiresAt,
      cookieName: OIDC_BROWSER_COOKIE,
      cookiePath: "/oidc",
      redirectUrl,
    },
    { depth: null }
  );

  return res.redirect(redirectUrl);
};

/* =========================================================
   INTERACCIÓN OIDC
   ========================================================= */

/*
  oidc-provider redirige aquí cuando Moodle solicita autorización.
  La cookie temporal identifica al trabajador y completa el login OIDC
  sin pedir una segunda contraseña.
*/
const getOidcInteraction = async (req, res) => {
  const browserToken = getCookie(req, OIDC_BROWSER_COOKIE);

  console.dir(
    {
      action: "oidc-interaction-request",
      ...getRequestInfo(req),
      uid: req.params.uid || null,
      hasBrowserCookie: Boolean(browserToken),
      browserTokenHash: shortHash(browserToken),
    },
    { depth: null }
  );

  if (!browserToken) {
    console.dir(
      {
        action: "oidc-interaction-no-browser-cookie",
        uid: req.params.uid || null,
      },
      { depth: null }
    );

    return res.status(401).type("html").send(`
      <h1>Acceso a Formación</h1>
      <p>Abre la plataforma desde app.engloba.org.es.</p>
    `);
  }

  const browserSession = await OidcRecord.findOne({
    type: "browser",
    id: hashToken(browserToken),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!browserSession) {
    console.dir(
      {
        action: "oidc-interaction-browser-session-not-found",
        uid: req.params.uid || null,
        browserTokenHash: shortHash(browserToken),
      },
      { depth: null }
    );

    res.clearCookie(OIDC_BROWSER_COOKIE, {
      path: "/oidc",
    });

    return res.status(401).type("html").send(`
      <h1>Sesión de Formación expirada</h1>
      <p>Vuelve a abrir Formación desde app.engloba.org.es.</p>
    `);
  }

  console.dir(
    {
      action: "oidc-interaction-browser-session-found",
      uid: req.params.uid || null,
      userId: String(browserSession.userId),
      expiresAt: browserSession.expiresAt,
    },
    { depth: null }
  );

  const user = await User.findById(browserSession.userId)
    .select("_id employmentStatus")
    .lean();

  if (!user || user.employmentStatus !== "activo") {
    console.dir(
      {
        action: "oidc-interaction-user-denied",
        uid: req.params.uid || null,
        userId: browserSession.userId
          ? String(browserSession.userId)
          : null,
        employmentStatus: user?.employmentStatus || null,
      },
      { depth: null }
    );

    throw new ClientError(
      "Esta cuenta no tiene acceso a Formación",
      403
    );
  }

  const provider = getOidcProvider();

  let details;

  try {
    details = await provider.interactionDetails(req, res);
  } catch (error) {
    logOidcError("oidc-interaction-details-error", error, {
      uid: req.params.uid || null,
      userId: String(user._id),
    });

    throw error;
  }

  const promptName = details.prompt?.name || null;
  const promptDetails = details.prompt?.details || {};
  const sessionAccountId = details.session?.accountId || null;

  console.dir(
    {
      action: "oidc-interaction-details",
      uid: details.uid,
      expectedUid: req.params.uid,
      clientId: details.params.client_id || null,
      redirectUri: details.params.redirect_uri || null,
      responseType: details.params.response_type || null,
      scope: details.params.scope || null,
      prompt: details.params.prompt || null,
      promptName,
      promptDetails,
      grantId: details.grantId || null,
      sessionAccountId,
      returnTo: details.returnTo || null,
      userId: String(user._id),
    },
    { depth: null }
  );

  if (details.uid !== req.params.uid) {
    console.dir(
      {
        action: "oidc-interaction-uid-mismatch",
        requestedUid: req.params.uid,
        providerUid: details.uid,
        userId: String(user._id),
      },
      { depth: null }
    );

    throw new ClientError("Interacción OIDC no válida", 400);
  }

  let result;
  let mergeWithLastSubmission = false;

  if (promptName === "login") {
    result = {
      login: {
        accountId: String(user._id),
        acr: "1",
        remember: false,
        ts: Math.floor(Date.now() / 1000),
      },
    };
  } else if (promptName === "consent") {
    const accountId = String(sessionAccountId || user._id);
    const clientId = details.params.client_id;

    if (!clientId) {
      throw new ClientError(
        "La interacción OIDC no contiene client_id",
        400
      );
    }

    let grant;

    if (details.grantId) {
      grant = await provider.Grant.find(details.grantId);
    }

    if (!grant) {
      grant = new provider.Grant({
        accountId,
        clientId,
      });
    }

    if (Array.isArray(promptDetails.missingOIDCScope)) {
      grant.addOIDCScope(promptDetails.missingOIDCScope.join(" "));
    }

    if (Array.isArray(promptDetails.missingOIDCClaims)) {
      grant.addOIDCClaims(promptDetails.missingOIDCClaims);
    }

    if (
      promptDetails.missingResourceScopes &&
      typeof promptDetails.missingResourceScopes === "object"
    ) {
      for (const [resource, scopes] of Object.entries(
        promptDetails.missingResourceScopes
      )) {
        if (Array.isArray(scopes) && scopes.length) {
          grant.addResourceScope(resource, scopes.join(" "));
        }
      }
    }

    const savedGrantId = await grant.save();

    result = {
      consent: details.grantId
        ? {}
        : {
            grantId: savedGrantId,
          },
    };

    mergeWithLastSubmission = true;
  } else {
    console.dir(
      {
        action: "oidc-interaction-unsupported-prompt",
        uid: details.uid,
        promptName,
        clientId: details.params.client_id || null,
        userId: String(user._id),
      },
      { depth: null }
    );

    throw new ClientError(
      `Prompt OIDC no soportado: ${promptName || "desconocido"}`,
      400
    );
  }

  try {
    await provider.interactionFinished(req, res, result, {
      mergeWithLastSubmission,
    });

    console.dir(
      {
        action: "oidc-interaction-finished",
        uid: details.uid,
        promptName,
        clientId: details.params.client_id || null,
        redirectUri: details.params.redirect_uri || null,
        grantId: result?.consent?.grantId || details.grantId || null,
        userId: String(user._id),
      },
      { depth: null }
    );

    return;
  } catch (error) {
    logOidcError("oidc-interaction-finish-error", error, {
      uid: details.uid,
      promptName,
      clientId: details.params.client_id || null,
      redirectUri: details.params.redirect_uri || null,
      userId: String(user._id),
    });

    throw error;
  }
};

/* =========================================================
   PRUEBA LOCAL
   ========================================================= */

const testMoodleLaunchByDni = async (dni = "40444044Q") => {
  const normalizedDni = String(dni || "").trim().toUpperCase();

  const user = await User.findOne({ dni: normalizedDni })
    .select("_id dni firstName lastName email employmentStatus")
    .lean();

  if (!user) {
    throw new ClientError(
      `No existe ningún usuario con DNI ${normalizedDni}`,
      404
    );
  }

  const data = await createMoodleLaunchForUser(user._id);

  console.dir(
    {
      action: "moodle-launch-test-created",
      userId: String(user._id),
      employmentStatus: user.employmentStatus,
      expiresAt: data.expiresAt,
      url: data.url,
    },
    { depth: null }
  );

  return data;
};

module.exports = {
  postMoodleLaunch: catchAsync(postMoodleLaunch),
  getOidcLaunch: catchAsync(getOidcLaunch),
  getOidcInteraction: catchAsync(getOidcInteraction),

  createMoodleLaunchForUser,
  testMoodleLaunchByDni,
};