const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter, payroll, hirings, getFileUser}=require("./userController");
const { login, validToken, verifyCode } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, getUserCvID } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv, deleteFile } = require("./ovhController");
const { postUploadFile, getFile, deleteIdFile } = require("./fileController");
const { postCreateBag, getBags, getBagID, bagDeactivateId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");
const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive, getDispositiveResponsable, handleCoordinators, handleResponsibles } = require("./programController");
const { postCreateOfferJob, getOfferJobID, getOfferJobs, OfferJobDeleteId, OfferJobPut } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers } = require("./enumsController");
const {sendEmail, generateEmailHTML}=require("./emailController");
const {main}=require("./controladordepruebas")





module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,verifyCode,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUsersCvsIDs, getUserCvs, UserCvDeleteId, UserCvPut, payroll, hirings, getFileUser,getUserCvID,
    uploadFile, listBucketContents, getFile, deleteFile,
    postUploadFile, deleteIdFile,
    postCreateBag, getBags, getBagID,bagDeactivateId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive,getDispositiveResponsable,handleCoordinators, handleResponsibles,
    postCreateOfferJob, getOfferJobID, getOfferJobs,OfferJobDeleteId, OfferJobPut,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers,
    sendEmail, generateEmailHTML,

    main

}