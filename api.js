const ffi = require('ffi');
const ref = require('ref');

const api = ffi.Library('./RFIDAPI.dll', {
    'SAAT_TCPInit': [ ref.types.bool, [
        ref.refType(ref.types.void),
        ref.refType(ref.types.char),
        ref.types.int]
    ]
});

var np = ref.alloc(ref.refType(ref.types.void));
var host = "192.168.0.238";
var port = 7086;
if(api.SAAT_TCPInit(np, host, port)){
    console.log("Berhasil");
}