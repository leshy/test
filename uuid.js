var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''); 
exports.uuid = function (len, radix) {
	var chars = CHARS, uuid = [], rnd = Math.random;
	radix = radix || chars.length;
	for (var i = 0; i < len; i++) uuid[i] = chars[0 | rnd()*radix];
	return uuid.join('');
};
