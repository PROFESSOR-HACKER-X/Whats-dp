module.exports = (req, res) => {
  const out = { node: process.version };
  for (const m of ["@whiskeysockets/baileys", "pino"]) {
    try {
      require(m);
      out[m] = "OK";
    } catch (e) {
      out[m] = "ERROR: " + String(e.message).slice(0, 300);
    }
  }
  res.json(out);
};
