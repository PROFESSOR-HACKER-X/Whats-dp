const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const AUTH_DIR = "/tmp/wa_auth";

const CREDIT = {
  developer: "𝙿𝚁𝙾𝙵𝙴𝚂𝚂𝙾𝚁 | 𝙿𝙰𝚁𝙸",
  team: "Era_Family",
  channel: "https://whatsapp.com/channel/0029VbBGjOwHLHQS9vUIIl27"
};

function prepareAuth() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const f = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(f)) {
    if (!process.env.WA_CREDS) throw new Error("WA_CREDS environment variable set nahi hai");
    fs.writeFileSync(f, Buffer.from(process.env.WA_CREDS, "base64").toString("utf8"));
  }
}

async function connect() {
  prepareAuth();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch (e) {}

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Connection timeout")), 30000);
    sock.ev.on("connection.update", (u) => {
      if (u.connection === "open") {
        clearTimeout(t);
        resolve();
      }
      if (u.connection === "close") {
        clearTimeout(t);
        const m = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.message;
        reject(new Error("Connection closed: " + (m || "unknown")));
      }
    });
  });

  return sock;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const number = String(req.query.number || "").replace(/\D/g, "");
  if (number.length < 7 || number.length > 15) {
    return res.status(400).json({
      status: false,
      ...CREDIT,
      message: "Number do (country code ke saath, bina +). Example: /api/pp?number=923001234567"
    });
  }

  let sock;
  try {
    sock = await connect();
    const jid = number + "@s.whatsapp.net";

    try {
      const check = await sock.onWhatsApp(jid);
      if (check && check.length && check[0].exists === false) {
        return res.status(404).json({
          status: false,
          ...CREDIT,
          message: "Ye number WhatsApp par nahi hai"
        });
      }
    } catch (e) {}

    let url = null;
    let reason = "";
    try {
      url = await sock.profilePictureUrl(jid, "image");
    } catch (e) {
      reason = e && e.message ? e.message : "unknown";
    }

    if (!url) {
      const msg =
        reason.includes("not-authorized")
          ? "Is number ki privacy setting ki wajah se photo nahi mil sakti"
          : reason.includes("item-not-found")
          ? "Is number ki profile photo nahi hai"
          : "Photo nahi mili: " + reason;
      return res.status(404).json({ status: false, ...CREDIT, message: msg });
    }

    const wantsImage = req.query.format === "image";
    const wantsDownload = req.query.download === "true";

    if (wantsImage || wantsDownload) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Image fetch failed: " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
      if (wantsDownload) {
        res.setHeader("Content-Disposition", `attachment; filename="${number}.jpg"`);
      }
      return res.status(200).send(buf);
    }

    const host = `https://${req.headers.host}`;
    return res.json({
      status: true,
      ...CREDIT,
      result: {
        number,
        image: `${host}/api/pp?number=${number}&format=image`,
        download: `${host}/api/pp?number=${number}&download=true`
      }
    });
  } catch (err) {
    return res.status(500).json({ status: false, ...CREDIT, error: err.message });
  } finally {
    try { if (sock) sock.end(); } catch (e) {}
  }
};
