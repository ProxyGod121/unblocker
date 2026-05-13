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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            responseType: 'text',
            validateStatus: () => true
        });

        // Strip cross-origin frame limitations
        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        res.set('Access-Control-Allow-Origin', '*');

        let html = response.data;
        const origin = new URL(targetUrl).origin;
        const currentProxyBase = `${req.protocol}://${req.get('host')}/proxy?url=`;

        // Step 1: Clean up relative paths to absolute paths
        html = html.replace(/(src|href)=\"\/(?!\/)/g, `$1="${origin}/`);
        html = html.replace(/(src|href)=\'\/(?!\/)/g, `$1='${origin}/`);
        html = html.replace(/(src|href)=\"\/\//g, `$1="https://`);
        html = html.replace(/(src|href)=\'\/\//g, `$1='https://`);

        // Step 2: Route all links, styles, forms, and scripts through the proxy engine
        html = html.replace(/href=\"(https?:\/\/[^\"]+)\"/g, (m, link) => {
            if (link.includes('.css') || !link.includes(req.get('host'))) {
                return `href="${currentProxyBase}${encodeURIComponent(link)}"`;
            }
            return m;
        });
        html = html.replace(/src=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `src="${currentProxyBase}${encodeURIComponent(link)}"`);
        html = html.replace(/action=\"(https?:\/\/[^\"]+)\"/g, (m, link) => `action="${currentProxyBase}${encodeURIComponent(link)}"`);

        // Step 3: Rewrite asset references locked within CSS code blocks
        html = html.replace(/url\(['"]?\/([^\'")]+)['"]?\)/g, `url(${origin}/$1)`);

        // Step 4: Inject Javascript Sandbox routine to handle AJAX/Fetch and dynamic links
        const injectionScript = `
        <script>
            const proxyBase = "${currentProxyBase}";

            // Override global fetch rules to force assets through the proxy network
            const originalFetch = window.fetch;
            window.fetch = async function(input, init) {
                if (typeof input === 'string' && input.startsWith('http')) {
                    input = proxyBase + encodeURIComponent(input);
                }
                return originalFetch(input, init);
            };

            // Hijack dynamically created window views and links
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
        res.status(500).send('Proxy Routing Failure: ' + e.message);
    }
});

app.listen(PORT, () => console.log(`Comprehensive Proxy Engine online on port ${PORT}`));
