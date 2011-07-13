var sys = require('sys');
var fs = require('fs');

function Logger() {
    this.outputs = []
}

Logger.prototype.buildlogentry = function(array) {
    var ret = {}
    array.reverse()
//    console.log(array)
    if (array.length > 1) {
	ret.area = array.pop()
    }    

    if (array.length > 1) {
	ret.loglevel = array.pop()
    }


    if (array.length >= 1) {
	ret.message = array.pop()
    }

    var payload = {}
    for (var entry in array) {
//	console.log(typeof(array[entry]),sys.inspect(entry))
	if (typeof(array[entry]) == 'object') {
	    for (var subentry in array[entry]) {
		payload[subentry] = array[entry][subentry]
	    }
	} else {
	    payload[array[entry]] = true
	}
    }

    ret.payload = payload
    ret.time = new Date().getTime() 

    return ret

}

Logger.prototype.log = function() {
    var array = []
    for (var x in arguments) {
	array.push(arguments[x])
    }
    var logentry = this.buildlogentry(array)


    this.outputs.forEach( function(output) {
	output.push(logentry)
    })
}


function ConsoleOutput() {
    this.area = {}
    this.area['default'] = 'green'

    this.loglevel = {}
    this.loglevel['default'] = 'cyan'
    this.loglevel['info'] = 'green'
    
}

ConsoleOutput.prototype.push = function(logentry) {
    var self = this    
    var out = new Date(logentry.time).toUTCString() +  " "


    function colouredpart(name,logentry) {
	var out = "- "
	if (logentry[name]) { 
	    if (!self[name][logentry[name]]) { var colour = self.colours[self[name].default] } else { var colour = self.colours[self[name][logentry[name]]] }
	    
	    out += colour + logentry[name] + self.colours.reset + " "
	}
	return out
    }

    out += colouredpart('area',logentry)
    out += colouredpart('loglevel',logentry)
    out += "- "
    if (logentry.message) {
	out += logentry.message
    }

    if (Object.keys(logentry.payload).length > 0) {
	out += " - " +  sys.inspect(logentry.payload)
    }
    
    console.log(out)
}



ConsoleOutput.prototype.colours = {
    reset:   "\x1B[0m",
    grey:    "\x1B[0;30m",
    red:     "\x1B[0;31m",
    green:   "\x1B[0;32m",
    yellow:  "\x1B[0;33m",
    blue:    "\x1B[0;34m",
    magenta: "\x1B[0;35m",
    cyan:    "\x1B[0;36m",
    white:   "\x1B[0;37m",
    boldgrey: "\x1B[1;30m",
    boldred:     "\x1B[1;31m",
    boldgreen:   "\x1B[1;32m",
    boldyellow:  "\x1B[1;33m",
    boldblue:    "\x1B[1;34m",
    boldmagenta: "\x1B[1;35m",
    boldcyan:    "\x1B[1;36m",
    boldwhite:   "\x1B[1;37m",
}


function FileOutput(file) {
    this.file = file
    this.interestingparts = ['area','loglevel']
}


FileOutput.prototype.push = function(logentry) {
    var self = this    
    var out = new Date(logentry.time).toUTCString() +  " - "

    out += logentry.area
    out += " - "

    out += logentry.loglevel
    out += " - "

    if (logentry.message) {
	out += logentry.message
    }

    if (Object.keys(logentry.payload).length > 0) {
	out += " - " +  sys.inspect(logentry.payload)
    }

    out += "\n"

    fs.open(this.file, 'a', 777, function( e, id ) {
	fs.write( id, out, null, 'utf8', function(){
	    fs.close(id, function(){})
	})
    })
}


function MongoOutput(collection) {
    this.collection = collection
}

MongoOutput.prototype.push = function(logentry) {
    this.collection.insert(logentry)
}


module.exports.Logger = Logger
module.exports.ConsoleOutput = ConsoleOutput
module.exports.FileOutput = FileOutput
module.exports.MongoOutput = MongoOutput


