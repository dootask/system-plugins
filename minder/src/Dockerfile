# 多阶段构建：上游原 Dockerfile 直接 COPY 预构建的 dist/（被 .gitignore，不在仓库），
# CI 里直接 docker build 会失败；故改为先用 node 在镜像内 `npm run build` 生成 dist。
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
ENTRYPOINT ["/docker-entrypoint.sh"]
EXPOSE 80
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
