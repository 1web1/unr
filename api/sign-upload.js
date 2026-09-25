const crypto = require("crypto");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TICKETS_PER_WINDOW = 12; // أربع استمارات كحد أقصى لكل عنوان IP / 15 دقيقة

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0].trim();
}

async function rateLimit(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Rate-limit storage is not configured");
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  const key = `mobadara:upload-ticket:${bucket}:${clientIp(req)}`;
  const headers = { Authorization: `Bearer ${token}` };
  const increment = await fetch(`${url}/incr/${encodeURIComponent(key)}`, { headers });
  if (!increment.ok) throw new Error("Rate-limit service unavailable");
  const count = Number((await increment.json()).result);
  if (count === 1) {
    await fetch(`${url}/expire/${encodeURIComponent(key)}/900`, { headers });
  }
  return count <= MAX_TICKETS_PER_WINDOW;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  const configuredOrigin = process.env.SITE_ORIGIN;
  if (!configuredOrigin || req.headers.origin !== configuredOrigin) {
    return fail(res, 403, "Invalid origin");
  }
  const { label, mimeType, size } = req.body || {};
  if (!["p", "i", "c", "mp", "mc", "mi"].includes(label) || !ALLOWED_TYPES.has(mimeType) || !Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return fail(res, 400, "Invalid upload metadata");
  }
  try {
    if (!(await rateLimit(req))) return fail(res, 429, "Too many upload attempts");
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary is not configured");
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "mobadara/submissions";
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(toSign).digest("hex");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      apiKey, timestamp, signature, folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
    });
  } catch (error) {
    console.error("sign-upload failed", error.message);
    return fail(res, 503, "Upload service is unavailable");
  }
};
