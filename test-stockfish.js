const stockfish = require('stockfish.js');

const engine = stockfish();
engine.onmessage = (msg) => {
    console.log(msg);
    if (msg.includes('readyok')) {
        console.log('Stockfish works!');
        process.exit(0);
    }
};
engine.postMessage('uci');
engine.postMessage('isready');
