const WebSocket = require('ws'),
    msgpack = require('msgpack-lite'),
    Ac = require('./ac.js'); // prototypes

module.exports = class Serv {
    constructor(server) {
        this.server = server;

        this.wss;

        this.adminPass = "2424";

        this.count = 0;

        this.defualt = {
            bonus: 0,
            capture: 0,
            rank: 0,
            revenge: 0,
            totalCardPoint: 0,
            reward: 0,
            damage: 0,
            assist: 0,
            headshot: 0,
            kill: 0,
            death: 0,
            score: 0,
            bar: 0,
            tier: 1,
            health: 100,
            streak: 0,
            inPoint: !1,
            lastPos: [],
            lowhpc: 0
        }

        var def = this.defualt;
        
        this.spawns = {
              "Sierra": [
                {
                  "position": {
                    "x": -10.897426128387451,
                    "y": 18.815570831298828,
                    "z": -130.93080139160156
                  },
                  "rotation": {
                    "x": 0,
                    "y": 89.00561208665917,
                    "z": 0
                  }
                }
              ]
            }

        this.amaps = Object.keys(this.spawns);
        this.map = this.getMap();
        this.objective = 0;
        this.votes = Object.fromEntries(this.amaps.map(e=>[e,0]));

        //beginning matchmaker ws shit
        this.rMap = {
            auth: (ws, emit, msg) => {
                ws.send('room', this.players.list, 3, false, false, true)
                setTimeout(()=>{
                    ws.send('start')
                    setTimeout(()=> ws.close(),100)
                },100)
            },
            matchmaker: (ws, emit, msg) => {
                ws.send('nerd')
            }
        }
        
        this.eMap = {
            auth: (ws, emit, msg, broadcast) => {
                this.count++;
                let id = this.count,
                    name = (msg[2] == "none" ? "Guest " + id : msg[2]).slice(0, 100); //.replace(/(\[|\])/g, '');

                ws.id = id;

                console.log('Connected '.green + '->', ws.id, name);

                if (!this.players.list.includes(name)) this.players.list.push(name);

                this.players[name] = {
                    playerId: id,
                    verified: true,
                    kicked: false,
                    id: id,
                    name: name, // keep copy of original because nick names :)
                    username: name,
                    team: "none",
                    skin: msg[3],
                    group: id,
                    weapon: msg[4],
                    ...def
                }

                
                ws.send('me', this.players[name]);
                this.players.list.forEach(e => ws.send('player', this.players[e]));
                emit('player', this.players[name]);
                ws.send("mode", "POINT", this.map);
                
                //spawn
                this.setspawn(broadcast, ws.id);
                // new Ac(ws, this.players[name], (w, reason)=> {
                //     let player = this.getPlayer(w.id);
                //     if (!w.admin && player) {
                //         console.log(player.username, '->', reason);
                //         if (player.kicked) return;
                //         player.kicked = true;
                //         emit('chat', 'console', `${player.username}, Was kicked for suspsisious activity`);
                //         ws.send('kick', "Cheating");
                //         ws.close();
                //     }
                // })
            },
            character: (ws, emit, msg) => {
                ws.send("character", ...msg.slice(1));
            },
            respawn: (ws, emit, msg, broadcast) => {
                ws.send("h", ws.id, 100);
                let plr = this.getPlayer(ws.id);
                if (plr) plr.health = 100;
                this.setspawn(broadcast, ws.id);
            },
            weapon: (ws, emit, msg) => {
                let player = this.getPlayer(ws.id);
                if (!player) return;
                player.weapon = msg[1];
                emit('weapon', ws.id, ...msg.slice(1));

            },
            point: (ws, _, msg, emit) => {
                this.getObPoint(ws, 2)
            },
            chat: (ws, broad, msg, emit) => {
                let info = [...msg.slice(1).map(e => e + [])][0];

                let clog = m => ws.send("chat", 'console', m);

                let isAdmin = (w, callback) => w.admin ? callback() : clog('You do not have permission to use this command.');

                if (info[0] == "/") { //fixed just gonna fix spawns
                    let map = {
                        admin: (ws, args, _, emit) => {
                            let player = this.getPlayer(ws.id);
                            if (!player) return;
                            let pass = args.slice(1).join(' ');
                            ws.admin = ws.admin || pass == this.adminPass;
                            ws.admin ? clog('You are now a admin') : clog('Wrong password');
                            emit('chat', 'console', `[color="#FF0000"]${player.name}[/color] is now an admin!`)
                        },
                        flip() {
                            let l = Math.random() * 2 | 0 ? "Heads" : "Tails";
                            clog("You fliped " + l);
                        },
                        nick: (w, args, emit) =>{
                            let player = this.getPlayer(w.id);
                            player.username = args.slice(1).join(' ');
                        },
                        kill: (w, args, emit) =>{
                            isAdmin(w, ()=>{
                                let player = this.findPlayer(args[1]);
                                if (player) {
                                    this.damage(w.id, player.playerId, 100, true, emit)
                                } else {
                                    clog("Player does not exist");
                                }
                            })
                        },
                        kick: (w, args, emit) => {
                            isAdmin(w, ()=>{
                                let player = this.findPlayer(args[1]);
                                if (player) {
                                    let pws = this.getWs(player.playerId);
                                    pws.send('kick', args.slice(2).join(' '));
                                    pws.close();
                                } else {
                                    clog("Player does not exist");
                                }
                            })
                        },
                        points: (w, args, emit) =>{
                            isAdmin(w, ()=>this.getObPoint(w, +args[1]));
                        },
                        time: (w, args, emit) => {
                            isAdmin(w, ()=>this.time = +args[1]);
                        },
                        sm(w, args, emit) {
                            isAdmin(w, ()=>clog(args.slice(1).join(' ')));
                        },
                        script: (w, args, emit) => {
                            let msg = args.slice(1).join(' ');
                            this.executeJavascript(msg, emit);
                        }
                    }

                    //actual packet args
                    let chat = info.slice(1).split(' ');
                    //console.log(args);
                    let fnc = map[chat[0]];
                    if (fnc) {
                        fnc(ws, chat, emit, broad)
                    } else {
                        clog("Command does not exist.")
                    }
                } else {
                    let c = info.slice(0, 100).replace(/(\[|\])/g, '');
                    if (/[a-zA-Z0-9]+/.test(c)) emit("chat", ws.id, c);
                }

            },
            show: (ws, emit, msg) => {
                emit('show', ws.id, ...msg.slice(1));
            },
            hide: (ws, emit, msg) => {
                emit('hide', ws.id, ...msg.slice(1));
            },
            throw: (ws, emit, msg) => {
                emit(...msg, ws.id, false);
            },
            hurt: (ws, _, msg, emit) => {
                this.damage(msg.pop(), ws.id, 100, true, emit)
            },
            radius: (ws, _, msg, emit) => {

                let rad = 60,
                    thower = ws.id,
                    info = [...msg.slice(1)],
                    pos = {
                        x: info[2] / 5,
                        y: info[3] / 5,
                        z: info[4] / 5
                    };

                this.getPList().forEach(player => {
                    let lp = [...player.lastPos], //.map(e=>e/5).vector();
                        pPos = {
                            x: lp[0] / 5,
                            y: lp[1] / 5,
                            z: lp[2] / 5
                        },     //this.getD3D(pos.x, pos.y, pos.z, pPos.x, pPos.y, pPos.z);
                        dist = this.getDist(pos.x, pos.z, pPos.x, pPos.z); //fixed ???

                    //console.log(dist)
                    if (dist <= rad) {
                        this.damage(thower, player.playerId, 100, !1, emit);
                        //emit("chat", player.playerId, "bruh")
                    }
                })
            },
            da: (ws, _, msg, emit) => {
                this.damagePacket(ws, msg, emit)
            },
            p: (ws, emit, msg) => {
                let info = [...msg.slice(1)],
                    author = this.getPlayer(ws.id);
                if (author) {
                    author.lastPos = info.slice(0, 3);
                }
                emit('p', ws.id, ...info);
            },
            e: (ws, emit, msg) => {
                emit('e', ws.id, ...msg.slice(1));
            },
            s: (ws, emit, msg) => {
                emit('s', ws.id, ...msg.slice(1));
            },
            vote: (ws, _, msg, emit) => {
                this.votes[msg[1]]++;
                emit('votes', this.filterObj(this.votes));
            },
            guard: (ws, _, msg, emit) => {
                let player = this.getPlayer(ws.id);
                if (!msg[1] && player) {
                    emit('chat', 'console', `${player.username}, Was kicked for suspsisious activity`);
                    ws.send('kick', "Cheating");
                    ws.close()
                }
            },
            token: (ws) => {
                ws.send('auth', true);
            }
        }

        this.players = {
            list: []
        };

        this.maxTime = 300;
        this.time = this.maxTime;
    }

    executeJavascript(js, emit) {
        emit("object_position", {
            id: "Scar",
            position: `((()=>{${js}})(this), "NONE")`
        })
    }

    getMap() {
        return this.amaps[Math.random() * this.spawns.length | 0];
    }
    
    setspawn(broadcast, id){
        var mapSpawns = this.spawns[this.map];
                
        //spawn lol
        broadcast("respawn", id, { //keep in mind that they are multple spawns. Just use a random mechanism on them
            distanceScore: 256,
            ...(mapSpawns[Math.random() * mapSpawns.length | 0]),
            x: 0,
            y: 0,
            z: 0
        });
    }

    filterObj(obj) {
        return Object.fromEntries(Object.entries(obj).filter(e=>e[1]));
    }

    //deprecated
    getD3D(a, b, c, d, e, f) {
        let g = a - d,
            h = b - e,
            i = c - f;
        return Math.sqrt(g * g + h * h + i * i);
    }

    getDist(a, b, c, d) {
        return Math.sqrt((a - c) ** 2 + (b - d) ** 2)
    }

    findPlayer(segment) {
        let obj =  Object.values(this.players).find(e => e.username ? e.username.includes(segment) : false);
        if (!obj) return;
        let key = obj.name,
            ret = this.players[key];
        return ret ? ret : null;
    }

    getPList() {
        return this.players.list.map(e => this.players[e]).filter(Boolean);
    }

    getPlayer(id) {
        return this.getPList().find(e => e.playerId == id)
    }

    getObPoint(ws, am) {
        ws.send('point', am);
        let author = this.getPlayer(ws.id);
        if (author) {
            author.inPoint = !0;
            author.score += am;
            author.totalCardPoint += am;
        }
    }

    getWs(id) {
        let ws;
        this.wss.clients.forEach(e => {
            if (e.id == id) ws = e;
        })
        return ws;
    }

    damage(attacker, attacked, damage, headshot, emit) {
        let pckt = ['d', attacked, damage, headshot]
        this.damagePacket({
            id: attacker
        }, pckt, emit)
    }

    damagePacket(ws, msg, emit) {
        let info = [...msg.slice(1)],
            iOb = {
                damage: info[1] + (info[3] ? 5 : 0), //if its a head shot add 5 damage
                killer: ws.id,
                killed: info[0],
                reason: 'big gay' //light hearted ;)
            },
            dPlayer = this.getPlayer(iOb.killed),
            kPlayer = this.getPlayer(iOb.killer);

        //checks
        if (!dPlayer) return;
        if (!kPlayer) return;


        //before damage
        if (dPlayer.health <= 0) return;

        //damdage
        dPlayer.health -= iOb.damage;
        emit('h', iOb.killed, dPlayer.health);

        //save stats
        kPlayer.damage += iOb.damage;
        if (info[2]) kPlayer.headshot++;

        //after damage
        if (dPlayer.health <= 0) {

            //streaks
            dPlayer.streak = 0;
            kPlayer.streak++;
            let gain = this.getSScore(kPlayer.streak) + (info[2] ? 10 : 0),
                type = this.getStreak(kPlayer.streak, info[2])

            //lb
            kPlayer.score += gain;
            kPlayer.kill++;
            dPlayer.death++;

            emit('d', iOb.killed);
            emit('k', iOb.killed, iOb.killer);
            emit("announce", "kill", iOb.killer, gain, type)
            emit('notification', 'kill', iOb);

            setTimeout(() => {
                dPlayer.health = 100;
                emit('h', iOb.killed, dPlayer.health)
                emit("respawn", iOb.killed, {
                    distanceScore: 256,
                    position: dPlayer.lastPos.map(e=>e/5).vector(),
                    rotation: [0, 89, 0].vector()
                })
            }, 4e3)
        }
    }

    getSScore(streak) {
        return [10, 15, 30, 35, 70, 125, 135, 155, 215, 265][Math.min(streak, 10) - 1]
    }

    getStreak(streak, hs) {
        if (streak == 1) {
            return hs ? "Headshot" : "Kill"
        } else {
            let s = Math.min(streak, 10);
            return s + 'x';
        }
    }

    localLoop(ws) {
        setInterval(() => {
            //var
            let player = this.getPlayer(ws.id);

            //check if player exists
            if (!player) return;

            //points
            player.inPoint = false;

            //health regen
            if (player.health < 100) player.lowhpc++;
            if (player.lowhpc >= 10) {
                player.lowhpc = 0;
                player.health = 100;
                ws.send("h", ws.id, player.health);
            }
        }, 1e3)
    }

    startGame(emit) {
        setInterval(() => {
            //time
            if (this.time == this.maxTime) {
                emit('start');
            }

            if (!(this.time % 30)) {
                let iPoints = this.getPList().filter(e => e.inPoint).forEach(player => {
                    let aScore = 30;
                    player.score += aScore;
                    player.totalCardPoint += aScore;
                    emit("announce", "objective", player.id, aScore, "Capture")
                })

                emit("objective", this.objective)
                this.objective++
                if (this.objective > 4) this.objective = 0;
            }

            if (this.time >= 0) {
                let funny = 817;
                emit('t', this.time);
                this.time--;
            }

            if (this.time == 0) {
                let end = this.getPList().sort((a, b) => b.kill - a.kill);

                emit('finish', end);

                setTimeout(() => {
                    //reset stats

                    //stats obj
                    let rObj = {
                        bonus: 0,
                        capture: 0,
                        rank: 0,
                        revenge: 0,
                        totalCardPoint: 0,
                        reward: 0,
                        damage: 0,
                        assist: 0,
                        headshot: 0,
                        kill: 0,
                        death: 0,
                        score: 0,
                        bar: 0,
                        tier: 1,
                        health: 100,
                        streak: 0
                    }

                    //set the keys
                    this.getPList().forEach(player => {
                        Object.keys(rObj).forEach(e => {
                            player[e] = rObj[e];
                        })
                    })

                    this.map = Object.entries(this.votes).sort((a,b)=> b[1] - a[1])[0][0];
                    emit("mode", "POINT", this.map)

                    this.votes = {
                        Sierra: 0,
                        Xibalba: 0,
                        Mistle: 0,
                        Tundra: 0
                    };
                    this.time = this.maxTime;
                }, 20e3)
            }

            //board
            let players = this.getPList();
            let board = players.map(pObj => {
                let bar = (1 / (50 / (pObj.score % 50)))
                pObj.bar = bar == -Infinity ? 1 : bar;
                pObj.tier = (pObj.score / 50 | 0) + 1;

                return {
                    bar: pObj.bar,
                    death: pObj.death,
                    kill: pObj.kill,
                    playerId: pObj.playerId,
                    score: pObj.score,
                    tier: Math.min(pObj.tier, 3),
                    username: pObj.username
                }
            })
            emit('board', board);
        }, 1e3)
    }

    init() {
        let server = this.server;
        this.wss = new WebSocket.Server({
            server
        });

        let bcAll = (...data) => {
            this.wss.clients.forEach((client) => {
                if (!client.isMatchmaker && client.readyState === WebSocket.OPEN) {
                    client.send(...data);
                }
            });
        }

        console.log('init')
        this.startGame(bcAll);

        this.wss.on('connection', (ws, req) => {
            ws.id = null;
            ws.admin = false;

            let isMatchmaker = req.url.includes('true');
            ws.isMatchmaker = isMatchmaker;

            let broadCast = (...data) => {
                this.wss.clients.forEach((client) => {
                    if (!client.isMatchmaker && client.id !== ws.id && client.readyState === WebSocket.OPEN) {
                        client.send(...data);
                    }
                });
            }

            this.localLoop(ws);

            ws.s = ws.send;
            ws.send = (...args) => {
                //console.log(args)
                return ws.s(msgpack.encode(args))
            }

            ws.on('close', () => {
                let player = this.getPlayer(ws.id);
                
                if (player) {
                    let name = player.name;
                    broadCast('left', ws.id);
                    console.log('Left '.red + '->', ws.id, name)
                    delete this.players[name];
                }
            })

            ws.send(isMatchmaker ? 'auth' : 'token', true);
            ws.on('message', (_, msg = msgpack.decode(_)) => {
                if (typeof msg[0] != 'string') return;

                //should use includes on Object.keys of object to prevent crash
                let f = (isMatchmaker ? this.rMap : this.eMap)[msg[0]];
                if (f) {
                    f(ws, broadCast, msg, bcAll);
                } else {
                    console.log('new ->', msg[0], msg)
                }
            });
        });
    }
}
