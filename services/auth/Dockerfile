# Built from the repo root (compose sets context: ..) so @homehelp/shared can be bundled.
FROM node:20-alpine
WORKDIR /app
COPY services/auth/package.json ./
RUN npm install --omit=dev
COPY services/shared ./node_modules/@homehelp/shared
COPY services/auth/ ./
EXPOSE 4002
CMD ["node", "server.js"]
