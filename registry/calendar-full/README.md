# Calendar full

`calendar-full` installs every other registry item: the theme, the shared `calendar` parts, each
view, and the recurrence scope dialog. It owns no files, so a full install writes each file once,
from the item that owns it.

```sh
npx shadcn@latest add https://moltenship-time.vercel.app/r/calendar-full.json
```

Adding an item to the registry means adding it here too; `vp run registry:smoke` fails otherwise.
