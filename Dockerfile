FROM node:20-alpine

WORKDIR /app

# Dependências do servidor Express
COPY package*.json ./
RUN npm install

# Dependências do CRM (React + Vite)
COPY crm-app/package*.json ./crm-app/
RUN cd crm-app && npm install

# Dependências do Photo Maker (Next.js)
COPY photo-maker/package*.json ./photo-maker/
RUN cd photo-maker && npm install

# Copia o restante do projeto
COPY . .

# Build do CRM → crm-app/dist (servido em /crm/*)
RUN cd crm-app && npm run build

# Build do Photo Maker → photo-maker/.next (servido em /fotos/*)
# basePath=/fotos garante que os assets do Next saiam com o prefix certo.
ENV NEXT_BASE_PATH=/fotos
RUN cd photo-maker && npm run build

EXPOSE 3000

# Sobe Next (3001) em background + Express (3000) em foreground.
# `wait -n` propaga falha do primeiro processo que cair, derrubando o container.
CMD ["sh", "-c", "(cd photo-maker && PORT=3001 HOSTNAME=0.0.0.0 npx next start -p 3001) & node server.js; wait -n"]
