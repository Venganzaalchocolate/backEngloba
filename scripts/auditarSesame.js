// scripts/auditarSesame.js
// node scripts/auditarSesame.js

const path = require("path");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

// Ajusta esta ruta a tu indexModels si hace falta
const { User, Program, Dispositive, Periods } = require("../models/indexModels");

// Usa tu URI real o tu módulo de conexión
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/engloba";

// ---------- Helpers ----------

const normalizeDni = (dni) =>
  (dni || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

/**
 * Lee usuariosSesame.xlsx y devuelve un Set de DNIs normalizados
 */
async function loadSesameDnis(xlsxPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);

  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("El Excel de Sesame no tiene hojas");

  let dniCol = null;
  ws.getRow(1).eachCell((cell, col) => {
    if ((cell.value || "").toString().trim().toUpperCase() === "DNI") {
      dniCol = col;
    }
  });

  if (!dniCol) throw new Error("No se encontró columna DNI");

  const dnis = new Set();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const raw = row.getCell(dniCol).text || row.getCell(dniCol).value;
    const dni = normalizeDni(raw);
    if (dni) dnis.add(dni);
  });

  return dnis;
}

/**
 * Exporta un array de objetos a un xlsx
 */
async function exportToExcel(rows, filename) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Datos");

  if (rows.length === 0) {
    sheet.addRow(["(sin resultados)"]);
  } else {
    const columns = Object.keys(rows[0]);
    sheet.addRow(columns);
    for (const r of rows) sheet.addRow(columns.map((c) => r[c]));
  }

  const fullPath = path.resolve(process.cwd(), filename);
  await workbook.xlsx.writeFile(fullPath);
  console.log(`✅ Generado: ${fullPath}`);
}

/**
 * 1) Empleados activos con periodo abierto que NO están en Sesame
 */
async function findEmployeesNotInSesame(sesameDniSet) {
  const sesameDnisArray = Array.from(sesameDniSet);

  const results = await Periods.aggregate([
    {
      $match: {
        active: true,
        $or: [{ endDate: null }, { endDate: { $exists: false } }],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "idUser",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.employmentStatus": {
          $in: ["activo", "en proceso de contratación"],
        },
        $or: [{ "user.apafa": { $exists: false } }, { "user.apafa": false }],
        "user.dni": { $nin: sesameDnisArray },
      },
    },
    {
      $lookup: {
        from: "dispositives",
        localField: "dispositiveId",
        foreignField: "_id",
        as: "device",
      },
    },
    { $unwind: { path: "$device", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "programs",
        localField: "device.program",
        foreignField: "_id",
        as: "program",
      },
    },
    { $unwind: { path: "$program", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,

        Nombre: "$user.firstName",
        Apellidos: { $ifNull: ["$user.lastName", ""] },
        DNI: "$user.dni",
        Email: "$user.email",

        Departamento: "$program.name",
        Centro: "$device.name",
      },
    },
    {
      $sort: { Apellidos: 1, Nombre: 1 },
    },
  ]);

  return results;
}

/**
 * 2) Usuarios presentes en Sesame pero sin periodo abierto o inactivos
 */
async function findSesameUsersObsolete(sesameDniSet) {
  const sesameDnisArray = Array.from(sesameDniSet);

  const users = await User.find({
    dni: { $in: sesameDnisArray },
  })
    .select("dni email firstName lastName employmentStatus")
    .lean();

  if (!users.length) return [];

  const userIds = users.map((u) => u._id);

  const openPeriods = await Periods.find({
    idUser: { $in: userIds },
    active: true,
    $or: [{ endDate: null }, { endDate: { $exists: false } }],
  }).select("idUser");

  const activeIds = new Set(openPeriods.map((p) => p.idUser.toString()));

  const rows = [];
  for (const u of users) {
    const hasOpen = activeIds.has(u._id.toString());
    const inactive = u.employmentStatus === "ya no trabaja con nosotros";

    if (inactive || !hasOpen) {
      rows.push({
        Nombre: u.firstName,
        Apellidos: u.lastName || "",
        DNI: u.dni,
        Email: u.email || "",
        EstadoLaboral: u.employmentStatus,
        TienePeriodoAbierto: hasOpen ? "Sí" : "No",
        Motivo: inactive
          ? "Ya no trabaja con nosotros"
          : "Sin periodos de contratación abiertos",
      });
    }
  }

  rows.sort((a, b) => a.Apellidos.localeCompare(b.Apellidos, "es"));
  return rows;
}

// ---------- MAIN ----------

async function main() {
  try {
    console.log("Conectando a MongoDB...");

    console.log("✅ Conectado a MongoDB");

    const sesamePath = path.resolve(process.cwd(), "usuariosSesame.xlsx");
    const sesameDnis = await loadSesameDnis(sesamePath);
    console.log(`DNIs cargados: ${sesameDnis.size}`);

    const notInSesame = await findEmployeesNotInSesame(sesameDnis);
    await exportToExcel(notInSesame, "empleados_faltan_en_sesame.xlsx");

    const obsolete = await findSesameUsersObsolete(sesameDnis);
    await exportToExcel(obsolete, "empleados_sesame_obsoletos.xlsx");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {

    console.log("🔌 Desconectado");
  }
}

main();
