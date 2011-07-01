

function ArrayRemove (array,entry){
    var index = array.indexOf(entry)
    if (index == -1) { return array }    
    array.splice(index,1);
    return array;
}



function stringuid(uid) {
    return "" + uid
}



function copyPrototype(descendant, parent) {
    var sConstructor = parent.toString();
    var aMatch = sConstructor.match( /\s*function (.*)\(/ );
    if ( aMatch != null ) { descendant.prototype[aMatch[1]] = parent; }
    for (var m in parent.prototype) {
        descendant.prototype[m] = parent.prototype[m];
    }
};



function make(cls) {
    copyPrototype(cls,RemoteObject)
}


// syncobject na socket od nekog usera ( mapa postoji )
// resolution procedure.. 
// socket -> objekt mapiranje (brise se sa disconnectom)  |
// user -> objekt mapiranje (brise se sa logoffom)        |  - ovo dvoje je ista mapa ?
// global -> objekt mapiranje




function Router() {
    this.users = {}
    this.socketobjects = {}
    this.userobjects = {}
    this.globalobjects = {user : function (user) { return user }}
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



function User(user) {
    this = user
}

user.prototype.filter_in = { name: function(name) { return escape(name) },
			     address_deposit: function(x) { return escape(x) }
			     ping: function(arguments) { return arguments },
			   }

user.prototype.filter_out = { name: true,
			      address_deposit: true 
			    }

var user = new User(user)


function RemoteObject(name,parent) {
    var self = obj
    self.objectname = name
    self.subscriptions = {}
    self.init(obj)
    permissions = {}

}


RemoteObject.prototype.addowner = function(owner) {
    
}


RemoteObject.prototype.sync = function(obj) {
    var self = this
    var data = {}
    self.filter_out.forEach(function (property) {
	var filter = self.filter_out[property]
	var value = undefined

	if typeOf(filter) == 'function' {
	    value = filter(self["_" + property])
	} else if (filter == true) {
	    value = self["_" + property]
	} else {
	    value = filter
	}

	data[property] = (value)
    })

    data = {self.objectname : data}
    self.emit('objectsync',data)

}

RemoteObject.prototype.sockets = function () {
    return sockets
}

RemoteObject.prototype.emit(tag,data) {
    var self = this
    self.sockets.forEach(function(socket) { socket.emit(tag,data)})
}

RemoteObject.prototype.syncproperty(function,property,value) {
    var value = self.filter_out[property](value)
    this.emit('syncobject',{ self.objectname, { property: value }} )
}



RemoteObject.prototype.init = function() {
    var self = this;
    
    for (var property in self.permissions_out) {

	closure(property,self.permissions_out[property])
	function closure(property,filter) {
	    if (typeOf(self[property]) == "function") {
		return
	    }

	    var value = self[property]
	    self.__defineSetter__(property, function (value) { self["_" + property] = value; self.syncproperty(property,value);  console.log(self.objectname,"SENDING",property,value) })
	    self.__defineGetter__(property, function () {  return self["_" + property] })
	    
	    
	}
    }
    
}



RemoteObject.prototype.update = function(obj) {
    var self = this
    for (var property in obj) {

	closure(property,obj[property])

	function closure(property,value) {
	    if (value = "function") {
		self[property] = function() { console.log ("calling remote function " + property) }
		return
	    }

	    if (!self["_" + property]) { 
		self.__defineSetter__(property, function (value) { console.log(self.objectname,"SENDING",property,value)  })
		self.__defineGetter__(property, function () { console.log("getting", property); return self["_" + property] })
	    } else {
		if (self["_" + property] == value ) { return }
	    }
	    
	    var oldvalue = self["_" + property]
	    self["_" + property] = value
	    
	    if (self.subscriptions[property]) {self.subscriptions[property].forEach( function(callback) { callback(value,oldvalue,property) })}
	    if (self.subscriptions["*"]) {self.subscriptions["*"].forEach( function(callback) { callback(value,oldvalue,property) })}
	}
    }
}

RemoteObject.prototype.subscribe = function(property,callback) {
    var self = this
    if (!self.subscriptions[property]) { self.subscriptions[property] = [] }
    self.subscriptions[property].push(callback)
}


module.exports.make = make
module.exports.RemoteObject = RemoteObject
module.exports.Router = router




/*
a = new RemoteObject("testobj",{name: 333, bla: "ivan", testf: "function" })

//a.name = "novo ime"

console.log(a)
console.log(a.bla)
console.log(a.name)


a.subscribe("name",function ( value ) { console.log("CALLBACK NAME",value) })


a.update( {name: 777 })
console.log(a.name)


console.log(JSON.stringify(a))


a.testf()


*/