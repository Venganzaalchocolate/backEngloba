// controllers/toolsServiceController.js
const { ClientError } = require('../utils/indexUtils');
const unzipper = require("unzipper");
const sharp = require("sharp");

const TOOLS_BASE_URL = process.env.TOOLS_BASE_URL;
const API_KEY_BACK = process.env.API_KEY_BACK;

const assertConfig = () => {
  if (!TOOLS_BASE_URL) throw new ClientError('Falta TOOLS_BASE_URL en .env', 500);
  if (!API_KEY_BACK) throw new ClientError('Falta API_KEY_BACK en .env', 500);
};

const MAX_SIDE = Number(process.env.REMBG_MAX_SIDE || 1024);
const JPEG_QUALITY = Number(process.env.REMBG_JPEG_QUALITY || 85);

async function downscaleForRembg(buffer, mimetype) {
  // Para avatares: 768/1024 va perfecto
  // rotate() respeta EXIF y evita imágenes “tumbadas”
  const img = sharp(buffer, { failOnError: false }).rotate();

  // Si viene con alpha y quieres conservarlo (PNG/WebP), puedes mantener PNG
  // pero para rendimiento en tools-service, JPEG suele ser mejor.
  // Estrategia: si es PNG/WebP -> a JPEG igualmente (más barato para rembg).
  // Si quieres conservar alpha upstream, cambia esta lógica.
  const out = await img
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { buffer: out, mimetype: "image/jpeg", filename: "profile.jpg" };
}

async function toolsProfileBundle({ buffer, mimetype, filename }) {
  assertConfig();

  // Node 18+ tiene Blob/FormData globales. Si no, necesitarías undici.
  const blob = new Blob([buffer], { type: mimetype || "application/octet-stream" });
  const fd = new FormData();
  fd.append("file", blob, filename || "profile");

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 45_000);

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

  const buf = Buffer.from(await res.arrayBuffer());

  if (!res.ok) {
    // intenta leer cuerpo como texto si viene JSON/HTML
    const text = buf.toString("utf8").slice(0, 1500);
    console.error("[toolsProfileBundle] status:", res.status, "body:", text);
    throw new ClientError(text || `tools-service error ${res.status}`, 502);
  }

  // 🔥 protección: si no es zip (por ejemplo HTML), lo detectamos aquí
  // ZIP empieza por: 50 4B 03 04 (PK..)
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const preview = buf.toString("utf8").slice(0, 1500);
    console.error("[toolsProfileBundle] respuesta no-ZIP:", preview);
    throw new ClientError("tools-service devolvió algo que no es ZIP", 502);
  }

  return buf;
}

async function removeBgProfile512FromBuffer({ buffer, mimetype, filename }) {
  // 1) downscale antes de enviar
  const reduced = await downscaleForRembg(buffer, mimetype);

  // 2) tools-service
  const zipBuffer = await toolsProfileBundle({
    buffer: reduced.buffer,
    mimetype: reduced.mimetype,
    filename: filename || reduced.filename,
  });

  // 3) unzip
  let dir;
  try {
    dir = await unzipper.Open.buffer(zipBuffer);
  } catch (e) {
    console.error("[removeBgProfile512FromBuffer] unzip error:", e);
    throw new ClientError("ZIP inválido desde tools-service", 502);
  }

  const f512 = dir.files.find(f => f.path === "profile_512.png");
  const f92  = dir.files.find(f => f.path === "profile_92.png");
  if (!f512 || !f92) {
    console.error("[removeBgProfile512FromBuffer] zip entries:", dir.files.map(f => f.path));
    throw new ClientError("ZIP inválido desde tools-service", 502);
  }

  const png512 = await f512.buffer();
  const png92  = await f92.buffer();

  return {
    normal: { buffer: png512, mimetype: "image/png" },
    thumb:  { buffer: png92,  mimetype: "image/png" },
  };
}

module.exports = { removeBgProfile512FromBuffer };
