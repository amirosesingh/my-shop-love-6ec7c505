/** Inspect published RPC signatures without executing business operations. */
export type FunctionShapes = Record<string, { parameters: string[]; required: string[] }>;
export type OpenApiFunctions = {
  paths?: Record<string, { post?: { parameters?: { in?: string; schema?: { properties?: Record<string, unknown>; required?: string[] } }[] } }>;
};
export function functionShapes(spec: OpenApiFunctions): FunctionShapes {
  const result: FunctionShapes = {};
  for (const [path, operations] of Object.entries(spec.paths ?? {})) {
    if (!path.startsWith("/rpc/") || !operations.post) continue;
    const body = operations.post.parameters?.find((p) => p.in === "body")?.schema;
    result[path.slice(5)] = { parameters: Object.keys(body?.properties ?? {}), required: body?.required ?? [] };
  }
  return result;
}
export function checkFunction(functions: FunctionShapes, name: string, args: string[]) {
  const shape = functions[name];
  if (!shape) return { ok: false, detail: `Function ${name} is missing from published metadata` };
  const unknown = args.filter((arg) => !shape.parameters.includes(arg));
  const missing = shape.required.filter((arg) => !args.includes(arg));
  if (unknown.length || missing.length) return { ok: false, detail: `Function ${name} signature mismatch: ${[...unknown, ...missing].join(", ")}` };
  return { ok: true, detail: `Function ${name} signature verified; execution and permissions not tested` };
}
