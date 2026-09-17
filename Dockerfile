# Stage 1: Build Angular application
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


# Stage 2: Serve Angular using Nginx
FROM nginx:alpine

COPY --from=build /app/dist/retrofit-angular/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
