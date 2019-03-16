var io = require('socket.io').listen(9099);
var xss = require('xss');

//在线用户
var onlineUsers = {};
var onlineRoomUsers = {};
//当前在线人数
var onlineCount = 0;
var roomName = 'chatroom';

function getCookie(name, cookie) {
    var arr, reg = new RegExp("(^| )" + name + "=([^;]*)(;|$)");
    cookie = cookie ? cookie : document.cookie;
    if (arr = cookie.match(reg))
        return decodeURIComponent(arr[2]);
    else
        return null;
}

io.sockets.on('connection', function (socket) {
    var data = socket.handshake || socket.request;
    var PHPSESSID = "";
    if (data.headers.cookie) {
        PHPSESSID = getCookie('PHPSESSID', data.headers.cookie);
    }
    if (!PHPSESSID) {
        return false;
    }
    //监听新用户加入
    socket.on('login', function (obj) {
        //检查在线列表，如果不在里面就加入
        if (!obj.username) {
            socket.emit('login', {state: 0, errorCode: 'username_required', msg: '请填写昵称'});
            return;
        }
        obj.username = xss(obj.username);
        socket.name = PHPSESSID;
        socket.username = obj.username;
        onlineUsers[socket.name] = obj.sid;
        if (!onlineUsers.hasOwnProperty(PHPSESSID)) {
            var socketId = onlineRoomUsers[roomName] && onlineRoomUsers[roomName]['user'] && onlineRoomUsers[roomName]['user'][obj.username] ? onlineRoomUsers[roomName]['user'][obj.username] : "";
            if (socketId && socketId != socket.id) {
                socket.emit('login', {state: 0, errorCode: 'username_exists', msg: obj.username + '昵称已存在'});
                return;
            }
        } else {
            var room = onlineUsers[socket.name] ? onlineUsers[socket.name] : roomName;
            var socketId = onlineRoomUsers[room] && onlineRoomUsers[room]['user'] && onlineRoomUsers[room]['user'][obj.username] ? onlineRoomUsers[room]['user'][obj.username] : "";
            if (!socketId || socketId != socket.id) {
                if (socketId && io.sockets.sockets[socketId]) {
                    var otherSocket = io.sockets.sockets[socketId];
                    otherSocket.emit('loginOther', {
                        state: 1,
                        errorCode: 'login_other',
                        msg: obj.username + '已在其他地方登录'
                    });
                    io.sockets.sockets[socketId].disconnect();
                    onlineUsers[socket.name] = obj.sid;
                }
            }
        }
        //将新加入用户的唯一标识当作socket的名称，后面退出的时候会用到

        var room = onlineUsers[socket.name] ? onlineUsers[socket.name] : roomName;
        if (!onlineRoomUsers[room]) {
            onlineRoomUsers[room] = {};
        }
        if (!onlineRoomUsers[room]['user']) {
            onlineRoomUsers[room]['user'] = {};
        }
        onlineRoomUsers[room]['user'][obj.username] = socket.id;
        if (!onlineRoomUsers[room]['count']) {
            onlineRoomUsers[room]['count'] = 0;
        }
        onlineRoomUsers[room]['count']++;
        //在线人数+1
        onlineCount++;
        socket.join(room);
        console.log(obj.username + '加入了聊天室' + room);
        //向所有客户端广播用户加入
        io.in(room).emit('join', {state: 1, onlineCount: onlineRoomUsers[room]['count'], user: obj});
        socket.emit('login', {state: 1, onlineCount: onlineRoomUsers[room]['count'], user: obj});

    });
    //监听用户退出
    socket.on('disconnect', function () {
        //将退出的用户从在线列表中删除
        if (onlineUsers.hasOwnProperty(socket.name)) {
            //退出用户的信息
            var obj = {username: socket.username, sid: onlineUsers[socket.name]};
            var room = onlineUsers[socket.name] ? onlineUsers[socket.name] : roomName;
            //删除
            delete onlineUsers[socket.name];
            delete onlineRoomUsers[room]['user'][socket.name];
            //在线人数-1
            onlineCount--;
            onlineRoomUsers[room]['count']--;
            //向所有客户端广播用户退出
            io.in(room).emit('logout', {state: 1, onlineCount: onlineRoomUsers[room]['count'], user: obj});
            socket.leave(room);
            console.log(obj.username + '退出了聊天室' + room);
        }
    });
    socket.on('my other event', function (data) {
        console.log(data);
    });
    socket.on('message', function (data) {
        console.log(data);
        obj = {
            username: socket.username,
            content: xss(data)
        };
        var room = onlineUsers[socket.name] ? onlineUsers[socket.name] : roomName;
        if (socket.name && onlineUsers.hasOwnProperty(socket.name)) {
            socket.broadcast.to(room).emit('reply', obj);
        }
    });
});
