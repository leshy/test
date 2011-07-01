
var Robjects = {}

function RemoteObject(name,obj,socket) {
    var self = this
    self.socket = socket
    self.subscriptions = {}
    self.update(obj)
    Robjects[name] = self
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
		self.__defineSetter__(property, function (value) { console.log(name,"SENDING",property,value)  })
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


