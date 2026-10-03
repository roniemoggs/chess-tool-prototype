import { NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';

const enginePath = process.env.STOCKFISH_PATH || 'e:\\chess engine\\stockfish-windows-x86-64-universal\\stockfish\\stockfish-windows-x86-64-universal.exe';

// Keep track of the currently running Stockfish process to prevent multi-process CPU saturation
let activeStockfish: ChildProcess | null = null;

export async function POST(req: Request) {
  try {
    const { fen, depth = 10, limit = 10, includeWorst = false } = await req.json();

    if (!fen) {
      return NextResponse.json({ error: 'FEN string is required' }, { status: 400 });
    }

    const moveCount = typeof limit === 'number' && limit > 0 ? limit : 10;
    const activeColor = fen.split(' ')[1] || 'w';

    // Terminate any previous Stockfish process that is still running
    if (activeStockfish) {
      try {
        activeStockfish.kill();
      } catch (e) {}
      activeStockfish = null;
    }

    const results = await new Promise<{ best: any[], worst: any[], positionEval: any }>((resolve, reject) => {
      const stockfish = spawn(enginePath);
      activeStockfish = stockfish;
      
      const timeout = setTimeout(() => {
        try { stockfish.kill(); } catch (e) {}
        if (activeStockfish === stockfish) activeStockfish = null;
        reject(new Error('Engine evaluation timed out'));
      }, 20000);

      // Listen for client abort signal
      if (req.signal) {
        req.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          try { stockfish.kill(); } catch (e) {}
          if (activeStockfish === stockfish) activeStockfish = null;
          reject(new Error('Request aborted by client'));
        });
      }

      // Map multiPvIndex -> { depth, data }
      const allMoves: Record<number, { depth: number; data: any }> = {};
      let buffer = '';

      stockfish.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete trailing fragment in buffer
        
        for (const line of lines) {
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
                // Only update if this line depth is greater or equal to existing entry depth
                if (!existing || lineDepth >= existing.depth) {
                  let numericScore = 0;
                  if (scoreType === 'mate') {
                    numericScore = scoreVal > 0 ? 100000 - scoreVal : -100000 - scoreVal;
                  } else {
                    numericScore = scoreVal;
                  }

                  // Calculate white-perspective evaluation score string
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
            clearTimeout(timeout);
            try { stockfish.kill(); } catch (e) {}
            if (activeStockfish === stockfish) activeStockfish = null;
            
            const moveEntries = Object.values(allMoves);
            const maxDepth = moveEntries.length > 0 ? Math.max(...moveEntries.map(e => e.depth)) : 0;
            
            // Filter moves evaluated near max depth (within 1 depth level)
            const validEntries = moveEntries
              .filter(e => e.depth >= Math.max(1, maxDepth - 1))
              .map(e => e.data);

            // Sort strictly by multiPvIndex ascending (1 is Stockfish's top move, 2 is second best...)
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
        }
      });

      stockfish.stderr.on('data', (data) => {
        console.error(`Stockfish error: ${data}`);
      });

      stockfish.on('error', (err) => {
        clearTimeout(timeout);
        if (activeStockfish === stockfish) activeStockfish = null;
        reject(err);
      });

      const multiPvValue = includeWorst ? 255 : moveCount;

      stockfish.stdin.write('uci\n');
      stockfish.stdin.write(`setoption name MultiPV value ${multiPvValue}\n`);
      stockfish.stdin.write(`position fen ${fen}\n`);
      stockfish.stdin.write(`go depth ${depth}\n`);
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
