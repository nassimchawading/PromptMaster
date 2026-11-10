/** Where the Optimize button stands: idle, or rewriting the draft. */
export type OptimizeStatus = 'idle' | 'working'

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': { isOn: boolean; optimize: OptimizeStatus }
  }
}
