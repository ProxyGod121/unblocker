const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/ping', (req, res) => res.status(200).send('Server is awake'));

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL parameter required');

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity'
            },
            responseType: 'arraybuffer',
            validateStatus: () => true,
            maxRedirects: 5
        });

        const contentType = (response.headers['content-type'] || '').toLowerCase();
        const origin = new URL(targetUrl).origin;
        const currentProxyBase = `${req.protocol}://${req.get('host')}/proxy?url=`;

        res.removeHeader('x-frame-options');
        res.removeHeader('content-security-policy');
        res.removeHeader('content-security-policy-report-only');

        if (response.headers['content-type']) res.set('Content-Type', response.headers['content-type']);
        res.set('Access-Control-Allow-Origin', '*');

        const isHtml = contentType.includes('text/html');
        const isCss = contentType.includes('text/css') || /\.css(\?|$)/.test(targetUrl);
        const isJs = contentType.includes('javascript') || /\.js(\?|$)/.test(targetUrl);
        const isText = isHtml || isCss || isJs || contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml');

        if (!isText) {
            return res.send(Buffer.from(response.data));
        }

        let content = Buffer.from(response.data).toString('utf-8');

        if (isCss) {
            content = content.replace(/url\(\s*['"]?\/\/([^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent('https://' + u)})`);
            content = content.replace(/url\(\s*['"]?\/([^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent(origin + '/' + u)})`);
            content = content.replace(/url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent(u)})`);
            content = content.replace(/@import\s+url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g, (m, u) => {
                if (u.startsWith('http')) return `@import url(${currentProxyBase}${encodeURIComponent(u)})`;
                if (u.startsWith('//')) return `@import url(${currentProxyBase}${encodeURIComponent('https:' + u)})`;
                if (u.startsWith('/')) return `@import url(${currentProxyBase}${encodeURIComponent(origin + u)})`;
                return m;
            });
            content = content.replace(/@import\s+['"]([^'"]+)['"]/g, (m, u) => {
                if (u.startsWith('http')) return `@import '${currentProxyBase}${encodeURIComponent(u)}'`;
                if (u.startsWith('//')) return `@import '${currentProxyBase}${encodeURIComponent('https:' + u)}'`;
                if (u.startsWith('/')) return `@import '${currentProxyBase}${encodeURIComponent(origin + u)}'`;
                return m;
            });
            return res.send(content);
        }

        if (!isHtml) {
            return res.send(content);
        }

        content = content.replace(/(src|href|action)=(["'])\/\/([^"'\s>]+)\2/g, (m, attr, q, u) => `${attr}=${q}${currentProxyBase}${encodeURIComponent('https://' + u)}${q}`);
        content = content.replace(/(src|href|action)=(["'])\/([^"'\s>][^"'\s>]*)\2/g, (m, attr, q, u) => `${attr}=${q}${currentProxyBase}${encodeURIComponent(origin + '/' + u)}${q}`);
        content = content.replace(/(src|href|action)=(["'])(https?:\/\/[^"'\s>]+)\2/g, (m, attr, q, u) => `${attr}=${q}${currentProxyBase}${encodeURIComponent(u)}${q}`);

        content = content.replace(/url\(\s*['"]?\/\/([^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent('https://' + u)})`);
        content = content.replace(/url\(\s*['"]?\/([^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent(origin + '/' + u)})`);
        content = content.replace(/url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)/g, (m, u) => `url(${currentProxyBase}${encodeURIComponent(u)})`);

        const injectionScript = `<script>
            (function() {
                const proxyBase = "${currentProxyBase}";
                const originBase = "${origin}";

                function rewrite(url) {
                    if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) return url;
                    if (url.startsWith('//')) url = 'https:' + url;
                    if (url.startsWith('/')) url = originBase + url;
                    if (url.startsWith('http') && !url.startsWith(location.origin)) return proxyBase + encodeURIComponent(url);
                    return url;
                }

                const origFetch = window.fetch;
                window.fetch = function(input, init) {
                    if (typeof input === 'string') input = rewrite(input);
                    return origFetch.call(this, input, init);
                };

                const origOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    return origOpen.call(this, method, rewrite(url), ...rest);
                };

                const origWindowOpen = window.open;
                window.open = function(url, name, specs) {
                    return origWindowOpen.call(this, rewrite(url), name, specs);
                };

                document.addEventListener('click', function(e) {
                    const a = e.target.closest('a');
                    if (a && a.href && !a.href.includes(proxyBase) && (a.href.startsWith('http') || a.href.startsWith('//'))) {
                        e.preventDefault();
                        location.href = proxyBase + encodeURIComponent(a.href);
                    }
                }, true);

                const origPushState = history.pushState;
                history.pushState = function(state, title, url) {
                    return origPushState.call(this, state, title, rewrite(url) || url);
                };
            })();
        </script>`;

        if (content.includes('<head>')) {
            content = content.replace('<head>', `<head>${injectionScript}`);
        } else {
            content = injectionScript + content;
        }

        res.send(content);
    } catch (e) {
        res.status(500).send('Proxy Routing Failure: ' + e.message);
    }
});

app.listen(PORT, () => console.log(`Comprehensive Proxy Engine online on port ${PORT}`));
