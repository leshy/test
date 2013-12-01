// settings
// {{{

// require
//var hashlib = require('hashlib');
var sechash = require('sechash');
var sys = require('util');
var mongo = require('mongodb');
var express = require('express');
var mongostore = require('connect-mongo');
var bitcoin = require('bitcoin');
var BSON = mongo.BSONPure
var https = require('https');
var http = require('http');
var querystring = require('querystring');
var tls = require('tls');
var socketio = require('socket.io')
var irc = require('irc')

var remoteobject = require('./remoteobject2.js')
var Logger = require('./logger.js');
var uuid = require('./uuid.js');
var async = require('async')

var BinaryParser = mongo.BinaryParser

var _ = require('underscore')

//console.log(IdAtTime(Date.now()))

var settings = {}

settings.staging = false
if (process.argv.length > 2) {
    if (process.argv[2]  == "staging" ) {
	settings.staging = true
    }
}


settings.dbhost = "localhost"
settings.dbport = 27017
settings.appname = "MineField - BitcoinLab"
settings.session_secret = "nA2xqeuW9ODQuQ5BnKe4W2WBWBx4ukE7+vvgtJ9"
settings.admin_secret = generateid()

settings.availiablebets = [0,0.0001, 0.0005, 0.001,0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0 ]

if (!settings.staging) { settings.hostname = "minefield.bitcoinlab.org" } else { settings.hostname = "127.0.0.1" }
if (!settings.staging) { settings.confirmations = 5 } else { settings.confirmations = 1 }
if (!settings.staging) { settings.httpport = 45284 } else { settings.httpport = 45285 }
if (!settings.staging) { settings.dbname = "minefield" } else { settings.dbname = "bitcoin1-staging" }


var patch = {}
var mode;

patch.test = {
    httpport: 45285
}

if ((process.argv.length > 1) && (patch[mode = process.argv[2]])) {
    console.log("running in custom", mode,"mode.");
    _.extend(settings, patch[mode])
}

var myCustomLevels = {
    levels: {
	debug: 0,
	info: 1,
	payment: 2,
	http: 3,
	db: 4, 
	obj: 5,
	user: 6

    },
    colors: {
	payment: 'blue',
	http: 'yellow',
	db: 'yellow',
	obj: 'red',
	user: 'green'
    }
};

var l = new Logger.Logger()

l.outputs.push(new Logger.ConsoleOutput())
l.outputs.push(new Logger.FileOutput('main.log'))

l.log('general','info','starting...');
if (settings.staging) { l.log('general','important','this is a staging instance') }


var router = new remoteobject.Router(l)



// init

var app = express.createServer();
io = socketio.listen(app);

var db = new mongo.Db(settings.dbname,new mongo.Server(settings.dbhost,settings.dbport, {}), {})
var sockets = {};

io.configure(function() {
    io.set('log level', 1)
})

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: settings.session_secret,
			      key: 's',
			      store: new mongostore({ db: settings.dbname }),
			      cookie: { maxAge: 60000 * 60},
			    }));
    app.use(app.router);
    app.use(express.static(__dirname + '/static', { maxAge: 1000 * 60 * 60 }));
})


db.open( function (err) {
    if (err) {
	l.log('general','info',"mongodb connection failed: " + err.stack );
	return
    }
    l.log('general','info',"Connected to mongodb server at " + settings.dbhost + ":" + settings.dbport );
    db.collection("users", function (err,collection) {
	l.log('general','info',"mongo - User collection open")
	settings.collection_users = collection
    })

    db.collection("addresses", function (err,collection) {
	l.log('general','info',"mongo - Addresses collection open")
	settings.collection_addresses = collection
    })

    db.collection("transactions", function (err,collection) {
	l.log('general','info',"mongo - Transactions collection open")
	settings.collection_transactions = collection
    })


    db.collection("log", function (err,collection) {
	l.log('general','info',"mongo - Log collection open")
	settings.collection_log = collection
	l.outputs.push(new Logger.MongoOutput(collection))	
    })


    db.collection("logstats", function (err,collection) {
	l.log('general','info',"mongo - Stats collection open")
	settings.collection_stats = collection
	var mongostats = new Logger.MongoStats(collection, settings.statsextractors, 7.5 * 60 * 1000, 60 * 60 * 24 * 1000 )
	settings.mongostats = mongostats
	l.outputs.push(mongostats)
    })
})

//var btc = new bitcoin.Client('localhost', 8332, 'lesh', 'pass');
//var btc = new bitcoin.Client('beefcake', 8332, 'minefield', 'wQ6qSkBftbj5O33+wVVE');
var btc = new bitcoin.Client('localhost', 8332, 'minefield', 'wQ6qSkBftbj5O33+wVVE');
// }}}

// functions
// {{{


function Length(object) {
    return Object.keys(object).length
}

function generateid() { 
    return uuid.uuid(16)
    //return new Date().getTime() + rbytes.randomBytes(16).toHex()
}

function stickid(object) {
    object._id = generateid()
}

function argtoarray(arg) { ret = []; for (var i in arg) { ret.push(arg[i]) }; return ret }

function mergeObjects() {
    var ret = {}
    argtoarray(arguments).forEach(function(obj) {
	for (var property in obj) { 
	    ret[property] = obj[property]
	}
    })
    return ret
}

socketio.Socket.prototype.toString = function() { return this._id }


function systemcash(callback) {
    btc.getBalance(function(err, balance) {
	if (err) return console.log(err);
	callback(balance)
    })
}

function usercash(callback) {
    var time = new Date().getTime() - (24 * 3 * 60 * 60 * 1000)
    settings.collection_users.find({ "cash" : { "$gt" : 100000 }, "blacklist" : undefined,  "lastaccess" : { "$gt" : time  } },{ "cash" : 1 }, 
				   function(err,cursor) {

				       var totalcash = 0
				       
				       cursor.each(
					   function(err, item) {
					       if(err != null) { callback(totalcash) }
					       if (item != null) {
						   totalcash += parseInt(item.cash)
					       } else {
						   callback(totalcash);
					       }
					   })
					   }
				  )
}

function log_cash_snapshot() {
    usercash(function(usercash) {
	systemcash(function(systemcash) {
	    l.log("snapshot","cash","users cash is " + moneyOut(usercash) + " BTC and system cash is " + systemcash + " BTC",{usercash: usercash, systemcash: moneyIn(systemcash) })
	})
    })
    setTimeout(log_cash_snapshot, 60 * 7.5 * 1000)
}


function equal(object1, object2) {
    if (!object2) { return false }

    if ((typeof(object1) != 'object') || (typeof(object2) != 'object' )) {
	return (object1 == object2)
    }
    
    if (object1.length != object2.length) { return false }
    
    for (var property in object1) { 

	if (object1[property] != object2[property]) { return false }
    }

    return true   
}


function copyProps (object, props) {
    var outobject = {}
    props.forEach(function(propname) { 
	outobject[propname] = object[propname]
    })
    return outobject
}

function roundMoney(money) {
//    return Math.floor(parseFloat(money) * 1000) / 1000
    return Math.floor(money)
}

function moneyIn(money) {
    return Math.floor(money * 1e8)
}

function moneyOutFull(money) {
	money = String(money)
    while (money.length < 9) {
        money = "0" + money
    }
    
    cutpoint = money.length - 8
    money = money.substr(0,cutpoint) + '.' + money.substr(cutpoint)

    while (money[money.length-1] == '0') {
        money = money.substr(0,money.length - 1)
    }

    if (money[money.length-1] == '.') {
        money = money.substr(0,money.length - 1)
    }

    return money
}

function moneyOut(money) {
    return Math.floor(money / 1e4) / 10000
}

function jsonmsg(message,responsecode) {
    return JSON.stringify({'message': message, 'responsecode': responsecode})
}

function sendMoney (address,amount,user,callback,callbackerr) {
    amount = moneyOut(amount)
    console.log("sending",address,amount)
    btc.sendToAddress ( address,amount, "bitcoin minefield payout","user", function(err,paymentid) { 
	if (paymentid) {
	    l.log("payment","sent","SENT " + amount + " BTC to" + address + " success - transaction id " + paymentid,{ address: address, amount: amount, uid: user._id})
	    callback(paymentid)
	} else {
	    l.log("payment","error","",{err: err, address: address, amount: amount, uid: user._id })
	    if (callbackerr) { callbackerr(err) }
	}
    })
}

function spawnUser(aditionaldata,callback) {
    l.log("db","debug",'creating new user')
    spawnUserData(spawnSecret(), aditionaldata, function(user) { 
	if (callback) { callback(user) } 
    })
}

function RemoveFunctions(object) {
    var res = {}
    for (p in object) {
	if (typeof(object[p]) != 'function') { res[p] = object[p] }
    }
    return res
}

function ArrayContains (array,entry) {
    for (var key in array) {
	if (array[key] == entry) { return true }
    }
    return false
}

function ArrayRemove (array,entry){
    var index = array.indexOf(entry)
    if (index == -1) { return array }    
    array.splice(index,1);
    return array;
}


function mybitcoinparse(data) {
    function trim(data) {
	return data.replace(/^\s+|\s+$/g, '')
    }
    parsed = {}
    data = data.split("\n")
    //console.log(sys.inspect(data))
    for (var line in data) {
	line = data[line].split(":")
	if (line.length > 1) {
	    parsed[trim(line[0])] = trim(line[1])
	}
    }
    return parsed
}

function mybitcoin(file,callback,postdata) {
    if (!postdata) { var postdata = {} }
    postdata.sci_auto_key = "2a49d1185989fdda4851b8b76b96ada8"
    postdata.username = "DAp39A"
    postdata = querystring.stringify(postdata)
    
    //console.log(postdata)
    var headers = {
	'Host': 'www.mybitcoin.com',
	'Content-Type': 'application/x-www-form-urlencoded',
	'Content-Length': postdata.length,
	'User-Agent': 'MBC SCI Client for PHP v1.2'
    };


    var databuffer = ""

    var httpreq = https.request({ host: 'www.mybitcoin.com', 
				  port: 443,
				  path: '/sci/' + file + '.php',
				  method: 'POST',
				  headers : headers
				}, 
				function(httpres) {
				    httpres.setEncoding('ascii')
				    //console.log( "mybitcoin " + httpres.statusCode + " " + file)
				    httpres.on('data',function(d) {
					databuffer = databuffer + d
				    })
				    httpres.on('end',function() {
					if (callback) { callback(mybitcoinparse(databuffer)) }
				    })

				})


    httpreq.write(postdata);
    httpreq.end()
}


function randomString(bits){
    var chars,rand,i,ret
    chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+'
    ret=''
    while(bits > 0){
	rand=Math.floor(Math.random()*0x100000000)
	for(i=26; i>0 && bits>0; i-=6, bits-=6) ret+=chars[0x3F & rand >>> i]}
    return ret
}

function spawnSecret() {
    return uuid.uuid(16)
}


function spawnReferalUrl() {
    return uuid.uuid(16)
}


function spawnUserData(secret,aditionaldata,callback,callbackerr) {
    var time = new Date().getTime()

    var data = {
	creationdate: time,
	lastaccess: time,
	secret: secret,
	referalurl: spawnReferalUrl(),
	referalearnings: 0,
	referalcount: 0,
	address_deposit_used: [],
	address_deposit: [],
//	transaction_history: [],
	address_withdrawal: undefined,
	cash: 0,
	played: false,
	payed: false,
	loggedin: false,
	useragent: undefined,
	ips: []
    }

    data = mergeObjects(data,aditionaldata)

    settings.collection_users.insert(data, function(err,doc) {
	if (err) { if(callbackerr) { callbackerr(); return }}
	console.log(doc)
	if (callback) { callback(doc[0]) }
    })
}

/*
  DbProxy.prototype.ship_out = function() {
  var self = this
  collection.findOne(query,function(err,data) { 
  
  })
  }


  DbProxy.prototype.ship_in = function(data) {
  var self = this

  }

*/

// }}}



// minefield
// {{{

function MineField(size,bet,parent) {
    var self = this
    self.bet = bet
    self.userid = parent._id
    


    self.size = size
    self.win = bet

    self.openfields = 0
    self.calculatemulti()
    parent.cash = roundMoney(parent.cash - bet)

    self.generateminefield(size) 

    self.crypted = JSON.stringify(self.minefield) + " " + uuid.uuid(16)

//    self.hash = hashlib.sha256(self.crypted)
    self.hash = sechash.basicHash('sha256', self.crypted);
    self.done = false
    self.init(router,'minefield')
}

MineField.prototype = new remoteobject.RemoteObject()

MineField.prototype.cleanup = function() {
    var self = this
//    console.log("MINEFIELD CLEANUP")
    //    if (self.bet != 0) { }
    console.log('applying minefield changes!, winnings',this.win)
    if (self.win > 0) {
	getUserById(self.userid,function(user) {
	    console.log('current cash',user.cash)
	    user.cash = roundMoney(user._cash + self.win)
	})
	
    }
}

MineField.prototype.calculatemulti = function() {
    var chance = 100 - (this.size / ((25 - this.openfields) / 100))
    var win = (90 / chance)
    this.multi = Math.round(parseFloat(win) * 100) / 100
}


MineField.prototype.blacklistowner = function() { 
    var self = this
    getUserById(self.userid,function(user) { 
	if (!user.blacklist) {
	    user.blacklist = true
	    l.log('blacklist','add',"user " + self.userid + " added to blacklist due to minefield doubleopen cheat" )
	user.save()
	}
    })
}

MineField.prototype.step = function(callback,coords) {
    var self = this
    if(typeof(coords) != 'object') { return }
//    if(self.minefield[coords[0]][coords[1]] > 1) { self.blacklistowner() }
    if(self.minefield[coords[0]][coords[1]] > 1) { return }
    if((coords[0] > 4) || (coords[0] < 0)) { return }
    if((coords[1] > 4) || (coords[1] < 0)) { return }

    self.minefield[coords[0]][coords[1]] = self.minefield[coords[0]][coords[1]] +  2
    
    if (self.minefield[coords[0]][coords[1]]  == 3) {
	getUserById(self.userid,function(user) { 
	    l.log('minefield','loss',"game end. user " + self.userid + " lost a game (" + moneyOut(self.bet) + " BTC) balance: " + moneyOut(user.cash) + " BTC",{ game: 'minefield', win: false , uid: self.userid, bet: self.bet, balance: user.cash })
	    if ((self.bet != 0) && (user.parent)) { 
		var award = (self.bet / 100) * 10
        //l.log('minefield','awardsurpressed', user.parent + " " + award)
		getUserById(user.parent,function(parent) {
		    parent.cash += award
		    parent.referalearnings += award
		})
	    }
	})
	
	self.done = true
	self.win = 0
	self.sync()
    } else {
        if (self.done) { return }
	l.log('minefield','pass',"user " + self.userid + " pass, (" + moneyOut(self.win) + " BTC from bet of " + moneyOut(self.bet) + " BTC)",{ uid: self.userid, bet: self.bet, win: self.win })
	self.win = self.win * self.multi
	self.openfields += 1;
	self.calculatemulti()
	self.syncpush('minefield')
	self.syncpush('win')
	self.syncpush('multi')
	self.syncflush()
    }
}


MineField.prototype.payout = function(callback) {
    var self = this
    if (!self.done) {
	self.done = true
	getUserById(self.userid,function(user) { 
	    user.cash = roundMoney(user.cash + self.win) 
	    l.log('minefield','payout',"game end. user " + self.userid + " payout (" + moneyOut(self.win) + " BTC from bet of " + moneyOut(self.bet) + " BTC) balance: " + moneyOut(user.cash) + " BTC",{ game: 'minefield', uid: self.userid, bet: self.bet, win: self.win, balance: user.cash })
	})
	self.win = 0
	self.syncpush('minefield')
	self.syncpush('crypted')
	self.syncflush()
    }
}


MineField.prototype.generateminefield = function(minenum) {
//    console.log("generating minefield of size",minenum,callback)
    if (!minenum) { minenum = 10 }
    function randomboolean() {
	return (Math.random() > 0.5)
    }

    function randomrange(num) {
	return Math.floor(Math.random() * num)
    }

    function rarray(len,rndfn) {
	var a = []
	for (var i = 0 ; i <len;i++) { a.push(rndfn())}
	return a
    }
    function r2darray(len,rndfn) {
	return rarray(len,function() { return rarray(len,rndfn) })
    }

    var cnt = -1
    function counter() { cnt++; return cnt }

    
    var empty = rarray(25,counter)
    var mines = rarray(25,function() { return 0 } )

    
    for (var i = 0; i < minenum; i++) { 
	var num = randomrange(empty.length)
	mines[empty[num]] = 1
	empty.splice(num,1)
    }
    this.minefield = r2darray(5,function() { var a = mines.pop(); return a } )
    return this.minefield
}


MineField.prototype.filter_in = { step: 'function',
				  payout: 'function'
				}


MineField.prototype.filter_out = { minefield : 
				   function(minefield,self) {
				       o = []
				       minefield.forEach(function(row) {
					   
					   var rowout = []					   
					   row.forEach(function(block) {

					       if (!self.done) {
						   if (block < 2) {
						       rowout.push(-1)
						   } else { 
						       rowout.push(block)
						   }
					       } else {
						   rowout.push(block);
						   /*
						     if (block < 2) {
						     rowout.push(block)
						     } else { 
						     rowout.push(block - 2) 
						     }
						   */
					       }
					   })
					   o.push(rowout)

				       })				       
				       return o
				   },
				   multi: true,
				   win: function(win) { return moneyOut(win) },
				   size : true,
				   done : true,
				   hash: true,
				   crypted: function(crypted,self) { if (!self.done) { return "hidden" } else { return crypted }
								   },
				   step: 'function',
				   payout: 'function',
				 }



// }}}

// user
// {{{


function adminUser() {
    this.objectname = 'user'
    this._id = 'adminuser'
    this.logline = 'empty'
    this.name = "admin user"
    this.init(router,'user')
    this.balance = 0
    this.balanceusd = 0
    this.test = 0
    this.refreshbalance()
    this.usdvalue = 0
    var self = this
    this.getusdvalue(function(value) { console.log('usdvalue',value); self.usdvalue = value })

//    this.refreshtimer = setTimeout(this.refreshbalance,2000)
}

adminUser.prototype = new remoteobject.RemoteObject()
adminUser.prototype.filter_in = { refreshbalance : function(arg) { return arg } }
adminUser.prototype.filter_out = { logline : true, 
				                   balance : true,
                                   usdvalue : true,
				                   test : true,
				                   refreshbalance : 'function',
				                   getlogstats: 'function' 
				                 }

adminUser.prototype.sleep = function() {
    clearTimeout(this.refreshtimer)
}


adminUser.prototype.getusdvalue = function(callback) {

    var options = {
        host: 'bitcoincharts.com',
        path: '/t/weighted_prices.json',
        method: 'GET'
    };
    
    var req = http.request(options, function(res) {
        res.on('data', function(d) {
            try {
                callback(JSON.parse(d).USD['24h'])
            } catch(err) {
                callback(0)
            }
        });
    });
    req.end();

    req.on('error', function(e) {
        console.error(e);
        callback(0)
    });
}

adminUser.prototype.refreshbalance = function() {
    var self = this;
    btc.getBalance(function(err, balance) {
	    if (err) { return console.log(err) };
	    self.balance = balance
	    self.refreshtimer = setTimeout(function() {self.refreshbalance.apply(self)},10000)
    })
}


adminUser.prototype.getlogstats = function(callback,resolution,timefrom,timeto) {
    settings.collection_stats.find({ time : {$gt : timefrom, $lt : timeto}, res: resolution },function(err,cursor) {
	cursor.toArray(function(err,data) {
	    callback(data)
	})
    })
}

function LogRange(from,to,callback) {

    if (!from) { from = 0}
    if (!to) { to = Date.now() }

    function IdAtTime(time) {
	function tohexstring(binary) {
	    var hexString = ''
	    , number
	    , value;

	    for (var index = 0, len = binary.length; index < len; index++) {
		value = BinaryParser.toByte(binary.substr(index, 1));
		number = value <= 15
		    ? '0' + value.toString(16)
		    : value.toString(16);
		hexString = hexString + number;
	    }
	    return hexString;
	}

	var unixTime = parseInt(time/1000, 10);
	var time4Bytes = BinaryParser.encodeInt(unixTime, 32, true, true);
	var machine3Bytes = BinaryParser.encodeInt(0, 24, false);
	var pid2Bytes = BinaryParser.fromShort(0);
	var index3Bytes = BinaryParser.encodeInt(0, 24, false, true);
	return new BSON.ObjectID(tohexstring(time4Bytes + machine3Bytes + pid2Bytes + index3Bytes))
    }

//    settings.collection_log.find({_id : [ {$gt : IdAtTime(from)}, {$lt : IdAtTime(to)} ] }, function(err,cursor) { if (!err) { callback(cursor) } else { console.log(err) } })

    settings.collection_log.find({}, function(err,cursor) { if (!err) { callback(cursor) } else { console.log(err) } })
}



function getCashLog(from,to,slicesize,callback) {
    LogRange(from,to,function(cursor) {
	data = {}
	
	function itembucket(item) {
	    var itemtime = item._id.generationTime
	    var itembucket = itemtime - (itemtime % slicesize)
	    var itembucket = new Date(itembucket)
	    if (!data[itembucket]) { 
		data[itembucket] = { pay_in : 0, pay_out: 0, httprequests : 0, cashplays : 0, nocashplays: 0 , win : 0, loss : 0, plays : 0 }
	    }
	    return data[itembucket]
	}
	
	cursor.each(function(err, item) {
	    if(err != null) { console.log("ERR",err); callback(data); return }
	    if (item != null) {

		if ((item.area == "http") && (item.loglevel == "request")) {
		    bucket = itembucket(item)
		    bucket.httprequests += 1
		}

		if ((item.area == "minefield") && (item.loglevel == "loss")) {
		    bucket = itembucket(item)
		    if (item.payload.bet != 0) {
			bucket.loss = bucket.loss + item.payload.bet
			bucket.cashplays += 1;
		    } else {
			bucket.nocashplays += 1;
		    }
		}

		if ((item.area == "minefield") && (item.loglevel == "payout")) {
		    bucket = itembucket(item)
		    if (item.payload.win > 0) {
			bucket.cashplays += 1;		    
			bucket.win = bucket.win + item.payload.win - item.payload.bet
		    } else {
			bucket.nocashplays += 1
		    }
		}

		if ((item.area == "payment") && (item.loglevel == "received")) {
		    bucket = itembucket(item) 
		    bucket.pay_in = bucket.pay_in + item.payload.amount
		}

		if ((item.area == "payment") && (item.loglevel == "sent")) {
		    bucket = itembucket(item) 
		    bucket.pay_out = bucket.pay_out + item.payload.amount
		}




		
	    } else {
		console.log("NULL")
		callback(data)
		return
	    }
	})
})
}
	    


//ParseLogs(null,null,600, { 'win': { selector: ['minefield','payout'], data : function(entry) { return entry.win}},
//			   'loss': { selector: ['minefield','loss'], data : function(entry) { return entry.bet}},
//			   'hits': { selector: ['http','request'], data : function(entry) { return 1}}
//			 })



function ParseLogs(from,to,slicesize,datapoints,callback) {        
    LogRange(from,to,function(cursor) {
	data = {}

	cursor.each(function(err, item) {
	    if(err != null) { callback(data); return }
	    if (item != null) {
		
		var itemtime = item._id.generationTime		
		var itembucket = itemtime - Math.round(itemtime % slicesize)
//		if data[


	    } else {
		callback(data)
		return
	    }
	})
    })
}



function User(user) {
    var self = this
    self.objectname = 'user'
    self.lasttransaction = 0
    for (entry in user) {
	self[entry] = user[entry]
    }
    if (!self.name) { self.name = "user-" + this._id }

    if (!self.referalurl) { self.referalurl = spawnReferalUrl(); self.referalcount = 0; self.referalearnings = 0 }

    self.init(router,'user')
    //self.subscribe('*',function() { self.save() })
}

User.prototype = new remoteobject.RemoteObject()


User.prototype.newminefield = function(callback,size,bet) {
    var self = this
    setTimeout( function () {
        if (!bet) { bet = 0 }
        if (bet.constructor != Number) { bet = 0 }
        if (!ArrayContains(settings.availiablebets,bet)) { l.log("hackattempt","invalidbet", "invalid bet"); return }
        if (size.constructor != Number) { size = 10 }
        if (size < 3) { size =  10 }
        if (size > 24) { size =  10 }
        if (!size) { size =  10 }

        bet = moneyIn(bet)
        if (!size) { console.log('err, size not set'); return }
        if (bet.constructor != Number) { console.log('err, bet not set'); return }
        if (bet > self.cash) { self.message("not enough<br><center><img width='40px' src='/img/bitcoin2.png'></center>"); return }
        minefield = new MineField(size,bet,self)
        minefield.addowner(self)
        minefield.sync()
    },750)
}


User.prototype.listTransactions = function(callback) { 
    var self = this;
    settings.collection_transactions.find({owner: self._id},function(err,cursor) {
	cursor.toArray(function(err,data) {
//	    console.log(data)
	    callback(data.reverse())
	})
    })
}

//name: function(name) { if (name) { if (name) { return escape(name) } else { return null } } },
User.prototype.filter_in = { name: function(name,self) { settings.collection_users.findOne( { name: name }, 
										       function(err,doc) {
											   if (doc) {
											       if (String(doc._id) != String(self._id)) {
												   self.message ("this username is already taken")
												   l.log("user","namechange","user " + self.name  + " failed while trying to change name to " + name, { fail: true, renamefrom: self.name, renameto: name})
												   self.syncproperty('name')
											       }
											   } else {
											       if (!name) {  
												   self.syncproperty('name')
												   self.message("unable to set name to nothing")
												   return null 
											       }
											       l.log("user","namechange","user " + self.name  + " changed name to " + name, { fail: false, renamefrom: self.name, renameto: name})
											       self.name = name
											   }
										       })
							 return null
						       },

			     address_deposit: function(res) { return escape(res) },
			     ping: function(arg) { return arg },
			   }



User.prototype.filter_out = { name: true,
			      cash: true,
			      address_deposit: true ,
			      address_withdrawal: true ,
			      lasttransaction: true,
			      newminefield: 'function',
			      sendMoney: 'function',
			      listTransactions: 'function',
			      generatedepositaddr: 'function',
			      referalcount: true,
			      referalearnings: function(referalearnings) { return moneyOut(referalearnings) }
			    }

User.prototype.filter_save = { name: true,
			       creationdate: true,
			       lastaccess: true,
			       secret: true,
			       address_deposit_used: true,
			       address_deposit: true,
			       address_withdrawal: true,
			       cash: true,
			       blacklist: true,
			       referalurl: true,
			       referalcount: true,
			       referalearnings: true,
			       parent: true,
			       played: true,
			       payed: true,
			       loggedin: true,
			       useragent: true,
			       ip: true,
                   tblacklist: true
			     }


User.prototype.shareobject = function(object) {
    object.addowner(this)
}



User.prototype.sockets = function() {
    return this.router.getSocketsFromUser(this)
}

User.prototype.persist = function(callback) {
    var self = this
    l.log("object","debug",'persisting user object ' + self._id + " " + self.name)
    var data = self.getSaveData()
    settings.collection_users.update({'_id' : self._id}, data, function (err,r) {
	if (err) { console.log("ERROR", sys.inspect(err)); return }
	if(callback) { console.log("SAVED."); callback() }
    })
}

User.prototype.message = function(message) { 
    l.log("user","message",message)
    this.emit('msg',JSON.stringify({message: message }))
}

User.prototype.receiveMoney = function(id,time,from,amount) {
    self = this
//    console.log(self)
    amount = moneyIn(amount)
    self.cash = self.cash + amount

//    self.transaction_history.unshift({ transactionid: id, deposit: true, time: time, other_party: from, amount: amount, balance: self.cash })
    self.syncpush('cash')
    self.syncpush('address_deposit')
//    self.syncpush('transaction_history')
    self.syncflush()
    self.save()
    //self.sync()
    self.message("payment received")
    l.log("payment","received","RECEIVED for user " + self._id  + " from " + from + " " + moneyOutFull(amount) + " BTC users cash is now " + moneyOutFull(self.cash) + " BTC", { uid: self._id, amount: amount, balance: self.cash, from: from })
    //console.log(self)
}

User.prototype.transactions_confirmed = function(callback) {
    var self = this
    settings.collection_transactions.find({owner: self._id},function(err,cursor) {
	cursor.toArray(function(err,data) {
	    if (!data) { callback(false); return }

	    for (var i in data) { 
		if (!data[i].confirmed) { 
		    callback(false)
		    return
		}
	    }
	    
	    callback(true)
	})
    })
}

User.prototype.sendMoney = function(callback,address,amount,callbackerr) {
    self = this
//    l.log("payment","attempt",amount + " and user has ",self.cash,"userid",self._id)
    if (!amount) { return }

    //amount = moneyIn(amount)
    //console.log(amount)

    if (amount < 1000) { self.message("amount too small"); return }
    
    self.transactions_confirmed(function(confirmed) {
	if (!confirmed) { self.message("transactions unconfirmed"); return }
        
        
	if ((self.cash.constructor == Number) && (self.cash - amount) >= 0) {

	var oldcash = self.cash
	self.cash -= amount
	self.cash = Math.round(self.cash * 1000) / 1000
	self.save()

	if (self.blacklist == true) { 
	    l.log('blacklist','sendmoney',"user " + self._id + " tryed to send some money, but I stopped him.", { amount: amount })
	    self.message("BTC Sent.")	    
	    return 
	}


	sendMoney(address,amount,self,
		  function(transactionid) { 
		      btc.getTransaction(transactionid,function(err,transaction) {
			  function fixData(trans) {
			      for (var detail in trans.details[0]) {
				  console.log(detail)
				  trans[detail] = trans.details[0][detail]
			      }   
			      delete trans['details']
			      return trans
			  }

			  transaction = fixData(transaction)
			  transaction = importTransaction(transaction)
			  transaction.confirmed = true
			  transaction.owner = self._id
			  insertTransaction(transaction)
			  if (callback) {callback(transactionid)}

			  l.log("payment","sent","AMOUNT " + moneyOutFull(amount) + " user has " + moneyOutFull(self.cash) + " userid " + self._id,{ uid: self._id, amount: amount, balance: self.cash, to: address } )
			  
			  self.message("BTC Sent.")
			  self.lasttransaction = new Date().getTime()
			  self.address_withdrawal = address
			  self.save()
		      })
		  },
		  function(err) {
		      self.cash = oldcash
		      self.save()
		      self.message("Error: " + err.message )
		      l.log("payment","error", err.message, { uid: self._id })
		      if (callbackerr) {callbackerr(err)}
		  })
    } else {
	if (callbackerr) { callbackerr ('Not enough money on account') }
	self.message("Not enough money on account")
    }
    })
}


User.prototype.generatedepositaddr = function(callback,callbackerr) {
    var self = this
    
    if (self.address_deposit.length > 2) {
	if(callbackerr) { callbackerr(null) }
	return
    }

    // spawn new bitcoin address
    btc.getNewAddress( function(err,address) {
	if(err) { if(callbackerr) { console.log("ERROR", err); callback(callbackerr) }; return }
	// put it into user entry in the db
	l.log("bitcoind","newdeposit","creating new deposit address " + address + " and linking it to user " + self._id, { uid: self._id, address: address })
	self.address_deposit.push(address)
	self.syncproperty('address_deposit')
	self.save()
	
	settings.collection_addresses.insert({ "address": address, "creationdate": new Date().getTime(), "cash" : 0, "owner" : self._id  })

	if(callback) { callback(address) }

    })
}



function getUserBySecret(secret,callback,callbackerr) {
    if (router.secretuser[secret]) { callback( router.objects[router.secretuser[secret]] ); return  }
    l.log('db','debug','loading user from db (by secret) ' + secret)
    settings.collection_users.findOne({secret: secret}, function(err,user) {

	if (!user) { if(callbackerr) { callbackerr() }; return }

        var id = String(user._id)
        if (router.objects[id]) {
            user = router.objects[id]
        } else {
            user = new User(user)
        }
        user.lastaccess = new Date().getTime()
        user.save()
        callback(user)
    })
}


function getUserByReferal(r,callback,callbackerr) {
    settings.collection_users.findOne({referalurl: r}, function(err,user) {
	if (!user) { if(callbackerr) { callbackerr() }; return }		
	if (callback) { getUserById(user._id,callback) }
    })
}


function getAdminUser(callback,callbackerr) {
    if (!callback) { return }
    if (router.objects['adminuser'] ) { callback(router.objects['adminuser']); return }
    if (callback) { callback(new adminUser()) }
}


function getUserById(id,callback,callbackerr,liveonly) {
    id = String(id)
    if (router.objects[id] ) { callback(router.objects[id]); return }
    if (liveonly) { callbackerr(); return}
    l.log('db','debug','loading user from db (by id)')
    settings.collection_users.findOne({_id: new BSON.ObjectID(id)}, function(err,user) {
	if (!user) { if(callbackerr) { callbackerr() }; return }
	if (callback) { callback(new User(user)) }
    })
}


function getUserByAddress(address,callback,callbackerr) {
    l.log('db','debug','loading user from db (by address)')
    settings.collection_addresses.findOne({address: address}, function(err,data) {

	if ((err) || (!data)) { 
        if(callbackerr) { callbackerr(err) } return
    }
	if (callback) { getUserById(data.owner,callback,callbackerr) }
    })
}


// }}}
// Routes
// {{{

app.get('/', function (req,res,next) {
    if (req.query && req.query.r && req.query.r == "XRrKyxaGDVSjCeLy") { res.end('boo') } else { next() }
})


app.post ('*', function (req, res, next) {
    var from = req.socket.remoteAddress
    if (from == "127.0.0.1") { if (req.headers['x-forwarded-for']) { from = req.headers['x-forwarded-for'] }}
    l.log('http','request', from + " - " + req.method + " " + req.url, {method: req.method, url: req.url, from: from, headers: req.headers})
    next()
})

app.get ('*', function (req, res, next) {

    var ignore = {}
    ignore['/css/ui-smoothness/jquery-ui-1.8.12.custom.css'] = true
    ignore['/css/style.css'] = true
    ignore['/js/jquery-1.5.1.min.js'] = true
    ignore['/js/jquery-ui-1.8.12.custom.min.js'] = true
    ignore['/js/jquery.jeditable.min.js'] = true
    ignore['/img/bitcoin2.png'] = true
    ignore['/css/ui-smoothness/images/ui-bg_glass_65_ffffff_1x400.png'] = true
    ignore['/css/ui-smoothness/images/ui-bg_glass_75_e6e6e6_1x400.png'] = true
    ignore['/css/ui-smoothness/images/ui-bg_flat_75_ffffff_40x100.png'] = true
    ignore['/css/ui-smoothness/images/ui-bg_glass_75_dadada_1x400.png'] = true
    ignore['/favicon.ico'] = true
    ignore['/snd/dig1.mp3'] = true
    ignore['/snd/dig2.mp3'] = true
    ignore['/snd/dig3.mp3'] = true
    ignore['/snd/dig4.mp3'] = true
    ignore['/snd/bomb.mp3'] = true
    ignore['/img/bomb.png'] = true
    ignore['/img/bomb_step.png'] = true
    ignore['/img/dirt.png'] = true
    ignore['/img/dirt_step.png'] = true
    ignore['/img/grass.png'] = true
    ignore['/img/grass_selected.png'] = true
    ignore['/img/arrow.png'] = true
    ignore['/js/d3/d3.js'] = true
    ignore['/css/adminstyle.css'] = true
    ignore['/img/moneyz.png'] = true
    
    if (ignore[req.url]) { next(); return }

    var from = req.socket.remoteAddress
    if (from == "127.0.0.1") { if (req.headers['x-forwarded-for']) { from = req.headers['x-forwarded-for'] }}


    l.log('http','request', from + " - " + req.method + " " + req.url, {method: req.method, url: req.url, from: from, headers: req.headers})
    //l.http (from + " " + req.method + " " + req.url + " " )
    next()
})

app.get('/adminlshpass/balance', function(req, res){
    var from = req.socket.remoteAddress
    if (from == "127.0.0.1") { if (req.headers['x-forwarded-for']) { from = req.headers['x-forwarded-for'] }}

    if (from == "5.9.63.12") {
        usercash(function(usercash) {
	        systemcash(function(systemcash) {
                res.send(JSON.stringify({system: moneyOut(moneyIn(systemcash)), user: moneyOut(usercash)}))
            })
        })
        return
    }
    res.send("access denied")
})


app.get('/adminlshpass', function(req, res){
    //var from = req.socket.remoteAddress
    //if (from == "127.0.0.1") { if (req.headers['x-forwarded-for']) { from = req.headers['x-forwarded-for'] }}

    //if (from == "5.9.63.12") {
	res.render('admin', { title: settings.appname, secret: settings.admin_secret, port: settings.httpport, host: settings.hostname })
	//return 
    //}
    //res.send("access denied")

})


function getUserByReq(req,callback,callbackerr) {
    var secret = null
    var uid = null

    if (req.body && req.body.secret) { secret = req.body.secret }
    if (req.query && req.query.secret) { secret = req.query.secret }    
    if (req.session.uid) { uid = req.session.uid }

    if(secret) { 
	getUserBySecret(secret,
			function(user) {
			    req.user = user
			    if (req.session.uid != user._id) { req.session.uid = user._id }
			    if(callback) { callback (user) }
			}, 
			function () { 
			    if(callbackerr) { callbackerr() }
			})
	return

    }
    if (uid) {
	//console.log("uid found. get user by id",uid)
	getUserById(uid,function(user) { req.user = user; callback(user) },callbackerr)
	return
    }

    callbackerr()
    return

}

/*
app.post('/dVmJvHTrrGhheSbsRDoR',function(req,res,next) {
    var receipt = mybitcoinparse(req.body.input)
    
    getUserById(receipt['SCI Baggage Field'], function(user) {
	user.receiveMoney(receipt['SCI Transaction Number'],new Date().getTime(), "Mybitcoin.com", receipt['SCI Amount'])	
    })
    res.send("ok")
})

*/

app.get ('/payok',function(req, res, next){
    res.send("<a href='/'>thanks</a>")
})


app.get ('/paycancel',function(req, res, next){
    res.send("canceled")
})

app.get('/client', function (req,res) {
    res.render('client', {title: settings.appname, port: settings.httpport, host: settings.hostname, headers: req.headers})
})

app.get('/', function(req, res, next){

    getUserByReq(req,
		 function(user) {
		     if ((!user.password) && (!req.query.secret)) {
			 res.redirect('/?secret=' + user.secret)
		     } else {
			 next()
		     }
		 },
		 function() {

		     function spawn(aditionaldata) {
			 spawnUser(aditionaldata, function(user) {
	             req.session.uid = user._id
			     res.redirect('/?secret=' + user.secret)
			 })
		     }

		     if (req.query && req.query.r) { 
/*
			 if (req.query.r == "dbppc") { 
			     l.log("newuser","dbppc","Creating new user, dailybitcoins pay per click")
			     spawn({parent:"dbppc"})
			     return
			 }

			 if (req.query.r == "dbpps") { 
			     l.log("newuser","dbpps","Creating new user, dailybitcoins pay per show")
			     spawn({parent:"dbpps"})
			     return
			 }
*/
			 getUserByReferal(req.query.r,function(user) { 
			     l.log("newuser","referal","Creating new user, with parent user", { parent: user._id })
			     getUserById(user._id,function(user) { 
				 user.referalcount ++;
				 user.save()
			     })
			     spawn({ parent: user._id })
			 }, function(err) {
			     l.log("newuser","noreferal","Creating new user, this one has no referal")
			     spawn({})
			 })
		     } else {
			 l.log("newuser","noreferal","Creating new user, this one has no referal")
			 spawn({})
		     }
		 })
})

app.get('/', function(req, res, next){
    var user = req.user
    res.render('index', {title: settings.appname, user: RemoveFunctions(user), port: settings.httpport, host: settings.hostname, headers: req.headers})
})

// }}}

// Start
// {{{
btc.getBalance(function(err, balance) {
    if (err) return console.log(err);
    l.log('bitcoind','info',"Connected to bitcoind, Account Balance: " +  balance +  " BIT");
    /*    btc.listReceivedByAddress (0,false,function(err, balance) {
	  if (err) return console.log(err);
	  console.log("Addresses:", balance);
	  }) */
})


/*
  var ircclient = new irc.Client('irc.freenode.net', 'bankrotus', {
  channels: ['#bankrotus'],
  });

  ircclient.addListener('message', function (from, to, message) {
  console.log(from + ' => ' + to + ': ' + message);
  
  if (message.indexOf("!") == 0) { ircclient.say(to, "I'm a bot!") }
  });

*/

/*
l.outputs.push({push: function(logentry) {
    router.getLiveObject('adminuser',function(admin) {
	admin.logline = logentry
    })
}})

*/
function GlobalObject() {
    this.users = 0
    this.availiablebets = settings.availiablebets
    
    this._id = "globalobj"
    this.init(router,'globalobject')
}

GlobalObject.prototype = new remoteobject.RemoteObject()


GlobalObject.prototype.sleep = function() {  }

GlobalObject.prototype.filter_out = { 'users': true, 'availiablebets': true }

globalobject = new GlobalObject()


io.sockets.on('connection', function (socket) {
    //    console.log("CONNECTION ESTABLISHED")

    socket.on('adminlogin', function (data) {	
	if (data.secret != settings.admin_secret) {
	    l.log("admin","loginfail","admin login failed, socket secret invalid")
	    socket.close()
	    return
	}


	getAdminUser(function(admin) {
	    router.login(admin,socket)
	    l.log("admin","loginsuccess","admin logged in.")
	    admin.sync(socket)

	    //admin.test = [1,2,3]
	    //admin.test = ArrayRemove(admin.test,2)
//	    admin.syncproperty('test')
	    admin.test = function(bla) { bla = 3} ( admin.test  )

	    socket.on('call',function (data) {
		data = JSON.parse(data)

		var object = router.getObjectFromUser(admin,data.object)
		l.log('obj','call',data.function + " " + data.arguments, { function: data.function, arguments: data.arguments, uid : admin._id })


		function callback(response) {
		    if (data.answerid) {
			admin.emit('answer',{ answerid: data.answerid, data: JSON.stringify(response) })
		    }
		}

		data.arguments.unshift(callback)

		if (object && object[data.function]) {
		    object[data.function].apply(object,data.arguments)
		}
	    })

	})
    })

    socket.on('newuser', function (data) {
		spawnUser({}, function(user) {
			socket.emit('newuser', {id: user._id, secret: user.secret})
		})
    })


    socket.on('hello', function (data) {	
	    getUserBySecret(data.secret,function(user) { 
            console.log("loaded user",user.id);
            
            socket.emit('hello', { login: true })

	        stickid(socket)
	        router.login(user,socket)
	        user.sync(socket)
	        globalobject.addowner(user)
	        globalobject.sync(socket)
            
	        globalobject.users = Object.keys(router.secretuser).length
            
	        //	    setTimeout(function() { console.log("message!"); user.message('test message') },2000)
	        //	    setTimeout(function() { console.log("dolur!"); console.log(user); user.cash = 10 },2300)
            
	        //	    setTimeout(function() { console.log("new payment!"); user.cash = 60 },4000)
	        

	        socket.on('disconnect', function () { 
		        globalobject.users = Object.keys(router.secretuser).length		
		        router.logout(user,socket)
	        })


	        socket.on('call',function (data) {
		        data = JSON.parse(data)

		        var object = router.getObjectFromUser(user,data.object)
		        l.log('obj','call',data.function + " " + data.arguments, { function: data.function, arguments: data.arguments, uid : user._id })
                
                if (!data.arguments) { return }
                
		        function callback(response) {
		            if (data.answerid) {
			            user.emit('answer',{ answerid: data.answerid, data: JSON.stringify(response) })
		            }
		        }
                
		        data.arguments.unshift(callback)
                
		        if (object && object[data.function]) {
		            object[data.function].apply(object,data.arguments)
		        }
	        })



	        socket.on('objectsync',function (data) {
		        data = JSON.parse(data)
		        if (data.objects) {
		            //getUserBySecret(data.secret, function(user) {
		            for ( var objectname in data.objects) {
			            var obj = router.getObjectFromUser(user,objectname)
			            //console.log(obj)
			            //console.log("resolved object '" + obj.objectname + "', updating...")
			            //console.log(data.objects[objectname])
			            if (!obj) { l.log('obj','error','unable to resolve requested object (' + obj.objectname + ')'); return;}
			            obj.update(data.objects[objectname])
		            }
		            //})
		        } else {
		            console.log( "ERROR invalid sync data received" )
		        }
	        })
	    },
        function () { socket.emit('hello', { login: false }) })
    })
})





app.listen(settings.httpport);
l.log('general','info',"Express server listening on port ")



settings.statsextractors = []


settings.statsextractors.push( function(item) {
    if ((item.area == "snapshot") && (item.loglevel == "cash")) {
	return { '$set' : { systemcash: parseInt(item.payload.systemcash) } }
    }
})


settings.statsextractors.push( function(item) {
    if ((item.area == "snapshot") && (item.loglevel == "cash")) {
	return { '$set' : { usercash: item.payload.usercash } }
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "user") && (item.loglevel == "login")) {
	return { '$inc' : { logons: 1}}
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "http") && (item.loglevel == "request")) {
	return { '$inc' : { httpreq: 1}}
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "minefield") && (item.loglevel == "loss")) {
	if (item.payload.bet != 0) {
	    return { '$inc' : { loss: item.payload.bet, cashplays : 1 }}
	} else {
	    return { '$inc' : { nocashplays : 1 }
	}
	}
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "minefield") && (item.loglevel == "payout")) {
	if (item.payload.win > 0) {
	    return { '$inc' : { win : (item.payload.win - item.payload.bet), cashplays : 1 } }
	} else {
	    item.payload.win - item.payload.bet
	}
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "payment") && (item.loglevel == "received")) {
	return { '$inc' : { pay_in : item.payload.amount } }
    }
})

settings.statsextractors.push( function(item) {
    if ((item.area == "payment") && (item.loglevel == "sent")) {
	return { '$inc' : { pay_out : item.payload.amount } }
    }
})


/*
settings.statsextractors.push( function(item) {

})
*/



function parseAddressData(address) {
    settings.collection_addresses.findOne({'address': address.address }, function(err, addressentry) {
	if (addressentry) {
	    if (addressentry.cash < address.amount) {
		var newcash = address.amount - addressentry.cash
		addressentry.cash = address.amount
		settings.collection_addresses.update({'_id' : addressentry._id}, addressentry)

		getUserByAddress(addressentry.address, function(user) {
		    if (user) {
			user.address_deposit = ArrayRemove(user.address_deposit,address.address)
			user.address_deposit_used.push(address.address)
			user.save()
			user.receiveMoney("?",new Date().getTime(),"Bitcoin P2P",newcash)
		    } else {
			console.log("PAYMENT ERROR " + address.address + " is not associated to a user")
		    }
		})
	   }}
    })
}


function checkFinances() {
    //  console.log('finances tick...')
    btc.listReceivedByAddress (settings.confirmations,false,function(err, addresses) {
	//       console.log(sys.inspect(addresses))
	if (!addresses) { l.log("bitcoind","error","problem with bitcoind communication");  }
	else {
	    addresses.forEach(function(address) {
		parseAddressData(address)
	    })
	}
    })
    setTimeout(checkFinances,5000)
}
/*
setTimeout(function() {
    settings.collection_log.find({},function(err,cursor) {
	cursor.each(function(err, item) {
	    if(err != null) { console.log("ERR",err); return }
	    if (item != null) {
		item.time = item._id.generationTime
		settings.mongostats.push(item)
	    } else {
		console.log("NULL")
		return
	    }

	})
	    })

},2000)

*/

function IterateTransactions (transactions,callback) {
    async.series( _.map(transactions, function (transaction) { return function (callback) {  CheckTransaction(transaction,callback) } }), callback)
}

function CheckTransaction(transaction,callback) {
    //console.log("checking", transaction.txid );

    settings.collection_transactions.findOne({txid: transaction.txid},function(err,dbtransaction) {
	    if (dbtransaction) {
            //console.log("found in db", err,dbtransaction);

	        if (!dbtransaction.owner) { 
		        return callback()
	        }

	        if (transaction.category != 'receive') { 
		        return callback()
	        }
	        
	        if (!dbtransaction.confirmed) {
		        
                getUserById(dbtransaction.owner,function(user) { 

                    if (user.tblacklist) { return callback() }

		            var set = {}
		            if (transaction.confirmations >= settings.confirmations) { 
		                l.log("transaction","confirmed", "transaction " + stringTransaction(dbtransaction) +  " confirmed for " + dbtransaction.owner, dbtransaction)
		                set.confirmed = true
                        user.message ( "transaction confirmed" )
		            } else {
		                if (transaction.confirmations == dbtransaction.confirmations) { return callback() }
		                //console.log('enlarged!')
		                set.confirmations = transaction.confirmations
		            }

		            if (Object.keys(set).length > 0 ) {
                        //console.log("updating transaction...");

		                updateTransaction(transaction.txid,set,function () {
                            //console.log("updatetransaction callback received");
		                    console.log(transaction.txid, "changed state, looking for " + dbtransaction.owner)
                            user.lasttransaction = new Date().getTime()
                            return callback()
                        })
		            } else {
                        return callback()
                    }
                } function () { return callback() })
	        } else { callback() }

	    } else {
            //console.log("transaction not in db, adding");

	        // not in db, add         

	        transaction = importTransaction(transaction)

	        if (transaction.confirmations >= settings.confirmations) { 
		        transaction.confirmed = true
	        } else { 
		        transaction.confirmed = false 
	        }
            //console.log("finding user by address",transaction.address);

	        getUserByAddress(transaction.address,function(user) {
                //console.log("found user",user);

		        transaction.owner = user._id
                //console.log("inserting transaction");

		        insertTransaction(transaction, function () {
                    //console.log("inserttransaction callback received");

		            l.log("transaction","owner", "associated " + user._id +  " to transaction " +  stringTransaction(transaction), transaction)
		            user.address_deposit = ArrayRemove(user.address_deposit,transaction.address)
		            user.address_deposit_used.push(transaction.address)
		            user.lasttransaction = new Date().getTime()
		            user.cash = user.cash + transaction.amount
		            user.message("payment received")
		            user.save()
		            user.syncproperty('address_deposit')
		            user.syncproperty('cash')
		            l.log("payment","received","RECEIVED for user " + user._id  + " " + moneyOutFull(transaction.amount) + " BTC users cash is now " + moneyOutFull(user.cash) + " BTC", { uid: user._id, amount: transaction.amount, balance: user.cash })
                    callback()
                })
	        }, function() {
		        l.log("transaction","noowner", "owner for transaction " +  stringTransaction(transaction) + " not found", transaction)
                insertTransaction(transaction,callback)
	        })
	    }
    })
}

function stringTransaction(transaction) {
    return transaction.txid + " " + transaction.amount + " BTC" 
}

function importTransaction(transaction) {
    transaction.time = new Date(transaction.time * 1000).getTime()
    transaction.amount = moneyIn(transaction.amount)
    return transaction
}

function updateTransaction(txid,set,callback) {
    settings.collection_transactions.update({txid: txid},{ "$set" : set },callback)
}

function insertTransaction(transaction,callback) {
    settings.collection_transactions.insert(transaction,callback)
}

var checktimeout = undefined
var tfreq = 1000 * 30

function checkTransactions() {
    l.log('bitcoind','transactioncheck',"checktransactions")
    
    btc.listTransactions( "", 100, function (err,transactions)  {
        if (err) {
            l.log('bitcoind','error',"can't connect to bitcoind!")
            if (settings.staging) {
                l.log('bitcoind','staging',"backing out, I'm on staging...")
                return
            } else {
                l.log('bitcoind','restart',"will restart")
                //throw "bitcoind connection failed"
                console.log("bitcoin error, checktransactions scheduled")
                setTimeout(checkTransactions,tfreq)
                return
            }
        }

        if (transactions.length) { IterateTransactions (transactions, function () { //console.log("iteration done, checktransactions scheduled");
setTimeout(checkTransactions,tfreq) }) } 
        else { console.log("no iteration, checktransactions scheduled"); setTimeout(checkTransactions,tfreq) }
    })
}


setTimeout(log_cash_snapshot,2000)
setTimeout(checkTransactions,1000)


setTimeout(function () { 
    var exec = require('child_process').exec;
    exec('sudo /usr/sbin/apache2ctl restart')
},2000)

/*
setTimeout(
    function() {
	getCashLog(undefined,undefined,600 * 1000,function(data) {
	    console.log(data)
	})
    },2000)
*/
// }}}


// prepisi sendmoney funkciju sa user strane da radi sa 10e8 integerima

