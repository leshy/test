
//they can be declared on an object literal
var o = {_name : "Start name",
  writes : 0,
  reads : 0,
  name getter : function () {this.reads++; return this._name;},
  name setter : function (n) {this.writes++; return this._name = n;}
}

//and can be added to extant objects
o.numwrites getter = function() { return this.writes;}
o.numwrites setter = function() {throw "no";}