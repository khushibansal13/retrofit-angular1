# Stage 1: Build Angular application
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


# Stage 2: Serve Angular using Node
FROM node:22-alpine

WORKDIR /app

# Install a lightweight static server
RUN npm install -g serve

COPY --from=build /app/dist/retrofit-angular/browser ./dist

EXPOSE 80

CMD ["sh", "-c", "serve -s dist -l ${PORT:-80}"]
