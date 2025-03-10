const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter, payroll, hirings, getFileUser, getUserName, getAllUsersWithOpenPeriods}=require("./userController");
const { login, validToken, verifyCode } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, getUserCvID } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv, deleteFile } = require("./ovhController");
const { postUploadFile, getFile, deleteIdFile, createFileDrive, updateFileDrive, deleteFileDrive, getFileDrive } = require("./fileController");
const { postCreateBag, getBags, getBagID, bagDeactivateId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");
const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive, getDispositiveResponsable, handleCoordinators, handleResponsibles } = require("./programController");
const { postCreateOfferJob, getOfferJobID, getOfferJobs, OfferJobDeleteId, OfferJobPut } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers } = require("./enumsController");
const {sendEmail, generateEmailHTML}=require("./emailController");
const {main}=require("./controladordepruebas");
const { getDocumentation } = require("./documentationController");





module.exports = {
    getAllUsersWithOpenPeriods, postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,verifyCode,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, payroll, hirings, getFileUser,getUserCvID, getUserName,
    createFileDrive,updateFileDrive, deleteFileDrive,uploadFile, listBucketContents, getFile, deleteFile, getFileDrive,
    postUploadFile, deleteIdFile,
    postCreateBag, getBags, getBagID,bagDeactivateId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive,getDispositiveResponsable,handleCoordinators, handleResponsibles,
    postCreateOfferJob, getOfferJobID, getOfferJobs,OfferJobDeleteId, OfferJobPut,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers,
    sendEmail, generateEmailHTML,
    getDocumentation,

    main

}