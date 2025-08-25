import { create } from "zustand";
import { PLAYER } from "../constants";
import { PlayerSettingsManager, playerAssignments } from "../../components/Menu/MainMenu";

export type GridCell = {
  atoms: number;
  player: PLAYER | null;
};

export type PowerUpType = 'diamond' | 'heart' | null;

export type PowerUpCell = {
  row: number;
  col: number;
  type: PowerUpType;
};

export type HQCell = {
  row: number;
  col: number;
  player: PLAYER;
  health: number;
};

export type GameHistory = {
  grid: GridCell[][];
  currentPlayer: PLAYER;
  gameOver: boolean;
  winner: PLAYER | null;
  baseMode?: {
    hqs: HQCell[];
    powerUps: PowerUpCell[];
  };
};

// HQ effect tracking (damage, healing, or destruction)
type HQDamageEffect = {
  row: number;
  col: number;
  player: PLAYER;
  timestamp: number;
  type: 'damage' | 'heal' | 'destroyed'; // Indicates whether the HQ lost, gained health, or was destroyed
};

interface ChainReactionState {
  // Game state
  isBaseMode: boolean;
  grid: GridCell[][];
  rows: number;
  cols: number;
  currentPlayer: PLAYER;
  gameOver: boolean;
  winner: PLAYER | null;

  // Animation state
  animating: boolean;
  setAnimating: (animating: boolean) => void;
  
  // Visual effects state
  lastHQDamaged?: HQDamageEffect;

  // Base mode specific
  hqs: HQCell[];
  powerUps: PowerUpCell[];

  // Heart power-up selection mode
  heartSelectionMode: boolean;
  pendingHeartPlayer: PLAYER | null;

  // History for undo
  history: GameHistory[];

  // Game actions
  initClassicMode: () => void;
  initBaseMode: () => void;
  placeDot: (row: number, col: number) => void;
  undo: () => void;
  restart: () => void;
  isValidMove: (row: number, col: number) => boolean; // This is explicitly a boolean return


  // Utilities
  getCriticalMass: (row: number, col: number) => number;
  getNeighbors: (row: number, col: number) => { row: number; col: number }[];
}

export const useChainReaction = create<ChainReactionState>((set, get) => ({
  // Default initial state
  isBaseMode: false,
  grid: [],
  rows: 7,
  cols: 9,
  currentPlayer: PLAYER.RED,
  gameOver: false,
  winner: null,

  // Animation state
  animating: false,
  setAnimating: (animating) => set({ animating }),

  // Base mode specific
  hqs: [],
  powerUps: [],

  // Heart power-up selection mode
  heartSelectionMode: false,
  pendingHeartPlayer: null,



  // History for undo
  history: [],

  // Initialize classic mode (9x7 grid - more vertical)
  initClassicMode: () => {
    // Clear grid immediately to prevent visual glitch
    set({
      grid: [],
      gameOver: false,
      winner: null,
      history: [],
      hqs: [],
      powerUps: [],
    });

    const rows = 9;
    const cols = 7;

    // Create a properly typed grid
    const emptyGrid: GridCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < cols; c++) {
        row.push({ atoms: 0, player: null });
      }
      emptyGrid.push(row);
    }

    // Determine starting player from player settings
    let startingPlayer = PLAYER.RED;
    
    // Use PlayerSettingsManager to get player settings
    try {
      // Get settings using the manager
      const settings = PlayerSettingsManager.getSettings();
      const activePlayers = settings.players;
      
      // Ensure we have valid players
      if (activePlayers && activePlayers.length > 0) {
        startingPlayer = activePlayers[0];
        console.log("Using player settings for classic mode:", settings);
      } else {
        console.log("No valid player settings found, using defaults for classic mode");
      }
    } catch (error) {
      console.log("Error getting player settings for classic mode:", error);
    }
    
    // Get the active player list from PlayerSettingsManager for logging
    const activePlayersList = PlayerSettingsManager.getSettings().players;
    console.log(`Initializing classic mode with players:`, activePlayersList, `starting with ${startingPlayer}`);

    set({
      isBaseMode: false,
      grid: emptyGrid,
      rows,
      cols,
      currentPlayer: startingPlayer,
      gameOver: false,
      winner: null,
      history: [], // Clear history
      hqs: [], // No HQs in classic mode
      powerUps: [], // No power-ups in classic mode
    });
  },

  // Initialize base reaction mode (9x9 grid with HQs)
  initBaseMode: () => {
    // Clear grid immediately to prevent visual glitch
    set({
      grid: [],
      gameOver: false,
      winner: null,
      history: [],
      hqs: [],
      powerUps: [],
    });

    const rows = 9;
    const cols = 9;

    // Create a properly typed grid
    const emptyGrid: GridCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < cols; c++) {
        row.push({ atoms: 0, player: null });
      }
      emptyGrid.push(row);
    }

    // Get player settings to set up HQs for selected players
    let activePlayers = [PLAYER.RED, PLAYER.BLUE]; // Default
    let numPlayers = 2;
    
    try {
      // Get settings using the PlayerSettingsManager
      const settings = PlayerSettingsManager.getSettings();
      
      // Ensure we have valid players
      if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
        activePlayers = settings.players;
        numPlayers = settings.numberOfPlayers || activePlayers.length;
        console.log("Using player settings for base mode:", settings);
      } else {
        console.log("No valid player settings found, using defaults for base mode");
      }
    } catch (error) {
      console.log("Error getting player settings for base mode:", error);
    }
    
    // Ensure numPlayers matches activePlayers.length
    numPlayers = Math.min(numPlayers, 4); // Cap at 4
    console.log(`Initializing base mode with ${numPlayers} players:`, activePlayers);

    // Create HQ cells based on the number of players
    const hqs: HQCell[] = [];
    
    if (numPlayers === 2) {
      // Traditional 2-player setup (left and right)
      const player1 = activePlayers[0]; // RED - Left
      const player2 = activePlayers[1]; // BLUE - Right
      
      hqs.push({ row: Math.floor(rows / 2), col: 0, player: player1, health: 5 });  // Left
      hqs.push({ row: Math.floor(rows / 2), col: cols - 1, player: player2, health: 5 });  // Right
    } 
    else if (numPlayers === 3) {
      // 3-player setup in clockwise order: RED, BLUE, VIOLET
      // Position at Left, Top, Right in clockwise order
      const player1 = activePlayers[0]; // RED - Left
      const player2 = activePlayers[1]; // BLUE - Top
      const player3 = activePlayers[2]; // VIOLET - Right
      
      hqs.push({ row: Math.floor(rows / 2), col: 0, player: player1, health: 5 });  // Left - RED
      hqs.push({ row: 0, col: Math.floor(cols / 2), player: player2, health: 5 });  // Top - BLUE
      hqs.push({ row: Math.floor(rows / 2), col: cols - 1, player: player3, health: 5 });  // Right - VIOLET
    }
    else if (numPlayers === 4) {
      // 4-player setup in clockwise order: RED, BLUE, VIOLET, DARK_BLUE
      // Position at Left, Top, Right, Bottom in clockwise order
      const player1 = activePlayers[0]; // RED - Left
      const player2 = activePlayers[1]; // BLUE - Top
      const player3 = activePlayers[2]; // VIOLET - Right
      const player4 = activePlayers[3]; // DARK_BLUE - Bottom
      
      hqs.push({ row: Math.floor(rows / 2), col: 0, player: player1, health: 5 });  // Left - RED
      hqs.push({ row: 0, col: Math.floor(cols / 2), player: player2, health: 5 });  // Top - BLUE
      hqs.push({ row: Math.floor(rows / 2), col: cols - 1, player: player3, health: 5 });  // Right - VIOLET
      hqs.push({ row: rows - 1, col: Math.floor(cols / 2), player: player4, health: 5 });  // Bottom - DARK_BLUE
    }

    // Place HQ cells on the grid with initial atoms
    hqs.forEach(hq => {
      emptyGrid[hq.row][hq.col] = {
        atoms: 1,
        player: hq.player
      };
    });

    // Start with no power-ups - they'll be generated on the second turn
    const powerUps: PowerUpCell[] = [];

    // Determine starting player
    let startingPlayer = activePlayers[0];

    set({
      isBaseMode: true,
      grid: emptyGrid,
      rows,
      cols,
      currentPlayer: startingPlayer,
      gameOver: false,
      winner: null,
      history: [], // Clear history
      hqs: hqs, // Set HQs based on player selection
      powerUps, // Empty power-ups initially
      lastHQDamaged: undefined // Clear any previous HQ damage animations to prevent startup animations
    });
  },

  // Calculate critical mass for a cell
  getCriticalMass: (row, col) => {
    const { rows, cols } = get();

    // Corner cells (2 neighbors)
    if ((row === 0 && col === 0) || 
        (row === 0 && col === cols - 1) || 
        (row === rows - 1 && col === 0) || 
        (row === rows - 1 && col === cols - 1)) {
      return 2;
    }

    // Edge cells (3 neighbors)
    if (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) {
      return 3;
    }

    // Center cells (4 neighbors)
    return 4;
  },

  // Get neighboring cells
  getNeighbors: (row, col) => {
    const { rows, cols } = get();
    const neighbors = [];

    // Check up
    if (row > 0) neighbors.push({ row: row - 1, col });
    // Check right
    if (col < cols - 1) neighbors.push({ row, col: col + 1 });
    // Check down
    if (row < rows - 1) neighbors.push({ row: row + 1, col });
    // Check left
    if (col > 0) neighbors.push({ row, col: col - 1 });

    return neighbors;
  },

  // Check if a move is valid
  isValidMove: (row, col) => {
    const { grid, currentPlayer, gameOver, isBaseMode, hqs } = get();

    // No moves if game is over
    if (gameOver) return false;

    // Safety check for valid coordinates
    if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) {
      return false;
    }

    const cell = grid[row][col];

    // In classic mode, a move is valid if the cell is empty or owned by the current player
    if (!isBaseMode) {
      return cell.player === null || cell.player === currentPlayer;
    }

    // In base mode, additional rules apply

    // RULE 1: Cannot place on any HQ base (even your own)
    const isAnyHQ = hqs.some(hq => hq.row === row && hq.col === col);
    if (isAnyHQ) return false;

    // RULE 2: Can play on empty cells or your own cells
    if (cell.player === null || cell.player === currentPlayer) {
      // Find current player's HQ
      const ownHQ = hqs.find(hq => hq.player === currentPlayer);

      if (!ownHQ) return false; // Safety check

      // RULE 3: Check if in the side of the HQ (row OR column, determined by HQ position)
      // This allows for "line of sight" expansion only on their own side
      let isInHQLine = false;

      // Determine which side the player's HQ is on
      if (ownHQ.col === 0) {
        // HQ is on left, player can only place on their column
        isInHQLine = col === ownHQ.col;
      } else if (ownHQ.col === grid[0].length - 1) {
        // HQ is on right, player can only place on their column
        isInHQLine = col === ownHQ.col;
      } else if (ownHQ.row === 0) {
        // HQ is on top, player can only place on their row
        isInHQLine = row === ownHQ.row;
      } else if (ownHQ.row === grid.length - 1) {
        // HQ is on bottom, player can only place on their row
        isInHQLine = row === ownHQ.row;
      } else {
        // Safety fallback for unexpected HQ positions
        console.warn("HQ position not on grid edge, allowing both row and column");
        isInHQLine = (row === ownHQ.row || col === ownHQ.col);
      }

      // RULE 4: Check if there are orthogonal neighboring cells of your color
      // This allows for expanding from existing dots
      const neighbors = get().getNeighbors(row, col);
      const hasOwnNeighbor = neighbors.some(n => {
        if (n.row < 0 || n.row >= grid.length || n.col < 0 || n.col >= grid[0].length) return false;
        const neighborCell = grid[n.row][n.col];
        return neighborCell.player === currentPlayer;
      });

      // RULE 5: Check diagonal neighbors as well
      // This allows for expanding diagonally from existing dots
      const diagonalNeighbors = [
        {row: row-1, col: col-1}, {row: row-1, col: col+1},
        {row: row+1, col: col-1}, {row: row+1, col: col+1}
      ].filter(n => n.row >= 0 && n.row < grid.length && n.col >= 0 && n.col < grid[0].length);

      const hasOwnDiagonalNeighbor = diagonalNeighbors.some(n => {
        const neighborCell = grid[n.row][n.col];
        return neighborCell.player === currentPlayer;
      });

      // RULE 6: Check if adjacent to HQ (including diagonal)
      // This allows for expanding immediately around your own HQ
      // Ensure we exclude the HQ cell itself more precisely
      const isAdjacentToHQ = (
        Math.abs(ownHQ.row - row) <= 1 && 
        Math.abs(ownHQ.col - col) <= 1 && 
        !(ownHQ.row === row && ownHQ.col === col) // Explicitly exclude HQ cell itself
      );

      // Debug logging for all players
      console.log(`${currentPlayer} player - Cell ${row},${col} check:
        - Is in HQ line (row or column): ${isInHQLine}
        - Has orthogonal neighbor: ${hasOwnNeighbor}
        - Has diagonal neighbor: ${hasOwnDiagonalNeighbor}
        - Is adjacent to HQ: ${isAdjacentToHQ}`);

      // Valid move if any of the following is true:
      // 1. In same line as HQ (row OR column depending on HQ position)
      // 2. Adjacent to HQ (including diagonal)
      // 3. Adjacent (orthogonal) to own piece
      // 4. Adjacent (diagonal) to own piece
      return isInHQLine || isAdjacentToHQ || hasOwnNeighbor || hasOwnDiagonalNeighbor;
    }

    return false;
  },

  // Place a dot on the board
  placeDot: (row, col) => {
    const { 
      grid, currentPlayer, isBaseMode, 
      getCriticalMass, getNeighbors, 
      powerUps, hqs, setAnimating, 
      heartSelectionMode, pendingHeartPlayer
    } = get();

    console.log(`Placing dot at (${row},${col}) for player ${currentPlayer}`);

    // ROCK-SOLID HEART SELECTION LOGIC
    if (heartSelectionMode) {
      console.log(`🎯 HEART SELECTION: Player ${currentPlayer} clicked (${row},${col})`);
      
      // Find all HQs and log them
      const allHQs = hqs;
      console.log(`All HQs on board:`, allHQs);
      
      // Find the HQ at clicked position
      const clickedHQ = allHQs.find(hq => hq.row === row && hq.col === col);
      console.log(`Clicked HQ:`, clickedHQ);
      
      // Check if it's a valid enemy target
      const isValidTarget = clickedHQ && clickedHQ.player !== currentPlayer;
      console.log(`Is valid enemy target:`, isValidTarget);
      
      if (isValidTarget) {
        console.log(`✅ DAMAGING ENEMY: ${clickedHQ.player} (health: ${clickedHQ.health} -> ${clickedHQ.health - 1})`);
        
        // Simple next player calculation
        const nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : 
                          currentPlayer === PLAYER.BLUE ? PLAYER.ORANGE : 
                          currentPlayer === PLAYER.ORANGE ? PLAYER.BLACK : PLAYER.RED;
        
        // Update everything in one atomic operation
        const newHqs = hqs.map(hq => 
          hq.row === row && hq.col === col 
            ? { ...hq, health: hq.health - 1 }
            : hq
        );
        
        set({
          ...get(),
          hqs: newHqs,
          heartSelectionMode: false,
          pendingHeartPlayer: null,
          currentPlayer: nextPlayer,
          lastHQDamaged: {
            row: row,
            col: col,
            player: clickedHQ.player,
            timestamp: Date.now(),
            type: 'damage' as const
          }
        });
        
        console.log(`🎯 HEART DAMAGE COMPLETE! Next player: ${nextPlayer}`);
        return;
      } else {
        console.log(`❌ CANCELLING HEART SELECTION (invalid target)`);
        
        // Cancel selection and advance turn
        const nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : 
                          currentPlayer === PLAYER.BLUE ? PLAYER.ORANGE : 
                          currentPlayer === PLAYER.ORANGE ? PLAYER.BLACK : PLAYER.RED;
        
        set({
          ...get(),
          heartSelectionMode: false,
          pendingHeartPlayer: null,
          currentPlayer: nextPlayer
        });
        
        console.log(`🎯 HEART SELECTION CANCELLED! Next player: ${nextPlayer}`);
        return;
      }
    }

    // Save current state to history before making changes
    const currentState = get();
    const historyEntry: GameHistory = {
      grid: JSON.parse(JSON.stringify(currentState.grid)),
      currentPlayer: currentState.currentPlayer,
      gameOver: currentState.gameOver,
      winner: currentState.winner
    };

    if (isBaseMode) {
      historyEntry.baseMode = {
        hqs: JSON.parse(JSON.stringify(currentState.hqs)),
        powerUps: JSON.parse(JSON.stringify(currentState.powerUps))
      };
    }

    set(state => ({
      history: [...state.history, historyEntry]
    }));

    // Process the move
    set(state => {
      // Create a deep copy of the grid to avoid direct state mutations
      const newGrid = JSON.parse(JSON.stringify(state.grid));
      let newHqs = [...state.hqs];
      // Create a new copy of power-ups for modification
      let newPowerUps = [...state.powerUps];

      // Check if the cell has a power-up
      const powerUpIndex = newPowerUps.findIndex(pu => pu.row === row && pu.col === col);
      const powerUp = powerUpIndex !== -1 ? newPowerUps[powerUpIndex] : null;

      if (powerUp && powerUp.type === 'diamond') {
        // Check number of players to determine power-up behavior
        try {
          const settings = PlayerSettingsManager.getSettings();
          const numPlayers = settings.numberOfPlayers || 2;
          
          if (numPlayers >= 3) {
            // 3-4 player game: Diamond spawns dots in a 3x3 area around the clicked cell
            console.log("Diamond power-up in 3-4 player game: spawning dots in 3x3 area");
            
            // Get all 9 cells in the 3x3 grid around the current cell
            for (let r = row - 1; r <= row + 1; r++) {
              for (let c = col - 1; c <= col + 1; c++) {
                // Check if coordinates are valid (within grid bounds)
                if (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
                  // Place dot only if the cell is empty or belongs to the current player
                  if (newGrid[r][c].player === null || newGrid[r][c].player === currentPlayer) {
                    newGrid[r][c].atoms += 1;
                    newGrid[r][c].player = currentPlayer;
                  }
                }
              }
            }
          } else {
            // 2-player game: Diamond adds a dot to each cell in the row
            console.log("Diamond power-up in 2-player game: spawning dots in row");
            for (let c = 0; c < state.cols; c++) {
              if (newGrid[row][c].player === null || newGrid[row][c].player === currentPlayer) {
                newGrid[row][c].atoms += 1;
                newGrid[row][c].player = currentPlayer;
              }
            }
          }
        } catch (error) {
          console.error("Error determining player count for diamond power-up:", error);
          // Fallback to original behavior
          for (let c = 0; c < state.cols; c++) {
            if (newGrid[row][c].player === null || newGrid[row][c].player === currentPlayer) {
              newGrid[row][c].atoms += 1;
              newGrid[row][c].player = currentPlayer;
            }
          }
        }
        
        // Remove the power-up after use
        newPowerUps.splice(powerUpIndex, 1);
      } else if (powerUp && powerUp.type === 'heart') {
        // NEW HEART POWER-UP LOGIC - NO DOT PLACEMENT
        console.log("Heart power-up used!");
        
        // Remove power-up first
        newPowerUps.splice(powerUpIndex, 1);
        
        // Get own HQ
        const ownHQ = newHqs.find(hq => hq.player === currentPlayer);
        if (!ownHQ) {
          console.error("No HQ found for current player");
          // Continue with normal game flow even if no HQ found
        } else if (ownHQ.health < 5) {
          // Case 1: Less than 5 health - heal yourself
          console.log("Heart: Healing own HQ");
          ownHQ.health += 1;
          
          // Store the heal effect for animation
          setTimeout(() => {
            set(state => ({
              ...state,
              lastHQDamaged: {
                row: ownHQ.row,
                col: ownHQ.col,
                player: ownHQ.player,
                timestamp: Date.now(),
                type: 'heal' as const
              }
            }));
          }, 0);
        } else {
          // Case 2 & 3: 5 health - damage an enemy
          const enemyHQs = newHqs.filter(hq => hq.player !== currentPlayer);
          if (enemyHQs.length === 1) {
            // Case 2: Only one enemy - damage automatically
            const targetEnemy = enemyHQs[0];
            console.log(`Heart: Auto-damaging single enemy ${targetEnemy.player}`);
            targetEnemy.health -= 1;
            
            // Store the damage effect for animation
            setTimeout(() => {
              set(state => ({
                ...state,
                lastHQDamaged: {
                  row: targetEnemy.row,
                  col: targetEnemy.col,
                  player: targetEnemy.player,
                  timestamp: Date.now(),
                  type: 'damage' as const
                }
              }));
            }, 0);
          } else if (enemyHQs.length > 1) {
            // Case 3: Multiple enemies - enter selection mode
            console.log("Heart: Entering enemy selection mode");
            // Return the state with heart selection mode enabled, but don't continue processing
            return {
              grid: newGrid,
              powerUps: newPowerUps,
              hqs: newHqs,
              heartSelectionMode: true,
              pendingHeartPlayer: currentPlayer
            };
          }
        }
        
        // For heart power-up, skip normal dot placement - no explosion check needed
        
        // For heart power-up, complete the turn immediately (no dots or explosions)
        return set(state => {
          const nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : 
                            currentPlayer === PLAYER.BLUE ? PLAYER.ORANGE : 
                            currentPlayer === PLAYER.ORANGE ? PLAYER.BLACK : PLAYER.RED;
          
          return {
            ...state,
            grid: newGrid,
            powerUps: newPowerUps,
            hqs: newHqs,
            currentPlayer: nextPlayer
          };
        });
      } else {
        // Normal move - add a dot to the selected cell
        if (newGrid[row][col].player !== currentPlayer && newGrid[row][col].player !== null) {
          // If capturing enemy cell, replace with 1 atom
          newGrid[row][col] = { atoms: 1, player: currentPlayer };
        } else {
          // Otherwise add an atom
          newGrid[row][col].atoms += 1;
          newGrid[row][col].player = currentPlayer;
        }
      }

      // Queue of cells to process (for sequential chain reaction)
      const explosionQueue: {r: number, c: number}[] = [];

      // Initial check if placed cell should explode
      if (newGrid[row][col].atoms >= getCriticalMass(row, col)) {
        explosionQueue.push({r: row, c: col});
      }

      // Process explosions one by one (will be processed after state update)
      if (explosionQueue.length > 0) {
        // First state update with just the new atom placement
        const firstState = {
          grid: newGrid,
          powerUps: newPowerUps,
          hqs: newHqs
        };

        // Process explosions after a short delay (matching animation duration)
        setTimeout(() => {
          // Chain reaction process
          const processExplosions = () => {
            if (explosionQueue.length === 0) {
              // End of chain reaction - finish turn
              set(state => {
                // Check for game over conditions
                let gameOver = false;
                let winner = null;

                if (isBaseMode) {
                  // In base mode with multiple players, check to see if only one HQ remains
                  // Get all dead HQs
                  const deadHQs = newHqs.filter(hq => hq.health <= 0);
                  
                  // Clear all dots from the board for players whose HQ was destroyed
                  // Also remove the HQs from the array so they don't keep rendering
                  deadHQs.forEach(deadHQ => {
                    console.log(`Clearing all dots and removing HQ for defeated player: ${deadHQ.player}`);
                    for (let r = 0; r < newGrid.length; r++) {
                      for (let c = 0; c < newGrid[r].length; c++) {
                        if (newGrid[r][c].player === deadHQ.player) {
                          newGrid[r][c] = { atoms: 0, player: null };
                        }
                      }
                    }
                    
                    // Remove the dead HQ from the HQs array to prevent re-rendering
                    const hqIndex = newHqs.findIndex(hq => hq.row === deadHQ.row && hq.col === deadHQ.col && hq.player === deadHQ.player);
                    if (hqIndex !== -1) {
                      newHqs.splice(hqIndex, 1);
                      console.log(`Removed HQ at (${deadHQ.row}, ${deadHQ.col}) for player ${deadHQ.player}`);
                    }
                  });
                  
                  // Get active player settings using PlayerSettingsManager
                  let activePlayers = [PLAYER.RED, PLAYER.BLUE]; // Default
                  
                  try {
                    // Get settings using the PlayerSettingsManager
                    const settings = PlayerSettingsManager.getSettings();
                    
                    // Ensure we have valid players
                    if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
                      activePlayers = settings.players;
                      console.log("Using player settings for game over check:", settings);
                    } else {
                      console.log("No valid player settings found, using defaults for game over check");
                    }
                  } catch (error) {
                    console.log("Error getting player settings for game over check:", error);
                  }
                  
                  // Get all surviving HQs
                  const survivingHQs = newHqs.filter(hq => hq.health > 0);
                  
                  // If all HQs except one are dead, the game is over
                  if (survivingHQs.length === 1) {
                    gameOver = true;
                    winner = survivingHQs[0].player;
                  }
                  // If no HQs remain, something weird happened!
                  else if (survivingHQs.length === 0) {
                    gameOver = true;
                    winner = null; // Draw
                  }
                  // Alternative check: if just one HQ died this turn, the owner of that HQ loses
                  // and the other player wins if there are only 2 players
                  else if (deadHQs.length === 1 && activePlayers.length === 2) {
                    gameOver = true;
                    
                    // Find the player who is not the one who lost
                    const deadPlayer = deadHQs[0].player;
                    const winnerIndex = activePlayers.findIndex(p => p !== deadPlayer);
                    if (winnerIndex >= 0) {
                      winner = activePlayers[winnerIndex];
                    } else {
                      // Fallback
                      winner = deadPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
                    }
                  }
                } else {
                  // In classic mode, game is over if only one player has atoms
                  // AND there are at least two players who have played
                  const playersInGame = new Set();
                  let totalOccupiedCells = 0;

                  for (let r = 0; r < state.rows; r++) {
                    for (let c = 0; c < state.cols; c++) {
                      if (newGrid[r][c].player) {
                        playersInGame.add(newGrid[r][c].player);
                        totalOccupiedCells++;
                      }
                    }
                  }

                  // Game is only over if:
                  // 1. We have at least 2 moves (each player has played at least once)
                  // 2. Only one player remains with atoms
                  if (playersInGame.size === 1 && totalOccupiedCells > 0 && state.history.length >= 2) {
                    gameOver = true;
                    winner = Array.from(playersInGame)[0] as PLAYER;
                  }
                }

                // Switch to the next player if the game isn't over
                let nextPlayer = currentPlayer;
                if (!gameOver) {
                  // Get player settings using PlayerSettingsManager
                  try {
                    // Default to two players if anything goes wrong
                    let activePlayers: PLAYER[] = [PLAYER.RED, PLAYER.BLUE]; 
                    
                    // Get settings using the PlayerSettingsManager
                    const settings = PlayerSettingsManager.getSettings();
                    
                    // Ensure we have valid players
                    if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
                      activePlayers = settings.players;
                      console.log("Using player settings for turn rotation:", settings);
                    } else {
                      console.log("No valid player settings found, using defaults for turn rotation");
                    }
                    
                    // Ensure we have valid player data
                    console.log("Active players for turn rotation:", activePlayers);
                    
                    // Filter out dead players (in base mode)
                    if (state.isBaseMode) {
                      const livingHQPlayers = newHqs
                        .filter(hq => hq.health > 0)
                        .map(hq => hq.player);
                        
                      activePlayers = activePlayers.filter(player => 
                        livingHQPlayers.includes(player)
                      );
                      console.log("After filtering dead players:", activePlayers);
                    }
                    
                    // Only proceed with rotation if we have players
                    if (activePlayers.length > 0) {
                      // Find current player's index
                      const currentIndex = activePlayers.indexOf(currentPlayer);
                      console.log("Current player:", currentPlayer, "Current index:", currentIndex);
                      
                      // Safety check: if current player not found in active players, use index 0
                      const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
                      
                      // Check if players have dots on the board (skip players with no dots)
                      // But only if they've already had their first turn (history contains them)
                      const playersWithDots = new Set<PLAYER>();
                      
                      // Find all players who currently have dots on board
                      for (let r = 0; r < newGrid.length; r++) {
                        for (let c = 0; c < newGrid[0].length; c++) {
                          if (newGrid[r][c].player) {
                            playersWithDots.add(newGrid[r][c].player);
                          }
                        }
                      }
                      
                      // Initial player rotation
                      let nextIndex = (safeCurrentIndex + 1) % activePlayers.length;
                      nextPlayer = activePlayers[nextIndex];
                      
                      // Flag to track if we've checked all players
                      let checkedAllPlayers = false;
                      // Counter to prevent infinite loops
                      let safetyCounter = 0; 
                      
                      // Check if the next player has any dots on the board
                      // Except if it's their first turn (they should get at least one turn)
                      while (!playersWithDots.has(nextPlayer) && state.history.length > activePlayers.length && !checkedAllPlayers && safetyCounter < activePlayers.length) {
                        console.log(`Player ${nextPlayer} has no dots, skipping their turn`);
                        
                        // Move to the next player
                        nextIndex = (nextIndex + 1) % activePlayers.length;
                        nextPlayer = activePlayers[nextIndex];
                        
                        // Check if we've gone through all players 
                        if (nextIndex === ((safeCurrentIndex + 1) % activePlayers.length)) {
                          checkedAllPlayers = true;
                        }
                        
                        safetyCounter++;
                      }
                      
                      // Enhanced debugging for player rotation
                      console.log("PLAYER ROTATION: Current player =", currentPlayer, 
                                  "| Current index =", safeCurrentIndex, 
                                  "| Next player =", nextPlayer, 
                                  "| Next index =", nextIndex,
                                  "| Available players =", activePlayers,
                                  "| Players with dots =", Array.from(playersWithDots));
                    } else {
                      // Fallback to simple 2-player rotation
                      nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
                      console.log("Fallback to two players. Next player:", nextPlayer);
                    }
                  } catch (error) {
                    console.error("Error in player rotation logic:", error);
                    // Fallback to simple 2-player rotation
                    nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
                  }
                }

                // Important: Reset the animation state when explosions are complete
                setAnimating(false);
                console.log("Animation completed - chain reaction finished");

                return {
                  grid: newGrid,
                  currentPlayer: nextPlayer,
                  gameOver,
                  winner,
                  hqs: newHqs,
                  powerUps: newPowerUps,
                  animating: false // Explicitly set animating to false here as well
                };
              });
              return;
            }

            // Process the next explosion in the queue
            const nextExplosion = explosionQueue.shift();
            if (!nextExplosion) {
              console.warn("⚠️  Explosion queue is unexpectedly empty, ending chain reaction");
              return;
            }
            const {r, c} = nextExplosion;
            const criticalMass = getCriticalMass(r, c);
            const cell = newGrid[r][c];

            if (cell.atoms >= criticalMass) {
              // Play explosion sound
              if (get().animating) {
                // Could add specific explosion sound here
              }

              // Distribute atoms to neighbors
              newGrid[r][c].atoms -= criticalMass;
              if (newGrid[r][c].atoms === 0) {
                newGrid[r][c].player = null;
              }

              const neighbors = getNeighbors(r, c);
              neighbors.forEach(({ row: nr, col: nc }) => {
                // In base mode, check if this is an HQ cell
                if (isBaseMode) {
                  // Check if this is any HQ cell
                  const isHQCell = newHqs.some(hq => hq.row === nr && hq.col === nc);
                  
                  if (isHQCell) {
                    // If enemy HQ, damage it
                    const targetHQ = newHqs.find(hq => hq.row === nr && hq.col === nc && hq.player !== currentPlayer);
                    if (targetHQ) {
                      // Store previous health to check if it changed
                      const oldHealth = targetHQ.health;
                      
                      // Damage enemy HQ
                      targetHQ.health -= 1;
                      console.log(`Enemy HQ damaged! Health now: ${targetHQ.health}`);

                      // Check if HQ was destroyed (health <= 0)
                      if (targetHQ.health <= 0) {
                        console.log(`HQ DESTROYED at (${targetHQ.row}, ${targetHQ.col})!`);
                        
                        // Trigger violent destruction animation
                        set(state => ({
                          ...state,
                          lastHQDamaged: { 
                            row: targetHQ.row, 
                            col: targetHQ.col, 
                            player: targetHQ.player,
                            timestamp: Date.now(),
                            type: 'destroyed' // Mark as destruction effect
                          }
                        }));
                        
                        // Remove HQ from the list after a delay to allow animation
                        setTimeout(() => {
                          set(state => ({
                            hqs: state.hqs.filter(hq => !(hq.row === targetHQ.row && hq.col === targetHQ.col))
                          }));
                          console.log(`HQ removed from board at (${targetHQ.row}, ${targetHQ.col})`);
                        }, 1500); // Wait for destruction animation to complete
                        
                      } else {
                        // Regular damage animation
                        set(state => ({
                          ...state,
                          lastHQDamaged: { 
                            row: targetHQ.row, 
                            col: targetHQ.col, 
                            player: targetHQ.player,
                            timestamp: Date.now(),
                            type: 'damage'
                          }
                        }));
                      }
                    }
                    // Skip adding atoms to any HQ cell
                    return;
                  }
                }

                // Regular explosion to neighboring cell
                // Always set the cell to the current player's color
                if (newGrid[nr][nc].player !== null && newGrid[nr][nc].player !== currentPlayer) {
                  // Capture enemy cell - convert all atoms to current player
                  newGrid[nr][nc].player = currentPlayer;
                  // We now keep the current atom count and add one more 
                  // (instead of just setting to 1, which was less explosive)
                  newGrid[nr][nc].atoms += 1;
                } else {
                  // Add atom to empty or own cell
                  newGrid[nr][nc].atoms += 1;
                  newGrid[nr][nc].player = currentPlayer;
                }

                // Check if the neighbor should explode and add to queue if it should
                // This is critical for multi-step chain reactions
                if (newGrid[nr][nc].atoms >= getCriticalMass(nr, nc)) {
                  console.log(`Cell at (${nr},${nc}) will explode next (${newGrid[nr][nc].atoms}/${getCriticalMass(nr, nc)})`);
                  // Make sure we don't have a duplicate in the queue
                  if (!explosionQueue.some(item => item.r === nr && item.c === nc)) {
                    explosionQueue.push({r: nr, c: nc});
                  }
                }
              });

              // Update grid with this explosion
              set({ grid: [...newGrid] });

              // Process next explosion after a short delay
              setTimeout(processExplosions, 150);
            } else {
              // This cell doesn't need to explode, move to next
              processExplosions();
            }
          };

          // Start the chain reaction process
          processExplosions();
        }, 300); // Delay before starting chain reaction

        return firstState;
      }

      // Check for game over conditions
      let gameOver = false;
      let winner = null;
      
      // If no explosions queue, we need to explicitly reset the animation state
      // as the chain reaction logic won't run
      if (explosionQueue.length === 0) {
        // Reset animation state with a small delay to allow for visual feedback
        setTimeout(() => {
          setAnimating(false);
          console.log("No chain reaction - resetting animation state");
        }, 100);
      }

      if (isBaseMode) {
        // In base mode with multiple players, check to see if only one HQ remains
        // Get all dead HQs
        const deadHQs = newHqs.filter(hq => hq.health <= 0);
        
        // Get active player settings using PlayerSettingsManager
        let activePlayers = [PLAYER.RED, PLAYER.BLUE]; // Default
        
        try {
          // Get settings using the PlayerSettingsManager
          const settings = PlayerSettingsManager.getSettings();
          
          // Ensure we have valid players
          if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
            activePlayers = settings.players;
            console.log("Using player settings for game over check (NO EXPLOSION):", settings);
          } else {
            console.log("No valid player settings found, using defaults for game over check (NO EXPLOSION)");
          }
        } catch (error) {
          console.log("Error getting player settings for game over check (NO EXPLOSION):", error);
        }
        
        // Get all surviving HQs
        const survivingHQs = newHqs.filter(hq => hq.health > 0);
        
        // If all HQs except one are dead, the game is over
        if (survivingHQs.length === 1) {
          gameOver = true;
          winner = survivingHQs[0].player;
        }
        // If no HQs remain, something weird happened!
        else if (survivingHQs.length === 0) {
          gameOver = true;
          winner = null; // Draw
        }
        // Alternative check: if just one HQ died this turn, the owner of that HQ loses
        // and if there are only 2 players, the other player wins
        else if (deadHQs.length === 1 && activePlayers.length === 2) {
          gameOver = true;
          
          // Find the player who is not the one who lost
          const deadPlayer = deadHQs[0].player;
          const winnerIndex = activePlayers.findIndex(p => p !== deadPlayer);
          if (winnerIndex >= 0) {
            winner = activePlayers[winnerIndex];
          } else {
            // Fallback
            winner = deadPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
          }
        }
      } else {
        // In classic mode, game is over if only one player has atoms
        // AND there are at least two players who have played
        const playersInGame = new Set();
        let totalOccupiedCells = 0;

        for (let r = 0; r < state.rows; r++) {
          for (let c = 0; c < state.cols; c++) {
            if (newGrid[r][c].player) {
              playersInGame.add(newGrid[r][c].player);
              totalOccupiedCells++;
            }
          }
        }

        // Game is only over if:
        // 1. We have at least 2 moves (each player has played at least once)
        // 2. Only one player remains with atoms
        if (playersInGame.size === 1 && totalOccupiedCells > 0 && state.history.length >= 2) {
          gameOver = true;
          winner = Array.from(playersInGame)[0] as PLAYER;
        }
      }

      // Switch to the next player if the game isn't over
      let nextPlayer = currentPlayer;
      if (!gameOver) {
        // Get player settings using PlayerSettingsManager
        try {
          // Default to two players if anything goes wrong
          let activePlayers: PLAYER[] = [PLAYER.RED, PLAYER.BLUE]; 
          
          // Get settings using the PlayerSettingsManager
          const settings = PlayerSettingsManager.getSettings();
          
          // Ensure we have valid players
          if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
            activePlayers = settings.players;
            console.log("Using player settings for turn rotation (NO EXPLOSION):", settings);
          } else {
            console.log("No valid player settings found, using defaults for turn rotation (NO EXPLOSION)");
          }
          
          // Ensure we have valid player data
          console.log("Active players for turn rotation (NO EXPLOSION):", activePlayers);
          
          // Filter out dead players (in base mode)
          if (state.isBaseMode) {
            const livingHQPlayers = newHqs
              .filter(hq => hq.health > 0)
              .map(hq => hq.player);
              
            activePlayers = activePlayers.filter(player => 
              livingHQPlayers.includes(player)
            );
            console.log("After filtering dead players (NO EXPLOSION):", activePlayers);
          }
          
          // Only proceed with rotation if we have players
          if (activePlayers.length > 0) {
            // Find current player's index
            const currentIndex = activePlayers.indexOf(currentPlayer);
            
            // Safety check: if current player not found in active players, use index 0
            const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
            
            // Check if players have dots on the board (skip players with no dots)
            // But only if they've already had their first turn (history contains them)
            const playersWithDots = new Set<PLAYER>();
            
            // Find all players who currently have dots on board
            for (let r = 0; r < newGrid.length; r++) {
              for (let c = 0; c < newGrid[0].length; c++) {
                if (newGrid[r][c].player) {
                  playersWithDots.add(newGrid[r][c].player);
                }
              }
            }
            
            // Initial player rotation
            let nextIndex = (safeCurrentIndex + 1) % activePlayers.length;
            nextPlayer = activePlayers[nextIndex];
            
            // Flag to track if we've checked all players
            let checkedAllPlayers = false;
            // Counter to prevent infinite loops
            let safetyCounter = 0; 
            
            // Check if the next player has any dots on the board
            // Except if it's their first turn (they should get at least one turn)
            while (!playersWithDots.has(nextPlayer) && state.history.length > activePlayers.length && !checkedAllPlayers && safetyCounter < activePlayers.length) {
              console.log(`Player ${nextPlayer} has no dots, skipping their turn`);
              
              // Move to the next player
              nextIndex = (nextIndex + 1) % activePlayers.length;
              nextPlayer = activePlayers[nextIndex];
              
              // Check if we've gone through all players 
              if (nextIndex === ((safeCurrentIndex + 1) % activePlayers.length)) {
                checkedAllPlayers = true;
              }
              
              safetyCounter++;
            }
            
            // Enhanced debugging for player rotation
            console.log("PLAYER ROTATION (NO EXPLOSION): Current player =", currentPlayer, 
                        "| Current index =", safeCurrentIndex, 
                        "| Next player =", nextPlayer, 
                        "| Next index =", nextIndex,
                        "| Available players =", activePlayers,
                        "| Players with dots =", Array.from(playersWithDots));
          } else {
            // Fallback to simple 2-player rotation
            nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
            console.log("Fallback to two players (NO EXPLOSION). Next player:", nextPlayer);
          }
        } catch (error) {
          console.error("Error in player rotation logic (NO EXPLOSION):", error);
          // Fallback to simple 2-player rotation
          nextPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
        }
      }

      // Generate only ONE power-up with a 25% chance after the first turn
      // But don't generate if we already have too many (max 4 power-ups) - reduced spawn rate by 20%
      if (isBaseMode && state.history.length >= 1 && Math.random() < 0.25 && newPowerUps.length < 4) {
        console.log("Randomly generating ONE power-up with 25% chance");
        const { rows, cols } = state;

        // Import isAdjacentTo utility function from gameUtils
        const isAdjacentTo = (row1: number, col1: number, row2: number, col2: number): boolean => {
          return Math.abs(row1 - row2) <= 1 && Math.abs(col1 - col2) <= 1;
        };

        // Never allow two power-ups at the same time - check existing power-ups and choose different type
        const existingTypes = newPowerUps.map(p => p.type);
        let powerUpType: PowerUpType;
        
        if (existingTypes.includes('diamond') && existingTypes.includes('heart')) {
          // Both types exist, don't spawn any more
          console.log("Both power-up types already exist, skipping spawn");
          // Skip power-up generation
        } else {
          if (existingTypes.includes('diamond')) {
            // Diamond exists, only spawn heart
            powerUpType = 'heart';
          } else if (existingTypes.includes('heart')) {
            // Heart exists, only spawn diamond
            powerUpType = 'diamond';
          } else {
            // No power-ups exist, 50% chance of either
            powerUpType = Math.random() < 0.5 ? 'diamond' : 'heart';
          }
        
        // Find a valid position for the power-up
        let attempts = 0;
        let foundSpot = false;
        
        while (!foundSpot && attempts < 50) { // Increased attempts to find a good spot
          const randomRow = Math.floor(Math.random() * rows);
          const randomCol = Math.floor(Math.random() * cols);
          
          // Get active player settings using PlayerSettingsManager
          let activePlayers = [PLAYER.RED, PLAYER.BLUE]; // Default
          
          try {
            // Get settings using the PlayerSettingsManager
            const settings = PlayerSettingsManager.getSettings();
            
            // Ensure we have valid players
            if (settings.players && Array.isArray(settings.players) && settings.players.length > 0) {
              activePlayers = settings.players;
              console.log("Using player settings for power-up generation:", settings);
            } else {
              console.log("No valid player settings found, using defaults for power-up generation");
            }
          } catch (error) {
            console.log("Error getting player settings for power-up generation:", error);
          }

          // For more than 2 players, we don't restrict the middle rows
          let isInMiddleRows = false;
          
          // Skip middle 3 rows ONLY if 2 players (for a 9x9 grid, that would be rows 3, 4, 5 - zero-indexed)
          if (activePlayers.length <= 2) {
            const middleRowStart = Math.floor(rows / 2) - 1;
            const middleRowEnd = Math.floor(rows / 2) + 1;
            isInMiddleRows = randomRow >= middleRowStart && randomRow <= middleRowEnd;
          }
          
          // Check if cell is empty and not an HQ
          const isCellEmpty = newGrid[randomRow][randomCol].player === null;
          const isNotHQ = !newHqs.some(hq => hq.row === randomRow && hq.col === randomCol);
          
          // Check if not adjacent to any existing dot
          let isAdjacentToDot = false;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (newGrid[r][c].player !== null && isAdjacentTo(randomRow, randomCol, r, c)) {
                isAdjacentToDot = true;
                break;
              }
            }
            if (isAdjacentToDot) break;
          }
          
          // Valid position if:
          // 1. Not in middle 3 rows
          // 2. Cell is empty
          // 3. Not an HQ
          // 4. Not adjacent to any existing dot
          if (!isInMiddleRows && isCellEmpty && isNotHQ && !isAdjacentToDot) {
            newPowerUps.push({ 
              row: randomRow, 
              col: randomCol, 
              type: powerUpType 
            });
            console.log(`Power-up ${powerUpType} spawned at (${randomRow}, ${randomCol})`);
            foundSpot = true;
          }
          
          attempts++;
        }
        }
      }

      return {
        grid: newGrid,
        currentPlayer: nextPlayer,
        gameOver,
        winner,
        hqs: newHqs,
        powerUps: newPowerUps
      };
    });
  },



  // Undo the last move
  undo: () => {
    set(state => {
      if (state.history.length === 0) return state;

      const lastState = state.history[state.history.length - 1];
      const newHistory = state.history.slice(0, -1);

      return {
        grid: lastState.grid,
        currentPlayer: lastState.currentPlayer,
        gameOver: lastState.gameOver,
        winner: lastState.winner,
        hqs: lastState.baseMode?.hqs || state.hqs,
        powerUps: lastState.baseMode?.powerUps || state.powerUps,
        history: newHistory
      };
    });
  },

  // Restart the current game mode
  restart: () => {
    const { isBaseMode } = get();
    if (isBaseMode) {
      get().initBaseMode();
    } else {
      get().initClassicMode();
    }
  }
}));