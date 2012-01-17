
function argtoarray(arg) { ret = []; for (var i in arg) { ret.push(arg[i]) }; return ret }

function mergeobjects() {
    var ret = {}
    argtoarray(arguments).forEach(function(obj) {
	for (var property in obj) { 
	    ret[property] = obj[property]
	}
    })
    return ret
}

function SubscriptionMan() { 
    this.subscriptions = []
}

SubscriptionMan.prototype.subscribe = function(msg,f,name) { 
    this.subscriptions.push({pattern: msg, f: f, name: name})
}

SubscriptionMan.prototype.unsubscribe = function(name) { 
//    this.subscriptions.forEach( ... blaaaa
}

SubscriptionMan.prototype._matches = function(msg) {
    function checkmatch(msg,pattern) {
	for (var property in pattern) {
	    if (msg[property] == undefined) { return false }
	    if (pattern[property] != true) { if (msg[property] != pattern[property]) { return false } }
	}
	return true
    }

    var res = []
    

    this.subscriptions.forEach(function(matcher) {
	var pattern = matcher.pattern
	if (checkmatch(msg,pattern)) { res.push (matcher.f)  }
    })
    return res
}

SubscriptionMan.prototype.event = function(msg) { 	
    this._matches(msg).forEach( function(f) { f(msg) } )
}

function Msg(booleans, hashes) { 
    if (arguments.length == 0) { return {} } 
    var msg = {}
    argtoarray(arguments).forEach( function(arg) { 
	if (typeof(arg) == 'object') { msg = mergeobjects(msg,arg) }
	if (typeof(arg) == 'string') { entry = {}; entry[arg] = true; msg = mergeobjects(msg,entry) }
    })
    return msg
}





//sm = new SubscriptionMan()
//sm.subscribe( Msg('test') , function(message) { console.log("GOT",message) })
//sm.event(Msg('test','lala',{ 'bla': 33 } ))


module.exports.SubscriptionMan = SubscriptionMan

