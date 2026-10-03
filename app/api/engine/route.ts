import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
// @ts-ignore
import initStockfishWasm from 'stockfish';

const localEnginePath = process.env.STOCKFISH_PATH || 'e:\\chess engine\\stockfish-windows-x86-64-universal\\stockfish\\stockfish-windows-x86-64-universal.exe';

// Keep track of active engine runs to prevent CPU saturation
let activeStockfish: ChildProcess | null = null;
let activeWasmEngine: any = null;

export async function POST(req: Request) {
  try {
    const { fen, depth = 10, limit = 10, includeWorst = false } = await req.json();

    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const moveCount = typeof limit === 'number' && limit > 0 ? limit : 10;
    const activeColor = fen.split(' ')[1] || 'w';

    // Terminate any previous running engine processes cleanly
    if (activeStockfish) {
      try {
        activeStockfish.stdin?.write('quit\n');
        activeStockfish.kill();
      } catch (e) {}
      activeStockfish = null;
    }
    if (activeWasmEngine) {
      try { if (activeWasmEngine.terminate) activeWasmEngine.terminate(); } catch (e) {}
      activeWasmEngine = null;
    }

    const isVercelEnvironment = !!process.env.VERCEL;
    const useNative = !isVercelEnvironment && fs.existsSync(/* turbopackIgnore: true */ localEnginePath);

    const results = await new Promise<{ best: any[], worst: any[], positionEval: any }>((resolve, reject) => {
      const allMoves: Record<number, { depth: number; data: any }> = {};
      let cleanedUp = false;

      const handleParsedLine = (line: string, cleanup: () => void) => {
        if (cleanedUp) return;

        if (line.includes('info') && line.includes('multipv')) {
          const depthMatch = line.match(/\bdepth (\d+)\b/);
          const multiPvMatch = line.match(/\bmultipv (\d+)\b/);
          const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)\b/);
          const pvMatch = line.match(/\bpv (.+)/);

          if (depthMatch && multiPvMatch && scoreMatch && pvMatch) {
            const lineDepth = parseInt(depthMatch[1]);
            const multiPvIndex = parseInt(multiPvMatch[1]);
            const scoreType = scoreMatch[1];
            const scoreVal = parseInt(scoreMatch[2]);
            const pv = pvMatch[1].trim().split(/\s+/);

            if (pv.length > 0 && pv[0]) {
              const existing = allMoves[multiPvIndex];
              if (!existing || lineDepth >= existing.depth) {
                let numericScore = 0;
                if (scoreType === 'mate') {
                  numericScore = scoreVal > 0 ? 100000 - scoreVal : -100000 - scoreVal;
                } else {
                  numericScore = scoreVal;
                }

                let evalWhiteStr = '';
                if (scoreType === 'mate') {
                  const whiteMate = activeColor === 'b' ? -scoreVal : scoreVal;
                  evalWhiteStr = whiteMate > 0 ? `#M${whiteMate}` : whiteMate < 0 ? `-#M${Math.abs(whiteMate)}` : '#M0';
                } else {
                  const whiteCp = activeColor === 'b' ? -scoreVal : scoreVal;
                  const val = whiteCp / 100;
                  evalWhiteStr = val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
                }

                allMoves[multiPvIndex] = {
                  depth: lineDepth,
                  data: {
                    move: pv[0],
                    rawScore: scoreVal,
                    scoreType: scoreType,
                    scoreStr: scoreType === 'mate' ? `Mate in ${Math.abs(scoreVal)}` : `${(scoreVal / 100).toFixed(2)}`,
                    evalWhiteStr: evalWhiteStr,
                    numericScore: numericScore,
                    multiPvIndex: multiPvIndex,
                    pv: pv
                  }
                };
              }
            }
          }
        }

        if (line.includes('bestmove')) {
          cleanup();

          const moveEntries = Object.values(allMoves);
          const validEntries = moveEntries.map(e => e.data);

          validEntries.sort((a, b) => a.multiPvIndex - b.multiPvIndex);

          const best = validEntries.slice(0, moveCount).map((m, i) => ({ ...m, rank: i + 1 }));
          const worst = includeWorst ? validEntries.slice(-moveCount).reverse().map((m, i) => ({ ...m, rank: i + 1 })) : [];

          const topMove = best[0];
          const positionEval = topMove ? {
            scoreStr: topMove.scoreStr,
            evalWhiteStr: topMove.evalWhiteStr,
            numericScore: topMove.numericScore,
            scoreType: topMove.scoreType,
            rawScore: topMove.rawScore
          } : {
            scoreStr: '0.00',
            evalWhiteStr: '0.00',
            numericScore: 0,
            scoreType: 'cp',
            rawScore: 0
          };

          resolve({ best, worst, positionEval });
        }
      };

      // Limit MultiPV value to at most 15-20 moves to keep Stockfish ultra-fast and prevent CPU lockup
      const multiPvValue = includeWorst ? Math.min(Math.max(moveCount, 12), 20) : Math.min(moveCount, 12);

      if (useNative) {
        // --- NATIVE BINARY MODE (Local Windows PC) ---
        const stockfish = spawn(/*turbopackIgnore: true*/ localEnginePath);
        activeStockfish = stockfish;

        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          clearTimeout(timeout);
          try {
            stockfish.stdin?.write('quit\n');
            stockfish.kill();
          } catch (e) {}
          if (activeStockfish === stockfish) activeStockfish = null;
        };

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Engine evaluation timed out'));
        }, 30000);

        if (req.signal) {
          req.signal.addEventListener('abort', () => {
            cleanup();
            reject(new Error('Request aborted by client'));
          });
        }

        let buffer = '';
        stockfish.stdout.on('data', (data: Buffer | string) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (let line of lines) {
            line = line.trim();
            if (line) {
              handleParsedLine(line, cleanup);
            }
          }
        });

        stockfish.stderr.on('data', (data: Buffer | string) => {
          console.error(`Stockfish stderr: ${data}`);
        });

        stockfish.on('error', (err: Error) => {
          cleanup();
          reject(err);
        });

        stockfish.stdin.write('uci\n');
        stockfish.stdin.write(`setoption name MultiPV value ${multiPvValue}\n`);
        stockfish.stdin.write(`position fen ${fen}\n`);
        stockfish.stdin.write(`go depth ${depth}\n`);

      } else {
        // --- WEBASSEMBLY (WASM) MODE (Vercel / Cloud Serverless) ---
        if (typeof initStockfishWasm !== 'function') {
          return reject(new Error('Stockfish WASM initializer is not available'));
        }

        (async () => {
          try {
            const engine = await initStockfishWasm('single');
            activeWasmEngine = engine;

            const cleanup = () => {
              if (cleanedUp) return;
              cleanedUp = true;
              clearTimeout(timeout);
              try { if (engine.terminate) engine.terminate(); } catch (e) {}
              if (activeWasmEngine === engine) activeWasmEngine = null;
            };

            const timeout = setTimeout(() => {
              cleanup();
              reject(new Error('Engine evaluation timed out'));
            }, 30000);

            if (req.signal) {
              req.signal.addEventListener('abort', () => {
                cleanup();
                reject(new Error('Request aborted by client'));
              });
            }

            engine.print = (line: string) => {
              if (typeof line === 'string') {
                handleParsedLine(line.trim(), cleanup);
              }
            };

            engine.sendCommand('uci');
            engine.sendCommand(`setoption name MultiPV value ${multiPvValue}`);
            engine.sendCommand(`position fen ${fen}`);
            engine.sendCommand(`go depth ${depth}`);

          } catch (wasmErr) {
            reject(wasmErr);
          }
        })();
      }
    });

    return NextResponse.json(results);

  } catch (error: any) {
    if (error.message === 'Request aborted by client') {
      return NextResponse.json({ aborted: true }, { status: 499 });
    }
    console.error('Error running engine:', error);
    return NextResponse.json({ error: 'Failed to evaluate position', details: error.message }, { status: 500 });
  }
}

