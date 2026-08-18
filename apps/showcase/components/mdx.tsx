import ContractLab from "@/components/contract-lab";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ContractLab,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;
