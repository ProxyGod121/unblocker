const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => res.status(200).send('Server is awake'));

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL parameter required');

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            responseType: 'text',
            validateStatus: () => true // Prevent crashing on 404/500 target pages
        });

        // Clear security constraints that block iframes or external processing
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        res.set('Access-Control-Allow-Origin', '*');

        let html = response.data;
        const origin = new URL(targetUrl).origin;
        const currentProxyBase = `${req.protocol}://${req.get('host')}/proxy?url=`;

        // 1. Rewrite relative system assets to absolute paths
        html = html.replace(/(src|href)=\"\/(?!\/)/g, `$1="${origin}/`);
        html = html.replace(/(src|href)=\'\/(?!\/)/g, `$1='${origin}/`);

        // 2. Intercept forms and relative hyperlinks to keep them inside the proxy
        html = html.replace(/href=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `href="${currentProxyBase}${encodeURIComponent(link)}"`);
        html = html.replace(/action=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `action="${currentProxyBase}${encodeURIComponent(link)}"`);

        // 3. Inject scripts directly into the <head> tag to trap JavaScript popups and window changes
        const injectionScript = `
        <script>
            // Intercept standard window navigation changes
            const proxyBase = "${currentProxyBase}";

            // Rewrite window popup systems dynamically
            const originalWindowOpen = window.open;
            window.open = function(url, name, specs) {
                if (url && !url.startsWith('http')) {
                    url = new URL(url, "${origin}").href;
                }
                if (url) url = proxyBase + encodeURIComponent(url);
                return originalWindowOpen(url, name, specs);
            };

            // Intercept runtime dynamic anchor clicks
            document.addEventListener('click', function(e) {
                let target = e.target.closest('a');
                if (target && target.href && !target.href.includes(proxyBase) && target.href.startsWith('http')) {
                    target.href = proxyBase + encodeURIComponent(target.href);
                }
            }, true);
        </script>
        `;

        html = html.replace('<head>', `<head>${injectionScript}`);

        res.send(html);
    } catch (e) {
        res.status(500).send('Proxy Engine Failed to Intercept: ' + e.message);
    }
});

app.listen(PORT, () => console.log(`Secure Interactive Proxy running on port ${PORT}`));
