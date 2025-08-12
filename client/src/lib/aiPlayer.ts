import { PLAYER } from './constants';
import { GridCell, HQCell, PowerUpCell } from './stores/useChainReaction';
import { calculateCriticalMass, isAdjacentTo } from './gameUtils';

export enum AI_STRATEGY {
  SMART = 'smart'
}

interface AIMove {
  row: number;
  col: number;
  score: number;
}

interface GameState {
  grid: GridCell[][];
  currentPlayer: PLAYER;
  isBaseMode: boolean;
  hqs?: HQCell[];
  powerUps?: PowerUpCell[];
}

interface StrategicEvaluation {
  aggressiveScore: number;     // How much damage this move can cause to enemies
  defensiveScore: number;      // How well this move protects our base
  powerUpScore: number;        // Value of capturing power-ups
  chainReactionScore: number;  // Potential for large chain reactions
  territoryScore: number;      // Expanding our controlled territory
  baseThreatScore: number;     // How much this threatens enemy bases
}

// AI Personality traits that change each game - MUCH MORE EXTREME
interface AIPersonality {
  aggressiveness: number;      // 0.2-2.5 (how much AI prioritizes attacks)
  defensiveness: number;       // 0.2-2.5 (how much AI prioritizes defense)
  riskTaking: number;          // 0.2-2.5 (how much AI takes risky moves)
  powerUpHunting: number;      // 0.8-3.0 (how much AI chases power-ups)
  territorialness: number;     // 0.2-2.5 (how much AI values territory)
  cornerPreference: number;    // 0.1-2.0 (preference for corners, can be very low to prevent obsession)
  spreadTendency: number;      // 0.2-2.5 (tendency to spread vs consolidate)
}

/**
 * Determines if a move is valid according to game rules
 */
export const isValidMoveForAI = (
  grid: GridCell[][],
  row: number,
  col: number,
  currentPlayer: PLAYER,
  isBaseMode: boolean,
  hqs?: HQCell[]
): boolean => {
  // Cell is out of bounds
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
    return false;
  }

  const cell = grid[row][col];
  
  // Check if this is an HQ cell (cannot place on HQ cells)
  if (isBaseMode && hqs && hqs.some(hq => hq.row === row && hq.col === col)) {
    return false;
  }

  // Classic Mode: Cell is empty or already owned by the current player
  if (!isBaseMode) {
    return cell.player === null || cell.player === currentPlayer;
  }
  
  // Base Reaction Mode
  
  // Cell already has atoms and is owned by another player
  if (cell.player !== null && cell.player !== currentPlayer) {
    return false;
  }
  
  // Check if this is the first move (player can only place on their row or column)
  if (hqs) {
    // Find the current player's HQ
    const playerHQ = hqs.find(hq => hq.player === currentPlayer);
    
    if (playerHQ) {
      // Check if this is the first move
      let hasPlayerDots = false;
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          if (grid[r][c].player === currentPlayer && grid[r][c].atoms > 0) {
            hasPlayerDots = true;
            break;
          }
        }
        if (hasPlayerDots) break;
      }
      
      // First move - can only place on player's row or column
      if (!hasPlayerDots) {
        // Can only place on the row or column of the HQ
        return row === playerHQ.row || col === playerHQ.col;
      }
      
      // After first move - can place adjacent to existing dots or near HQ
      let hasAdjacentDot = false;
      
      // Check if adjacent to player's HQ (3x3 area around HQ)
      const nearHQ = Math.abs(row - playerHQ.row) <= 1 && Math.abs(col - playerHQ.col) <= 1;
      
      // Check if adjacent to any existing player dot
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          if (grid[r][c].player === currentPlayer && grid[r][c].atoms > 0) {
            if (isAdjacentTo(row, col, r, c)) {
              hasAdjacentDot = true;
              break;
            }
          }
        }
        if (hasAdjacentDot) break;
      }
      
      return nearHQ || hasAdjacentDot;
    }
  }
  
  return true;
};

/**
 * Get neighbors for AI calculations
 */
const getNeighborsForAI = (row: number, col: number, rows: number, cols: number) => {
  const neighbors = [];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // Up, Down, Left, Right
  
  for (const [dr, dc] of directions) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      neighbors.push({ nr, nc });
    }
  }
  
  return neighbors;
};

/**
 * Advanced strategic evaluation for aggressive and smart AI
 */
const evaluateStrategicMove = (
  grid: GridCell[][],
  row: number,
  col: number,
  currentPlayer: PLAYER,
  gameState: GameState
): StrategicEvaluation => {
  const evaluation: StrategicEvaluation = {
    aggressiveScore: 0,
    defensiveScore: 0,
    powerUpScore: 0,
    chainReactionScore: 0,
    territoryScore: 0,
    baseThreatScore: 0
  };

  const rows = grid.length;
  const cols = grid[0].length;
  const cell = grid[row][col];
  const criticalMass = calculateCriticalMass(row, col, rows, cols);

  // 1. POWER-UP SCORING - Only in Base Mode (no power-ups in chain reaction)
  if (gameState.isBaseMode && gameState.powerUps) {
    const powerUpAtPosition = gameState.powerUps.find(pu => pu.row === row && pu.col === col);
    if (powerUpAtPosition) {
        // Power-ups are EXTREMELY valuable - AI should prioritize these highly
        evaluation.powerUpScore = powerUpAtPosition.type === 'diamond' ? 150 : 150; // Much higher values
    }

    // Strong bonus for being near power-ups - AI should chase them aggressively  
    gameState.powerUps.forEach(powerUp => {
      const distanceToPowerUp = Math.abs(powerUp.row - row) + Math.abs(powerUp.col - col);
      if (distanceToPowerUp <= 3) {
        evaluation.powerUpScore += (4 - distanceToPowerUp) * 25; // Much stronger proximity bonus
      }
    });
  }

  // 2. POSITION SCORING - Different strategies for different game modes
  const isCorner = (row === 0 || row === rows - 1) && (col === 0 || col === cols - 1);
  const isEdge = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
  
  if (!gameState.isBaseMode) {
    // CLASSIC MODE: Corners are valuable but not obsessively so, with randomness
    const cornerBonus = 20 + Math.random() * 20; // 15-40 random bonus
    const edgeBonus = 8 + Math.random() * 10;   // 8-18 random bonus
    const centerBonus = 2 + Math.random() * 8;  // 2-10 random bonus
    
    if (isCorner) {
      evaluation.territoryScore += cornerBonus;
    } else if (isEdge) {
      evaluation.territoryScore += edgeBonus;
    } else {
      evaluation.territoryScore += centerBonus;
    }
    
    // In classic mode, avoid placing next to enemy cells initially (with some randomness)
    const neighbors = getNeighborsForAI(row, col, rows, cols);
    let enemyNeighborPenalty = 0;
    neighbors.forEach(({nr, nc}) => {
      const neighborCell = grid[nr][nc];
      if (neighborCell.player && neighborCell.player !== currentPlayer) {
        enemyNeighborPenalty += 10 + Math.random() * 10; // 10-20 random penalty
      }
    });
    evaluation.aggressiveScore -= enemyNeighborPenalty;
    
    // Encourage spreading to different areas in classic mode
    let isolationBonus = 0;
    let hasOwnNeighbor = false;
    neighbors.forEach(({nr, nc}) => {
      const neighborCell = grid[nr][nc];
      if (neighborCell.player === currentPlayer) {
        hasOwnNeighbor = true;
      }
    });
    if (!hasOwnNeighbor) {
      isolationBonus += 8 + Math.random() * 12; // 8-20 random bonus for spreading
    }
    evaluation.territoryScore += isolationBonus;
  } else {
    // BASE MODE: Corners and edges are much less important, focus on center
    const cornerBonus = 1 + Math.random() * 6;  // 2-8 low corner value
    const edgeBonus = 3 + Math.random() * 6;    // 1-5 low edge value  
    const centerBonus = 1 + Math.random() * 6;  // 6-14 higher center value
    
    if (isCorner) {
      evaluation.territoryScore += cornerBonus;
    } else if (isEdge) {
      evaluation.territoryScore += edgeBonus;
    } else {
      evaluation.territoryScore += centerBonus;
    }
  }

  // 3. AGGRESSIVE SCORING - Prioritize moves that capture enemy territory
  let enemyCaptureCount = 0;
  let enemyProximityScore = 0;
  
  // Check how many enemy cells this move would affect if it explodes
  if (cell.atoms + 1 >= criticalMass) {
    const neighbors = getNeighborsForAI(row, col, rows, cols);
    neighbors.forEach(({nr, nc}) => {
      const neighborCell = grid[nr][nc];
      if (neighborCell.player && neighborCell.player !== currentPlayer) {
        enemyCaptureCount += neighborCell.atoms + 1; // Potential atoms to capture
        evaluation.aggressiveScore += 15 * neighborCell.atoms; // More atoms = higher value
      }
    });
  }

  // Check proximity to enemy positions for future aggressive moves (only in base mode)
  if (gameState.isBaseMode) {
    for (let r = Math.max(0, row - 2); r <= Math.min(rows - 1, row + 2); r++) {
      for (let c = Math.max(0, col - 2); c <= Math.min(cols - 1, col + 2); c++) {
        const targetCell = grid[r][c];
        if (targetCell.player && targetCell.player !== currentPlayer) {
          const distance = Math.abs(r - row) + Math.abs(c - col);
          enemyProximityScore += (3 - distance) * targetCell.atoms * 2; // Proximity bonus for base mode
        }
      }
    }
  }
  evaluation.aggressiveScore += enemyProximityScore;

  // 4. BASE THREAT SCORING - Prioritize moves that threaten enemy bases
  if (gameState.isBaseMode && gameState.hqs) {
    gameState.hqs.forEach(hq => {
      if (hq.player !== currentPlayer) {
        const distanceToHQ = Math.abs(hq.row - row) + Math.abs(hq.col - col);
        if (distanceToHQ <= 3) {
          evaluation.baseThreatScore += (4 - distanceToHQ) * 20; // Closer to enemy HQ = much better
          
          // Extra bonus for moves that could explode near enemy HQ
          if (cell.atoms + 1 >= criticalMass && distanceToHQ <= 2) {
            evaluation.baseThreatScore += 40;
          }
        }
      }
    });
  }

  // 5. DEFENSIVE SCORING - Much stronger base defense
  if (gameState.isBaseMode && gameState.hqs) {
    const ourHQ = gameState.hqs.find(hq => hq.player === currentPlayer);
    if (ourHQ) {
      const distanceToOurHQ = Math.abs(ourHQ.row - row) + Math.abs(ourHQ.col - col);
      
      // Check for enemy threats near our base - extended range
      let enemyThreatNearBase = 0;
      let criticalThreats = 0;
      
      for (let r = Math.max(0, ourHQ.row - 3); r <= Math.min(rows - 1, ourHQ.row + 3); r++) {
        for (let c = Math.max(0, ourHQ.col - 3); c <= Math.min(cols - 1, ourHQ.col + 3); c++) {
          const threatCell = grid[r][c];
          if (threatCell.player && threatCell.player !== currentPlayer) {
            const threatDistance = Math.abs(r - ourHQ.row) + Math.abs(c - ourHQ.col);
            const threatMultiplier = Math.max(1, 4 - threatDistance);
            enemyThreatNearBase += threatCell.atoms * threatMultiplier * 8; // Much higher threat weighting
            
            // Critical threats are very close and have many atoms
            if (threatDistance <= 2 && threatCell.atoms >= 2) {
              criticalThreats += threatCell.atoms * 15;
            }
          }
        }
      }
      
      // Much stronger defensive response
      if (enemyThreatNearBase > 0) {
        const defensiveUrgency = Math.min(distanceToOurHQ, 4);
        evaluation.defensiveScore += enemyThreatNearBase * (5 - defensiveUrgency) * 2; // Double the defensive priority
        
        // Critical threat response - highest priority
        if (criticalThreats > 0 && distanceToOurHQ <= 3) {
          evaluation.defensiveScore += criticalThreats * 3;
        }
        
        // Extra bonus for converting enemy cells near our base
        if (cell.player && cell.player !== currentPlayer) {
          evaluation.defensiveScore += 40; // Increased conversion bonus
        }
        
        // Bonus for blocking enemy expansion towards our base
        if (distanceToOurHQ <= 2) {
          evaluation.defensiveScore += 30;
        }
      }
      
      // When base health is low, increase defensive priority even more
      if (ourHQ.health <= 2) {
        evaluation.defensiveScore *= 2; // Double all defensive scores when health is critical
      }
    }
  }

  // 6. CHAIN REACTION SCORING - Look for massive chain reaction potential
  const chainPotential = calculateChainReactionPotential(grid, row, col, currentPlayer);
  evaluation.chainReactionScore = chainPotential * 10;

  return evaluation;
};

/**
 * Calculate potential for chain reactions
 */
const calculateChainReactionPotential = (
  grid: GridCell[][],
  row: number,
  col: number,
  currentPlayer: PLAYER
): number => {
  const rows = grid.length;
  const cols = grid[0].length;
  let chainPotential = 0;

  // Simulate what happens if we place a dot here
  const simulatedGrid = grid.map(row => row.map(cell => ({ ...cell })));
  const cell = simulatedGrid[row][col];
  cell.atoms++;
  cell.player = currentPlayer;

  const criticalMass = calculateCriticalMass(row, col, rows, cols);
  if (cell.atoms >= criticalMass) {
    // This cell will explode, check how many neighboring cells might also explode
    const neighbors = getNeighborsForAI(row, col, rows, cols);
    neighbors.forEach(({nr, nc}) => {
      const neighborCell = simulatedGrid[nr][nc];
      const neighborCritical = calculateCriticalMass(nr, nc, rows, cols);
      
      if (neighborCell.atoms + 1 >= neighborCritical) {
        chainPotential += 5; // Each potential chain reaction cell
        
        // Look one level deeper
        const secondNeighbors = getNeighborsForAI(nr, nc, rows, cols);
        secondNeighbors.forEach(({nr: nnr, nc: nnc}) => {
          const secondCell = simulatedGrid[nnr][nnc];
          const secondCritical = calculateCriticalMass(nnr, nnc, rows, cols);
          if (secondCell.atoms + 1 >= secondCritical) {
            chainPotential += 2;
          }
        });
      }
    });
  }

  return chainPotential;
};

/**
 * Generates a random AI personality for each game to prevent predictable behavior
 */
function generateAIPersonality(): AIPersonality {
  return {
    aggressiveness: 0.2 + Math.random() * 2.3,      // 0.2-2.5 (MUCH MORE EXTREME)
    defensiveness: 0.2 + Math.random() * 2.3,       // 0.2-2.5 (MUCH MORE EXTREME)
    riskTaking: 0.2 + Math.random() * 2.3,          // 0.2-2.5 (MUCH MORE EXTREME)
    powerUpHunting: 0.8 + Math.random() * 2.2,      // 0.8-3.0 (Very high power-up chasing)
    territorialness: 0.2 + Math.random() * 2.3,     // 0.2-2.5 (MUCH MORE EXTREME)
    cornerPreference: 0.1 + Math.random() * 1.9,    // 0.1-2.0 (MUCH MORE EXTREME, can be very low)
    spreadTendency: 0.2 + Math.random() * 2.3       // 0.2-2.5 (MUCH MORE EXTREME)
  };
}

/**
 * PERSONALITY-BASED AI SYSTEM
 * Each AI has unique personality traits that make it behave differently
 */
class PersonalityBasedAI {
  private personalities: Map<PLAYER, AIPersonality> = new Map();
  
  getPersonality(player: PLAYER): AIPersonality {
    if (!this.personalities.has(player)) {
      this.personalities.set(player, generateAIPersonality());
      console.log(`🎭 Generated new personality for ${player}:`, this.personalities.get(player));
    }
    return this.personalities.get(player)!;
  }

  // Reset personalities for new game
  resetPersonalities(): void {
    this.personalities.clear();
  }

  evaluateMove(
    grid: GridCell[][],
    row: number,
    col: number,
    currentPlayer: PLAYER,
    gameState: GameState
  ): number {
    const evaluation = evaluateStrategicMove(grid, row, col, currentPlayer, gameState);
    const personality = this.getPersonality(currentPlayer);
    
    // Calculate base score with personality-influenced priorities
    let baseScore = 0;
    
    // Apply personality traits to scoring
    baseScore += evaluation.powerUpScore * personality.powerUpHunting * 1.8;
    baseScore += evaluation.territoryScore * personality.territorialness * personality.cornerPreference * 0.8;
    baseScore += evaluation.defensiveScore * personality.defensiveness * 2.0;
    baseScore += evaluation.aggressiveScore * personality.aggressiveness * 1.5;
    baseScore += evaluation.baseThreatScore * personality.aggressiveness * personality.riskTaking * 1.2;
    baseScore += evaluation.chainReactionScore * personality.riskTaking * 1.3;
    
    // Add significant randomness based on risk-taking personality
    const baseRandomness = personality.riskTaking * 0.3; // 0.15-0.45
    const randomness = (Math.random() - 0.5) * 2 * baseRandomness;
    baseScore += randomness * Math.max(15, Math.abs(baseScore) * 0.2);
    
    // Additional chaos factor to prevent identical games
    const chaosBonus = (Math.random() - 0.5) * 25 * personality.riskTaking;
    baseScore += chaosBonus;
    
    return baseScore;
  }

  getBestMove(
    grid: GridCell[][],
    currentPlayer: PLAYER,
    isBaseMode: boolean,
    hqs?: HQCell[],
    powerUps?: PowerUpCell[]
  ): AIMove | null {
    const personality = this.getPersonality(currentPlayer);
    const gameState: GameState = {
      grid,
      currentPlayer,
      isBaseMode,
      hqs,
      powerUps
    };

    const rows = grid.length;
    const cols = grid[0].length;
    const validMoves: AIMove[] = [];

    // Generate all valid moves
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (isValidMoveForAI(grid, row, col, currentPlayer, isBaseMode, hqs)) {
          const score = this.evaluateMove(grid, row, col, currentPlayer, gameState);
          validMoves.push({ row, col, score });
        }
      }
    }

    if (validMoves.length === 0) {
      return null;
    }

    // Sort moves by score (highest first)
    validMoves.sort((a, b) => b.score - a.score);

    // Use personality to determine move selection randomness
    const selectionRandomness = personality.riskTaking * 0.4; // 0.2-0.6
    const topMoves = Math.max(1, Math.ceil(validMoves.length * (0.1 + selectionRandomness)));
    const bestMoveIndex = Math.floor(Math.random() * Math.min(topMoves, validMoves.length));

    const bestMove = validMoves[bestMoveIndex];
    
    console.log(`🎭 AI ${currentPlayer} (aggr:${personality.aggressiveness.toFixed(1)}, def:${personality.defensiveness.toFixed(1)}, risk:${personality.riskTaking.toFixed(1)}) chose (${bestMove.row},${bestMove.col}) from top ${topMoves} moves`);
    
    return bestMove;
  }
}

// Global AI instance
const personalityAI = new PersonalityBasedAI();

// Function to reset AI personalities for new games
export const resetAIPersonalities = () => {
  personalityAI.resetPersonalities();
};

/**
 * Main entry point for AI move calculation
 */
export const getAIMove = (
  grid: GridCell[][],
  currentPlayer: PLAYER,
  isBaseMode: boolean,
  hqs?: HQCell[],
  strategy: AI_STRATEGY = AI_STRATEGY.SMART,
  powerUps?: PowerUpCell[]
): AIMove | null => {
  console.log(`🎯 AI ${currentPlayer} starting move calculation with personality-based strategy`);
  
  try {
    const move = personalityAI.getBestMove(grid, currentPlayer, isBaseMode, hqs, powerUps);
    
    if (move) {
      console.log(`✅ AI ${currentPlayer} selected move: (${move.row}, ${move.col}) with score ${move.score.toFixed(1)}`);
    } else {
      console.warn(`❌ AI ${currentPlayer} could not find a valid move`);
    }
    
    return move;
  } catch (error) {
    console.error(`💥 AI ${currentPlayer} error:`, error);
    return null;
  }
};