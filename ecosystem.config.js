module.exports = [{
    script: './server.js', // Your main Prerender server
    name: 'prerender-app',
    cwd: '/home/node',
    exec_mode: 'cluster',
    // IMPORTANT: keep instances at 1. Every prerender instance spawns its own
    // Chrome bound to debugging port 9222 (see server.js chromeFlags); with more
    // than one instance they all fight over that port, all connect to whichever
    // Chrome bound it first, and when that Chrome restarts every worker loses its
    // websocket mid-request -> intermittent 504s for real crawlers (facebookexternalhit
    // etc). One instance already serves N concurrent renders, one Chrome tab per
    // request. See README "Reliability design".
    instances: 1,
}];