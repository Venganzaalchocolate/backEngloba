const express = require("express");
const router = express.Router();

const {
  anideCentroManager,
  anideUsuariaManager,
  anideCentroOccupancy,
  tokenValid
} = require("../controllers/indexController");



router.post("/anide/centro", tokenValid, anideCentroManager);
router.post("/anide/usuaria", tokenValid, anideUsuariaManager);
router.post("/anide/occupancy", tokenValid, anideCentroOccupancy);

module.exports = router;