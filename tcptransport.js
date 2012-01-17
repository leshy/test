
var net = require('net');


function TcpTransport(log) {
    this.l = log
    var server = net.createServer(function (socket) {
	socket.addListener("connect", function () {
	    sys.puts("Connection from " + socket.remoteAddress);
	    socket.end("Hello World\n");
	});
	
    })

    this.server = server
    server.listen(7000, "localhost");
    this.l.log("transport","tcp","TCP transport listening on port 7000 at localhost.");

}





function Channel() {

}

Channel.prototype.receive(msg) {

}

Channel.prototype.emit(msg) {

}

Channel.prototype.subscribe(msg,callback) {

}


