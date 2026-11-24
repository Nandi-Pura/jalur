import { AvoidLib, type Avoid } from 'libavoid-js'
import wasmUrl from '../../node_modules/libavoid-js/dist/libavoid.wasm?url'

let loading: Promise<Avoid> | null = null

/** Loads libavoid.wasm once; it is fetched as a separate, replaceable file (LGPL). */
export function loadAvoid(): Promise<Avoid> {
  loading ??= AvoidLib.load(wasmUrl).then(() => AvoidLib.getInstance())
  return loading
}
