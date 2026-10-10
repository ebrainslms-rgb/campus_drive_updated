# Build stage
FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_ADMIN_URL_KEY=eb-admin-2026
ENV VITE_ADMIN_URL_KEY=$VITE_ADMIN_URL_KEY

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


# Runtime stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]