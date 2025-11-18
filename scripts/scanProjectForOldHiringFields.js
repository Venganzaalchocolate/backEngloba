const fs = require("fs");
const path = require("path");

// Campos que queremos localizar
const TARGETS = ["hiringPeriods", "dispositiveNow"];

// Carpetas REALES de tu proyecto (según tu árbol)
const DIRECTORIES = [
  "src/controllers",
  "src/models",
  "src/middleware",
  "src/routes",
  "src/utils",
  "src",
];

// Tipos de archivo a revisar
const EXTENSIONS = [".js", ".mjs", ".ts"];

const matches = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  TARGETS.forEach((target) => {
    lines.forEach((line, idx) => {
      if (line.includes(target)) {
        matches.push({
          file: filePath,
          line: idx + 1,
          target,
          text: line.trim(),
        });
      }
    });
  });
}

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (EXTENSIONS.includes(path.extname(fullPath))) {
      scanFile(fullPath);
    }
  }
}

console.log("🔍 Escaneando proyecto en busca de referencias antiguas...\n");

DIRECTORIES.forEach((dir) => {
  scanDirectory(path.resolve(dir));
});

console.log("==============================================");
console.log("RESULTADOS");
console.log("==============================================");

if (matches.length === 0) {
  console.log("✔ No quedan referencias a 'hiringPeriods' ni 'dispositiveNow'.");
  console.log("✔ Es seguro eliminar esos campos del User.\n");
} else {
  console.log(`❌ Se encontraron ${matches.length} referencias:\n`);
  matches.forEach((m) => {
    console.log(
      `→ ${m.target} en ${m.file}:${m.line}\n   ${m.text}\n`
    );
  });
}

console.log("==============================================");
console.log("FIN DEL ESCANEO");
console.log("==============================================");
