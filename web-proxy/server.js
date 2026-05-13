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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            responseType: 'text',
            validateStatus: () => true
        });

        // Strip downstream security header locks that block iframes
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        res.set('Access-Control-Allow-Origin', '*');

        let html = response.data;
        const origin = new URL(targetUrl).origin;
        const currentProxyBase = `${req.protocol}://${req.get('host')}/proxy?url=`;

        // 1. Resolve relative structural links & absolute script paths
        html = html.replace(/(src|href)=\"\/(?!\/)/g, `$1="${origin}/`);
        html = html.replace(/(src|href)=\'\/(?!\/)/g, `$1='${origin}/`);

        // 2. Intercept native system elements, hyperlinks, and data forms
        html = html.replace(/href=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `href="${currentProxyBase}${encodeURIComponent(link)}"`);
        html = html.replace(/action=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `action="${currentProxyBase}${encodeURIComponent(link)}"`);

        // 3. FIX: Parse and fix deep CSS url(...) asset references 
        html = html.replace(/url\(['"]?\/([^\'")]+)['"]?\)/g, `url(${origin}/$1)`);

        // 4. Inject runtime JavaScript sandbox environment controls into the header layout
        const injectionScript = `
        <script>
            const proxyBase = "${currentProxyBase}";
            const originalWindowOpen = window.open;

            window.open = function(url, name, specs) {
                if (url && !url.startsWith('http')) {
                    url = new URL(url, "${origin}").href;
                }
                if (url) url = proxyBase + encodeURIComponent(url);
                return originalWindowOpen(url, name, specs);
            };

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
        res.status(500).send('Proxy CSS Engine Interception Error: ' + e.message);
    }
});

app.listen(PORT, () => console.log(`Secure Interactive Proxy running on port ${PORT}`));
