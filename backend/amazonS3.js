'use strict';
var IncomingForm = require('formidable');
var Imager = require('imager');
var imagerConfig = require("./settings/imagerConfig");
var fs = require("fs");
var fileHelper = require('./helper');
var cf = require('aws-cloudfront-sign');
var path = require("path");
var PRIVATE_KEY_PATH = path.join(__dirname + '/settings/pk-APKAITJKBXGC5DPI526Q.pem');

//Constructor for loading amazon image s3 and cloud front..
var init = function(server, databaseObj, helper, packageObj) {
    //run a loop of config and start defiging methods for each settings..
    var configList = packageObj.config;
    //Now add generate url method..
    generateSignedUrl(server, databaseObj, helper, packageObj);
    generateUnsignedUrl(server, databaseObj, helper, packageObj);
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


var generateUnsignedUrl = function(server, databaseObj, helper, packageObj) {
    var app = server;
    var FileModel = packageObj.fileDefaultModel;
    FileModel = app.models[FileModel];
    //Options accepts suffix or prefix like -original, -medium, -thumb, -original
    FileModel.getUnsignedUrl = function(container, file, options, callback) {
        var app = this.app;
        var unSignedUrl = "";
        try {
            if (packageObj.cdn) {
                for (var provider in packageObj.cdn) {
                    if (packageObj.cdn.hasOwnProperty(provider)) {
                        var givedContainer = packageObj.cdn[provider].container;
                        if (givedContainer === container) {
                            if (provider === "amazon") {
                                if(options){
                                    if (options.type === "prefix") {
                                        unSignedUrl = packageObj.cdn[provider].url +"/" + options.value + file;
                                    }else if(options.type === "suffix"){
                                        unSignedUrl = packageObj.cdn[provider].url +"/"  + file + options.value;
                                    }else{
                                        unSignedUrl = packageObj.cdn[provider].url +"/"  + file;
                                    }
                                }else{
                                    unSignedUrl = packageObj.cdn[provider].url +"/"  + file;
                                }


                            } else if (provider === "rackspace") {
                                //TODO DO IT LATER..
                                //
                                //
                            } else {
                                //do nothing...

                            }

                        }
                    }
                } //for loop.
            }
        } catch (err) {
            //return error..
            return callback(err);
        }

        var defaultUrl;

        if (options) {
            if (options.type === "prefix") {
                defaultUrl = "/api/containers/" + container + "/download/" + options.value + file;
            } else if (options.type === "suffix") {
                defaultUrl = "/api/containers/" + container + "/download/" + file + options.value;
            } else {
                //else return normal url ..
                defaultUrl = "/api/containers/" + container + "/download/" + file;
            }
        } else {
            //else return normal url ..
            defaultUrl = "/api/containers/" + container + "/download/" + file;
        }



        return callback(null, {
            defaultUrl: defaultUrl,
            unSignedUrl: unSignedUrl
        });
    };
}




//Add get url methods for the basic models..also generateSignedApk for cdn containers automatically..
var generateSignedUrl = function(server, databaseObj, helper, packageObj) {
    var app = server;
    var FileModel = packageObj.fileDefaultModel;
    FileModel = app.models[FileModel];
    //Options accepts suffix or prefix like -original, -medium, -thumb, -original
    FileModel.getUrl = function(container, file, options, callback) {
        var app = this.app;
        var signedUrl = "";
        try {
            if (packageObj.cdn) {
                for (var provider in packageObj.cdn) {
                    if (packageObj.cdn.hasOwnProperty(provider)) {
                        var givedContainer = packageObj.cdn[provider].container;
                        if (givedContainer === container) {
                            if (provider === "amazon") {
                                signedUrl = generateAmazonSignedUrl(app, file, options, packageObj.cdn[provider].keyPairId, packageObj.cdn[provider].url);
                            } else if (provider === "rackspace") {
                                //TODO DO IT LATER..
                                //
                                //
                            } else {
                                //do nothing...

                            }

                        }
                    }
                } //for loop.
            }
        } catch (err) {
            //return error..
            return callback(err);
        }

        var defaultUrl;

        if (options) {
            if (options.type === "prefix") {
                defaultUrl = "/api/containers/" + container + "/download/" + options.value + file;
            } else if (options.type === "suffix") {
                defaultUrl = "/api/containers/" + container + "/download/" + file + options.value;
            } else {
                //else return normal url ..
                defaultUrl = "/api/containers/" + container + "/download/" + file;
            }
        } else {
            //else return normal url ..
            defaultUrl = "/api/containers/" + container + "/download/" + file;
        }



        return callback(null, {
            defaultUrl: defaultUrl,
            signedUrl: signedUrl
        });
    };


    FileModel.remoteMethod(
        'getUrl', {
            'description': "Get download url for the file. Also generates signed url automatically if provided.",
            accepts: [{
                arg: 'container',
                type: 'string'
            }, {
                arg: 'file',
                type: 'string'
            }, {
                arg: 'options',
                type: "object"
            }],
            returns: {
                arg: 'url',
                type: 'object',
                root: true
            }
        }
    );

};


/**
 * Generate Amazon Cloud Front Signed URL.
 * @param  {[type]} app       [description]
 * @param  {[type]} container [description]
 * @param  {[type]} file      [description]
 * @param  {[type]} options   {type:"prefix||suffix", value: "thumb-"|| "medium_" etc}
 * @param  {[type]} keypairId [description]
 * @param  {[type]} url       [description]
 * @return {[type]}           [description]
 */
var generateAmazonSignedUrl = function(app, file, options, keypairId, url) {
    var time = (new Date().getTime() + (1000 * 15 * 60 * 60));
    var cfOptions = {
        keypairId: keypairId,
        privateKeyPath: PRIVATE_KEY_PATH,
        expireTime: time
    };
    var signedUrl;
    if (options) {
        if (options.type === "prefix") {
            signedUrl = cf.getSignedUrl(url + "/" + options.value + file, cfOptions);
        } else if (options.type === "suffix") {
            signedUrl = cf.getSignedUrl(url + "/" + file + options.value, cfOptions);
        } else {
            signedUrl = cf.getSignedUrl(url + "/" + file, cfOptions);
        }
    } else {
        signedUrl = cf.getSignedUrl(url + "/" + file, cfOptions);
    }
    return signedUrl;
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
                        console.log(data.result.files.file);
                        var name = data.result.files.file[0].name;
                        var container = data.result.files.file[0].container;
                        //check if the container has amazon cdn..
                        //Now adding the url with the file...

                        var FileModel = packageObj.fileDefaultModel;
                        FileModel = app.models[FileModel];
                        var options = {
                            type: "prefix",
                            value: "small_"
                        };
                        FileModel.getUnsignedUrl (container, name, options, function(err, url)  {
                            if(err){
                                return ctx.res.status(500).send(err);
                            }
                            console.log(url);
                            persistentModel.create({
                                name: name,
                                container: container,
                                url: url
                            }, function(err, obj) {
                                if (err) {
                                    console.log("Error occured");
                                    ctx.res.status(500).send(err);
                                } else {
                                    console.log("Successfully uploaded with thumbnail to the server..");
                                    return ctx.res.send(obj);
                                }
                                //next();
                            });
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
    //console.log("Inside handler..");

    form
        .on('field', function(field, value) {
            fields[field] = value;
        })
        .on('file', function(field, file) {
            var fileName = fileHelper.renameFile(file, req);
            uploadToCloud(app, file, fields.container, res, req, fileName, config, cb);

            //TODO HERE ALWAYS ONLY FILE IS GETTING SEND CHECK FOR BUG FIXING..
            //SENDING RESPONCE ASSUMNG FILE IS ALWAYS UPLOADED TO SERVER..
            var fileArr = [];

            fileArr.push({
                name: fileName,
                container: fields.container || config.defaultContainer || imagerConfig.storage.S3.bucket
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


        //var fileName = fileHelper.renameFile(path, req);

        //Now add the rename function..
        imagerConfig.variants.items.rename = function() {
            return fileName;
        }



        var imager = new Imager(imagerConfig, "S3") // or 'S3' for amazon
        imager.upload([path], function(err, cdnUri, files) {
            // do your stuff
            if (err) {
                return console.error(err);

            } else {
                console.log("Successfully saved to the amazon server..");
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
