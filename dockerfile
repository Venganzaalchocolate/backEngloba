# Usa la imagen oficial de Node.js versión 22 como base
FROM node:22

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Dependencias nativas para canvas (cairo/pango/etc) + toolchain de build
RUN apt-get update && apt-get install -y \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  build-essential \
  python3 \
  && rm -rf /var/lib/apt/lists/*
# Copia los archivos package.json y package-lock.json
COPY package*.json ./

# Instala solo las dependencias de producción
RUN npm install --only=production

# Copia el resto de los archivos de la aplicación
COPY . .

# Expone el puerto que la aplicación va a utilizar 3
EXPOSE 10000

# Comando para ejecutar la aplicación en producción
CMD [ "npm", "start" ]
