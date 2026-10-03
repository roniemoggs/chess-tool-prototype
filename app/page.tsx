'use client';

import { useState, useEffect, useRef } from 'react';
import { Chess, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { stockfishClient } from './stockfish-client';

interface CustomArrowData {
  id: string;
  startSquare: string;
  endSquare: string;
  color: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  label: string;
  type: 'best' | 'worst';
  moveString: string;
}

type DifficultyCategory = 'Obvious' | 'Easy' | 'Normal' | 'Tricky' | 'Hard';

interface DifficultyPresetRange {
  min: number;
  max: number;
}

type DifficultyPresetsMap = Record<DifficultyCategory, DifficultyPresetRange>;

const DEFAULT_DIFFICULTY_PRESETS: DifficultyPresetsMap = {
  Obvious: { min: 0, max: 3 },
  Easy: { min: 3, max: 10 },
  Normal: { min: 8, max: 30 },
  Tricky: { min: 3, max: 15 },
  Hard: { min: 9, max: 30 },
};


function CustomChessArrows({
  arrows,
  hoveredMove,
  orientation = 'white',
}: {
  arrows: CustomArrowData[];
  hoveredMove: string | null;
  orientation?: 'white' | 'black';
}) {
  if (!arrows || arrows.length === 0) return null;

  function getSquareCenter(sq: string) {
    const file = sq.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
    const rank = parseInt(sq[1], 10);   // 1 to 8

    let col = file;
    let row = 8 - rank;

    if (orientation === 'black') {
      col = 7 - file;
      row = rank - 1;
    }

    return {
      x: (col + 0.5) * 12.5,
      y: (row + 0.5) * 12.5,
    };
  }

  // Pre-calculate geometry for all arrows
  const arrowGeometries = arrows.map((arrow) => {
    const start = getSquareCenter(arrow.startSquare);
    const end = getSquareCenter(arrow.endSquare);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const isHovered = hoveredMove === arrow.moveString;
    // Translucent shafts by default (0.55 opacity), bright on hover (0.95), dim when non-hovered (0.18)
    const shaftOpacity = hoveredMove ? (isHovered ? 0.95 : 0.18) : 0.55;
    const badgeOpacity = hoveredMove ? (isHovered ? 1 : 0.3) : 0.95;

    const sx = start.x + ux * 2.2;
    const sy = start.y + uy * 2.2;

    const ex = end.x - ux * 2.2;
    const ey = end.y - uy * 2.2;

    const headLength = Math.min(4.0, dist * 0.35);
    const headWidth = 3.8;

    const bx = ex - ux * headLength;
    const by = ey - uy * headLength;

    const hx1 = bx + nx * (headWidth / 2);
    const hy1 = by + ny * (headWidth / 2);
    const hx2 = bx - nx * (headWidth / 2);
    const hy2 = by - ny * (headWidth / 2);

    const badgeRadius = isHovered ? 3.1 : 2.5;

    const badgeOffsetFromTip = Math.min(dist * 0.65, headLength + badgeRadius + 0.5);
    const badgeX = ex - ux * badgeOffsetFromTip;
    const badgeY = ey - uy * badgeOffsetFromTip;

    return {
      arrow,
      isHovered,
      shaftOpacity,
      badgeOpacity,
      sx, sy, ex, ey, bx, by,
      hx1, hy1, hx2, hy2,
      badgeX, badgeY, badgeRadius
    };
  }).filter(Boolean);

  // Sort so hovered arrow is drawn last (topmost)
  const sortedGeometries = [...arrowGeometries].sort((a: any, b: any) => {
    if (a.isHovered) return 1;
    if (b.isHovered) return -1;
    return 0;
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="arrow-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <filter id="badge-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="1.0" floodColor="#000000" floodOpacity="0.85" />
        </filter>
      </defs>

      {/* PASS 1: All Arrow Shafts & Arrowheads (Translucent) */}
      <g filter="url(#arrow-shadow)">
        {sortedGeometries.map((geo: any) => (
          <g key={`shaft-${geo.arrow.id}`} style={{ transition: 'all 0.15s ease-in-out' }}>
            {/* Arrow shaft line */}
            <line
              x1={geo.sx}
              y1={geo.sy}
              x2={geo.bx}
              y2={geo.by}
              stroke={geo.arrow.color}
              strokeWidth={geo.isHovered ? '2.5' : '1.9'}
              strokeLinecap="round"
              opacity={geo.shaftOpacity}
            />

            {/* Arrowhead polygon */}
            <polygon
              points={`${geo.ex},${geo.ey} ${geo.hx1},${geo.hy1} ${geo.hx2},${geo.hy2}`}
              fill={geo.arrow.color}
              opacity={geo.shaftOpacity}
            />
          </g>
        ))}
      </g>

      {/* PASS 2: All Number Badges (Rendered ON TOP of all shafts) */}
      <g filter="url(#badge-shadow)">
        {sortedGeometries.map((geo: any) => (
          <g
            key={`badge-${geo.arrow.id}`}
            transform={`translate(${geo.badgeX}, ${geo.badgeY})`}
            opacity={geo.badgeOpacity}
            style={{ transition: 'all 0.15s ease-in-out' }}
          >
            {/* Outer stroke ring */}
            <circle
              r={geo.badgeRadius + 0.35}
              fill={geo.isHovered ? '#ffffff' : geo.arrow.badgeBorder}
            />
            {/* Main badge circle */}
            <circle
              r={geo.badgeRadius}
              fill={geo.isHovered ? (geo.arrow.type === 'best' ? '#15803d' : '#991b1b') : geo.arrow.badgeBg}
            />
            {/* Number Label */}
            <text
              x="0"
              y="0.1"
              fill={geo.arrow.badgeText}
              fontSize={geo.isHovered ? (geo.arrow.label.length > 1 ? '2.3' : '2.8') : (geo.arrow.label.length > 1 ? '1.9' : '2.4')}
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {geo.arrow.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function Home() {
  const [game, setGame] = useState(new Chess());
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [stockfishEnabled, setStockfishEnabled] = useState(true);
  const [moveLimit, setMoveLimit] = useState<5 | 10>(10);
  const [gameMode, setGameMode] = useState<'standard' | 'random'>('standard');
  const [evaluating, setEvaluating] = useState(false);
  const [bestMoves, setBestMoves] = useState<any[]>([]);
  const [randomGoodMoves, setRandomGoodMoves] = useState<any[]>([]);
  const [worstMoves, setWorstMoves] = useState<any[]>([]);
  const [positionEval, setPositionEval] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  // Reset Board Confirmation Modal state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  
  // Random Bad Move Feature state
  const [randomBadMoveEnabled, setRandomBadMoveEnabled] = useState(false);
  const [consecutiveGoodMoves, setConsecutiveGoodMoves] = useState(0);
  const [isBadMoveActive, setIsBadMoveActive] = useState(false);
  const [activeBadMove, setActiveBadMove] = useState<any>(null);

  // Timing Feature state for Move Suggestions in Random Mode
  const [timingEnabled, setTimingEnabled] = useState(false);
  const [connectDifficultyDelay, setConnectDifficultyDelay] = useState(false);
  const [difficultyPresets, setDifficultyPresets] = useState<DifficultyPresetsMap>(DEFAULT_DIFFICULTY_PRESETS);
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [isDelaying, setIsDelaying] = useState(false);
  const [delayRemaining, setDelayRemaining] = useState(0);
  const [totalDelay, setTotalDelay] = useState(0);

  const delayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const delayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleMinDelayChange = (val: number) => {
    const clamped = Math.max(0, Math.min(60, val));
    setMinDelay(clamped);
    if (clamped > maxDelay) {
      setMaxDelay(clamped);
    }
  };

  const handleMaxDelayChange = (val: number) => {
    const clamped = Math.max(0, Math.min(60, val));
    setMaxDelay(clamped);
    if (clamped < minDelay) {
      setMinDelay(clamped);
    }
  };

  const handleDifficultyPresetChange = (
    cat: DifficultyCategory,
    field: 'min' | 'max',
    value: number
  ) => {
    const val = Math.max(0, Math.min(60, isNaN(value) ? 0 : value));
    setDifficultyPresets((prev) => {
      const current = prev[cat];
      let newMin = field === 'min' ? val : current.min;
      let newMax = field === 'max' ? val : current.max;

      if (field === 'min' && newMin > newMax) {
        newMax = newMin;
      } else if (field === 'max' && newMax < newMin) {
        newMin = newMax;
      }

      return {
        ...prev,
        [cat]: { min: newMin, max: newMax },
      };
    });
  };

  const handleResetDifficultyPresets = () => {
    setDifficultyPresets(DEFAULT_DIFFICULTY_PRESETS);
  };

  function clearDelayTimers() {
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (delayIntervalRef.current) {
      clearInterval(delayIntervalRef.current);
      delayIntervalRef.current = null;
    }
    setIsDelaying(false);
    setDelayRemaining(0);
  }

  function triggerSuggestionDelay(overrideMin?: number, overrideMax?: number, movesOverride?: any[]) {
    clearDelayTimers();

    if (gameMode !== 'random') {
      setIsDelaying(false);
      return;
    }

    let minSec = overrideMin !== undefined ? overrideMin : minDelay;
    let maxSec = overrideMax !== undefined ? overrideMax : maxDelay;

    if (overrideMin === undefined && overrideMax === undefined && connectDifficultyDelay) {
      const movesToUse = movesOverride || bestMoves;
      const diff = getPositionDifficulty(movesToUse);
      const cat: DifficultyCategory = diff?.catName || 'Normal';
      const preset = difficultyPresets[cat] || DEFAULT_DIFFICULTY_PRESETS['Normal'];
      minSec = preset.min;
      maxSec = preset.max;
    }

    const safeMin = Math.max(0, Math.min(60, minSec));
    const safeMax = Math.max(safeMin, Math.min(60, maxSec));

    const randomSec = safeMin + Math.random() * (safeMax - safeMin);
    const chosenDelaySec = Math.min(60, Math.max(0, Math.round(randomSec)));

    if (chosenDelaySec <= 0) {
      setIsDelaying(false);
      return;
    }

    setIsDelaying(true);
    setTotalDelay(chosenDelaySec);
    setDelayRemaining(chosenDelaySec);

    const startTime = Date.now();
    const endTime = startTime + chosenDelaySec * 1000;

    delayIntervalRef.current = setInterval(() => {
      const remainingMs = endTime - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setDelayRemaining(remainingSec);

      if (remainingMs <= 0) {
        if (delayIntervalRef.current) {
          clearInterval(delayIntervalRef.current);
          delayIntervalRef.current = null;
        }
        setIsDelaying(false);
      }
    }, 200);

    delayTimerRef.current = setTimeout(() => {
      clearDelayTimers();
    }, chosenDelaySec * 1000);
  }

  useEffect(() => {
    return () => {
      clearDelayTimers();
    };
  }, []);

  // Arrow filters & hover state
  const [showBest, setShowBest] = useState(true);
  const [showWorst, setShowWorst] = useState(true);
  const [hoveredMove, setHoveredMove] = useState<string | null>(null);

  // Click-to-move & move preview state
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  const reqIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper to determine good move pool size based on exception conditions
  function getGoodMovePoolLimit(historyCount?: number): { limit: number; condition: string } {
    const hCount = typeof historyCount === 'number' ? historyCount : game.history().length;
    const ourMovesCount = Math.floor(hCount / 2);

    // Condition 1 — First 3 Moves: Select suggestions only from Top 1–2 moves
    if (ourMovesCount < 3) {
      return {
        limit: 2,
        condition: `Condition 1 (Move ${ourMovesCount + 1}/3): Top 1–2`,
      };
    }

    // Standard Rule 2: Top 1–5
    return {
      limit: 5,
      condition: 'Rule 2: Top 1–5',
    };
  }

  // Good Move Selection Logic (supports Condition 2: Forced Mate in <= 3 or Obvious positions, Condition 1: First 3 moves, and Rule 2)
  function pickTwoRandomGoodMoves(moves: any[], historyCount?: number) {
    if (!moves || moves.length === 0) return [];

    const topMove = moves[0];
    // Condition 2 — Forced Checkmate in 3 or Less (Highest Priority)
    if (topMove && topMove.scoreType === 'mate' && topMove.rawScore > 0 && topMove.rawScore <= 3) {
      return [topMove];
    }

    // Obvious Position Exception — strictly suggest only Top 1 move when position is Obvious
    const diff = getPositionDifficulty(moves);
    if (diff && diff.catName === 'Obvious') {
      return [topMove];
    }

    const { limit } = getGoodMovePoolLimit(historyCount);
    const pool = moves.slice(0, limit);

    if (pool.length <= 2) {
      return [...pool].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    }

    const idx1 = Math.floor(Math.random() * pool.length);
    let idx2 = Math.floor(Math.random() * (pool.length - 1));
    if (idx2 >= idx1) idx2++;

    return [pool[idx1], pool[idx2]].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  }

  // Selection logic for Random Bad Move Feature
  function selectMoveSuggestions(
    best: any[],
    worst: any[],
    goodCount: number,
    featureEnabled: boolean,
    historyCount?: number
  ) {
    if (!best || best.length === 0) {
      return { moves: [], isBadMove: false, badMove: null };
    }

    if (featureEnabled) {
      // Rule 1: High probability (~95% good moves, 5% bad moves) for 1–17 consecutive good moves
      // Rule 2: After 18 consecutive good moves, 50% probability of selecting a random bad move
      const triggerProb = goodCount >= 18 ? 0.50 : 0.05;
      const shouldTriggerBad = Math.random() < triggerProb;

      if (shouldTriggerBad && worst && worst.length > 0) {
        // Triggered Bad Move Pool Range: strictly select from the 9th or 10th move (or fallback to last 2 moves)
        const badPool = worst.length >= 10
          ? worst.slice(8, 10)
          : worst.slice(Math.max(0, worst.length - 2));
        const randomIdx = Math.floor(Math.random() * badPool.length);
        const badMoveObj = { ...badPool[randomIdx], isTriggeredBadMove: true };
        return { moves: [badMoveObj], isBadMove: true, badMove: badMoveObj };
      }
    }

    const goodMoves = pickTwoRandomGoodMoves(best, historyCount);
    return { moves: goodMoves, isBadMove: false, badMove: null };
  }

  // Helper to compute position difficulty index (Obvious, Easy, Normal, Tricky, Hard)
  function getPositionDifficulty(moves: any[]) {
    if (!moves || moves.length === 0) return null;

    const topMove = moves[0];
    const secondMove = moves[1];
    const topScore = topMove?.numericScore || 0;
    const secondScore = secondMove ? secondMove.numericScore : null;
    const gapToSecond = secondScore !== null ? Math.abs(topScore - secondScore) : 9999;
    const goodMovesCount = moves.filter((m) => Math.abs(topScore - m.numericScore) <= 50).length;

    let catName: 'Obvious' | 'Easy' | 'Normal' | 'Tricky' | 'Hard' = 'Normal';
    let subLabel = '';
    let bBg = 'bg-amber-950/90';
    let bTxt = 'text-amber-300';
    let bBdr = 'border-amber-600/80';
    let iconTag = '🟡';
    let detailText = '';

    // Rule 1: Obvious — Forced move, short checkmate, OR High-Eval Win (+4.0+) where you either have multiple winning moves or capture a free major piece
    if (
      moves.length === 1 ||
      (topMove.scoreType === 'mate' && Math.abs(topMove.rawScore) <= 3) ||
      (topScore >= 400 && secondScore !== null && secondScore >= 250) || // Blowout win (+4.0+ eval, 2nd move also winning)
      (topScore >= 400 && gapToSecond >= 300) // Winning capture (+4.0+ eval with 3.0+ pts drop = free hanging piece/rook/queen)
    ) {
      catName = 'Obvious';
      subLabel = topScore >= 400 ? 'Overwhelming Lead / Free Piece Capture' : 'Automatic / Forced Move';
      bBg = 'bg-emerald-950/90';
      bTxt = 'text-emerald-300';
      bBdr = 'border-emerald-600/80';
      iconTag = '⚡';
      detailText = topScore >= 400
        ? `Position is completely winning (${(topScore / 100).toFixed(2)}). Taking hanging piece or simple winning line is straightforward.`
        : 'Only 1 natural or forced move exists in this position. Zero chance to blunder.';
    }
    // Rule 2: Easy — Solid advantage (+2.5+) with multiple good options
    else if (
      goodMovesCount >= 3 ||
      gapToSecond <= 35 ||
      (topScore >= 250 && secondScore !== null && secondScore >= 150)
    ) {
      catName = 'Easy';
      subLabel = topScore >= 250 ? 'Crushing Advantage / High Room for Error' : 'Forgiving / Multiple Good Moves';
      bBg = 'bg-green-950/90';
      bTxt = 'text-green-300';
      bBdr = 'border-green-600/80';
      iconTag = '🟢';
      detailText = `${goodMovesCount > 1 ? goodMovesCount : 'Multiple'} candidate moves maintain a comfortable advantage. Low risk of error.`;
    }
    // Rule 3: Normal — Standard middle-game calculation
    else if (gapToSecond > 35 && gapToSecond < 130) {
      catName = 'Normal';
      subLabel = 'Standard Calculation';
      bBg = 'bg-amber-950/90';
      bTxt = 'text-amber-300';
      bBdr = 'border-amber-600/80';
      iconTag = '🟡';
      detailText = '1 to 2 clear candidate moves exist. Standard tactical and positional calculation required.';
    }
    // Rule 4: Tricky — Sharp "Only Move" in tight positions
    else if (gapToSecond >= 130 && gapToSecond < 280) {
      catName = 'Tricky';
      subLabel = 'Sharp / Only 1 Good Move';
      bBg = 'bg-rose-950/90';
      bTxt = 'text-rose-300';
      bBdr = 'border-rose-600/80';
      iconTag = '🔴';
      detailText = `Razor-thin precision needed! Only #1 move works; 2nd best drops eval by ${(gapToSecond / 100).toFixed(2)} pts.`;
    }
    // Rule 5: Hard — Deep tactic / tightrope in tight positions
    else {
      catName = 'Hard';
      subLabel = 'Deep Tactic / Tightrope';
      bBg = 'bg-purple-950/90';
      bTxt = 'text-purple-300';
      bBdr = 'border-purple-600/80';
      iconTag = '🟣';
      detailText = `Extreme tightrope line. Missing the best move results in a severe blunder (drop of ${(gapToSecond / 100).toFixed(2)} pts).`;
    }

    let oppCatName = 'Normal';
    let oppBadgeClass = 'bg-amber-950 text-amber-300 border-amber-800';
    if (catName === 'Tricky' || catName === 'Hard') {
      oppCatName = 'Tricky';
      oppBadgeClass = 'bg-rose-950 text-rose-300 border-rose-800';
    } else if (catName === 'Easy' || catName === 'Obvious') {
      oppCatName = 'Easy';
      oppBadgeClass = 'bg-green-950 text-green-300 border-green-800';
    }

    return {
      catName,
      subLabel,
      bBg,
      bTxt,
      bBdr,
      iconTag,
      detailText,
      gapToSecond,
      goodMovesCount,
      oppCatName,
      oppBadgeClass,
    };
  }

  // Helper to compute side-specific difficulty badges for White and Black
  function getSideDifficultyInfo(targetSide: 'w' | 'b') {
    if (!stockfishEnabled || !bestMoves || bestMoves.length === 0) {
      return {
        label: evaluating ? 'CALCULATING' : 'OFF',
        bg: 'bg-gray-900/90',
        txt: 'text-gray-400',
        bdr: 'border-gray-800',
        icon: evaluating ? '⚙️' : '⚪',
        subLabel: evaluating ? 'Evaluating position...' : 'Stockfish engine is off',
      };
    }

    const diff = getPositionDifficulty(bestMoves);
    if (!diff) return null;

    const isActiveSide = game.turn() === targetSide;

    if (isActiveSide) {
      return {
        label: diff.catName.toUpperCase(),
        bg: diff.bBg,
        txt: diff.bTxt,
        bdr: diff.bBdr,
        icon: diff.iconTag,
        subLabel: diff.subLabel,
      };
    } else {
      const isTricky = diff.oppCatName === 'Tricky';
      const isEasy = diff.oppCatName === 'Easy';
      return {
        label: diff.oppCatName.toUpperCase(),
        bg: isTricky ? 'bg-rose-950/90' : isEasy ? 'bg-green-950/90' : 'bg-amber-950/90',
        txt: isTricky ? 'text-rose-300' : isEasy ? 'text-green-300' : 'text-amber-300',
        bdr: isTricky ? 'border-rose-600/80' : isEasy ? 'border-green-600/80' : 'border-amber-600/80',
        icon: isTricky ? '🔴' : isEasy ? '🟢' : '🟡',
        subLabel: isTricky ? 'High Pressure' : isEasy ? 'Comfortable' : 'Standard',
      };
    }
  }

  function makeAMoveFromUCI(uciMoveStr: string) {
    if (!uciMoveStr || uciMoveStr.length < 4) return;
    const from = uciMoveStr.substring(0, 2);
    const to = uciMoveStr.substring(2, 4);
    const promotion = uciMoveStr.length > 4 ? uciMoveStr[4] : 'q';
    makeAMove({ from, to, promotion });
  }

  // Re-evaluate or re-run move selection when Random Bad Move Feature state changes
  useEffect(() => {
    if (stockfishEnabled && !game.isGameOver()) {
      evaluatePosition();
    } else if (bestMoves.length > 0) {
      if (!randomBadMoveEnabled) setWorstMoves([]);
      const selection = selectMoveSuggestions(
        bestMoves,
        randomBadMoveEnabled ? worstMoves : [],
        consecutiveGoodMoves,
        randomBadMoveEnabled
      );
      setRandomGoodMoves(selection.moves);
      setIsBadMoveActive(selection.isBadMove);
      setActiveBadMove(selection.badMove);
    }
  }, [randomBadMoveEnabled]);

  // Auto-evaluate when game state, Stockfish toggle, game mode, or move limit changes
  useEffect(() => {
    if (stockfishEnabled && !game.isGameOver()) {
      evaluatePosition(game.fen());
    } else if (!stockfishEnabled) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      reqIdRef.current++;
      setBestMoves([]);
      setRandomGoodMoves([]);
      setWorstMoves([]);
      setPositionEval(null);
      setEvaluating(false);
      clearDelayTimers();
    }
  }, [game, stockfishEnabled, gameMode, boardOrientation, moveLimit]);

  // Synchronize randomGoodMoves when entering random mode
  useEffect(() => {
    if (gameMode === 'random' && bestMoves.length > 0 && randomGoodMoves.length === 0) {
      setRandomGoodMoves(pickTwoRandomGoodMoves(bestMoves));
    }
  }, [gameMode, bestMoves, randomGoodMoves.length]);

  // Helper to get legal moves for highlighting
  function getMoveOptions(square: Square) {
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
    moves.forEach((move) => {
      const isCapture = game.get(move.to as Square);
      newSquares[move.to] = {
        background: isCapture
          ? 'radial-gradient(circle, rgba(239, 68, 68, 0.8) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(34, 197, 94, 0.7) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
    newSquares[square] = {
      background: 'rgba(234, 179, 8, 0.5)',
    };
    setOptionSquares(newSquares);
    return true;
  }

  function cloneGame(gameInstance: Chess): Chess {
    const copy = new Chess();
    try {
      if (gameInstance.history().length > 0) {
        copy.loadPgn(gameInstance.pgn());
      } else {
        copy.load(gameInstance.fen());
      }
    } catch {
      copy.load(gameInstance.fen());
    }
    return copy;
  }

  // Core move execution logic
  function makeAMove(move: { from: string; to: string; promotion?: string }) {
    const gameCopy = cloneGame(game);
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);
        setErrorMessage('');
        setMoveFrom(null);
        setOptionSquares({});
        setHoveredMove(null);
        clearDelayTimers();
        setBestMoves([]);
        setRandomGoodMoves([]);
        setWorstMoves([]);

        if (randomBadMoveEnabled) {
          if (isBadMoveActive) {
            setConsecutiveGoodMoves(0);
            setIsBadMoveActive(false);
            setActiveBadMove(null);
          } else {
            setConsecutiveGoodMoves((prev) => prev + 1);
          }
        }

        return result;
      }
    } catch (e: any) {
      // Catch invalid move silently
    }
    return null;
  }

  // Handle drag and drop
  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (!sourceSquare || !targetSquare) return false;

    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });

    return move !== null;
  }

  // Handle click to move
  function onSquareClick({ square }: { square: string }) {
    const sq = square as Square;
    if (!sq) return;

    if (!moveFrom) {
      const hasMoves = getMoveOptions(sq);
      if (hasMoves) setMoveFrom(sq);
      return;
    }

    if (moveFrom === sq) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    const move = makeAMove({
      from: moveFrom,
      to: sq,
      promotion: 'q',
    });

    if (move) return;

    const hasMoves = getMoveOptions(sq);
    if (hasMoves) {
      setMoveFrom(sq);
    } else {
      setMoveFrom(null);
      setOptionSquares({});
    }
  }

  async function evaluatePosition(fenToEval?: string) {
    const reqId = ++reqIdRef.current;
    const fen = fenToEval || game.fen();

    // Abort previous in-flight engine request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stockfishClient.terminateCurrent();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setEvaluating(true);
    setErrorMessage('');
    setHoveredMove(null);

    const effectiveLimit = (moveLimit === 5 && !randomBadMoveEnabled) ? 5 : 10;

    const handleDataUpdate = (data: any) => {
      if (reqId !== reqIdRef.current) return;

      if (data.best) {
        setBestMoves(data.best);
        const worstList = data.worst || [];
        setWorstMoves(worstList);

        const ourColor = boardOrientation === 'white' ? 'w' : 'b';
        const isOurTurn = gameMode !== 'random' || game.turn() === ourColor;

        if (isOurTurn) {
          const selection = selectMoveSuggestions(
            data.best,
            worstList,
            consecutiveGoodMoves,
            randomBadMoveEnabled
          );
          setRandomGoodMoves(selection.moves);
          setIsBadMoveActive(selection.isBadMove);
          setActiveBadMove(selection.badMove);

          if (gameMode === 'random' && timingEnabled) {
            triggerSuggestionDelay(undefined, undefined, data.best);
          } else {
            clearDelayTimers();
          }
        } else {
          setRandomGoodMoves([]);
          setIsBadMoveActive(false);
          setActiveBadMove(null);
          clearDelayTimers();
        }
      } else if (data.worst) {
        setWorstMoves(data.worst);
      }
      if (data.positionEval) setPositionEval(data.positionEval);
    };

    try {
      // 1. Primary: Fast Client-Side WebWorker Stockfish (like Lichess)
      try {
        const clientData = await stockfishClient.evaluate({
          fen,
          depth: 10,
          limit: effectiveLimit,
          includeWorst: randomBadMoveEnabled,
          signal: controller.signal,
          onProgress: (progressiveData) => {
            handleDataUpdate(progressiveData);
          }
        });
        handleDataUpdate(clientData);
        return;
      } catch (clientErr: any) {
        if (clientErr.message === 'Evaluation cancelled' || controller.signal.aborted) {
          return;
        }
        console.warn('Client-side Stockfish Worker unavailable, falling back to server API:', clientErr);
      }

      // 2. Secondary Fallback: Server API
      const response = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth: 10, limit: effectiveLimit, includeWorst: randomBadMoveEnabled }),
        signal: controller.signal,
      });

      if (reqId !== reqIdRef.current) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 499 || errorData.aborted) {
          return;
        }
        throw new Error(errorData.details || errorData.error || `Engine error: HTTP ${response.status}`);
      }

      const data = await response.json();
      handleDataUpdate(data);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Evaluation cancelled') {
        return;
      }
      if (reqId === reqIdRef.current) {
        console.error('Failed to evaluate position', error);
        setErrorMessage('Failed to evaluate position: ' + error.message);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setEvaluating(false);
      }
    }
  }

  function resetBoard() {
    clearDelayTimers();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    const newGame = new Chess();
    setGame(newGame);
    setBestMoves([]);
    setRandomGoodMoves([]);
    setWorstMoves([]);
    setPositionEval(null);
    setMoveFrom(null);
    setOptionSquares({});
    setErrorMessage('');
    setHoveredMove(null);
    setConsecutiveGoodMoves(0);
    setIsBadMoveActive(false);
    setActiveBadMove(null);
  }

  function undoMove() {
    clearDelayTimers();
    const gameCopy = cloneGame(game);
    const undone = gameCopy.undo();
    if (!undone) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reqIdRef.current++;
    setGame(gameCopy);
    setBestMoves([]);
    setRandomGoodMoves([]);
    setWorstMoves([]);
    setMoveFrom(null);
    setOptionSquares({});
    setErrorMessage('');
    setHoveredMove(null);
    setConsecutiveGoodMoves((prev) => Math.max(0, prev - 1));
    setIsBadMoveActive(false);
    setActiveBadMove(null);
  }

  const currentSideColor = boardOrientation === 'white' ? 'w' : 'b';
  const isPlayerTurnInRandom = gameMode !== 'random' || game.turn() === currentSideColor;

  // Good moves: in Random Mode, strictly 2 random moves for our side (hidden on opponent's turn or during countdown delay). In Standard Mode, Top 5 or 10.
  const displayedBestMoves = gameMode === 'random'
    ? (!isPlayerTurnInRandom || (timingEnabled && isDelaying) ? [] : randomGoodMoves)
    : bestMoves.slice(0, moveLimit);
  // Bad moves: in Random Mode, strictly hidden on opponent's turn so opponent moves/arrows are never shown.
  const displayedWorstMoves = gameMode === 'random'
    ? (!isPlayerTurnInRandom ? [] : worstMoves.slice(0, moveLimit))
    : worstMoves.slice(0, moveLimit);

  // Build custom numbered arrows list
  const customNumberedArrows: CustomArrowData[] = [];

  const bestColors = [
    '#22c55e', '#10b981', '#16a34a', '#059669', '#15803d',
    '#047857', '#166534', '#0f766e', '#14532d', '#115e59'
  ];
  const bestBadgeBgs = [
    '#16a34a', '#059669', '#15803d', '#047857', '#166534',
    '#0f766e', '#14532d', '#115e59', '#064e3b', '#134e4a'
  ];

  const worstColors = [
    '#ef4444', '#f43f5e', '#dc2626', '#e11d48', '#b91c1c',
    '#be123c', '#991b1b', '#9f1239', '#7f1d1d', '#881337'
  ];
  const worstBadgeBgs = [
    '#dc2626', '#e11d48', '#b91c1c', '#be123c', '#991b1b',
    '#9f1239', '#7f1d1d', '#881337', '#6b1212', '#4c0519'
  ];

  if (showBest) {
    displayedBestMoves.forEach((moveData, index) => {
      const source = moveData.move.substring(0, 2);
      const target = moveData.move.substring(2, 4);
      const rankNum = moveData.rank || index + 1;
      const colorIdx = Math.max(0, Math.min(bestColors.length - 1, rankNum - 1));
      const isTriggeredBad = moveData.isTriggeredBadMove;
      customNumberedArrows.push({
        id: `best-${moveData.move}-${index}`,
        startSquare: source,
        endSquare: target,
        color: isTriggeredBad ? '#f59e0b' : (bestColors[colorIdx] || '#22c55e'),
        badgeBg: isTriggeredBad ? '#d97706' : (bestBadgeBgs[colorIdx] || '#16a34a'),
        badgeText: '#ffffff',
        badgeBorder: isTriggeredBad ? '#78350f' : '#052e16',
        label: isTriggeredBad ? '⚠️' : `${rankNum}`,
        type: isTriggeredBad ? 'worst' : 'best',
        moveString: moveData.move,
      });
    });
  }

  if (showWorst) {
    displayedWorstMoves.forEach((moveData, index) => {
      const source = moveData.move.substring(0, 2);
      const target = moveData.move.substring(2, 4);
      customNumberedArrows.push({
        id: `worst-${index}`,
        startSquare: source,
        endSquare: target,
        color: worstColors[index] || '#ef4444',
        badgeBg: worstBadgeBgs[index] || '#dc2626',
        badgeText: '#ffffff',
        badgeBorder: '#450a0a',
        label: `${index + 1}`,
        type: 'worst',
        moveString: moveData.move,
      });
    });
  }

  const turnText = game.turn() === 'w' ? "White to Move" : "Black to Move";
  const isGameOver = game.isGameOver();
  let gameStatus = turnText;
  if (game.isCheckmate()) gameStatus = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} Wins!`;
  else if (game.isDraw()) gameStatus = "Draw!";
  else if (game.inCheck()) gameStatus += " (Check!)";

  // Eval bar percentage calculation (White percentage: 0% = black winning, 50% = equal, 100% = white winning)
  // Uses official Lichess/Chess.com winning-probability sigmoid curve: 2 / (1 + exp(-0.00368208 * cp)) - 1
  const getEvalBarWidth = () => {
    if (!positionEval || !positionEval.evalWhiteStr) return 50;
    const str = positionEval.evalWhiteStr;
    if (positionEval.scoreType === 'mate' || str.includes('#M')) {
      return str.startsWith('-') ? 0 : 100;
    }
    const val = parseFloat(str);
    if (isNaN(val)) return 50;

    const cp = val * 100;
    const winProb = (2 / (1 + Math.exp(-0.00368208 * cp))) - 1;
    const barPercent = 50 + (winProb * 50);
    return Math.max(0, Math.min(100, barPercent));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center py-8 font-sans select-none">
      <h1 className="text-4xl font-extrabold mb-1 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">
        Chess Mastery Analyzer
      </h1>
      <p className="text-gray-400 mb-4 text-sm">Interactive board • Real-time Stockfish live evaluation & move analysis</p>

      {/* Game Mode Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-gray-900 border border-gray-800 rounded-xl mb-6 shadow-xl backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setGameMode('standard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            gameMode === 'standard'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-950/70'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
          }`}
        >
          <span>♟️ Standard Mode</span>
        </button>
        <button
          type="button"
          onClick={() => setGameMode('random')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            gameMode === 'random'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-950/70 ring-1 ring-purple-400/40'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
          }`}
        >
          <span>🎲 Random Mode</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/90 text-purple-300 border border-purple-800/60 font-semibold tracking-wide">
            {gameMode === 'random' ? 'ACTIVE' : 'NEW'}
          </span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl px-4">
        {/* Left Column: Board */}
        <div className="flex-1 flex flex-col items-center">

          <div className="mb-3 flex items-center justify-between w-full max-w-[500px]">
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                game.turn() === 'w' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-100 border border-slate-700'
              }`}>
                {gameStatus}
              </span>
            </div>

            {/* Filter Toggles */}
            {(bestMoves.length > 0 || worstMoves.length > 0) && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBest(!showBest)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    showBest
                      ? 'bg-green-950 text-green-300 border-green-700 shadow-sm shadow-green-900/40'
                      : 'bg-gray-900 text-gray-500 border-gray-800 opacity-60'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${showBest ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                  Best Moves
                </button>
                <button
                  onClick={() => setShowWorst(!showWorst)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    showWorst
                      ? 'bg-red-950 text-red-300 border-red-700 shadow-sm shadow-red-900/40'
                      : 'bg-gray-900 text-gray-500 border-gray-800 opacity-60'
                  }`}
                  title={showWorst ? "Click to hide bad moves & red arrows" : "Click to show bad moves & red arrows"}
                >
                  <span className={`w-2 h-2 rounded-full ${showWorst ? 'bg-red-500' : 'bg-gray-600'}`}></span>
                  {showWorst ? 'Worst Moves' : 'Bad Moves Hidden'}
                </button>
              </div>
            )}
          </div>

          {/* Side-by-side Board and Left Action Bar Layout */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 w-full justify-center">
            {/* Left Side Vertical Action Buttons */}
            <div className="flex flex-row sm:flex-col gap-2.5 sm:mt-10 self-center sm:self-start">
              <button
                onClick={() => setShowResetConfirmModal(true)}
                className="px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-800 hover:border-gray-700 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 group"
                title="Reset Board"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>Reset</span>
              </button>

              <button
                onClick={undoMove}
                disabled={game.history().length === 0}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-lg flex items-center gap-2 ${
                  game.history().length === 0
                    ? 'bg-gray-950/60 text-gray-600 border-gray-900 cursor-not-allowed'
                    : 'bg-gray-900 hover:bg-gray-800 text-gray-200 border-gray-800 hover:border-gray-700'
                }`}
                title="Undo Move"
              >
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                </svg>
                <span>Undo</span>
              </button>

              <button
                onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                className="px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-800 hover:border-gray-700 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 group"
                title={`Flip board view (${boardOrientation === 'white' ? 'White' : 'Black'})`}
              >
                <svg className="w-4 h-4 text-indigo-400 group-hover:rotate-180 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>Flip</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800 text-gray-300 font-mono">
                  {boardOrientation === 'white' ? 'W' : 'B'}
                </span>
              </button>
            </div>

            {/* Board Column */}
            <div className="flex-1 flex flex-col items-center max-w-[500px] w-full">
              {/* Top Player Difficulty Badge Bar */}
              {(() => {
                const topColor = boardOrientation === 'white' ? 'b' : 'w';
                const topName = topColor === 'w' ? 'White' : 'Black';
                const topIcon = topColor === 'w' ? '♔' : '♚';
                const isTurn = game.turn() === topColor;
                const diffInfo = getSideDifficultyInfo(topColor);

                return (
                  <div className="w-full max-w-[500px] mb-2 px-3 py-2 bg-gray-900/90 border border-gray-800 rounded-xl flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm ${
                        topColor === 'w' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-100 border border-slate-700'
                      }`}>
                        {topIcon}
                      </span>
                      <span className="font-bold text-xs tracking-wider text-gray-200 uppercase">
                        {topName}
                      </span>
                      {isTurn && (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          TURN
                        </span>
                      )}
                    </div>

                    {diffInfo && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Difficulty:</span>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide ${diffInfo.bg} ${diffInfo.txt} ${diffInfo.bdr} shadow-sm`}>
                          <span>{diffInfo.icon}</span>
                          <span>{diffInfo.label}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="w-full max-w-[500px] shadow-2xl rounded-xl border-4 border-gray-800 relative bg-gray-900 overflow-hidden">
                <Chessboard 
                  options={{
                    position: game.fen(),
                    onPieceDrop: onDrop,
                    onSquareClick: onSquareClick,
                    arrows: [],
                    squareStyles: optionSquares,
                    darkSquareStyle: { backgroundColor: '#334155' },
                    lightSquareStyle: { backgroundColor: '#94a3b8' },
                    allowDragging: true,
                    boardOrientation: boardOrientation,
                  }}
                />
                <CustomChessArrows arrows={customNumberedArrows} hoveredMove={hoveredMove} orientation={boardOrientation} />
              </div>

              {/* Bottom Player Difficulty Badge Bar */}
              {(() => {
                const bottomColor = boardOrientation === 'white' ? 'w' : 'b';
                const bottomName = bottomColor === 'w' ? 'White' : 'Black';
                const bottomIcon = bottomColor === 'w' ? '♔' : '♚';
                const isTurn = game.turn() === bottomColor;
                const diffInfo = getSideDifficultyInfo(bottomColor);

                return (
                  <div className="w-full max-w-[500px] mt-2 px-3 py-2 bg-gray-900/90 border border-gray-800 rounded-xl flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm ${
                        bottomColor === 'w' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-100 border border-slate-700'
                      }`}>
                        {bottomIcon}
                      </span>
                      <span className="font-bold text-xs tracking-wider text-gray-200 uppercase">
                        {bottomName}
                      </span>
                      {isTurn && (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          TURN
                        </span>
                      )}
                    </div>

                    {diffInfo && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Difficulty:</span>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide ${diffInfo.bg} ${diffInfo.txt} ${diffInfo.bdr} shadow-sm`}>
                          <span>{diffInfo.icon}</span>
                          <span>{diffInfo.label}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {errorMessage && (
                <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm font-semibold max-w-[500px] w-full text-center">
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Engine Analysis & Stockfish Toggle */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-xl h-full flex flex-col justify-between">
            <div>
              {/* Header with Stockfish ON/OFF Toggle Switch & Position Eval Display */}
              <div className="mb-6 p-4 rounded-xl bg-gray-950/80 border border-gray-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Toggle Switch */}
                    <button
                      onClick={() => setStockfishEnabled(!stockfishEnabled)}
                      className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors focus:outline-none ${
                        stockfishEnabled ? 'bg-emerald-600 shadow-lg shadow-emerald-900/50' : 'bg-gray-700'
                      }`}
                      title={stockfishEnabled ? "Turn Stockfish Engine OFF" : "Turn Stockfish Engine ON"}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          stockfishEnabled ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-200">Stockfish Engine</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          stockfishEnabled ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-gray-800 text-gray-500'
                        }`}>
                          {stockfishEnabled ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {stockfishEnabled ? (evaluating ? 'Calculating lines...' : 'Live auto-analysis') : 'Click switch to enable engine'}
                      </p>
                    </div>
                  </div>

                  {/* Position Eval Score Badge */}
                  {stockfishEnabled && (
                    <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border font-mono font-extrabold text-sm shadow-md transition-colors duration-300 ${
                      !positionEval
                        ? 'bg-gray-800 text-gray-300 border-gray-700'
                        : positionEval.evalWhiteStr.startsWith('+') || (positionEval.evalWhiteStr.startsWith('#M') && !positionEval.evalWhiteStr.includes('-'))
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : positionEval.evalWhiteStr.startsWith('-')
                        ? 'bg-purple-950 text-purple-300 border-purple-700'
                        : 'bg-gray-800 text-gray-200 border-gray-700'
                    }`}>
                      <span>Eval:</span>
                      <span className="text-base">{positionEval ? positionEval.evalWhiteStr : '+0.00'}</span>
                    </div>
                  )}

                  {evaluating && (
                    <span className="animate-spin text-indigo-400 text-xl font-bold">⚙</span>
                  )}
                </div>

                {/* Visual Evaluation Bar */}
                {stockfishEnabled && (
                  <div className="mt-1">
                    <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
                      <span>White advantage</span>
                      <span>Black advantage</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden flex border border-gray-700">
                      <div
                        className="h-full bg-slate-100 transition-all duration-500 ease-out"
                        style={{ width: `${getEvalBarWidth()}%` }}
                        title={`White Advantage: ${getEvalBarWidth().toFixed(0)}%`}
                      />
                      <div
                        className="h-full bg-slate-900 transition-all duration-500 ease-out"
                        style={{ width: `${100 - getEvalBarWidth()}%` }}
                      />
                    </div>
                  </div>
                )}


                {/* Move Count Switcher (Top 5 vs Top 10) */}
                <div className="pt-2.5 mt-0.5 border-t border-gray-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-gray-300 font-medium">
                    <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span className="text-gray-400">Moves to display:</span>
                    <span className="font-bold text-indigo-300">Top {moveLimit}</span>
                  </div>
                  <div className="inline-flex p-0.5 bg-gray-900 border border-gray-700/80 rounded-lg shadow-inner">
                    <button
                      type="button"
                      onClick={() => setMoveLimit(5)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        moveLimit === 5
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950 scale-[1.02]'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                      }`}
                      title="Show top 5 best and worst moves"
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveLimit(10)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        moveLimit === 10
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950 scale-[1.02]'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                      }`}
                      title="Show top 10 best and worst moves"
                    >
                      Top 10
                    </button>
                  </div>
                </div>

                {/* Bad Moves Visibility Control Card */}
                <div className="pt-3 mt-1 border-t border-gray-800/80 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowWorst(!showWorst)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          showWorst ? 'bg-red-600 shadow-md shadow-red-950' : 'bg-gray-700'
                        }`}
                        title={showWorst ? "Click to hide bad moves" : "Click to show bad moves"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            showWorst ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-200">Show Bad Moves</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                            showWorst ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-gray-800 text-gray-500'
                          }`}>
                            {showWorst ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {showWorst
                            ? 'Displaying red arrows & worst moves list'
                            : 'Bad moves hidden (arrows & panel hidden)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Random Bad Move Feature Control Card */}
                <div className="pt-3 mt-1 border-t border-gray-800/80 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setRandomBadMoveEnabled(!randomBadMoveEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          randomBadMoveEnabled ? 'bg-amber-600 shadow-md shadow-amber-950' : 'bg-gray-700'
                        }`}
                        title={randomBadMoveEnabled ? "Turn Random Bad Move Feature OFF" : "Turn Random Bad Move Feature ON"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            randomBadMoveEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-200">Random Bad Move Feature</span>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                            randomBadMoveEnabled ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-gray-800 text-gray-500'
                          }`}>
                            {randomBadMoveEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {randomBadMoveEnabled
                            ? 'Occasionally blunders to simulate natural human play'
                            : 'Plays strictly good / optimal moves'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {randomBadMoveEnabled && (
                    <div className="p-3 bg-gray-900/90 border border-amber-900/50 rounded-xl flex flex-col gap-2 shadow-inner">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-300 font-semibold">Consecutive Good Moves:</span>
                          <span className={`font-mono font-black px-2 py-0.5 rounded text-xs border ${
                            consecutiveGoodMoves >= 18
                              ? 'bg-purple-950 text-purple-300 border-purple-600 animate-pulse'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          }`}>
                            {consecutiveGoodMoves} / 18
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold ${
                          consecutiveGoodMoves >= 18 ? 'text-purple-400 animate-pulse' : 'text-emerald-400'
                        }`}>
                          {consecutiveGoodMoves >= 18 ? '⚠️ 50% Bad Move Chance' : '✨ High Good Move Probability'}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-2 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                        <div
                          className={`h-full transition-all duration-300 ${
                            consecutiveGoodMoves >= 18
                              ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 animate-pulse'
                              : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          }`}
                          style={{ width: `${Math.min(100, (consecutiveGoodMoves / 18) * 100)}%` }}
                        />
                      </div>

                      <div className="text-[10px] text-gray-400 leading-tight space-y-0.5 pt-1 border-t border-gray-800/60">
                        <p><span className="text-gray-300 font-bold">• Moves 1–17:</span> ~95% chance of consecutive good moves.</p>
                        <p><span className="text-purple-300 font-bold">• After 18 Moves:</span> 50% probability of a random bad move.</p>
                        <p><span className="text-amber-300 font-bold">• On Bad Move:</span> Resets counter to 0 good moves.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Move Suggestion Timing Feature Control Card (Random Mode Only) */}
                {gameMode === 'random' && (
                  <div className="pt-3 mt-1 border-t border-gray-800/80 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const nextState = !timingEnabled;
                            setTimingEnabled(nextState);
                            if (!nextState) {
                              clearDelayTimers();
                            } else if (randomGoodMoves.length > 0) {
                              triggerSuggestionDelay();
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            timingEnabled ? 'bg-purple-600 shadow-md shadow-purple-950' : 'bg-gray-700'
                          }`}
                          title={timingEnabled ? "Turn Move Suggestion Delay OFF" : "Turn Move Suggestion Delay ON"}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              timingEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-gray-200 font-sans">Move Suggestion Delay</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                              timingEnabled ? 'bg-purple-950 text-purple-400 border border-purple-800' : 'bg-gray-800 text-gray-500'
                            }`}>
                              {timingEnabled ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {timingEnabled
                              ? 'Delays showing move suggestions by a random time (max 60s)'
                              : 'Shows move suggestions immediately'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {timingEnabled && (
                      <div className="p-3 bg-gray-900/90 border border-purple-900/50 rounded-xl flex flex-col gap-3 shadow-inner">
                        {/* Option: Connect Difficulty Index with Random Time Delay */}
                        <div className="p-2.5 bg-purple-950/40 border border-purple-800/60 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const nextVal = !connectDifficultyDelay;
                                setConnectDifficultyDelay(nextVal);
                                if (randomGoodMoves.length > 0) {
                                  triggerSuggestionDelay();
                                }
                              }}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                connectDifficultyDelay ? 'bg-purple-500' : 'bg-gray-700'
                              }`}
                              title={connectDifficultyDelay ? "Disable Auto-Delay by Difficulty" : "Enable Auto-Delay by Difficulty"}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  connectDifficultyDelay ? 'translate-x-4.5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                            <div>
                              <div className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                                <span>🎯</span> Connect to Difficulty Index
                              </div>
                              <div className="text-[10px] text-purple-300/70">
                                Auto-selects delay range based on position difficulty (Obvious, Easy, Normal, Tricky, Hard)
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            connectDifficultyDelay ? 'bg-purple-900 text-purple-300 border border-purple-600' : 'bg-gray-800 text-gray-400'
                          }`}>
                            {connectDifficultyDelay ? 'AUTO' : 'MANUAL'}
                          </span>
                        </div>

                        {connectDifficultyDelay ? (
                          /* Connected Difficulty Mode Panel & Preset Editor */
                          <div className="flex flex-col gap-2.5">
                            {/* Current Active Position Difficulty Range Info */}
                            {bestMoves && bestMoves.length > 0 && (() => {
                              const diff = getPositionDifficulty(bestMoves);
                              const cat = diff?.catName || 'Normal';
                              const activePreset = difficultyPresets[cat];
                              return (
                                <div className={`p-2 rounded-lg border text-xs flex items-center justify-between ${diff?.bBg || 'bg-amber-950/90'} ${diff?.bTxt || 'text-amber-300'} ${diff?.bBdr || 'border-amber-600/80'}`}>
                                  <span className="font-bold flex items-center gap-1.5">
                                    <span>{diff?.iconTag || '🟡'}</span> Active Position Rating: {cat.toUpperCase()}
                                  </span>
                                  <span className="font-mono font-bold bg-black/40 px-2 py-0.5 rounded border border-current">
                                    Range: {activePreset.min}s – {activePreset.max}s
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Custom Presets Table / Editor */}
                            <div className="flex flex-col gap-2 pt-1 border-t border-purple-900/40">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1">
                                  <span>⚙️</span> Edit Difficulty Presets
                                </span>
                                <button
                                  type="button"
                                  onClick={handleResetDifficultyPresets}
                                  className="text-[10px] text-purple-400 hover:text-purple-300 underline font-semibold transition-colors"
                                >
                                  Reset Defaults
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-1.5">
                                {(['Obvious', 'Easy', 'Normal', 'Tricky', 'Hard'] as DifficultyCategory[]).map((cat) => {
                                  const preset = difficultyPresets[cat];
                                  const activeCat = getPositionDifficulty(bestMoves)?.catName;
                                  const isActive = activeCat === cat;

                                  const badgeStyles: Record<DifficultyCategory, { bg: string; txt: string; bdr: string; icon: string }> = {
                                    Obvious: { bg: 'bg-emerald-950/80', txt: 'text-emerald-300', bdr: 'border-emerald-700/80', icon: '⚡' },
                                    Easy: { bg: 'bg-green-950/80', txt: 'text-green-300', bdr: 'border-green-700/80', icon: '🟢' },
                                    Normal: { bg: 'bg-amber-950/80', txt: 'text-amber-300', bdr: 'border-amber-700/80', icon: '🟡' },
                                    Tricky: { bg: 'bg-rose-950/80', txt: 'text-rose-300', bdr: 'border-rose-700/80', icon: '🔴' },
                                    Hard: { bg: 'bg-purple-950/80', txt: 'text-purple-300', bdr: 'border-purple-700/80', icon: '🟣' },
                                  };
                                  const style = badgeStyles[cat];

                                  return (
                                    <div
                                      key={cat}
                                      className={`p-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                        isActive
                                          ? `${style.bg} ${style.bdr} ring-1 ring-purple-400 shadow-sm`
                                          : 'bg-gray-950/60 border-gray-800'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-[100px]">
                                        <span className="text-xs">{style.icon}</span>
                                        <span className={`text-xs font-bold ${style.txt}`}>{cat}</span>
                                        {isActive && (
                                          <span className="text-[9px] bg-purple-900 text-purple-200 px-1.5 py-0.2 rounded font-black uppercase">
                                            ACTIVE
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-mono text-xs">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] text-gray-400 font-sans">Min:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={60}
                                            value={preset.min}
                                            onChange={(e) => handleDifficultyPresetChange(cat, 'min', parseInt(e.target.value, 10))}
                                            className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-purple-500"
                                          />
                                          <span className="text-gray-400 text-[10px] font-sans">s</span>
                                        </div>

                                        <span className="text-gray-500 font-mono">–</span>

                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] text-gray-400 font-sans">Max:</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={60}
                                            value={preset.max}
                                            onChange={(e) => handleDifficultyPresetChange(cat, 'max', parseInt(e.target.value, 10))}
                                            className="w-12 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-center text-gray-200 font-bold focus:outline-none focus:border-purple-500"
                                          />
                                          <span className="text-gray-400 text-[10px] font-sans">s</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Manual Delay Range Inputs & Quick Presets */
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-purple-200 flex items-center gap-1.5">
                                <span>⏱️</span> Manual Delay Range (Max 60s):
                              </span>
                              <span className="text-xs font-mono font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                                {minDelay}s – {maxDelay}s
                              </span>
                            </div>

                            {/* Min & Max Inputs / Sliders */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                  Min Delay (sec)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={60}
                                  value={minDelay}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleMinDelayChange(isNaN(val) ? 0 : val);
                                  }}
                                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono font-bold focus:outline-none focus:border-purple-500"
                                />
                                <input
                                  type="range"
                                  min={0}
                                  max={60}
                                  value={minDelay}
                                  onChange={(e) => handleMinDelayChange(parseInt(e.target.value, 10))}
                                  className="w-full accent-purple-500 h-1 bg-gray-800 rounded cursor-pointer mt-1"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                  Max Delay (sec)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={60}
                                  value={maxDelay}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    handleMaxDelayChange(isNaN(val) ? 0 : val);
                                  }}
                                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono font-bold focus:outline-none focus:border-purple-500"
                                />
                                <input
                                  type="range"
                                  min={0}
                                  max={60}
                                  value={maxDelay}
                                  onChange={(e) => handleMaxDelayChange(parseInt(e.target.value, 10))}
                                  className="w-full accent-purple-500 h-1 bg-gray-800 rounded cursor-pointer mt-1"
                                />
                              </div>
                            </div>

                            {/* Quick Presets */}
                            <div className="flex items-center gap-1.5 pt-1 border-t border-gray-800/60">
                              <span className="text-[10px] text-gray-400 font-semibold">Presets:</span>
                              {[
                                { label: '3–8s', min: 3, max: 8 },
                                { label: '5–15s', min: 5, max: 15 },
                                { label: '10–30s', min: 10, max: 30 },
                                { label: '30–60s', min: 30, max: 60 },
                              ].map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setMinDelay(preset.min);
                                    setMaxDelay(preset.max);
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                                    minDelay === preset.min && maxDelay === preset.max
                                      ? 'bg-purple-600 text-white border-purple-400'
                                      : 'bg-gray-800 text-gray-400 hover:text-gray-200 border-gray-700'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Best Moves */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-green-400">
                      <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                      {gameMode === 'random' ? (
                        <span>
                          Suggested Good Moves
                          {displayedBestMoves.length > 0 && (
                            <span className="text-base font-mono font-extrabold text-green-300 ml-1.5">
                              : {displayedBestMoves.map(m => `M${m.rank || ''}`).join(', ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span>Top {moveLimit} Best Moves (Green Arrows with #)</span>
                      )}
                    </h2>
                    {gameMode === 'random' && displayedBestMoves.length > 0 && (
                      <div className="text-[11px] text-green-400/80 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                        {displayedBestMoves.length === 1 &&
                        displayedBestMoves[0]?.scoreType === 'mate' &&
                        displayedBestMoves[0]?.rawScore > 0 &&
                        displayedBestMoves[0]?.rawScore <= 3 ? (
                          <>
                            <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/80 font-bold text-[10px] animate-pulse">
                              ⚡ Condition 2: Forced Mate in {displayedBestMoves[0].rawScore}
                            </span>
                            <span className="text-rose-300 font-semibold">Priority: Top 1 winning move selected to force checkmate!</span>
                          </>
                        ) : getPositionDifficulty(bestMoves)?.catName === 'Obvious' ? (
                          <>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold text-[10px] animate-pulse">
                              ⚡ Exception: Obvious Position
                            </span>
                            <span className="text-emerald-300 font-semibold">Strictly suggests Top 1 move for obvious position / overwhelming lead!</span>
                          </>
                        ) : Math.floor(game.history().length / 2) < 3 ? (
                          <>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold text-[10px]">
                              Condition 1 (Move {Math.floor(game.history().length / 2) + 1}/3)
                            </span>
                            <span>Selected only from Top 1–2 moves (M1–M2)</span>
                          </>
                        ) : (
                          <>
                            <span className="px-1.5 py-0.2 rounded bg-green-950 text-green-300 border border-green-800/80 font-bold text-[10px]">
                              Rule 2
                            </span>
                            <span>Randomly selected 2 moves from Top 1–5 (M1–M5)</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {gameMode === 'random' &&
                    bestMoves.length > 2 &&
                    !(
                      displayedBestMoves.length === 1 &&
                      ((displayedBestMoves[0]?.scoreType === 'mate' &&
                        displayedBestMoves[0]?.rawScore > 0 &&
                        displayedBestMoves[0]?.rawScore <= 3) ||
                        getPositionDifficulty(bestMoves)?.catName === 'Obvious')
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRandomGoodMoves(pickTwoRandomGoodMoves(bestMoves));
                          if (timingEnabled) {
                            triggerSuggestionDelay();
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0"
                        title="Re-roll 2 moves from Top 1–5"
                      >
                        <span>🎲</span>
                        <span>Re-roll</span>
                      </button>
                    )}
                </div>
                
                {/* Suggested Moves section banner when Random Bad Move Feature triggers a bad move */}
                {randomBadMoveEnabled && isBadMoveActive && (
                  <div className="p-3 bg-gradient-to-r from-amber-950/80 to-rose-950/80 border border-amber-600/80 rounded-xl text-xs text-amber-200 flex items-center justify-between shadow-md mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl animate-bounce">🎲</span>
                      <div>
                        <p className="font-bold text-amber-100 flex items-center gap-2">
                          Random Bad Move Triggered!
                          <span className="px-1.5 py-0.5 rounded bg-amber-900 text-[10px] text-amber-300 font-mono font-bold">Mistake Introduced</span>
                        </p>
                        <p className="text-[11px] text-amber-300/90">
                          Engine triggered an intentional mistake after {consecutiveGoodMoves} consecutive good moves!
                        </p>
                      </div>
                    </div>
                  </div>
                )}



                {!stockfishEnabled ? (
                  <p className="text-gray-500 text-sm italic bg-gray-950/50 p-4 rounded-xl border border-gray-800/50">
                    Stockfish engine is currently turned OFF. Toggle the switch ON at the top to see live best moves.
                  </p>
                ) : gameMode === 'random' && game.turn() !== (boardOrientation === 'white' ? 'w' : 'b') ? (
                  <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/40 text-purple-200/90 text-sm flex items-center gap-3">
                    <span className="text-xl">⏳</span>
                    <div>
                      <p className="font-semibold text-purple-200">Opponent's Turn ({game.turn() === 'w' ? 'White' : 'Black'})</p>
                      <p className="text-xs text-purple-300/70 mt-0.5">Rule 1 active: Opponent moves and arrows are completely hidden in Random Mode during opponent's turn ({game.turn() === 'w' ? 'White' : 'Black'}).</p>
                    </div>
                  </div>
                ) : gameMode === 'random' && timingEnabled && isDelaying ? (
                  <div className="p-5 bg-gradient-to-r from-purple-950/90 via-indigo-950/80 to-purple-950/90 border border-purple-600/70 rounded-2xl shadow-xl flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl animate-spin text-purple-400">⏳</span>
                        <div>
                          <p className="font-bold text-sm text-purple-100 flex items-center gap-2">
                            Move Suggestion Delay Active
                            <span className="px-2 py-0.5 rounded bg-purple-900 text-[10px] text-purple-300 font-mono font-extrabold animate-pulse">
                              COUNTDOWN
                            </span>
                          </p>
                          <p className="text-xs text-purple-300/80 mt-0.5">
                            Move suggestion will reveal in <span className="font-bold text-white font-mono text-sm">{delayRemaining}s</span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearDelayTimers()}
                        className="px-2.5 py-1 bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700 rounded-lg text-xs font-semibold transition-all active:scale-95"
                        title="Skip remaining delay and reveal moves immediately"
                      >
                        Skip Delay
                      </button>
                    </div>

                    {/* Delay difficulty hint */}
                    {bestMoves && bestMoves.length > 0 && (() => {
                      const diff = getPositionDifficulty(bestMoves);
                      if (!diff) return null;
                      return (
                        <div className={`p-2 rounded-lg border text-xs flex items-center justify-between ${diff.bBg} ${diff.bTxt} ${diff.bBdr}`}>
                          <span className="font-bold flex items-center gap-1.5">
                            <span>{diff.iconTag}</span> Position Rating: {diff.catName.toUpperCase()} ({diff.subLabel})
                          </span>
                          <span className="text-[10px] font-sans text-gray-300">Calculate during countdown!</span>
                        </div>
                      );
                    })()}

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-950 h-2.5 rounded-full overflow-hidden border border-purple-900/60">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-400 transition-all duration-300 ease-linear"
                        style={{
                          width: `${totalDelay > 0 ? Math.min(100, Math.max(0, ((totalDelay - delayRemaining) / totalDelay) * 100)) : 100}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-purple-300/70 font-mono">
                      <span>Randomly selected delay: {totalDelay}s</span>
                      {connectDifficultyDelay && bestMoves && bestMoves.length > 0 ? (() => {
                        const diff = getPositionDifficulty(bestMoves);
                        const cat = (diff?.catName || 'Normal') as DifficultyCategory;
                        const preset = difficultyPresets[cat] || DEFAULT_DIFFICULTY_PRESETS['Normal'];
                        return <span>Preset ({cat}): {preset.min}s–{preset.max}s</span>;
                      })() : (
                        <span>Range: {minDelay}s–{maxDelay}s (Max 60s)</span>
                      )}
                    </div>
                  </div>
                ) : displayedBestMoves.length === 0 ? (
                  <p className="text-gray-500 text-sm italic bg-gray-950/50 p-4 rounded-xl border border-gray-800/50 flex items-center gap-2">
                    {evaluating ? <span className="animate-spin">⚙</span> : null}
                    {evaluating ? 'Stockfish is calculating best moves...' : 'No evaluations available.'}
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                    {displayedBestMoves.map((moveData, i) => (
                      <li
                        key={moveData.move || i}
                        onMouseEnter={() => setHoveredMove(moveData.move)}
                        onMouseLeave={() => setHoveredMove(null)}
                        onClick={() => makeAMoveFromUCI(moveData.move)}
                        className={`flex justify-between items-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                          moveData.isTriggeredBadMove
                            ? 'bg-amber-950/90 border-amber-500 scale-[1.01] shadow-lg shadow-amber-900/40'
                            : hoveredMove === moveData.move
                            ? 'bg-green-950/80 border-green-500 scale-[1.01] shadow-lg shadow-green-900/30'
                            : 'bg-gray-800/80 hover:bg-gray-800 border-green-900/40'
                        }`}
                        title="Click to play this move on the board"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`flex items-center justify-center w-7 h-7 rounded-full font-black text-xs shadow shrink-0 ${
                            moveData.isTriggeredBadMove
                              ? 'bg-amber-500 text-gray-950'
                              : 'bg-green-500 text-gray-950'
                          }`}>
                            {moveData.isTriggeredBadMove ? '⚠️' : `#${moveData.rank || i + 1}`}
                          </span>
                          <span className={`font-mono text-base font-bold tracking-wide ${
                            moveData.isTriggeredBadMove ? 'text-amber-400' : 'text-green-400'
                          }`}>{moveData.move}</span>
                          {moveData.isTriggeredBadMove ? (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                              Random Bad Move
                            </span>
                          ) : gameMode === 'random' && (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-green-950/90 text-green-300 border border-green-800/70 font-bold">
                              M{moveData.rank || i + 1}
                            </span>
                          )}
                        </div>
                        <span className={`font-mono px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                          moveData.isTriggeredBadMove
                            ? 'bg-amber-950 text-amber-300 border-amber-800/50'
                            : 'bg-green-950 text-green-300 border-green-800/50'
                        }`}>
                          Eval: {parseFloat(moveData.scoreStr) > 0 ? '+' : ''}{moveData.scoreStr}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-800/80 text-xs text-gray-500 flex justify-between items-center">
              <span>Engine: Stockfish 17 (Universal)</span>
              <span>FEN: {game.fen().substring(0, 22)}...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Reset Board */}
      {showResetConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowResetConfirmModal(false)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4 text-center transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center mx-auto text-xl shadow-inner">
              ⚠️
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">Reset Board?</h3>
              <p className="text-sm text-gray-400 mt-1">
                Are you sure you want to reset the board? All current moves and position evaluation will be cleared.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowResetConfirmModal(false);
                  resetBoard();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-red-950/50 cursor-pointer"
              >
                Yes, Reset Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



