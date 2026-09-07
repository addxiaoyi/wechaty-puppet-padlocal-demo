# 构建阶段：安装依赖并编译 TypeScript
# 注意：better-sqlite3 是原生模块，Alpine(musl) 需要额外编译工具，
# 因此使用 Debian 系镜像(node:20-slim, glibc)以直接复用预编译包。
FROM node:20-slim AS build
WORKDIR /app

# 仅复制依赖清单以利用层缓存
COPY package.json ./
COPY package-lock.json* ./
RUN npm install

# 复制源码并编译
COPY . .
RUN npm run build

# 运行阶段：只保留运行时依赖与编译产物
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/ui-demo ./ui-demo
# 配置模板随镜像提供，便于首次部署
COPY --from=build /app/.env.example ./

EXPOSE 8765
CMD ["node", "dist/main.js"]