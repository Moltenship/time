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
  SecondaryTimeZonesPreview,
  ShadingRecipesPreview,
} from "@/components/calendar-preview";
import { IcsFeedPreview } from "@/components/ics-feed-preview";
import { IcsPlayground } from "@/components/ics-playground";
import { RecurrencePreview } from "@/components/recurrence-preview";
import { ThemeBuilder } from "@/components/theme-builder";
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
    IcsFeedPreview,
    IcsPlayground,
    MonthAnatomy,
    OverlapLayoutPreview,
    RecurrencePreview,
    SecondaryTimeZonesPreview,
    ShadingRecipesPreview,
    ResourceColumnsAnatomy,
    ResourceTimelineAnatomy,
    ThemeBuilder,
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
