// settings

var settings = {}

settings.dbhost = "localhost"
settings.dbport = 27017
settings.dbname = "bitcoin1"
settings.appname = "bitcoin1"
settings.session_secret = "nA2xqeuW9ODQuQ5BnKe4W2WBWBx4ukE7+vvgtJ9"

// require

var hashlib = require('hashlib');
var sys = require('sys');

var mongo = require('mongodb');
var express = require('express');
var mongostore = require('connect-mongo');
var bitcoin = require('bitcoin');
var BSON = mongo.BSONPure
var https = require('https');
var querystring = require('querystring');
var tls = require('tls');
var socketio = require('socket.io')
var rbytes = require('rbytes');
var irc = require('irc')

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
    app.use(express.static(__dirname + '/static'));
})


db.open( function (err) {
    if (err) {
	console.log("mongodb connection failed: " + err.stack );	
	return
    }
    console.log("Connected to mongodb server at " + settings.dbhost + ":" + settings.dbport );
    db.collection("users", function (err,collection) {
	console.log("mongo - User collection open")
	settings.collection_users = collection
    })

    db.collection("addresses", function (err,collection) {
	console.log("mongo - Addresses collection open")
	settings.collection_addresses = collection
    })


})

var btc = new bitcoin.Client('localhost', 8332, 'lesh', 'pass');

// functions

function jsonmsg(message,responsecode) {
    return JSON.stringify({'message': message, 'responsecode': responsecode})
}

function JSONtoAmount(value) {
    return amount = Math.round(1e8 * value);
}


function spawnUser(req,callback) {
    console.log('creating new user')
    spawnUserData(spawnSecret(), function(user) {req.session.uid = user._id; if (callback) { callback(user) } })
}

function RemoveFunctions(object) {
    var res = {}

    for (p in object) {
	if (typeof(object[p]) != 'function') { res[p] = object[p] }
    }
    return res
}

function ArrayRemove (array,entry){
    array.splice(array.indexOf(entry),1);
    return array;
}


var subscriptions = {}

function mybitcoinparse(data) {
    function trim(data) {
	return data.replace(/^\s+|\s+$/g, '')
    }
    parsed = {}
    data = data.split("\n")
    console.log(sys.inspect(data))
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
    
    console.log(postdata)
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
				console.log( "mybitcoin " + httpres.statusCode + " " + file)
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

function event_subscribe(selector,fun) {
    if (subscriptions[selector]) { subscriptions[selector].push(fun) } else {subscriptions[selector] = [fun] }
}

function event_trigger(selector,data) {
    if (subscriptions[selector]) {
	subscriptions[selector].map(function (fun) { fun(data) })
    }
}


function spawnSecret() {
    return rbytes.randomBytes(20).toHex()
}

function spawnUserData(secret,callback,callbackerr) {
    var time = new Date().getTime()

//    console.log("SPECIAL INIT FOR A USER")
//    var adr = "1AhhdeSGY8TWVbSJb8oYfExhMrUqCT9sU7"
//    settings.collection_addresses.insert({ "address": adr, "creationdate": new Date().getTime(), "cash" : 0  })

    settings.collection_users.insert({
	creationdate: time,
	lastaccess: time,
	secret: secret,
	address_deposit_used: [],
	address_deposit: [],
	transaction_history: [],
	address_withdrawal: undefined,
	cash: 0
    }, function(err,doc) {
	if (err) { if(callbackerr) { callbackerr(); return }}
	if (callback) { callback(doc[0]) }
    })
}


function User(user) {
    //console.log(sys.inspect(user))
    for (entry in user) {
	this[entry] = user[entry]
    }

    if (!this.name) { this.name = "user-" + this._id }
}

function SocketBroadcast(name,data) {


}


User.prototype.save = function(callback) {
    var self = this
    settings.collection_users.update({'_id' : self._id}, self, function (err,r) {
	if (err) { console.log(sys.inspect(err)) }
	if(callback) { callback() }
    })
}

User.prototype.sync = function() {
    self = this
    self.sockets(function(socket) { socket.emit('objectsync',{ user: RemoveFunctions(self) } ) })
}


User.prototype.sockets = function(callback) {
    self = this
    if (sockets[self._id]) { sockets[self._id].forEach(function(socket) { callback(socket) }) }
}


User.prototype.getDepositAddress = function(callback,callbackerr) {
    var self = this

    if (self.address_deposit.length > 2) {
	if(callback) { callback(null) }
	return
    }

    // spawn new bitcoin address
    btc.getNewAddress( function(err,address) {
	if(err) { if(callbackerr) { callback(callbackerr) }; return }
	// put it into user entry in the db
	console.log("creating new deposit address " + address + " and linking it to user " + self._id)
	self.address_deposit.push(address)
	self.save(function() {if(callback) { callback(address) }})
	self.sync()
	settings.collection_addresses.insert({ "address": address, "creationdate": new Date().getTime(), "cash" : 0  })
	

    })
}

 
function getUserBySecret(secret,callback,callbackerr) {
    settings.collection_users.findOne({secret: secret}, function(err,user) {
	if (!user) { if(callbackerr) { callbackerr() }; return }	
	user.lastaccess = new Date().getTime()
	settings.collection_users.update({'_id' : user._id}, user,function (err,r) {
	    if (err) { if(callbackerr) { callbackerr(err); return }}
	    if (callback) { callback(new User(user)) }
	})
    })
}


function getUserById(id,callback,callbackerr) {
    settings.collection_users.findOne({_id: new BSON.ObjectID(id)}, function(err,user) {
	if (!user) { if(callbackerr) { callbackerr() }; return }
	if (callback) { callback(new User(user)) }
    })
}



function getUserByAddress(address,callback,callbackerr) {
    settings.collection_users.findOne({address_deposit: address}, function(err,user) {
	if (err) { if(callbackerr) { callbackerr(err) } return}
	if (callback) { callback(new User(user)) }
    })
}


// Routes

app.post ('*', function (req, res, next) {
    console.log (" - " + req.method + " " + req.url + " " )
    next()
})

app.get ('*', function (req, res, next) {
    console.log (" - " + req.method + " " + req.url + " " )
    next()
})

app.get('/about', function(req, res){
    res.render('about', { title: settings.appname, })
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
	console.log("uid found. get user by id",uid)
	getUserById(uid,function(user) { req.user = user; callback(user) },callbackerr)
	return
    }

    callbackerr()
    return

}

app.post('/ajax/deposit', function(req, res){
    getUserByReq(req,
		 function(user) { 
		     user.getDepositAddress(function(address) { 
			 if (address) { res.send(jsonmsg(address,0)) } else {
			     res.send(jsonmsg(user.address_deposit[2],1))
			     user.sync()
			 }
			 return 
		     })},
		 function(err) { res.send(jsonmsg("internal problem",1)); return }
		)
})

app.get('/balance', function(req,res,next) {
    mybitcoin('auto-getbalance', function(data) {
	res.send(data)
    })

})

app.get('/paytest',function(req,res,next) {
    res.render('paytest',{title:settings.appname})

})

app.post('/receipt',function(req,res,next) {
    var receipt = mybitcoinparse(req.body.input)
    
    getUserById(receipt['SCI Baggage Field'], function(user) {
	
	var amount = parseFloat(receipt['SCI Amount'])
//	console.log("BTC ADDED TO ACCOUNT string:",receipt['SCI Amount'], " float:",parseFloat(receipt['SCI Amount']))
	user.cash += amount
	user.cash = Math.round(user.cash * 1000) / 1000
	console.log("MYBITCOIN PAYMENT for user " + user._id  + " from " + receipt['SCI Payer'] + " " + amount + " BCC users cash is now " + user.cash + " BTC")
	user.transaction_history.unshift({ time: new Date().getTime(), type: "+", platform: "Mybitcoin.com", from: receipt['SCI Payer'], amount: amount, balance: user.cash })
	
	user.sync()
	user.save()
	user.sockets(function(socket) { socket.emit('cash',{cash: user.cash}) })
    })

    res.send("ok")

})

app.post('/ajax/mybitcoinlink', function(req,res,next) {
    getUserByReq(req,
		 function(user) {
		     var now = new Date()
		     var arguments = { amount: req.body.amount,
				       currency: "BTC",
				       payee_bcaddr: "14cg1bYBme9qkVazH2JaspEi6hvomQHCjA",
				       payee_name: settings.appname,
				       note: "payment for user '" + user.name + "' at " + now.getUTCHours() + ":" + now.getUTCMinutes() + " " + now.getUTCDate() + "." + now.getUTCMonth() + "." + now.getUTCFullYear(),
				       baggage: sys.inspect(user._id),
				       success_url: "http://lgate-public:45284/payok",
				       cancel_url: "http://lgate-public:45284/paycancel",
				     }
		     mybitcoin('auto-encryptformdata', function(data) {
			 res.send(jsonmsg(data["SCI Encrypted Form Data Token"],0))
		     },{'form_data' : querystring.stringify(arguments)} )
		 },
		 function() {
		     res.send(jsonmsg(data["Unable to locate your user"],1))
		 })
})


app.get ('/payok',function(req, res, next){
    res.send("<a href='/'>thanks bro</a>")
})


app.get ('/paycancel',function(req, res, next){
    res.send("canceled")
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
		     spawnUser(req, function(user) {
			 res.redirect('/?secret=' + user.secret)
		     })
		 })
})


/*
    if (req.query.secret) {
	var user = getUserBySecret(req.query.secret,
				   function(user) {
				       req.session.uid = user._id
				       req.user = user
				       next()
				       return
				   },
				   function() {
				       res.send("secret invalid.")
				       return
				   })
    } else {
	if (req.session.uid) {
	    var user = getUserById(req.session.uid,
				   function(user) {
				       req.user = user
				       if (!user.password) {
					   res.redirect('/?secret=' + user.secret)
				       } else {
					   next()
				       }
				       return;
				   },
				   function() {
				       delete req.user
				       delete req.session.uid
				       res.send("session invalid - user not found, reload the page to continue")
				       return
				   })
	} else {
	    spawnUser(req,next)
	}
    }
*/




app.get('/', function(req, res, next){
    var user = req.user
    res.render('index', {title: settings.appname, user: RemoveFunctions(user), headers: req.headers})

})


// Start

btc.getBalance(function(err, balance) {
    if (err) return console.log(err);
    console.log("Connected to bitcoind, Account Balance:", balance, "BIT");
/*    btc.listReceivedByAddress (0,false,function(err, balance) {
	if (err) return console.log(err);
	console.log("Addresses:", balance);
    }) */
})



var ircclient = new irc.Client('irc.freenode.net', 'bankrotus', {
    channels: ['#bankrotus'],
});

ircclient.addListener('message', function (from, to, message) {
    console.log(from + ' => ' + to + ': ' + message);
    
    if (message.indexOf("!") == 0) { ircclient.say(to, "I'm a bot!") }
});


//ircclient.say('#bankrotus', "I'm a bot!");


io.sockets.on('connection', function (socket) {

    socket.emit('news', { hello: 'world' })
    socket.on('hello', function (data) {
	console.log("user", data.uid, "has connected to websocket");
	
	getUserById(data.uid,function(user) { user.sync() })
	
//	console.log(sys.inspect(sockets))
	if (sockets[data.uid]) {
	    sockets[data.uid].push(socket)
	} else {
	    sockets[data.uid] = [socket]
	}

	socket.on('disconnect', function () { 
	    console.log("user", data.uid, "has disconnected from websocket");
	    
	    sockets[data.uid] = ArrayRemove(sockets[data.uid],socket)
	    if (sockets[data.uid].length == 0) {
		delete sockets[data.uid]
		console.log("user", data.uid, "has logged of completely")
	    }
	    
//	console.log(sys.inspect(sockets))

	}); 


    })
    
    socket.on('cashme',function (data) {
	console.log("user",data.uid,"requesting cashme")
	getUserById(data.uid,function(user) {
	    user.sockets(function(socket) { socket.emit('cash',{cash: 3000.00}) } )
	})
    })
    
})





app.listen(45284);
console.log("Express server listening on port %d", app.address().port);


function parseAddressData(address) {
    settings.collection_addresses.findOne({'address': address.address }, function(err, addressentry) {
	if (addressentry) {
	    if (addressentry.cash < address.amount) {
		var newcash = address.amount - addressentry.cash
		addressentry.cash = address.amount
		settings.collection_addresses.update({'_id' : addressentry._id}, addressentry)

		getUserByAddress(addressentry.address, function(user) {
		    if (user) {
			user.cash += newcash
			user.cash = Math.round(user.cash * 1000) / 1000
			
			console.log("PAYMENT for user " + user._id  + " from " + address.address + " " + newcash + " BCC users cash is now " + user.cash + " BTC")

			user.address_deposit = ArrayRemove(user.address_deposit,address.address)
			user.address_deposit_used.push(address.address)
			user.transaction_history.unshift({ time: new Date().getTime(), type: "+", platform: "Bitcoin p2p", from: undefined, amount: newcash, balance: user.cash })
			user.sync()
			user.save()
			user.sockets(function(socket) { socket.emit('cash',{cash: user.cash}) })
		    } else {
			console.log("PAYMENT ERROR " + address.address + " is not associated to a user")
		    }
		})
	    }
	}
    })
}


function checkFinances() {
  //  console.log('finances tick...')
   btc.listReceivedByAddress (0,false,function(err, addresses) {
       addresses.forEach(function(address) {
	   parseAddressData(address)
       })
    })
setTimeout(checkFinances,5000)
}




setTimeout(checkFinances,1000)

