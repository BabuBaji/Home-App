# Built from the repo root (compose sets context: ..) so @homehelp/shared can be bundled.
FROM node:20-alpine
WORKDIR /app
COPY services/booking/package.json ./
RUN npm install --omit=dev
COPY services/shared ./node_modules/@homehelp/shared
COPY services/booking/ ./
EXPOSE 4006
CMD ["node", "server.js"]
