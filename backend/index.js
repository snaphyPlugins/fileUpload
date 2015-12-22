(function(){'use strict';})();
module.exports = function( server, databaseObj, helper, packageObj) {
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


	var subscribeModel = function(dbInstance){
		//Create a container for the customer for adding its prescription images..
		dbInstance.observe('after save', function (ctx, next) {
	    	var app = server;
			var ImageDataSource = packageObj.ImageDataSource;
	    	var containerDb = app.dataSources[ImageDataSource];
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
