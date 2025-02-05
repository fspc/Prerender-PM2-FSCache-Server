# prerender/prerender - Node server that uses Headless Chrome to render a javascript-rendered page as HTML. To be used in conjunction with prerender middleware.

# LTS version
# FROM node:22-slim 
FROM node:21-bookworm
 
COPY --chown=node:node . /home/node

EXPOSE 3000
EXPOSE 9222

# Set Chrome flags for running in container
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_LOCATION=/usr/bin/chromium   
ENV CHROME_FLAGS="--headless --disable-gpu --no-sandbox --disable-dev-shm-usage --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222"

WORKDIR /home/node

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Already has git
# RUN apt-get update -y
RUN yarn add prerender prerender-memory-cache pm2 winston nodemailer

USER node:node

ENTRYPOINT ["node", "server.js"]