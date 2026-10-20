module.exports = (req, res) => {
  res.json({
    status: true,
    developer: "𝙿𝚁𝙾𝙵𝙴𝚂𝚂𝙾𝚁 | 𝙿𝙰𝚁𝙸",
    team: "Era_Family",
    channel: "https://whatsapp.com/channel/0029VbBGjOwHLHQS9vUIIl27",
    usage: {
      info: "/api/pp?number=923001234567",
      view_image: "/api/pp?number=923001234567&format=image",
      download: "/api/pp?number=923001234567&download=true"
    }
  });
};
