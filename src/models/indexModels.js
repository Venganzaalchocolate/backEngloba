
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
const ResourceMembership = require('./permissions/resourceMembership');
const ModuleGrant = require('./permissions/moduleGrant');
const UserProfileAssignment = require('./permissions/userProfileAssignment');
const PermissionProfile = require('./permissions/permissionProfile');

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
    ResourceMembership,
    ModuleGrant,
    UserProfileAssignment,
    PermissionProfile
}