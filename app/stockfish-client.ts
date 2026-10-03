export interface EngineMoveData {
  move: string;
  rawScore: number;
  scoreType: 'cp' | 'mate' | string;
  scoreStr: string;
  evalWhiteStr: string;
  numericScore: number;
  multiPvIndex: number;
  pv: string[];
  rank?: number;
}

export interface EngineEvalResult {
  best: EngineMoveData[];
  worst: EngineMoveData[];
  positionEval: {
    scoreStr: string;
    evalWhiteStr: string;
    numericScore: number;
    scoreType: string;
    rawScore: number;
  };
}

export interface EvaluateOptions {
  fen: string;
  depth?: number;
  limit?: number;
  includeWorst?: boolean;
  onProgress?: (result: EngineEvalResult) => void;
  signal?: AbortSignal;
}

class StockfishClient {
  private worker: Worker | null = null;
  private currentReject: ((reason?: any) => void) | null = null;
  private activeScriptPath: string = '/stockfish/stockfish-19-asm.js';

  public terminateCurrent() {
    if (this.currentReject) {
      this.currentReject(new Error('Evaluation cancelled'));
      this.currentReject = null;
    }
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {}
      this.worker = null;
    }
  }

  public async evaluate(options: EvaluateOptions): Promise<EngineEvalResult> {
    const { fen, depth = 10, limit = 10, includeWorst = false, onProgress, signal } = options;
    const activeColor = fen.split(' ')[1] || 'w';
    const moveCount = typeof limit === 'number' && limit > 0 ? limit : 10;
    const multiPvValue = includeWorst ? Math.min(Math.max(moveCount, 12), 20) : Math.min(moveCount, 12);

    // Cancel and terminate any active previous worker search cleanly
    this.terminateCurrent();

    return new Promise<EngineEvalResult>((resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(new Error('Web Workers are only available in the browser'));
      }

      this.currentReject = reject;
      const allMoves: Record<number, { depth: number; data: EngineMoveData }> = {};
      let isDone = false;

      let worker: Worker;
      try {
        worker = new Worker(this.activeScriptPath);
        this.worker = worker;
      } catch (err) {
        this.currentReject = null;
        return reject(err);
      }

      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        this.currentReject = null;
        if (this.worker === worker) {
          try { worker.terminate(); } catch (e) {}
          this.worker = null;
        }
      };

      if (signal) {
        if (signal.aborted) {
          cleanup();
          return reject(new Error('Evaluation cancelled'));
        }
        signal.addEventListener('abort', () => {
          cleanup();
          reject(new Error('Evaluation cancelled'));
        });
      }

      const buildResult = (): EngineEvalResult => {
        const moveEntries = Object.values(allMoves);
        const validEntries = moveEntries.map(e => e.data);

        // Sort by MultiPV rank order (#1, #2, #3, ...)
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

        return { best, worst, positionEval };
      };

      const handleMessage = (e: MessageEvent) => {
        if (isDone) return;
        const line = typeof e.data === 'string' ? e.data.trim() : '';
        if (!line) return;

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

                if (onProgress) {
                  onProgress(buildResult());
                }
              }
            }
          }
        }

        if (line.includes('bestmove')) {
          const finalResult = buildResult();
          cleanup();
          resolve(finalResult);
        }
      };

      const handleError = (err: ErrorEvent) => {
        cleanup();
        reject(err.error || new Error('Worker evaluation error'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      // Start engine commands sequence
      worker.postMessage('uci');
      worker.postMessage(`setoption name MultiPV value ${multiPvValue}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }
}

export const stockfishClient = new StockfishClient();
