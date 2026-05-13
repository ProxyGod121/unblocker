const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to fetch blocked content
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL is required');

    try {
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            responseType: 'text'
        });

        // Inject absolute base URL so links and styles load correctly
        let html = response.data;
        const origin = new URL(targetUrl).origin;
        html = html.replace(/href="\//g, `href="${origin}/`);
        html = html.replace(/src="\//g, `src="${origin}/`);

        res.send(html);
    } catch (error) {
        res.status(500).send('Error fetching the website: ' + error.message);
    }
});

app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));
