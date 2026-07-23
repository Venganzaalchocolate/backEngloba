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

const META_INSTAGRAM_BASE_URL = "https://graph.instagram.com";

if (!META_INSTAGRAM_USER_ID) {
  throw new Error("Falta META_INSTAGRAM_USER_ID en .env");
}

if (!META_INSTAGRAM_ACCESS_TOKEN) {
  throw new Error("Falta META_INSTAGRAM_ACCESS_TOKEN en .env");
}

if (!rawApiVersion) {
  throw new Error("Falta META_INSTAGRAM_API_VERSION en .env");
}

function appendParams(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
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

const INSIGHT_METRICS = [
  "views",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "total_interactions",
];

function getInsightValue(item) {
  const totalValue = item?.total_value?.value;

  if (totalValue !== undefined && totalValue !== null) {
    return Number(totalValue) || 0;
  }

  const firstValue = item?.values?.[0]?.value;

  if (firstValue !== undefined && firstValue !== null) {
    return Number(firstValue) || 0;
  }

  return 0;
}

function mapInsights(items = []) {
  return items.reduce((result, item) => {
    if (item?.name) result[item.name] = getInsightValue(item);
    return result;
  }, {});
}

async function requestMediaInsights(mediaId) {
  try {
    const result = await request(`${mediaId}/insights`, {
      metric: INSIGHT_METRICS.join(","),
    });

    return Array.isArray(result?.data) ? result.data : [];
  } catch (combinedError) {
    const results = await Promise.all(
      INSIGHT_METRICS.map(async (metric) => {
        try {
          const result = await request(`${mediaId}/insights`, { metric });
          return Array.isArray(result?.data) ? result.data : [];
        } catch {
          return [];
        }
      })
    );

    const availableInsights = results.flat();

    if (!availableInsights.length) throw combinedError;
    return availableInsights;
  }
}

const instagramService = {
  async listMedia({ limit = 100, after } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);

    const result = await request(`${META_INSTAGRAM_USER_ID}/media`, {
      fields: MEDIA_FIELDS,
      limit: safeLimit,
      after,
    });

    return {
      media: Array.isArray(result?.data) ? result.data : [],
      paging: result?.paging || null,
    };
  },

  async getAllMedia({ limit = 100, maxPages = 20 } = {}) {
    const media = [];
    let after = null;
    let pages = 0;

    do {
      const result = await instagramService.listMedia({ limit, after });
      media.push(...result.media);
      after = result.paging?.cursors?.after || null;
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

  async getMediaInsights(mediaId) {
    if (!mediaId) {
      throw new Error(
        "Falta el identificador de la publicación de Instagram"
      );
    }

    const insights = mapInsights(await requestMediaInsights(mediaId));

    const likes = insights.likes || 0;
    const comments = insights.comments || 0;
    const saved = insights.saved || 0;
    const shares = insights.shares || 0;

    return {
      views: insights.views || 0,
      reach: insights.reach || 0,
      likes,
      comments,
      saved,
      shares,
      totalInteractions:
        insights.total_interactions ?? likes + comments + saved + shares,
    };
  },
};

module.exports = instagramService;