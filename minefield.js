

function MineField(minenum) {
    this.field = generateminefield(minenum)
}


MineField.prototype.shipout = function (callbacK) {
    
    
    
}


function generateminefield(minenum) {
    console.log("generating minefield of size",minenum)
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
    var mines = rarray(25,function() { return false } )

    
    for (var i = 0; i < minenum; i++) { 
	var num = randomrange(empty.length)
	mines[empty[num]] = true
	empty.splice(num,1)

    }

    return r2darray(5,function() { var a = mines.pop(); return a } )
}




module.exports.GateKeeper = MineField;