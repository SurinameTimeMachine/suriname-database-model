'use client';

import { CRM_CLASS_NAMES, CRM_COLORS, entityTypeColor } from '@/lib/data';
import type {
  E22Source,
  E25Plantation,
  E41Appellation,
  E53Place,
  E74Organization,
} from '@/lib/types';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface EntityGraphProps {
  plantation: E25Plantation | null;
  organization: E74Organization | null;
  place: E53Place | null;
  appellations: E41Appellation[];
  sources: E22Source[];
  observationCount: number;
  onNodeClick: (section: string) => void;
}

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  section: string;
  color: string;
  radius: number;
  /** If true, node is fixed at its initial position */
  fixed?: boolean;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  label: string;
}

const WIDTH = 460;
const HEIGHT = 300;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

function buildGraph(
  plantation: E25Plantation,
  organization: E74Organization | null,
  place: E53Place | null,
  appellations: E41Appellation[],
  sources: E22Source[],
  observationCount: number,
) {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // E25 center (plantation) -- fixed
  nodes.push({
    id: 'e25',
    label: plantation.prefLabel,
    type: 'E25',
    section: 'plantation',
    color: CRM_COLORS.E25,
    radius: 28,
    x: CX,
    y: CY,
    fx: CX,
    fy: CY,
    fixed: true,
  });

  // E74
  if (organization) {
    nodes.push({
      id: 'e74',
      label: organization.prefLabel,
      type: 'E74',
      section: 'organization',
      color: CRM_COLORS.E74,
      radius: 24,
      x: CX + 150,
      y: CY,
    });
    links.push({
      source: 'e25',
      target: 'e74',
      label: 'P52 has current owner',
    });
  }

  // E53
  if (place) {
    nodes.push({
      id: 'e53',
      label: `fid-${place.fid}`,
      type: 'E53',
      section: 'place',
      color: CRM_COLORS.E53,
      radius: 22,
      x: CX - 80,
      y: CY + 100,
    });
    links.push({
      source: 'e25',
      target: 'e53',
      label: 'P53 has location',
    });
  }

  // E41 appellations (max 4)
  const maxApps = Math.min(appellations.length, 4);
  for (let i = 0; i < maxApps; i++) {
    const app = appellations[i];
    const angle =
      -Math.PI / 2 +
      (i / Math.max(maxApps - 1, 1)) * Math.PI * 0.6 -
      Math.PI * 0.3;
    nodes.push({
      id: `e41-${i}`,
      label: app.P190_has_symbolic_content || '(unnamed)',
      type: 'E41',
      section: 'sources', // scroll to sources since names are inside source groups
      color: CRM_COLORS.E41,
      radius: 18,
      x: CX + Math.cos(angle) * 120,
      y: CY + Math.sin(angle) * 100,
    });
    const identifiesOrg = app.P1i_identifies?.includes('wikidata');
    links.push({
      source: identifiesOrg ? 'e74' : 'e25',
      target: `e41-${i}`,
      label: 'P1 is identified by',
    });
  }

  // E22 sources (max 3)
  const shownSources = sources.slice(0, 3);
  for (let i = 0; i < shownSources.length; i++) {
    const src = shownSources[i];
    nodes.push({
      id: `e22-src-${i}`,
      label: src.prefLabel?.slice(0, 18) || src.mapId || '(source)',
      type: 'E22',
      section: 'sources-ref',
      color: CRM_COLORS.E22,
      radius: 18,
      x: CX + 120 + i * 30,
      y: CY - 90 + i * 40,
    });
    // Sources carry appellations -- link to E25 plantation via P128/P138 chain
    links.push({
      source: `e22-src-${i}`,
      target: 'e25',
      label: 'P128/P138',
    });
  }

  // E13 Attribute Assignment — observations aggregate
  if (observationCount > 0) {
    nodes.push({
      id: 'e13',
      label: `${observationCount} obs`,
      type: 'E13',
      section: 'sources',
      color: CRM_COLORS.E13,
      radius: 22,
      x: CX + 130,
      y: CY + 90,
    });
    if (organization) {
      links.push({ source: 'e13', target: 'e74', label: 'P140 assigned to' });
    }

    // E52 Time-Span — temporal extent of observations
    nodes.push({
      id: 'e52',
      label: 'Time-Span',
      type: 'E52',
      section: 'sources',
      color: CRM_COLORS.E52,
      radius: 16,
      x: CX + 60,
      y: CY + 140,
    });
    links.push({ source: 'e13', target: 'e52', label: 'P4 has time-span' });

    // E13 -> E22 source link (almanac as primary source)
    if (shownSources.length > 0) {
      links.push({
        source: 'e13',
        target: `e22-src-0`,
        label: 'prov:hadPrimarySource',
      });
    }
  }

  // E39 Actor — person roles aggregate
  if (observationCount > 0) {
    nodes.push({
      id: 'e39',
      label: 'People',
      type: 'E39',
      section: 'sources',
      color: CRM_COLORS.E39,
      radius: 18,
      x: CX + 170,
      y: CY + 120,
    });
    links.push({
      source: 'e13',
      target: 'e39',
      label: 'P14 carried out by',
    });
  }

  return { nodes, links };
}

export default function EntityGraph({
  plantation,
  organization,
  place,
  appellations,
  sources,
  observationCount,
  onNodeClick,
}: EntityGraphProps) {
  const [simulatedNodes, setSimulatedNodes] = useState<GraphNode[]>([]);
  const [simulatedLinks, setSimulatedLinks] = useState<GraphLink[]>([]);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement>(null);

  const graph = useMemo(() => {
    if (!plantation) return null;
    return buildGraph(
      plantation,
      organization,
      place,
      appellations,
      sources,
      observationCount,
    );
  }, [
    plantation,
    organization,
    place,
    appellations,
    sources,
    observationCount,
  ]);

  useEffect(() => {
    if (!graph) return;

    // Clone nodes so simulation can mutate x/y
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const links = graph.links.map((l) => ({
      ...l,
      source:
        typeof l.source === 'string' ? l.source : (l.source as GraphNode).id,
      target:
        typeof l.target === 'string' ? l.target : (l.target as GraphNode).id,
    }));

    const sim = forceSimulation(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4),
      )
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(CX, CY).strength(0.05))
      .force(
        'collide',
        forceCollide<GraphNode>().radius((d) => d.radius + 8),
      )
      .alphaDecay(0.04)
      .on('tick', () => {
        // Clamp nodes to viewport
        for (const n of nodes) {
          n.x = Math.max(n.radius, Math.min(WIDTH - n.radius, n.x!));
          n.y = Math.max(n.radius, Math.min(HEIGHT - n.radius, n.y!));
        }
        setSimulatedNodes([...nodes]);
        setSimulatedLinks([...links]);
      });

    simRef.current = sim;

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [graph]);

  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const sim = simRef.current;
    if (!sim) return;
    const node = sim.nodes().find((n) => n.id === nodeId);
    if (!node || node.fixed) return;
    setDragNode(nodeId);
    node.fx = node.x;
    node.fy = node.y;
    sim.alphaTarget(0.3).restart();
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragNode || !svgRef.current || !simRef.current) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const node = simRef.current.nodes().find((n) => n.id === dragNode);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
    },
    [dragNode],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragNode || !simRef.current) return;
    const node = simRef.current.nodes().find((n) => n.id === dragNode);
    if (node && !node.fixed) {
      node.fx = null;
      node.fy = null;
    }
    setDragNode(null);
    simRef.current.alphaTarget(0);
  }, [dragNode]);

  if (!plantation) return null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full border border-stm-warm-200 bg-white select-none"
        role="img"
        aria-label="CIDOC-CRM entity relationship graph"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Edges */}
        {simulatedLinks.map((link, i) => {
          const s = link.source as GraphNode;
          const t = link.target as GraphNode;
          if (!s.x || !t.x) return null;
          const mx = (s.x + t.x) / 2;
          const my = (s.y! + t.y!) / 2;
          return (
            <g key={i}>
              <line
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="#d4cfc6"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <text
                x={mx}
                y={my - 3}
                textAnchor="middle"
                className="text-[7px] fill-stm-warm-400 pointer-events-none"
              >
                {link.label.length > 16 ? link.label.slice(0, 16) : link.label}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {simulatedNodes.map((node) => {
          const textColor =
            node.type === 'E41' || node.type === 'E39'
              ? '#78716c' // dark text on light backgrounds
              : '#fff';
          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onMouseDown={(e) => handleMouseDown(node.id, e)}
              onClick={() => {
                if (!dragNode) onNodeClick(node.section);
              }}
              onMouseEnter={() => {
                const name = CRM_CLASS_NAMES[node.type] || node.type;
                setTooltip({
                  text: `${name}\n${node.label}`,
                  x: node.x!,
                  y: node.y!,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <rect
                x={node.x! - node.radius}
                y={node.y! - node.radius * 0.7}
                width={node.radius * 2}
                height={node.radius * 1.4}
                fill={node.color}
                fillOpacity={0.85}
                stroke={node.color}
                strokeWidth={1.5}
              />
              <text
                x={node.x!}
                y={node.y! - 3}
                textAnchor="middle"
                className="text-[8px] font-bold pointer-events-none"
                fill={textColor}
              >
                {node.type}
              </text>
              <text
                x={node.x!}
                y={node.y! + 8}
                textAnchor="middle"
                className="text-[7px] pointer-events-none"
                fill={textColor}
                opacity={0.85}
              >
                {(node.label || '').length > 14
                  ? (node.label || '').slice(0, 14) + '...'
                  : node.label || ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && svgRef.current && (
        <div
          className="absolute pointer-events-none bg-stm-warm-900 text-white text-[10px] px-2 py-1 z-10 whitespace-pre-line max-w-48"
          style={{
            left: `${(tooltip.x / WIDTH) * 100}%`,
            top: `${(tooltip.y / HEIGHT) * 100 - 12}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
