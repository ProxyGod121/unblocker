const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => res.status(200).send("Server is awake"));

app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("URL is required");

    try {
        const response = await axios({
            method: "get",
            url: targetUrl,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            responseType: "text",
        });

        // Strip anti-iframe headers sent by the target website
        res.removeHeader("X-Frame-Options");
        res.removeHeader("Content-Security-Policy");
        res.set("Access-Control-Allow-Origin", "*");

        let html = response.data;
        const origin = new URL(targetUrl).origin;

        // More robust URL rewriting for assets
        html = html.replace(/(src|href)=\"\/(?!\/)/g, `$1="${origin}/`);
        html = html.replace(/(src|href)=\'\/(?!\/)/g, `$1='${origin}/`);

        res.send(html);
    } catch (error) {
        res.status(500).send("Proxy Error: " + error.message);
    }
});

app.listen(PORT, () => console.log(`Advanced Proxy running on port ${PORT}`));
