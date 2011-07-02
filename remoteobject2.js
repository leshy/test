




RemoteObject.prototype.init = function(router,name) {
    var self = this;
    self.router = router
    self.objectname = name
    
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
