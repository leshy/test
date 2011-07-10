var sys = require('sys');
var rbytes = require('rbytes');


function Length(object) {
    return Object.keys(object).length
}


// router 
// {{{

function Router(log) {
    this.l = log

    this.socketuser = {}
    this.usersocket = {}
    
    this.userobject = {}
    this.objectuser = {}

    this.objects = {}
    this.secretuser = {}
}

Router.prototype.login = function(user,socket) { 
    if (!this.usersocket[user]) { this.usersocket[user] = {}; this.l.user(user._id + " " + user.name + " logged in") } else { this.l.user(user._id + " " + user.name + " connected a socket.")}
    this.usersocket[user][socket] = true
    this.secretuser[user.secret] = user
    this.socketuser[socket] = user.toString()
    this.objects[socket] = socket

    
//    console.log(sys.inspect(this))
}

Router.prototype.logout = function(user,socket) { 
    delete this.usersocket[user][socket]
    if (Length(this.usersocket[user]) == 0 ) { 
	this.l.user(user._id + " " + user.name + " logged out.")
	this.objects[user].sleep()
    } else {
	this.l.user(user._id + " " + user.name + " disconnected a socket.")
    }
}

Router.prototype.addowner = function(user, object) { 
    if (!this.userobject[user]) { this.userobject[user] = {} }
    this.userobject[user][object.objectname] = object._id
    if (!this.objectuser[object]) { this.objectuser[object] = {} }
    this.objectuser[object][user] = true
}

Router.prototype.removeowner = function(user, object) { 
    if (this.userobject[user] && this.userobject[user][object.objectname]) { 
	delete this.userobject[user][object.objectname]
	if (Length(this.userobject[user]) == 0) ( delete this.userobject[user] )
    }
    
    if (this.objectuser[object] && this.objectuser[object][user]) { 
	delete this.objectuser[object][user]
	if (Length(this.objectuser[object]) == 0) ( delete this.objectuser[object] )
    }
}


Router.prototype.getSocketsFromUser = function(user) {
    var self = this
    if (self.usersocket[user]) {
	return Object.keys(self.usersocket[user]).map( function(socketid) { return self.objects[socketid] })
    } else { return [] }
}

Router.prototype.getSocketsFromObject = function(object) {
    var self = this
    var sockets = []
    for (var user in self.objectuser[object]) {
	sockets.push.apply(sockets,self.getSocketsFromUser(user))
    }
    
    return sockets.map(function(socketid) { return self.getLiveObject(socketid)})
}


Router.prototype.getLiveObject = function(id) {
    return this.objects[id]
}

Router.prototype.getObjectFromUser = function(user,objectname) {
    var self = this
    if (objectname == 'user') { return user }
    if (self.userobject[user] && self.userobject[user][objectname]) {
	return self.objects[self.userobject[user][objectname]]
    }
    return undefined
}

Router.prototype.getObjectFromSocket = function(socket,objectname) {   
    return this.getObjectFromUser(this.socketuser[socket],objectname) 
}

Router.getObjectFromId = function(objectid) { 
    if (this.objects[objectid]) { 
	return this.objects[objectid]
    } else {
	//querydb
    }
}

Router.removeObject = function(object) {
    delete this.objects[object]
    this.objectuser
}

// }}}

// remoteobject
// {{{

function RemoteObject() { }

RemoteObject.prototype.init = function(router,name) {
    var self = this;
    if (!self._id) { self.generateid() }
    self.router = router
    self.l = router.l
    self.objectname = name
    self.router.objects[self] = self

    if (self.persist) { self.savetimer = undefined }
    
    for (var property in self.filter_out) {
	closure(property,self.filter_out[property])
	function closure(property,filter) {
	    if (typeof(self[property]) == "function") {
		return
	    }

	    //console.log (property, typeof(self[property]))
	    
	    if (!self["_" + property]) { 
		self["_" + property] = self[property]
		self.__defineSetter__(property, function (value) { 
		    self.l.obj(self.objectname + " updating " + property + " = " + value)     
		    var oldvalue = self["_" + property]
		    self["_" + property] = value
		    //if (oldvalue != value) {
			//self.event(property,value,oldvalue)
		    //}
		    self.syncproperty(property)
		})
		self.__defineGetter__(property, function () {  
		    return self["_" + property] 
		})
	    }
	}
    }
}


RemoteObject.prototype.generateid = function() { 
    if (this.id) { this._id = this.id; return }

    if (!this._id) {
	this._id = new Date().getTime() + rbytes.randomBytes(16).toHex()
    }

    this.id = this._id 


}


RemoteObject.prototype.addowner = function(user) {
    this.router.addowner(user,this)
}

RemoteObject.prototype.save = function(obj) {
    var self = this;
    if (self.persist) { clearTimeout(self.savetimer)
			self.savetimer = setTimeout( function() { 
			    if (self.persist) { self.persist()}},10000)}
}


RemoteObject.prototype.checkdeath = function(obj) {
    if (Length(this.sockets() == 0)) {
	if (this.savetimer) { clearTimeout(self.savetimer) }
	if (this.persist) { this.persist() }
    }
}

RemoteObject.prototype.sockets = function() {
    if (this.objectname == 'user') {  return this.router.getSocketsFromUser(this)  }
    return this.router.getSocketsFromObject(this)
}


RemoteObject.prototype.emit = function(tag,values) {
    var sockets = this.sockets()
    sockets.forEach(function(socket) { socket.emit(tag,values) })
}


RemoteObject.prototype.sleep = function(obj) {
    var self = this;
    if (self.persist) { self.persist() }

    if (self.objectname == 'user') {
	delete self.router.usersocket[self]
	delete self.router.secretuser[self.secret]
    }

    delete self.router.objects[self]
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

RemoteObject.prototype.toString = function() { 
    return this._id.toString()
}



RemoteObject.prototype.syncproperty = function(property) {
    var self = this
    
    if (typeof(self.filter_out[property]) == 'function') {
	var value = self.filter_out[property](self[property],self)
    } 
    else if ( self.filter_out[property] == true ) {
	var value = self[property]
    } else {
	var value = self.filter_out[property]
    }

    data = {}
    data[self.objectname] = {}
    data[self.objectname][property] = value
    this.emit('objectsync', JSON.stringify(data) )
    this.save()
}


RemoteObject.prototype.sync = function(socket) {
    var self = this
    var objectname = self.objectname
    var data = { }
    data[objectname] = {}
    for (var property in self.filter_out) {
	var filter = self.filter_out[property]
	var value = undefined
	if (typeof(filter) == 'function') {
	    value = filter(self[property],self)
	} else if (filter == true) {
	    value = self["_" + property]
	} else {
	    value = filter
	}

	data[objectname][property] = (value)
    }
    data = JSON.stringify(data)
//    console.log("EMMITING",data)
    if (!socket) { self.emit('objectsync',data) } else { socket.emit('objectsync',data) }

}


RemoteObject.prototype.update = function(obj) {
    var self = this
    for (var property in obj) {
	var filter = self.filter_in[property]
	if (filter) {
	    if (filter == true) { self[property] = obj[property] } else {
		var r = filter(obj[property])
		if ((r != undefined) && (r != null)) {
		    self[property] = r
		    self.save()
		} else {
		    this.l.obj('property ' + property + ' change rejected by filter function')
		    self.syncproperty(property)
		}
	    }
	}
    }
}

function ArrayRemove (array,entry){
    var index = array.indexOf(entry)
    if (index == -1) { return array }    
    array.splice(index,1);
    return array;
}



function stringuid(uid) {
    return "" + uid
}


// }}}


module.exports.RemoteObject = RemoteObject
module.exports.Router = Router
