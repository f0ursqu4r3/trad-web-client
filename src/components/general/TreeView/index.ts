// Import the component
import TreeView from './TreeView.vue'

// Named export for convenience: import { TreeView } from '.../TreeView'
export { TreeView }

// Re-export types commonly needed by consumers
export type { Id, TreeItem } from './types'

// Keep default export for backward-compatibility: import TreeView from '.../TreeView'
export default TreeView
