// controllers/toolsServiceController.js
const { ClientError } = require('../utils/indexUtils');
const unzipper = require("unzipper");

const TOOLS_BASE_URL = process.env.TOOLS_BASE_URL;
const API_KEY_BACK = process.env.API_KEY_BACK;

const assertConfig = () => {
  if (!TOOLS_BASE_URL) throw new ClientError('Falta TOOLS_BASE_URL en .env', 500);
  if (!API_KEY_BACK) throw new ClientError('Falta API_KEY_BACK en .env', 500);
};

/**
 * @param {Object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.mimetype]
 * @param {string} [params.filename]
 * @returns {Promise<Buffer>} PNG con alpha (512)
 */

async function toolsProfileBundle({ buffer, mimetype, filename }) {
  assertConfig();

  const blob = new Blob([buffer], { type: mimetype || "application/octet-stream" });
  const fd = new FormData();
  fd.append("file", blob, filename || "profile");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 45_000); // 45s por ejemplo

  let res;
  try {
    res = await fetch(`${TOOLS_BASE_URL}/image/profile-bundle`, {
      method: "POST",
      headers: { "X-Api-Key": API_KEY_BACK },
      body: fd,
      signal: ac.signal,
    });
  } catch (e) {
    throw new ClientError("tools-service timeout o conexión fallida", 502);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[toolsProfileBundle] status:", res.status, "body:", text);
    throw new ClientError(text || `tools-service error ${res.status}`, 502);
  }

  return Buffer.from(await res.arrayBuffer());
}



async function removeBgProfile512FromBuffer({ buffer, mimetype, filename }) {
  const zipBuffer = await toolsProfileBundle({ buffer, mimetype, filename });

  const dir = await unzipper.Open.buffer(zipBuffer);

  const f512 = dir.files.find(f => f.path === "profile_512.png");
  const f96  = dir.files.find(f => f.path === "profile_96.png");
  if (!f512 || !f96) throw new ClientError("ZIP inválido desde tools-service", 502);

  const png512 = await f512.buffer();
  const png96  = await f96.buffer();

  return {
    normal: { buffer: png512, mimetype: "image/png" },
    thumb:  { buffer: png96,  mimetype: "image/png" },
  };
}


module.exports = { removeBgProfile512FromBuffer };
