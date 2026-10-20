const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  const number = String(req.query.number || "").replace(/\D/g, "");
  if (number.length < 7) {
    return res
      .status(400)
      .send("Use: /api/pair?number=923001234567 (country code ke saath, bina +)");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const dir = "/tmp/wa_pair_" + Date.now();
  fs.mkdirSync(dir, { recursive: true });

  let version;
  try {
    version = (await fetchLatestBaileysVersion()).version;
  } catch (e) {}

  let done = false;
  const finish = (msg) => {
    if (done) return;
    done = true;
    if (msg) res.write(msg);
    res.end();
  };

  const start = async (first) => {
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect } = u;

      if (connection === "open" && !done) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const creds = fs.readFileSync(path.join(dir, "creds.json"));
          finish(
            "SUCCESS! Neeche wali poori line WA_CREDS ki value hai:\n\n" +
              creds.toString("base64") +
              "\n"
          );
        } catch (e) {
          finish("Creds file nahi mili: " + e.message);
        }
        try { sock.end(); } catch (e) {}
      }

      if (connection === "close" && !done) {
        const code =
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output &&
          lastDisconnect.error.output.statusCode;
        if (code === DisconnectReason.restartRequired) {
          start(false);
        } else {
          finish("Connection band hua. Code: " + code + "\nDobara try karo.\n");
        }
      }
    });

    if (first && !state.creds.registered) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const code = await sock.requestPairingCode(number);
        res.write(
          "PAIRING CODE: " + code + "\n\n" +
            "WhatsApp > Settings > Linked Devices > Link a Device >\n" +
            "'Link with phone number instead' me ye code daalo.\n" +
            "55 second ke andar daalna hai, page band mat karna...\n\n"
        );
      } catch (e) {
        finish("Pairing code nahi bana: " + e.message);
      }
    }
  };

  setTimeout(() => finish("\nTimeout. Dobara try karo.\n"), 55000);

  try {
    await start(true);
  } catch (e) {
    finish("Error: " + e.message);
  }
};
