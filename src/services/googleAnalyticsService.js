const { google } = require("googleapis");

const GA4_PROPERTY_ID = String(
  process.env.GA4_PROPERTY_ID || ""
).trim();

const GA4_CREDENTIALS_BASE64 = String(
  process.env.GA4_CREDENTIALS_BASE64 || ""
).trim();

let analyticsDataClient = null;

const assertConfig = () => {
  if (!GA4_PROPERTY_ID) {
    throw new Error("Falta GA4_PROPERTY_ID en .env");
  }

  if (!GA4_CREDENTIALS_BASE64) {
    throw new Error("Falta GA4_CREDENTIALS_BASE64 en .env");
  }
};

const getAnalyticsDataClient = () => {
  if (analyticsDataClient) return analyticsDataClient;

  assertConfig();

  let credentials;

  try {
    credentials = JSON.parse(
      Buffer.from(GA4_CREDENTIALS_BASE64, "base64").toString("utf8")
    );
  } catch (error) {
    throw new Error(
      `GA4_CREDENTIALS_BASE64 no es válido: ${error.message}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  analyticsDataClient = google.analyticsdata({
    version: "v1beta",
    auth,
  });

  return analyticsDataClient;
};

const normalizePath = (value) => {
  if (!value) return "";

  try {
    const url = new URL(value);
    return url.pathname || "/";
  } catch {
    const path = String(value).trim().split("?")[0];
    return path.startsWith("/") ? path : `/${path}`;
  }
};

const getPathVariants = (value) => {
  const path = normalizePath(value);

  if (!path) return [];
  if (path === "/") return [path];

  const withoutTrailingSlash = path.replace(/\/+$/, "");

  return [
    ...new Set([
      path,
      withoutTrailingSlash,
      `${withoutTrailingSlash}/`,
    ]),
  ];
};

const googleAnalyticsService = {
  async getPageViewsByUrls(
    urls,
    { startDate = "2026-01-01", endDate = "today" } = {}
  ) {
    const requestedUrls = [...new Set((urls || []).filter(Boolean))];

    if (!requestedUrls.length) return new Map();

    const analyticsData = getAnalyticsDataClient();

    const { data } = await analyticsData.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        limit: "100000",
      },
    });

    const viewsByPath = new Map();

    for (const row of data.rows || []) {
      const path = row.dimensionValues?.[0]?.value || "";
      const views = Number(row.metricValues?.[0]?.value || 0);

      viewsByPath.set(path, (viewsByPath.get(path) || 0) + views);
    }

    const viewsByUrl = new Map();

    for (const url of requestedUrls) {
      const views = getPathVariants(url).reduce(
        (total, path) => total + (viewsByPath.get(path) || 0),
        0
      );

      viewsByUrl.set(url, views);
    }

    return viewsByUrl;
  },
};

module.exports = googleAnalyticsService;
