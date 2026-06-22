const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = path.join(__dirname, '../public');
const files = [
  'stockfish-16.1-lite-single.js',
  'stockfish-16.1-lite-single.wasm'
];

const getUrl = (file) => `https://github.com/nmrugg/stockfish.js/releases/download/v16.1.0/${file}`;

async function download() {
    for (const f of files) {
        const dest = path.join(dir, f);
        if (!fs.existsSync(dest)) {
            console.log(`Downloading ${f}...`);
            await new Promise((resolve, reject) => {
                const req = https.get(getUrl(f), (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        https.get(res.headers.location, (redirectRes) => {
                            const fileStream = fs.createWriteStream(dest);
                            redirectRes.pipe(fileStream);
                            fileStream.on('finish', () => fileStream.close(resolve));
                        });
                    } else {
                        const fileStream = fs.createWriteStream(dest);
                        res.pipe(fileStream);
                        res.on('end', resolve);
                    }
                });
                req.on('error', reject);
            });
            console.log(`Finished ${f}`);
        }
    }
}

download();
