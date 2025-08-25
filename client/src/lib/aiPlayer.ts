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
  baseHuntingThirst: number;   // 0.2-3.0 (how much AI wants to attack chosen enemy base)
  powerUpHunting: number;      // 0.8-3.0 (how much AI chases power-ups)
  territorialness: number;     // 0.2-2.5 (how much AI values territory)
  cornerPreference: number;    // 0.1-2.0 (preference for corners, can be very low to prevent obsession)
  spreadTendency: number;      // 0.2-2.5 (tendency to spread vs consolidate)
  targetEnemy: PLAYER | null;  // Chosen enemy to focus attacks on
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

  // 1. POWER-UP SCORING - COMPLETELY OVERHAULED for actual power-up chasing
  if (gameState.isBaseMode && gameState.powerUps) {
    const powerUpAtPosition = gameState.powerUps.find(pu => pu.row === row && pu.col === col);
    if (powerUpAtPosition) {
        // Power-ups are THE HIGHEST PRIORITY - should override almost all other considerations
        evaluation.powerUpScore = 5000; // EXTREMELY MASSIVE values - higher than anything else
        console.log(`🎯 AI found power-up at (${row},${col}) - PRIORITY MOVE! Score: 5000`);
    }

    // VERY strong bonus for being near power-ups with clear path
    gameState.powerUps.forEach(powerUp => {
      const distanceToPowerUp = Math.abs(powerUp.row - row) + Math.abs(powerUp.col - col);
      if (distanceToPowerUp <= 3) {
        // Much higher proximity bonus and scale with distance
        const proximityBonus = (4 - distanceToPowerUp) * 500; // 500, 1000, 1500, 2000 based on distance
        evaluation.powerUpScore += proximityBonus;
        console.log(`🎯 AI evaluating move near power-up (${powerUp.row},${powerUp.col}). Distance: ${distanceToPowerUp}, Bonus: ${proximityBonus}`);
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

  // 3. IMMEDIATE DAMAGE SCORING - HIGHEST PRIORITY for moves that can damage RIGHT NOW
  let immediateExplosionBonus = 0;
  let enemyCaptureCount = 0;
  let enemyProximityScore = 0;
  
  // Check if this move will cause an immediate explosion (CRITICAL for damage timing)
  if (cell.atoms + 1 >= criticalMass) {
    console.log(`💥 AI evaluating IMMEDIATE EXPLOSION at (${row},${col}) - atoms will be ${cell.atoms + 1}/${criticalMass}`);
    const neighbors = getNeighborsForAI(row, col, rows, cols);
    
    neighbors.forEach(({nr, nc}) => {
      const neighborCell = grid[nr][nc];
      if (neighborCell.player && neighborCell.player !== currentPlayer) {
        enemyCaptureCount += neighborCell.atoms + 1;
        // MASSIVE bonus for immediate enemy damage - this should be prioritized!
        const immediateDamage = neighborCell.atoms * 100; // Much higher than before
        evaluation.aggressiveScore += immediateDamage;
        immediateExplosionBonus += 1000; // Huge bonus for ANY immediate explosion that hits enemies
        console.log(`💥 IMMEDIATE ENEMY DAMAGE at neighbor (${nr},${nc}) - atoms: ${neighborCell.atoms}, damage bonus: ${immediateDamage}`);
      }
    });
    
    // Additional bonus just for exploding (creates pressure)
    immediateExplosionBonus += 200;
  }
  
  evaluation.aggressiveScore += immediateExplosionBonus;

  // SMART PLACEMENT STRATEGY - avoid enemy cells, prefer strategic timing
  let placementStrategyScore = 0;
  
  // PENALTY for placing on cells that already have enemy presence nearby
  if (cell.player && cell.player !== currentPlayer) {
    placementStrategyScore -= 300; // Strong penalty for placing on enemy cells
    console.log(`⚠️ AI penalizing placement on enemy cell at (${row},${col})`);
  }
  
  // BONUS for strategic timing - prefer moves that will explode BEFORE nearby enemies can
  const neighbors = getNeighborsForAI(row, col, rows, cols);
  neighbors.forEach(({nr, nc}) => {
    const neighborCell = grid[nr][nc];
    if (neighborCell.player && neighborCell.player !== currentPlayer) {
      const neighborCriticalMass = calculateCriticalMass(nr, nc, rows, cols);
      const ourTimeToExplode = criticalMass - (cell.atoms + 1); // How many more atoms we need
      const enemyTimeToExplode = neighborCriticalMass - neighborCell.atoms; // How many more atoms they need
      
      if (ourTimeToExplode <= enemyTimeToExplode && ourTimeToExplode >= 0) {
        // We can explode before or at the same time as the enemy - GOOD!
        const timingBonus = (enemyTimeToExplode - ourTimeToExplode + 1) * 150;
        placementStrategyScore += timingBonus;
        console.log(`⏱️ STRATEGIC TIMING at (${row},${col}): We explode in ${ourTimeToExplode}, enemy at (${nr},${nc}) explodes in ${enemyTimeToExplode}. Bonus: ${timingBonus}`);
      }
    }
  });
  
  // Check proximity to enemy positions for future aggressive moves (only in base mode)
  if (gameState.isBaseMode) {
    for (let r = Math.max(0, row - 2); r <= Math.min(rows - 1, row + 2); r++) {
      for (let c = Math.max(0, col - 2); c <= Math.min(cols - 1, col + 2); c++) {
        const targetCell = grid[r][c];
        if (targetCell.player && targetCell.player !== currentPlayer) {
          const distance = Math.abs(r - row) + Math.abs(c - col);
          enemyProximityScore += (3 - distance) * targetCell.atoms * 2;
        }
      }
    }
  }
  
  evaluation.aggressiveScore += enemyProximityScore + placementStrategyScore;

  // 4. BASE THREAT SCORING - Prioritize moves that threaten enemy bases, ESPECIALLY chosen target
  if (gameState.isBaseMode && gameState.hqs) {
    gameState.hqs.forEach(hq => {
      if (hq.player !== currentPlayer) {
        const distanceToHQ = Math.abs(hq.row - row) + Math.abs(hq.col - col);
        if (distanceToHQ <= 3) {
          let baseThreatValue = (4 - distanceToHQ) * 20; // Base threat value
          
          // MASSIVE bonus if this is our chosen target enemy
          // (This logic will be applied in evaluateMove function)
          baseThreatValue = baseThreatValue; // Keep base value for now
          
          evaluation.baseThreatScore += baseThreatValue;
          
          // Extra bonus for moves that could explode near enemy HQ
          if (cell.atoms + 1 >= criticalMass && distanceToHQ <= 2) {
            const explosionBonus = hq.player === currentPlayer ? 120 : 40; // Much higher for target
            evaluation.baseThreatScore += explosionBonus;
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
  // Choose a random enemy to target (will be set when AI gets initialized with opponents)
  const possibleEnemies = [PLAYER.RED, PLAYER.BLUE, PLAYER.ORANGE, PLAYER.BLACK];
  const targetEnemy = possibleEnemies[Math.floor(Math.random() * possibleEnemies.length)];
  
  // Make ALL AI more baseline aggressive while keeping variety
  return {
    aggressiveness: 1.2 + Math.random() * 1.8,      // 1.2-3.0 (MUCH more aggressive baseline)
    defensiveness: 0.8 + Math.random() * 2.2,       // 0.8-3.0 (defensive when needed)
    baseHuntingThirst: 1.0 + Math.random() * 2.0,   // 1.0-3.0 (always some base hunting)
    powerUpHunting: 2.5 + Math.random() * 0.5,      // 2.5-3.0 (ALWAYS prioritize power-ups)
    territorialness: 0.8 + Math.random() * 1.7,     // 0.8-2.5 (reasonable territory interest)
    cornerPreference: 0.3 + Math.random() * 1.2,    // 0.3-1.5 (moderate corner preference)
    spreadTendency: 1.0 + Math.random() * 1.5,      // 1.0-2.5 (prefer aggressive spreading)
    targetEnemy: targetEnemy                        // Random enemy to focus on
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
      const personality = generateAIPersonality();
      // Set target enemy to a different player
      const possibleEnemies = [PLAYER.RED, PLAYER.BLUE, PLAYER.ORANGE, PLAYER.BLACK].filter(p => p !== player);
      personality.targetEnemy = possibleEnemies[Math.floor(Math.random() * possibleEnemies.length)];
      
      this.personalities.set(player, personality);
      console.log(`🎭 Generated FRESH personality for ${player}: aggr=${personality.aggressiveness.toFixed(1)}, def=${personality.defensiveness.toFixed(1)}, powerUp=${personality.powerUpHunting.toFixed(1)}, target=${personality.targetEnemy}`);
    }
    return this.personalities.get(player)!;
  }

  // Reset personalities for new game
  resetPersonalities(): void {
    const oldCount = this.personalities.size;
    this.personalities.clear();
    console.log(`🔄 Cleared ${oldCount} AI personalities. Fresh personalities will be generated.`);
  }

  evaluateMove(
    grid: GridCell[][],
    row: number,
    col: number,
    currentPlayer: PLAYER,
    gameState: GameState
  ): number {
    // Handle full board evaluation case for minimax
    if (row === -1 && col === -1) {
      let totalScore = 0;
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
          if (grid[r][c].player === currentPlayer) {
            totalScore += grid[r][c].atoms * 10;
          }
        }
      }
      return totalScore;
    }

    const evaluation = evaluateStrategicMove(grid, row, col, currentPlayer, gameState);
    const personality = this.getPersonality(currentPlayer);
    
    // Check if this move threatens our chosen target enemy
    let targetEnemyBonus = 0;
    if (gameState.isBaseMode && gameState.hqs && personality.targetEnemy) {
      const targetHQ = gameState.hqs.find(hq => hq.player === personality.targetEnemy);
      if (targetHQ) {
        const distanceToTarget = Math.abs(targetHQ.row - row) + Math.abs(targetHQ.col - col);
        if (distanceToTarget <= 3) {
          targetEnemyBonus = (4 - distanceToTarget) * 50 * personality.baseHuntingThirst; // MASSIVE target focus
        }
        
        // Double the base threat score if targeting our chosen enemy
        if (targetHQ.player === personality.targetEnemy) {
          evaluation.baseThreatScore *= 2;
        }
      }
    }
    
    // Calculate base score with personality-influenced priorities
    let baseScore = 0;
    
    // Apply personality traits with FIXED power-up prioritization
    const powerUpMultiplier = Math.max(1.0, personality.powerUpHunting); // Ensure power-ups are NEVER ignored
    baseScore += evaluation.powerUpScore * powerUpMultiplier; // Direct application - no dilution!
    
    // Log power-up scoring for debugging
    if (evaluation.powerUpScore > 0) {
      console.log(`🎯 AI (${currentPlayer}) power-up scoring: base=${evaluation.powerUpScore}, personality=${personality.powerUpHunting}, final=${evaluation.powerUpScore * powerUpMultiplier}`);
    }
    
    // Other scoring with more balanced weights
    baseScore += evaluation.aggressiveScore * personality.aggressiveness * 2.5; // HIGHER weight for immediate damage
    baseScore += evaluation.baseThreatScore * personality.aggressiveness * personality.baseHuntingThirst * 2.0;
    baseScore += evaluation.defensiveScore * personality.defensiveness * 2.0;
    baseScore += evaluation.territoryScore * personality.territorialness * personality.cornerPreference * 0.5; // LOWER territory weight
    baseScore += evaluation.chainReactionScore * personality.baseHuntingThirst * 1.3;
    baseScore += targetEnemyBonus;
    
    // Add significant randomness based on base-hunting personality
    const baseRandomness = personality.baseHuntingThirst * 0.3; // 0.06-0.9
    const randomness = (Math.random() - 0.5) * 2 * baseRandomness;
    baseScore += randomness * Math.max(15, Math.abs(baseScore) * 0.2);
    
    // Additional chaos factor to prevent identical games
    const chaosBonus = (Math.random() - 0.5) * 25 * personality.baseHuntingThirst;
    baseScore += chaosBonus;
    
    return baseScore;
  }

  // Simple minimax with alpha-beta pruning (3 levels deep)
  minimax(
    grid: GridCell[][],
    depth: number,
    isMaximizing: boolean,
    alpha: number,
    beta: number,
    currentPlayer: PLAYER,
    gameState: GameState
  ): number {
    if (depth === 0) {
      return this.evaluateMove(grid, -1, -1, currentPlayer, gameState); // Full board evaluation
    }

    const validMoves = this.getValidMoves(grid, currentPlayer, gameState.isBaseMode, gameState.hqs);
    
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of validMoves) {
        const newGrid = this.simulateMove(grid, move.row, move.col, currentPlayer);
        const evaluation = this.minimax(newGrid, depth - 1, false, alpha, beta, this.getNextPlayer(currentPlayer), gameState);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of validMoves) {
        const newGrid = this.simulateMove(grid, move.row, move.col, currentPlayer);
        const evaluation = this.minimax(newGrid, depth - 1, true, alpha, beta, this.getNextPlayer(currentPlayer), gameState);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return minEval;
    }
  }

  getValidMoves(grid: GridCell[][], player: PLAYER, isBaseMode: boolean, hqs?: HQCell[]): AIMove[] {
    const moves: AIMove[] = [];
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[0].length; col++) {
        if (isValidMoveForAI(grid, row, col, player, isBaseMode, hqs)) {
          moves.push({ row, col, score: 0 });
        }
      }
    }
    return moves;
  }

  simulateMove(grid: GridCell[][], row: number, col: number, player: PLAYER): GridCell[][] {
    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    newGrid[row][col] = { atoms: (newGrid[row][col].atoms || 0) + 1, player };
    return newGrid;
  }

  getNextPlayer(current: PLAYER): PLAYER {
    switch (current) {
      case PLAYER.RED: return PLAYER.BLUE;
      case PLAYER.BLUE: return PLAYER.ORANGE;
      case PLAYER.ORANGE: return PLAYER.BLACK;
      case PLAYER.BLACK: return PLAYER.RED;
    }
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

    const validMoves = this.getValidMoves(grid, currentPlayer, isBaseMode, hqs);

    if (validMoves.length === 0) {
      return null;
    }

    // FIRST: Check for direct power-up moves - these get ABSOLUTE PRIORITY
    if (isBaseMode && powerUps) {
      for (const move of validMoves) {
        const powerUpAtPosition = powerUps.find(pu => pu.row === move.row && pu.col === move.col);
        if (powerUpAtPosition) {
          console.log(`🎯 POWER-UP PRIORITY! AI ${currentPlayer} found power-up at (${move.row},${move.col}) - selecting immediately!`);
          return { ...move, score: 10000 }; // Highest possible score
        }
      }
    }

    // SECOND: Use direct evaluation (not minimax) to get true scores
    for (const move of validMoves) {
      move.score = this.evaluateMove(grid, move.row, move.col, currentPlayer, gameState);
    }

    // Sort moves by score (highest first)
    validMoves.sort((a, b) => b.score - a.score);

    // THIRD: Enhanced defensive check - if enemy very close to our base, prioritize defense
    if (isBaseMode && hqs) {
      const ourHQ = hqs.find(hq => hq.player === currentPlayer);
      if (ourHQ) {
        let criticalThreat = false;
        for (let r = Math.max(0, ourHQ.row - 2); r <= Math.min(grid.length - 1, ourHQ.row + 2); r++) {
          for (let c = Math.max(0, ourHQ.col - 2); c <= Math.min(grid[0].length - 1, ourHQ.col + 2); c++) {
            const threatCell = grid[r][c];
            if (threatCell.player && threatCell.player !== currentPlayer && threatCell.atoms >= 2) {
              criticalThreat = true;
              console.log(`⚠️ CRITICAL THREAT detected near base at (${r},${c}) with ${threatCell.atoms} atoms!`);
              break;
            }
          }
          if (criticalThreat) break;
        }
        
        if (criticalThreat) {
          // Re-sort with heavy defensive weighting when under threat
          validMoves.forEach(move => {
            const distanceToHQ = Math.abs(move.row - ourHQ.row) + Math.abs(move.col - ourHQ.col);
            if (distanceToHQ <= 2) {
              move.score += 2000; // Massive defensive bonus
            }
          });
          validMoves.sort((a, b) => b.score - a.score);
        }
      }
    }

    // Select from top moves with some randomness
    const topMoveCount = Math.max(1, Math.min(3, validMoves.length)); // Always consider top 1-3 moves
    const bestMoveIndex = Math.floor(Math.random() * topMoveCount);
    const bestMove = validMoves[bestMoveIndex];
    
    console.log(`🎭 AI ${currentPlayer} (aggr:${personality.aggressiveness.toFixed(1)}, def:${personality.defensiveness.toFixed(1)}, powerUp:${personality.powerUpHunting.toFixed(1)}) chose (${bestMove.row},${bestMove.col}) with score ${bestMove.score.toFixed(1)}`);
    
    return bestMove;
  }
}

// Global AI instance
const personalityAI = new PersonalityBasedAI();

// Function to reset AI personalities for new games
export const resetAIPersonalities = () => {
  console.log('🔄 RESETTING ALL AI PERSONALITIES - fresh game starting!');
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