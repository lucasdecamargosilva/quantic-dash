FROM node:20-alpine

WORKDIR /app

# Dependências do servidor Express
COPY package*.json ./
RUN npm install

# Dependências do CRM (React + Vite)
COPY crm-app/package*.json ./crm-app/
RUN cd crm-app && npm install

# Copia o restante do projeto
COPY . .

# Build do CRM → crm-app/dist (servido em /crm/*)
RUN cd crm-app && npm run build

EXPOSE 3000

CMD ["node", "server.js"]
