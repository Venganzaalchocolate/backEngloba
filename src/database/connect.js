const dns = require("node:dns");
const mongoose = require("mongoose");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectToDatabase = async () => {
  try {
    const uri = `mongodb+srv://comunicacion:${process.env.PASS}@engloba.knu8mxl.mongodb.net/?retryWrites=true&w=majority&appName=${process.env.BBDDNAME}`;

    await mongoose.connect(uri);

    console.log("Conexión exitosa a MongoDB");
  } catch (error) {
    console.error("Error de conexión a MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = { connectToDatabase };