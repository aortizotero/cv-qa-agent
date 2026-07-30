FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY content ./content

EXPOSE 3001

CMD ["node", "server.js"]
