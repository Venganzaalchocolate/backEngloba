
const UserCv=require('./userCV');
const Program=require('./programs')
const Jobs=require('./jobs');
const Provinces=require('./provinces');
const Studies=require('./estudies')
const Work_schedule=require('./work_schedule')
const Finantial=require('./finantial')
const User=require("./user");
const Leavetype=require('./leavetype')
const Offer=require('./offer')
const Documentation=require('./documentation')
const Filedrive=require('./file')
const Preferents=require('./preferents')
const Periods=require('./period')
const Leaves=require('./leave');
const UserChangeRequest = require('./UserChangeRequest');
const Dispositive=require('./dispositive');
const VolunteerApplication = require('./volunteerApplication');
const SesameResponsibility=require('./sesameResponsability')
const Entity=require('./entity');
const UserDocumentationAudit=require('./userDocumentationAudit')
const ScopedRoleRule=require('./scopedRoleRuleSchema')
const Workplace = require('./workplace');
const AttendedUser = require('./attendedUser');
const ModuleScopeAccess = require("./moduleScopeAccess");
const DocumentationReceiptTemplate=require("./documentationReceiptTemplateSchema");
const AnideUsuariaAtendida = require('./anide/anideUsuariaAtendida');
const AnideCentro = require('./anide/anideCentro');
const PeriodEndReason = require('./periodEndReason');
const OidcRecord=require('./oidcRecord');
const MoodleAssignment = require('./moodleAssignment');
const SesameWorkEntryAlert = require("./sesameWorkEntryAlert");


module.exports = {
    User,
    UserCv,
    Program,
    Jobs,
    Provinces,
    Studies,
    Work_schedule,
    Finantial,
    Leavetype,
    Offer,
    Documentation,
    Filedrive,
    Preferents,
    Periods,
    Leaves,
    UserChangeRequest,
    Dispositive,
    VolunteerApplication,
    Entity,
    SesameResponsibility,
    UserDocumentationAudit,
    ScopedRoleRule,
    Workplace,
    AttendedUser,
    ModuleScopeAccess,
    DocumentationReceiptTemplate,
    AnideUsuariaAtendida,
    AnideCentro,
    PeriodEndReason,
    OidcRecord,
    MoodleAssignment,
    SesameWorkEntryAlert
}