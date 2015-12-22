(function(){'use strict';})();
module.exports = function( server, databaseObj, helper, packageObj) {

	//load Admin plugins
	var login = helper.loadPlugin('login');
	var qt = require('quickthumb');
	var path = require('path');
	/**
	 * Here server is the main app object
	 * databaseObj is the mapped database from the package.json file
	 * helper object contains all the helpers methods.
	 * packegeObj contains the packageObj file of your plugin.
	 */

	/**
	 * Initialize the plugin at time of server start.
	 * init method should never have any argument
	 * It is a constructor and is populated once the server starts.
	 * @return {[type]} [description]
	 */
	var init = function(){
		addContainerOnUserCreate();
		modifyImageName();
	};


	var addUploaderVerification = function(){
		var app  	      = server;
		var Container     = app.models[packegeObj.fileProperties.containerModel];
		//isAdmin = function(app, currentContext, cb)
		var isAdminMethod = login.isAdmin;
		Container.beforeRemote('upload', function(ctx,  modelInstance, next){
			var container = ctx.req.params.container;
			//Now get the userid of the current loggedIn user..
			var accessToken = ctx.req.accessToken;
			if(accessToken === null){
				//return user not logged in..
				ctx.res.status('401').send('Permission not allowed.');
				return null;
			}

			/**
			 * 1. Add the ACL at containers for security..TO ALLOW ONLY ADMIN AND ALSO CREATE SOME DYNAMIC ROLES BASED ON USER CONTAINER RESTRICTION.
			 */

			//call the next middleware..
			next();
		});//beforeRemote


		Container.afterRemote('upload', function(ctx, res, next) {
			//Now check is thumnail is required..
			var ImageProp  = packegeObj.fileProperties.imageProp;
			if(ImageProp){
				if(ImageProp.createThumb){
					var file            = res.result.files.file[0];
					var file_path       = path.join("./server/storage/",  file.container,  file.name);
					var file_thumb_path = path.join("./server/storage/",  file.container, ImageProp.thumbContainer ,file.name);

					qt.convert({
						src: file_path,
						dst: file_thumb_path,
						width: 100
					}, function (err, path) {
					});
				}
			}
			//call the next middleware..
			next();
		});
	};


	var addContainerOnUserCreate = function(){
		//run a loop to add the users added in the database..
		for(var key in databaseObj){
			if(databaseObj.hasOwnProperty(key)){
				var dbInstance = databaseObj[key];
				 subscribeModel(dbInstance);
			}
		}
	};


	var modifyImageName = function(){
		var app = server;
		var FileDataSource = packageObj.fileProperties.fileDataSource;
		var fileType = packageObj.fileProperties.fileType;

		//Function for checking the file type..
	    app.dataSources[FileDataSource].connector.getFilename = function(file, req, res) {
			if(fileType === 'image'){
				//First checking the file type..
		        var pattern = /^image\/.+$/;
		        var value = pattern.test(file.type);
		        if(value ){
		            var fileExtension = file.name.split('.').pop();
		            var container = file.container;
		            var time   = new Date().getTime();
		            var query  = req.query;
		            var userId = query.userId;
					var UUID   = guid();
		            //Now preparing the file name..
		            //customerId_time_orderId.extension
		            var NewFileName = '' + userId + '_' + time + '_' + UUID + '.' + fileExtension;

		            //And the file name will be saved as defined..
		            return NewFileName;
		        }
		        else{
		            res.status(403).send("FileTypeError: Only File of Image type is supported right.");
					return false;
		        }
			}
			else{
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



	var subscribeModel = function(dbInstance){
		//Create a container for the customer for adding its prescription images..
		dbInstance.observe('after save', function (ctx, next) {
	    	var app = server;
			var FileDataSource = packageObj.fileProperties.fileDataSource;
	    	var containerDb = app.dataSources[FileDataSource];
	    	//Creating container for the given customer..
	    	containerDb.DataAccessObject.createContainer(
	    		{
	    			"name": '' + ctx.instance.id + ''
	    		},
	    		//Callback..
	    		function(err, container){
	    			if (err){
	                    console.log(err.message);
	                    console.log("Container exists already");
	                }else{
	                    console.log("Container created successfully.");
	                }
	                next();
	    		}
	    	);

	  	}); //observe
	};


	//return all the methods that you wish to provide user to extend this plugin.
	return {
		init: init
	};
}; //module.exports
