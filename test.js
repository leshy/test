var http = require('http');


mtgoxticker = function(callback) {

    var options = {
        host: 'bitcoincharts.com',
        path: '/t/weighted_prices.json',
        method: 'GET'
    };
    
    var req = http.request(options, function(res) {
        res.on('data', function(d) {
            callback(JSON.parse(d))
        });
    });
    req.end();

    req.on('error', function(e) {
        console.error(e);
    });
}


mtgoxticker(function(data) { console.log(data.USD['24h']) })
