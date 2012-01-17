var SubscriptionMan = require('./subscriptionman.js')



function Channel(master) 
{
    this.master = master
    this.user = undefined
}

//Channel.prototype = SubscriptionMan.SubscriptionMan()

Channel.prototype.receive(msg) {
    this.master.Receive(this,this.user)
}

Channel.prototype.emit(msg) {
    
}

Channel.prototype.subscribe(msg,callback) {
    
}




function ChannelMaster() {
    
}

function Receive(channel,user) {
    
}