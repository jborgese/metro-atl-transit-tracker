// Minimal ambient declaration for the workerd-only `cloudflare:email` module.
// The project does not load @cloudflare/workers-types ambiently, and the
// module only exists inside the workers runtime (it is dynamically imported
// behind a binding check in src/lib/server/feedback/email.ts).
declare module 'cloudflare:email' {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
    readonly from: string;
    readonly to: string;
  }
}
