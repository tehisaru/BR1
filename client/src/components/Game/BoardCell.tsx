import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CELL_SIZE, 
  DOT_SIZE, 
  PLAYER_COLORS, 
  ANIMATION_DURATION,
  createColorVariation 
} from "../../lib/constants";
import { 
  getDotPositions, 
  calculateCriticalMass, 
  isAboutToExplode, 
  randomOffset 
} from "../../lib/gameUtils";
import type { GridCell, PowerUpType } from "../../lib/stores/useChainReaction";

type BoardCellProps = {
  row: number;
  col: number;
  cell: GridCell;
  totalRows: number;
  totalCols: number;
  onCellClick: (row: number, col: number) => void;
  isValidMove: boolean;
  powerUpType?: PowerUpType;
  isHQ?: boolean;
  hqHealth?: number;
  maxHqHealth?: number; // Track max health to calculate damage spots
  isHQDamaged?: boolean; // Track if this HQ cell was just damaged
  isHQHealed?: boolean; // Track if this HQ cell was just healed
  isHQDestroyed?: boolean; // Track if this HQ cell was just destroyed
  heartSelectionMode?: boolean; // Track if we're in heart selection mode
  pendingHeartPlayer?: string; // Track which player triggered the heart
};

const BoardCell: React.FC<BoardCellProps> = ({
  row,
  col,
  cell,
  totalRows,
  totalCols,
  onCellClick,
  isValidMove,
  powerUpType,
  isHQ,
  hqHealth,
  maxHqHealth = 5,
  isHQDamaged,
  isHQHealed,
  isHQDestroyed,
  heartSelectionMode = false,
  pendingHeartPlayer
}) => {
  const criticalMass = calculateCriticalMass(row, col, totalRows, totalCols);
  const aboutToExplode = isAboutToExplode(cell, row, col, totalRows, totalCols);
  const cellRef = useRef<HTMLDivElement>(null);

  // Check if this HQ is a valid heart target
  const isHeartTarget = heartSelectionMode && isHQ && cell.player !== pendingHeartPlayer && cell.player !== null;
  
  // Debug logging for heart selection
  if (heartSelectionMode) {
    console.log(`Heart selection active - Cell (${row},${col}): isHQ=${isHQ}, cellPlayer=${cell.player}, pendingHeartPlayer=${pendingHeartPlayer}, isHeartTarget=${isHeartTarget}`);
  }

  // Get position of dots in the cell
  const positions = getDotPositions(cell.atoms, CELL_SIZE, DOT_SIZE);
  
  // Create state to hold shaking positions
  // Initialize with one offset per atom
  const [shakeOffsets, setShakeOffsets] = useState(() => 
    Array.from({length: cell.atoms}, () => ({x: 0, y: 0}))
  );
  
  // Update the animation effect when aboutToExplode changes or atoms change
  useEffect(() => {
    if (aboutToExplode && cell.atoms > 0) {
      // Use proper shaking animation for cells about to explode
      const interval = setInterval(() => {
        // Use more noticeable shake offsets
        setShakeOffsets(
          Array.from({length: cell.atoms}, () => ({
            x: randomOffset(7), // Increased shake intensity
            y: randomOffset(7)
          }))
        );
      }, 50); // Faster interval for more visible shaking
      
      return () => clearInterval(interval);
    } else {
      // Reset offsets when not about to explode
      setShakeOffsets(Array.from({length: cell.atoms}, () => ({x: 0, y: 0})));
    }
  }, [aboutToExplode, cell.atoms]);

  return (
    <div className="relative" style={{ width: CELL_SIZE, height: CELL_SIZE }}>

  
      {/* Main cell content */}
      <div
        ref={cellRef}
        className="relative"
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          cursor: (isValidMove || isHeartTarget) ? "pointer" : "not-allowed",
          backgroundColor: isHQ 
            ? `${PLAYER_COLORS[cell.player!]}66` // 40% opacity of player color for HQ
            : "rgba(255, 255, 255, 0.1)", // Slightly visible white background
          border: "none", // Remove border for completely flat look
          margin: "1px",
          transition: "all 0.3s ease", // Match the background transition speed
          zIndex: 2
        }}
        onClick={() => {
          console.log(`🎯 BoardCell.onClick: (${row},${col}) - isValidMove=${isValidMove}, isHeartTarget=${isHeartTarget}, heartSelectionMode=${heartSelectionMode}`);
          if (isValidMove || isHeartTarget) {
            console.log(`🎯 BoardCell: Calling onCellClick for (${row},${col})`);
            onCellClick(row, col);
          } else {
            console.log(`🎯 BoardCell: Click blocked for (${row},${col}) - not valid move or heart target`);
          }
        }}
      >
        {/* Power-up icon if present - completely flat with same transition speed and strong green glow */}
        {powerUpType && cell.atoms === 0 && (
          <div className="absolute inset-0 flex items-center justify-center"
          style={{ 
            transition: "all 0.3s ease", // Match the background transition speed
            overflow: "visible", // Allow glow to extend beyond boundaries
            zIndex: 10 // Ensure glow appears on top
          }}
        >
          {powerUpType === 'diamond' && (
            <div style={{
              filter: "drop-shadow(0 0 12px rgb(0, 255, 0)) drop-shadow(0 0 20px rgba(0, 255, 0, 0.5))", // Strong green glow without container clipping
              transition: "all 0.3s ease"
            }}>
              <svg 
                width="26" 
                height="26" 
                viewBox="0 0 24 24" 
                fill="rgb(50, 200, 50)" 
                stroke="rgb(0, 200, 0)" 
                strokeWidth="1"
                style={{ 
                  transition: "all 0.3s ease" // Match the background transition speed
                }}
              >
                <path d="M12 2L2 12L12 22L22 12L12 2Z" />
              </svg>
            </div>
          )}
          {powerUpType === 'heart' && (
            <div style={{
              filter: "drop-shadow(0 0 12px rgb(0, 255, 0)) drop-shadow(0 0 20px rgba(0, 255, 0, 0.5))", // Strong green glow without container clipping
              transition: "all 0.3s ease"
            }}>
              <svg 
                width="26" 
                height="26" 
                viewBox="0 0 24 24" 
                fill="rgb(50, 200, 50)" 
                stroke="rgb(0, 200, 0)" 
                strokeWidth="1"
                style={{ 
                  transition: "all 0.3s ease" // Match the background transition speed
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          )}
          </div>
        )}

      {/* HQ base circle - only show if health > 0 */}
      {isHQ && hqHealth !== undefined && hqHealth > 0 && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ 
            padding: '2px'
          }}
        >
          <motion.div 
            className="rounded-full flex items-center justify-center"
            initial={{ scale: 1.3 }}
            animate={(isHQDamaged || isHQHealed) ? {
              scale: [1.3, 1.5, 1.3]
            } : {
              scale: 1.3
            }}
            transition={{ 
              duration: 0.5,
              ease: "easeInOut"
            }}
            style={{
              width: '80%', 
              height: '80%',
              backgroundColor: PLAYER_COLORS[cell.player!],
              zIndex: 25
            }}
          >
          </motion.div>
          
          <AnimatePresence>
            {isHQDamaged &&(
              <>
                {/* Electrical damage effect - black flash with cyan glow */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ scale: 1, opacity: 0 }}
                  animate={{ 
                    scale: [1.7, 1.1, 1], 
                    opacity: [0, 1, 0],
                    backgroundColor: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.9)', 'rgba(0, 0, 0, 0)']
                  }}
                  exit={{ opacity: 1 }}
                  transition={{ duration: 0.3, times: [0, 0.5, 1] }}
                  style={{
                    boxShadow: '0 0 20px cyan, 0 0 40px cyan, 0 0 60px rgba(0, 255, 255, 0.5)',
                    border: '2px solid cyan'
                  }}
                />
                
                {/* 100 colorful particles exploding in all directions from whole circle */}
                {Array.from({ length: 100 }).map((_, i) => {
                  const angle = (i * 360) / 100 + Math.random() * 5; // Even distribution with slight randomness
                  const distance = 50 + Math.random() * 110; // Much farther spread
                  const size = 2 + Math.random() * 6;
                  
                  // Get player's color with variations using the new helper function
                  const { r, g, b } = createColorVariation(cell.player!, 0.6); // Higher variation for more variety
                  
                  // Start from edge of circle, not center
                  const startRadius = 30; // Start from edge of HQ base
                  const startX = Math.cos(angle * Math.PI / 180) * startRadius;
                  const startY = Math.sin(angle * Math.PI / 180) * startRadius;
                  
                  // Final position
                  const endX = Math.cos(angle * Math.PI / 180) * distance;
                  const endY = Math.sin(angle * Math.PI / 180) * distance;
                  
                  return (
                    <motion.div
                      key={`damage-particle-${i}`}
                      className="absolute rounded-full"
                      initial={{ 
                        scale: 1, 
                        opacity: 1,
                        x: startX, // Start from edge of circle
                        y: startY
                      }}
                      animate={{ 
                        scale: [1, 0.8, 0.6, 0],
                        opacity: [1, 0.8, 0.4, 0],
                        x: endX,
                        y: endY
                      }}
                      exit={{ opacity: 1 }}
                      transition={{ 
                        duration: 1.5,
                        delay: 0, // All particles start at once
                        ease: [0.15, 0.46, 0.45, 0.94] // Custom bezier for sin-like deceleration
                      }}
                      style={{
                        width: size,
                        height: size,
                        backgroundColor: `rgb(${r}, ${g}, ${b})`,
                        left: '50%',
                        top: '50%'
                      }}
                    />
                  );
                })}
              </>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {isHQHealed && (
              <>
                {/* Only keep the healing ring effect */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ scale: 0.8, opacity: 0.8 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7 }}
                  style={{
                    backgroundColor: 'transparent',
                    border: `3px solid rgba(100, 255, 100, 0.8)`,
                    boxShadow: 'none' // No shadow for flat design
                  }}
                />
              </>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {isHQDestroyed &&(
          <>
            {/* Electrical damage effect - black flash with cyan glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ 
                scale: [1.7, 1.1, 1], 
                opacity: [0, 1, 0],
                backgroundColor: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.9)', 'rgba(0, 0, 0, 0)']
              }}
              exit={{ opacity: 1 }}
              transition={{ duration: 0.3, times: [0, 0.5, 1] }}
              style={{
                boxShadow: '0 0 20px cyan, 0 0 40px cyan, 0 0 60px rgba(0, 255, 255, 0.5)',
                border: '2px solid cyan'
              }}
            />

            {/* 200 colorful particles exploding in all directions from whole circle */}
            {Array.from({ length: 200 }).map((_, i) => {
              const angle = (i * 360) / 100 + Math.random() * 5; // Even distribution with slight randomness
              const distance = 50 + Math.random() * 210; // Much farther spread
              const size = 2 + Math.random() * 7;
              
              // Get player's base color and create variations
              const playerColor = PLAYER_COLORS[cell.player!];
              const colorMatch = playerColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              let r = 255, g = 255, b = 255; // Default to white if parse fails
              
              if (colorMatch) {
                r = parseInt(colorMatch[1]);
                g = parseInt(colorMatch[2]);
                b = parseInt(colorMatch[3]);
                
                // Create color variations - lighter and darker shades of player color
                const variation = (Math.random() - 0.5) * 0.6; // -0.3 to 0.3
                r = Math.max(0, Math.min(255, Math.round(r + r * variation)));
                g = Math.max(0, Math.min(255, Math.round(g + g * variation)));
                b = Math.max(0, Math.min(255, Math.round(b + b * variation)));
              }

              // Start from edge of circle, not center
              const startRadius = 30; // Start from edge of HQ base
              const startX = Math.cos(angle * Math.PI / 180) * startRadius;
              const startY = Math.sin(angle * Math.PI / 180) * startRadius;

              // Final position
              const endX = Math.cos(angle * Math.PI / 180) * distance;
              const endY = Math.sin(angle * Math.PI / 180) * distance;

              return (
                <motion.div
                  key={`damage-particle-${i}`}
                  className="absolute rounded-full"
                  initial={{ 
                    scale: 1, 
                    opacity: 1,
                    x: startX, // Start from edge of circle
                    y: startY
                  }}
                  animate={{ 
                    scale: [1, 0.8, 0.6, 0],
                    opacity: [1, 0.8, 0.4, 0],
                    x: endX,
                    y: endY
                  }}
                  exit={{ opacity: 1 }}
                  transition={{ 
                    duration: 1.5,
                    delay: 0, // All particles start at once
                    ease: [0.15, 0.46, 0.45, 0.94] // Custom bezier for sin-like deceleration
                  }}
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: `rgb(${r}, ${g}, ${b})`,
                    left: '50%',
                    top: '50%'
                  }}
                />
              );
            })}
          </>
          )}
          </AnimatePresence>
        </div>
      )}

      {/* Render atoms (except on HQ cells in base mode) */}
      <AnimatePresence>
        {cell.atoms > 0 && cell.player && !isHQ && (
          <div className="absolute inset-0 flex items-center justify-center">
            {positions.map((pos, index) => (
              <motion.div
                key={`${row}-${col}-${index}`}
                initial={{ 
                  scale: 0,
                  x: 0, // Start from center for smoother animation
                  y: 0
                }}
                animate={{ 
                  scale: 1,
                  x: aboutToExplode ? pos.x + shakeOffsets[index]?.x || 0 : pos.x,
                  y: aboutToExplode ? pos.y + shakeOffsets[index]?.y || 0 : pos.y
                }}
                exit={{ 
                  scale: [1, 0.8, 0],
                  x: [pos.x, pos.x * 1.5], // Move slightly outward when disappearing
                  y: [pos.y, pos.y * 1.5]
                }}
                transition={{ 
                  duration: ANIMATION_DURATION / 1000,
                  type: aboutToExplode ? "tween" : "spring",
                  stiffness: 300,
                  damping: 20,
                  repeat: 0
                }}
                className="absolute rounded-full"
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  backgroundColor: PLAYER_COLORS[cell.player!],
                  boxShadow: aboutToExplode 
                    ? `0 0 8px ${PLAYER_COLORS[cell.player!]}` // Strong glow effect when near critical
                    : `0 0 2px ${PLAYER_COLORS[cell.player!]}`, // Very slight glow at all times
                  transform: `scale(${(cell.atoms / criticalMass) * 0.7 + 0.3})` // Shrink based on critical mass ratio (min 0.3, max 1.0)
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
      
      {/* Health number*/}
      {isHQ && hqHealth !== undefined && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-white font-bold text-2xl"
          style={{
      
            zIndex: 30
          }}
        >
          {hqHealth}
        </div>
      )}

      {/* HQ Glow effect - 4 layers for strong glow */}
        {isHQ && hqHealth !== undefined && (
          <div
            className="absolute inset-1 rounded-full pointer-events-none"
            style={{
              zIndex: 35,
              boxShadow: `
                0 0 ${hqHealth * 8}px ${PLAYER_COLORS[cell.player!]},
                0 0 ${hqHealth * 8}px ${PLAYER_COLORS[cell.player!]},
                0 0 ${hqHealth * 16}px ${PLAYER_COLORS[cell.player!]},
                0 0 ${hqHealth * 32}px ${PLAYER_COLORS[cell.player!]}
              `
            }}
          />
        )}

      {/* Heart selection mode - cyan diagonal lines for enemy HQ targets */}
      {isHeartTarget && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 40 }}>
          {/* Diagonal lines overlay - only lines, no circle */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `repeating-linear-gradient(
                45deg,
                rgba(0, 255, 255, 0.6) 0px,
                rgba(0, 255, 255, 0.6) 2px,
                transparent 2px,
                transparent 6px
              )`
            }}
          />
        </div>
      )}
      
      </div>
    </div>
  );
};

export default BoardCell;