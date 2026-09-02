/**
 * Collapsible blocks for the long settings pages. The open block is
 * remembered per page so returning to a page reopens where you left off.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export type SettingsSectionItem = {
  id: string;
  title: string;
  blurb?: string;
  content: ReactNode;
};

export function SettingsSections({
  storageKey,
  items,
  defaultOpen,
}: {
  storageKey: string;
  items: SettingsSectionItem[];
  defaultOpen?: string;
}) {
  const key = `pos.settings.section.${storageKey}`;
  const [value, setValue] = useState<string>(defaultOpen ?? items[0]?.id ?? "");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored);
    } catch {
      /* private mode — fall back to the default */
    }
  }, [key]);

  const change = (next: string) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <Accordion type="single" collapsible value={value} onValueChange={change} className="w-full">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id}>
          <AccordionTrigger className="text-left">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.title}</span>
              {item.blurb && (
                <span className="block text-xs font-normal text-muted-foreground">{item.blurb}</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-1">{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}