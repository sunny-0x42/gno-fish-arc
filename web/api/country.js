/** Country from the visitor address. Vercel sets this header. The browser does not choose it. */
export default function handler(req, res) {
  const header = req.headers["x-vercel-ip-country"];
  const raw = Array.isArray(header) ? header[0] : header;
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  const known = /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1";
  res.setHeader("cache-control", "private, no-store");
  res.status(200).json({ code: known ? code : "" });
}
