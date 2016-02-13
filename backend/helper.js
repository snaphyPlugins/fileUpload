var renameFile = function (file, req){
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
}


function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}



module.exports = {
    renameFile : renameFile
}
