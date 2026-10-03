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
  private isInitializing: boolean = false;
  private currentReject: ((reason?: any) => void) | null = null;
  private activeScriptPath: string = '/stockfish/stockfish-19-asm.js';

  private initWorker(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        return reject(new Error('Web Workers are only available in the browser'));
      }

      try {
        const scriptPaths = [
          '/stockfish/stockfish-19-asm.js',
          '/stockfish/stockfish-19-lite-single.js',
          '/stockfish/stockfish.js',
        ];

        let loadedWorker: Worker | null = null;
        let lastErr: any = null;

        for (const path of scriptPaths) {
          try {
            loadedWorker = new Worker(path);
            this.activeScriptPath = path;
            break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (!loadedWorker) {
          return reject(lastErr || new Error('Failed to create Stockfish Web Worker'));
        }

        this.worker = loadedWorker;

        // Initialize UCI mode
        const initTimeout = setTimeout(() => {
          resolve(this.worker!);
        }, 500);

        const onInitMessage = (e: MessageEvent) => {
          const line = typeof e.data === 'string' ? e.data : '';
          if (line.includes('uciok')) {
            clearTimeout(initTimeout);
            this.worker?.removeEventListener('message', onInitMessage);
            resolve(this.worker!);
          }
        };

        this.worker.addEventListener('message', onInitMessage);
        this.worker.postMessage('uci');
      } catch (err) {
        reject(err);
      }
    });
  }

  public terminateCurrent() {
    if (this.currentReject) {
      this.currentReject(new Error('Evaluation cancelled'));
      this.currentReject = null;
    }
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
      } catch (e) {}
    }
  }

  public async evaluate(options: EvaluateOptions): Promise<EngineEvalResult> {
    const { fen, depth = 10, limit = 10, includeWorst = false, onProgress, signal } = options;
    const activeColor = fen.split(' ')[1] || 'w';
    const moveCount = typeof limit === 'number' && limit > 0 ? limit : 10;
    const multiPvValue = includeWorst ? Math.min(Math.max(moveCount, 12), 20) : Math.min(moveCount, 12);

    // Cancel any ongoing search in worker
    this.terminateCurrent();

    let worker: Worker;
    try {
      worker = await this.initWorker();
    } catch (e) {
      // Worker init failed, fallback will be handled by caller
      throw e;
    }

    return new Promise<EngineEvalResult>((resolve, reject) => {
      this.currentReject = reject;
      const allMoves: Record<number, { depth: number; data: EngineMoveData }> = {};
      let isDone = false;

      const cleanup = () => {
        if (isDone) return;
        isDone = true;
        this.currentReject = null;
        if (worker) {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
        }
      };

      if (signal) {
        if (signal.aborted) {
          cleanup();
          return reject(new Error('Evaluation cancelled'));
        }
        signal.addEventListener('abort', () => {
          cleanup();
          try { worker.postMessage('stop'); } catch (e) {}
          reject(new Error('Evaluation cancelled'));
        });
      }

      const buildResult = (): EngineEvalResult => {
        const moveEntries = Object.values(allMoves);
        const maxDepth = moveEntries.length > 0 ? Math.max(...moveEntries.map(e => e.depth)) : 0;

        const validEntries = moveEntries
          .filter(e => e.depth >= Math.max(1, maxDepth - 1))
          .map(e => e.data);

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
          cleanup();
          resolve(buildResult());
        }
      };

      const handleError = (err: ErrorEvent) => {
        cleanup();
        reject(err.error || new Error('Worker evaluation error'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      // Start engine search
      worker.postMessage('stop');
      worker.postMessage(`setoption name MultiPV value ${multiPvValue}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }
}

export const stockfishClient = new StockfishClient();
