(function() {
    'use strict';
})();
module.exports = function(server, databaseObj, helper, packageObj) {

    //load Admin plugins
    var login = helper.loadPlugin('login');
    var qt = require('quickthumb');
    var path = require('path');
    var fs = require('fs');
    var Promise = require("bluebird");
    var AmazonImage = require('./amazonS3');

    /**
     * Here server is the main app object
     * databaseObj is the mapped database from the package.json file
     * helper object contains all the helpers methods.
     * packageObj contains the packageObj file of your plugin.
     */

    /**
     * Initialize the plugin at time of server start.
     * init method should never have any argument
     * It is a constructor and is populated once the server starts.
     * @return {[type]} [description]
     */
    var init = function() {
        createStorageIfNotPresent(server);
        addUploaderVerification();
        addContainerOnUserCreate();
        modifyImageName();
        removeImageOnDelete();
        //Initialize amazon Image library..
        AmazonImage.init(server, databaseObj, helper, packageObj);
    };


    var addUploaderVerification = function() {
        var app = server;
        var Container = app.models[packageObj.fileProperties.containerModel];
        //isAdmin = function(app, currentContext, cb)
        var isAdminMethod = login.isAdmin;
        Container.beforeRemote('upload', function(ctx, modelInstance, next) {
            var container = ctx.req.params.container;
            //Now get the userid of the current loggedIn user..
            var accessToken = ctx.req.accessToken;
            if (accessToken === null) {
                //return user not logged in..
                ctx.res.status('401').send('Permission not allowed.');
                return null;
            }
            next();
        }); //beforeRemote


        Container.afterRemote('upload', function(ctx, res, next) {
            var FileDataSource = packageObj.fileProperties.fileDataSource;
            var settings = app.dataSources[FileDataSource].settings;
            //Now check is thumnail is required..
            var ImageProp = packageObj.fileProperties.imageProp;
            var serverFolder = helper.getServerFolder();

                if (settings.provider === 'filesystem') {
                    var rootFolder = settings.root;
                    var file = res.result.files.file[0];
                    var thumbDir = path.join(rootFolder, ImageProp.thumbContainer);

                    if (ImageProp) {
                        if (ImageProp.createThumb) {

                            var file_path = path.join(rootFolder, file.container, file.name);
                            var file_thumb_path = path.join(thumbDir, file.name);

                            //Temp path directory..create if directory not present.
                            if (!fs.existsSync(thumbDir)) {
                                fs.mkdirSync(thumbDir);
                            }

                            qt.convert({
                                src: file_path,
                                dst: file_thumb_path,
                                width: 200
                            }, function(err, path) {});
                        }
                    } //if ImageProp
                }
                else if (settings.provider === "amazon") {

                }

            
            //call the next middleware..
            next();
        });

        Container.beforeRemote('removeFile', function(ctx, res, next) {
            var FileDataSource = packageObj.fileProperties.fileDataSource;
            var fileName = ctx.req.params.file;
            var settings = app.dataSources[FileDataSource].settings;
            var ImageProp = packageObj.fileProperties.imageProp;
            if (settings.provider === 'filesystem') {
                var rootFolder = settings.root;
                var thumbDir = path.join(rootFolder, ImageProp.thumbContainer);
                var imagePath = path.join(thumbDir, fileName);
                //Now remove the image thumbnail..
                fs.unlinkSync(imagePath);
            }
            next();
        });
    };




    var addContainerOnUserCreate = function() {
        //run a loop to add the users added in the database..
        for (var key in databaseObj) {
            if (databaseObj.hasOwnProperty(key)) {
                var dbInstance = databaseObj[key];
                subscribeModel(dbInstance);
            }
        }
    };

    //Create storage folder if not present..
    var createStorageIfNotPresent = function(app) {
        //var serverFolder = helper.getServerFolder();
        var FileDataSource = packageObj.fileProperties.fileDataSource;
        var settings = app.dataSources[FileDataSource].settings;
        if (settings.provider === 'filesystem') {
            var rootFolder = settings.root;
            //Temp path directory..create if directory not present.
            if (!fs.existsSync(rootFolder)) {
                fs.mkdirSync(rootFolder);
                console.log("Storage folder created successfully.");
            }

        }



        //Now create some container on Initialize..
        var containersList = packageObj.fileProperties.createInitContainer;
        var dataSource = app.models[packageObj.fileProperties.containerModel];
        if (packageObj.fileProperties.createInitContainer) {
            containersList.forEach(function(containerName) {
                //console.log(dataSource);
                //check if the container exists..
                createContainer(app, containerName);
            });
        }

    };


    var createContainer = function(app, containerName) {
        var FileDataSource = packageObj.fileProperties.fileDataSource;
        var containerDb = app.dataSources[FileDataSource];
        //Creating container for the given customer..
        containerDb.DataAccessObject.createContainer({
            name: containerName
        }, function(err, containerObj) {
            if (err) {
                console.error("Cannot create container ");
                return false;
            }
            console.log("Container successfully created");
        });
    };



    var modifyImageName = function() {
        var app = server;
        var FileDataSource = packageObj.fileProperties.fileDataSource;
        var fileType = packageObj.fileProperties.fileType;

        //Function for checking the file type..
        app.dataSources[FileDataSource].connector.getFilename = function(file, req, res) {
            if (fileType === 'image') {
                //First checking the file type..
                var pattern = /^image\/.+$/;
                var value = pattern.test(file.type);
                if (value) {
                    var fileExtension = file.name.split('.').pop();
                    //var container = file.container;
                    var time = new Date().getTime();
                    //var query = req.query;
                    var userId = req.accessToken.userId;
                    var UUID = guid();
                    //Now preparing the file name..
                    //customerId_time_orderId.extension
                    var NewFileName = '' + userId + '_' + time + '_' + UUID + '.' + fileExtension;

                    //And the file name will be saved as defined..
                    return NewFileName;
                } else {
                    res.status(403).send("FileTypeError: Only File of Image type is supported right.");
                    return false;
                }
            } else {
                //throw error..
                res.status(403).send("FileTypeError: Only File of Image type is accepted.");
                return false;
            }
        };
    };

    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }



    var subscribeModel = function(dbInstance) {
        //Create a container for the customer for adding its prescription images..
        dbInstance.observe('after save', function(ctx, next) {
            var app = server;
            var FileDataSource = packageObj.fileProperties.fileDataSource;
            var containerDb = app.dataSources[FileDataSource];
            //Creating container for the given customer..
            containerDb.DataAccessObject.createContainer({
                    "name": '' + ctx.instance.id + ''
                },
                //Callback..
                function(err, container) {
                    if (err) {
                        console.log(err.message);
                        console.log("Container exists already");
                    } else {
                        console.log("Container created successfully.");
                    }
                    next();
                }
            );

        }); //observe
    };


    var removeImageOnDelete = function() {
        var models = server.models();
        models.forEach(function(Model) {
            //refer to https://apidocs.strongloop.com/loopback/#app-models
            onDeleteHook(server, Model.modelName);
        });
    };


    var onDeleteHook = function(app, modelName) {
        var modelObj = app.models[modelName];
        var modelProperties = modelObj.definition.rawProperties;
        //Run a loop of the modelProperties..
        for (var property in modelProperties) {
            if (modelProperties.hasOwnProperty(property)) {
                var type = modelProperties[property].type;
                if (type === "object" || type === "array") {
                    if (modelProperties[property].template) {
                        var template = modelProperties[property].template;
                        if (template.templateOptions) {
                            if (template.templateOptions.bind) {
                                console.log("Binded to hook for delete " + modelName);
                                //Add hook..
                                addOnDeleleteHook(app, modelObj, property, type, packageObj);

                            }
                            //Now if image is set to delete on update..or an image..
                            if (template.templateOptions.onImageUpdate) {
                                if (template.templateOptions.onImageUpdate.deletePrevious) {
                                    //Binding image delete hook on update..
                                    console.log("Binding image hook to delete on update..");
                                    deleteOnUpdate(app, modelObj, property, type, packageObj);
                                }
                            }
                        }
                    }
                }
            }
        }
    };


    //delete previous image on update of new image..
    var deleteOnUpdate = function(app, modelObj, propertyName, type, packageObj) {
        modelObj.observe("persist", function(ctx, next) {
            console.log("I am here before save..");
            var modelProperties = modelObj.definition.rawProperties;
            var containerModel = modelProperties[propertyName].template.templateOptions.containerModel;
            var containerDb = app.models[containerModel];
            if (!ctx.isNewInstance) {
                //First fetch the previous data..
                if (ctx.currentInstance) {
                    //find model based on id..
                    modelObj.find({
                        where: {
                            id: ctx.currentInstance.id
                        }
                    }, function(err, data) {
                        if (err) {
                            console.error("Error finding model when delete image on update.");
                            //next();
                        } else {
                            if(data.length){
                                for(var j = 0; j < data.length; j++){
                                    var object = data[j];
                                    var ImageArrOrObj = object[propertyName];
                                    if (ImageArrOrObj) {
                                        var fileName;
                                        var containerName;
                                        if (type === "object") {
                                            //first check if the image is updated or not updated..

                                            fileName = ImageArrOrObj.name;
                                            containerName = ImageArrOrObj.container;
                                            if(ctx.currentInstance[propertyName].name !== fileName){
                                                //remove the file..
                                                destroyImage(containerDb, fileName, containerName);
                                                //next();
                                            }else{


                                            }
                                        } else if (type === 'array') {
                                            for(var i=0; i< ImageArrOrObj.length; i++){
                                                var ImageDetails = ImageArrOrObj[i];
                                                fileName = ImageDetails.name;
                                                containerName = ImageDetails.container;
                                                if(ctx.currentInstance[propertyName].name !== fileName){
                                                    //remove the file..
                                                    destroyImage(containerDb, fileName, containerName);
                                                }
                                            }
                                            //next();
                                        }
                                    }
                                } //end of for loop..
                                next();
                            }else{
                                next();
                            }
                        }
                    });
                }else{
                    next();
                }

            } else {
                next();
            }
        });
    };



    var addOnDeleleteHook = function(app, modelObj, propertyName, type, packageObj) {
        return (function(app, modelObj, propertyName, type, packageObj) {
            modelObj.observe("before delete", function(ctx, next) {
                var modelProperties = modelObj.definition.rawProperties;
                var containerModel = modelProperties[propertyName].template.templateOptions.containerModel;
                var containerDb = app.models[containerModel];
                var where = ctx.where;
                modelObj.find({
                        where: where
                    })
                    .then(function(value) {

                        if (value) {
                            value.forEach(function(object, index) {
                                //imageValue
                                var ImageArrOrObj = object[propertyName];
                                if (ImageArrOrObj) {
                                    if (type === "object") {
                                        var fileName = ImageArrOrObj.name;
                                        var containerName = ImageArrOrObj.container;
                                        //Just delete the object too..
                                        destroyImage(containerDb, fileName, containerName);
                                    } else if (type === 'array') {
                                        ImageArrOrObj.forEach(function(ImageDetails, index) {
                                            var fileName = ImageDetails.name;
                                            var containerName = ImageDetails.container;
                                            //Just delete the object too..
                                            destroyImage(containerDb, fileName, containerName);
                                        });
                                    } else {
                                        // Do nothing
                                    }
                                }
                            }); //forEach
                        } //if value
                        //Move to next middleware
                        next();
                    })
                    .catch(function(err) {
                        console.error(err);
                        next();
                        return false;
                    });
            });
        })(app, modelObj, propertyName, type, packageObj);
    };


    var destroyImage = function(containerDb, file, containerName) {
        if (file && containerName) {
            containerDb.removeFile(containerName, file, function(err, value) {
                if (err) {
                    console.log(err);
                    return false;
                } else {
                    console.log("Related image file successfully deleted");
                    //also remove the thumb file..
                    //since the data is getting delete from backend so beforeRemote will not work here..
                    var ImageProp = packageObj.fileProperties.imageProp;
                    var thumbNailName = ImageProp.thumbContainer;
                    if (thumbNailName) {
                        try {
                            containerDb.removeFile(thumbNailName, file, function(err, value) {
                                if (err) {
                                    console.error(err);
                                    return false;
                                }
                                console.log("successfully deleted thumbnail file too.");
                            });
                        } catch (error) {
                            console.log("error occured while deleting thumbnail image.");
                        }
                    }
                }
            });
        }
    };




    //return all the methods that you wish to provide user to extend this plugin.
    return {
        init: init
    };
}; //module.exports
