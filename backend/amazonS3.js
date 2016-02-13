'use strict';
var IncomingForm = require('formidable');
var Imager = require('imager');
var imagerConfig = require("./settings/imagerConfig");
var fs = require("fs");
var fileHelper = require('./helper');

//Constructor for loading amazon image s3 and cloud front..
var init = function(server, databaseObj, helper, packageObj) {
    //run a loop of config and start defiging methods for each settings..
    var configList = packageObj.config;
    configList.forEach(function(config) {
        loadConfig(config, server, databaseObj, helper, packageObj);

    });
};


//Start defigning config for settings..
var loadConfig = function(config, app, databaseObj, helper, packageObj) {
    //get the container object..
    var Container = app.models[config.containerModel];
    //PersistentModel for exposing the containe with this model..
    var PersistentModel = app.models[config.fileModel];
    //Add container remote methods
    modifyContainerUpload(app, Container, config, helper, packageObj, PersistentModel);
    //link here  with all the methods of the container..
    //now attach upload method...
    //attachUploadMethod(app, PersistentModel, Container, config, helper, packageObj);
};

var attachUploadMethod = function(app, persistentModel, containerModel, config, helper, packageObj) {
    persistentModel.upload = function(ctx, options, cb) {
        if (!options) {
            options = {};
        }
        ctx.req.params.container = config.defaultContainer;
        //Now call the main upload method..of container
        containerModel.upload(ctx.req, ctx.result, options, function(err, fileObj) {
            if (err) {
                console.log("Error uploading");
                cb(err);
            } else {
                try {
                    console.log("Successfully uploaded image..");
                    var fileInfo = fileObj.files.file[0];
                    //Now create a file and add the info..
                    persistentModel.create({
                        name: fileInfo.name,
                        type: fileInfo.type,
                        container: fileInfo.container
                            //url: CONTAINERS_URL+fileInfo.container+'/download/'+fileInfo.name
                    }, function(err, obj) {
                        if (err !== null) {
                            cb(err);
                        } else {
                            cb(null, obj);
                        }
                    });
                } catch (err) {
                    cb(err);
                }

            }
        });
    };



    persistentModel.remoteMethod(
        'upload', {
            description: 'Uploads a file and store its configuration to this model',
            accepts: [{
                arg: 'ctx',
                type: 'object',
                http: {
                    source: 'context'
                }
            }, {
                arg: 'options',
                type: 'object',
                http: {
                    source: 'query'
                }
            }],
            returns: {
                arg: 'fileObject',
                type: 'object',
                root: true
            },
            http: {
                verb: 'post',
                path: '/:container/upload'
            }
        }
    );
};




var modifyContainerUpload = function(app, Container, config, helper, packageObj, persistentModel) {
    //Get the dataSource object..
    var FileDataSource = config.fileDataSource;
    var settings = app.dataSources[FileDataSource].settings;
    Container.beforeRemote('upload', function(ctx, res, next) {
        if (settings.provider === 'filesystem') {
            //Do settings for doing additional things to file system..
            next();
        } else if (settings.provider === "amazon") {
            if (config.fileProp.type === "image") {
                uploadImageToS3(app, ctx.req, ctx.res, config, function(err, data) {
                    if (err) {
                        next(err);
                    } else {

                        //console.log(data);
                        persistentModel.create({
                            name: data.result.files.file[0].name,
                            container: data.result.files.file[0].container
                                //url: CONTAINERS_URL+fileInfo.container+'/download/'+fileInfo.name
                        }, function(err, obj) {
                            if (err) {
                                ctx.res.status(500).send("Error uploading image");
                            } else {
                                console.log("Successfully uploaded with thumbnail to the server..");
                                ctx.res.status(201).send(obj);
                            }
                            //next();
                        });
                    }
                });
            } else {
                //if uploading any file then do it normally
                next();
            }
        } else {
            next();
        }
    });
}; //modifyContainerUpload files..






var handler = function(app, provider, req, res, config, options, cb) {
    if (!cb && 'function' === typeof options) {
        cb = options;
        options = {};
    }

    // if (!options.maxFileSize) {
    //   options.maxFileSize = defaultOptions.maxFileSize;
    // }

    var form = new IncomingForm(options);

    var fields = {};
    var files = [];
    console.log("Inside handler..");

    form
        .on('field', function(field, value) {
            fields[field] = value;
        })
        .on('file', function(field, file) {

            var fileName = fileHelper.renameFile(file, req);
            uploadToCloud(app, file, fields.container, res, req, fileName, config, cb);
            //Return result asyns..
            //TODO check this possible bug res is getting send before callback..
            //Sending the result fast..
            //Dont wait for image to get upload.
            //TODO HERE ALWAYS ONLY FILE IS GETTING SEND CHECK FOR BUG FIXING..
            //SENDING RESPONCE ASSUMNG FILE IS ALWAYS UPLOADED TO SERVER..
            var fileArr = [];

            fileArr.push({
                name: fileName,
                container: fields.container
            });
            var data = {
                result: {
                    files: {
                        file: fileArr
                    }
                }
            };
            //res.send(); //res.status
            //call the callback..now..
            cb(null, data);
        })
        .on('end', function(name, file) {
            console.log("END-> File fetched\n");
        });

    form.parse(req);
};


var uploadImageToS3 = function(app, req, res, config, options, cb) {
    var storageService = app.dataSources[config.fileDataSource].connector;
    if (!cb && 'function' === typeof options) {
        cb = options;
        options = {};
    }
    if (storageService.getFilename && !options.getFilename) {
        options.getFilename = storageService.getFilename;
    }
    if (storageService.acl && !options.acl) {
        options.acl = storageService.acl;
    }
    if (storageService.allowedContentTypes && !options.allowedContentTypes) {
        options.allowedContentTypes = storageService.allowedContentTypes;
    }
    if (storageService.maxFileSize && !options.maxFileSize) {
        options.maxFileSize = storageService.maxFileSize;
    }
    return handler(app, storageService.client, req, res, config, options, cb);
};




var uploadToCloud = function(app, path, container, res, req, fileName, config, callback) {
        var clientFileName = path.name;
        imagerConfig.storage.S3.bucket = container || config.defaultContainer || imagerConfig.storage.S3.bucket;
        var pattern = /^image\/(.+)$/;
        var extension = pattern.exec(path.type);
        try {
            if (extension.length) {
                extension = extension[1];
            } else {

                return callback(new Error("Error: only image type is permitted"));
            }
        } catch (err) {
            return callback(new Error("Error: getting extension of the file"));
        }

        if (!extension || extension === 'jpeg') {
            extension = "jpg";
        }

        //var fileName = fileHelper.renameFile(path, req);

        //Now add the rename function..
        imagerConfig.variants.items.rename = function() {
            return fileName;
        }



        var imager = new Imager(imagerConfig, "S3") // or 'S3' for amazon
        imager.upload([path], function(err, cdnUri, files) {
            // do your stuff
            if (err) {
                return callback(new Error("Error: Saving image to amazon server"));

            } else {
                console.log("Successfully saved to the amazon server..");
                var fileArr = [];
                for (var i = 0; i < files.length; i++) {
                    //Preparing the order object..
                    fileArr.push({
                        name: files[i],
                        container: container
                    });
                }


            }

            //TODO Now deleting the original file..
            deleteLocalFile(path.path);
        }, 'items');
    } //uploadToCloud..





var deleteLocalFile = function(path) {
    fs.unlink(path, function(err) {
        if (err) {
            console.error("Error deleting image from the path.");
        } else {
            console.log('successfully deleted ' + path);
        }

    });
};




module.exports = {
    init: init
}