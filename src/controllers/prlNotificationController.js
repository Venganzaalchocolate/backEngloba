const { google } = require("googleapis");
const mongoose = require("mongoose");

const {
  User,
  Periods,
  Dispositive,
  Provinces,
  ScopedRoleRule,
} = require("../models/indexModels");

const {
  buildPrlNewHiringPlainText,
  buildPrlNewHiringHtmlEmail,
} = require("../templates/emailTemplates");

const { sendEmail } = require("./emailControllerGoogle");
const { catchAsync, response } = require("../utils/indexUtils");

const PRL_POSITION_ID = "6992efa17b62b2c39aaa769b";
const PRL_GENERAL_GROUP = "englobaareaprevencionderiesgoslaborales@engloba.org.es";
const PRL_TEST_EMAIL = "comunicacion@engloba.org.es";
const DEFAULT_LOGO = "https://app.engloba.org.es/graphic/logotipo_blanco.png";


const isSameId = (a, b) => String(a || "") === String(b || "");

const isEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const uniqueEmails = (emails = []) =>
  Array.from(
    new Set(
      emails
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

const formatEsDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "";

    
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);
// 2. Extraemos client_email y private_key del JSON
const { client_email, private_key } = credentials;

const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.orgunit',     // OUs (R/W)
  'https://www.googleapis.com/auth/admin.directory.user',        // Users (R/W)
  'https://www.googleapis.com/auth/admin.directory.group',       // Groups (R/W)
  'https://www.googleapis.com/auth/admin.directory.group.member', // Group members (R/W)
  'https://www.googleapis.com/auth/admin.directory.user.security',                     // Drive
  'https://www.googleapis.com/auth/apps.groups.settings',
  'https://www.googleapis.com/auth/apps.groups.migration',
];

const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: SCOPES,
  subject: 'archi@engloba.org.es',  // aquí se “impersona” a este usuario
});
//hjbg
const directory = google.admin({ version: 'directory_v1', auth });

const getWorkspaceGroupEmailByKey = async (groupKey) => {
  const key = String(groupKey || "").trim();

  if (!key) return "";
  if (isEmail(key)) return key.toLowerCase();

  const admin = directory;

  const { data } = await admin.groups.get({
    groupKey: key,
  });

  return String(data?.email || "").trim().toLowerCase();
};

const getEquivalentProvinceIds = async (provinceId) => {
  if (!provinceId || !mongoose.Types.ObjectId.isValid(provinceId)) return [];

  const id = String(provinceId);
  const provinces = await Provinces.find({}, { name: 1, subcategories: 1 }).lean();
  const ids = new Set([id]);

  for (const province of provinces) {
    if (String(province._id) === id) {
      for (const sub of province.subcategories || []) {
        if (sub?._id) ids.add(String(sub._id));
      }
    }

    const isSubcategory = (province.subcategories || []).some(
      (sub) => String(sub?._id) === id
    );

    if (isSubcategory) {
      ids.add(String(province._id));

      for (const sub of province.subcategories || []) {
        if (sub?._id) ids.add(String(sub._id));
      }
    }
  }

  return [...ids];
};

const ruleMatchesProgram = (rule, program) => {
  if (!rule?.active || rule.scopeType !== "program") return false;

  if (rule.filters?.onlyActive && !program?.active) return false;
  if (rule.filters?.area && rule.filters.area !== program?.area) return false;
  if (rule.filters?.entityId && !isSameId(rule.filters.entityId, program?.entity)) return false;
  if (rule.filters?.programId && !isSameId(rule.filters.programId, program?._id)) return false;

  return true;
};

const ruleMatchesDispositive = ({ rule, dispositive, program, provinceIds }) => {
  if (!rule?.active || rule.scopeType !== "dispositive") return false;

  if (rule.filters?.onlyActive && !dispositive?.active) return false;

  if (rule.filters?.provinceId) {
    const ruleProvinceId = String(rule.filters.provinceId);
    if (!provinceIds.includes(ruleProvinceId)) return false;
  }

  if (
    rule.filters?.programId &&
    !isSameId(rule.filters.programId, program?._id || dispositive?.program)
  ) {
    return false;
  }

  if (rule.filters?.area && rule.filters.area !== program?.area) return false;
  if (rule.filters?.entityId && !isSameId(rule.filters.entityId, program?.entity)) return false;

  return true;
};

const getTargetDispositivesByProvince = async (provinceId) => {
  const provinceIds = await getEquivalentProvinceIds(provinceId);

  if (!provinceIds.length) return { provinceIds: [], dispositives: [] };

  const dispositives = await Dispositive.find({
    province: {
      $in: provinceIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
  })
    .select("name province program active")
    .populate({
      path: "province",
      select: "name",
    })
    .populate({
      path: "program",
      select: "name acronym area entity active",
    })
    .lean();

  return { provinceIds, dispositives };
};

const getOpenPrlPeriods = async () => {
  const now = new Date();

  return Periods.find({
    position: new mongoose.Types.ObjectId(PRL_POSITION_ID),
    active: true,
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gte: now } },
    ],
  })
    .select("idUser dispositiveId startDate endDate position")
    .populate({
      path: "idUser",
      select: "firstName lastName dni email",
    })
    .populate({
      path: "dispositiveId",
      select: "name groupWorkspace province program active",
      populate: [
        {
          path: "province",
          select: "name",
        },
        {
          path: "program",
          select: "name acronym area entity active",
        },
      ],
    })
    .lean();
};

const getRulesByTechnician = async (technicianIds = []) => {
  const validIds = technicianIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (!validIds.length) return new Map();

  const rules = await ScopedRoleRule.find({
    active: true,
    userId: {
      $in: validIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
  }).lean();

  const rulesByUser = new Map();

  for (const rule of rules) {
    const key = String(rule.userId);
    if (!rulesByUser.has(key)) rulesByUser.set(key, []);
    rulesByUser.get(key).push(rule);
  }

  return rulesByUser;
};

const getMatchingRulesForProvince = ({ userRules = [], targetDispositives = [], provinceIds = [] }) => {
  const matchingRules = [];

  for (const rule of userRules) {
    if (rule.scopeType === "program") {
      const matchedDevice = targetDispositives.find((d) => {
        const program = d.program?._id ? d.program : null;
        return ruleMatchesProgram(rule, program);
      });

      if (matchedDevice) {
        matchingRules.push({
          rule,
          matchedBy: "program",
          matchedDevice,
        });
      }

      continue;
    }

    if (rule.scopeType === "dispositive") {
      const matchedDevice = targetDispositives.find((d) => {
        const program = d.program?._id ? d.program : null;

        return ruleMatchesDispositive({
          rule,
          dispositive: d,
          program,
          provinceIds,
        });
      });

      if (matchedDevice) {
        matchingRules.push({
          rule,
          matchedBy: "dispositive",
          matchedDevice,
        });
      }
    }
  }

  return matchingRules;
};

const getPrlWorkspaceGroupsByProvince = async ({ provinceId, debug = false, logger = console } = {}) => {
  if (!provinceId || !mongoose.Types.ObjectId.isValid(provinceId)) {
    return debug ? { workspaceGroups: [], debugTechnicians: [] } : [];
  }

  const { provinceIds, dispositives: targetDispositives } = await getTargetDispositivesByProvince(provinceId);
  const prlPeriods = await getOpenPrlPeriods();

  const technicianIds = Array.from(
    new Set(
      prlPeriods
        .map((p) => String(p.idUser?._id || p.idUser || ""))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  );

  const rulesByUser = await getRulesByTechnician(technicianIds);

  const workspaceGroups = [];
  const debugTechnicians = [];

  for (const period of prlPeriods) {
    const technicianId = String(period.idUser?._id || period.idUser || "");
    const technicianName = `${period.idUser?.firstName || ""} ${period.idUser?.lastName || ""}`.trim();
    const userRules = rulesByUser.get(technicianId) || [];

    const debugItem = {
      technicianId,
      technicianName,
      technicianDni: period.idUser?.dni || "",
      technicianEmail: period.idUser?.email || "",
      technicianDevice: period.dispositiveId?.name || "",
      technicianDeviceGroupId: period.dispositiveId?.groupWorkspace || "",
      rules: userRules.map((r) => ({
        ruleId: String(r._id),
        scopeType: r.scopeType,
        roleType: r.roleType,
        filters: {
          area: r.filters?.area || null,
          provinceId: r.filters?.provinceId ? String(r.filters.provinceId) : null,
          entityId: r.filters?.entityId ? String(r.filters.entityId) : null,
          programId: r.filters?.programId ? String(r.filters.programId) : null,
          onlyActive: r.filters?.onlyActive,
        },
      })),
      match: false,
      matchReason: "",
    };

    if (!userRules.length) {
      debugItem.matchReason = "No tiene reglas activas";
      debugTechnicians.push(debugItem);
      continue;
    }

    const matchingRules = getMatchingRulesForProvince({
      userRules,
      targetDispositives,
      provinceIds,
    });

    if (!matchingRules.length) {
      debugItem.matchReason = "Tiene reglas, pero ninguna cubre la provincia objetivo";
      debugTechnicians.push(debugItem);
      continue;
    }

    const groupWorkspaceId = period.dispositiveId?.groupWorkspace
      ? String(period.dispositiveId.groupWorkspace).trim()
      : "";

    if (!groupWorkspaceId) {
      debugItem.match = true;
      debugItem.matchReason = "Cubre la provincia, pero su dispositivo de contratación no tiene groupWorkspace";
      debugTechnicians.push(debugItem);
      continue;
    }

    let groupWorkspaceEmail = "";

    try {
      groupWorkspaceEmail = await getWorkspaceGroupEmailByKey(groupWorkspaceId);
    } catch (e) {
      logger.log?.(
        "[getPrlWorkspaceGroupsByProvince] No se pudo resolver grupo Workspace:",
        groupWorkspaceId,
        e?.message || e
      );
    }

    if (!groupWorkspaceEmail) {
      debugItem.match = true;
      debugItem.matchReason = "Cubre la provincia, pero no se pudo resolver email del groupWorkspace";
      debugTechnicians.push(debugItem);
      continue;
    }

    debugItem.match = true;
    debugItem.matchReason = `Cubre la provincia por regla ${matchingRules[0].matchedBy}`;
    debugItem.resolvedGroupEmail = groupWorkspaceEmail;
    debugTechnicians.push(debugItem);

    workspaceGroups.push({
      technicianId,
      technicianName,
      technicianDni: period.idUser?.dni || "",

      groupWorkspaceId,
      groupWorkspace: groupWorkspaceEmail,

      dispositiveName: period.dispositiveId?.name || "",
      provinceName: period.dispositiveId?.province?.name || "",
      programName:
        period.dispositiveId?.program?.acronym ||
        period.dispositiveId?.program?.name ||
        "",
      matchedRules: matchingRules.map((x) => ({
        ruleId: String(x.rule._id),
        scopeType: x.rule.scopeType,
        roleType: x.rule.roleType,
        matchedBy: x.matchedBy,
        matchedDevice: x.matchedDevice?.name || "",
      })),
    });
  }

  return debug ? { workspaceGroups, debugTechnicians } : workspaceGroups;
};

const buildPrlPayload = ({ worker, period, dispositive, positionName = "", logoUrl = DEFAULT_LOGO }) => {
  const workerName = `${worker.firstName || ""} ${worker.lastName || ""}`.trim();

  return {
    workerName,
    workerDni: worker.dni || "",
    workerEmail: worker.email || worker.email_personal || "",
    workerPhone: worker.phone || "",
    dispositiveName: dispositive.name || "",
    programName: dispositive.program?.acronym || dispositive.program?.name || "",
    provinceName: dispositive.province?.name || "",
    startDate: formatEsDate(period.startDate),
    positionName,
    logoUrl,
  };
};

const notifyPrlOfNewHiring = async ({
  userId,
  periodId,
  dispositiveId,
  positionName = "",
  logoUrl = DEFAULT_LOGO,
  logger = console,
} = {}) => {
  try {
    if (!userId || !periodId || !dispositiveId) {
      return {
        ok: false,
        reason: "Faltan userId, periodId o dispositiveId",
      };
    }

    const [worker, period, dispositive] = await Promise.all([
      User.findById(userId)
        .select("firstName lastName dni email email_personal phone")
        .lean(),

      Periods.findById(periodId)
        .select("startDate position dispositiveId")
        .lean(),

      Dispositive.findById(dispositiveId)
        .select("name province program groupWorkspace")
        .populate("province", "name")
        .populate("program", "name acronym")
        .lean(),
    ]);

    if (!worker) return { ok: false, reason: "Trabajador no encontrado" };
    if (!period) return { ok: false, reason: "Periodo no encontrado" };
    if (!dispositive) return { ok: false, reason: "Dispositivo no encontrado" };

    const provinceId = dispositive.province?._id || dispositive.province;

    const prlWorkspaceGroups = await getPrlWorkspaceGroupsByProvince({
      provinceId,
      logger,
    });

    const recipients = uniqueEmails([
      ...prlWorkspaceGroups.map((x) => x.groupWorkspace),
      PRL_GENERAL_GROUP,
    ]);

    if (!recipients.length) {
      logger.warn?.("[notifyPrlOfNewHiring] Sin destinatarios");
      return { ok: false, reason: "Sin destinatarios" };
    }

    const payload = buildPrlPayload({
      worker,
      period,
      dispositive,
      positionName,
      logoUrl,
    });

    const subject = `Nueva contratación · PRL · ${payload.workerName} · ${payload.provinceName || "Provincia no indicada"}`;
    const text = buildPrlNewHiringPlainText(payload);
    const html = buildPrlNewHiringHtmlEmail(payload);

    await sendEmail(recipients, subject, text, html);

    return {
      ok: true,
      recipients,
      workspaceGroups: prlWorkspaceGroups,
      subject,
    };
  } catch (err) {
    logger.error?.("[notifyPrlOfNewHiring]", err?.message || err);

    return {
      ok: false,
      error: err?.message || "Error enviando notificación PRL",
    };
  }
};



module.exports = {
  notifyPrlOfNewHiring,
  getPrlWorkspaceGroupsByProvince,
};