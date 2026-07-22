const { CommunicationPublication, Dispositive } = require("../models/indexModels");
const wordpressService = require("../services/wordpressService");
const instagramService = require("../services/instagramService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");

const populatePublication = (query) =>
  query
    .populate("program", "name acronym active")
    .populate({
      path: "dispositive",
      select: "name active province program",
      populate: [
        { path: "province", select: "name" },
        { path: "program", select: "name acronym" },
      ],
    })
    .populate("createdBy", "firstName lastName")
    .populate("updatedBy", "firstName lastName");

const assertRoot = (req) => {
  if (req.user?.role !== "root") throw new ClientError("No tienes permisos para realizar esta acción", 403);
};

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeText = (value = "") =>
  String(value)
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeUrl = (value = "") => String(value).trim().split("?")[0].replace(/\/+$/, "").toLowerCase();

const getMadridDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type)?.value;
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
};

const getWordpressUrl = (post) => post?.link || post?.url || "";
const getWordpressTitle = (post) => typeof post?.title === "string" ? post.title : post?.title?.rendered || "";
const getWordpressDate = (post) => post?.date || post?.publishedAt || null;

const calculateStatus = (publication) => {
  const platforms = Array.from(publication.platforms || []);
  if (!platforms.length) return "draft";
  const hasWordpress = Boolean(publication.wordpress?.postId || publication.wordpress?.url);
  const hasInstagram = Boolean(publication.instagram?.mediaId || publication.instagram?.url);
  let publishedCount = 0;
  if (platforms.includes("wordpress") && hasWordpress) publishedCount += 1;
  if (platforms.includes("instagram") && hasInstagram) publishedCount += 1;
  if (publishedCount === platforms.length) return "complete";
  if (publishedCount > 0) return "partial";
  return publication.publicationDate ? "scheduled" : "draft";
};

const buildPublicationData = (body) => {
  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.publicationDate !== undefined) {
    if (body.publicationDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.publicationDate)) throw new ClientError("La fecha de publicación no es válida", 400);
    data.publicationDate = body.publicationDate || null;
  }
  if (body.platforms !== undefined) {
    const platforms = Array.isArray(body.platforms) ? body.platforms : [];
    data.platforms = [...new Set(platforms)].filter((platform) => ["wordpress", "instagram"].includes(platform));
  }
  if (body.scopeType !== undefined) data.scopeType = body.scopeType;
  if (body.program !== undefined) data.program = body.program || null;
  if (body.dispositive !== undefined) data.dispositive = body.dispositive || null;
  if (body.wordpress !== undefined) {
    data.wordpress = {};
    if (body.wordpress.postId !== undefined) data.wordpress.postId = body.wordpress.postId ? Number(body.wordpress.postId) : null;
    if (body.wordpress.url !== undefined) data.wordpress.url = body.wordpress.url?.trim() || null;
    if (body.wordpress.publishedAt !== undefined) data.wordpress.publishedAt = body.wordpress.publishedAt ? new Date(body.wordpress.publishedAt) : null;
  }
  if (body.instagram !== undefined) {
    data.instagram = {};
    if (body.instagram.mediaId !== undefined) data.instagram.mediaId = body.instagram.mediaId || null;
    if (body.instagram.url !== undefined) data.instagram.url = body.instagram.url?.trim() || null;
    if (body.instagram.matchText !== undefined) data.instagram.matchText = body.instagram.matchText?.trim() || "";
    if (body.instagram.caption !== undefined) data.instagram.caption = body.instagram.caption || "";
    if (body.instagram.mediaType !== undefined) data.instagram.mediaType = body.instagram.mediaType || "";
    if (body.instagram.publishedAt !== undefined) data.instagram.publishedAt = body.instagram.publishedAt ? new Date(body.instagram.publishedAt) : null;
  }
  return data;
};

const resolvePublicationScope = async (publication) => {
  if (publication.scopeType === "program") {
    if (!publication.program) throw new ClientError("Debes seleccionar un programa", 400);
    publication.dispositive = null;
    return;
  }
  if (publication.scopeType !== "dispositive") throw new ClientError("El tipo de ámbito no es válido", 400);
  if (!publication.dispositive) throw new ClientError("Debes seleccionar un dispositivo", 400);
  const dispositive = await Dispositive.findById(publication.dispositive?._id || publication.dispositive).select("program");
  if (!dispositive) throw new ClientError("El dispositivo seleccionado no existe", 404);
  publication.program = dispositive.program;
  publication.dispositive = dispositive._id;
};

const clearUnusedPlatforms = (publication) => {
  const platforms = Array.from(publication.platforms || []);
  if (!platforms.includes("wordpress")) publication.wordpress = { postId: null, url: null, publishedAt: null, stats: [] };
  if (!platforms.includes("instagram")) publication.instagram = { mediaId: null, url: null, matchText: "", matchStatus: "pending", caption: "", mediaType: "", publishedAt: null, stats: [] };
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

const findWordpressPublication = async (publication) => {
  if (!publication.platforms?.includes("wordpress") || !publication.publicationDate || publication.wordpress?.postId) return;
  const expectedUrl = normalizeUrl(publication.wordpress?.url);
  const after = `${publication.publicationDate}T00:00:00`;
  const before = `${publication.publicationDate}T23:59:59`;
  const result = await wordpressService.getAllPosts({ after, before });
  let posts = result.posts || [];
  let candidates = [];
  if (expectedUrl) {
    candidates = posts.filter((post) => normalizeUrl(getWordpressUrl(post)) === expectedUrl);
    if (!candidates.length) {
      const allResult = await wordpressService.getAllPosts({});
      posts = allResult.posts || [];
      candidates = posts.filter((post) => normalizeUrl(getWordpressUrl(post)) === expectedUrl);
    }
  } else {
    const expectedTitle = normalizeText(publication.title);
    candidates = posts.filter((post) => {
      const postTitle = normalizeText(getWordpressTitle(post));
      return postTitle && expectedTitle && (postTitle.includes(expectedTitle) || expectedTitle.includes(postTitle));
    });
  }
  if (candidates.length !== 1) return;
  const post = candidates[0];
  publication.wordpress.postId = Number(post.id);
  publication.wordpress.url = getWordpressUrl(post);
  publication.wordpress.publishedAt = getWordpressDate(post) ? new Date(getWordpressDate(post)) : null;
};

const findInstagramPublication = async (publication) => {
  if (!publication.platforms?.includes("instagram") || !publication.publicationDate || publication.instagram?.mediaId) return;
  const result = await instagramService.getAllMedia({ limit: 100, maxPages: 20 });
  const media = (result.media || []).filter((item) => getMadridDate(item.timestamp) === publication.publicationDate);
  let candidates = media;
  if (publication.instagram?.url) {
    const expectedUrl = normalizeUrl(publication.instagram.url);
    candidates = media.filter((item) => normalizeUrl(item.permalink) === expectedUrl);
  } else {
    const matchText = normalizeText(publication.instagram?.matchText);
    if (!matchText) {
      publication.instagram.matchStatus = "pending";
      return;
    }
    candidates = media.filter((item) => normalizeText(item.caption).includes(matchText));
  }
  if (!candidates.length) {
    publication.instagram.matchStatus = "pending";
    return;
  }
  if (candidates.length > 1) {
    publication.instagram.matchStatus = "ambiguous";
    return;
  }
  const item = candidates[0];
  publication.instagram.mediaId = item.id;
  publication.instagram.url = item.permalink;
  publication.instagram.caption = item.caption || "";
  publication.instagram.mediaType = item.media_type || "";
  publication.instagram.publishedAt = item.timestamp ? new Date(item.timestamp) : null;
  publication.instagram.matchStatus = "matched";
};

const syncExternalPublicationData = async (publication) => {
  const results = await Promise.allSettled([findWordpressPublication(publication), findInstagramPublication(publication)]);
  return results.filter((result) => result.status === "rejected").map((result) => result.reason?.message).filter(Boolean);
};

/* =========================================================
   CONEXIONES EXTERNAS
========================================================= */

const getWordpressPosts = async (req, res) => {
  const { after, before, page = 1, perPage = 100, all = false } = req.body;
  const result = all ? await wordpressService.getAllPosts({ after, before }) : await wordpressService.listPosts({ after, before, page, perPage });
  response(res, 200, result);
};

const getInstagramMedia = async (req, res) => {
  const { limit = 100, after, all = false, maxPages = 20 } = req.body;
  const result = all ? await instagramService.getAllMedia({ limit, maxPages }) : await instagramService.listMedia({ limit, after });
  response(res, 200, result);
};

const getCommunicationConnections = async (req, res) => {
  const [wordpress, instagram] = await Promise.allSettled([wordpressService.listPosts({ page: 1, perPage: 1, order: "desc" }), instagramService.listMedia({ limit: 1 })]);
  response(res, 200, {
    wordpress: { connected: wordpress.status === "fulfilled", sample: wordpress.status === "fulfilled" ? wordpress.value.posts[0] || null : null, error: wordpress.status === "rejected" ? wordpress.reason.message : null },
    instagram: { connected: instagram.status === "fulfilled", sample: instagram.status === "fulfilled" ? instagram.value.media[0] || null : null, error: instagram.status === "rejected" ? instagram.reason.message : null },
  });
};

/* =========================================================
   CREAR
========================================================= */

const postCreateCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const data = buildPublicationData(req.body);
  if (!data.title) throw new ClientError("El título es obligatorio", 400);
  if (!data.publicationDate) throw new ClientError("El día de publicación es obligatorio", 400);
  if (!data.platforms?.length) throw new ClientError("Debes seleccionar al menos un medio", 400);
  await resolvePublicationScope(data);
  clearUnusedPlatforms(data);
  const externalErrors = await syncExternalPublicationData(data);
  data.status = calculateStatus(data);
  data.createdBy = req.user._id;
  data.updatedBy = req.user._id;
  data.history = [{ action: "created", changedBy: req.user._id, details: { status: data.status, externalErrors } }];
  const created = await CommunicationPublication.create(data);
  const publication = await populatePublication(CommunicationPublication.findById(created._id)).lean();
  response(res, 200, publication);
};

/* =========================================================
   LISTAR
========================================================= */

const getCommunicationPublications = async (req, res) => {
  const { page = 1, limit = 50, status, medium, program, dispositive, search, dateFrom, dateTo } = req.body;
  const currentPage = Math.max(Number(page) || 1, 1);
  const currentLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const filter = {};
  if (status) filter.status = status;
  if (program) filter.program = program;
  if (dispositive) filter.dispositive = dispositive;
  if (search?.trim()) filter.title = { $regex: escapeRegex(search.trim()), $options: "i" };
  if (dateFrom || dateTo) {
    filter.publicationDate = {};
    if (dateFrom) filter.publicationDate.$gte = dateFrom;
    if (dateTo) filter.publicationDate.$lte = dateTo;
  }
  if (medium === "both") filter.platforms = { $all: ["wordpress", "instagram"] };
  if (medium === "wordpress") filter.platforms = { $all: ["wordpress"], $nin: ["instagram"] };
  if (medium === "instagram") filter.platforms = { $all: ["instagram"], $nin: ["wordpress"] };
  if (medium === "pending") filter.status = { $in: ["draft", "scheduled"] };
  const [publications, total] = await Promise.all([
    populatePublication(CommunicationPublication.find(filter).sort({ publicationDate: -1, createdAt: -1 }).skip((currentPage - 1) * currentLimit).limit(currentLimit)).lean(),
    CommunicationPublication.countDocuments(filter),
  ]);
  response(res, 200, { publications, page: currentPage, limit: currentLimit, total, totalPages: Math.ceil(total / currentLimit) });
};

/* =========================================================
   OBTENER UNA PUBLICACIÓN
========================================================= */

const getCommunicationPublicationById = async (req, res) => {
  const { publicationId } = req.body;
  const publication = await populatePublication(CommunicationPublication.findById(publicationId)).lean();
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  response(res, 200, publication);
};

/* =========================================================
   ACTUALIZAR
========================================================= */

const postUpdateCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const { publicationId } = req.body;
  const publication = await CommunicationPublication.findById(publicationId);
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  const data = buildPublicationData(req.body);
  const previousStatus = publication.status;
  const previousDate = publication.publicationDate;
  const previousWordpressUrl = publication.wordpress?.url || "";
  const previousInstagramUrl = publication.instagram?.url || "";
  const previousInstagramMatchText = publication.instagram?.matchText || "";
  if (data.title !== undefined) publication.title = data.title;
  if (data.publicationDate !== undefined) publication.publicationDate = data.publicationDate;
  if (data.platforms !== undefined) publication.platforms = data.platforms;
  if (data.scopeType !== undefined) publication.scopeType = data.scopeType;
  if (data.program !== undefined) publication.program = data.program;
  if (data.dispositive !== undefined) publication.dispositive = data.dispositive;
  if (data.wordpress !== undefined) Object.assign(publication.wordpress, data.wordpress);
  if (data.instagram !== undefined) Object.assign(publication.instagram, data.instagram);
  if (!publication.title) throw new ClientError("El título es obligatorio", 400);
  if (!publication.publicationDate) throw new ClientError("El día de publicación es obligatorio", 400);
  if (!publication.platforms?.length) throw new ClientError("Debes seleccionar al menos un medio", 400);
  const dateChanged = data.publicationDate !== undefined && data.publicationDate !== previousDate;
  const wordpressChanged = dateChanged || (data.wordpress?.url !== undefined && normalizeUrl(data.wordpress.url) !== normalizeUrl(previousWordpressUrl));
  const instagramChanged = dateChanged || (data.instagram?.url !== undefined && normalizeUrl(data.instagram.url) !== normalizeUrl(previousInstagramUrl)) || (data.instagram?.matchText !== undefined && normalizeText(data.instagram.matchText) !== normalizeText(previousInstagramMatchText));
  if (wordpressChanged && publication.platforms.includes("wordpress")) resetWordpressMatch(publication);
  if (instagramChanged && publication.platforms.includes("instagram")) resetInstagramMatch(publication);
  await resolvePublicationScope(publication);
  clearUnusedPlatforms(publication);
  const externalErrors = await syncExternalPublicationData(publication);
  publication.status = calculateStatus(publication);
  publication.updatedBy = req.user._id;
  publication.history.push({ action: "updated", changedBy: req.user._id, details: { previousStatus, status: publication.status, externalErrors } });
  await publication.save();
  const updated = await populatePublication(CommunicationPublication.findById(publication._id)).lean();
  response(res, 200, updated);
};

/* =========================================================
   ELIMINAR
========================================================= */

const postDeleteCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const { publicationId } = req.body;
  const publication = await CommunicationPublication.findByIdAndDelete(publicationId);
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  response(res, 200, { success: true });
};

/* =========================================================
   SINCRONIZACIÓN PARA EL CRON
========================================================= */

const syncPendingCommunicationPublications = async () => {
  const today = getMadridDate(new Date());
  const publications = await CommunicationPublication.find({
    publicationDate: { $lte: today },
    $or: [
      { status: { $in: ["scheduled", "partial"] } },
      { platforms: "wordpress", "wordpress.postId": null },
      { platforms: "instagram", "instagram.mediaId": null },
    ],
  });
  let updated = 0;
  for (const publication of publications) {
    await syncExternalPublicationData(publication);
    const nextStatus = calculateStatus(publication);
    if (publication.isModified("wordpress") || publication.isModified("instagram") || publication.status !== nextStatus) {
      publication.status = nextStatus;
      await publication.save();
      updated += 1;
    }
  }
  return { processed: publications.length, updated };
};

module.exports = {
  getWordpressPosts: catchAsync(getWordpressPosts),
  getInstagramMedia: catchAsync(getInstagramMedia),
  getCommunicationConnections: catchAsync(getCommunicationConnections),
  postCreateCommunicationPublication: catchAsync(postCreateCommunicationPublication),
  getCommunicationPublications: catchAsync(getCommunicationPublications),
  getCommunicationPublicationById: catchAsync(getCommunicationPublicationById),
  postUpdateCommunicationPublication: catchAsync(postUpdateCommunicationPublication),
  postDeleteCommunicationPublication: catchAsync(postDeleteCommunicationPublication),
  syncPendingCommunicationPublications,
};