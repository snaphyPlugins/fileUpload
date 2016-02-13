'use strict';
var IncomingForm = require('formidable');
var Imager = require('imager');


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

    //link here  with all the methods of the container..
    //now attach upload method...
    attachUploadMethod(app, PersistentModel, Container, config, helper, packageObj);
};





var attachUploadMethod = function(app, persistentModel, containerModel, config, helper, packageObj) {
    persistentModel.upload = function(ctx, options, cb) {
        if (!options) {
            options = {};
        }
        //Now call the main upload method..of container
        containerModel.upload(ctx.req, ctx.result, options, function(err, fileObj) {
            if (err) {
                cb(err);
            } else {
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
                verb: 'post'
            }
        }
    );
};


var modifyContainerUpload = function(app, Container, config, helper, packageObj) {
    //Get the dataSource object..
    var FileDataSource = config.fileDataSource;
    var settings = app.dataSources[FileDataSource].settings;
    Container.beforeRemote('upload', function(ctx, res, next) {
        if (settings.provider === 'filesystem') {
            //Do settings for doing additional things to file system..
            next();
        } else if (settings.provider === "amazon") {
            if (config.fileProp.type === "image") {
                //Now if filetype is image the upload it through third party lirary else do it through default strongloop upload method..
                uploadImageToS3(app, ctx.req, ctx.res, function(err, data) {
                    if (err) {
                        console.error("Error uploading image to amazon server..");
                        console.error(err);
                        var e = new Error('Error uploading image to amazon server..');
                        next(e);
                    }else{
                        console.log("Successfully uploaded with thumbnail to the server..");

                        next();
                    }
                    //Clean downloaded file in both case..
                });
            }else{
                //if uploading any file then do it normally
                next();
            }
        }else{
            next();
        }
    });
}; //modifyContainerUpload files..






var handler = function(app, provider, req, res, options, cb) {
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


    form
        .on('field', function(field, value) {
            fields[field] = value;
        })
        .on('file', function(field, file) {
            console.log("File uploaded..");
            uploadToCloud(app, file, fields.container, res, cb);
        })
        .on('end', function(name, file) {
            console.log("END-> File fetched\n");
        });

    form.parse(req);
};


var uploadImageToS3 = function(app, req, res, options, cb) {
    var storageService = app.dataSources.presImage.connector;
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
    return handler(app, storageService.client, req, res, options, cb);
};



  var uploadToCloud = function(app, path, container, res, callback) {
      var fileName, extension;
      var time = new Date();
      time     = time.getTime();
      var isValidUser = true;
      var clientFileName = path.name;
      if (isValidUser) {
        //Changing the file name
        fileName = '' + container + '_' + time;

        imagerConfig.storage.S3.bucket = container || imagerConfig.storage.S3.bucket ;
        var pattern = /^image\/(.+)$/;
        extension = pattern.exec(path.type);
        try {
          if (extension.length) {
            extension = extension[1];
          } else {
            throw "Error. Only image type file is permitted";
          }
        } catch (err) {
          throw "Error getting extension of file..";
        }


        if (!extension || extension == 'jpeg') {
          extension = "jpg";
        }

        //Now add the rename function..
        imagerConfig.variants.items.rename = function() {
          return fileName + "." + extension;
        }

        imager = new Imager(imagerConfig, 'S3') // or 'S3' for amazon
        imager.upload([path], function(err, cdnUri, files) {
          // do your stuff
          if (err) throw err;
          console.log("Successfully saved to the amazon server..");
          var fileArr = [];
          for (var i = 0; i < files.length; i++) {
            //Preparing the order object..
            fileArr.push({
              name: files[i],
              container: container
            });
          }

          //Sending the result fast..
          //Dont wait for image to get upload..
          res.send({
            result: {
              files: {
                file: fileArr
              }
            }
          }); //res.status
          callback();
          //Now deleting the original file..
          //deleteLocalFile(path.path);
        }, 'items');
      } else {
        console.log("Wrong validation code. Not allowed.");
        res.status(401).send("Wrong Validation code. Permission not allowed.");
      }
    } //uploadToCloud..





  var deleteLocalFile = function(path) {
    fs.unlink(path, function(err) {
      if (err) throw err;
      console.log('successfully deleted ' + path);
    });
  };




module.exports = {
    init: init
}
