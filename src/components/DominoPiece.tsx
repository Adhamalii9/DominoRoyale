import React from 'react';
import { Group, Rect, Text, Line, Circle } from 'react-konva';
import { Domino } from '../types';

interface Props {
  domino: Domino;
  x: number;
  y: number;
  rotation: number;
  scale?: number;
  onClick?: () => void;
  isVertical?: boolean;
}

const DominoPiece: React.FC<Props> = ({ domino, x, y, rotation, scale = 1, onClick, isVertical = false }) => {
  const isDouble = domino.a === domino.b;
  // If it's a double, it should be rotated 90deg by default in a horizontal snake, or vice versa
  const finalRotation = isDouble ? rotation + 90 : rotation;

  const renderDots = (val: number, offsetX: number, offsetY: number) => {
    const dots = [];
    const positions = [
      [],
      [[0, 0]], // 1
      [[-0.5, -0.5], [0.5, 0.5]], // 2
      [[-0.6, -0.6], [0, 0], [0.6, 0.6]], // 3
      [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]], // 4
      [[-0.6, -0.6], [0.6, -0.6], [0, 0], [-0.6, 0.6], [0.6, 0.6]], // 5
      [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0], [0.5, 0], [-0.5, 0.7], [0.5, 0.7]] // 6
    ];

    const radius = 4.2 * scale;
    const dotSpacing = 16 * scale;

    if (positions[val]) {
      positions[val].forEach(([dx, dy], i) => {
        dots.push(
          <Group key={i} x={offsetX + dx * dotSpacing} y={offsetY + dy * dotSpacing}>
            {/* Deep-well effect for dots */}
            <Circle
              radius={radius}
              fill="#121212"
              shadowColor="#000"
              shadowBlur={2}
              shadowOffset={{ x: 0.5, y: 0.5 }}
              shadowOpacity={0.6}
            />
            {/* Internal highlight for carved look */}
            <Circle
              radius={radius * 0.7}
              x={-radius * 0.1}
              y={-radius * 0.1}
              fill="rgba(255,255,255,0.05)"
            />
          </Group>
        );
      });
    }
    return dots;
  };

  return (
    <Group 
      x={x} 
      y={y} 
      rotation={finalRotation} 
      onClick={onClick} 
      listening={!!onClick} 
      offset={{ x: 50 * scale, y: 25 * scale }}
    >
      {/* Heavy shadow for 3D lift */}
      <Rect
        width={100 * scale}
        height={50 * scale}
        fill="rgba(0,0,0,0.4)"
        cornerRadius={8 * scale}
        shadowColor="rgba(0,0,0,0.8)"
        shadowBlur={15 * scale}
        shadowOffset={{ x: 5 * scale, y: 8 * scale }}
        listening={false}
      />
      
      {/* The Tile Body */}
      <Rect
        width={100 * scale}
        height={50 * scale}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 100 * scale, y: 50 * scale }}
        fillLinearGradientColorStops={[0, '#FFFFFF', 0.4, '#FAF9F6', 1, '#E8E4D8']}
        stroke="#1a1a1a"
        strokeWidth={0.5}
        cornerRadius={8 * scale}
      />
      
      {/* Beveled edge (Inner glow) */}
      <Rect
        x={1 * scale}
        y={1 * scale}
        width={98 * scale}
        height={48 * scale}
        stroke="rgba(255,255,255,0.95)"
        strokeWidth={1.2}
        cornerRadius={7 * scale}
        listening={false}
      />

      {/* Divider */}
      <Line
        points={[50 * scale, 3 * scale, 50 * scale, 47 * scale]}
        stroke="#1a1a1a"
        strokeWidth={1.8}
        opacity={0.9}
        shadowColor="rgba(255,255,255,0.4)"
        shadowBlur={0}
        shadowOffset={{ x: 1, y: 0 }}
      />

      {/* High-detail Chrome Spinner */}
      <Circle
        x={50 * scale}
        y={25 * scale}
        radius={3 * scale}
        fillLinearGradientStartPoint={{ x: -2, y: -2 }}
        fillLinearGradientEndPoint={{ x: 2, y: 2 }}
        fillLinearGradientColorStops={[0, '#FFFFFF', 0.5, '#A0A0A0', 1, '#404040']}
        stroke="#000"
        strokeWidth={0.5}
        shadowColor="#000"
        shadowBlur={3}
        shadowOffset={{ x: 1, y: 1 }}
      />
      
      {renderDots(domino.a, 25 * scale, 25 * scale)}
      {renderDots(domino.b, 75 * scale, 25 * scale)}
    </Group>
  );
};

export default DominoPiece;
