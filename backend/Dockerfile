FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js validation.js ./
COPY content ./content

EXPOSE 3001

CMD ["node", "server.js"]
