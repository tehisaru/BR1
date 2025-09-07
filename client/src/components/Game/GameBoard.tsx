import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BoardCell from "./BoardCell";
import { CELL_SIZE, PLAYER } from "../../lib/constants";
import type { GridCell, PowerUpCell, HQCell } from "../../lib/stores/useChainReaction";
import { useAudio } from "../../lib/stores/useAudio";
import { useChainReaction } from "../../lib/stores/useChainReaction";

interface GameBoardProps {
  grid: GridCell[][];
  rows: number;
  cols: number;
  currentPlayer: PLAYER;
  onCellClick: (row: number, col: number) => void;
  isValidMove: (row: number, col: number) => boolean;
  powerUps?: PowerUpCell[];
  hqs?: HQCell[];
  isAnimating: boolean;
  setIsAnimating: (animating: boolean) => void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const GameBoard: React.FC<GameBoardProps> = ({
  grid,
  rows,
  cols,
  currentPlayer,
  onCellClick,
  isValidMove,
  powerUps = [],
  hqs = [],
  isAnimating,
  setIsAnimating
}) => {
  const [lastClickedCell, setLastClickedCell] = useState<{row: number, col: number} | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { playHit } = useAudio();
  const { lastHQDamaged, heartSelectionMode, pendingHeartPlayer } = useChainReaction();

  useEffect(() => {
    // Trigger entrance animation
    setGameStarted(true);
  }, []);

  // Calculate responsive scale based on viewport and the board container's position.
  // This avoids hard-coded subtractions like "-200" which can be wrong on many mobile browsers.
  const calculateScale = useCallback(() => {
    // natural board size in pixels
    const boardWidth = cols * CELL_SIZE + cols * 2 + 24;
    const boardHeight = (rows * CELL_SIZE + rows * 2 + 24) * 1.017;

    // If we have a container element, use its left/top in viewport to compute available space.
    let availableWidth = window.innerWidth - 32; // fallback
    let availableHeight = window.innerHeight - 200; // fallback

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      // Use container's available width (parent layout may constrain this)
      availableWidth = Math.max(0, rect.width - 24);
      // For height, use the remaining viewport height below the top of the container
      // so the board will fit under any header/menu above it.
      availableHeight = Math.max(0, window.innerHeight - rect.top - 16);
    } else {
      // If no ref available yet, use whole viewport but keep some padding for UI
      availableWidth = Math.max(0, window.innerWidth - 32);
      availableHeight = Math.max(0, window.innerHeight - 200);
    }

    const scaleX = availableWidth / boardWidth;
    const scaleY = availableHeight / boardHeight;

    // Use smaller scale to ensure fit. Clamp so it's not too tiny, cap at 1.
    const newScale = clamp(Math.min(scaleX, scaleY, 1), 0.3, 1);

    setScale(newScale);
  }, [cols, rows]);

  useEffect(() => {
    // initial calculation and re-calc on viewport/rotation changes
    calculateScale();
    const onResize = () => calculateScale();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    // On mobile browsers the UI chrome can appear/disappear; do a short delayed recalc
    const t = window.setTimeout(calculateScale, 350);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      clearTimeout(t);
    };
  }, [calculateScale]);

  // Manual zoom controls for users/devices where automatic scaling isn't perfect
  const handleZoomIn = () => setScale(s => clamp(Number((s * 1.15).toFixed(3)), 0.3, 1));
  const handleZoomOut = () => setScale(s => clamp(Number((s / 1.15).toFixed(3)), 0.3, 1));
  const handleResetZoom = () => calculateScale();

  // Handle cell click with animation tracking
  const handleCellClick = (row: number, col: number) => {
    // Play sound effect
    playHit();

    // Track this cell as last clicked
    setLastClickedCell({row, col});

    // Start animation and then process the move
    setIsAnimating(true);
    console.log(`🎯 GameBoard.handleCellClick: (${row},${col}) - heartSelectionMode=${heartSelectionMode}, pendingHeartPlayer=${pendingHeartPlayer}`);

    // Process the move immediately but keep animation state
    onCellClick(row, col);

    // Fallback timer to reset animation state in case chain reaction logic doesn't
    setTimeout(() => {
      console.log("Animation timeout reached - resetting animation state");
      setIsAnimating(false);
    }, 600);
  };

  const boardWidth = cols * CELL_SIZE + cols * 2 + 24;
  const boardHeight = (rows * CELL_SIZE + rows * 2 + 24) * 1.017;

  const boardContainerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20,
        duration: 0.5,
        delay: 0
      }
    }
  };

  return (
    <div className="flex items-center justify-center">
      <motion.div 
        ref={containerRef}
        className="relative"
        initial="hidden"
        animate={gameStarted ? "visible" : "hidden"}
        variants={boardContainerVariants}
        style={{ 
          width: boardWidth,
          height: boardHeight,
          background: "rgba(255, 255, 255, 0.05)",
          border: "none",
          boxShadow: "0 0 40px rgba(255, 255, 255, 0.3)",
          transformOrigin: 'center',
          transform: `scale(${scale})`,
          padding: '12px',
          borderRadius: '16px',
          maxWidth: '100%',
          maxHeight: '100%',
          // Prevent the board from causing horizontal scroll when scaled down
          overflow: 'visible'
        }}
      >
        {/* Zoom controls - small overlay. You can hide them via CSS if you only want automatic scaling. */}
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 60,
            display: 'flex',
            gap: 8
          }}
        >
          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            style={{
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 16,
              cursor: 'pointer'
            }}
          >
            +
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            style={{
              background: 'rgba(0,0,0,0.5)',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 16,
              cursor: 'pointer'
            }}
          >
            −
          </button>
          <button
            onClick={handleResetZoom}
            aria-label="Reset zoom"
            style={{
              background: 'rgba(0,0,0,0.35)',
              color: 'white',
              border: 'none',
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            reset
          </button>
        </div>

        {/* Board grid rendering - preserve existing mapping behavior */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {grid.map((rowCells, rowIndex) => (
            <div key={`row-${rowIndex}`} style={{ display: 'flex' }}>
              {rowCells.map((cell, colIndex) => {
                const isHQ = hqs?.some(h => h.row === rowIndex && h.col === colIndex);
                const isHighlighted = lastClickedCell?.row === rowIndex && lastClickedCell?.col === colIndex;

                return (
                  <motion.div
                    // Add lastHQDamaged timestamp to key to force re-render when damage occurs
                    key={`cell-${rowIndex}-${colIndex}${isHQ ? `-hq` : ''}${isHighlighted ? '-highlight' : ''}${isHQ && lastHQDamaged ? `-${lastHQDamaged.timestamp}` : ''}`}
                    whileHover={{ scale: isValidMove(rowIndex, colIndex) ? 1.05 : 1 }}
                    animate={{ 
                      scale: isHighlighted ? [1, 1.05, 1] : 1,
                      transition: { duration: 0.15 }
                    }}
                  >
                    <BoardCell
                      key={`boardcell-${rowIndex}-${colIndex}`}
                      row={rowIndex}
                      col={colIndex}
                      cell={cell}
                      totalRows={rows}
                      totalCols={cols}
                      onCellClick={handleCellClick}
                      isValidMove={isValidMove(rowIndex, colIndex)}
                      // pass-through other props if your original BoardCell expects them
                    />
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default GameBoard;