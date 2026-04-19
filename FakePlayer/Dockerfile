FROM node:18-alpine

# minecraft-protocol-forge 需要
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm install --production

# 复制所有项目文件
COPY . .

# 启动程序
CMD ["node", "Main.js"]