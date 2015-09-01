var is_second_try = false;

self.port.emit('getToken', {});

self.port.on('setToken', function(data){
	// console.log('Received token');
	var access_token = data.token;
	var socket = io.connect(data.base_url, {
			path: '/event/v1',
	        query:"access_token="+access_token
	});

	socket.on('error', function(data){
	    console.error('errors', data);
	    data = JSON.parse(data);
	    if (data.status == 401 && data.error === "invalid_token" && ! is_second_try) {
	    	is_second_try = true;
            socket.disconnect();
			self.port.emit('getToken', {});
	    }
	})

	socket.on('calls.ringing', function(data){
	    // console.log('RINGING', data);
	    if (data.calleridname !== 'Click-to-call')
	        notify('ringing', data);
	})

	socket.on('calls.ring', function(data){
	    // console.log('HANGUP', data);
	    notify('ring', data);
	})

	socket.on('calls.bridged', function(data){
	    // console.log('BRIDGED', data);
	    notify('bridged', data);
	})

	socket.on('calls.hangup', function(data){
	    // console.log('HANGUP', data);
	    notify('hangup', data);
	})
});

function notify (type, data) {
    var title, msg, icon;
    switch (type) {
        case "ringing" : 
            title = "Appel entrant";
            msg = data.connectedlinename +" ("+ data.connectedlinenum+")";
            icon = "ringing.png";
            break;
        case "hangup" : 
            title = "Raccroché";
            msg = data.connectedlinename +" ("+ data.connectedlinenum+")";
            icon = "hangup.png";
            break;
        case "bridged" : 
            title = "Communication établie entre";
            msg = data.callerid1 +", "+ data.callerid2;
            icon = "bridged.png";
            break;
        default :
        	title = type;
            msg = "";
            icon = "icon.png";
            break;
    }

	self.port.emit('notify', {title:title, message:msg, icon:icon});
}
