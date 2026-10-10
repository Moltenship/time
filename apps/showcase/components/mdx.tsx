import {
  AgendaAnatomy,
  AnnotationsAnatomy,
  CalendarAnatomy,
  MonthAnatomy,
  ResourceColumnsAnatomy,
  ResourceTimelineAnatomy,
  TimeGridAnatomy,
} from "@/components/anatomy";
import { CalendarPreview } from "@/components/calendar-preview";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    AgendaAnatomy,
    AnnotationsAnatomy,
    CalendarAnatomy,
    CalendarPreview,
    MonthAnatomy,
    ResourceColumnsAnatomy,
    ResourceTimelineAnatomy,
    TimeGridAnatomy,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
