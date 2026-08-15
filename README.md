# Moltenship Time

A Temporal-native, React 19 calendar system with editable shadcn-style presentation source and versioned performance-focused engines.

The project is in its foundation phase. The production workspaces and dependency direction are
established; public calendar contracts and behavior land in their dedicated implementation issues.

- [Architecture](./architecture.md)
- [Visual architecture](./architecture.html)
- [Implementation plan](./IMPLEMENTATION_PLAN.md)
- [Package topology and ownership](./docs/package-topology.md)
- [GitHub roadmap](https://github.com/Moltenship/time/issues/1)

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests, including the deliberately-invalid import-boundary fixture:

```bash
vp test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run only the dependency-boundary proof:

```bash
vp run check:boundaries
```

- Run the React isolation, custom-view, and SSR regression gate:

```bash
vp run react:gate
```

- Run the development server:

```bash
vp run dev
```
