// أدوات مشتركة لدوال الـ API (الملفات اللي بتبدأ بـ _ مش بتبقى روابط على Vercel)

// مفتاح Firebase للويب مش سر (موجود في كود الموقع)، بيُستخدم هنا للتحقق من توكن دخول الأدمن بس
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyCNDOwLJXeCCdlcW-ffxbggbiETS86r3mc";

function fail(res, status, message) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ error: message });
}

// SITE_ORIGIN ممكن يبقى رابط واحد أو أكتر مفصولين بفاصلة، والشرطة المائلة في الآخر مش بتفرق
function allowedOrigins() {
  return String(process.env.SITE_ORIGIN || "https://mobadara.vercel.app")
    .split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
}
function originOk(req) {
  const o = String(req.headers.origin || "").replace(/\/+$/, "");
  return !!o && allowedOrigins().includes(o);
}

function clientIp(req) {
  // Vercel بيكتب x-real-ip بنفسه، فمحدش يقدر يزوّره من المتصفح
  return String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0].trim();
}

// بيتأكد إن الطلب جاي من أدمن: توكن Firebase صالح + الـ UID موجود في ADMIN_UIDS
async function verifyAdmin(req) {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!m) return null;
  const admins = String(process.env.ADMIN_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!admins.length) throw new Error("ADMIN_UIDS is not configured");
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    // Referer عشان لو مفتاح Firebase متقيد بالدومين في Google Cloud Console
    headers: { "Content-Type": "application/json", Referer: allowedOrigins()[0] + "/" },
    body: JSON.stringify({ idToken: m[1] })
  });
  if (!r.ok) return null;
  const user = ((await r.json()).users || [])[0];
  return user && admins.includes(user.localId) ? user.localId : null;
}

module.exports = { fail, originOk, clientIp, verifyAdmin };
