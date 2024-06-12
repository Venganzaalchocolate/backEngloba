# Usa la imagen oficial de Node.js versión 22 como base
FROM node:22

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copia los archivos package.json y package-lock.json
COPY package*.json ./

# Instala solo las dependencias de producción
RUN npm install --only=production

# Copia el resto de los archivos de la aplicación
COPY . .

# Expone el puerto que la aplicación va a utilizar
EXPOSE 10000

# Comando para ejecutar la aplicación en producción
CMD [ "npm", "start" ]
