// SPIKE (motion customization research, not for merge). `?spike=` picks one experiment:
// card-motion, card-layoutid, card-vt, drag-css, drag-motion. `?slow=N` stretches durations.
import { eventIdOf, monitorCalendarDrags } from "@moltenship/calendar";
import { motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const params = new URLSearchParams(window.location.search);
export const spikeMode = params.get("spike");
export const slow = Number(params.get("slow") ?? 1);

if (spikeMode !== null) {
  document.documentElement.dataset.spike = spikeMode;
  document.documentElement.style.setProperty("--spike-slow", String(slow));
}

interface FloatingCard {
  readonly color: string | undefined;
  readonly height: number;
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly width: number;
}

/**
 * `drag-motion`: a Motion card that follows each event drag with a spring and tilts with its
 * velocity, through `monitorCalendarDrags` alone. When the drag ends it flies to wherever the
 * event is now: its new slot after a drop, its old one after Escape.
 */
export function SpikeDragCard() {
  const [card, setCard] = useState<FloatingCard | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { damping: 32, stiffness: 420 / slow });
  const springY = useSpring(y, { damping: 32, stiffness: 420 / slow });
  const velocity = useVelocity(springX);
  const rotate = useTransform(velocity, [-1800, 0, 1800], [-10, 0, 10], { clamp: true });
  const [landing, setLanding] = useState(false);

  useEffect(() => {
    if (spikeMode !== "drag-motion") return;
    return monitorCalendarDrags((drag) => {
      const box = drag.element.getBoundingClientRect();
      const offset = { x: drag.origin.x - box.left, y: drag.origin.y - box.top };
      for (const value of [x, springX]) value.jump(box.left);
      for (const value of [y, springY]) value.jump(box.top);
      const id = drag.element.getAttribute("data-event-id") ?? String(eventIdOf(drag.element));
      setLanding(false);
      setCard({
        color: drag.element.dataset.color,
        height: box.height,
        id,
        time: drag.element.querySelector("[data-event-time]")?.textContent ?? "",
        title: drag.event.title,
        width: box.width,
      });
      return {
        move: (point) => {
          x.set(point.x - offset.x);
          y.set(point.y - offset.y);
        },
        end: () => {
          // The view renders the event where the drop put it, or leaves it where it was.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const chip = document.querySelector(
                `[data-slot="calendar-event"][data-event-id="${CSS.escape(id)}"]`,
              );
              const target = chip?.getBoundingClientRect();
              if (target !== undefined) {
                x.set(target.left);
                y.set(target.top);
              }
              setLanding(true);
              setTimeout(() => setCard(null), 380 * slow);
            }),
          );
        },
      };
    });
  }, [springX, springY, x, y]);

  if (card === null) return null;
  return createPortal(
    <motion.div
      aria-hidden
      data-color={card.color}
      data-spike-card=""
      className="pointer-events-none fixed top-0 left-0 z-[60] flex flex-col overflow-hidden rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-1.5 py-1 text-xs leading-tight font-medium text-calendar-event-foreground"
      style={{ height: card.height, rotate, width: card.width, x: springX, y: springY }}
      initial={{ boxShadow: "0 0 0 rgb(0 0 0 / 0)", scale: 1 }}
      animate={
        landing
          ? { boxShadow: "0 0 0 rgb(0 0 0 / 0)", scale: 1 }
          : { boxShadow: "0 18px 36px rgb(0 0 0 / 0.28)", scale: 1.06 }
      }
      transition={{ bounce: 0.3, duration: 0.3 * slow, type: "spring" }}
    >
      <span className="line-clamp-2">{card.title}</span>
      <span className="truncate font-normal opacity-80">{card.time}</span>
    </motion.div>,
    document.body,
  );
}
