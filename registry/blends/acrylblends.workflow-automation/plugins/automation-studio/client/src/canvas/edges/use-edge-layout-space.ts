// Ported from Qadam Flow (MIT) packages/web/src/app/builder/flow-canvas @ 51bb340b (itself from Activepieces, MIT); see NOTICE.
// Adapted: vertical layout only, no builder store, no i18n, this app's run records; the geometry is theirs.
import { flowCanvasConsts } from '../consts';
import { svgPathUtils } from '../svg-path-utils';

/**
 * How the horizontal canvas works for edges: all edge geometry is written once
 * against the vertical canvas, in "layout space" (the flow advances along y and
 * branches spread along x). In horizontal mode the graph builder transposes
 * every node position across the y = x axis, so edges keep working unchanged by
 * mapping their endpoints back into layout space, generating the same vertical
 * path, and transposing the resulting SVG path into canvas space again.
 */
export function useEdgeLayoutSpace({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}) {
  const canvasOrientation = 'vertical' as 'vertical' | 'horizontal';
  const isHorizontal = canvasOrientation === 'horizontal';
  return {
    isHorizontal,
    layout: flowCanvasConsts.ORIENTATION_LAYOUT[canvasOrientation],
    layoutSource: isHorizontal
      ? { x: sourceY, y: sourceX }
      : { x: sourceX, y: sourceY },
    layoutTarget: isHorizontal
      ? { x: targetY, y: targetX }
      : { x: targetX, y: targetY },
    toCanvasPath: (layoutPath: string) =>
      isHorizontal ? svgPathUtils.transposePath(layoutPath) : layoutPath,
  };
}
