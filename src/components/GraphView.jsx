import { useI18n } from '../i18n/index.jsx'
import RichText from './RichText.jsx'
import { CHIP_STEP, NODE_RADIUS, chipWidth, layoutGraph } from './graphLayout.js'

function RefChips({ refs, x, y }) {
  return refs.map((ref, position) => (
    <g
      key={ref.name}
      transform={`translate(${x + NODE_RADIUS + 12}, ${y + position * CHIP_STEP - 11})`}
    >
      <rect className={`ref ref-${ref.kind}`} width={chipWidth(ref.name)} height={22} rx={4} />
      <text className={`ref-text ref-text-${ref.kind}`} x={8} y={15}>
        {ref.name}
      </text>
    </g>
  ))
}

/**
 * A commit in the same column joins its parent with a straight line; one that
 * branched off curves across, which is what makes a merge read as two lines
 * coming back together rather than as a triangle.
 */
function edgePath({ from, to }) {
  if (from.x === to.x) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  const bend = (from.y - to.y) * 0.42
  return `M ${from.x} ${from.y} C ${from.x} ${from.y - bend}, ${to.x} ${to.y + bend}, ${to.x} ${to.y}`
}

function Graph({ repo }) {
  const { t } = useI18n()
  const layout = layoutGraph(repo)

  if (!layout || layout.nodes.length === 0) {
    return <RichText className="empty" text={t('graph.noCommits')} />
  }

  return (
    <div className="graph-scroll">
      <svg
        className="graph"
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label={t('graph.title')}
      >
        {layout.edges.map((edge) => (
          <path key={edge.key} className="edge" d={edgePath(edge)} />
        ))}
        {layout.nodes.map((node) => (
          <g key={node.id}>
            <circle
              className={node.isMerge ? 'node node-merge' : 'node'}
              cx={node.x}
              cy={node.y}
              r={NODE_RADIUS}
            />
            <text className="node-text" x={node.x} y={node.y + 4} textAnchor="middle">
              {node.id}
            </text>
            <title>{node.message}</title>
            <RefChips refs={node.refs} x={node.x} y={node.y} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function GraphView({ world }) {
  const { t } = useI18n()

  return (
    <section className="panel graph-panel">
      <h2 className="panel-title">{t('graph.title')}</h2>
      <div className="graph-columns">
        <div className="graph-column">
          <h3 className="graph-label">{t('graph.local')}</h3>
          {world.repo ? (
            <Graph repo={world.repo} />
          ) : (
            <RichText className="empty" text={t('graph.noRepo')} />
          )}
          {world.repo?.merge && <RichText className="warning" text={t('graph.merging')} />}
        </div>
        {world.remote && (
          <div className="graph-column">
            <h3 className="graph-label">{t('graph.remote')}</h3>
            <Graph repo={world.remote} />
          </div>
        )}
      </div>
    </section>
  )
}
