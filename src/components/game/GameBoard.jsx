import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import { motion, AnimatePresence } from 'motion/react';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';

export default function GameBoard({ activePlacementTile, onPlacementSelect }) {
  const canvasContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const { gameState } = useGameStore();
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [targetScale, setTargetScale] = useState(0.75);
  const scaleRef = useRef(0.75);
  const [lastTouch, setLastTouch] = useState(null);
  
  // Auto-zoom logic: Scale out as chain grows up to 9 tiles
  useEffect(() => {
    const chainLength = gameState?.chain?.length || 0;
    
    // Adaptive zoom for short/landscape screens
    const isShort = window.innerHeight < 550;
    const landscapeFactor = isShort ? 0.7 : 1.0;

    if (chainLength === 0) {
      setTargetScale(0.75 * landscapeFactor);
      return;
    }
    // Zoom out even more as game progresses
    const startScale = 0.75 * landscapeFactor; 
    const endScale = 0.50 * landscapeFactor;
    const maxZoomTiles = 6;
    
    const nextScale = Math.max(endScale, startScale - (Math.min(maxZoomTiles, chainLength) - 1) * ((startScale - endScale) / (maxZoomTiles - 1)));
    setTargetScale(nextScale);
  }, [gameState?.chain?.length]);

  // Track the ID of the first tile ever placed to keep the anchor stable
  const seedTileIdRef = useRef(null);

  // Reset/Set seed when chain changes
  useEffect(() => {
    if (gameState?.chain && gameState.chain.length > 0) {
      if (!seedTileIdRef.current) {
        // Pick any tile to be the stable anchor for this round/game session. 
        // Index 0 is fine as it's the only one at the start.
        seedTileIdRef.current = gameState.chain[0].id;
      }
    } else {
      seedTileIdRef.current = null;
    }
  }, [gameState?.chain]);

  // Animation tracking for newly placed tiles
  const appearanceTimes = useRef(new Map());

  useEffect(() => {
    if (!gameState?.chain) return;
    const now = Date.now();
    gameState.chain.forEach(tile => {
      if (!appearanceTimes.current.has(tile.id)) {
        appearanceTimes.current.set(tile.id, now);
      }
    });
  }, [gameState?.chain]);

  // Track where the left and right ends of the chain are in screen-space
  const [dropZones, setDropZones] = useState({ left: null, right: null });

  const centerChain = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    // Scale is auto-managed now
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const resize = () => {
       if (canvasContainerRef.current) {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvasContainerRef.current.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          canvas.style.width = `${rect.width}px`;
          canvas.style.height = `${rect.height}px`;
       }
    };
    resize();
    window.addEventListener('resize', resize);
    
    let animationFrameId;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      // Smooth scale interpolation (Lerp)
      scaleRef.current += (targetScale - scaleRef.current) * 0.05;
      const currentScale = scaleRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr); // Account for high-DPI scaling
      
      const centerX = (canvas.width / dpr) / 2 + panOffset.x;
      const centerY = (canvas.height / dpr) / 2 + panOffset.y;
      
      ctx.translate(centerX, centerY);
      ctx.scale(currentScale, currentScale);

      let layout = [];
      let leftScreenX = centerX;
      let leftScreenY = centerY;
      let rightScreenX = centerX;
      let rightScreenY = centerY;
      
      let anchorIdx = 0;
      let getStepMeta = () => ({ pathDir: { x: 1, y: 0 }, orientation: 'h', isTurn: false });

      if (gameState && gameState.chain && gameState.chain.length > 0) {
          anchorIdx = gameState.chain.findIndex(t => t.id === seedTileIdRef.current);
          if (anchorIdx === -1) {
             // Fallback if the seed is lost (highly unlikely)
             anchorIdx = 0;
             seedTileIdRef.current = gameState.chain[0].id;
          }

          const GAP = 2;
          const TILE_W = 64;
          const TILE_H = 32;
          const ROW_1_HALF = 4; // 4 left + 1 anchor + 4 right = 9 total in first row
          const SUBSEQUENT_ROW_WIDTH = 8;
          const V_GAP_TILES = 3; 

          layout = new Array(gameState.chain.length);
          
          getStepMeta = (idx) => {
              const diff = idx - anchorIdx;
              const absDiff = Math.abs(diff);
              const s = Math.sign(diff);
              
              let pathDir = { x: 0, y: 0 };
              let isTurn = false;

              if (diff === 0) {
                  pathDir = { x: 1, y: 0 }; 
              } else if (absDiff <= ROW_1_HALF) {
                  pathDir = { x: s, y: 0 }; 
              } else {
                  const rem = absDiff - ROW_1_HALF - 1;
                  const cycleLen = SUBSEQUENT_ROW_WIDTH + V_GAP_TILES;
                  const cycleIndex = Math.floor(rem / cycleLen);
                  const pos = rem % cycleLen;
                  
                  if (pos < V_GAP_TILES) {
                      pathDir = { x: 0, y: s }; 
                      if (pos === 0) isTurn = true;
                  } else {
                      const hDir = (cycleIndex % 2 === 0) ? -s : s;
                      pathDir = { x: hDir, y: 0 };
                      if (pos === V_GAP_TILES) isTurn = true;
                  }
              }
              
              const tile = gameState.chain[idx];
              const isDouble = tile.left === tile.right;
              let orientation = (pathDir.x !== 0) ? 'h' : 'v';
              if (isDouble) orientation = (pathDir.x !== 0) ? 'v' : 'h';
              
              return { pathDir, orientation, isTurn };
          };

          // Pass 1: Compute Layout recursively from anchor
          const anchorMeta = getStepMeta(anchorIdx);
          layout[anchorIdx] = {
              ...gameState.chain[anchorIdx],
              x: 0,
              y: 0,
              orientation: anchorMeta.orientation,
              w: anchorMeta.orientation === 'h' ? TILE_W : TILE_H,
              h: anchorMeta.orientation === 'h' ? TILE_H : TILE_W
          };

          // Expand Right (Forward in array)
          for (let i = anchorIdx + 1; i < gameState.chain.length; i++) {
              const prev = layout[i - 1];
              const prevMeta = getStepMeta(i - 1);
              const currMeta = getStepMeta(i);
              
              const currW = currMeta.orientation === 'h' ? TILE_W : TILE_H;
              const currH = currMeta.orientation === 'h' ? TILE_H : TILE_W;
              const moveDir = currMeta.pathDir;
              
              let dx = 0;
              let dy = 0;

              if (moveDir.x !== 0) {
                  // Moving horizontally
                  if (prevMeta.pathDir.y !== 0) {
                      // Transition from Vertical to Horizontal
                      dx = moveDir.x * (prev.w / 2 + currW / 2 + GAP);
                      dy = prevMeta.pathDir.y * (prev.h / 2 - currH / 2);
                  } else {
                      // Continuation of horizontal row
                      dx = moveDir.x * (prev.w / 2 + currW / 2 + GAP);
                      dy = 0;
                  }
              } else if (moveDir.y !== 0) {
                  if (prevMeta.pathDir.x !== 0) {
                      // Transition from Horizontal to Vertical
                      dx = prevMeta.pathDir.x * (prev.w / 2 - currW / 2);
                      dy = moveDir.y * (prev.h / 2 + currH / 2 + GAP);
                  } else {
                      // Continuation of vertical column
                      dx = 0;
                      dy = moveDir.y * (prev.h / 2 + currH / 2 + GAP);
                  }
              }

              layout[i] = {
                  ...gameState.chain[i],
                  x: prev.x + dx,
                  y: prev.y + dy,
                  orientation: currMeta.orientation,
                  w: currW,
                  h: currH
              };
          }

          // Expand Left (Backward in array)
          for (let i = anchorIdx - 1; i >= 0; i--) {
              const next = layout[i + 1];
              const nextMeta = getStepMeta(i + 1);
              const currMeta = getStepMeta(i);

              const currW = currMeta.orientation === 'h' ? TILE_W : TILE_H;
              const currH = currMeta.orientation === 'h' ? TILE_H : TILE_W;
              // Direction is set relative to anchor, so we move in that direction from next to curr
              const moveDir = currMeta.pathDir;

              let dx = 0;
              let dy = 0;

              if (moveDir.x !== 0) {
                  if (nextMeta.pathDir.y !== 0) {
                      // Transition from Vertical to Horizontal
                      dx = moveDir.x * (next.w / 2 + currW / 2 + GAP);
                      dy = nextMeta.pathDir.y * (next.h / 2 - currH / 2);
                  } else {
                      dx = moveDir.x * (next.w / 2 + currW / 2 + GAP);
                      dy = 0;
                  }
              } else if (moveDir.y !== 0) {
                  if (nextMeta.pathDir.x !== 0) {
                      // Transition from Horizontal to Vertical
                      dx = nextMeta.pathDir.x * (next.w / 2 - currW / 2);
                      dy = moveDir.y * (next.h / 2 + currH / 2 + GAP);
                  } else {
                      // Continuation of vertical column
                      dx = 0;
                      dy = moveDir.y * (next.h / 2 + currH / 2 + GAP);
                  }
              }

              layout[i] = {
                  ...gameState.chain[i],
                  x: next.x + dx,
                  y: next.y + dy,
                  orientation: currMeta.orientation,
                  w: currW,
                  h: currH
              };
          }

          // Positioning drop zones
          const first = layout[0];
          const last = layout[layout.length - 1];
          leftScreenX = centerX + first.x * currentScale;
          leftScreenY = centerY + first.y * currentScale;
          rightScreenX = centerX + last.x * currentScale;
          rightScreenY = centerY + last.y * currentScale;
      }

      // Render cells
      layout.forEach((p, i) => {
         const diff = i - anchorIdx;
         const meta = getStepMeta(i);
         let drawL = p.exposedLeft;
         let drawR = p.exposedRight;

         if (diff > 0) {
            // Appended tiles: exposedLeft is matching, exposedRight is new
            // Normal growth is Right/Down. If we move Left/Up, we swap.
            if (meta.pathDir.x === -1 || meta.pathDir.y === -1) {
               drawL = p.exposedRight;
               drawR = p.exposedLeft;
            }
         } else if (diff < 0) {
            // Prepended tiles: exposedLeft is new, exposedRight is matching
            // Normal growth is Left/Up. If we move Right/Down, we swap.
            if (meta.pathDir.x === 1 || meta.pathDir.y === 1) {
               drawL = p.exposedRight;
               drawR = p.exposedLeft;
            }
         }

         const addedAt = appearanceTimes.current.get(p.id) || 0;
         const age = Date.now() - addedAt;
         drawTile(ctx, p, p.x, p.y, p.orientation, false, false, false, drawL, drawR, age);
      });

      ctx.restore();
      
      if (layout.length > 0) {
          setDropZones({
             left: { x: leftScreenX, y: leftScreenY, w: layout[0].w, h: layout[0].h },
             right: { x: rightScreenX, y: rightScreenY, w: layout[layout.length-1].w, h: layout[layout.length-1].h }
          });
      }
      
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [gameState, panOffset, targetScale]);

  const drawHalfPips = (ctx, value, cx, cy, orientation) => {
      ctx.fillStyle = '#121212';
      const r = 3.8; // Larger dots for board clarity
      const drawDot = (dx, dy) => {
         ctx.save();
         // Deep well effect
         ctx.beginPath();
         ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
         ctx.fill();
         
         // Inner highlight
         ctx.fillStyle = 'rgba(255,255,255,0.08)';
         ctx.beginPath();
         ctx.arc(cx + dx - 0.8, cy + dy - 0.8, r * 0.4, 0, Math.PI * 2);
         ctx.fill();
         ctx.restore();
         ctx.fillStyle = '#121212';
      };

      if (value === 1 || value === 3 || value === 5) {
         drawDot(0, 0);
      }
      if (value > 1) {
         drawDot(-8, -8);
         drawDot(8, 8);
      }
      if (value > 3) {
         drawDot(-8, 8);
         drawDot(8, -8);
      }
      if (value === 6) {
         if (orientation === 'v') {
            drawDot(-8, 0);
            drawDot(8, 0);
         } else {
            drawDot(0, -8);
            drawDot(0, 8);
         }
      }
  };

  const drawTile = (ctx, tile, x, y, orientation, faceDown, selected, validEnd, drawLeft, drawRight, age = 10000) => {
     ctx.save();
     ctx.translate(x, y);
     
     // Subtle "Flip & Settle" animation for newly placed tiles
     const ANIM_DURATION = 750;
     if (age < ANIM_DURATION) {
        const t = age / ANIM_DURATION;
        // Smoother ease out for a more weighted 3D feel
        const ease = 1 - Math.pow(1 - t, 3); 
        
        // Dropping from above with rotation
        const scale = 1.35 - (0.35 * ease);
        const rotation = (12 * (1 - ease)) * (Math.PI / 180) * (tile.id.charCodeAt(0) % 2 === 0 ? 1 : -1);
        
        ctx.scale(scale, scale);
        ctx.rotate(rotation);
        
        // Deepen shadow while "in flight"
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 30 * (1 - ease);
        ctx.shadowOffsetY = 15 * (1 - ease);
     }

     const w = orientation === 'h' ? 64 : 32;
     const h = orientation === 'h' ? 32 : 64;

     // Selection/Playable highlight
     if (validEnd) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 30;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
     } else {
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 10;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5;
     }

     if (faceDown) {
        ctx.fillStyle = '#1e293b';
     } else {
        const grad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#faf9f6');
        grad.addColorStop(1, '#e8e4d8');
        ctx.fillStyle = grad;
     }

     ctx.beginPath();
     ctx.roundRect(-w/2, -h/2, w, h, 8);
     ctx.fill();
     ctx.stroke();

     if (!faceDown) {
        // High-DPI Bevel
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-w/2 + 0.8, -h/2 + 0.8, w - 1.6, h - 1.6, 7);
        ctx.stroke();

        // High-DPI Divider
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        if (orientation === 'h') {
            ctx.moveTo(0, -h/2 + 3);
            ctx.lineTo(0, h/2 - 3);
            ctx.stroke();
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(1, -h/2 + 3);
            ctx.lineTo(1, h/2 - 3);
            ctx.stroke();

            // Premium Silver Spinner
            const spinGrad = ctx.createLinearGradient(-3, -3, 3, 3);
            spinGrad.addColorStop(0, '#ffffff');
            spinGrad.addColorStop(0.5, '#a0a0a0');
            spinGrad.addColorStop(1, '#404040');
            ctx.fillStyle = spinGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            drawHalfPips(ctx, drawLeft ?? tile.left, -16, 0, 'h');
            drawHalfPips(ctx, drawRight ?? tile.right, 16, 0, 'h');
        } else {
            ctx.moveTo(-w/2 + 3, 0);
            ctx.lineTo(w/2 - 3, 0);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(-w/2 + 3, 1);
            ctx.lineTo(w/2 - 3, 1);
            ctx.stroke();

            // Premium Silver Spinner
            const spinGrad = ctx.createLinearGradient(-3, -3, 3, 3);
            spinGrad.addColorStop(0, '#ffffff');
            spinGrad.addColorStop(0.5, '#a0a0a0');
            spinGrad.addColorStop(1, '#404040');
            ctx.fillStyle = spinGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            drawHalfPips(ctx, drawLeft ?? tile.left, 0, -16, 'v');
            drawHalfPips(ctx, drawRight ?? tile.right, 0, 16, 'v');
        }
     }

     ctx.restore();
  };

  const handleTouchStart = (e) => {
     e.preventDefault();
     if (e.touches.length === 1) {
         setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() });
     }
  };

   const handleTouchMove = (e) => {
      // Panning disabled as requested
      if (e.touches.length === 1 && lastTouch) {
         setLastTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY, time: lastTouch.time });
      }
  };

  const handleMouseDown = (e) => {
      setLastTouch({ x: e.clientX, y: e.clientY, time: Date.now() });
  };

  const handleMouseMove = (e) => {
      // Panning disabled as requested
      if (lastTouch) {
          setLastTouch({ x: e.clientX, y: e.clientY, time: lastTouch.time });
      }
  };

  const handleWheel = (e) => {
      // Manual zoom disabled as requested
      e.preventDefault();
  };

  const handleMouseUp = () => setLastTouch(null);

  return (
    <div ref={canvasContainerRef} className="w-full h-full flex-1 bg-[#1a472a] relative overflow-hidden shrink-0 touch-none">
      <canvas 
        ref={canvasRef} 
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setLastTouch(null)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="absolute inset-0 z-0"
      />

      {/* HTML Drop Zones over Canvas */}
      {activePlacementTile && gameState?.status === 'active' && dropZones.left && dropZones.right && (
        <AnimatePresence>
            {activePlacementTile.moves.find(m => m.end === 'left') && (
                <motion.div
                    key="drop-left"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onPlacementSelect('left')}
                    className="absolute z-40 border-4 border-emerald-400 bg-emerald-400/20 rounded-lg cursor-pointer hover:bg-emerald-400/40 transition-colors flex items-center justify-center p-2"
                    style={{ 
                        left: dropZones.left.x, 
                        top: dropZones.left.y,
                        width: Math.max(dropZones.left.w * scaleRef.current * 1.2, 44),
                        height: Math.max(dropZones.left.h * scaleRef.current * 1.2, 44),
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className="w-4 h-4 bg-emerald-400 rounded-full animate-ping" />
                </motion.div>
            )}
            {activePlacementTile.moves.find(m => m.end === 'right') && (
                <motion.div
                    key="drop-right"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onPlacementSelect('right')}
                    className="absolute z-40 border-4 border-emerald-400 bg-emerald-400/20 rounded-lg cursor-pointer hover:bg-emerald-400/40 transition-colors flex items-center justify-center p-2"
                    style={{ 
                        left: dropZones.right.x, 
                        top: dropZones.right.y,
                        width: Math.max(dropZones.right.w * scaleRef.current * 1.2, 44),
                        height: Math.max(dropZones.right.h * scaleRef.current * 1.2, 44),
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className="w-4 h-4 bg-emerald-400 rounded-full animate-ping" />
                </motion.div>
            )}
        </AnimatePresence>
      )}
    </div>
  );
}
