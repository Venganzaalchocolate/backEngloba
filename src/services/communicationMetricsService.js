const pLimit = require("p-limit").default;
const { CommunicationPublication } = require("../models/indexModels");
const googleAnalyticsService = require("./googleAnalyticsService");
const instagramService = require("./instagramService");

const replaceSnapshot = (snapshot) => [
  {
    ...snapshot,
    collectedAt: new Date(),
  },
];

const getEarliestPublicationDate = (publications) =>
  publications
    .map((publication) => publication.publicationDate)
    .filter(Boolean)
    .sort()[0] || "2026-01-01";

const collectCommunicationMetrics = async ({
  dryRun = false,
  limit,
} = {}) => {
  const filter = {
    $or: [
      { "wordpress.url": { $type: "string", $ne: "" } },
      { "instagram.mediaId": { $type: "string", $ne: "" } },
    ],
  };

  let query = CommunicationPublication.find(filter).sort({
    publicationDate: -1,
  });

  if (limit) {
    query = query.limit(Math.max(Number(limit) || 0, 0));
  }

  const publications = await query;

  const wordpressPublications = publications.filter(
    (publication) => publication.wordpress?.url
  );

  let viewsByUrl = new Map();
  let analyticsError = null;

  if (wordpressPublications.length) {
    try {
      viewsByUrl = await googleAnalyticsService.getPageViewsByUrls(
        wordpressPublications.map(
          (publication) => publication.wordpress.url
        ),
        {
          startDate: getEarliestPublicationDate(
            wordpressPublications
          ),
        }
      );
    } catch (error) {
      analyticsError = error.message;
    }
  }

  const concurrency = Math.max(
    Math.min(
      Number(process.env.COMMUNICATION_METRICS_CONCURRENCY) || 4,
      10
    ),
    1
  );

  const runLimited = pLimit(concurrency);

  const summary = {
    processed: publications.length,
    wordpressUpdated: 0,
    instagramUpdated: 0,
    saved: 0,
    analyticsError,
    errors: [],
  };

  await Promise.all(
    publications.map((publication) =>
      runLimited(async () => {
        let changed = false;

        if (publication.wordpress?.url && !analyticsError) {
          try {
            publication.wordpress.stats = replaceSnapshot({
              views:
                viewsByUrl.get(publication.wordpress.url) || 0,
            });

            summary.wordpressUpdated += 1;
            changed = true;
          } catch (error) {
            summary.errors.push({
              publicationId: String(publication._id),
              title: publication.title,
              platform: "wordpress",
              error: error.message,
            });
          }
        }

        if (publication.instagram?.mediaId) {
          try {
            const insights = await instagramService.getMediaInsights(
              publication.instagram.mediaId
            );

            publication.instagram.stats = replaceSnapshot(insights);

            summary.instagramUpdated += 1;
            changed = true;
          } catch (error) {
            summary.errors.push({
              publicationId: String(publication._id),
              title: publication.title,
              platform: "instagram",
              error: error.message,
            });
          }
        }

        if (changed && !dryRun) {
          try {
            await publication.save();
            summary.saved += 1;
          } catch (error) {
            summary.errors.push({
              publicationId: String(publication._id),
              title: publication.title,
              platform: "database",
              error: error.message,
            });
          }
        }
      })
    )
  );

  return summary;
};

module.exports = {
  collectCommunicationMetrics,
};
