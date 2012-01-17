
function argtoarray(arg) { ret = []; for (var i in arg) { ret.push(arg[i]) }; return ret }


function zip (array1, array2, strict) { 
    var res = []
    for (var i in array1) {
	if (array2[i]) {
	    res.push([ array1[i], array2[i] ])
	} else if (strict) {
	    console.log("strict fail")
	    return false
	}}
    return res
}


function BorderManWrap(f,template) {
    function wrap() {

	function objectmatch(object,template) {
	    
	}

	function arraymatch(array,template) {
	    while (array.length > 0) {
		t = template.pop()
		
		if (typeof(t) != "string") { 

	    }

	}

	function match(template,arg) {
	    if (typeof(template.constructor) != typeof(arg.constructor)) { return false }
	    if (template.constructor == Array) { return arraymatch(arg,template) }
	    if (template.constructor == Object) { return objectmatch(arg,template) }
	}


	var arg = argtoarray(arguments)
	if (!match(template,arg)) { console.log("illegal arguments"); return false } else { return f.apply(f,arg) }
    }
    return wrap
}





function BorderManWrap2(f,template) {
    function wrap() {

	function match(template,arg) {

	    var strict = template.strict
	    delete template.strict
	    var x = zip(template,arg,strict)

	    if (!x) { return false }
	    console.log(x)
	    for (var i in x) {
		var argcheck = x[i]

		console.log("comparing",argcheck[0],"with",argcheck[1])
		if (typeof(argcheck[0]) != "string") {
		    if (typeof(argcheck[0]) != typeo\f(argcheck[1])) { 
			console.log("FAIL (",typeof(argcheck[1]), "!=",typeof(argcheck[0]),")" )
			return false
		    }
		    console.log("going deeper")
		    if (!match(argcheck[0], argcheck[1])) { return false }
		} else {
		    if (typeof(argcheck[1]) != argcheck[0]) {
			console.log("FAIL (",typeof(argcheck[1]), "!=",argcheck[0],")" )
			return false
		    }}
		console.log("PASS")
	    }
	    return true
	}

	var arg = argtoarray(arguments)
	if (!match(template,arg)) { console.log("illegal arguments"); return false } else { return f.apply(f,arg) }
    }
    return wrap
}

function test(a,b) {
    return "TEST RETURN" + a + b
}

allowed = [ "number", [ "string", "string", "..." ], { bla:"number", strict: true }, "integer", "..." ]
test = BorderManWrap(test,allowed)


console.log(test(2,["test1","test","test3as"],{bla:3}))

