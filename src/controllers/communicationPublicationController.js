const { CommunicationPublication } = require("../models/indexModels");
const wordpressService = require("../services/wordpressService");
const instagramService = require("../services/instagramService");
const { catchAsync, response, ClientError } = require("../utils/indexUtils");
const {
  notifyCommunicationPublicationCompleted,
} = require("./emailControllerGoogle");

const madridDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });

const populatePublication = (query) => query
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
  if (req.user.role !== "root") throw new ClientError("No tienes permisos para realizar esta acción", 403);
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeText = (value = "") => String(value).replace(/<[^>]*>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const normalizeUrl = (value = "") => String(value).trim().split("?")[0].replace(/\/+$/, "").toLowerCase();
const getMadridDate = (value) => madridDateFormatter.format(new Date(value));
const getWordpressUrl = (post) => post.link;
const getWordpressTitle = (post) => typeof post.title === "string" ? post.title : post.title.rendered;
const getWordpressDate = (post) => post.date;
const getWordpressPublicationDate = (post) => getWordpressDate(post).slice(0, 10);
const unique = (values) => [...new Set(values)];

const calculateStatus = (publication) => {
  if (!publication.platforms.length) return "draft";
  const published = publication.platforms.reduce((total, platform) => total + Number(Boolean(platform === "wordpress" ? publication.wordpress?.postId || publication.wordpress?.url : publication.instagram?.mediaId || publication.instagram?.url)), 0);
  if (published === publication.platforms.length) return "complete";
  if (published) return "partial";
  return publication.publicationDate ? "scheduled" : "draft";
};

const notifyIfPublicationBecameComplete = async (
  publication,
  previousStatus = null
) => {
  const platforms = Array.from(
    publication?.platforms || []
  );

  const becameComplete =
    previousStatus !== "complete" &&
    publication?.status === "complete";

  const hasBothPlatforms =
    platforms.includes("wordpress") &&
    platforms.includes("instagram");

  if (!becameComplete || !hasBothPlatforms) return;

  try {
    const result =
      await notifyCommunicationPublicationCompleted({
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

const buildPublicationData = ({ title, publicationDate, platforms, programs, dispositives, wordpress, instagram }) => ({
  title: title.trim(),
  publicationDate,
  platforms: unique(platforms),
  programs: unique(programs),
  dispositives: unique(dispositives),
  wordpress: { url: wordpress.url?.trim() || null },
  instagram: { url: instagram.url?.trim() || null, matchText: instagram.matchText.trim() },
});

const clearUnusedPlatforms = (publication) => {
  if (!publication.platforms.includes("wordpress")) publication.wordpress = { postId: null, url: null, publishedAt: null, stats: [] };
  if (!publication.platforms.includes("instagram")) publication.instagram = { mediaId: null, url: null, matchText: "", matchStatus: "pending", caption: "", mediaType: "", publishedAt: null, stats: [] };
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

const matchWordpressPublication = (publication, posts) => {
  if (!publication.platforms.includes("wordpress") || publication.wordpress?.postId) return;
  const expectedUrl = normalizeUrl(publication.wordpress.url);
  const expectedTitle = normalizeText(publication.title);
  const candidates = expectedUrl
    ? posts.filter((post) => normalizeUrl(getWordpressUrl(post)) === expectedUrl)
    : posts.filter((post) => {
      const title = normalizeText(getWordpressTitle(post));
      return title.includes(expectedTitle) || expectedTitle.includes(title);
    });
  if (candidates.length !== 1) return;
  const post = candidates[0];
  publication.wordpress.postId = Number(post.id);
  publication.wordpress.url = getWordpressUrl(post);
  publication.wordpress.publishedAt = new Date(getWordpressDate(post));
};

const matchInstagramPublication = (publication, media) => {
  if (!publication.platforms.includes("instagram") || publication.instagram?.mediaId) return;
  const expectedUrl = normalizeUrl(publication.instagram.url);
  const matchText = normalizeText(publication.instagram.matchText);
  const candidates = expectedUrl
    ? media.filter((item) => normalizeUrl(item.permalink) === expectedUrl)
    : media.filter((item) => normalizeText(item.caption).includes(matchText));
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
  publication.instagram.mediaType = item.media_type;
  publication.instagram.publishedAt = new Date(item.timestamp);
  publication.instagram.matchStatus = "matched";
};

const syncExternalPublicationData = async (publication) => {
  if (publication.publicationDate > getMadridDate(new Date())) return;
  const needsWordpress = publication.platforms.includes("wordpress") && !publication.wordpress?.postId;
  const needsInstagram = publication.platforms.includes("instagram") && !publication.instagram?.mediaId;
  const [posts, instagram] = await Promise.all([
    needsWordpress ? wordpressService.getAllPosts({ after: `${publication.publicationDate}T00:00:00`, before: `${publication.publicationDate}T23:59:59` }) : [],
    needsInstagram ? instagramService.getAllMedia({ limit: 100, maxPages: 20 }) : { media: [] },
  ]);
  if (needsWordpress) matchWordpressPublication(publication, posts);
  if (needsInstagram) matchInstagramPublication(publication, instagram.media.filter((item) => getMadridDate(item.timestamp) === publication.publicationDate));
};

const groupByDate = (items, getDate) => {
  const groups = new Map();
  for (const item of items) {
    const date = getDate(item);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(item);
  }
  return groups;
};

const getWordpressPosts = async (req, res) => {
  const { after, before, page = 1, perPage = 100, all = false } = req.body;
  response(res, 200, all ? await wordpressService.getAllPosts({ after, before }) : await wordpressService.listPosts({ after, before, page, perPage }));
};

const getInstagramMedia = async (req, res) => {
  const { limit = 100, after, all = false, maxPages = 20 } = req.body;
  response(res, 200, all ? await instagramService.getAllMedia({ limit, maxPages }) : await instagramService.listMedia({ limit, after }));
};

const getCommunicationConnections = async (req, res) => {
  const [wordpress, instagram] = await Promise.allSettled([
    wordpressService.listPosts({ page: 1, perPage: 1, order: "desc" }),
    instagramService.listMedia({ limit: 1 }),
  ]);
  response(res, 200, {
    wordpress: { connected: wordpress.status === "fulfilled", sample: wordpress.status === "fulfilled" ? wordpress.value.posts[0] || null : null, error: wordpress.status === "rejected" ? wordpress.reason.message : null },
    instagram: { connected: instagram.status === "fulfilled", sample: instagram.status === "fulfilled" ? instagram.value.media[0] || null : null, error: instagram.status === "rejected" ? instagram.reason.message : null },
  });
};

const postCreateCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const data = buildPublicationData(req.body);
  clearUnusedPlatforms(data);
  await syncExternalPublicationData(data);
  data.status = calculateStatus(data);
  data.createdBy = req.user._id;
  data.updatedBy = req.user._id;
  data.history = [{ action: "created", changedBy: req.user._id, details: { status: data.status } }];
  const created = await CommunicationPublication.create(data);

await notifyIfPublicationBecameComplete(
  created,
  null
);

const publication = await populatePublication(
  CommunicationPublication.findById(created._id)
).lean();
  response(res, 200, publication);
};

const getCommunicationPublications = async (req, res) => {
  const { page = 1, limit = 50, status, medium, program, dispositive, search, dateFrom, dateTo } = req.body;
  const filter = {};
  if (status) filter.status = status;
  if (program) filter.programs = program;
  if (dispositive) filter.dispositives = dispositive;
  if (search) filter.title = { $regex: escapeRegex(search.trim()), $options: "i" };
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
    populatePublication(CommunicationPublication.find(filter).sort({ publicationDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
    CommunicationPublication.countDocuments(filter),
  ]);
  response(res, 200, { publications, page, limit, total, totalPages: Math.ceil(total / limit) });
};

const getCommunicationPublicationById = async (req, res) => {
  const publication = await populatePublication(CommunicationPublication.findById(req.body.publicationId)).lean();
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  response(res, 200, publication);
};

const postUpdateCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const publication = await CommunicationPublication.findById(req.body.publicationId);
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  const data = buildPublicationData(req.body);
  const previousStatus = publication.status;
  const dateChanged = data.publicationDate !== publication.publicationDate;
  const titleChanged = normalizeText(data.title) !== normalizeText(publication.title);
  const wordpressChanged = dateChanged || normalizeUrl(data.wordpress.url) !== normalizeUrl(publication.wordpress.url) || (!data.wordpress.url && titleChanged);
  const instagramChanged = dateChanged || normalizeUrl(data.instagram.url) !== normalizeUrl(publication.instagram.url) || normalizeText(data.instagram.matchText) !== normalizeText(publication.instagram.matchText);
  publication.title = data.title;
  publication.publicationDate = data.publicationDate;
  publication.platforms = data.platforms;
  publication.programs = data.programs;
  publication.dispositives = data.dispositives;
  publication.wordpress.url = data.wordpress.url;
  publication.instagram.url = data.instagram.url;
  publication.instagram.matchText = data.instagram.matchText;
  if (wordpressChanged && publication.platforms.includes("wordpress")) resetWordpressMatch(publication);
  if (instagramChanged && publication.platforms.includes("instagram")) resetInstagramMatch(publication);
  clearUnusedPlatforms(publication);
  await syncExternalPublicationData(publication);
  publication.status = calculateStatus(publication);
  publication.updatedBy = req.user._id;
  publication.history.push({ action: "updated", changedBy: req.user._id, details: { previousStatus, status: publication.status } });
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

const postDeleteCommunicationPublication = async (req, res) => {
  assertRoot(req);
  const publication = await CommunicationPublication.findByIdAndDelete(req.body.publicationId);
  if (!publication) throw new ClientError("Publicación no encontrada", 404);
  response(res, 200, { success: true });
};

const syncPendingCommunicationPublications = async () => {
  const today = getMadridDate(new Date());

  const publications =
    await CommunicationPublication.find({
      publicationDate: { $lte: today },
      $or: [
        {
          status: {
            $in: ["scheduled", "partial"],
          },
        },
        {
          platforms: "wordpress",
          "wordpress.postId": null,
        },
        {
          platforms: "instagram",
          "instagram.mediaId": null,
        },
      ],
    });

  let updated = 0;
  let notifications = 0;

  for (const publication of publications) {
    const previousStatus = publication.status;

    await syncExternalPublicationData(publication);

    const nextStatus = calculateStatus(publication);

    const hasChanges =
      publication.isModified("wordpress") ||
      publication.isModified("instagram") ||
      publication.status !== nextStatus;

    if (!hasChanges) continue;

    publication.status = nextStatus;

    await publication.save();

    updated += 1;

    const becameComplete =
      previousStatus !== "complete" &&
      nextStatus === "complete";

    const hasBothPlatforms =
      publication.platforms?.includes("wordpress") &&
      publication.platforms?.includes("instagram");

    if (becameComplete && hasBothPlatforms) {
      const result =
        await notifyCommunicationPublicationCompleted({
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
  };
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
