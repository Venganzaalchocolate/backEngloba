const crypto = require("crypto");

const { User, OidcRecord } = require("../models/indexModels");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const { getOidcProvider } = require("../services/oidcProviderService");

const OIDC_BROWSER_COOKIE = "engloba_oidc_session";

const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const createToken = () =>
  crypto.randomBytes(48).toString("base64url");

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

/*
  Crea un ticket opaco, de un solo uso y válido durante dos minutos.
  Lo usa tanto la ruta protegida de la app como la prueba local.
*/
const createMoodleLaunchForUser = async (userId) => {
  if (!userId) {
    throw new ClientError("Falta userId", 400);
  }

  const user = await User.findById(userId)
    .select("_id firstName lastName email employmentStatus")
    .lean();

  if (!user) {
    throw new ClientError("Usuario no encontrado", 404);
  }

  if (user.employmentStatus !== "activo") {
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

  return {
    userId: String(user._id),
    url: `${issuer}/launch?ticket=${encodeURIComponent(ticket)}`,
    expiresAt,
  };
};

/*
  La app llama a este endpoint usando su Bearer JWT habitual.
  Devuelve una URL corta que se abrirá en una pestaña nueva.
*/
const postMoodleLaunch = async (req, res) => {
  const data = await createMoodleLaunchForUser(req.user?._id);

  response(res, 200, {
    url: data.url,
  });
};

/*
  Se abre en una pestaña nueva desde la app.
  Consume el ticket y crea una cookie HttpOnly temporal en BackEngloba.
  Después redirige a Moodle, que iniciará el flujo OIDC.
*/
const getOidcLaunch = async (req, res) => {
  const ticket = String(req.query.ticket || "").trim();

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
    throw new ClientError(
      "El enlace de acceso ha expirado o ya fue utilizado",
      403
    );
  }

  const browserToken = createToken();

  await OidcRecord.create({
    type: "browser",
    id: hashToken(browserToken),
    userId: launch.userId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  const issuer = String(process.env.OIDC_ISSUER || "");
  const moodleUrl = String(process.env.MOODLE_PUBLIC_URL || "").replace(
    /\/+$/,
    ""
  );

  if (!moodleUrl) {
    throw new Error("Falta MOODLE_PUBLIC_URL en .env");
  }

  res.cookie(OIDC_BROWSER_COOKIE, browserToken, {
    httpOnly: true,
    secure: issuer.startsWith("https://"),
    sameSite: "lax",
    path: "/oidc",
    maxAge: 10 * 60 * 1000,
  });

  return res.redirect(`${moodleUrl}/auth/oidc/`);
};

/*
  oidc-provider redirige aquí cuando Moodle solicita autorización.
  La cookie temporal identifica al trabajador y completa el login OIDC
  sin pedir una segunda contraseña.
*/
const getOidcInteraction = async (req, res) => {
  const browserToken = getCookie(req, OIDC_BROWSER_COOKIE);

  if (!browserToken) {
    res.status(401).type("html").send(`
      <h1>Acceso a Formación</h1>
      <p>Abre la plataforma desde app.engloba.org.es.</p>
    `);

    return;
  }

  const browserSession = await OidcRecord.findOne({
    type: "browser",
    id: hashToken(browserToken),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!browserSession) {
    res.clearCookie(OIDC_BROWSER_COOKIE, {
      path: "/oidc",
    });

    res.status(401).type("html").send(`
      <h1>Sesión de Formación expirada</h1>
      <p>Vuelve a abrir Formación desde app.engloba.org.es.</p>
    `);

    return;
  }

  const user = await User.findById(browserSession.userId)
    .select("_id employmentStatus")
    .lean();

  if (!user || user.employmentStatus !== "activo") {
    throw new ClientError(
      "Esta cuenta no tiene acceso a Formación",
      403
    );
  }

  const provider = getOidcProvider();
  const details = await provider.interactionDetails(req, res);

  if (details.uid !== req.params.uid) {
    throw new ClientError("Interacción OIDC no válida", 400);
  }

  await provider.interactionFinished(
    req,
    res,
    {
      login: {
        accountId: String(user._id),
        acr: "1",
        remember: false,
        ts: Math.floor(Date.now() / 1000),
      },
      consent: {},
    },
    {
      mergeWithLastSubmission: false,
    }
  );
};

/*
  Prueba local: busca a Hermes en BackEngloba por DNI, crea el ticket
  real y muestra la URL que luego devolverá la ruta de la aplicación.
*/
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
      action: "moodle-launch-created",
      dni: user.dni,
      userId: String(user._id),
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      email: user.email,
      employmentStatus: user.employmentStatus,
      url: data.url,
      expiresAt: data.expiresAt,
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

