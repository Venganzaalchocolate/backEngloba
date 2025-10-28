const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter, payroll, getFileUser, getUserName, getAllUsersWithOpenPeriods, rehireUser, getUsersCurrentStatus}=require("./userController");
const { login, validToken, verifyCode } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, getUserCvID } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv, deleteFile, getPresignedPut, getPresignedGet } = require("./ovhController");
const { postUploadFile, getFile, deleteIdFile, createFileDrive, updateFileDrive, deleteFileDrive, getFileDrive, getCvPresignPut,getCvPresignGet} = require("./fileController");
const { postCreateBag, getBags, getBagID, bagDeactivateId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");

const { offerList,offerCreate,offerUpdate,offerHardDelete,offerId } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers } = require("./enumsController");
const {sendEmail, generateEmailHTML}=require("./emailControllerGoogle");
const { getDocumentation,getDocumentationUnified } = require("./documentationController");
const { confirmSignature, requestSignature } = require("./pdfSignController");
const { auditMissingFieldsInfoUser, auditMissingFieldsProgram, auditMissingFieldsDevice,auditMissingFieldsDocumentationUser, auditMissingFieldsDocumentationProgram, auditMissingFieldsDocumentationDevice, auditMissingFieldsContractAndLeave } = require("./auditorController");
const { getCvOverview, getCvMonthly, getCvDistribution, getCvConversion, auditWorkersStats, getWorkersStats} = require("./statisticsController");
const {deleteGroupWS, deleteMemberGroupWS,addGroupWS, createGroupWS, infoGroupWS,addUserToGroup, createUserWS, deleteUserByEmailWS, deleteMemeberAllGroups } = require("./workspaceController");
const { getPreferents, getPreferentById, createPreferent, updatePreferent, deletePreferent, filterPreferents } = require("./preferentsController");
const {createLeave,updateLeave,closeLeave, softDeleteLeave, hardDeleteLeave, listLeaves, getLeaveById}= require("./leaveController");
const {createHiring,updateHiring,closeHiring,softDeleteHiring,hardDeleteHiring,listHirings,getHiringById, getLastHiringForUser}= require("./hiringController");
const { postCancelChangeRequest, postRejectChangeRequest, postApproveChangeRequest, getPendingChangeRequests, getMyChangeRequests, postCreateChangeRequest } = require("./userChangeRequestController");
const { moveDriveFile, adoptDriveFileIntoFiledrive } = require("./googleController");

const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, getProgramId} = require("./programController");
const { getDispositiveId, createDispositive, updateDispositive, deleteDispositive, handleCoordinators, handleResponsibles, listsResponsiblesAndCoordinators, getDispositiveResponsable } = require("./dispositiveController");





module.exports = {
    getAllUsersWithOpenPeriods, postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,rehireUser,getUsersCurrentStatus,
    login, validToken,verifyCode,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, payroll, getFileUser,getUserCvID, getUserName,
    createFileDrive,updateFileDrive, deleteFileDrive,uploadFile, listBucketContents, getFile, deleteFile, getFileDrive, getPresignedPut, getPresignedGet, moveDriveFile, adoptDriveFileIntoFiledrive,
    postUploadFile, deleteIdFile, getCvPresignPut,getCvPresignGet,
    postCreateBag, getBags, getBagID,bagDeactivateId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId,getProgramId,
    offerList,offerCreate,offerUpdate,offerHardDelete,offerId,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers,
    sendEmail, generateEmailHTML,
    getDocumentation, getDocumentationUnified,
    requestSignature,confirmSignature,
    auditMissingFieldsInfoUser,auditMissingFieldsProgram,auditMissingFieldsDevice,auditMissingFieldsDocumentationUser, auditMissingFieldsDocumentationProgram,auditMissingFieldsDocumentationDevice,auditMissingFieldsContractAndLeave,
    getCvOverview,getCvMonthly,getCvDistribution, getCvConversion,auditWorkersStats, getWorkersStats,
    deleteGroupWS, deleteMemberGroupWS,addGroupWS, createGroupWS, infoGroupWS, addUserToGroup,createUserWS, deleteUserByEmailWS,deleteMemeberAllGroups,
    getPreferents,getPreferentById,createPreferent,updatePreferent,deletePreferent,filterPreferents,
    createLeave,updateLeave,closeLeave, softDeleteLeave, hardDeleteLeave, listLeaves, getLeaveById,
    createHiring,updateHiring,closeHiring,softDeleteHiring,hardDeleteHiring,listHirings,getHiringById,getLastHiringForUser,
    postCreateChangeRequest,getMyChangeRequests,getPendingChangeRequests,postApproveChangeRequest,postRejectChangeRequest,postCancelChangeRequest,
    createDispositive,updateDispositive,deleteDispositive,handleCoordinators,handleResponsibles,listsResponsiblesAndCoordinators, getDispositiveResponsable,getDispositiveId

    
}