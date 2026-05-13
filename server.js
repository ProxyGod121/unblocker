const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so your separate frontend can communicate securely
app.use(cors());
app.use(express.json());

// Keep-alive endpoint for UptimeRobot to ping
app.get('/ping', (req, res) => {
    res.status(200).send('Server is awake');
});

// Proxy endpoint to fetch external web content
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL is required');

    try {
        const response = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            responseType: 'text'
        });

        let html = response.data;
        const origin = new URL(targetUrl).origin;

        // Rewrite asset paths to absolute links so CSS/images don't break
        html = html.replace(/href="\//g, `href="${origin}/`);
        html = html.replace(/src="\//g, `src="${origin}/`);

        res.send(html);
    } catch (error) {
        res.status(500).send('Proxy Error: ' + error.message);
    }
});

app.listen(PORT, () => console.log(`Proxy backend running on port ${PORT}`));
