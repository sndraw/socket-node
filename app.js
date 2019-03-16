var io = require('socket.io').listen(9099);
// var xss = require('xss');
var cookie = require('cookie');
var md5 = require('md5');

//在线token
var onlineTokens = {};
//在线用户
var onlineUsers = {};
//在线房间
var onlineRooms = {};
//当前在线人数
var onlineCount = 0;
var roomName = 'chatroom';

function getCookie(name, socket) {
    var data = socket.handshake || socket.request;
    var socketCookie = data.headers.cookie ? data.headers.cookie : "";
    if (!socketCookie) {
        return false;
    }
    var cookies = cookie.parse(socketCookie);
    return cookies[name] ? cookies[name] : null;
}
function validateToken(token) {
    token=token && onlineTokens[token] ?cookie.parse(onlineTokens[token]):"";
    var expires = token.Expires? new Date(token.Expires).getTime():"";
    var time=new Date().getTime();

    if (!token || !expires || expires< time) {
        if(onlineTokens[token]){
            delete  onlineTokens[token];
        }
        if(onlineUsers[token]){
            delete  onlineUsers[token];
        }
        return false;
    }
    return true;
}
io.sockets.on('connection', function (socket) {
    socket.on('isLogin', function (obj) {
        var token = obj.token;
        if (!validateToken(token)) {
            socket.emit('isLogin', {state: 0, errorCode: 'not_login', msg: '请登录'});
            return;
        }
        var user = (token && onlineUsers[token]) ? onlineUsers[token] : "";
        socket.emit('isLogin', {state: 1, user: user});
    });
    //监听新用户加入
    socket.on('login', function (obj) {
        if (!obj.username) {
            socket.emit('login', {state: 0, errorCode: 'username_required', msg: '请填写昵称'});
            return;
        }
        if (!obj.roomId) {
            socket.emit('login', {state: 0, errorCode: 'roomId_required', msg: '请填写房间号'});
            return;
        }
        var roomId = obj.roomId;
        var room = onlineRooms[roomId] ? onlineRooms[roomId] : "";
        var users = room && room['users'] ? room['users'] : "";
        var socketId = users && users[obj.username] ? users[obj.username] : "";
        if (socketId && socketId != socket.id && io.sockets.sockets[socketId]) {
            var otherSocket = io.sockets.sockets[socketId];
            otherSocket.emit('loginOther', {
                state: 1,
                errorCode: 'login_other',
                msg: obj.username + '已在其他地方登录'
            });
            io.sockets.sockets[socketId].disconnect();
        }
        //检查在线列表, 查询房间中用户是否昵称存在
        if (socketId && socketId != socket.id && users && users.hasOwnProperty([obj.username])) {
            socket.emit('login', {state: 0, errorCode: 'username_exists', msg: obj.username + '昵称已存在'});
            return;
        }

        if (!onlineRooms[roomId]) {
            onlineRooms[roomId] = {};
        }
        if (!onlineRooms[roomId]['users']) {
            onlineRooms[roomId]['users'] = {};
        }
        //设置token
        var token = md5(socket.id + new Date().getTime());
        var maxAge = 2 * 3600 * 1000;
        var expires = new Date();
        expires.setTime(expires.getTime() + maxAge);//过期时间7200秒
        onlineTokens[token] = cookie.serialize('token', token, {
            maxAge: maxAge,
            expires: expires,
            httpOnly: true
        });

        onlineUsers[token] = obj;
        onlineRooms[roomId]['users'][obj.username] = socket.id;
        if (!onlineRooms[roomId]['count']) {
            onlineRooms[roomId]['count'] = 0;
        }
        onlineRooms[roomId]['count']++;
        //在线人数+1
        onlineCount++;
        socket.join(roomId);
        socket.name = token;
        console.log(obj.username + '加入了聊天室' + roomId);
        //向所有客户端广播用户加入
        io.in(roomId).emit('join', {state: 1, onlineCount: onlineRooms[roomId]['count'], user: obj});
        socket.emit('login', {state: 1, onlineCount: onlineRooms[roomId]['count'], user: obj, token: token});
    });
    //监听用户退出
    socket.on('disconnect', function () {
        var token =socket.name;
        if (!validateToken(token)) {
            socket.emit('login', {state: 0, errorCode: 'illegal_login', msg: '非法访问，验证不通过'});
            return;
        }
        //将退出的用户从在线列表中删除
        if (onlineUsers.hasOwnProperty(token)) {
            var user = onlineUsers[token] ? onlineUsers[token] : "";
            var roomId = user && user.roomId ? user.roomId : roomName;
            delete socket.name;
            //删除
            // delete onlineTokens[token];
            // delete onlineUsers[token];
            delete onlineRooms[roomId]['users'][user.username];
            //在线人数-1
            onlineCount--;
            onlineRooms[roomId]['count']--;
            //向所有客户端广播用户退出
            io.in(roomId).emit('logout', {state: 1, onlineCount: onlineRooms[roomId]['count'], user: user});
            socket.leave(roomId);
            console.log(user.username + '退出了聊天室' + roomId);
        }

    });
    socket.on('my other event', function (data) {
        console.log(data);
    });
    socket.on('message', function (data) {
        var token =socket.name;
        if (!validateToken(token)) {
            socket.emit('login', {state: 0, errorCode: 'illegal_login', msg: '非法访问，验证不通过'});
            return;
        }
        var user = onlineUsers[token] ? onlineUsers[token] : "";
        var obj = {
            username: user.username ? user.username : "",
            content: data
        };
        var roomId = user && user['roomId'] ? user['roomId'] : roomName;
        socket.broadcast.to(roomId).emit('reply', obj);
    });
});
