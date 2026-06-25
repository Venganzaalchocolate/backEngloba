const express = require("express");

const { tokenValid } = require("../controllers/authController");
const {
  postMoodleLaunch,
  getOidcLaunch,
  getOidcInteraction,
} = require("../controllers/oidcController");

const oidcApiRoutes = express.Router();
const oidcPublicRoutes = express.Router();

/*
  Endpoint interno protegido por el JWT actual de la app.
  Devuelve la URL corta que se abrirá en otra pestaña.
*/
oidcApiRoutes.post(
  "/moodle/launch",
  tokenValid,
  postMoodleLaunch
);

/*
  Endpoints públicos necesarios para el flujo navegador/OIDC.
  No llevan Bearer JWT porque Moodle llega mediante redirecciones.
*/
oidcPublicRoutes.get("/launch", getOidcLaunch);

oidcPublicRoutes.get(
  "/interaction/:uid",
  getOidcInteraction
);

module.exports = {
  oidcApiRoutes,
  oidcPublicRoutes,
};