const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'app/app.js'),'utf8');
const ctx={qrcode:require('../app/vendor/qrcode')};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function qrMatrix('),source.indexOf('function TransferQr(')),ctx);
const invite='RCVSYNC1.'+Buffer.from(JSON.stringify({key:'a'.repeat(64),primary:'12345678-1234-1234-1234-123456789012',device:'22345678-1234-1234-1234-123456789012',namespace:'library1',ip:'192.168.1.100',port:32123,expires:Date.now()+600000})).toString('base64url');
const matrix=ctx.qrMatrix(invite);assert(matrix,'A full sync invitation must generate a QR instead of silently disappearing');
const decode=require('../app/vendor/jsQR'),scale=5,quiet=4,size=(matrix.length+quiet*2)*scale,pixels=new Uint8ClampedArray(size*size*4).fill(255);
for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+quiet)*scale+dy)*size+(x+quiet)*scale+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}
assert.strictEqual(decode(pixels,size,size).data,invite,'Real offline decoder reads the real encoder output exactly');
for(const file of ['app/index.html','web/index.html']){const html=fs.readFileSync(path.join(root,file),'utf8');assert(html.includes('vendor/qrcode.js'),file+' loads the encoder');assert(html.includes('vendor/jsQR.js'),file+' loads the offline decoder');}
console.log('PASS real full-length pairing QR generation, offline pixel decoding, and desktop/mobile asset loading');
