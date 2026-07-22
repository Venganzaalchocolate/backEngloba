const WORDPRESS_BASE_URL = String(
  process.env.WORDPRESS_BASE_URL || ""
)
  .trim()
  .replace(/\/+$/, "");

if (!WORDPRESS_BASE_URL) {
  throw new Error("Falta WORDPRESS_BASE_URL en .env");
}

function appendParams(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    const finalValue =
      value instanceof Date ? value.toISOString() : String(value);

    url.searchParams.set(key, finalValue);
  });
}

async function request(path, params = {}) {
  const url = new URL(path, `${WORDPRESS_BASE_URL}/`);

  appendParams(url, params);

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    const err = new Error(
      `No se pudo conectar con WordPress: ${
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

  if (!response.ok) {
    const err = new Error(
      result?.message ||
        `WordPress respondió con error HTTP ${response.status}`
    );

    err.status = response.status;
    err.details = result;
    err.url = url.toString();

    throw err;
  }

  return {
    data: result,
    total: Number(response.headers.get("x-wp-total") || 0),
    totalPages: Number(
      response.headers.get("x-wp-totalpages") || 0
    ),
  };
}

const POST_FIELDS = [
  "id",
  "date",
  "date_gmt",
  "modified",
  "link",
  "slug",
  "title",
  "categories",
  "featured_media",
].join(",");

const wordpressService = {
  async listPosts({
    after,
    before,
    page = 1,
    perPage = 100,
    order = "asc",
  } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safePerPage = Math.min(
      Math.max(Number(perPage) || 100, 1),
      100
    );

    const { data, total, totalPages } = await request(
      "/wp-json/wp/v2/posts",
      {
        after,
        before,
        page: safePage,
        per_page: safePerPage,
        order,
        orderby: "date",
        status: "publish",
        _fields: POST_FIELDS,
      }
    );

    return {
      posts: Array.isArray(data) ? data : [],
      page: safePage,
      total,
      totalPages,
    };
  },

  async getAllPosts(params = {}) {
    const firstPage = await wordpressService.listPosts({
      ...params,
      page: 1,
      perPage: 100,
    });

    const posts = [...firstPage.posts];

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const result = await wordpressService.listPosts({
        ...params,
        page,
        perPage: 100,
      });

      posts.push(...result.posts);
    }

    return posts;
  },

  async getPostById(postId) {
    if (!postId) {
      throw new Error("Falta el identificador de WordPress");
    }

    const { data } = await request(
      `/wp-json/wp/v2/posts/${postId}`,
      {
        _fields: POST_FIELDS,
      }
    );

    return data;
  },
};

module.exports = wordpressService;