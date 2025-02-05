const prerender = require('prerender');
const server = prerender({
    chromeFlags: [
        '--headless', 
        '--disable-gpu', 
        '--no-sandbox', 
        '--disable-dev-shm-usage', 
        '--remote-debugging-address=127.0.0.1', 
        '--remote-debugging-port=9222', 
        '--hide-scrollbars',
        '--ignore-certificate-errors',
    ],
    chromeLocation: process.env.CHROME_LOCATION,
    logRequests: true,
    browserDebuggingPort: 9222,
});
server.use(require('prerender-memory-cache'))
server.use(prerender.httpHeaders());
server.use(prerender.removeScriptTags());
server.use(prerender.sendPrerenderHeader());
server.start();
//   "--blink-settings=imagesEnabled=false",