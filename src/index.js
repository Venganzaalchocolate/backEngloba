require("dotenv").config();

const express = require("express");
const cors = require("cors");

const {
  limiter,
  corsOptions,
  verifyOriginAndReferer,
} = require("./middleware/securityMiddleware");

const userRoutes = require("./routes/userRoutes");
const loginRoutes = require("./routes/loginRoutes");
const userCvRoutes = require("./routes/userCvRoutes");
const filesRoutes = require("./routes/fileRoutes");
const bagRoutes = require("./routes/bagRoutes");
const { resError } = require("./utils/indexUtils");
const programRoutes = require("./routes/programRoutes");
const offerRoutes = require("./routes/offerRoutes");
const enumsRoutes = require("./routes/enumsRoutes");
const documentationRoutes = require("./routes/documentationRoutes");
const auditRoutes = require("./routes/auditRoutes");
const statisticsRoutes = require("./routes/statisticsRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const preferentsRoutes = require("./routes/preferentRoutes");
const hiringRoutes = require("./routes/hiringRoutes");
const leaveRoutes = require("./routes/leaveRoutes");
const userChangeRequest = require("./routes/userChangeRoutes");
const volunteerApplicationRoutes = require("./routes/volunteerApplicationRoutes");
const sesameRoutes = require("./routes/sesameRoutes");
const userDocumentationAudit = require("./routes/userAuditDocumentationRoutes");
const scopedRoleRoutes = require("./routes/scopedRolesRoutes");
const workplaceRoutes = require("./routes/workplaceRoutes");
const attendedUserRoutes = require("./routes/attendedUserRoutes");
const moduleScopeRoutes = require("./routes/moduleScopeRoutes");
const documentationReceiptTemplaterRoutes = require("./routes/documentationReceiptTemplaterRoutes");
const anideCentroManagerRoutes = require("./routes/anideRoutes");
const moodleRoutes = require("./routes/moodleRoutes");

const {
  oidcApiRoutes,
  oidcPublicRoutes,
} = require("./routes/oidcRoutes");

const { connectToDatabase } = require("./database/connect");
const {
  initOidcProvider,
  getOidcProvider,
} = require("./services/oidcProviderService");

require("./controllers/cronScheduleController");

const port = process.env.PORT || 10000;

// Crear la aplicación Express
const app = express();

// Necesario para cookies seguras detrás del proxy HTTPS de Render
app.set("trust proxy", 1);

let oidcCallback;

/*
  El proveedor OIDC se monta antes de JSON, CORS, rate limit y
  verifyOriginAndReferer.

  Moodle accederá directamente desde otro dominio a endpoints como:
  /oidc/.well-known/openid-configuration
  /oidc/auth
  /oidc/token
  /oidc/jwks

  Por eso no deben pasar por las protecciones habituales de la API.
*/
/*
  Rutas propias del lanzamiento e interacción OIDC.
  Deben ir antes del callback de oidc-provider porque este captura
  el resto de rutas bajo /oidc.
*/
// app.use("/oidc", oidcPublicRoutes);

// app.use("/oidc", (req, res, next) => {
//   oidcCallback(req, res, next);
// });

app.use("/oidc", oidcPublicRoutes);

app.use("/oidc", (req, res, next) => {
  const startedAt = Date.now();

  console.dir(
    {
      action: "oidc-provider-request",
      method: req.method,
      path: req.originalUrl || req.url,
      host: req.get("host"),
      referer: req.get("referer") || null,
      hasCookieHeader: Boolean(req.headers.cookie),
      userAgent: req.get("user-agent") || null,
    },
    { depth: null }
  );

  res.on("finish", () => {
    console.dir(
      {
        action: "oidc-provider-response",
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        location: res.getHeader("location") || null,
        durationMs: Date.now() - startedAt,
      },
      { depth: null }
    );
  });

  next();
});

app.use("/oidc", (req, res, next) => oidcCallback(req, res, next));

// Middleware para parsear JSON
app.use(express.json());

app.use(express.urlencoded({ extended: false }));

// 1) Aplicar CORS globalmente
app.use(cors(corsOptions));

// Aplicar Rate Limiting a todas las rutas
app.use(limiter);

app.use((req, res, next) => {
  // Deja pasar los preflight
  if (req.method === "OPTIONS") return next();

  verifyOriginAndReferer(req, res, next);
});

/* ----------  Health check ---------- */
app.get("/healthz", (_, res) => res.sendStatus(200));

// Rutas con prefijo `/api`
app.use("/api", userRoutes);
app.use("/api", loginRoutes);
app.use("/api", userCvRoutes);
app.use("/api", filesRoutes);
app.use("/api", bagRoutes);
app.use("/api", programRoutes);
app.use("/api", offerRoutes);
app.use("/api", enumsRoutes);
app.use("/api", documentationRoutes);
app.use("/api", auditRoutes);
app.use("/api", statisticsRoutes);
app.use("/api", workspaceRoutes);
app.use("/api", workplaceRoutes);
app.use("/api", preferentsRoutes);
app.use("/api", hiringRoutes);
app.use("/api", leaveRoutes);
app.use("/api", userChangeRequest);
app.use("/api", volunteerApplicationRoutes);
app.use("/api", sesameRoutes);
app.use("/api", userDocumentationAudit);
app.use("/api", scopedRoleRoutes);
app.use("/api", attendedUserRoutes);
app.use("/api", moduleScopeRoutes);
app.use("/api", documentationReceiptTemplaterRoutes);
app.use("/api", anideCentroManagerRoutes);
app.use("/api", oidcApiRoutes);
app.use("/api", moodleRoutes);

/* ----------  Manejador de errores ---------- */
app.use((err, req, res, next) => {
  const status = err.status || 500;

  const message =
    status === 429
      ? "Ha alcanzado el número máximo de solicitudes, inténtelo más tarde"
      : status === 500
        ? "Error interno en el servidor"
        : status === 404
          ? "Ruta no encontrada"
          : err.message;

  resError(res, status, message);
});

// Iniciar el servidor
const startServer = async () => {
  await connectToDatabase();

  // Inicializa el proveedor solo después de conectar Mongo,
  // porque oidc-provider guarda códigos, sesiones y grants en OidcRecord.
  await initOidcProvider();

  // Devuelve el middleware que expone Discovery, JWKS, auth y token.
  oidcCallback = getOidcProvider().callback();

  app.listen(port, () => {
    console.log(`Servidor ejecutándose en el puerto ${port}`);
  });
};

// Llamar a la función para iniciar el servidor
startServer();