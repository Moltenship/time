// An app's own popover in place of the kit's `popover.tsx`, as "Use your own controls" in the
// theming docs describes: the file keeps the kit's names and props and renders the app's popover,
// here shadcn's stock one, which is built on Base UI and not on ui-sdk. `data-own-control` lets the
// test see that the trigger and the panel came from here.
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import type {
  PopoverCloseProps,
  PopoverContentProps,
  PopoverHandle,
  PopoverProps,
  PopoverTitleProps,
  PopoverTriggerProps,
} from "@registry/calendar-ui/popover";
import {
  Popover as AppPopover,
  PopoverContent as AppPopoverContent,
  PopoverTitle as AppPopoverTitle,
  PopoverTrigger as AppPopoverTrigger,
} from "@/components/ui/popover";

const handles = new WeakMap<
  PopoverHandle<unknown>,
  { readonly handle: PopoverPrimitive.Handle<unknown>; payload: unknown }
>();

export function createPopoverHandle<Payload>(): PopoverHandle<Payload> {
  const state = { handle: PopoverPrimitive.createHandle<unknown>(), payload: undefined as unknown };
  const handle: PopoverHandle<Payload> = {
    close: () => state.handle.close(),
    getPayload: () => state.payload as Payload | undefined,
    open: (triggerId) => state.handle.open(triggerId),
  };
  handles.set(handle, state);
  return handle;
}

export function Popover<Payload = unknown>({
  children,
  handle,
  modal,
  onOpenChange,
}: PopoverProps<Payload>) {
  const state = handle === undefined ? undefined : handles.get(handle);
  return (
    <AppPopover handle={state?.handle} modal={modal} onOpenChange={(open) => onOpenChange?.(open)}>
      {typeof children === "function"
        ? ({ payload }) => {
            if (state !== undefined) state.payload = payload;
            return children({ payload: payload as Payload | undefined });
          }
        : children}
    </AppPopover>
  );
}

export function PopoverTrigger<Payload = unknown>({
  handle,
  ...props
}: PopoverTriggerProps<Payload>) {
  const state = handle === undefined ? undefined : handles.get(handle);
  return (
    <AppPopoverTrigger
      data-own-control=""
      handle={state?.handle as PopoverPrimitive.Handle<Payload> | undefined}
      {...props}
    />
  );
}

export function PopoverContent({ finalFocus, initialFocus, ...props }: PopoverContentProps) {
  return (
    <AppPopoverContent
      data-own-control=""
      finalFocus={
        finalFocus === false ? false : finalFocus === undefined ? true : () => finalFocus() ?? true
      }
      initialFocus={initialFocus ?? true}
      {...props}
    />
  );
}

export function PopoverTitle(props: PopoverTitleProps) {
  return <AppPopoverTitle {...props} />;
}

export function PopoverClose(props: PopoverCloseProps) {
  return <PopoverPrimitive.Close {...props} />;
}
