const META_INSTAGRAM_USER_ID = String(
  process.env.META_INSTAGRAM_USER_ID || ""
).trim();

const META_INSTAGRAM_ACCESS_TOKEN = String(
  process.env.META_INSTAGRAM_ACCESS_TOKEN || ""
).trim();

const rawApiVersion = String(
  process.env.META_INSTAGRAM_API_VERSION || ""
)
  .trim()
  .replace(/^\/+|\/+$/g, "");

const META_INSTAGRAM_API_VERSION = rawApiVersion.startsWith("v")
  ? rawApiVersion
  : `v${rawApiVersion}`;

const META_INSTAGRAM_BASE_URL =
  "https://graph.instagram.com";

if (!META_INSTAGRAM_USER_ID) {
  throw new Error("Falta META_INSTAGRAM_USER_ID en .env");
}

if (!META_INSTAGRAM_ACCESS_TOKEN) {
  throw new Error(
    "Falta META_INSTAGRAM_ACCESS_TOKEN en .env"
  );
}

if (!rawApiVersion) {
  throw new Error(
    "Falta META_INSTAGRAM_API_VERSION en .env"
  );
}

function appendParams(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, String(value));
  });
}

async function request(path, params = {}) {
  const cleanPath = String(path).replace(/^\/+/, "");

  const url = new URL(
    `${META_INSTAGRAM_BASE_URL}/${META_INSTAGRAM_API_VERSION}/${cleanPath}`
  );

  appendParams(url, params);

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${META_INSTAGRAM_ACCESS_TOKEN}`,
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    const err = new Error(
      `No se pudo conectar con Instagram: ${
        error?.message || "error de red desconocido"
      }`
    );

    err.cause = error;
    err.url = url.toString();

    throw err;
  }

  const raw = await response.text();

  let result;

  try {
    result = raw ? JSON.parse(raw) : null;
  } catch {
    result = raw;
  }

  if (!response.ok || result?.error) {
    const err = new Error(
      result?.error?.message ||
        `Instagram respondió con error HTTP ${response.status}`
    );

    err.status = response.status;
    err.details = result;
    err.url = url.toString();

    throw err;
  }

  return result;
}

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "permalink",
  "timestamp",
].join(",");

const instagramService = {
  async listMedia({
    limit = 100,
    after,
  } = {}) {
    const safeLimit = Math.min(
      Math.max(Number(limit) || 100, 1),
      100
    );

    const result = await request(
      `${META_INSTAGRAM_USER_ID}/media`,
      {
        fields: MEDIA_FIELDS,
        limit: safeLimit,
        after,
      }
    );

    return {
      media: Array.isArray(result?.data)
        ? result.data
        : [],
      paging: result?.paging || null,
    };
  },

  async getAllMedia({
    limit = 100,
    maxPages = 20,
  } = {}) {
    const media = [];

    let after = null;
    let pages = 0;

    do {
      const result = await instagramService.listMedia({
        limit,
        after,
      });

      media.push(...result.media);

      after =
        result.paging?.cursors?.after || null;

      pages += 1;
    } while (after && pages < maxPages);

    return {
      media,
      pages,
      nextCursor: after,
    };
  },

  async getMediaById(mediaId) {
    if (!mediaId) {
      throw new Error(
        "Falta el identificador de la publicación de Instagram"
      );
    }

    return request(mediaId, {
      fields: MEDIA_FIELDS,
    });
  },
};

module.exports = instagramService;