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
# basePath=/fotos garante que os assets E as chamadas de API do client saiam com o prefix certo.
ENV NEXT_PUBLIC_BASE_PATH=/fotos
RUN cd photo-maker && npm run build

EXPOSE 3000

# Supervisão dos dois processos via concurrently. Se um cair, derruba o outro
# (e o EasyPanel reinicia o container inteiro), evitando estado zumbi onde
# Express fica vivo proxyando 502 pra Next morto.
CMD ["npx", "--no-install", "concurrently", \
     "--kill-others-on-fail", \
     "-n", "express,next", \
     "-c", "blue,magenta", \
     "node server.js", \
     "sh -c 'cd photo-maker && PORT=3001 HOSTNAME=0.0.0.0 npx --no-install next start -p 3001'"]
