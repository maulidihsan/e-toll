const express = require('express');
const _ = require('lodash');
const app = express();
const bodyParser = require('body-parser');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const MongoClient = require('mongodb').MongoClient;
const  ObjectId = require('mongodb').ObjectId;
let db;
MongoClient.connect('mongodb://tester:s3cur3pwdd@127.0.0.1:27017/?ssl=false&authSource=test', function(err, _db){
    db = _db.db('etoll');
    console.log('db for socket connected');
});
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static(__dirname + '/node_modules'));
app.get('/', function(req, res, next){
	res.sendFile(__dirname + '/main.html');
});
app.get('/test', function(req, res, next) {
    res.sendFile(__dirname + '/test.html');
});
app.get('/list_tol', (req, res, next) => {
    db.collection('gate').find({}).toArray(function(err, data) {
        if(err){
            console.log(err);
            return res.status(500);
        }
        return res.json({tol: data});
    });
});

app.get('/report', (req, res, next) => {
    db.collection('log').find({}).sort({waktu_masuk: -1}).toArray(function (err, data){
        if(err){
            console.log(err);
            return res.status(500);
        }
        return res.json({log: data});
    });
})
app.get('/add', (req, res, next) => {
    res.sendFile(__dirname + '/add.html');
});
app.get('/rfid_reader', (req, res, next) => {
    if(req.query.gate && req.query.card) {
        db.collection('gate').findOne(
        {
            _id: ObjectId(req.query.gate)
        }, function(err, gate) {
            if(err || !gate){
                res.send(false)
            }
            else {
                db.collection('kendaraan').findOne({ _id: ObjectId(req.body.card) }, function( err, kendaraan){
                    if(err || !kendaraan){
                        res.send(false)
                    }
                    else {
                        let query = {
                            nopol: kendaraan.nopol,
                            jenis: kendaraan.jenis
                        }
                        db.collection('log').find({ kendaraan: query }).sort({ waktu_masuk: -1 }).limit(1).toArray(function(err, log) {
                            if(!err){
                                if (log.length < 1 || (log[0].gerbang_masuk && log[0].gerbang_keluar)) {
                                    const dataToInsert = {
                                        kendaraan: query,
                                        tarif: gate[0].tarif,
                                        gerbang_masuk: gate[0],
                                        waktu_masuk: Date.now(),
                                    }
                                    db.collection('log').insertOne(dataToInsert, function(err, result){
                                        if(!err) {
                                            io.sockets.emit('report', {
                                                event: 'masuk',
                                                kendaraan: query,
                                                gerbang: gate[0],
                                                ts: Date.now()
                                            });
                                            client.emit('notify', {
                                                event: 'masuk',
                                                kendaraan: query,
                                                gerbang: gate[0],
                                            })
                                        }
                                    })
                                } else if(log[0].gerbang_masuk && !log[0].gerbang_keluar && !_.isEqual(log[0].gerbang_masuk, gate[0])){
                                    db.collection('log').findAndModify({ kendaraan: query }, {waktu_masuk: -1}, { $set: { gerbang_keluar: gate[0], waktu_keluar: Date.now()}}, { $upsert: false }, function(err, result){
                                        if(!err) {
                                            io.sockets.emit('report', {
                                                event: 'keluar',
                                                kendaraan: query,
                                                gerbang: gate[0],
                                                ts: Date.now()
                                            });
                                            client.emit('notify', {
                                                event: 'keluar',
                                                kendaraan: query,
                                                gerbang: gate[0],
                                            })
                                        }
                                    })
                                }
                            }
                        });
                    }
                })
            }
        })
    }
    else {
        res.send(false);
    }
});
app.post('/add', (req, res, next) => {
    console.log(req.body)
    const dataToInsert = {
        nama: req.body.namaTol,
        tarif: Number(req.body.tarif),
        location: {
            type: 'Point',
            coordinates: [req.body.lokasi.lng, req.body.lokasi.lat]
        }
    }
    db.collection('gate').insertOne(dataToInsert, function(err, result){
        if(err){
            return res.status(400).send('Gagal')
        }
        return res.status(200).json({namaTol: req.body.namaTol, tarif: req.body.tarif});
    })
});



// SOCKET EVENT AND LOGIC
io.on('connection', function(client) {  
    console.log('Client connected...');
    client.on('locate', function(data){
        io.sockets.emit('track', data);
        let coordinates = [];
        coordinates[0] = Number(data.lokasi.lng);
        coordinates[1] = Number(data.lokasi.lat);
        db.collection('gate')
        .find(
            {
                location: {
                    $near: {
                        $geometry: { type: 'Point', coordinates: coordinates },
                        $maxDistance: 200
                    } 
                }
            })
        .toArray(function(err, gate) {
            if(err) {console.log(err);}
            console.log(gate);
            if(gate.length > 0){
                db.collection('log').find({ kendaraan: data.kendaraan }).sort({ waktu_masuk: -1 }).limit(1).toArray(function(err, log) {
                    console.log(log);
                    if(!err){
                        console.log(log);
                        if (log.length < 1 || (log[0].gerbang_masuk && log[0].gerbang_keluar)) {
                            const dataToInsert = {
                                kendaraan: data.kendaraan,
                                tarif: gate[0].tarif,
                                gerbang_masuk: gate[0],
                                waktu_masuk: Date.now(),
                            }
                            db.collection('log').insertOne(dataToInsert, function(err, result){
                                if(!err) {
                                    io.sockets.emit('report', {
                                        event: 'masuk',
                                        kendaraan: data.kendaraan,
                                        gerbang: gate[0],
                                        ts: Date.now()
                                    });
                                    client.emit('notify', {
                                        event: 'masuk',
                                        kendaraan: data.kendaraan,
                                        gerbang: gate[0],
                                    })
                                }
                            })
                        } else if(log[0].gerbang_masuk && !log[0].gerbang_keluar && !_.isEqual(log[0].gerbang_masuk, gate[0])){
                            db.collection('log').findAndModify({ kendaraan: data.kendaraan }, {waktu_masuk: -1}, { $set: { gerbang_keluar: gate[0], waktu_keluar: Date.now()}}, { $upsert: false }, function(err, result){
                                if(!err) {
                                    io.sockets.emit('report', {
                                        event: 'keluar',
                                        kendaraan: data.kendaraan,
                                        gerbang: gate[0],
                                        ts: Date.now()
                                    });
                                    client.emit('notify', {
                                        event: 'keluar',
                                        kendaraan: data.kendaraan,
                                        gerbang: gate[0],
                                    })
                                }
                            })
                        }
                    }
                });
            }
        })
    });

    client.on('bayar', function(data, cb) {
        let insert = {
            kendaraan: data.kendaraan,
            jumlah: data.jumlah,
            ts: Date.now()
        }
        db.collection('bill').insertOne(insert, function(err, result){
            if(err){
                console.error(err);
            }
            else{
                cb('ok')
            }
        })
	    console.log(data);
           client.emit('broad', data);
           client.broadcast.emit('broad',data);
    });

});

server.listen(process.env.PORT || 4200);