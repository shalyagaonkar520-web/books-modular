# UI Change Guardrails

- Treat every UI request as a minimal, surgical diff. Only touch the file(s)/component(s)
  directly named or clearly implicated by the request.
- Before writing any code, list every file you plan to modify and why. If a file wasn't
  mentioned in the request and isn't a direct dependency of the change, do not touch it.
- Never refactor, rename, restyle, or "clean up" code that wasn't part of the request,
  even if it looks improvable.
- If a shared component, style, or utility is used by other screens, do not change its
  default behavior. Add a new variant/prop instead of editing the shared default.
- After making a change, list which other components/screens import the file(s) you
  changed, and confirm their rendering is unaffected.
- Never invent props, APIs, files, or libraries that don't already exist in this codebase.
  Search the codebase first if you're unsure something exists.
- Prefer the smallest diff that satisfies the request over a rewrite.
- If a fix conflicts with an existing pattern in the codebase, stop and ask before
  overriding it.
- Always show a diff/summary of exactly which files changed before asking for review.
