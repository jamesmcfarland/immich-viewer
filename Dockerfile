FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json /app/package.json
RUN npm install --omit=dev

COPY server.js /app/server.js
COPY config.example.json /app/config.example.json
COPY public /app/public
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

CMD ["/app/docker-entrypoint.sh"]
