import {
  AgendaAnatomy,
  AnnotationsAnatomy,
  CalendarAnatomy,
  MonthAnatomy,
  ResourceColumnsAnatomy,
  ResourceTimelineAnatomy,
  TimeGridAnatomy,
  YearAnatomy,
} from "@/components/anatomy";
import {
  CalendarPreview,
  OverlapLayoutPreview,
  ShadingRecipesPreview,
} from "@/components/calendar-preview";
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
    OverlapLayoutPreview,
    ShadingRecipesPreview,
    ResourceColumnsAnatomy,
    ResourceTimelineAnatomy,
    TimeGridAnatomy,
    YearAnatomy,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
