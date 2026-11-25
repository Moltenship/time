// An app's own dialog in place of the kit's `dialog.tsx`, as "Use your own controls" in the
// theming docs describes: the file keeps the kit's names and props and renders the app's dialog,
// here shadcn's stock one, which is built on Base UI and not on ui-sdk. `data-own-control` lets the
// test see that the dialog came from here.
import type {
  DialogCloseProps,
  DialogContentProps,
  DialogProps,
  DialogSectionProps,
} from "@registry/calendar-ui/dialog";
import {
  Dialog as AppDialog,
  DialogClose as AppDialogClose,
  DialogContent as AppDialogContent,
  DialogDescription as AppDialogDescription,
  DialogFooter as AppDialogFooter,
  DialogHeader as AppDialogHeader,
  DialogTitle as AppDialogTitle,
} from "@/components/ui/dialog";

export function Dialog({ onOpenChange, onOpenChangeComplete, ...props }: DialogProps) {
  return (
    <AppDialog
      onOpenChange={(open) => onOpenChange?.(open)}
      onOpenChangeComplete={(open) => onOpenChangeComplete?.(open)}
      {...props}
    />
  );
}

export function DialogContent({ initialFocus, ...props }: DialogContentProps) {
  return (
    <AppDialogContent
      data-own-control=""
      initialFocus={initialFocus ?? true}
      showCloseButton={false}
      {...props}
    />
  );
}

export function DialogHeader(props: DialogSectionProps) {
  return <AppDialogHeader {...props} />;
}

export function DialogFooter(props: DialogSectionProps) {
  return <AppDialogFooter {...props} />;
}

export function DialogTitle(props: DialogSectionProps) {
  return <AppDialogTitle {...props} />;
}

export function DialogDescription(props: DialogSectionProps) {
  return <AppDialogDescription {...props} />;
}

export function DialogClose(props: DialogCloseProps) {
  return <AppDialogClose {...props} />;
}
