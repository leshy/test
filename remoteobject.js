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
    var self = this;
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
    if (this.users[uid].length == 0) { delete this.users[uid]; console.log("user " + uid + " completely logged out") } else 
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
    self.subscriptions = {}

    
    for (var property in self.filter_out) {
	closure(property,self.filter_out[property])
	function closure(property,filter) {
	    if (typeof(self[property]) == "function") {
		return
	    }
	    
	    self["_" + property] = self[property]
	    if (!self["_" + property]) { 
		self.__defineSetter__(property, function (value) { 
		    console.log(self.objectname,"Updating",property,"=",value)     
		    var oldvalue = self["_" + property]
		    self["_" + property] = value
		    if (oldvalue != value) {
			self.event(property,value,oldvalue)
		    }

		    self.syncproperty(property)

		})
		self.__defineGetter__(property, function () {  
		    return self["_" + property] 
		})	
	    }
	}
    }
}


RemoteObject.prototype.getSaveData = function(obj) {
    var self = this
    var objectname = self.objectname
    var data = { }
    for (var property in self.filter_save) {
	var filter = self.filter_save[property]
	var value = undefined
	if (typeof(filter) == 'function') {
	    value = filter(self[property])
	} else if (filter == true) {
	    value = self[property]
	} else {
	    value = filter
	}

	data[property] = value
    }
    
    return data
}

RemoteObject.prototype.syncproperty = function(property) {
    var self = this

    if (typeof(self.filter_out[property]) == 'function') {
	var value = self.filter_out[property](value)
    } 
    else if ( self.filter_out[property] == true ) {
	var value = self[property]
    } else {
	var value = self.filter_out[property]
    }

    data = {}
    data[self.objectname] = {}
    data[self.objectname][property] = value
    console.log("emmiting",sys.inspect(data))
    this.emit('objectsync', data )
    this.save()
}

RemoteObject.prototype.subscribe = function(property,callback) {
    var self = this
    if (!self.subscriptions[property]) { self.subscriptions[property] = [] }
    self.subscriptions[property].push(callback)
}

RemoteObject.prototype.event = function(property,value,oldvalue) {
    var self = this
    console.log ( "UPDATE EVENT",property,value)
    if (self.subscriptions['*']) { 
	self.subscriptions['*'].forEach( function(callback) {
	    callback(value,oldvalue,property,self)
	})

    }
    if (!self.subscriptions[property]) { return }
    self.subscriptions[property].forEach( function(callback) {
	callback(value,oldvalue,property,self)
    })	
}


RemoteObject.prototype.emit = function(tag,data) {
    var self = this
    self.sockets.forEach(function(socket) { socket.emit(tag,data)})
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


RemoteObject.prototype.update = function(obj) {
    var self = this
    for (var property in obj) {
	var filter = self.filter_in[property]
	if (filter) {
	    if (filter == true) { self[property] = obj[property] } else {
		self[property] = filter(obj[property])
		console.log(property,"=",self[property])
		self.save()
	    }

	}
    }
    //console.log(self)
}


module.exports.RemoteObject = RemoteObject
module.exports.Router = Router
