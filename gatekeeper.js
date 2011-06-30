function ArrayRemove (array,entry){
    var index = array.indexOf(entry)
    if (index == -1) { return array }
    
    array.splice(index,1);
    return array;
}

function GateKeeper() {
    this.users = {}
    this.globals = {}
}

function stringuid(uid) {
    return "" + uid
}

GateKeeper.prototype.logon = function(user,socket) {
    var self = this
    uid = stringuid(user._id)
    if (!self.users[uid])  { self.users[uid] = {sockets: [], objects: {} } }

    self.users[uid].sockets.push(socket)
    self.initial_sync(user,socket)
}

GateKeeper.prototype.logoff = function(user,socket) {
    var self = this
    uid = stringuid(user._id)
    console.log("socket for user " + uid + " disconnected")
    self.users[uid].sockets = ArrayRemove(self.users[uid].sockets,socket)
    if (self.users[uid].sockets.length == 0) {
	console.log("logging off user " + uid + " completely")
	delete self.users[uid]
    }
}

GateKeeper.prototype.shareobject = function(objname,obj,user) {
    var self = this
    uid = stringuid(user._id)
    self.users[uid].objects[objname] = obj
    self.subscriptions = {}
    self.sync(objname)
}

GateKeeper.prototype.syncin = function (user,objects) {
    var self = this
    uid = stringuid(user._id)
    console.log("SYNCIN",objects)
    for (var objname in objects) {
	self.syncin_object(user,objname,objects[objname])
    }
}

GateKeeper.prototype.syncin_object = function (user,objname,obj) {
    var self = this
    uid = stringuid(user._id)
    if (obj.shipin) { obj = obj.shipin(obj,user,objname) }
    if (!obj) { return }
    if (self[objname + "_in"])  { obj = self[objname + "_in"](obj,user,objname) }
    if (!obj) { return }

    
    if (!self.users[uid].objects[objname]) { console.log("USER ATTEMPTING TO SYNC UNSHARED OBJECT (" + objname + ") ignoring..." ); return }
    var localobj = self.users[uid].objects[objname]
    var changed = false
    obj.forEach(function(property) {
	if (!equal(obj[property],localobj[property] )) {
	    changed = true
	    var oldval = localobj[property]
	    localobj[property] = obj[property]
	    self.emit(obj[property],obj,oldval,user,objname,property)

	}
    })

    if (changed) {
	self.emit(undefined,obj,undefined,user,objname,"changed")
    }
    
}


GateKeeper.prototype.emit = function (newval,obj,oldval,user,objname,property) {
    var self = this
    uid = stringuid(user._id)
    if (self[uid] && self.subscriptions[objname]) {
	
	if (self.subscriptions[objname][property]) {
	    self.subscriptions[objname][property].forEach(function (callback) { 
		callback(user,currentval,lastval,property,objname)
	    })
	}

	if (self.subscriptions[objname]["*"]) {
	    self.subscriptions[objname]["*"].forEach(function (callback) { 
		callback(user,currentval,lastval,property,objname)
	    })
	}
    }
}

GateKeeper.prototype.subscribe = function (objectname,property,callback) {
    var self = this
    if (!self.subscriptions[objectname]) { self.subscriptions[objectname] = {} }
    if (!self.subscriptions[objectname][property]) { self.subscriptions[objectname][property] = [] }
    self.subscriptions[objectname][property].push(callback)
}

GateKeeper.prototype.syncproperty = function(user,objname,property,obj,socket) {
    var self = this
    var uid = stringuid(user._id)
    
    if (!obj) {
	if (!self.users[uid].objects[objname]) { console.log("ERROR attempting to sync property " + property + " of "  + objname + " for user " + uid + " but object with that name not found."); return}
	obj = self.users[uid].objects[objname]
    }


    if (!obj[property]) { console.log ("object " + objname + " doesn't have property " + property)return false }

    if (self[objname + "_out"])  { obj = self[objname + "_out"]() }
    if (obj.shipout) { obj.shipout(send) } else { send(obj) }


    function send(obj) {
	var syncdata = {}
	syncdata[objname] = {}
	syncdata[objname][property] = obj[property]

	if (socket) { 
	    socket.emit('objectsync',syncdata)
	} else {
	    self.sockets(user).forEach(function(socket) {socket.emit('objectsync',syncdata)})
	}
    }

}


GateKeeper.prototype.sync = function(user,objname,obj,socket) {
    var self = this
    uid = stringuid(user._id)
    if (!obj) {
	if (!self.users[uid].objects[objname]) { console.log("ERROR attempting to sync " + objname + " for user " + uid + " but object with that name not found."); return}

	obj = self.users[uid].objects[objname]
    }

    if (self[objname + "_out"])  { obj = self[objname + "_out"]() }
    if (obj.shipout) { obj.shipout(send) } else { send(obj) }



    function send(obj) {
	var syncdata = {}
	syncdata[objname] = obj

	if (socket) { 
	    socket.emit('objectsync',syncdata)
	} else {
	    self.sockets(user).forEach(function(socket) {socket.emit('objectsync',syncdata)})
	}
    }
}



GateKeeper.prototype.sockets = function(user) {
    var self = this
    uid = stringuid(user._id)
    if (self.users[uid].sockets) { return self.users[uid].sockets } else { return [] }
}


GateKeeper.prototype.user_in(obj,user) {
    
    var newobj = {}
    newobj.name = escape(obj.name)
    newobj.address_withdrawal = escape(obj.address_withdrawal)
    if (obj.password) {
	newobj.password = obj.password
    }

    for (attrname in newobj) { user[attrname] = newobj[attrname]; }
    user.save()
    user.sync()
    return
}


module.exports.GateKeeper = GateKeeper;