var rbytes = require('rbytes');
var sys = require('sys');

function ArrayRemove (array,entry){
    var index = array.indexOf(entry)
    if (index == -1) { return array }    
    array.splice(index,1);
    return array;
}



function stringuid(uid) {
    return "" + uid
}


function Router() {
    this.users = {}
    this.socketobjects = {}
    this.userobjects = {}
    this.globalobjects = {user : function (socket,user) { return user }}
}


Router.prototype.addowner = function(object,user) {
    var uid = stringuid(user._id)
    this.users[uid][object.objectname] = object
}


Router.prototype.removeowner = function(object,user) {
    var uid = stringuid(user._id)
    delete this.users[uid][object.objectname]
}

Router.prototype.resolveobject = function(socket,user,objectname) {

    if (self.socketobjects[socket] && self.socketobjects[socket][objectname]) {
	return shipout(self.socketobjects[socket][objectname])
    }

    if (self.userobjects[user] && self.userobjects[user][objectname]) {
	return shipout(self.userobjects[user][objectname])
    }

    if (self.globalobjects[objectname]) {
	return shipout(self.globalobjects[objectname])
    }
    
    function shipout(target) {
	if (typeof(target) == 'function') { return target(socket,user,objectname) }
	return target
    }
    return object
}


/* ugly..
Router.prototype.updateobject = function(socket,user,objectname,object) {
    var self = this
    self.resolveobject(socket,user,objectname).update(object)
}
*/

Router.prototype.pushobject = function(socket,user,objectname) {
    var self = this
    var obj = self.resolveobject(socket,user,objectname)
}



Router.prototype.login = function(user,socket) {
    var uid = stringuid(user._id)
    
    if (!this.users[uid]) { this.users[uid] = []; console.log ("user " + uid + " logged in") } else 
    { console.log ("user " + uid + " connected another socket") }
    this.users[uid].push(socket)
    
}


Router.prototype.logout = function(user,socket) {
    var uid = stringuid(user._id)
    ArrayRemove(this.users[uid],socket)
    if (this.users[uid].length = 0) { delete this.users[uid]; console.log("user " + uid + " completely logged out") } else 
    { console.log("user " + uid + " disconnected a socket") }
}


Router.prototype.shareobject_user = function(user,objectname,object) {
    var uid = stringuid(user._id)    
    if (!this.userobjects[uid]) { this.userobjects[uid] = [] }
    this.userobjects[uid].push(object)
    object.owner = uid
}

Router.prototype.shareobject_socket = function(socket,objectname,object) {
    if (!this.socketobjects[socket]) { this.socketobjects[socket] = [] }
    this.socketobjects[socket].push(object)
    object.owner = socket
}






function RemoteObject() { }


RemoteObject.prototype.init = function(router,name) {
    var self = this;
    self.router = router
    self.objectname = name
    self.sockets = []
    self.id = new Date().getTime() + rbytes.randomBytes(20).toHex()

    


    for (var property in self.filter_out) {
	closure(property,self.filter_out[property])
	function closure(property,filter) {
	    if (typeof(self[property]) == "function") {
		return
	    }

	    self["_" + property] = self[property]
	    self.__defineSetter__(property, function (value) { self["_" + property] = value; self.syncproperty(property,value);  console.log(self.objectname,"SENDING",property,value) })
	    self.__defineGetter__(property, function () {  return self["_" + property] })   


	}
    }


}


RemoteObject.prototype.emit = function(tag,data) {
    var self = this
    self.sockets.forEach(function(socket) { socket.emit(tag,data)})
}

RemoteObject.prototype.save = function () {
    //JSON.stringify(this)
}

RemoteObject.prototype.addowner = function(socket) {
    var self = this
    //owner = stringuid(owner._id)
    //self.router.addowner(this,owner)
    if (self.sockets.indexOf(socket) == -1) { self.sockets.push(socket) }
}

RemoteObject.prototype.removeowner = function(owner) {
    owner = stringuid(owner._id)
    self.owners = ArrayRemove(self.owners,owner)
    self.router.removeowner(this,owner)
    if (self.owners.length == 0) { console.log( "object " + this.objectname + " dissipating, no owners left")}
}

RemoteObject.prototype.sync = function(obj) {
    var self = this
    var objectname = self.objectname
    var data = { }
    data[objectname] = {}
    for (var property in self.filter_out) {
	var filter = self.filter_out[property]
	var value = undefined


	if (typeof(filter) == 'function') {
	    value = filter(self["_" + property])
	} else if (filter == true) {
	    value = self["_" + property]
	} else {
	    value = filter
	}

	data[objectname][property] = (value)
    }
    console.log("EMMITING",sys.inspect(data))
    self.emit('objectsync',data)

}
/*
RemoteObject.prototype.sockets = function(callback) {
    var self = this
    for (var owner in self.owners) {
	owner.
	
    }
    if (sockets[self._id]) { sockets[self._id].forEach(function(socket) { callback(socket) }) }
}
*/

RemoteObject.prototype.syncproperty = function(property,value) {
    var value = self.filter_out[property](value)
    data = {}
    data[self[objectname]] = {}
    data[self[objectname]][property] = value
    this.emit('syncobject', data )
}


RemoteObject.prototype.update = function(obj) {
    var self = this

    for (var property in obj) {
	var filter = self.filter_in[property]
	if (filter) {
	    if (filter == true) { self.property = obj[property] } else {
		self.property = filter(obj[property])}
	}
    }
}


module.exports.RemoteObject = RemoteObject
module.exports.Router = Router
