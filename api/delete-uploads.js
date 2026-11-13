// مسح صور الطلاب من Cloudinary لما الأدمن يمسح الطلب من اللوحة (للأدمن بس)
const { fail, originOk, verifyAdmin } = require("./_lib");

const MAX_URLS = 100; // حد Cloudinary لعدد الصور في طلب المسح الواحد

function publicIdOf(url, cloudName) {
  // شكل الرابط المتخزن: https://res.cloudinary.com/<cloud>/image/upload/v123/<public_id>.<ext>
  const m = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/v\d+\/(.+)\.[A-Za-z0-9]+$/.exec(String(url || ""));
  if (!m || m[1] !== cloudName) return null;
  const id = decodeURIComponent(m[2]);
  return /^[\w\-\/. ]+$/.test(id) && !id.includes("..") ? id : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  if (!originOk(req)) return fail(res, 403, "Invalid origin");
  try {
    if (!(await verifyAdmin(req))) return fail(res, 401, "Admin sign-in required");
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary is not configured");

    const urls = Array.isArray((req.body || {}).urls) ? req.body.urls.slice(0, MAX_URLS) : [];
    const ids = [...new Set(urls.map(u => publicIdOf(u, cloudName)).filter(Boolean))];
    if (!ids.length) return res.status(200).json({ deleted: 0, skipped: urls.length });

    const qs = ids.map(id => "public_ids[]=" + encodeURIComponent(id)).join("&");
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${qs}`, {
      method: "DELETE",
      headers: { Authorization: "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64") }
    });
    if (!r.ok) throw new Error("Cloudinary delete " + r.status);
    const out = (await r.json()).deleted || {};
    const deleted = Object.values(out).filter(v => v === "deleted" || v === "not_found").length;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ deleted, skipped: urls.length - ids.length });
  } catch (error) {
    console.error("delete-uploads failed", error.message);
    return fail(res, 503, "Delete service is unavailable");
  }
};
