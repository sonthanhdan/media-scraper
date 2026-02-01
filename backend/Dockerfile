FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/main.js"]
