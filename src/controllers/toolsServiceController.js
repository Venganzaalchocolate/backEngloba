// controllers/toolsServiceController.js
const { ClientError } = require('../utils/indexUtils');
const JSZip = require("jszip");

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

  // 1) FormData nativo (undici) => usar Blob
  const blob = new Blob([buffer], { type: mimetype || "application/octet-stream" });

  const fd = new FormData();
  // OJO: el nombre del campo DEBE coincidir con FastAPI: image_file
  fd.append("file", blob, filename || "profile");

  const res = await fetch(`${TOOLS_BASE_URL}/image/profile-bundle`, {
    method: "POST",
    headers: { "X-Api-Key": API_KEY_BACK },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Log útil para ver el error real
    console.error("[toolsProfileBundle] status:", res.status, "body:", text);
    throw new ClientError(text || `tools-service error ${res.status}`, 502);
  }

  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function removeBgProfile512FromBuffer({ buffer, mimetype, filename }) {
  console.log('dentro')
  const zipBuffer = await toolsProfileBundle({ buffer, mimetype, filename });
console.log('dentro2')
  const zip = await JSZip.loadAsync(zipBuffer);
  const f512 = zip.file("profile_512.png");
  const f96  = zip.file("profile_96.png");

  if (!f512 || !f96) {
    throw new ClientError("ZIP inválido desde tools-service", 502);
  }

  const png512 = await f512.async("nodebuffer");
  const png96  = await f96.async("nodebuffer");

  return {
    normal: { buffer: png512, mimetype: "image/png" },
    thumb:  { buffer: png96,  mimetype: "image/png" },
  };
}

module.exports = { removeBgProfile512FromBuffer };
