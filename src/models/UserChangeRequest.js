// models/UserChangeRequest.js
"use strict";

/**
 * Modelo: UserChangeRequest
 * ------------------------------------------------------
 * Representa una solicitud de un trabajador para cambiar
 * sus datos personales. La solicitud la revisa/decide un
 * responsable/supervisor y, si se aprueba, se aplican los
 * cambios sobre el documento User en el backend (con TX).
 *
 * Estados:
 *  - pending   : creada y a la espera de revisión
 *  - approved  : aprobada y aplicada en el User
 *  - rejected  : rechazada por el responsable
 *  - cancelled : cancelada por el propio trabajador
 *  - stale     : caducada por conflicto (el dato cambió antes)
 *  - failed    : error al aplicar (p.ej. DNI duplicado)
 */

const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

/**
 * ChangeLineSchema
 * ----------------
 * Una línea de cambio = 1 campo afectado.
 * - path : ruta en dot-notation dentro de User (ej: "phoneJob.number")
 * - label: etiqueta amigable para mostrar en UI (opcional)
 * - from : valor previo (snapshot leído del servidor al crear la solicitud)
 * - to   : valor propuesto por el trabajador
 * - type : pista de tipo para la UI/validaciones (informativo)
 */

const TimeOffEntrySchema = new Schema(
  {
    date: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);


const ChangeLineSchema = new Schema(
  {
    path: { type: String, required: true },
    label: { type: String },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed, required: true },
    type: {
      type: String,
      enum: [
        "string",
        "number",
        "date",
        "enum",
        "boolean",
        "array",
        "object",
        "objectId",
        "objectId[]",
      ],
      default: "string",
    },
  },
  { _id: false }
);

/**
 * DecisionSchema
 * --------------
 * Trazabilidad de la decisión del responsable.
 */
const DecisionSchema = new Schema(
  {
    decidedBy: { type: Types.ObjectId, ref: "User" }, // quién decide
    decidedAt: { type: Date },                         // cuándo decide
    note: { type: String },                            // motivo/observaciones
  },
  { _id: false }
);

/**
 * UploadSchema
 * ------------
 * Soporta peticiones que incluyan subida de documentación “pendiente”
 * (p.ej. cursos). El archivo queda en Drive en una carpeta temporal y,
 * si la solicitud se aprueba, se adopta como Filedrive definitivo.
 */
// models/UserChangeRequest.js

const UploadSchema = new Schema(
  {
    // antes sólo: "user-extra-doc"
    type: { 
      type: String, 
      enum: ["user-extra-doc", "user-official-doc"], 
      default: "user-extra-doc" 
    },

    // ⬇️ NUEVO: imprescindible para saber a qué doc oficial pertenece
    originDocumentation: { type: Schema.Types.ObjectId, ref: "Documentation" },

    labelFile: String,
    originalName: String,
    mimeType: String,
    size: Number,

    category: { type: String, default: "Varios" },
    date: Date,
    description: String,

    tempDriveId: { type: String, required: true },
    tempFolderId: { type: String },

    finalizedFileId: { type: Schema.Types.ObjectId, ref: "Filedrive" },
    finalizedAt: Date,
  },
  { _id: true }
);


/**
 * UserProfileChangeRequestSchema (principal)
 * -----------------------------------------
 * - userId      : usuario dueño de los datos
 * - submittedBy : quién crea la solicitud (normalmente el propio user)
 * - approverId  : responsable que debe revisarla (si lo tengo decidido)
 * - status      : estado del flujo (ver arriba)
 * - changes     : array de líneas de cambio
 * - uploads     : (opcional) subidas de ficheros pendientes
 * - note        : comentario opcional del trabajador
 * - decision    : info de decisión (cuando proceda)
 * - submittedAt : timestamp de creación
 * - appliedAt   : timestamp de aplicación sobre User (si se aprueba)
 * - conflictCheckEnabled : al aprobar, verifico que 'from' coincide con el valor
 *                          actual del User (si no, marco 'stale').
 * - error       : en caso de fallo al aplicar (p.ej. índices únicos)
 */
const UserChangeRequestSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    submittedBy: { type: Types.ObjectId, ref: "User", required: true },
    approverId: { type: Types.ObjectId, ref: "User", index: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "stale", "failed"],
      default: "pending",
      index: true,
    },

    changes: {
  type: [ChangeLineSchema],
  validate: {
    validator: function (arr) {
      const hasChanges = Array.isArray(arr) && arr.length > 0;
      const hasUploads = Array.isArray(this.uploads) && this.uploads.length > 0;
      const hasTimeOff =
        this.timeOff &&
        Array.isArray(this.timeOff.entries) &&
        this.timeOff.entries.length > 0;

      // ahora permitimos:
      // - solo cambios
      // - solo documentos
      // - solo timeOff
      return hasChanges || hasUploads || hasTimeOff;
    },
    message:
      "Debe existir al menos un cambio, un archivo o una solicitud de días",
  },
},

    uploads: { type: [UploadSchema], default: [] },

    note: { type: String },
    decision: { type: DecisionSchema },

    submittedAt: { type: Date, default: Date.now },
    appliedAt: { type: Date },

    conflictCheckEnabled: { type: Boolean, default: true },

    error: { type: String }, // mensaje de error al aplicar (si status = failed)

     // ⬇️ NUEVO BLOQUE
    timeOff: {
      type: {
        kind: {
          type: String,
          enum: ["vacation", "personal"], // vacaciones / asuntos propios
        },
        entries: [TimeOffEntrySchema],
      },
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Índices compuestos para consultas típicas:
 * - Por usuario + estado + fecha (listado del trabajador)
 * - Por responsable + estado + fecha (bandeja de pendientes del supervisor)
 */
UserChangeRequestSchema.index({ userId: 1, status: 1, submittedAt: -1 });
UserChangeRequestSchema.index({ approverId: 1, status: 1, submittedAt: 1 });

/**
 * Nota de uso:
 *  - La validación de "campos permitidos" (whitelist) la haré en el servicio
 *    que crea la solicitud (no en el modelo), para mantener este esquema
 *    genérico y reutilizable.
 *  - La aplicación al User la haré en un servicio de "approve" con transacción:
 *    * compruebo conflictos (si está activado)
 *    * construyo $set con dot-paths y actualizo User
 *    * cierro la solicitud con status, decision y appliedAt
 */

module.exports = mongoose.model("UserChangeRequest", UserChangeRequestSchema);
