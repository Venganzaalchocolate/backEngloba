const {recreateCorporateEmail, postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter, payroll, getFileUser, getUserName, getAllUsersWithOpenPeriods, rehireUser, getUsersCurrentStatus, getBasicUserSearch, getUserListDays, getPhotoProfile, profilePhotoSet, profilePhotoGetBatch}=require("./userController");
const { login, validToken, verifyCode } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, getUserCvID } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv, deleteFile, getPresignedPut, getPresignedGet } = require("./ovhController");
const { postUploadFile, getFile, deleteIdFile, createFileDrive, updateFileDrive, deleteFileDrive, getFileDrive, getCvPresignPut,getCvPresignGet, zipMultipleFiles, zipPayrolls, listFile} = require("./fileController");
const { postCreateBag, getBags, getBagID, bagDeactivateId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");

const { offerList,offerCreate,offerUpdate,offerHardDelete,offerId } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers, deleteFileEnums, postSubcategory } = require("./enumsController");
const {sendEmail, generateEmailHTML, sendWelcomeEmail}=require("./emailControllerGoogle");
const { getDocumentation,getDocumentationUnified, getDocumentationProgramDispositive, addProgramOrDispositiveToDocumentation, syncProgramDocsToDevices } = require("./documentationController");
const { confirmSignature, requestSignature } = require("./pdfSignController");
const {auditInfoDevices, auditInfoPrograms, auditInfoUsers, auditActiveLeaves, auditDocsProgram, auditDocsDispo, auditPayrolls, auditDocsUser} = require("./auditorController");
const { getCurrentHeadcountStats, getUserCvStats} = require("./statisticsController");
const {addGroupAliasWS,  deleteGroupAliasWS,deleteGroupWS, deleteMemberGroupWS,addGroupWS, createGroupWS, infoGroupWS,addUserToGroup, createUserWS, deleteUserByEmailWS, deleteMemeberAllGroups,deleteDeviceGroupsWS, getModelWorkspaceGroups, moveUserBetweenDevicesWS } = require("./workspaceController");
const { getPreferents, getPreferentById, createPreferent, updatePreferent, deletePreferent, filterPreferents } = require("./preferentsController");
const {createLeave,updateLeave,closeLeave, softDeleteLeave, hardDeleteLeave, listLeaves, getLeaveById}= require("./leaveController");
const {createHiring,updateHiring,closeHiring,softDeleteHiring,hardDeleteHiring,listHirings,getHiringById, getLastHiringForUser, relocateHirings}= require("./hiringController");
const { postCancelChangeRequest, postRejectChangeRequest, postApproveChangeRequest, getPendingChangeRequests, getMyChangeRequests, postCreateChangeRequest, postCreateTimeOffChangeRequest } = require("./userChangeRequestController");
const { moveDriveFile, adoptDriveFileIntoFiledrive } = require("./googleController");

const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, getProgramId} = require("./programController");
const { getDispositiveId, createDispositive, updateDispositive, deleteDispositive, handleCoordinators, handleResponsibles, listsResponsiblesAndCoordinators, getDispositiveResponsable } = require("./dispositiveController");
const { volunteerGetNotLimit,enableVolunteerApplication,disableVolunteerApplication, deleteVolunteerApplication, updateVolunteerApplication, listVolunteerApplications, getVolunteerApplicationById, createVolunteerApplication, addInternalNote, volunteerAddChronology,  volunteerChronologyUpdate, volunteerChronologyDelete, setVolunteerInterview, deleteInternalNote  } = require("./volunteerApplicationController");
const { removeBgProfile512FromBuffer } = require("./toolsServiceController");





module.exports = {
    profilePhotoGetBatch, profilePhotoSet, getPhotoProfile, recreateCorporateEmail,getAllUsersWithOpenPeriods, postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,rehireUser,getUsersCurrentStatus,getUserListDays,
    login, validToken,verifyCode,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, payroll, getFileUser,getUserCvID, getUserName,getBasicUserSearch,
    listFile,createFileDrive,updateFileDrive, deleteFileDrive,uploadFile, listBucketContents, getFile, deleteFile, getFileDrive, getPresignedPut, getPresignedGet, moveDriveFile, adoptDriveFileIntoFiledrive,
    zipPayrolls, zipMultipleFiles, postUploadFile, deleteIdFile, getCvPresignPut,getCvPresignGet,
    postCreateBag, getBags, getBagID,bagDeactivateId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId,getProgramId,
    offerList,offerCreate,offerUpdate,offerHardDelete,offerId,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers,deleteFileEnums,postSubcategory,
    sendEmail, generateEmailHTML, sendWelcomeEmail,
    getDocumentation, getDocumentationUnified,getDocumentationProgramDispositive,addProgramOrDispositiveToDocumentation,syncProgramDocsToDevices,
    requestSignature,confirmSignature,
    auditDocsUser,auditInfoUsers,auditInfoPrograms, auditInfoDevices,auditActiveLeaves, auditDocsProgram, auditDocsDispo,auditPayrolls,

    getCurrentHeadcountStats, getUserCvStats,
    addGroupAliasWS,  deleteGroupAliasWS,moveUserBetweenDevicesWS,deleteGroupWS, deleteMemberGroupWS,addGroupWS, createGroupWS, infoGroupWS, addUserToGroup,createUserWS, deleteUserByEmailWS,deleteMemeberAllGroups,deleteDeviceGroupsWS,getModelWorkspaceGroups,
    getPreferents,getPreferentById,createPreferent,updatePreferent,deletePreferent,filterPreferents,
    createLeave,updateLeave,closeLeave, softDeleteLeave, hardDeleteLeave, listLeaves, getLeaveById,
    createHiring,updateHiring,closeHiring,softDeleteHiring,hardDeleteHiring,listHirings,getHiringById,getLastHiringForUser,relocateHirings,
    postCreateTimeOffChangeRequest, postCreateChangeRequest,getMyChangeRequests,getPendingChangeRequests,postApproveChangeRequest,postRejectChangeRequest,postCancelChangeRequest,
    createDispositive,updateDispositive,deleteDispositive,handleCoordinators,handleResponsibles,listsResponsiblesAndCoordinators, getDispositiveResponsable,getDispositiveId,

    volunteerGetNotLimit,enableVolunteerApplication,deleteInternalNote,setVolunteerInterview,createVolunteerApplication,getVolunteerApplicationById,listVolunteerApplications, updateVolunteerApplication, deleteVolunteerApplication, disableVolunteerApplication, addInternalNote,volunteerAddChronology,  volunteerChronologyUpdate, volunteerChronologyDelete 

    ,removeBgProfile512FromBuffer
    
}