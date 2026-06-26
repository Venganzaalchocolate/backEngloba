const { User, OidcRecord } = require("../models/indexModels");

let provider = null;

const requireEnv = (name) => {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`Falta ${name} en .env`);
  }

  return value;
};

const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");

class MongoAdapter {
  constructor(type) {
    this.type = type;
  }

async upsert(id, payload, expiresIn) {
  if (this.type === "IdToken") {
    console.dir(
      {
        action: "oidc-id-token-artifact",
        artifactIdPresent: Boolean(id),
        kind: payload?.kind || null,
        clientId: payload?.clientId || null,
        accountId: payload?.accountId || null,
        audience: payload?.aud || null,
        subject: payload?.sub || null,
        noncePresent: Boolean(payload?.nonce),
        nonceType: payload?.nonce ? typeof payload.nonce : null,
      },
      { depth: null }
    );
  }

  await OidcRecord.findOneAndUpdate(
    {
      type: this.type,
      id,
    },
    {
      type: this.type,
      id,
      payload,
      expiresAt: new Date(Date.now() + Number(expiresIn) * 1000),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

  async find(id) {
    const record = await OidcRecord.findOne({
      type: this.type,
      id,
      expiresAt: { $gt: new Date() },
    }).lean();

    return record?.payload || undefined;
  }

  async findByUserCode(userCode) {
    const record = await OidcRecord.findOne({
      type: this.type,
      "payload.userCode": userCode,
      expiresAt: { $gt: new Date() },
    }).lean();

    return record?.payload || undefined;
  }

  async findByUid(uid) {
    const record = await OidcRecord.findOne({
      type: this.type,
      "payload.uid": uid,
      expiresAt: { $gt: new Date() },
    }).lean();

    return record?.payload || undefined;
  }

  async consume(id) {
    await OidcRecord.updateOne(
      {
        type: this.type,
        id,
      },
      {
        $set: {
          "payload.consumed": Math.floor(Date.now() / 1000),
        },
      }
    );
  }

  async destroy(id) {
    await OidcRecord.deleteOne({
      type: this.type,
      id,
    });
  }

  async revokeByGrantId(grantId) {
    await OidcRecord.deleteMany({
      "payload.grantId": grantId,
    });
  }
}

const buildClaims = (user) => ({
  sub: String(user._id),
  preferred_username: `engloba_${user._id}`,
  email: String(user.email || "").trim().toLowerCase(),
  email_verified: true,
  given_name: String(user.firstName || "").trim(),
  family_name: String(user.lastName || "").trim(),
  name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
});

const initOidcProvider = async () => {
  if (provider) return provider;

  const issuer = normalizeUrl(requireEnv("OIDC_ISSUER"));
  const clientId = requireEnv("OIDC_MOODLE_CLIENT_ID");
  const clientSecret = requireEnv("OIDC_MOODLE_CLIENT_SECRET");
  const redirectUri = requireEnv("OIDC_MOODLE_REDIRECT_URI");

  const cookieKeys = requireEnv("OIDC_COOKIE_KEYS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (cookieKeys.length < 2) {
    throw new Error(
      "OIDC_COOKIE_KEYS debe contener dos claves separadas por coma"
    );
  }

  let jwks;

  try {
    jwks = JSON.parse(
      Buffer.from(
        requireEnv("OIDC_JWKS_BASE64"),
        "base64"
      ).toString("utf8")
    );
  } catch {
    throw new Error("OIDC_JWKS_BASE64 no contiene un JWKS válido");
  }

  if (!Array.isArray(jwks.keys) || !jwks.keys.length) {
    throw new Error("OIDC_JWKS_BASE64 no contiene ninguna clave");
  }

  const allowedMoodleResources = [
    "https://graph.microsoft.com",
    issuer,
  ];

  const { Provider } = await import("oidc-provider");

  provider = new Provider(issuer, {
    adapter: MongoAdapter,

    jwks,

    cookies: {
      keys: cookieKeys,
    },

    clients: [
      {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ["code"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "client_secret_post",
        application_type: "web",
      },
    ],

    claims: {
      openid: ["sub"],
      profile: [
        "name",
        "given_name",
        "family_name",
        "preferred_username",
      ],
      email: ["email", "email_verified"],
    },

    // Moodle auth_oidc necesita preferred_username dentro del id_token
    // para vincularlo con el username estable engloba_<User._id>.
    conformIdTokenClaims: false,

    interactions: {
      url(_, interaction) {
        return `${issuer}/interaction/${interaction.uid}`;
      },
    },

    pkce: {
      required: () => false,
    },

    features: {
      devInteractions: {
        enabled: false,
      },

      resourceIndicators: {
        enabled: true,

        async getResourceServerInfo(
          _ctx,
          resourceIndicator,
          client
        ) {
          const isMoodleClient = client.clientId === clientId;
          const isAllowedResource = allowedMoodleResources.includes(
            resourceIndicator
          );

          console.dir(
            {
              action: "oidc-resource-indicator",
              clientId: client.clientId,
              resourceIndicator,
              isMoodleClient,
              isAllowedResource,
            },
            { depth: null }
          );

          if (!isMoodleClient || !isAllowedResource) {
            return undefined;
          }

          return {
            audience: resourceIndicator,
            scope: "openid profile email",
            accessTokenFormat: "opaque",
          };
        },
      },
    },

    findAccount: async (_, accountId) => {
      const user = await User.findById(accountId)
        .select("_id firstName lastName email employmentStatus")
        .lean();

      if (
        !user ||
        user.employmentStatus !== "activo" ||
        !String(user.email || "").trim()
      ) {
        return undefined;
      }

      return {
        accountId: String(user._id),
        claims: async () => buildClaims(user),
      };
    },
  });

  provider.proxy = true;

  console.log(`[OIDC] Provider preparado: ${issuer}`);

  return provider;
};

const getOidcProvider = () => {
  if (!provider) {
    throw new Error("OIDC Provider no está inicializado");
  }

  return provider;
};

module.exports = {
  initOidcProvider,
  getOidcProvider,
};