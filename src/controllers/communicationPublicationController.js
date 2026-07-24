const { CommunicationPublication } = require("../models/indexModels");
const wordpressService = require("../services/wordpressService");
const instagramService = require("../services/instagramService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const {
  notifyCommunicationPublicationCompleted,
} = require("./emailControllerGoogle");

const madridDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INSTAGRAM_SYNC_LIMIT = 30;

const populatePublication = (query) =>
  query
    .populate("programs", "name acronym active")
    .populate({
      path: "dispositives",
      select: "name active province program",
      populate: [
        { path: "province", select: "name" },
        { path: "program", select: "name acronym" },
      ],
    })
    .populate("createdBy", "firstName lastName")
    .populate("updatedBy", "firstName lastName");

const assertRoot = (req) => {
  if (req.user?.role !== "root") {
    throw new ClientError(
      "No tienes permisos para realizar esta acción",
      403
    );
  }
};

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeBasicHtmlEntities = (value = "") =>
  String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const normalizeText = (value = "") =>
  decodeBasicHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeUrl = (value = "") =>
  String(value ?? "")
    .trim()
    .split("#")[0]
    .split("?")[0]
    .replace(/\/+$/, "")
    .toLowerCase();

const instagramCaptionMatches = (caption, matchText) => {
  const normalizedCaption = normalizeText(caption);
  const normalizedMatchText = normalizeText(matchText);

  return Boolean(
    normalizedCaption &&
      normalizedMatchText &&
      normalizedCaption.includes(normalizedMatchText)
  );
};

const getMadridDate = (value) =>
  madridDateFormatter.format(new Date(value));

const getWordpressUrl = (post) => post?.link || post?.url || "";
const getWordpressTitle = (post) =>
  typeof post?.title === "string"
    ? post.title
    : post?.title?.rendered || "";
const getWordpressDate = (post) =>
  post?.date || post?.publishedAt || null;

const unique = (values = []) => [
  ...new Set(Array.isArray(values) ? values : []),
];

const calculateStatus = (publication) => {
  const platforms = Array.from(publication.platforms || []);

  if (!platforms.length) return "draft";

  const hasWordpress =
    Number.isInteger(Number(publication.wordpress?.postId)) &&
    Number(publication.wordpress.postId) > 0;

  const hasInstagram = Boolean(
    String(publication.instagram?.mediaId || "").trim()
  );

  const verifiedPlatforms = [
    platforms.includes("wordpress") && hasWordpress,
    platforms.includes("instagram") && hasInstagram,
  ].filter(Boolean).length;

  if (verifiedPlatforms === platforms.length) return "complete";
  if (verifiedPlatforms > 0) return "partial";

  const hasScheduledDate = platforms.some((platform) =>
    platform === "wordpress"
      ? Boolean(publication.wordpress?.publicationDate)
      : Boolean(publication.instagram?.publicationDate)
  );

  return hasScheduledDate ? "scheduled" : "draft";
};

const notifyIfPublicationBecameComplete = async (
  publication,
  previousStatus = null
) => {
  const platforms = Array.from(publication?.platforms || []);

  const becameComplete =
    previousStatus !== "complete" && publication?.status === "complete";

  const hasBothPlatforms =
    platforms.includes("wordpress") && platforms.includes("instagram");

  if (!becameComplete || !hasBothPlatforms) return;

  try {
    const result = await notifyCommunicationPublicationCompleted({
      publication,
    });

    if (!result?.ok) {
      console.warn(
        `[Comunicación] No se envió el aviso de "${publication.title}":`,
        result?.reason || result?.error || "Motivo desconocido"
      );
    }
  } catch (error) {
    console.error(
      `[Comunicación] Error enviando el aviso de "${publication.title}":`,
      error?.message || error
    );
  }
};

const validatePublicationDate = (date, platformLabel) => {
  if (!DATE_REGEX.test(String(date || ""))) {
    throw new ClientError(
      `La fecha prevista de ${platformLabel} no es válida`,
      400
    );
  }
};

const buildPublicationData = ({
  title,
  platforms = [],
  programs = [],
  dispositives = [],
  wordpress = {},
  instagram = {},
} = {}) => {
  const normalizedTitle = String(title || "").trim();
  const normalizedPlatforms = unique(platforms).filter((platform) =>
    ["wordpress", "instagram"].includes(platform)
  );

  if (!normalizedTitle) {
    throw new ClientError("El título es obligatorio", 400);
  }

  if (!normalizedPlatforms.length) {
    throw new ClientError("Debes seleccionar al menos un medio", 400);
  }

  const wordpressPublicationDate = normalizedPlatforms.includes("wordpress")
    ? String(wordpress.publicationDate || "").trim()
    : null;

  const instagramPublicationDate = normalizedPlatforms.includes("instagram")
    ? String(instagram.publicationDate || "").trim()
    : null;

  if (normalizedPlatforms.includes("wordpress")) {
    validatePublicationDate(wordpressPublicationDate, "WordPress");
  }

  if (normalizedPlatforms.includes("instagram")) {
    validatePublicationDate(instagramPublicationDate, "Instagram");
  }

  const instagramUrl = String(instagram.url || "").trim();
  const instagramMatchText = String(instagram.matchText || "").trim();

  if (
    normalizedPlatforms.includes("instagram") &&
    !instagramUrl &&
    !instagramMatchText
  ) {
    throw new ClientError(
      "Debes indicar el enlace o un fragmento del texto de Instagram",
      400
    );
  }

  if (
    normalizedPlatforms.includes("instagram") &&
    !instagramUrl &&
    normalizeText(instagramMatchText).split(" ").filter(Boolean).length < 4
  ) {
    throw new ClientError(
      "El fragmento de Instagram debe contener al menos cuatro palabras",
      400
    );
  }

  return {
    title: normalizedTitle,
    platforms: normalizedPlatforms,
    programs: unique(programs),
    dispositives: unique(dispositives),
    wordpress: {
      publicationDate: wordpressPublicationDate,
      url: normalizedPlatforms.includes("wordpress")
        ? String(wordpress.url || "").trim() || null
        : null,
    },
    instagram: {
      publicationDate: instagramPublicationDate,
      url: normalizedPlatforms.includes("instagram")
        ? instagramUrl || null
        : null,
      matchText: normalizedPlatforms.includes("instagram")
        ? instagramMatchText
        : "",
    },
  };
};

const clearUnusedPlatforms = (publication) => {
  const platforms = Array.from(publication.platforms || []);

  if (!platforms.includes("wordpress")) {
    publication.wordpress = {
      publicationDate: null,
      postId: null,
      url: null,
      publishedAt: null,
      stats: [],
    };
  }

  if (!platforms.includes("instagram")) {
    publication.instagram = {
      publicationDate: null,
      mediaId: null,
      url: null,
      matchText: "",
      matchStatus: "pending",
      caption: "",
      mediaType: "",
      publishedAt: null,
      stats: [],
    };
  }
};

const resetWordpressMatch = (publication) => {
  publication.wordpress.postId = null;
  publication.wordpress.publishedAt = null;
  publication.wordpress.stats = [];
};

const resetInstagramMatch = (publication) => {
  publication.instagram.mediaId = null;
  publication.instagram.caption = "";
  publication.instagram.mediaType = "";
  publication.instagram.publishedAt = null;
  publication.instagram.matchStatus = "pending";
  publication.instagram.stats = [];
};

const matchWordpressPublication = (publication, posts = []) => {
  if (
    !publication.platforms?.includes("wordpress") ||
    publication.wordpress?.postId
  ) {
    return;
  }

  const expectedUrl = normalizeUrl(publication.wordpress?.url);
  const expectedTitle = normalizeText(publication.title);

  let candidates = [];

  if (expectedUrl) {
    candidates = posts.filter(
      (post) => normalizeUrl(getWordpressUrl(post)) === expectedUrl
    );
  } else if (expectedTitle) {
    const exactTitleMatches = posts.filter(
      (post) => normalizeText(getWordpressTitle(post)) === expectedTitle
    );

    candidates = exactTitleMatches.length
      ? exactTitleMatches
      : posts.filter((post) => {
          const title = normalizeText(getWordpressTitle(post));
          return (
            title &&
            (title.includes(expectedTitle) || expectedTitle.includes(title))
          );
        });
  }

  if (candidates.length !== 1) return;

  const post = candidates[0];
  const postId = Number(post?.id);
  const publishedAt = getWordpressDate(post);

  if (!Number.isInteger(postId) || postId <= 0) return;

  publication.wordpress.postId = postId;
  publication.wordpress.url = getWordpressUrl(post) || null;
  publication.wordpress.publishedAt = publishedAt
    ? new Date(publishedAt)
    : null;
};

const matchInstagramPublication = (publication, media = []) => {
  if (
    !publication.platforms?.includes("instagram") ||
    publication.instagram?.mediaId
  ) {
    return;
  }

  const expectedUrl = normalizeUrl(publication.instagram?.url);
  const matchText = publication.instagram?.matchText || "";

  if (!expectedUrl && !normalizeText(matchText)) {
    publication.instagram.matchStatus = "pending";
    return;
  }

  const candidates = expectedUrl
    ? media.filter(
        (item) => normalizeUrl(item?.permalink) === expectedUrl
      )
    : media.filter((item) =>
        instagramCaptionMatches(item?.caption || "", matchText)
      );

  if (!candidates.length) {
    publication.instagram.matchStatus = "pending";
    return;
  }

  if (candidates.length > 1) {
    publication.instagram.matchStatus = "ambiguous";
    return;
  }

  const item = candidates[0];
  const mediaId = String(item?.id || "").trim();

  if (!mediaId) {
    publication.instagram.matchStatus = "pending";
    return;
  }

  publication.instagram.mediaId = mediaId;
  publication.instagram.url = item.permalink || null;
  publication.instagram.caption = item.caption || "";
  publication.instagram.mediaType = item.media_type || "";
  publication.instagram.publishedAt = item.timestamp
    ? new Date(item.timestamp)
    : null;
  publication.instagram.matchStatus = "matched";
};

const syncExternalPublicationData = async (
  publication,
  { debug = false } = {}
) => {
  const today = getMadridDate(new Date());
  const wordpressDate = publication.wordpress?.publicationDate;
  const instagramDate = publication.instagram?.publicationDate;

  const needsWordpress = Boolean(
    publication.platforms?.includes("wordpress") &&
      !publication.wordpress?.postId &&
      wordpressDate &&
      wordpressDate <= today
  );

  const needsInstagram = Boolean(
    publication.platforms?.includes("instagram") &&
      !publication.instagram?.mediaId &&
      instagramDate &&
      instagramDate <= today
  );

  const [wordpressResult, instagramResult] = await Promise.allSettled([
    needsWordpress
      ? wordpressService.getAllPosts({
          after: `${wordpressDate}T00:00:00`,
          before: `${wordpressDate}T23:59:59`,
        })
      : Promise.resolve([]),
    needsInstagram
      ? instagramService.listMedia({ limit: INSTAGRAM_SYNC_LIMIT })
      : Promise.resolve({ media: [] }),
  ]);

  const errors = [];

  if (wordpressResult.status === "fulfilled" && needsWordpress) {
    const posts = Array.isArray(wordpressResult.value)
      ? wordpressResult.value
      : [];

    matchWordpressPublication(publication, posts);

    if (debug) {
      console.log("[Comunicación][WordPress]", {
        title: publication.title,
        publicationDate: wordpressDate,
        received: posts.length,
        postId: publication.wordpress?.postId || null,
      });
    }
  } else if (wordpressResult.status === "rejected") {
    const message =
      wordpressResult.reason?.message || "Error en WordPress";
    errors.push(message);

    if (debug) {
      console.error("[Comunicación][WordPress]", message);
    }
  }

  if (instagramResult.status === "fulfilled" && needsInstagram) {
    const recentMedia = Array.isArray(instagramResult.value?.media)
      ? instagramResult.value.media
      : [];

    const mediaFromDate = recentMedia.filter(
      (item) =>
        item?.timestamp &&
        getMadridDate(item.timestamp) === instagramDate
    );

    matchInstagramPublication(publication, mediaFromDate);

    if (debug) {
      console.log("[Comunicación][Instagram]", {
        title: publication.title,
        publicationDate: instagramDate,
        received: recentMedia.length,
        fromDate: mediaFromDate.length,
        mediaId: publication.instagram?.mediaId || null,
        matchStatus: publication.instagram?.matchStatus || "pending",
      });
    }
  } else if (instagramResult.status === "rejected") {
    const message =
      instagramResult.reason?.message || "Error en Instagram";
    errors.push(message);

    if (debug) {
      console.error("[Comunicación][Instagram]", message);
    }
  }

  return errors;
};

/* =========================================================
   CONEXIONES EXTERNAS
========================================================= */

const getWordpressPosts = async (req, res) => {
  const {
    after,
    before,
    page = 1,
    perPage = 100,
    all = false,
  } = req.body;

  const result = all
    ? await wordpressService.getAllPosts({ after, before })
    : await wordpressService.listPosts({
        after,
        before,
        page,
        perPage,
      });

  response(res, 200, result);
};

const getInstagramMedia = async (req, res) => {
  const {
    limit = 30,
    after,
    all = false,
    maxPages = 20,
  } = req.body;

  const result = all
    ? await instagramService.getAllMedia({ limit, maxPages })
    : await instagramService.listMedia({ limit, after });

  response(res, 200, result);
};

const getCommunicationConnections = async (req, res) => {
  const [wordpress, instagram] = await Promise.allSettled([
    wordpressService.listPosts({ page: 1, perPage: 1, order: "desc" }),
    instagramService.listMedia({ limit: 1 }),
  ]);

  response(res, 200, {
    wordpress: {
      connected: wordpress.status === "fulfilled",
      sample:
        wordpress.status === "fulfilled"
          ? wordpress.value.posts[0] || null
          : null,
      error:
        wordpress.status === "rejected"
          ? wordpress.reason.message
          : null,
    },
    instagram: {
      connected: instagram.status === "fulfilled",
      sample:
        instagram.status === "fulfilled"
          ? instagram.value.media[0] || null
          : null,
      error:
        instagram.status === "rejected"
          ? instagram.reason.message
          : null,
    },
  });
};

/* =========================================================
   CREAR
========================================================= */

const postCreateCommunicationPublication = async (req, res) => {
  assertRoot(req);

  const data = buildPublicationData(req.body);

  clearUnusedPlatforms(data);

  const externalErrors = await syncExternalPublicationData(data);

  data.status = calculateStatus(data);
  data.createdBy = req.user._id;
  data.updatedBy = req.user._id;
  data.history = [
    {
      action: "created",
      changedBy: req.user._id,
      details: {
        status: data.status,
        wordpressPublicationDate:
          data.wordpress?.publicationDate || null,
        instagramPublicationDate:
          data.instagram?.publicationDate || null,
        externalErrors,
      },
    },
  ];

  const created = await CommunicationPublication.create(data);

  await notifyIfPublicationBecameComplete(created, null);

  const publication = await populatePublication(
    CommunicationPublication.findById(created._id)
  ).lean();

  response(res, 200, publication);
};

/* =========================================================
   LISTAR
========================================================= */

const getCommunicationPublications = async (req, res) => {
  const {
    page = 1,
    limit = 50,
    status,
    medium,
    program,
    dispositive,
    search,
    dateFrom,
    dateTo,
  } = req.body;

  const currentPage = Math.max(Number(page) || 1, 1);
  const currentLimit = Math.min(
    Math.max(Number(limit) || 50, 1),
    100
  );

  const filter = {};

  if (status) filter.status = status;
  if (program) filter.programs = program;
  if (dispositive) filter.dispositives = dispositive;

  if (search?.trim()) {
    filter.title = {
      $regex: escapeRegex(search.trim()),
      $options: "i",
    };
  }

  if (dateFrom || dateTo) {
    const dateRange = {};

    if (dateFrom) dateRange.$gte = dateFrom;
    if (dateTo) dateRange.$lte = dateTo;

    filter.$or = [
      { "wordpress.publicationDate": dateRange },
      { "instagram.publicationDate": dateRange },
    ];
  }

  if (medium === "both") {
    filter.platforms = { $all: ["wordpress", "instagram"] };
  }

  if (medium === "wordpress") {
    filter.platforms = { $all: ["wordpress"], $nin: ["instagram"] };
  }

  if (medium === "instagram") {
    filter.platforms = { $all: ["instagram"], $nin: ["wordpress"] };
  }

  if (medium === "pending") {
    filter.status = { $in: ["draft", "scheduled"] };
  }

  const [publications, total] = await Promise.all([
    populatePublication(
      CommunicationPublication.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * currentLimit)
        .limit(currentLimit)
    ).lean(),
    CommunicationPublication.countDocuments(filter),
  ]);

  response(res, 200, {
    publications,
    page: currentPage,
    limit: currentLimit,
    total,
    totalPages: Math.ceil(total / currentLimit),
  });
};

/* =========================================================
   OBTENER UNA PUBLICACIÓN
========================================================= */

const getCommunicationPublicationById = async (req, res) => {
  const publication = await populatePublication(
    CommunicationPublication.findById(req.body.publicationId)
  ).lean();

  if (!publication) {
    throw new ClientError("Publicación no encontrada", 404);
  }

  response(res, 200, publication);
};

/* =========================================================
   ACTUALIZAR
========================================================= */

const postUpdateCommunicationPublication = async (req, res) => {
  assertRoot(req);

  const publication = await CommunicationPublication.findById(
    req.body.publicationId
  );

  if (!publication) {
    throw new ClientError("Publicación no encontrada", 404);
  }

  const data = buildPublicationData(req.body);
  const previousStatus = publication.status;

  const wordpressDateChanged =
    data.wordpress.publicationDate !==
    publication.wordpress?.publicationDate;

  const instagramDateChanged =
    data.instagram.publicationDate !==
    publication.instagram?.publicationDate;

  const titleChanged =
    normalizeText(data.title) !== normalizeText(publication.title);

  const wordpressChanged =
    wordpressDateChanged ||
    normalizeUrl(data.wordpress.url) !==
      normalizeUrl(publication.wordpress?.url) ||
    (!data.wordpress.url && titleChanged);

  const instagramChanged =
    instagramDateChanged ||
    normalizeUrl(data.instagram.url) !==
      normalizeUrl(publication.instagram?.url) ||
    normalizeText(data.instagram.matchText) !==
      normalizeText(publication.instagram?.matchText);

  publication.title = data.title;
  publication.platforms = data.platforms;
  publication.programs = data.programs;
  publication.dispositives = data.dispositives;

  publication.wordpress.publicationDate =
    data.wordpress.publicationDate;
  publication.wordpress.url = data.wordpress.url;

  publication.instagram.publicationDate =
    data.instagram.publicationDate;
  publication.instagram.url = data.instagram.url;
  publication.instagram.matchText = data.instagram.matchText;

  if (
    wordpressChanged &&
    publication.platforms.includes("wordpress")
  ) {
    resetWordpressMatch(publication);
  }

  if (
    instagramChanged &&
    publication.platforms.includes("instagram")
  ) {
    resetInstagramMatch(publication);
  }

  clearUnusedPlatforms(publication);

  const externalErrors = await syncExternalPublicationData(publication);

  publication.status = calculateStatus(publication);
  publication.updatedBy = req.user._id;

  publication.history.push({
    action: "updated",
    changedBy: req.user._id,
    details: {
      previousStatus,
      status: publication.status,
      wordpressPublicationDate:
        publication.wordpress?.publicationDate || null,
      instagramPublicationDate:
        publication.instagram?.publicationDate || null,
      externalErrors,
    },
  });

  await publication.save();

  await notifyIfPublicationBecameComplete(
    publication,
    previousStatus
  );

  const updated = await populatePublication(
    CommunicationPublication.findById(publication._id)
  ).lean();

  response(res, 200, updated);
};

/* =========================================================
   ELIMINAR
========================================================= */

const postDeleteCommunicationPublication = async (req, res) => {
  assertRoot(req);

  const publication =
    await CommunicationPublication.findByIdAndDelete(
      req.body.publicationId
    );

  if (!publication) {
    throw new ClientError("Publicación no encontrada", 404);
  }

  response(res, 200, { success: true });
};

/* =========================================================
   SINCRONIZACIÓN PARA EL CRON
========================================================= */

const syncPendingCommunicationPublications = async () => {
  const today = getMadridDate(new Date());

  const publications = await CommunicationPublication.find({
    $or: [
      {
        platforms: "wordpress",
        "wordpress.postId": null,
        "wordpress.publicationDate": { $lte: today },
      },
      {
        platforms: "instagram",
        "instagram.mediaId": null,
        "instagram.publicationDate": { $lte: today },
      },
    ],
  });

  let updated = 0;
  let notifications = 0;
  const errors = [];

  for (const publication of publications) {
    const previousStatus = publication.status;
    const previousWordpressPostId = publication.wordpress?.postId || null;
    const previousInstagramMediaId = publication.instagram?.mediaId || null;
    const previousInstagramMatchStatus =
      publication.instagram?.matchStatus || "pending";

    const externalErrors = await syncExternalPublicationData(publication);
    const nextStatus = calculateStatus(publication);

    if (externalErrors.length) {
      errors.push({
        publicationId: String(publication._id),
        title: publication.title,
        errors: externalErrors,
      });
    }

    const hasChanges =
      previousWordpressPostId !==
        (publication.wordpress?.postId || null) ||
      previousInstagramMediaId !==
        (publication.instagram?.mediaId || null) ||
      previousInstagramMatchStatus !==
        (publication.instagram?.matchStatus || "pending") ||
      previousStatus !== nextStatus;

    if (!hasChanges) continue;

    publication.status = nextStatus;
    await publication.save();
    updated += 1;

    const becameComplete =
      previousStatus !== "complete" && nextStatus === "complete";

    const hasBothPlatforms =
      publication.platforms?.includes("wordpress") &&
      publication.platforms?.includes("instagram");

    if (becameComplete && hasBothPlatforms) {
      const result = await notifyCommunicationPublicationCompleted({
        publication,
      });

      if (result?.ok) {
        notifications += 1;
      } else {
        console.warn(
          `[Comunicación] Publicación completada sin aviso: "${publication.title}"`,
          result?.reason || result?.error || ""
        );
      }
    }
  }

  return {
    processed: publications.length,
    updated,
    notifications,
    errors,
  };
};




module.exports = {
  getWordpressPosts: catchAsync(getWordpressPosts),
  getInstagramMedia: catchAsync(getInstagramMedia),
  getCommunicationConnections: catchAsync(
    getCommunicationConnections
  ),
  postCreateCommunicationPublication: catchAsync(
    postCreateCommunicationPublication
  ),
  getCommunicationPublications: catchAsync(
    getCommunicationPublications
  ),
  getCommunicationPublicationById: catchAsync(
    getCommunicationPublicationById
  ),
  postUpdateCommunicationPublication: catchAsync(
    postUpdateCommunicationPublication
  ),
  postDeleteCommunicationPublication: catchAsync(
    postDeleteCommunicationPublication
  ),
  syncPendingCommunicationPublications,
};
