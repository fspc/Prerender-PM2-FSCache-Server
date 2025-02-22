module.exports = [{
    script: './server.js', // Your main Prerender server
    name: 'prerender-app',
    cwd: '/home/node',
    exec_mode: 'cluster',
    instances: process.env.PHANTOM_WORKERS || 3, // Adjust based on your CPU cores
}];