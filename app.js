/*
  - obavezno prije produkcije stavi mybitcoin paynment receiver negdje drugdje
  - htio bi logirati na per socket razini nekako, vjerojatno cu morati pisati svoj logging.. 
*/


// settings
// {{{
var settings = {}

settings.dbhost = "localhost"
settings.dbport = 27017
settings.dbname = "bitcoin1"
settings.appname = "MineField - BitcoinLab"
settings.session_secret = "nA2xqeuW9ODQuQ5BnKe4W2WBWBx4ukE7+vvgtJ9"
settings.httpport = 45284
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

var remoteobject = require('./remoteobject2.js')
var Logger = require('./logger.js');

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
l.outputs.push(new Logger.FileOutput('new.log'))

l.log('general','info','starting...');



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
    app.use(express.static(__dirname + '/static'));
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
    db.collection("log", function (err,collection) {
	l.log('general','info',"mongo - Log collection open")
	settings.collection_log = collection
	l.outputs.push(new Logger.MongoOutput(collection))
	
    })


})

var btc = new bitcoin.Client('localhost', 8332, 'lesh', 'pass');

// }}}

// functions
// {{{


function Length(object) {
    return Object.keys(object).length
}

function generateid() { 
    return new Date().getTime() + rbytes.randomBytes(16).toHex()
}

function stickid(object) {
    object._id = generateid()
}


socketio.Socket.prototype.toString = function() { return this._id }


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
    return Math.round(money * 1e8)
}

function moneyOut(money) {
    return Math.round(money / 1e4) / 10000
}

function jsonmsg(message,responsecode) {
    return JSON.stringify({'message': message, 'responsecode': responsecode})
}


function sendMoney (address,amount,callback,callbackerr) {
    amount = moneyOut(amount)
    btc.sendToAddress ( address,amount, "bla1","bla2", function(err,paymentid) { 
	if (paymentid) {
	    l.log("payment","info","SENT " + amount + " BTC to" + address + " success - transaction id " + paymentid)
	    callback(paymentid)
	} else {
	    l.log("payment","error","ERROR",err)
	    if (callbackerr) { callbackerr(err.message) }
	}
    })
}

function spawnUser(req,callback) {
    l.log("db","debug",'creating new user')
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
    bet = moneyIn(bet)
    self.bet = bet
    self.userid = parent._id
    console.log("bet is",self.bet)
    
    self.size = size
    self.win = bet

    console.log("win is",self.win)
    self.openfields = 0
    self.calculatemulti()
    parent.cash = roundMoney(parent.cash - bet)
    //    parent.cash = 0.102
    console.log("cash is",parent.cash)

    self.generateminefield(size) 

    self.crypted = JSON.stringify(self.minefield) + " " + rbytes.randomBytes(16).toHex()
    self.hash = hashlib.sha256(self.crypted)
    self.done = false
    self.init(router,'minefield')

    //    console.log(self.minefield)
}

MineField.prototype = new remoteobject.RemoteObject()

MineField.prototype.cleanup = function() {
    var self = this
    console.log("MINEFIELD CLEANUP")
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
    var win = (95 / chance)
    this.multi = Math.round(parseFloat(win) * 100) / 100
//    console.log("MULTI:" ,this.multi, this.size,chance)
    /*
      var chance = 100 - (ui.value / (25 / 100))
      var win = (95 / chance)
      win = Math.round(parseFloat(win) * 100) / 100 
    */
}



MineField.prototype.step = function(coords) {
    var self = this

    self.minefield[coords[0]][coords[1]] = self.minefield[coords[0]][coords[1]] +  2
    

    if (self.minefield[coords[0]][coords[1]]  == 3) {
	getUserById(self.userid,function(user) { 
	    l.log('minefield','loss',"game end. user " + self.userid + " lost a game (" + self.bet + " BTC)",{ uid: self.userid, bet: self.bet, balance: user.cash })
	})
	self.done = true
	self.win = 0
	self.sync()
    } else {
	l.log('minefield','pass',"user " + self.userid + " pass, (" + self.win + " BTC from bet of " + self.bet + " BTC)",{ uid: self.userid, bet: self.bet, win: self.win })
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
	    l.log('minefield','payout',"game end. user " + self.userid + " payout (" + self.win + " BTC from bet of " + self.bet + " BTC)",{ uid: self.userid, bet: self.bet, win: self.win, balance: user.cash })
	})
	self.win = 0
	self.syncpush('minefield')
	self.syncpush('crypted')
	self.syncflush()
    }
}


MineField.prototype.generateminefield = function(minenum) {
//    console.log("generating minefield of size",minenum)
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

function User(user) {
    //console.log(sys.inspect(user))
    var self = this
    self.objectname = 'user'

    for (entry in user) {
	self[entry] = user[entry]
    }
    if (!self.name) { self.name = "user-" + this._id }

    self.init(router,'user')
    //self.subscribe('*',function() { self.save() })
}

User.prototype = new remoteobject.RemoteObject()


User.prototype.newminefield = function(size,bet) {
    if (!bet) { bet = 0 }
    if (!size) { console.log('err, size not set'); return }
    if (bet > this.cash) { this.message("not enough<br><center><img width='40px' src='/img/bitcoin2.png'></center>"); return }
    minefield = new MineField(size,bet,this)
    minefield.addowner(this)
    minefield.sync()
    
}

//name: function(name) { if (name) { if (name) { return escape(name) } else { return null } } },
User.prototype.filter_in = { name: function() { return null },
			     address_deposit: function(res) { return escape(res) },
			     ping: function(arg) { return arg },
			   }

User.prototype.filter_out = { name: true,
			      cash: function(cash) { return moneyOut(cash) },
			      address_deposit: true ,
			      address_withdrawal: true ,
			      transaction_history: true,
			      newminefield: 'function',
			      sendMoney: 'function',
			      generatedepositaddr: 'function'
			    }
User.prototype.filter_save = { name: true,
			       creationdate: true,
			       lastaccess: true,
			       secret: true,
			       address_deposit_used: true,
			       address_deposit: true,
			       transaction_history: true,
			       address_withdrawal: true,
			       cash: true
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
    this.emit('msg',JSON.stringify({message: message }))
}


User.prototype.receiveMoney = function(id,time,from,amount) {
    self = this
    console.log(self)
    amount = moneyIn(amount)
    self.cash = self.cash + amount
    self.cash = roundMoney(self.cash)   

    self.transaction_history.unshift({ transactionid: id, deposit: true, time: time, other_party: from, amount: amount, balance: self.cash })
    self.syncpush('transaction_history')
    self.syncpush('transaction_history')
    self.syncflush()
    self.save()
    //self.sync()
    self.message("payment received")
    l.log("payment","info","RECEIVED for user " + self._id  + " from " + from + " " + amount + " BCC users cash is now " + self.cash + " BTC")
    //console.log(self)
}

User.prototype.sendMoney = function(address,amount,callback,callbackerr) {
    self = this
    l.log("payment","info","PAYMENT ATTEMPT of",amount,"and user has",self.cash,"userid",self._id)
    amount = roundMoney(amount)
    if ((self.cash - amount) >= 0) {
	var oldcash = self.cash
	self.cash -= amount
	self.cash = Math.round(self.cash * 1000) / 1000
	self.save()
	sendMoney(address,amount,
		  function(transactionid) { 
		      if (callback) {callback(transactionid)}
		      self.transaction_history.unshift({ transactionid: transactionid, deposit: false, time: new Date().getTime(), other_party: address, amount: amount, balance: self.cash })
		      self.syncproperty('transaction_history')
		      self.save()
		  },
		  function(err) {
		      self.cash = oldcash
		      self.save()
		      this.message("Error")
		      if (callbackerr) {callbackerr(err)}
		  })
    } else {
	if (callbackerr) { callbackerr ('Not enough money on account') }
	this.message("Not enough money on account")
    }
}


User.prototype.generatedepositaddr = function(callback,callbackerr) {
    var self = this

    if (self.address_deposit.length > 2) {
	if(callbackerr) { callbackerr(null) }
	return
    }

    // spawn new bitcoin address
    btc.getNewAddress( function(err,address) {
	if(err) { if(callbackerr) { callback(callbackerr) }; return }
	// put it into user entry in the db
	console.log("creating new deposit address " + address + " and linking it to user " + self._id)
	self.address_deposit.push(address)
	self.syncproperty('address_deposit')
	self.save(function() {if(callback) { callback(address) }})
	
	settings.collection_addresses.insert({ "address": address, "creationdate": new Date().getTime(), "cash" : 0  })
	

    })
}



function getUserBySecret(secret,callback,callbackerr) {
    if (router.secretuser[secret]) { callback( router.objects[router.secretuser[secret]] ); return  }
    l.log('db','debug','loading user from db (by secret)')
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
    if (router.objects[id] ) { callback(router.objects[id]); return }
    l.log('db','debug','loading user from db (by id)')
    settings.collection_users.findOne({_id: new BSON.ObjectID(id)}, function(err,user) {
	if (!user) { if(callbackerr) { callbackerr() }; return }
	if (callback) { callback(new User(user)) }
    })
}


function getUserByAddress(address,callback,callbackerr) {
    l.log('db','debug','loading user from db (by address)')
    settings.collection_users.findOne({address_deposit: address}, function(err,user) {
	if ((err) || (!user)) { if(callbackerr) { callbackerr(err) } return}
	if (callback) { getUserById(["" + user._id],callback) }
    })
}

// }}}
// Routes
// {{{




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


    if (ignore[req.url]) { next(); return }

    var from = req.socket.remoteAddress
    if (from == "127.0.0.1") { if (req.headers['x-forwarded-for']) { from = req.headers['x-forwarded-for'] }}


    l.log('http','request', from + " - " + req.method + " " + req.url, {method: req.method, url: req.url, from: from, headers: req.headers})
    //l.http (from + " " + req.method + " " + req.url + " " )
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


app.post('/dVmJvHTrrGhheSbsRDoR',function(req,res,next) {
    var receipt = mybitcoinparse(req.body.input)
    
    getUserById(receipt['SCI Baggage Field'], function(user) {
	user.receiveMoney(receipt['SCI Transaction Number'],new Date().getTime(), "Mybitcoin.com", receipt['SCI Amount'])	
    })
    res.send("ok")
})

app.get ('/payok',function(req, res, next){
    res.send("<a href='/'>thanks</a>")
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



app.get('/', function(req, res, next){
    var user = req.user
    res.render('index', {title: settings.appname, user: RemoveFunctions(user), port: settings.httpport , headers: req.headers})

})


// }}}

// Start
// {{{
btc.getBalance(function(err, balance) {
    if (err) return console.log(err);
    l.log('general','info',"Connected to bitcoind, Account Balance: " +  balance +  " BIT");
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



function GlobalObject() {
    this.users = 0
    this.availiablebets = [0,0.01, 0.05, 0.1 ]
    this._id = "globalobj"
    this.init(router,'globalobject')
}

GlobalObject.prototype = new remoteobject.RemoteObject()


GlobalObject.prototype.sleep = function() {  }

GlobalObject.prototype.filter_out = { 'users': true, 'availiablebets': true }

globalobject = new GlobalObject()


io.sockets.on('connection', function (socket) {
    //    console.log("CONNECTION ESTABLISHED")
    socket.on('hello', function (data) {	
	getUserBySecret(data.secret,function(user) { 
	    stickid(socket)
	    router.login(user,socket)
	    user.sync(socket)
	    globalobject.addowner(user)
	    globalobject.sync(socket)

	    globalobject.users = Object.keys(router.secretuser).length

	    //	    setTimeout(function() { console.log("message!"); user.message('test message') },2000)
	    //	    setTimeout(function() { console.log("dolur!"); console.log(user); user.cash = 10 },2300)
	    //	    setTimeout(function() { console.log("payment!"); user.receiveMoney('11111',new Date().getTime(),'test transaction',1) },2500)

	    //	    setTimeout(function() { console.log("new payment!"); user.cash = 60 },4000)
	    

	    socket.on('disconnect', function () { 
		globalobject.users = Object.keys(router.secretuser).length		
		router.logout(user,socket)
	    })


	    socket.on('call',function (data) {
		data = JSON.parse(data)

		var object = router.getObjectFromUser(user,data.object)
		l.log('obj','call',data.function + " " + data.arguments, {user : user._id, object: object.objectname })

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


	})
    })
    

})





app.listen(settings.httpport);
l.log('general','info',"Express server listening on port " + app.address().port);


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
	    }
	}
    })
}


function checkFinances() {
    //  console.log('finances tick...')
    btc.listReceivedByAddress (0,false,function(err, addresses) {
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
setTimeout(checkFinances,1000)

// }}}
