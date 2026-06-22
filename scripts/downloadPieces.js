const fs = require('fs');
const path = require('path');
const https = require('https');

const pieces = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk'];
const dir = path.join(__dirname, '../public/pieces');

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Using Wikimedia Commons standard Lichess style PNG pieces (neo style or standard)
// We'll use a reliable source: chess.com pieces are easily accessible
const getUrl = (piece) => `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${piece}.png`;

async function download() {
    for (const p of pieces) {
        const dest = path.join(dir, `${p}.png`);
        if (!fs.existsSync(dest)) {
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(dest);
                https.get(getUrl(p), (response) => {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                }).on('error', (err) => {
                    fs.unlink(dest, () => {});
                    reject(err);
                });
            });
            console.log(`Downloaded ${p}.png`);
        }
    }
    console.log('All pieces downloaded');
}

download();
